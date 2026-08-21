"use client";
import { useState } from "react";
import {
  AdminShell,
  type AdminNavigationItem,
} from "@/features/admin/components/admin-shell";
import { useMyBusiness } from "../hooks/use-my-business";
import { DashboardOverview } from "./dashboard-overview";
import { ManageShopPanel } from "./manage-shop-panel";
import { StockPanel } from "./stock-panel";
import { PosPanel } from "./pos-panel";
import { PayrollPanel } from "./payroll-panel";
import { OtherInfoPanel } from "./other-info-panel";
import { Icon } from "@/shared/ui/icon";

const sections = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: "grid" as const,
  },
  {
    key: "manage",
    label: "Manage shop",
    icon: "edit" as const,
  },
  { key: "stock", label: "Stock", icon: "box" as const },
  { key: "pos", label: "POS", icon: "register" as const },
  {
    key: "payroll",
    label: "Payroll",
    icon: "wallet" as const,
  },
  { key: "other", label: "Other info", icon: "info" as const },
] as const;
type SectionKey = (typeof sections)[number]["key"];

export function ShopAdminShell() {
  const [active, setActive] = useState<SectionKey>("dashboard");
  const activeSection = sections.find((section) => section.key === active)!;
  const { business } = useMyBusiness();

  const navigation: readonly AdminNavigationItem[] = sections.map(
    (section) => ({
      key: section.key,
      label: section.label,
      icon: section.icon,
      onSelect: () => setActive(section.key),
    }),
  );

  return (
    <AdminShell
      navigation={navigation}
      activeKey={active}
      brandHref="/shops"
      brand={
        <>
          <span className="shop-logo shop-logo-sm">
            <Icon name="box" />
          </span>
          <span className="shop-shell-back-label">Shop admin</span>
        </>
      }
      title={business?.display_name || "Shop admin"}
      subtitle={activeSection.label}
      backHref="/shops"
      backLabel="Shops"
      footer={null}
    >
      {active === "dashboard" && <DashboardOverview />}
      {active === "manage" && <ManageShopPanel />}
      {active === "stock" && <StockPanel />}
      {active === "pos" && <PosPanel />}
      {active === "payroll" && <PayrollPanel />}
      {active === "other" && <OtherInfoPanel />}
    </AdminShell>
  );
}
