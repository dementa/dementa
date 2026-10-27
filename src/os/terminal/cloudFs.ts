// The Terminal's Linux sees the signed-in account's Dementa files as an ordinary folder. Linux asks
// for files over 9P (the Plan 9 file protocol, 9P2000.L), which v86 passes to handle() below; each
// request is answered from the Dementa cloud (cloud.ts), so changes made in the Terminal show up in
// Files and Docs, and the other way round.
//
// Files are fetched when they're first opened and kept while the Terminal is open; writes are saved
// to the cloud when the file is closed (or synced). Folder listings are re-read every few seconds, so
// changes made elsewhere appear.

import { cloud, CloudError, joinPath, parentPath, type FolderListing } from "../cloud";

// ---- Linux error numbers ----

const EPERM = 1;
const ENOENT = 2;
const EIO = 5;
const EACCES = 13;
const EEXIST = 17;
const ENOTDIR = 20;
const EISDIR = 21;
const EINVAL = 22;
const EFBIG = 27;
const ENODATA = 61;
const ENOTEMPTY = 39;
const EOPNOTSUPP = 95;

class FsError extends Error {
  code: number;
  constructor(code: number) {
    super(`errno ${code}`);
    this.code = code;
  }
}

/** What went wrong in the cloud, as the error Linux expects. */
function fromCloud(error: unknown): FsError {
  if (error instanceof FsError) return error;
  if (error instanceof CloudError) {
    if (error.status === 404) return new FsError(ENOENT);
    if (error.status === 409) return new FsError(EEXIST);
    if (error.status === 403) return new FsError(EPERM);
    if (error.status === 401) return new FsError(EACCES);
    if (error.status === 413) return new FsError(EFBIG);
    if (error.status === 400) return new FsError(EINVAL);
  }
  return new FsError(EIO);
}

// ---- Reading and writing 9P messages (little-endian) ----

class Reader {
  private view: DataView;
  offset = 7; // after size[4] type[1] tag[2]
  constructor(private buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  u8() {
    return this.view.getUint8(this.offset++);
  }
  u16() {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }
  u64() {
    const v = Number(this.view.getBigUint64(this.offset, true));
    this.offset += 8;
    return v;
  }
  str() {
    const n = this.u16();
    const s = new TextDecoder().decode(this.buf.subarray(this.offset, this.offset + n));
    this.offset += n;
    return s;
  }
  bytes(n: number) {
    const b = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return b;
  }
}

class Writer {
  private parts: Uint8Array[] = [];
  private size = 0;
  private push(b: Uint8Array) {
    this.parts.push(b);
    this.size += b.length;
    return this;
  }
  private num(bytes: number, set: (v: DataView) => void) {
    const b = new Uint8Array(bytes);
    set(new DataView(b.buffer));
    return this.push(b);
  }
  u8 = (v: number) => this.num(1, (d) => d.setUint8(0, v));
  u16 = (v: number) => this.num(2, (d) => d.setUint16(0, v, true));
  u32 = (v: number) => this.num(4, (d) => d.setUint32(0, v >>> 0, true));
  u64 = (v: number) => this.num(8, (d) => d.setBigUint64(0, BigInt(Math.max(0, Math.floor(v))), true));
  str(s: string) {
    const b = new TextEncoder().encode(s);
    return this.u16(b.length).push(b);
  }
  bytes = (b: Uint8Array) => this.push(b);
  qid(q: Qid) {
    return this.u8(q.type).u32(q.version).u64(q.path);
  }
  get length() {
    return this.size;
  }
  /** Everything written, without a message header. */
  body(): Uint8Array {
    return this.message(0, 0).subarray(7);
  }
  /** The whole message: size[4] type[1] tag[2] then the body. */
  message(type: number, tag: number): Uint8Array {
    const out = new Uint8Array(7 + this.size);
    const view = new DataView(out.buffer);
    view.setUint32(0, out.length, true);
    view.setUint8(4, type);
    view.setUint16(5, tag, true);
    let at = 7;
    for (const p of this.parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
}

interface Qid {
  type: number;
  version: number;
  path: number;
}

const QTDIR = 0x80;
const QTFILE = 0;

// ---- The files ----

interface Entry {
  dir: boolean;
  size: number;
  /** Seconds since 1970. */
  mtime: number;
}

interface Fid {
  path: string;
  /** Snapshot of a folder being listed, so readdir offsets stay the same. */
  listing?: { name: string; qid: Qid; dir: boolean }[];
  open?: { write: boolean };
}

interface Cached {
  data: Uint8Array;
  dirty: boolean;
  mtime: number;
}

/** How long a folder listing is trusted before it's read from the cloud again. */
const LISTING_TTL = 4000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export class CloudFs {
  private fids = new Map<number, Fid>();
  private listings = new Map<string, { at: number; entries: Map<string, Entry> }>();
  private pending = new Map<string, Promise<Map<string, Entry>>>();
  private contents = new Map<string, Cached>();
  private qidPaths = new Map<string, number>();
  private nextQid = 1;
  private msize = 8192;

  /** v86's handle9p: one 9P request in, one reply out (whenever it's ready). */
  handle = (request: Uint8Array, reply: (message: Uint8Array) => void) => {
    const r = new Reader(request);
    const type = request[4];
    const tag = request[5] | (request[6] << 8);
    this.dispatch(type, r)
      .then((w) => reply(w.message(type + 1, tag)))
      .catch((error: unknown) => {
        const code = error instanceof FsError ? error.code : fromCloud(error).code;
        if (!(error instanceof FsError) && !(error instanceof CloudError)) console.error("Terminal files:", error);
        reply(new Writer().u32(code).message(7, tag));
      });
  };

  // ---- Looking things up ----

  private qid(path: string, dir: boolean): Qid {
    let id = this.qidPaths.get(path);
    if (id === undefined) {
      id = this.nextQid++;
      this.qidPaths.set(path, id);
    }
    return { type: dir ? QTDIR : QTFILE, version: 0, path: id };
  }

  private async list(path: string, fresh = false): Promise<Map<string, Entry>> {
    const cached = this.listings.get(path);
    if (cached && !fresh && Date.now() - cached.at < LISTING_TTL) return cached.entries;
    let request = this.pending.get(path);
    if (!request) {
      request = cloud
        .list(path)
        .then((listing: FolderListing) => {
          const entries = new Map<string, Entry>();
          for (const f of listing.folders) entries.set(f.name, { dir: true, size: 0, mtime: Date.now() / 1000 });
          for (const f of listing.files) entries.set(f.name, { dir: false, size: f.size, mtime: Date.parse(f.modified) / 1000 });
          // Files written here but not saved yet are still there.
          for (const [p, c] of this.contents) {
            if (parentPath(p) === path && c.dirty) entries.set(nameOf(p), { dir: false, size: c.data.length, mtime: c.mtime });
          }
          this.listings.set(path, { at: Date.now(), entries });
          return entries;
        })
        .catch((error) => {
          throw fromCloud(error);
        })
        .finally(() => this.pending.delete(path));
      this.pending.set(path, request);
    }
    return request;
  }

  private async stat(path: string): Promise<Entry> {
    if (!path) return { dir: true, size: 0, mtime: Date.now() / 1000 };
    const entry = (await this.list(parentPath(path))).get(nameOf(path));
    if (!entry) throw new FsError(ENOENT);
    const cached = this.contents.get(path);
    return cached ? { ...entry, size: cached.data.length, mtime: cached.mtime } : entry;
  }

  /** Puts a change straight into the cached listing, so it shows before the next refresh. */
  private remember(path: string, entry: Entry | null) {
    const listing = this.listings.get(parentPath(path));
    if (!listing) return;
    if (entry) listing.entries.set(nameOf(path), entry);
    else listing.entries.delete(nameOf(path));
  }

  private fid(id: number): Fid {
    const fid = this.fids.get(id);
    if (!fid) throw new FsError(EINVAL);
    return fid;
  }

  private child(dir: string, name: string) {
    if (!name || name === "." || name === ".." || name.includes("/")) throw new FsError(EINVAL);
    return joinPath(dir, name);
  }

  // ---- File contents ----

  private async load(path: string): Promise<Cached> {
    let cached = this.contents.get(path);
    if (cached) return cached;
    let response: Response;
    try {
      response = await fetch(cloud.fileUrl(path));
    } catch {
      throw new FsError(EIO);
    }
    if (!response.ok) throw new FsError(response.status === 404 ? ENOENT : EIO);
    const data = new Uint8Array(await response.arrayBuffer());
    cached = { data, dirty: false, mtime: Date.now() / 1000 };
    this.contents.set(path, cached);
    return cached;
  }

  private async save(path: string) {
    const cached = this.contents.get(path);
    if (!cached?.dirty) return;
    cached.dirty = false;
    try {
      await cloud.upload(new File([cached.data as BlobPart], nameOf(path)), parentPath(path));
    } catch (error) {
      cached.dirty = true;
      throw fromCloud(error);
    }
  }

  // ---- Answering requests ----

  private async dispatch(type: number, r: Reader): Promise<Writer> {
    const w = new Writer();
    switch (type) {
      case 100: {
        // version
        const msize = r.u32();
        this.msize = Math.min(msize, 512 * 1024);
        return w.u32(this.msize).str("9P2000.L");
      }
      case 104: {
        // attach
        const fid = r.u32();
        this.fids.set(fid, { path: "" });
        return w.qid(this.qid("", true));
      }
      case 102: // auth
        throw new FsError(EOPNOTSUPP);
      case 108: // flush
        return w;
      case 110: {
        // walk
        const fid = this.fid(r.u32());
        const newfid = r.u32();
        const count = r.u16();
        const names = Array.from({ length: count }, () => r.str());
        let path = fid.path;
        const qids: Qid[] = [];
        for (const name of names) {
          const next = name === ".." ? parentPath(path) : name === "." ? path : joinPath(path, name);
          let entry: Entry;
          try {
            entry = await this.stat(next);
          } catch (error) {
            if (!qids.length) throw error;
            break;
          }
          path = next;
          qids.push(this.qid(path, entry.dir));
        }
        if (qids.length === names.length) this.fids.set(newfid, { path });
        w.u16(qids.length);
        for (const q of qids) w.qid(q);
        return w;
      }
      case 120: {
        // clunk: a written file is saved when it's closed
        const id = r.u32();
        const fid = this.fids.get(id);
        this.fids.delete(id);
        if (fid?.open?.write) await this.save(fid.path);
        return w;
      }
      case 50: {
        // fsync
        const fid = this.fid(r.u32());
        await this.save(fid.path);
        return w;
      }
      case 24: {
        // getattr
        const fid = this.fid(r.u32());
        const e = await this.stat(fid.path);
        const qid = this.qid(fid.path, e.dir);
        const secs = Math.floor(e.mtime);
        w.u64(0x7ff).qid(qid);
        w.u32(e.dir ? 0o40755 : 0o100644).u32(0).u32(0);
        w.u64(e.dir ? 2 : 1).u64(0).u64(e.size).u64(4096).u64(Math.ceil(e.size / 512));
        for (let i = 0; i < 4; i++) w.u64(secs).u64(0); // atime, mtime, ctime, btime
        return w.u64(0).u64(0);
      }
      case 26: {
        // setattr: only the size matters (truncating); owners, modes and times are accepted as they are
        const fid = this.fid(r.u32());
        const valid = r.u32();
        r.u32(); // mode
        r.u32(); // uid
        r.u32(); // gid
        const size = r.u64();
        if (valid & 0x8) {
          const e = await this.stat(fid.path);
          if (e.dir) throw new FsError(EISDIR);
          if (size > MAX_FILE_BYTES) throw new FsError(EFBIG);
          const cached = await this.load(fid.path);
          const data = new Uint8Array(size);
          data.set(cached.data.subarray(0, size));
          Object.assign(cached, { data, dirty: true, mtime: Date.now() / 1000 });
          if (!fid.open?.write) await this.save(fid.path);
        }
        return w;
      }
      case 8: {
        // statfs: plenty of room (the cloud decides the real limits)
        const blocks = 10 * 1024 * 1024;
        return w.u32(0x01021997).u32(4096).u64(blocks).u64(blocks).u64(blocks).u64(1e6).u64(1e6).u64(0).u32(255);
      }
      case 12: {
        // lopen
        const fid = this.fid(r.u32());
        const flags = r.u32();
        const e = await this.stat(fid.path);
        const write = (flags & 3) !== 0;
        if (e.dir && write) throw new FsError(EISDIR);
        fid.open = { write };
        if (!e.dir && (flags & 0x200)) {
          // O_TRUNC
          this.contents.set(fid.path, { data: new Uint8Array(0), dirty: true, mtime: Date.now() / 1000 });
        }
        return w.qid(this.qid(fid.path, e.dir)).u32(this.msize - 24);
      }
      case 14: {
        // lcreate: a new file, saved when it's closed
        const fid = this.fid(r.u32());
        const path = this.child(fid.path, r.str());
        if ((await this.list(fid.path)).has(nameOf(path))) throw new FsError(EEXIST);
        const now = Date.now() / 1000;
        this.contents.set(path, { data: new Uint8Array(0), dirty: true, mtime: now });
        this.remember(path, { dir: false, size: 0, mtime: now });
        fid.path = path;
        fid.open = { write: true };
        return w.qid(this.qid(path, false)).u32(this.msize - 24);
      }
      case 116: {
        // read
        const fid = this.fid(r.u32());
        const offset = r.u64();
        const count = r.u32();
        const e = await this.stat(fid.path);
        if (e.dir) throw new FsError(EISDIR);
        const cached = await this.load(fid.path);
        const chunk = cached.data.subarray(offset, offset + Math.min(count, this.msize - 11));
        return w.u32(chunk.length).bytes(chunk);
      }
      case 118: {
        // write
        const fid = this.fid(r.u32());
        const offset = r.u64();
        const count = r.u32();
        const data = r.bytes(count);
        if (offset + count > MAX_FILE_BYTES) throw new FsError(EFBIG);
        const cached = await this.load(fid.path);
        let buffer = cached.data;
        if (offset + count > buffer.length) {
          buffer = new Uint8Array(offset + count);
          buffer.set(cached.data);
        }
        buffer.set(data, offset);
        Object.assign(cached, { data: buffer, dirty: true, mtime: Date.now() / 1000 });
        fid.open = { write: true };
        this.remember(fid.path, { dir: false, size: buffer.length, mtime: cached.mtime });
        return w.u32(count);
      }
      case 40: {
        // readdir
        const fid = this.fid(r.u32());
        const offset = r.u64();
        const count = r.u32();
        if (offset === 0 || !fid.listing) {
          const entries = await this.list(fid.path, true);
          fid.listing = [
            { name: ".", qid: this.qid(fid.path, true), dir: true },
            { name: "..", qid: this.qid(parentPath(fid.path), true), dir: true },
            ...[...entries].map(([name, e]) => ({ name, qid: this.qid(joinPath(fid.path, name), e.dir), dir: e.dir })),
          ];
        }
        const out = new Writer();
        for (let i = offset; i < fid.listing.length; i++) {
          const item = fid.listing[i];
          const size = 13 + 8 + 1 + 2 + new TextEncoder().encode(item.name).length;
          if (out.length + size > count) break;
          out.qid(item.qid).u64(i + 1).u8(item.dir ? 4 : 8).str(item.name);
        }
        return w.u32(out.length).bytes(out.body());
      }
      case 72: {
        // mkdir
        const dir = this.fid(r.u32());
        const path = this.child(dir.path, r.str());
        try {
          await cloud.createFolder(path);
        } catch (error) {
          throw fromCloud(error);
        }
        this.remember(path, { dir: true, size: 0, mtime: Date.now() / 1000 });
            return w.qid(this.qid(path, true));
      }
      case 76: {
        // unlinkat
        const dir = this.fid(r.u32());
        const path = this.child(dir.path, r.str());
        const flags = r.u32();
        const e = await this.stat(path);
        if (flags & 0x200) {
          // AT_REMOVEDIR: rmdir, which only removes empty folders
          if (!e.dir) throw new FsError(ENOTDIR);
          if ((await this.list(path, true)).size) throw new FsError(ENOTEMPTY);
        } else if (e.dir) throw new FsError(EISDIR);
        await this.remove(path, e.dir);
        return w;
      }
      case 122: {
        // remove
        const id = r.u32();
        const fid = this.fid(id);
        this.fids.delete(id);
        const e = await this.stat(fid.path);
        await this.remove(fid.path, e.dir);
        return w;
      }
      case 74: {
        // renameat
        const from = this.child(this.fid(r.u32()).path, r.str());
        const to = this.child(this.fid(r.u32()).path, r.str());
        await this.rename(from, to);
        return w;
      }
      case 20: {
        // rename
        const fid = this.fid(r.u32());
        const to = this.child(this.fid(r.u32()).path, r.str());
        await this.rename(fid.path, to);
        fid.path = to;
        return w;
      }
      case 30: // xattrwalk: no extended attributes
        throw new FsError(ENODATA);
      case 52: // lock: always granted
        return w.u8(0);
      case 54: {
        // getlock: nothing is ever locked
        r.u32();
        r.u8();
        const start = r.u64();
        const length = r.u64();
        const proc = r.u32();
        return w.u8(2).u64(start).u64(length).u32(proc).str(r.str());
      }
      default:
        // links, symlinks, devices and the like aren't part of Dementa's files
        throw new FsError(EOPNOTSUPP);
    }
  }

  private async remove(path: string, dir: boolean) {
    const unsaved = this.contents.get(path)?.dirty;
    try {
      if (dir) await cloud.deleteFolder(path);
      else await cloud.deleteFile(path);
    } catch (error) {
      // A new file that was never saved isn't in the cloud yet, so there's nothing to delete.
      if (!(unsaved && error instanceof CloudError && error.status === 404)) throw fromCloud(error);
    }
    this.contents.delete(path);
    this.remember(path, null);
  }

  private async rename(from: string, to: string) {
    if (from === to) return;
    const e = await this.stat(from);
    // Unsaved writes go up first, so the moved file is complete.
    await this.save(from);
    // Like Linux, a file put where another file is replaces it.
    const existing = await this.stat(to).catch(() => null);
    if (existing) {
      if (existing.dir || e.dir) throw new FsError(existing.dir ? EISDIR : EEXIST);
      await this.remove(to, false);
    }
    try {
      await cloud.move(from, to);
    } catch (error) {
      throw fromCloud(error);
    }
    const cached = this.contents.get(from);
    this.contents.delete(from);
    if (cached) this.contents.set(to, cached);
    // Paths inside a moved folder are now somewhere else.
    for (const key of [...this.contents.keys()]) {
      if (key.startsWith(`${from}/`)) {
        this.contents.set(to + key.slice(from.length), this.contents.get(key)!);
        this.contents.delete(key);
      }
    }
    for (const fid of this.fids.values()) {
      if (fid.path === from || fid.path.startsWith(`${from}/`)) fid.path = to + fid.path.slice(from.length);
    }
    const id = this.qidPaths.get(from);
    if (id !== undefined) this.qidPaths.set(to, id);
    this.remember(from, null);
    this.remember(to, e);
    this.listings.delete(from);
  }
}
