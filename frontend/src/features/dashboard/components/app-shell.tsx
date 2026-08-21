"use client";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { Icon } from "@/shared/ui/icon";

const sections = [
  {
    key: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: "grid" as const,
  },
  { key: "shops", href: "/shops", label: "Shops", icon: "box" as const },
  { key: "profile", href: "/profile", label: "Profile", icon: "user" as const },
] as const;

// The one shell every top-level shop-owner page (/dashboard, /shops,
// /profile) renders inside -- sidebar nav, header, scrollable content, and
// a mobile bottom nav -- so they share identical chrome and only differ in
// what they put in the content slot. Mirrors ShopAdminShell's structure and
// CSS classes (shop-shell-*) one level up, for the same look across the
// whole shop-owner surface; unlike that shell this one navigates between
// real routes (<Link>) rather than switching panels with local state.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const active =
    sections.find(
      (section) =>
        pathname === section.href || pathname.startsWith(`${section.href}/`),
    ) ?? sections[0];

  return (
    <AdminShell
      navigation={sections}
      activeKey={active.key}
      brand={
        <>
          <span className="shop-logo shop-logo-sm">
            <Icon name="box" />
          </span>
          <span className="shop-shell-back-label">PsarAI</span>
        </>
      }
      title={active.label}
      subtitle={user?.displayName || user?.email}
    >
      {children}
    </AdminShell>
  );
}
