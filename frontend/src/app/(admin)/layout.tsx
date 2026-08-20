// Route group for the shop-owner surface (dashboard, shops, profile, and
// the shop-admin shell nested under shops/manage). Owns two things every
// page here shares: the ./admin.css import (see that file's header for the
// boundary with app/globals.css) and the AppShell chrome (sidebar/header/
// content/footer) via AuthedShell below, so pages only render their own
// content -- no more each page re-implementing RequireAuth + its own nav
// + its own container width.
//
// /shops/manage renders its own full-page ShopAdminShell instead (a
// different, deeper nav for that section), so it opts out here.
import "./admin.css";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { AppShell } from "@/features/dashboard/components/app-shell";

function AuthedShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthedShell>{children}</AuthedShell>;
}
