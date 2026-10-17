// Dementa OS cloud API (Cloudflare Worker).
//
// Stores the Files app's folders and files in an R2 bucket. There is no sign-in yet: everyone
// using Dementa OS shares one storage space, and anyone who can reach this API can read, add or
// delete files. Add access control before storing anything private.
//
// Layout in R2: every path lives under "files/". A folder is kept as an empty marker object whose
// key ends in "/" (so empty folders survive), e.g. files/Documents/ and files/Documents/notes.txt.

import type { Bucket, Env } from "./types.ts";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ROOT = "files/";

/** Created automatically, and can't be renamed, moved or deleted. */
export const SYSTEM_FOLDERS = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"];

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "Content-Type, Content-Length",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const TYPES: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json", html: "text/html",
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Content type from the file name, for when storage doesn't say. */
const guessType = (name: string) => TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const isSystemFolder = (path: string) => SYSTEM_FOLDERS.includes(path);

/**
 * Checks a path like "Documents/Homework/essay.txt" (no leading or trailing slash).
 * Empty means the top level. Each part must be a sensible file or folder name.
 */
function cleanPath(raw: string, { allowRoot = false } = {}): string {
  let path: string;
  try {
    path = decodeURIComponent(raw).trim().replace(/^\/+|\/+$/g, "");
  } catch {
    throw new HttpError(400, "Invalid name.");
  }
  if (!path) {
    if (allowRoot) return "";
    throw new HttpError(400, "Please give a name.");
  }
  const parts = path.split("/");
  if (path.length > 500 || parts.length > 20) throw new HttpError(400, "That path is too long.");
  for (const part of parts) {
    const name = part.trim();
    if (!name || name === "." || name === ".." || name.length > 120 || /[\\\u0000-\u001f]/.test(name) || name !== part) {
      throw new HttpError(400, "Names can't be empty, start or end with spaces, or contain \\.");
    }
  }
  return path;
}

const fileKey = (path: string) => ROOT + path;
const folderPrefix = (path: string) => (path ? `${ROOT}${path}/` : ROOT);

async function folderExists(bucket: Bucket, path: string): Promise<boolean> {
  if (!path) return true;
  const page = await bucket.list({ prefix: folderPrefix(path), limit: 1 });
  return page.objects.length > 0 || page.delimitedPrefixes.length > 0;
}

async function exists(bucket: Bucket, path: string): Promise<boolean> {
  return Boolean(await bucket.head(fileKey(path))) || (await folderExists(bucket, path));
}

/** Every object key under a folder (including its marker), across pages. */
async function keysUnder(bucket: Bucket, path: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: folderPrefix(path), cursor });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

async function ensureSystemFolders(bucket: Bucket, present: string[]) {
  for (const name of SYSTEM_FOLDERS) {
    if (!present.includes(name)) await bucket.put(folderPrefix(name), new ArrayBuffer(0));
  }
}

/** R2 has no rename, so moving is copy-then-delete. */
async function copyObject(bucket: Bucket, from: string, to: string) {
  const object = await bucket.get(from);
  if (!object) return;
  await bucket.put(to, object.body, { httpMetadata: object.httpMetadata });
}

// ---- Routes ----

async function listFolder(bucket: Bucket, path: string) {
  if (path && !(await folderExists(bucket, path))) throw new HttpError(404, "That folder doesn't exist.");

  const prefix = folderPrefix(path);
  const folders: string[] = [];
  const files = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, delimiter: "/", include: ["httpMetadata"] });
    for (const p of page.delimitedPrefixes) folders.push(p.slice(prefix.length, -1));
    for (const o of page.objects) {
      if (o.key === prefix) continue; // the folder's own marker
      const name = o.key.slice(prefix.length);
      files.push({
        name,
        path: path ? `${path}/${name}` : name,
        size: o.size,
        modified: new Date(o.uploaded).toISOString(),
        type: o.httpMetadata?.contentType ?? guessType(name),
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  if (!path) {
    const missing = SYSTEM_FOLDERS.filter((n) => !folders.includes(n));
    if (missing.length) {
      await ensureSystemFolders(bucket, folders);
      folders.push(...missing);
    }
  }

  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  const order = (name: string) => (path ? -1 : SYSTEM_FOLDERS.indexOf(name));
  folders.sort((a, b) => {
    const [oa, ob] = [order(a), order(b)];
    if (oa !== ob) return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
    return byName(a, b);
  });
  files.sort((a, b) => byName(a.name, b.name));

  return {
    path,
    folders: folders.map((name) => {
      const full = path ? `${path}/${name}` : name;
      return { name, path: full, system: isSystemFolder(full) };
    }),
    files,
  };
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;
  const bucket = env.FILES;

  if (method === "GET" && pathname === "/api/status") return json({ ok: true, systemFolders: SYSTEM_FOLDERS });

  // List a folder: GET /api/list?path=Documents/Homework
  if (method === "GET" && pathname === "/api/list") {
    return json(await listFolder(bucket, cleanPath(url.searchParams.get("path") ?? "", { allowRoot: true })));
  }

  // Recently changed files from every folder (Recents): GET /api/recent
  if (method === "GET" && pathname === "/api/recent") {
    const files = [];
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix: ROOT, cursor, include: ["httpMetadata"] });
      for (const o of page.objects) {
        if (o.key.endsWith("/")) continue; // folder markers
        const path = o.key.slice(ROOT.length);
        const name = baseName(path);
        files.push({
          name,
          path,
          size: o.size,
          modified: new Date(o.uploaded).toISOString(),
          type: o.httpMetadata?.contentType ?? guessType(name),
        });
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    files.sort((x, y) => y.modified.localeCompare(x.modified));
    return json({ path: "", folders: [], files: files.slice(0, 60) });
  }

  // New folder: POST /api/folders {"path": "Documents/Homework"}
  if (method === "POST" && pathname === "/api/folders") {
    const { path: raw } = (await request.json().catch(() => ({}))) as { path?: string };
    const path = cleanPath(raw ?? "");
    if (await exists(bucket, path)) throw new HttpError(409, `"${baseName(path)}" already exists here.`);
    if (!(await folderExists(bucket, parentOf(path)))) throw new HttpError(404, "The folder it goes in doesn't exist.");
    await bucket.put(folderPrefix(path), new ArrayBuffer(0));
    return json({ ok: true, path }, 201);
  }

  // Delete a folder and everything in it: DELETE /api/folders/<path>
  const folderMatch = pathname.match(/^\/api\/folders\/(.+)$/);
  if (folderMatch && method === "DELETE") {
    const path = cleanPath(folderMatch[1]);
    if (isSystemFolder(path)) throw new HttpError(403, `"${path}" is a system folder and can't be deleted.`);
    const keys = await keysUnder(bucket, path);
    if (!keys.length) throw new HttpError(404, "That folder doesn't exist.");
    for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
    return json({ ok: true });
  }

  // Rename or move a file or folder: POST /api/move {"from": "...", "to": "..."}
  if (method === "POST" && pathname === "/api/move") {
    const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
    const from = cleanPath(body.from ?? "");
    const to = cleanPath(body.to ?? "");
    if (from === to) return json({ ok: true, path: to });
    if (isSystemFolder(from)) throw new HttpError(403, `"${from}" is a system folder and can't be renamed or moved.`);
    if (to.startsWith(`${from}/`)) throw new HttpError(400, "A folder can't be moved inside itself.");
    if (await exists(bucket, to)) throw new HttpError(409, `"${baseName(to)}" already exists there.`);
    if (!(await folderExists(bucket, parentOf(to)))) throw new HttpError(404, "The destination folder doesn't exist.");

    if (await bucket.head(fileKey(from))) {
      await copyObject(bucket, fileKey(from), fileKey(to));
      await bucket.delete(fileKey(from));
      return json({ ok: true, path: to });
    }
    const keys = await keysUnder(bucket, from);
    if (!keys.length) throw new HttpError(404, "Nothing to move: it doesn't exist.");
    const oldPrefix = folderPrefix(from);
    for (const key of keys) await copyObject(bucket, key, folderPrefix(to) + key.slice(oldPrefix.length));
    for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
    return json({ ok: true, path: to });
  }

  // Files: GET (download), PUT (upload), DELETE /api/files/<path>
  const fileMatch = pathname.match(/^\/api\/files\/(.+)$/);
  if (fileMatch) {
    const path = cleanPath(fileMatch[1]);
    const key = fileKey(path);
    const name = baseName(path);

    if (method === "GET") {
      const object = await bucket.get(key);
      if (!object) throw new HttpError(404, "File not found.");
      const disposition = url.searchParams.has("download") ? "attachment" : "inline";
      return new Response(object.body, {
        headers: {
          ...CORS,
          "Content-Type": object.httpMetadata?.contentType ?? guessType(name),
          "Content-Length": String(object.size),
          "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
        },
      });
    }

    if (method === "PUT") {
      const size = Number(request.headers.get("Content-Length") ?? NaN);
      if (!Number.isFinite(size)) throw new HttpError(411, "Missing file size.");
      if (size > MAX_FILE_BYTES) throw new HttpError(413, "Files can be up to 50 MB.");
      if (await folderExists(bucket, path)) throw new HttpError(409, `There's already a folder called "${name}" here.`);
      if (!(await folderExists(bucket, parentOf(path)))) throw new HttpError(404, "The folder it goes in doesn't exist.");
      const contentType = request.headers.get("Content-Type") || guessType(name);
      await bucket.put(key, request.body ?? new ArrayBuffer(0), { httpMetadata: { contentType } });
      return json({ ok: true, path, size });
    }

    if (method === "DELETE") {
      if (!(await bucket.head(key))) throw new HttpError(404, "File not found.");
      await bucket.delete(key);
      return json({ ok: true });
    }
  }

  throw new HttpError(404, "Not found.");
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  },
};

export default worker;
