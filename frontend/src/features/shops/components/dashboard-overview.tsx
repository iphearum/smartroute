"use client";

import { useEffect, useState } from "react";
import { commerceApi } from "../api/commerce-api";
import type { DashboardData } from "../domain/commerce-types";
import { useMyBusiness } from "../hooks/use-my-business";
import { NoBusinessPrompt } from "./no-business-prompt";
import { ShopLocationPanel } from "./shop-location-panel";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { SkeletonRows } from "@/shared/ui/skeleton";

const statusLabel: Record<string, string> = {
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};
const money = (value: number) => `$${value.toFixed(2)}`;

export function DashboardOverview() {
  const { business, status, refresh } = useMyBusiness();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    commerceApi
      .dashboard(business.id)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load dashboard",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [business]);

  if (status === "none" || status === "error") return <NoBusinessPrompt />;
  if (status === "loading" || !business || !data)
    return (
      <LiquidCard className="rounded-[24px] p-4">
        <SkeletonRows rows={5} />
      </LiquidCard>
    );
  if (error)
    return (
      <LiquidCard className="rounded-[24px] p-4">
        <p className="text-sm text-red-600">{error}</p>
      </LiquidCard>
    );
  const today = data.daily_sales[data.daily_sales.length - 1];
  const weekTotal = data.daily_sales.reduce(
    (sum, day) => sum + day.total_sales,
    0,
  );
  const weekOrders = data.daily_sales.reduce(
    (sum, day) => sum + day.order_count,
    0,
  );
  const avgOrder = weekOrders ? weekTotal / weekOrders : 0;
  const maxSales = Math.max(
    ...data.daily_sales.map((day) => day.total_sales),
    1,
  );

  return (
    <div className="flex flex-col gap-4">
      <ShopLocationPanel business={business} onSaved={() => void refresh()} />
      <div className="kpi-grid">
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Today&apos;s sales</span>
          <strong className="kpi-value">
            {money(today?.total_sales ?? 0)}
          </strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Orders today</span>
          <strong className="kpi-value">{today?.order_count ?? 0}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Average order</span>
          <strong className="kpi-value">{money(avgOrder)}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4 kpi-card-warn">
          <span className="kpi-label">Low stock items</span>
          <strong className="kpi-value">{data.low_stock.length}</strong>
        </LiquidCard>
      </div>
      <div className="shop-panel-grid-main">
        <div className="flex flex-col gap-4">
          <LiquidCard className="rounded-[24px] p-4">
            <div className="mb-4 flex items-center justify-between px-1">
              <strong className="text-sm">Sales this week</strong>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                <Icon name="trending" className="h-3.5 w-3.5" /> Live data
              </span>
            </div>
            <div className="sales-chart">
              {data.daily_sales.map((day) => (
                <div className="sales-bar" key={day.date}>
                  <div
                    className="sales-bar-fill"
                    style={{ height: `${(day.total_sales / maxSales) * 100}%` }}
                    title={money(day.total_sales)}
                  />
                  <span className="sales-bar-label">{day.date}</span>
                </div>
              ))}
            </div>
          </LiquidCard>
          <LiquidCard className="rounded-[24px] p-4">
            <strong className="mb-3 block px-1 text-sm">Recent orders</strong>
            {data.recent_orders.length ? (
              <div className="order-list">
                {data.recent_orders.map((order) => (
                  <div className="order-row" key={order.id}>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-[13px]">
                        {order.label}
                      </strong>
                      <span className="block truncate text-[11px] text-slate-500">
                        {order.items.join(", ")}
                      </span>
                    </span>
                    <span
                      className={`order-status-badge order-status-${order.status}`}
                    >
                      {statusLabel[order.status]}
                    </span>
                    <span className="order-time">
                      {order.placed_minutes_ago}m ago
                    </span>
                    <span className="order-total">{money(order.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="place-detail-empty px-1">
                No orders yet. Orders created in POS will appear here.
              </p>
            )}
          </LiquidCard>
        </div>
        <div className="flex flex-col gap-4">
          <LiquidCard className="rounded-[24px] p-4">
            <strong className="mb-3 block px-1 text-sm">Top sellers</strong>
            {data.top_sellers.length ? (
              data.top_sellers.map((item, index) => (
                <div className="top-seller-row" key={item.name}>
                  <span className="top-seller-rank">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="shop-item-name">{item.name}</strong>
                    <span className="block text-[10.5px] text-slate-500">
                      {item.units_sold} sold
                    </span>
                  </span>
                  <span className="shop-item-price">{money(item.sales)}</span>
                </div>
              ))
            ) : (
              <p className="place-detail-empty px-1">No sales yet.</p>
            )}
          </LiquidCard>
          <LiquidCard className="rounded-[24px] p-4">
            <strong className="mb-3 flex items-center gap-2 px-1 text-sm text-amber-700">
              <Icon name="alert" className="h-4 w-4" /> Low stock alerts
            </strong>
            {data.low_stock.length ? (
              data.low_stock.map((item) => (
                <div
                  className="low-stock-row"
                  key={`${item.variant__product__name}-${item.variant__title}`}
                >
                  <span className="min-w-0 flex-1">
                    <strong className="shop-item-name">
                      {item.variant__product__name}
                    </strong>
                  </span>
                  <span className="low-stock-qty">
                    {item.quantity_available} left
                  </span>
                </div>
              ))
            ) : (
              <p className="place-detail-empty px-1">
                Everything is stocked above threshold.
              </p>
            )}
          </LiquidCard>
        </div>
      </div>
    </div>
  );
}
