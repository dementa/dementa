import {
  Calculator,
  ClipboardList,
  FileText,
  Folder,
  Globe,
  Palette,
  Presentation,
  Settings,
  Sheet,
  Trash2,
  type LucideIcon,
} from "lucide-react";

export type AppId =
  | "docs"
  | "sheets"
  | "slides"
  | "browser"
  | "files"
  | "assignments"
  | "paint"
  | "calculator"
  | "settings"
  | "trash";

export type AppKind = "Office" | "Internet" | "System" | "Tools";

export interface AppDef {
  id: AppId;
  name: string;
  icon: LucideIcon;
  /** Background gradient for the app's icon tile. */
  color: string;
  blurb: string;
  /** Category shown in Properties and used by "Sort by → Item type". */
  kind: AppKind;
  /** Picture (under public/) shown instead of the drawn icon tile. */
  image?: string;
  /** Preferred window size when opened. */
  size?: { w: number; h: number };
}

export const APPS: AppDef[] = [
  { id: "docs", name: "Docs", kind: "Office", icon: FileText, color: "linear-gradient(135deg,#4f8dfd,#2a5bd7)", blurb: "Write stories, essays and reports.", size: { w: 1180, h: 720 } },
  { id: "sheets", name: "Sheets", kind: "Office", icon: Sheet, color: "linear-gradient(135deg,#34c77b,#16935a)", blurb: "Make tables, do maths and draw charts." },
  { id: "slides", name: "Slides", kind: "Office", icon: Presentation, color: "linear-gradient(135deg,#ffb03a,#f07b16)", blurb: "Build presentations and slideshows." },
  { id: "browser", name: "Browser", kind: "Internet", icon: Globe, color: "linear-gradient(135deg,#38bdf8,#0e7ad1)", blurb: "Browse the web.", size: { w: 960, h: 640 } },
  { id: "files", name: "Files", kind: "System", icon: Folder, image: "/icons/folder.svg", color: "linear-gradient(135deg,#ffd45c,#f2a91c)", blurb: "Browse your folders and files.", size: { w: 940, h: 600 } },
  { id: "assignments", name: "Tasks", kind: "Tools", icon: ClipboardList, color: "linear-gradient(135deg,#a77bff,#7041e0)", blurb: "Keep track of your to-dos." },
  { id: "paint", name: "Paint", kind: "Tools", icon: Palette, color: "linear-gradient(135deg,#ff7aa8,#e0346f)", blurb: "Draw and colour pictures." },
  { id: "calculator", name: "Calculator", kind: "Tools", icon: Calculator, color: "linear-gradient(135deg,#6b7a90,#3d4757)", blurb: "Add, subtract, multiply and divide." },
  { id: "settings", name: "Settings", kind: "System", icon: Settings, color: "linear-gradient(135deg,#8e9aaf,#5b667a)", blurb: "Change how your computer looks.", size: { w: 920, h: 620 } },
  { id: "trash", name: "Recycle Bin", kind: "System", icon: Trash2, image: "/icons/recycle-bin.svg", color: "linear-gradient(135deg,#9aa5b5,#6c7686)", blurb: "Deleted files, ready to restore." },
];

/** Apps that work today; the rest still show "Coming soon". */
export const READY_APPS = new Set<AppId>(["docs", "browser", "files", "settings"]);

export function getApp(id: AppId): AppDef {
  return APPS.find((a) => a.id === id)!;
}

export type OSStyle = "windows" | "mac";

export type PowerAction = "shutdown" | "restart";

/** Light, dark, or "auto" to follow the computer's own setting. */
export type Theme = "light" | "dark" | "auto";

export const WALLPAPERS = {
  aurora: { name: "Aurora", css: "radial-gradient(ellipse at 20% 20%,#5b8cff 0%,transparent 55%),radial-gradient(ellipse at 80% 30%,#c45bff 0%,transparent 50%),radial-gradient(ellipse at 50% 90%,#21d4b4 0%,transparent 55%),#141a3a" },
  ocean: { name: "Ocean", css: "linear-gradient(160deg,#0f4c81 0%,#1b8fc4 45%,#7fd3e8 100%)" },
  sunset: { name: "Sunset", css: "linear-gradient(170deg,#2b1a5a 0%,#b1407a 45%,#ff9a5a 80%,#ffd27a 100%)" },
} as const;

export type WallpaperId = keyof typeof WALLPAPERS;
