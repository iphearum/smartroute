"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/shared/ui/icon";
import { useMyBusiness } from "../hooks/use-my-business";
import { DashboardOverview } from "./dashboard-overview";
import { ManageShopPanel } from "./manage-shop-panel";
import { StockPanel } from "./stock-panel";
import { PosPanel } from "./pos-panel";
import { PayrollPanel } from "./payroll-panel";
import { OtherInfoPanel } from "./other-info-panel";

const sections = [
  { key: "dashboard", label: "Dashboard", icon: "grid" as IconName, prototype: true },
  { key: "manage", label: "Manage shop", icon: "edit" as IconName, prototype: false },
  { key: "stock", label: "Stock", icon: "box" as IconName, prototype: false },
  { key: "pos", label: "POS", icon: "register" as IconName, prototype: true },
  { key: "payroll", label: "Payroll", icon: "wallet" as IconName, prototype: true },
  { key: "other", label: "Other info", icon: "info" as IconName, prototype: true },
] as const;
type SectionKey = (typeof sections)[number]["key"];

export function ShopAdminShell() {
  const [active, setActive] = useState<SectionKey>("dashboard");
  const activeSection = sections.find((section) => section.key === active)!;
  const { business } = useMyBusiness();

  return (
    <div className="shop-shell">
      <aside className="shop-shell-sidebar">
        <Link href="/shops" className="shop-shell-back" aria-label="Back to Shops">
          <Icon name="chevron-left" className="h-4 w-4" />
          <span className="shop-shell-back-label">Shops</span>
        </Link>
        <nav className="shop-shell-nav" aria-label="Shop admin sections">
          {sections.map((section) => (
            <button
              key={section.key}
              onClick={() => setActive(section.key)}
              aria-current={active === section.key ? "page" : undefined}
              className={`shop-shell-nav-item ${active === section.key ? "active" : ""}`}
            >
              <Icon name={section.icon} className="h-5 w-5" />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="shop-shell-main">
        <header className="shop-shell-topbar">
          <span className="shop-logo shop-logo-sm">🏪</span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm">
              {business?.display_name || "Shop admin"}
            </strong>
            <span className="block truncate text-[11px] text-slate-500">
              {activeSection.label}
            </span>
          </span>
        </header>

        {activeSection.prototype && (
          <div className="shop-preview-flag shop-shell-flag">
            Prototype — sample data only, not backed by a real schema yet. See
            docs/shop-management-design.md.
          </div>
        )}

        <main className="shop-shell-content">
          {active === "dashboard" && <DashboardOverview />}
          {active === "manage" && <ManageShopPanel />}
          {active === "stock" && <StockPanel />}
          {active === "pos" && <PosPanel />}
          {active === "payroll" && <PayrollPanel />}
          {active === "other" && <OtherInfoPanel />}
        </main>
      </div>

      <nav className="shop-shell-bottomnav" aria-label="Shop admin sections">
        {sections.map((section) => (
          <button
            key={section.key}
            onClick={() => setActive(section.key)}
            aria-current={active === section.key ? "page" : undefined}
            className={`shop-shell-bottomnav-item ${active === section.key ? "active" : ""}`}
          >
            <Icon name={section.icon} className="h-5 w-5" />
            <span>{section.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
