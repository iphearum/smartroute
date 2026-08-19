"use client";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { DashboardNav } from "@/features/dashboard/components/dashboard-nav";
import { LiquidCard } from "@/shared/ui/liquid";
import { useAuthStore } from "@/features/auth/store/auth-store";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user),
    logout = useAuthStore((s) => s.logout),
    router = useRouter();
  return (
    <RequireAuth>
      <div className="mx-auto mt-10 w-full max-w-lg px-4">
        <DashboardNav />
        <LiquidCard className="rounded-[28px] p-6">
          <p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-700">
            Profile
          </p>
          <strong className="text-lg">{user?.displayName || "Your account"}</strong>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-semibold">{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Member since</dt>
              <dd className="font-semibold">
                {user && new Date(user.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
          <button
            onClick={async () => {
              await logout();
              router.push("/");
            }}
            className="mt-6 h-11 w-full rounded-[16px] bg-slate-100 text-sm font-bold text-slate-700"
          >
            Log out
          </button>
        </LiquidCard>
      </div>
    </RequireAuth>
  );
}
