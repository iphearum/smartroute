"use client";
import Link from "next/link";
import { useState } from "react";
import { RequireAuth } from "@/features/auth/components/require-auth";
import { DashboardNav } from "@/features/dashboard/components/dashboard-nav";
import { commerceApi } from "@/features/shops/api/commerce-api";
import { ClaimBusinessFlow } from "@/features/shops/components/claim-business-flow";
import { useMyBusiness } from "@/features/shops/hooks/use-my-business";
import { ApiError } from "@/shared/api/http";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { SkeletonRows } from "@/shared/ui/skeleton";
import { toast } from "@/shared/ui/toast";

const verificationLabel: Record<string, string> = {
  unverified: "Unverified",
  pending: "Verification pending",
  verified: "Verified",
  rejected: "Verification rejected",
};

function ShopsContent() {
  const { business, status, error, refresh, claim } = useMyBusiness();
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(""),
    [saving, setSaving] = useState(false);

  if (status === "loading") {
    return (
      <LiquidCard className="rounded-[28px] p-6">
        <SkeletonRows rows={3} />
      </LiquidCard>
    );
  }

  if (status === "none" || status === "error") {
    return (
      <>
        {error && (
          <p className="mb-3 text-xs font-semibold text-red-600">{error}</p>
        )}
        <ClaimBusinessFlow onClaimed={(id) => void claim(id)} />
      </>
    );
  }

  if (!business) return null;
  const branch = business.branches[0];

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await commerceApi.updateBusiness(business.id, { display_name: name.trim() });
      toast.success("Shop name updated");
      setEditing(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <LiquidCard className="shop-header-card rounded-[24px] p-4">
      {editing ? (
        <div className="claim-inline-form">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Business name"
            className="claim-inline-input"
          />
          <div className="flex gap-2">
            <button className="place-detail-add" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="pos-tab" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <span className="shop-logo">🏪</span>
          <span className="min-w-0 flex-1">
            <strong className="block text-base">{business.display_name}</strong>
            <span className="block truncate text-xs text-slate-500">
              {branch ? branch.place__name : "No branch linked yet"}
            </span>
            <span className="mt-1 block text-xs font-bold text-emerald-700">
              {verificationLabel[business.verification_status]}
            </span>
          </span>
          <button
            className="shop-edit-shop"
            aria-label="Edit shop name"
            onClick={() => {
              setName(business.display_name);
              setEditing(true);
            }}
          >
            <Icon name="edit" className="h-4 w-4" />
          </button>
        </div>
      )}
      <Link href="/shops/manage" className="shop-open-admin mt-4">
        <Icon name="grid" className="h-4 w-4" />
        Open shop admin
        <Icon name="chevron-left" className="ml-auto h-4 w-4 rotate-180" />
      </Link>
    </LiquidCard>
  );
}

export default function ShopsPage() {
  return (
    <RequireAuth>
      <div className="mx-auto mt-10 w-full max-w-lg px-4 pb-16">
        <DashboardNav />
        <ShopsContent />
      </div>
    </RequireAuth>
  );
}
