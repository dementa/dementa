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
  /** R2 bucket holding the files, under files/. */
  FILES: Bucket;
}
