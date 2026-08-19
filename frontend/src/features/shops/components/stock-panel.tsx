"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { SkeletonRows } from "@/shared/ui/skeleton";
import { toast } from "@/shared/ui/toast";
import { commerceApi } from "../api/commerce-api";
import type { BranchInventoryRow, Product } from "../domain/commerce-types";
import { useMyBusiness } from "../hooks/use-my-business";
import { NoBusinessPrompt } from "./no-business-prompt";

interface Row {
  variantId: number;
  sku: string;
  productName: string;
  quantityAvailable: number;
}

function stockStatus(qty: number) {
  if (qty <= 0) return { key: "out", label: "Out of stock" };
  if (qty <= 10) return { key: "low", label: "Low stock" };
  return { key: "ok", label: "In stock" };
}

function StockRow({
  branchId,
  row,
  onSaved,
}: {
  branchId: number;
  row: Row;
  onSaved: (variantId: number, qty: number) => void;
}) {
  const [value, setValue] = useState(String(row.quantityAvailable)),
    [saving, setSaving] = useState(false);
  const status = stockStatus(row.quantityAvailable);

  const save = async () => {
    const qty = Number(value);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    setSaving(true);
    try {
      const item = await commerceApi.setInventory(branchId, row.variantId, {
        quantity_available: qty,
      });
      onSaved(row.variantId, item.quantity_available);
      toast.success(`${row.productName} stock updated`);
    } catch {
      toast.error(`Could not update ${row.productName}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stock-row">
      <span className="stock-item-name">{row.productName}</span>
      <span className="stock-category">{row.sku}</span>
      <span className="stock-set-control">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="numeric"
          className="claim-inline-input claim-inline-input-sm"
        />
        <button
          className="stock-set-save"
          onClick={() => void save()}
          disabled={saving || value === String(row.quantityAvailable)}
        >
          {saving ? "…" : "Save"}
        </button>
      </span>
      <span className={`stock-status stock-status-${status.key}`}>
        {status.key !== "ok" && <Icon name="alert" className="h-3.5 w-3.5" />}
        {status.label}
      </span>
    </div>
  );
}

export function StockPanel() {
  const { business, status: businessStatus } = useMyBusiness();
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business?.branches[0]) return;
    const branchId = business.branches[0].id;
    setLoading(true);
    Promise.all([
      commerceApi.listProducts(business.id),
      commerceApi.listBranchInventory(branchId).catch(() => [] as BranchInventoryRow[]),
    ])
      .then(([products, inventory]: [Product[], BranchInventoryRow[]]) => {
        const byVariant = new Map(inventory.map((item) => [item.variant_id, item]));
        setRows(
          products.flatMap((product) =>
            product.variants.map((variant) => ({
              variantId: variant.id,
              sku: variant.sku,
              productName: product.name,
              quantityAvailable: byVariant.get(variant.id)?.quantity_available ?? 0,
            })),
          ),
        );
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [business]);

  if (businessStatus === "loading") return null;
  if (!business) return <NoBusinessPrompt />;
  const branch = business.branches[0];
  if (!branch) {
    return (
      <LiquidCard className="rounded-[24px] p-6 text-center">
        <Icon name="alert" className="mx-auto h-6 w-6 text-amber-600" />
        <strong className="mt-2 block text-sm">No branch linked yet</strong>
        <p className="mt-1 text-xs text-slate-500">
          Stock is tracked per branch. Link a place to this business from the
          Shops page first.
        </p>
      </LiquidCard>
    );
  }

  return (
    <LiquidCard className="rounded-[24px] p-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <strong className="text-sm">Stock — {branch.place__name}</strong>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {rows.length} variants
        </span>
      </div>
      {loading ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="stock-table">
          <div className="stock-row stock-header">
            <span>Item</span>
            <span>SKU</span>
            <span>Quantity</span>
            <span>Status</span>
          </div>
          {rows.length ? (
            rows.map((row) => (
              <StockRow
                key={row.variantId}
                branchId={branch.id}
                row={row}
                onSaved={(variantId, qty) =>
                  setRows((current) =>
                    current.map((entry) =>
                      entry.variantId === variantId
                        ? { ...entry, quantityAvailable: qty }
                        : entry,
                    ),
                  )
                }
              />
            ))
          ) : (
            <p className="place-detail-empty px-1 py-2">
              No products yet — add items in Manage shop first.
            </p>
          )}
        </div>
      )}
    </LiquidCard>
  );
}
