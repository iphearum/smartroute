"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { commerceApi } from "@/features/shops/api/commerce-api";
import { ClaimBusinessFlow } from "@/features/shops/components/claim-business-flow";
import type { Product } from "@/features/shops/domain/commerce-types";
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

const statusTone: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  active: "bg-emerald-50 text-emerald-700",
  suspended: "bg-red-50 text-red-600",
};

const verificationTone: Record<string, string> = {
  unverified: "bg-slate-100 text-slate-600",
  pending: "bg-amber-50 text-amber-700",
  verified: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
};

export default function ShopsPage() {
  const { business, status, error, refresh, claim } = useMyBusiness();
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(""),
    [saving, setSaving] = useState(false),
    [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    if (!business) {
      setProducts(null);
      return;
    }
    let cancelled = false;
    commerceApi
      .listProducts(business.id)
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [business]);

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
        <ClaimBusinessFlow onClaimed={() => void claim()} />
      </>
    );
  }

  if (!business) return null;
  const branch = business.branches[0];
  const activeProducts = products?.filter(
    (product) => product.status === "active",
  ).length;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await commerceApi.updateBusiness(business.id, {
        display_name: name.trim(),
      });
      toast.success("Shop name updated");
      setEditing(false);
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not save changes",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <LiquidCard className="shop-header-card rounded-[24px] p-4">
        {editing ? (
          <div className="claim-inline-form">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Business name"
              className="claim-inline-input"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                className="place-detail-add"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="pos-tab" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <span className="shop-logo">
                <Icon name="box" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-base">
                  {business.display_name}
                </strong>
                <span className="block truncate text-xs text-slate-500">
                  {branch ? branch.place__name : "No branch linked yet"}
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
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusTone[business.status]}`}
              >
                {business.status}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold capitalize text-slate-600">
                {business.business_type.replaceAll("_", " ")}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${verificationTone[business.verification_status]}`}
              >
                {verificationLabel[business.verification_status]}
              </span>
            </div>
          </>
        )}
      </LiquidCard>

      <div className="kpi-grid kpi-grid-3">
        <LiquidCard className="kpi-card rounded-[18px] p-4">
          <span className="kpi-label">Branches</span>
          <strong className="kpi-value">{business.branches.length}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[18px] p-4">
          <span className="kpi-label">Storefronts</span>
          <strong className="kpi-value">{business.storefronts.length}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[18px] p-4">
          <span className="kpi-label">Active products</span>
          <strong className="kpi-value">{activeProducts ?? "…"}</strong>
        </LiquidCard>
      </div>

      {branch && (
        <LiquidCard className="rounded-[24px] p-4">
          <strong className="mb-3 flex items-center gap-2 px-1 text-sm">
            <Icon name="pin" className="h-4 w-4 text-emerald-700" />
            Branch details
          </strong>
          <dl className="flex flex-col gap-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Location</dt>
              <dd className="text-right font-semibold">{branch.place__name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-semibold">{branch.phone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-semibold">{branch.email || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Pickup</dt>
              <dd className="font-semibold">
                {branch.pickup_enabled ? "Enabled" : "Disabled"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Delivery</dt>
              <dd className="font-semibold">
                {branch.delivery_enabled ? "Enabled" : "Disabled"}
              </dd>
            </div>
          </dl>
        </LiquidCard>
      )}

      <Link href="/shops/manage" className="shop-open-admin">
        <Icon name="grid" className="h-4 w-4" />
        Open shop admin
        <Icon name="chevron-left" className="ml-auto h-4 w-4 rotate-180" />
      </Link>
    </div>
  );
}
