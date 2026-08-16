import type { Metadata } from "next";
import { AppShellProvider } from "@/shared/state/app-shell-context";
import "leaflet/dist/leaflet.css";
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
  openGraph: {
    title: appName,
    description: appDescription,
    type: "website",
  },
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
      </body>
    </html>
  );
}
