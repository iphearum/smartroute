"use client";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { mockDailySales, mockRecentOrders, type OrderStatus } from "../domain/mock-dashboard-data";
import { mockMenuItems } from "../domain/mock-shop-data";

const statusLabel: Record<OrderStatus, string> = {
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

export function DashboardOverview() {
  const today = mockDailySales[mockDailySales.length - 1],
    avgOrder = today.totalSales / today.orderCount,
    lowStock = mockMenuItems.filter(
      (item) => item.available && item.stockQty <= item.lowStockThreshold,
    ),
    topSellers = [...mockMenuItems]
      .sort((a, b) => b.unitsSoldToday - a.unitsSoldToday)
      .slice(0, 3),
    maxSales = Math.max(...mockDailySales.map((day) => day.totalSales));

  return (
    <div className="flex flex-col gap-4">
      <div className="kpi-grid">
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Today&apos;s sales</span>
          <strong className="kpi-value">{money(today.totalSales)}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Orders today</span>
          <strong className="kpi-value">{today.orderCount}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Avg. order value</span>
          <strong className="kpi-value">{money(avgOrder)}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4 kpi-card-warn">
          <span className="kpi-label">Low stock items</span>
          <strong className="kpi-value">{lowStock.length}</strong>
        </LiquidCard>
      </div>

      <div className="shop-panel-grid-main">
        <div className="flex flex-col gap-4">
          <LiquidCard className="rounded-[24px] p-4">
            <div className="mb-4 flex items-center justify-between px-1">
              <strong className="text-sm">Sales this week</strong>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                <Icon name="trending" className="h-3.5 w-3.5" />
                7-day trend
              </span>
            </div>
            <div className="sales-chart">
              {mockDailySales.map((day) => (
                <div className="sales-bar" key={day.date}>
                  <div
                    className="sales-bar-fill"
                    style={{ height: `${(day.totalSales / maxSales) * 100}%` }}
                    title={`${money(day.totalSales)} · ${day.orderCount} orders`}
                  />
                  <span className="sales-bar-label">{day.date}</span>
                </div>
              ))}
            </div>
          </LiquidCard>

          <LiquidCard className="rounded-[24px] p-4">
            <div className="mb-3 flex items-center justify-between px-1">
              <strong className="text-sm">Recent orders</strong>
            </div>
            <div className="order-list">
              {mockRecentOrders.map((order) => (
                <div className="order-row" key={order.id}>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[13px]">{order.label}</strong>
                    <span className="block truncate text-[11px] text-slate-500">
                      {order.items.join(", ")}
                    </span>
                  </span>
                  <span className={`order-status-badge order-status-${order.status}`}>
                    {statusLabel[order.status]}
                  </span>
                  <span className="order-time">{order.placedMinutesAgo}m ago</span>
                  <span className="order-total">{money(order.total)}</span>
                </div>
              ))}
            </div>
          </LiquidCard>
        </div>

        <div className="flex flex-col gap-4">
          <LiquidCard className="rounded-[24px] p-4">
            <strong className="mb-3 block px-1 text-sm">Top sellers</strong>
            <div className="flex flex-col gap-2">
              {topSellers.map((item, index) => (
                <div className="top-seller-row" key={item.id}>
                  <span className="top-seller-rank">{index + 1}</span>
                  <span className="top-seller-emoji">{item.photoEmoji}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="shop-item-name">{item.name}</strong>
                    <span className="block text-[10.5px] text-slate-500">
                      {item.unitsSoldToday} sold today
                    </span>
                  </span>
                  <span className="shop-item-price">
                    {money(item.unitsSoldToday * item.price)}
                  </span>
                </div>
              ))}
            </div>
          </LiquidCard>

          <LiquidCard className="rounded-[24px] p-4">
            <strong className="mb-3 flex items-center gap-2 px-1 text-sm text-amber-700">
              <Icon name="alert" className="h-4 w-4" />
              Low stock alerts
            </strong>
            {lowStock.length ? (
              <div className="flex flex-col gap-2">
                {lowStock.map((item) => (
                  <div className="low-stock-row" key={item.id}>
                    <span className="min-w-0 flex-1">
                      <strong className="shop-item-name">{item.name}</strong>
                    </span>
                    <span className="low-stock-qty">{item.stockQty} left</span>
                  </div>
                ))}
              </div>
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
