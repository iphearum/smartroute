"use client";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { ShopAdminShell } from "@/features/shops/components/shop-admin-shell";

export default function ShopManagePage() {
  return (
    <RequireAuth>
      <ShopAdminShell />
    </RequireAuth>
  );
}
