// Runs the Dementa OS cloud Worker on this computer. Files go to the real R2 bucket when the R2_*
// keys are set in .env.local, otherwise to .dementa-dev/r2-local/. Accounts go in a SQLite file,
// .dementa-dev/accounts.sqlite. Cloudflare's own local runtime needs macOS 13.5+, so this keeps it
// working anywhere.
//
//   npm run cloud:dev      → http://localhost:8787
//
// Settings come from .env.local (see .env.example): DEMENTA_CLOUD_PORT, the R2_* keys, and
// DEMENTA_CLOUD_STORAGE=local to keep files on this computer even when the R2 keys are set.

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authOptions } from "../src/auth.ts";
import worker from "../src/index.ts";
import { r2Bucket } from "./r2-s3.ts";
import type { Bucket, Env, StoredObject } from "../src/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".dementa-dev");
const PORT = Number(process.env.DEMENTA_CLOUD_PORT || 8787);

// ---- Local stand-in for R2 (a folder; content types kept in a side file) ----
// Every object is one file named after its whole key (URI-encoded, so "/" stays in the name),
// which keeps folder markers ("Documents/") and prefix/delimiter listing simple.

function folderBucket(dir: string): Bucket {
  const path = (key: string) => join(dir, encodeURIComponent(key));
  const meta = (key: string) => `${path(key)}.__type`;

  const head = async (key: string): Promise<StoredObject | null> => {
    try {
      const s = await stat(path(key));
      const type = await readFile(meta(key), "utf8").catch(() => undefined);
      return { key, size: s.size, uploaded: s.mtime, httpMetadata: { contentType: type } };
    } catch {
      return null;
    }
  };

  return {
    head,
    async get(key) {
      const info = await head(key);
      if (!info) return null;
      const data = await readFile(path(key));
      return { ...info, body: new Blob([data]).stream() };
    },
    async put(key, value, options) {
      await mkdir(dir, { recursive: true });
      const data = value instanceof ArrayBuffer ? Buffer.from(value) : Buffer.from(await new Response(value).arrayBuffer());
      await writeFile(path(key), data);
      await writeFile(meta(key), options?.httpMetadata?.contentType ?? "application/octet-stream");
      return head(key);
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        await rm(path(key), { force: true });
        await rm(meta(key), { force: true });
      }
    },
    async list(options) {
      const prefix = options?.prefix ?? "";
      const keys = (await readdir(dir).catch(() => [] as string[]))
        .filter((n) => !n.endsWith(".__type"))
        .map((n) => decodeURIComponent(n))
        .filter((k) => k.startsWith(prefix))
        .sort();
      const objects: StoredObject[] = [];
      const prefixes = new Set<string>();
      for (const key of keys) {
        const rest = key.slice(prefix.length);
        const cut = options?.delimiter ? rest.indexOf(options.delimiter) : -1;
        if (cut >= 0 && cut < rest.length - 1) prefixes.add(prefix + rest.slice(0, cut + 1));
        else if (cut >= 0 && rest.length - 1 === cut && rest !== options?.delimiter) prefixes.add(prefix + rest);
        else {
          const info = await head(key);
          if (info) objects.push(info);
        }
        if (options?.limit && objects.length + prefixes.size >= options.limit) break;
      }
      return { objects, delimitedPrefixes: [...prefixes], truncated: false };
    },
  };
}

mkdirSync(join(ROOT, "r2-local"), { recursive: true });
const { R2_ENDPOINT, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
const useR2 =
  process.env.DEMENTA_CLOUD_STORAGE !== "local" &&
  Boolean(R2_ENDPOINT && R2_BUCKET_NAME && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

/** A random secret made once for this computer, unless .env.local gives one. */
function devSecret() {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  const file = join(ROOT, "auth-secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("base64url"), { mode: 0o600 });
  return readFileSync(file, "utf8").trim();
}

const env: Env = {
  DB: new DatabaseSync(join(ROOT, "accounts.sqlite")),
  BETTER_AUTH_SECRET: devSecret(),
  BETTER_AUTH_URL: `http://localhost:${PORT}`,
  APP_ORIGINS: process.env.APP_ORIGINS,
  FILES: useR2
    ? r2Bucket({
        endpoint: R2_ENDPOINT!,
        bucket: R2_BUCKET_NAME!,
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      })
    : folderBucket(join(ROOT, "r2-local")),
};

// Makes or updates the account tables, so a new computer is ready straight away.
await (await getMigrations(authOptions(env))).runMigrations();

createServer(async (req, res) => {
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const request = new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // @ts-expect-error Node needs this to stream a request body.
    duplex: "half",
  });
  const response = await worker.fetch(request, env);
  if (response.status >= 500) console.error(`${req.method} ${req.url} → ${response.status}`);
  // Several cookies can't be merged into one header line, so Set-Cookie is passed on one by one.
  const headers: Record<string, string | string[]> = Object.fromEntries(response.headers);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  if (response.body) Readable.fromWeb(response.body as never).pipe(res);
  else res.end();
}).listen(PORT, () => {
  console.log(`Dementa cloud on http://localhost:${PORT}`);
  console.log(`  files:    ${useR2 ? `Cloudflare R2 bucket "${R2_BUCKET_NAME}"` : join(ROOT, "r2-local")}`);
  console.log(`  accounts: ${join(ROOT, "accounts.sqlite")}`);
});
