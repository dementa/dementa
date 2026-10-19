// The parts of Cloudflare's R2 API this Worker uses. Kept minimal (instead of
// @cloudflare/workers-types) so worker/dev/server.ts can stand in for it on any computer.

export interface StoredObject {
  key: string;
  size: number;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
}

export interface StoredObjectBody extends StoredObject {
  body: ReadableStream;
}

export interface ListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
  /** With "/", only direct children are listed; sub-folders come back in delimitedPrefixes. */
  delimiter?: string;
  include?: "httpMetadata"[];
}

export interface Bucket {
  head(key: string): Promise<StoredObject | null>;
  get(key: string): Promise<StoredObjectBody | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<StoredObject | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: ListOptions): Promise<{
    objects: StoredObject[];
    delimitedPrefixes: string[];
    truncated: boolean;
    cursor?: string;
  }>;
}

export interface Env {
  /** R2 bucket holding the files: each account's under users/<id>/files/. */
  FILES: Bucket;
  /** Accounts and sign-ins: a D1 database on Cloudflare, a node:sqlite database on this computer. */
  DB: unknown;
  /** Signs sign-in cookies and tokens. A long random secret (wrangler secret put BETTER_AUTH_SECRET). */
  BETTER_AUTH_SECRET: string;
  /** The cloud's own address, e.g. https://dementa-api.example.workers.dev */
  BETTER_AUTH_URL?: string;
  /** Comma-separated addresses Dementa OS runs at; defaults to this computer and the desktop app. */
  APP_ORIGINS?: string;
}

/** A bucket that only sees one account's part of the real one: keys are kept under `prefix`. */
export function scopedBucket(bucket: Bucket, prefix: string): Bucket {
  const strip = (key: string) => key.slice(prefix.length);
  const keep = <T extends StoredObject | null>(object: T): T => (object ? { ...object, key: strip(object.key) } : object);
  return {
    head: async (key) => keep(await bucket.head(prefix + key)),
    get: async (key) => keep(await bucket.get(prefix + key)),
    put: async (key, value, options) => keep(await bucket.put(prefix + key, value, options)),
    delete: (keys) => bucket.delete(Array.isArray(keys) ? keys.map((k) => prefix + k) : prefix + keys),
    async list(options) {
      const page = await bucket.list({ ...options, prefix: prefix + (options?.prefix ?? "") });
      return { ...page, objects: page.objects.map(keep), delimitedPrefixes: page.delimitedPrefixes.map(strip) };
    },
  };
}
