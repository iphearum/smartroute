"use client";
import Link from "next/link";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";

export function NoBusinessPrompt() {
  return (
    <LiquidCard className="rounded-[24px] p-6 text-center">
      <Icon name="info" className="mx-auto h-6 w-6 text-emerald-700" />
      <strong className="mt-2 block text-sm">Claim a business first</strong>
      <p className="mt-1 text-xs text-slate-500">
        This section needs a claimed shop to manage.
      </p>
      <Link href="/shops" className="shop-open-admin mt-4">
        <Icon name="pin" className="h-4 w-4" />
        Claim a place
      </Link>
    </LiquidCard>
  );
}
