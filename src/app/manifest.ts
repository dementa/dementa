import type { MetadataRoute } from "next";

// Needed for the Windows app's static build (output: "export").
export const dynamic = "force-static";

// When installed ("Install app" on Chromebooks, "Add to Home Screen" on tablets),
// Dementa OS launches full screen with no browser bars.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dementa OS",
    short_name: "Dementa OS",
    description: "A complete computer desktop that runs in your browser.",
    start_url: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    background_color: "#000000",
    theme_color: "#000000",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
