// Checks the Cloudflare settings in .env.local without changing anything or printing secrets.
//   npm run cloud:check-keys
//
// 1. CLOUDFLARE_API_TOKEN: valid, and can reach the account's Workers and R2 (for deploying).
// 2. R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT: can list and read R2_BUCKET_NAME.

import { createHash, createHmac } from "node:crypto";

const env = process.env;
const ACCOUNT = env.CLOUDFLARE_ACCOUNT_ID ?? "";
const TOKEN = env.CLOUDFLARE_API_TOKEN ?? "";
const BUCKET = env.R2_BUCKET_NAME ?? "";
const ENDPOINT = (env.R2_ENDPOINT ?? "").replace(/\/$/, "");

let failures = 0;
const ok = (msg) => console.log(`  ✅ ${msg}`);
const bad = (msg) => {
  failures++;
  console.log(`  ❌ ${msg}`);
};
const info = (msg) => console.log(`  ℹ️  ${msg}`);

// ---- Cloudflare API token ----

async function api(path) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok && body.success !== false, body };
}

const errorText = (r) => r.body?.errors?.map((e) => e.message).join("; ") || `HTTP ${r.status}`;

async function checkApiToken() {
  console.log("\nCloudflare API token (used to deploy):");
  if (!TOKEN) return info("CLOUDFLARE_API_TOKEN is empty — you can use `npx wrangler login` instead.");
  if (!/^[0-9a-f]{32}$/.test(ACCOUNT)) return bad("CLOUDFLARE_ACCOUNT_ID should be 32 letters/numbers (0-9, a-f).");

  // User-owned tokens verify here; account-owned tokens verify under the account.
  let verify = await api("/user/tokens/verify");
  if (!verify.ok) verify = await api(`/accounts/${ACCOUNT}/tokens/verify`);
  if (!verify.ok) return bad(`Token rejected: ${errorText(verify)}`);
  ok(`Token is valid (status: ${verify.body.result?.status ?? "active"})`);

  const account = await api(`/accounts/${ACCOUNT}`);
  if (account.ok) ok(`Can see the account "${account.body.result?.name}"`);
  else info(`Can't read account details (${errorText(account)}) — fine if the token is limited to Workers/R2.`);

  const workers = await api(`/accounts/${ACCOUNT}/workers/scripts`);
  if (workers.ok) ok(`Workers access ✓ (${workers.body.result?.length ?? 0} Worker(s) deployed)`);
  else bad(`No Workers access: ${errorText(workers)} — add "Workers Scripts: Edit" to the token.`);

  const r2 = await api(`/accounts/${ACCOUNT}/r2/buckets`);
  if (r2.ok) {
    const names = (r2.body.result?.buckets ?? []).map((b) => b.name);
    ok(`R2 access ✓ — buckets: ${names.length ? names.join(", ") : "(none yet)"}`);
    if (BUCKET && !names.includes(BUCKET)) info(`No bucket named "${BUCKET}" yet.`);
  } else bad(`No R2 access: ${errorText(r2)} — add "Workers R2 Storage: Edit" to the token (and enable R2 in the dashboard).`);

}

// ---- R2 S3-compatible keys (AWS Signature Version 4) ----

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

async function s3(method, path, query = "") {
  const url = new URL(`${ENDPOINT}${path}${query ? `?${query}` : ""}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256("");
  const headers = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalQuery = [...url.searchParams]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const canonical = [
    method,
    url.pathname,
    canonicalQuery,
    ...Object.keys(headers).sort().map((k) => `${k}:${headers[k]}`),
    "",
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  let key = hmac(`AWS4${env.R2_SECRET_ACCESS_KEY}`, day);
  for (const part of ["auto", "s3", "aws4_request"]) key = hmac(key, part);
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  const res = await fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
  const text = method === "HEAD" ? "" : await res.text();
  const code = text.match(/<Code>([^<]+)<\/Code>/)?.[1];
  return { status: res.status, text, code };
}

async function checkR2Keys() {
  console.log("\nR2 access keys (S3-compatible, for backups/tools):");
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !ENDPOINT) {
    return info("R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY or R2_ENDPOINT is empty — skipped (Dementa OS doesn't need them).");
  }
  if (!/^https:\/\/[0-9a-f]{32}\.(eu\.|fedramp\.)?r2\.cloudflarestorage\.com$/.test(ENDPOINT)) {
    bad("R2_ENDPOINT should look like https://<account id>.r2.cloudflarestorage.com (nothing after it).");
  }

  const buckets = await s3("GET", "/");
  if (buckets.status === 200) {
    const names = [...buckets.text.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
    ok(`Keys work — they can see: ${names.length ? names.join(", ") : "(no buckets)"}`);
  } else if (buckets.code === "AccessDenied" || buckets.status === 403) {
    info("Keys can't list all buckets — normal for keys limited to one bucket. Checking the bucket directly…");
  } else {
    return bad(`Keys rejected: ${buckets.code ?? `HTTP ${buckets.status}`}${buckets.code === "SignatureDoesNotMatch" ? " — the secret access key is wrong." : buckets.code === "InvalidArgument" || buckets.code === "Unauthorized" ? " — the access key ID is wrong." : ""}`);
  }

  if (!BUCKET) return info("R2_BUCKET_NAME is empty — skipped the bucket check.");
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(BUCKET)) {
    bad(`"${BUCKET}" isn't a valid R2 bucket name: use only lowercase letters, numbers and hyphens (e.g. "dementa-files").`);
  }
  const list = await s3("GET", `/${encodeURIComponent(BUCKET)}`, "list-type=2&max-keys=1");
  if (list.status === 200) ok(`Can read bucket "${BUCKET}" (${list.text.match(/<KeyCount>(\d+)/)?.[1] ?? "?"} object(s) seen)`);
  else if (list.code === "NoSuchBucket") bad(`Bucket "${BUCKET}" doesn't exist yet.`);
  else bad(`Can't read bucket "${BUCKET}": ${list.code ?? `HTTP ${list.status}`}`);
}

await checkApiToken();
await checkR2Keys();
console.log(failures ? `\n${failures} problem(s) found.` : "\nAll checks passed.");
process.exitCode = failures ? 1 : 0;
