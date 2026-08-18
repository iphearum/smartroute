import type { Metadata, Viewport } from "next";
import { AppShellProvider } from "@/shared/state/app-shell-context";
import { PwaRegistration } from "@/shared/pwa/pwa-registration";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const appName = process.env.APP_NAME || "PsarAI";
const appDescription =
  process.env.APP_DESCRIPTION || "PsarAI - Your AI Travel Companion";

export const metadata: Metadata = {
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: appName,
  },
  icons: {
    icon: [
      { url: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: appName,
    description: appDescription,
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e8efeb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppShellProvider>{children}</AppShellProvider>
        <PwaRegistration />
      </body>
    </html>
  );
}
