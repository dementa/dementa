// Approved websites for the Dementa OS browser.
//
// "Embeddable" sites allow being shown inside another page, so they work everywhere, including
// the web version. "App only" sites (AI tools, GitHub, DuckDuckGo) refuse that, so they only open
// in the Dementa OS Windows app, whose browser isn't bound by that rule. Nothing ever opens
// outside Dementa OS. The address lists live in hosts.json, shared with next.config.ts and the
// Windows app.

import hosts from "./hosts.json";

export interface Site {
  name: string;
  url: string;
  emoji: string;
  color: string;
  category: "AI & Code" | "Learn" | "Maths" | "Read" | "Science" | "Create";
  /** Refuses to be shown inside another page: works in the Windows app only. */
  appOnly?: boolean;
}

export const SITES: Site[] = [
  { name: "ChatGPT", url: "https://chatgpt.com/", emoji: "🤖", color: "#e3f5ef", category: "AI & Code", appOnly: true },
  { name: "Gemini", url: "https://gemini.google.com/", emoji: "✨", color: "#e6ecff", category: "AI & Code", appOnly: true },
  { name: "Copilot", url: "https://copilot.microsoft.com/", emoji: "💬", color: "#e2f1fb", category: "AI & Code", appOnly: true },
  { name: "Claude", url: "https://claude.ai/", emoji: "🧡", color: "#fbeee6", category: "AI & Code", appOnly: true },
  { name: "Duck.ai", url: "https://duck.ai/", emoji: "🦆", color: "#fdeee4", category: "AI & Code", appOnly: true },
  { name: "GitHub", url: "https://github.com/", emoji: "🐙", color: "#eceef1", category: "AI & Code", appOnly: true },
  { name: "DuckDuckGo", url: "https://duckduckgo.com/?kp=1", emoji: "🔎", color: "#fde8e1", category: "Learn", appOnly: true },
  { name: "Wikipedia", url: "https://simple.wikipedia.org/wiki/Main_Page", emoji: "📚", color: "#e8edf5", category: "Learn" },
  { name: "Dictionary", url: "https://en.wiktionary.org/wiki/Wiktionary:Main_Page", emoji: "🔤", color: "#eef2e6", category: "Learn" },
  { name: "Nat Geo Kids", url: "https://kids.nationalgeographic.com/", emoji: "🦁", color: "#fff3c4", category: "Learn" },
  { name: "Time for Kids", url: "https://www.timeforkids.com/", emoji: "📰", color: "#ffe1e1", category: "Learn" },
  { name: "World Map", url: "https://www.openstreetmap.org/export/embed.html?bbox=-180,-60,180,75&layer=mapnik", emoji: "🗺️", color: "#e1f3e8", category: "Learn" },
  { name: "Math is Fun", url: "https://www.mathsisfun.com/", emoji: "➗", color: "#e3f0ff", category: "Maths" },
  { name: "Desmos", url: "https://www.desmos.com/calculator", emoji: "📈", color: "#e6f7ef", category: "Maths" },
  { name: "GeoGebra", url: "https://www.geogebra.org/calculator", emoji: "📐", color: "#efe9ff", category: "Maths" },
  { name: "Storyline Online", url: "https://www.storylineonline.net/", emoji: "🎧", color: "#ffe9d6", category: "Read" },
  { name: "Free Books", url: "https://www.gutenberg.org/", emoji: "📖", color: "#f3ece1", category: "Read" },
  { name: "Solar System", url: "https://www.solarsystemscope.com/", emoji: "🪐", color: "#e0e4f5", category: "Science" },
  { name: "Build an Atom", url: "https://phet.colorado.edu/sims/html/build-an-atom/latest/build-an-atom_all.html", emoji: "⚛️", color: "#e3f6fb", category: "Science" },
  { name: "Code.org", url: "https://code.org/", emoji: "💻", color: "#e8e6ff", category: "Create" },
];

/** Hosts that can be shown inside the web version (also used for its Content-Security-Policy). */
export const ALLOWED_HOSTS: string[] = hosts.embeddable;

/** Hosts that only open in the Windows app (they block being embedded in web pages). */
export const APP_ONLY_HOSTS: string[] = hosts.appOnly;

/** Where words typed into the address bar are searched. Must be on the allowed list. */
export const SEARCH_URL = "https://simple.wikipedia.org/w/index.php?search=";
