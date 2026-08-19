"use client";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { DashboardNav } from "@/features/dashboard/components/dashboard-nav";
import { LiquidCard } from "@/shared/ui/liquid";
import { useAuthStore } from "@/features/auth/store/auth-store";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <RequireAuth>
      <div className="mx-auto mt-10 w-full max-w-lg px-4">
        <DashboardNav />
        <LiquidCard className="rounded-[28px] p-6">
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-700">
            Dashboard
          </p>
          <strong className="text-lg">
            Welcome, {user?.displayName || user?.email}
          </strong>
          <p className="mt-2 text-sm text-slate-500">
            Manage your account from Profile, or set up a shop from Shops.
          </p>
        </LiquidCard>
      </div>
    </RequireAuth>
  );
}
