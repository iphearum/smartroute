"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { SkeletonRows } from "@/shared/ui/skeleton";
import { toast } from "@/shared/ui/toast";
import { ApiError } from "@/shared/api/http";
import { commerceApi } from "../api/commerce-api";
import type { Product } from "../domain/commerce-types";
import { useExchangeRates } from "../hooks/use-exchange-rates";
import { useMyBusiness } from "../hooks/use-my-business";
import { NoBusinessPrompt } from "./no-business-prompt";
import { ProductImportDialog } from "./product-import-dialog";

const categories = ["food", "cafe", "shopping"];

function slugifySku(name: string) {
  return (
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ITEM"
  );
}

function ProductRow({
  product,
  onChanged,
  toKhr,
}: {
  product: Product;
  onChanged: (updated: Product) => void;
  toKhr: (usd: number) => number | null;
}) {
  const variant = product.variants[0];
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(product.name),
    [price, setPrice] = useState(variant ? String(variant.price) : ""),
    [saving, setSaving] = useState(false);

  const save = async () => {
    const priceValue = Number(price);
    if (!name.trim() || !Number.isFinite(priceValue) || priceValue < 0) {
      toast.error("Enter a valid name and price");
      return;
    }
    setSaving(true);
    try {
      await commerceApi.updateProduct(product.id, { name: name.trim() });
      if (variant) await commerceApi.updateVariant(variant.id, { price: priceValue });
      onChanged({
        ...product,
        name: name.trim(),
        variants: variant
          ? [{ ...variant, price: priceValue }, ...product.variants.slice(1)]
          : product.variants,
      });
      toast.success(`${name.trim()} updated`);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    const nextStatus = product.status === "archived" ? "active" : "archived";
    try {
      await commerceApi.updateProduct(product.id, { status: nextStatus });
      onChanged({ ...product, status: nextStatus });
      toast.success(nextStatus === "archived" ? `${product.name} archived` : `${product.name} restored`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update status");
    }
  };

  if (editing) {
    return (
      <div className="claim-inline-form">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="claim-inline-input"
        />
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
          className="claim-inline-input"
          placeholder="Price (USD)"
        />
        <div className="flex gap-2">
          <button className="place-detail-add" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="pos-tab" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stock-row">
      <span className="stock-item-name">{product.name}</span>
      <span className="stock-category">{product.category || "—"}</span>
      <span>
        {variant ? (
          <>
            ${Number(variant.price).toFixed(2)}
            {toKhr(Number(variant.price)) !== null && (
              <small className="stock-category ml-1">
                ≈ ៛{toKhr(Number(variant.price))!.toLocaleString()}
              </small>
            )}
          </>
        ) : (
          "No price"
        )}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span
          className={`stock-status ${product.status === "active" ? "stock-status-ok" : "stock-status-low"}`}
        >
          {product.status}
        </span>
        <span className="flex gap-1">
          <button
            className="shop-item-edit shop-item-edit-inline"
            aria-label={`Edit ${product.name}`}
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" className="h-3.5 w-3.5" />
          </button>
          <button
            className="shop-item-edit shop-item-edit-inline"
            aria-label={
              product.status === "archived" ? `Restore ${product.name}` : `Archive ${product.name}`
            }
            onClick={() => void toggleArchive()}
          >
            <Icon name={product.status === "archived" ? "box" : "close"} className="h-3.5 w-3.5" />
          </button>
        </span>
      </span>
    </div>
  );
}

export function ManageShopPanel() {
  const { business, status: businessStatus } = useMyBusiness();
  const { usd, toKhr, refresh: refreshRates, refreshing } = useExchangeRates();
  const [products, setProducts] = useState<Product[]>([]),
    [loading, setLoading] = useState(true),
    [showForm, setShowForm] = useState(false),
    [name, setName] = useState(""),
    [category, setCategory] = useState(categories[0]),
    [price, setPrice] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [importing, setImporting] = useState(false);

  const load = async (businessId: number) => {
    setLoading(true);
    try {
      setProducts(await commerceApi.listProducts(businessId));
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (business) void load(business.id);
  }, [business]);

  if (businessStatus === "loading") return null;
  if (!business) return <NoBusinessPrompt />;

  const submit = async () => {
    const priceValue = Number(price);
    if (!name.trim() || !Number.isFinite(priceValue) || priceValue < 0) return;
    setSaving(true);
    setError(null);
    try {
      const product = await commerceApi.createProduct(business.id, {
        name: name.trim(),
        category,
      });
      await commerceApi.createVariant(product.id, {
        sku: `${slugifySku(name)}-${product.id}`,
        price: priceValue,
      });
      setName("");
      setPrice("");
      setShowForm(false);
      toast.success(`${name.trim()} added to the menu`);
      await load(business.id);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not save item";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const visibleProducts = products.filter((product) =>
    product.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <LiquidCard className="rounded-[24px] p-4">
      <div className="exchange-rate-card">
        <Icon name="wallet" className="h-4 w-4" />
        {usd ? (
          <span>
            1 USD ≈ {usd.average_rate.toLocaleString()} KHR
            <span className="exchange-rate-source"> · NBC {usd.effective_date}</span>
          </span>
        ) : (
          <span className="exchange-rate-source">No exchange rate on file yet</span>
        )}
        <button
          className="exchange-rate-refresh"
          disabled={refreshing}
          onClick={async () => {
            const err = await refreshRates();
            if (err) toast.error(err);
            else toast.success("Exchange rate refreshed from NBC");
          }}
        >
          {refreshing ? "…" : "Refresh"}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <strong className="text-sm">Products — {business.display_name}</strong>
        <span className="flex flex-wrap gap-2">
          <button className="shop-add-action" onClick={() => setImporting(true)}>
            ⤓ Import CSV/XLSX
          </button>
          <button className="shop-add-action" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "＋ Add item"}
          </button>
        </span>
      </div>

      {importing && (
        <ProductImportDialog
          businessId={business.id}
          branchId={business.branches[0]?.id}
          onClose={() => setImporting(false)}
          onImported={() => void load(business.id)}
        />
      )}

      {showForm && (
        <div className="claim-inline-form">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Item name"
            className="claim-inline-input"
          />
          <div className="flex gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                aria-pressed={category === cat}
                className={`pos-tab ${category === cat ? "active" : ""}`}
              >
                {cat}
              </button>
            ))}
          </div>
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="Price (USD)"
            inputMode="decimal"
            className="claim-inline-input"
          />
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <button
            className="place-detail-add"
            disabled={saving || !name.trim() || !price.trim()}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : "Save item"}
          </button>
        </div>
      )}

      {!loading && products.length > 4 && (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products"
          className="claim-inline-input mb-3"
          aria-label="Search products"
        />
      )}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="stock-table">
          <div className="stock-row stock-header">
            <span>Item</span>
            <span>Category</span>
            <span>Price</span>
            <span>Status</span>
          </div>
          {visibleProducts.length ? (
            visibleProducts.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                toKhr={toKhr}
                onChanged={(updated) =>
                  setProducts((current) =>
                    current.map((entry) => (entry.id === updated.id ? updated : entry)),
                  )
                }
              />
            ))
          ) : (
            <p className="place-detail-empty px-1 py-2">
              {products.length
                ? "No products match your search."
                : "No products yet. Add your first item above."}
            </p>
          )}
        </div>
      )}
    </LiquidCard>
  );
}
