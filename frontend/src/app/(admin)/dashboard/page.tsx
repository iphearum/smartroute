"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { commerceApi } from "@/features/shops/api/commerce-api";
import type { Product } from "@/features/shops/domain/commerce-types";
import { useExchangeRates } from "@/features/shops/hooks/use-exchange-rates";
import { useMyBusiness } from "@/features/shops/hooks/use-my-business";
import { ShopLocationPanel } from "@/features/shops/components/shop-location-panel";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { SkeletonRows } from "@/shared/ui/skeleton";

const verificationLabel: Record<string, string> = {
  unverified: "Unverified",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
};

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardContent() {
  const user = useAuthStore((s) => s.user);
  const { business, status: businessStatus } = useMyBusiness();
  const { rates, usd, loading: ratesLoading } = useExchangeRates();
  const [products, setProducts] = useState<Product[] | null>(null),
    [now, setNow] = useState<Date | null>(null);

  useEffect(() => setNow(new Date()), []);

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

  const activeProducts =
    products?.filter((product) => product.status === "active").length ?? null;
  const branchCount = business?.branches.length ?? 0;

  const checklist = [
    { label: "Claim a shop", done: Boolean(business) },
    { label: "Link a branch location", done: branchCount > 0 },
    { label: "Add your first product", done: (activeProducts ?? 0) > 0 },
  ];
  const doneCount = checklist.filter((step) => step.done).length;

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <strong className="text-xl">
            {now ? `${greeting(now.getHours())}, ` : "Welcome, "}
            {user?.displayName || user?.email}
          </strong>
        </div>
        {now && (
          <span className="whitespace-nowrap text-xs font-semibold text-slate-400">
            {now.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>

      {business && <ShopLocationPanel business={business} />}

      <div className="kpi-grid mb-4">
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Shop status</span>
          <strong className="kpi-value text-[15px] capitalize">
            {business ? business.status : "No shop yet"}
          </strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Verification</span>
          <strong className="kpi-value text-[15px]">
            {business ? verificationLabel[business.verification_status] : "—"}
          </strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Active products</span>
          <strong className="kpi-value">
            {activeProducts ?? (business ? "…" : "—")}
          </strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">USD → KHR</span>
          <strong className="kpi-value">
            {ratesLoading ? "…" : usd ? usd.average_rate.toLocaleString() : "—"}
          </strong>
        </LiquidCard>
      </div>

      <div className="shop-panel-grid-main">
        <div className="flex flex-col gap-4">
          <LiquidCard className="rounded-[24px] p-4">
            <strong className="mb-3 block px-1 text-sm">Your shop</strong>
            {businessStatus === "loading" ? (
              <SkeletonRows rows={3} />
            ) : business ? (
              <>
                <div className="flex items-center gap-4">
                  <span className="shop-logo">🏪</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-base">
                      {business.display_name}
                    </strong>
                    <span className="block truncate text-xs text-slate-500">
                      {business.branches[0]?.place__name ||
                        "No branch linked yet"}
                    </span>
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <strong className="block text-sm">
                      {business.branches.length}
                    </strong>
                    <span className="text-[10px] text-slate-500">Branches</span>
                  </div>
                  <div>
                    <strong className="block text-sm">
                      {business.storefronts.length}
                    </strong>
                    <span className="text-[10px] text-slate-500">
                      Storefronts
                    </span>
                  </div>
                  <div>
                    <strong className="block text-sm">
                      {activeProducts ?? "…"}
                    </strong>
                    <span className="text-[10px] text-slate-500">Products</span>
                  </div>
                </div>
                <Link href="/shops/manage" className="shop-open-admin mt-4">
                  <Icon name="grid" className="h-4 w-4" />
                  Open shop admin
                  <Icon
                    name="chevron-left"
                    className="ml-auto h-4 w-4 rotate-180"
                  />
                </Link>
              </>
            ) : (
              <div className="py-2 text-center">
                <Icon name="pin" className="mx-auto h-6 w-6 text-emerald-700" />
                <strong className="mt-2 block text-sm">
                  You haven&apos;t claimed a shop yet
                </strong>
                <p className="mt-1 text-xs text-slate-500">
                  Search your place on the map and start managing it.
                </p>
                <Link
                  href="/shops"
                  className="shop-open-admin mt-4 justify-center"
                >
                  <Icon name="pin" className="h-4 w-4" />
                  Claim your shop
                </Link>
              </div>
            )}
          </LiquidCard>
        </div>

        <div className="flex flex-col gap-4">
          <LiquidCard className="rounded-[24px] p-4">
            <strong className="mb-1 block px-1 text-sm">Getting started</strong>
            <p className="mb-3 px-1 text-[11px] text-slate-500">
              {doneCount} of {checklist.length} done
            </p>
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-emerald-50">
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width]"
                style={{ width: `${(doneCount / checklist.length) * 100}%` }}
              />
            </div>
            <div className="flex flex-col gap-2">
              {checklist.map((step) => (
                <div
                  key={step.label}
                  className="flex items-center gap-2 px-1 text-xs"
                >
                  <span
                    className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-bold ${
                      step.done
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {step.done ? "✓" : ""}
                  </span>
                  <span
                    className={
                      step.done
                        ? "text-slate-400 line-through"
                        : "font-semibold"
                    }
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </LiquidCard>

          <LiquidCard className="rounded-[24px] p-4">
            <strong className="mb-3 flex items-center gap-2 px-1 text-sm">
              <Icon name="trending" className="h-4 w-4 text-emerald-700" />
              Exchange rates (NBC)
            </strong>
            {ratesLoading ? (
              <SkeletonRows rows={3} />
            ) : rates.length ? (
              <div className="flex flex-col gap-1">
                {rates.slice(0, 5).map((rate, index) => (
                  <div className="top-seller-row" key={rate.currency}>
                    <span className="top-seller-rank">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <strong className="shop-item-name">
                        {rate.currency}
                      </strong>
                    </span>
                    <span className="shop-item-price">
                      ៛{rate.average_rate.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="place-detail-empty px-1">No rates fetched yet.</p>
            )}
          </LiquidCard>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
