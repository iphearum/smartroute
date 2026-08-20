"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { useMyBusiness } from "@/features/shops/hooks/use-my-business";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";

function daysSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user),
    logout = useAuthStore((s) => s.logout),
    router = useRouter();
  const { business, status: businessStatus } = useMyBusiness();

  const initial = (user?.displayName || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      <LiquidCard className="rounded-[24px] p-5">
        <div className="flex items-center gap-4">
          <span className="shop-logo text-lg font-extrabold text-emerald-800">{initial}</span>
          <span className="min-w-0 flex-1">
            <strong className="block text-base">{user?.displayName || "Your account"}</strong>
            <span className="block truncate text-xs text-slate-500">{user?.email}</span>
          </span>
        </div>
      </LiquidCard>

      <div className="kpi-grid kpi-grid-3">
        <LiquidCard className="kpi-card rounded-[18px] p-4">
          <span className="kpi-label">Account ID</span>
          <strong className="kpi-value">#{user?.id ?? "—"}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[18px] p-4">
          <span className="kpi-label">Member for</span>
          <strong className="kpi-value">
            {user ? `${daysSince(user.createdAt)}d` : "—"}
          </strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[18px] p-4">
          <span className="kpi-label">Shop owned</span>
          <strong className="kpi-value text-[15px]">
            {businessStatus === "loading" ? "…" : business ? "Yes" : "No"}
          </strong>
        </LiquidCard>
      </div>

      <LiquidCard className="rounded-[24px] p-4">
        <strong className="mb-3 block px-1 text-sm">Account details</strong>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-semibold">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Display name</dt>
            <dd className="font-semibold">{user?.displayName || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-semibold">
              {user && new Date(user.createdAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </LiquidCard>

      <LiquidCard className="rounded-[24px] p-4">
        <strong className="mb-3 flex items-center gap-2 px-1 text-sm">
          <Icon name="box" className="h-4 w-4 text-emerald-700" />
          Your shop
        </strong>
        {businessStatus === "loading" ? (
          <p className="px-1 text-xs text-slate-500">Loading…</p>
        ) : business ? (
          <div className="flex items-center gap-3 px-1">
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{business.display_name}</strong>
              <span className="block text-xs capitalize text-slate-500">{business.status}</span>
            </span>
            <Link href="/shops" className="shop-add-action">
              Manage
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-1">
            <span className="min-w-0 flex-1 text-xs text-slate-500">
              You haven&apos;t claimed a shop yet.
            </span>
            <Link href="/shops" className="shop-add-action">
              Claim a shop
            </Link>
          </div>
        )}
      </LiquidCard>

      <button
        onClick={async () => {
          await logout();
          router.push("/");
        }}
        className="h-11 w-full rounded-[16px] bg-slate-100 text-sm font-bold text-slate-700"
      >
        Log out
      </button>
    </div>
  );
}
