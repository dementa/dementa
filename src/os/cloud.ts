// Client for the Dementa OS cloud (worker/): the Files app's folders and files in Cloudflare R2.
// The address comes from NEXT_PUBLIC_DEMENTA_API in .env.local (see .env.example) and is fixed
// when the app is built. There is no sign-in yet, so everyone shares the same files.

import "./desktopBridge"; // types for window.dementa (Windows app)

// Empty means "the same address as Dementa OS" (the web server forwards /api to the cloud). The
// Windows app has no server of its own, so it needs a full address; it falls back to the local one.
const configured = (process.env.NEXT_PUBLIC_DEMENTA_API ?? "").replace(/\/$/, "");
export const API_URL =
  configured || (typeof window !== "undefined" && window.dementa?.isDesktop ? "http://localhost:8787" : "");

export interface CloudFile {
  name: string;
  /** Full path, e.g. "Documents/Homework/essay.txt". */
  path: string;
  size: number;
  modified: string;
  type: string;
}

export interface CloudFolder {
  name: string;
  path: string;
  /** Desktop, Documents, Downloads, Pictures, Music, Videos: can't be renamed, moved or deleted. */
  system: boolean;
}

export interface FolderListing {
  path: string;
  folders: CloudFolder[];
  files: CloudFile[];
}

export class CloudError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new CloudError(0, "Can't reach the Dementa cloud. Check the internet connection.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new CloudError(response.status, data.error ?? "Something went wrong. Please try again.");
  }
  return response.headers.get("Content-Type")?.includes("application/json")
    ? ((await response.json()) as T)
    : (response as T);
}

/** "Documents/My notes.txt" → "Documents/My%20notes.txt" (each part encoded, slashes kept). */
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** Joins a folder path and a name: ("", "a") → "a", ("Docs", "a") → "Docs/a". */
export const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

export const parentPath = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));

export const cloud = {
  list: (path: string) => call<FolderListing>(`/api/list?path=${encodeURIComponent(path)}`),

  recent: () => call<FolderListing>("/api/recent"),

  createFolder: (path: string) =>
    call<{ ok: true; path: string }>("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }),

  upload: (file: File, folder: string) =>
    call<{ ok: true; path: string }>(`/api/files/${encodePath(joinPath(folder, file.name))}`, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    }),

  /** Renames or moves a file or folder. */
  move: (from: string, to: string) =>
    call<{ ok: true; path: string }>("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    }),

  deleteFile: (path: string) => call<{ ok: true }>(`/api/files/${encodePath(path)}`, { method: "DELETE" }),

  deleteFolder: (path: string) => call<{ ok: true }>(`/api/folders/${encodePath(path)}`, { method: "DELETE" }),

  /** Direct address of a file, for previews, thumbnails and downloads. */
  fileUrl: (path: string, download = false) => `${API_URL}/api/files/${encodePath(path)}${download ? "?download" : ""}`,
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
