// Deliberately outside the (admin) route group, so it does NOT get that
// group's AppShell (sidebar/header/footer) -- ShopAdminShell is already a
// full-page shell with its own sidebar/topbar/bottomnav, and nesting one
// shell inside the other would double up the chrome. Still needs
// admin.css for the shop-shell-* classes both shells share, and still
// needs RequireAuth since it no longer inherits it from (admin)/layout.tsx.
import "../../(admin)/admin.css";
import { RequireAuth } from "@/features/auth/components/require-auth";

export default function ShopManageLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
