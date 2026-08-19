"use client";
import { useState } from "react";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";

const paymentMethods = ["Cash", "ABA Pay", "Wing", "Card"];

function Toggle({
  label,
  defaultOn,
}: {
  label: string;
  defaultOn: boolean;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="settings-row">
      <span>{label}</span>
      <button
        className="shop-toggle"
        aria-pressed={on}
        aria-label={label}
        onClick={() => setOn((current) => !current)}
      >
        <span />
      </button>
    </div>
  );
}

export function OtherInfoPanel() {
  return (
    <div className="flex flex-col gap-4">
      <LiquidCard className="rounded-[24px] p-4">
        <strong className="mb-3 block px-1 text-sm">Shop details</strong>
        <div className="settings-row">
          <span className="flex items-center gap-2">
            <Icon name="pin" className="h-4 w-4 text-emerald-700" />
            Address
          </span>
          <span className="settings-value">
            St. 123, Sangkat Boeung Kak II, Phnom Penh
          </span>
        </div>
        <div className="settings-row">
          <span className="flex items-center gap-2">
            <Icon name="clock" className="h-4 w-4 text-emerald-700" />
            Hours
          </span>
          <span className="settings-value">Mon–Sun · 6:00 – 20:00</span>
        </div>
        <div className="settings-row">
          <span className="flex items-center gap-2">
            <Icon name="phone" className="h-4 w-4 text-emerald-700" />
            Phone
          </span>
          <span className="settings-value">012 345 678</span>
        </div>
      </LiquidCard>

      <LiquidCard className="rounded-[24px] p-4">
        <strong className="mb-3 block px-1 text-sm">Payment methods</strong>
        <div className="flex flex-wrap gap-2 px-1">
          {paymentMethods.map((method) => (
            <span key={method} className="payment-chip">
              {method}
            </span>
          ))}
        </div>
      </LiquidCard>

      <LiquidCard className="rounded-[24px] p-4">
        <strong className="mb-3 block px-1 text-sm">Preferences</strong>
        <Toggle label="Open now" defaultOn={true} />
        <Toggle label="Accept online orders" defaultOn={true} />
        <Toggle label="Charge 10% VAT" defaultOn={true} />
        <Toggle label="Order notifications" defaultOn={true} />
      </LiquidCard>
    </div>
  );
}
