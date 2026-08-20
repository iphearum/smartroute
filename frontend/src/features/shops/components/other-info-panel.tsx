"use client";

import { useEffect, useState } from "react";
import { commerceApi } from "../api/commerce-api";
import { useMyBusiness } from "../hooks/use-my-business";
import { NoBusinessPrompt } from "./no-business-prompt";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { toast } from "@/shared/ui/toast";

const paymentMethods = ["Cash", "ABA Pay", "Wing", "Card"];

export function OtherInfoPanel() {
  const { business, status, refresh } = useMyBusiness();
  const branch = business?.branches[0];
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [acceptOrders, setAcceptOrders] = useState(false);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!branch) return;
    setPhone(branch.phone || "");
    setHours(String(branch.opening_hours?.daily || ""));
    const metadata = branch.metadata || {};
    setSelectedPayments(
      Array.isArray(metadata.payment_methods)
        ? metadata.payment_methods.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    );
    setAcceptOrders(metadata.accept_online_orders === true);
    setVatEnabled(metadata.vat_enabled === true);
    setNotifications(metadata.order_notifications === true);
  }, [branch]);

  const save = async () => {
    if (!branch) return;
    setSaving(true);
    try {
      await commerceApi.updateBranch(branch.id, {
        phone,
        opening_hours: { daily: hours },
        pickup_enabled: acceptOrders,
        metadata: {
          ...branch.metadata,
          payment_methods: selectedPayments,
          accept_online_orders: acceptOrders,
          vat_enabled: vatEnabled,
          order_notifications: notifications,
        },
      });
      await refresh();
      toast.success("Shop information saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save shop information",
      );
    } finally {
      setSaving(false);
    }
  };
  const togglePayment = (method: string) =>
    setSelectedPayments((current) =>
      current.includes(method)
        ? current.filter((value) => value !== method)
        : [...current, method],
    );

  if (status === "loading")
    return (
      <LiquidCard className="rounded-[24px] p-4">
        <p className="text-sm text-slate-500">Loading shop settings…</p>
      </LiquidCard>
    );
  if (!business) return <NoBusinessPrompt />;
  if (!branch)
    return (
      <LiquidCard className="rounded-[24px] p-4">
        <p className="text-sm text-slate-500">
          Link a branch before editing shop information.
        </p>
      </LiquidCard>
    );
  return (
    <div className="flex flex-col gap-4">
      <LiquidCard className="rounded-[24px] p-4">
        <strong className="mb-3 block px-1 text-sm">Shop details</strong>
        <div className="settings-row">
          <span className="flex items-center gap-2">
            <Icon name="pin" className="h-4 w-4 text-emerald-700" /> Address
          </span>
          <span className="settings-value">{branch.place__name}</span>
        </div>
        <div className="settings-row">
          <span className="flex items-center gap-2">
            <Icon name="clock" className="h-4 w-4 text-emerald-700" /> Hours
          </span>
          <input
            className="admin-form-input settings-input"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            placeholder="6:00 – 20:00"
          />
        </div>
        <div className="settings-row">
          <span className="flex items-center gap-2">
            <Icon name="phone" className="h-4 w-4 text-emerald-700" /> Phone
          </span>
          <input
            className="admin-form-input settings-input"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Phone number"
          />
        </div>
      </LiquidCard>
      <LiquidCard className="rounded-[24px] p-4">
        <strong className="mb-3 block px-1 text-sm">Payment methods</strong>
        <div className="flex flex-wrap gap-2 px-1">
          {paymentMethods.map((method) => (
            <button
              key={method}
              type="button"
              className={`payment-chip ${selectedPayments.includes(method) ? "active" : ""}`}
              aria-pressed={selectedPayments.includes(method)}
              onClick={() => togglePayment(method)}
            >
              {method}
            </button>
          ))}
        </div>
      </LiquidCard>
      <LiquidCard className="rounded-[24px] p-4">
        <strong className="mb-3 block px-1 text-sm">Preferences</strong>
        <div className="settings-row">
          <span>Accept online orders</span>
          <button
            className="shop-toggle"
            aria-pressed={acceptOrders}
            aria-label="Accept online orders"
            onClick={() => setAcceptOrders((value) => !value)}
          >
            <span />
          </button>
        </div>
        <div className="settings-row">
          <span>Charge 10% VAT</span>
          <button
            className="shop-toggle"
            aria-pressed={vatEnabled}
            aria-label="Charge 10% VAT"
            onClick={() => setVatEnabled((value) => !value)}
          >
            <span />
          </button>
        </div>
        <div className="settings-row">
          <span>Order notifications</span>
          <button
            className="shop-toggle"
            aria-pressed={notifications}
            aria-label="Order notifications"
            onClick={() => setNotifications((value) => !value)}
          >
            <span />
          </button>
        </div>
        <button
          className="place-detail-add mt-4"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </LiquidCard>
    </div>
  );
}
