import type { MetadataRoute } from "next";

const appName = process.env.APP_NAME || "PsarAI";
const appDescription =
  process.env.APP_DESCRIPTION || "PsarAI - Your AI Travel Companion";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appName,
    short_name: appName,
    description: appDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#e8efeb00",
    theme_color: "#e8efeb00",
    orientation: "any",
    icons: [
      {
        src: "/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
