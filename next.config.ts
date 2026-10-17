import type { NextConfig } from "next";
import hosts from "./src/os/browser/hosts.json";

// DEMENTA_TARGET=desktop builds plain files into out/ for the Windows app (no server needed).
const desktop = process.env.DEMENTA_TARGET === "desktop";

// Web version: the browser app shows websites in an iframe. This policy makes the real browser
// refuse to load any frame outside the approved list, including links clicked inside a site.
// blob: lets the Files app preview PDFs.
const frameSrc = ["'self'", "blob:", ...hosts.embeddable.map((host) => `https://${host}`)].join(" ");

const nextConfig: NextConfig = {
  // Move the dev-only "N" badge to the top-right, off the Start button.
  devIndicators: { position: "top-right" },
  ...(desktop
    ? // Separate build folder so building the app doesn't disturb a running web server.
      { output: "export", distDir: "out" }
    : {
        // The web version reaches the Dementa cloud through its own address (/api/...), so it
        // works through any link to this server, not just on this computer.
        async rewrites() {
          const cloud = (process.env.DEMENTA_CLOUD_URL || "http://localhost:8787").replace(/\/$/, "");
          return [{ source: "/api/:path*", destination: `${cloud}/api/:path*` }];
        },
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [{ key: "Content-Security-Policy", value: `frame-src ${frameSrc}` }],
            },
          ];
        },
      }),
};

export default nextConfig;
