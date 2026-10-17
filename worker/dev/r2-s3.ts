// Real Cloudflare R2 for the local cloud server, through R2's S3-compatible API and the
// R2_* keys in .env.local. (On Cloudflare the Worker uses its built-in R2 binding instead.)

import { createHash, createHmac } from "node:crypto";
import type { Bucket, StoredObject } from "../src/types.ts";

interface R2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** S3 wants RFC 3986 encoding, which also escapes !'()* (encodeURIComponent leaves those). */
const encode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

const xmlText = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function r2Bucket(config: R2Config): Bucket {
  const base = new URL(config.endpoint);

  async function send(
    method: string,
    key: string,
    query: Record<string, string> = {},
    body?: Buffer,
    contentType?: string,
  ): Promise<Response> {
    const path = `/${encode(config.bucket)}${key ? `/${key.split("/").map(encode).join("/")}` : ""}`;
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((k) => `${encode(k)}=${encode(query[k])}`)
      .join("&");
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const day = amzDate.slice(0, 8);
    const payloadHash = body ? "UNSIGNED-PAYLOAD" : sha256("");
    const headers: Record<string, string> = {
      host: base.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    const signed = Object.keys(headers).sort();
    const canonical = [
      method,
      path,
      canonicalQuery,
      ...signed.map((h) => `${h}:${headers[h]}`),
      "",
      signed.join(";"),
      payloadHash,
    ].join("\n");
    const scope = `${day}/auto/s3/aws4_request`;
    let signingKey = hmac(`AWS4${config.secretAccessKey}`, day);
    for (const part of ["auto", "s3", "aws4_request"]) signingKey = hmac(signingKey, part);
    const signature = createHmac("sha256", signingKey)
      .update(["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n"))
      .digest("hex");

    const response = await fetch(`${base.origin}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`, {
      method,
      body: body ? new Uint8Array(body) : undefined,
      headers: {
        ...headers,
        // Without this R2 gzips text files and drops Content-Length, so sizes read as 0.
        "accept-encoding": "identity",
        ...(contentType ? { "content-type": contentType } : {}),
        authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${signature}`,
      },
    });
    if (!response.ok && response.status !== 404) {
      const text = await response.text().catch(() => "");
      throw new Error(`R2 ${method} ${key || "(bucket)"} failed: ${text.match(/<Code>([^<]+)/)?.[1] ?? response.status}`);
    }
    return response;
  }

  const info = (key: string, res: Response): StoredObject => ({
    key,
    size: Number(res.headers.get("content-length") ?? 0),
    uploaded: new Date(res.headers.get("last-modified") ?? Date.now()),
    httpMetadata: { contentType: res.headers.get("content-type") ?? undefined },
  });

  return {
    async head(key) {
      const res = await send("HEAD", key);
      return res.status === 404 ? null : info(key, res);
    },

    async get(key) {
      const res = await send("GET", key);
      if (res.status === 404 || !res.body) return null;
      return { ...info(key, res), body: res.body };
    },

    async put(key, value, options) {
      const data = Buffer.from(value instanceof ArrayBuffer ? value : await new Response(value).arrayBuffer());
      await send("PUT", key, {}, data, options?.httpMetadata?.contentType ?? "application/octet-stream");
      return {
        key,
        size: data.length,
        uploaded: new Date(),
        httpMetadata: { contentType: options?.httpMetadata?.contentType },
      };
    },

    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) await send("DELETE", key);
    },

    async list(options) {
      const query: Record<string, string> = { "list-type": "2" };
      if (options?.prefix) query.prefix = options.prefix;
      if (options?.cursor) query["continuation-token"] = options.cursor;
      if (options?.limit) query["max-keys"] = String(options.limit);
      if (options?.delimiter) query.delimiter = options.delimiter;
      const xml = await (await send("GET", "", query)).text();
      // S3 listings don't include content types; the Worker works them out from the file name.
      const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, c]) => ({
        key: xmlText(c.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? ""),
        size: Number(c.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0),
        uploaded: new Date(c.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1] ?? Date.now()),
      }));
      const delimitedPrefixes = [...xml.matchAll(/<CommonPrefixes>\s*<Prefix>([\s\S]*?)<\/Prefix>/g)].map(([, p]) => xmlText(p));
      const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
      const cursor = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1];
      return { objects, delimitedPrefixes, truncated, cursor: cursor ? xmlText(cursor) : undefined };
    },
  };
}
