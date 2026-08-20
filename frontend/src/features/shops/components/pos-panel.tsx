"use client";

import { useEffect, useMemo, useState } from "react";
import { commerceApi } from "../api/commerce-api";
import type { OrderType, Product } from "../domain/commerce-types";
import { useMyBusiness } from "../hooks/use-my-business";
import { NoBusinessPrompt } from "./no-business-prompt";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { SkeletonRows } from "@/shared/ui/skeleton";
import { toast } from "@/shared/ui/toast";

const orderTypes: Array<{ key: OrderType; label: string }> = [
  { key: "dine_in", label: "Dine-in" },
  { key: "takeaway", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
];

export function PosPanel() {
  const { business, status } = useMyBusiness();
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState("all");
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<string | null>(null);

  useEffect(() => {
    if (business)
      void commerceApi
        .listProducts(business.id)
        .then(setProducts)
        .catch(() => toast.error("Could not load products"));
  }, [business]);
  const categories = [
    "all",
    ...new Set(
      products
        .map((product) => product.category)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const items = products
    .flatMap((product) =>
      product.variants
        .filter((variant) => variant.active)
        .slice(0, 1)
        .map((variant) => ({ product, variant })),
    )
    .filter(
      ({ product }) => category === "all" || product.category === category,
    );
  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => {
          const item = products
            .flatMap((product) =>
              product.variants.map((variant) => ({ product, variant })),
            )
            .find(({ variant }) => variant.id === Number(id));
          return item ? { ...item, quantity } : null;
        })
        .filter((line): line is NonNullable<typeof line> => Boolean(line)),
    [cart, products],
  );
  const subtotal = lines.reduce(
    (sum, line) => sum + line.variant.price * line.quantity,
    0,
  );
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  const add = (id: number) => {
    setPlaced(null);
    setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  };
  const change = (id: number, delta: number) =>
    setCart((current) => {
      const next = { ...current, [id]: (current[id] ?? 0) + delta };
      if (next[id] <= 0) delete next[id];
      return next;
    });
  const placeOrder = async () => {
    if (!business?.branches[0] || !lines.length) return;
    setPlacing(true);
    try {
      const order = await commerceApi.createOrder(business.id, {
        branch_id: business.branches[0].id,
        order_type: orderType,
        lines: lines.map((line) => ({
          variant_id: line.variant.id,
          quantity: line.quantity,
        })),
      });
      setCart({});
      setPlaced(order.order_number);
      toast.success(`${order.order_number} placed`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not place order",
      );
    } finally {
      setPlacing(false);
    }
  };

  if (status === "loading")
    return (
      <LiquidCard className="rounded-[24px] p-4">
        <SkeletonRows rows={5} />
      </LiquidCard>
    );
  if (!business?.branches[0])
    return status === "none" || status === "error" ? (
      <NoBusinessPrompt />
    ) : (
      <LiquidCard className="rounded-[24px] p-4">
        <p className="text-sm text-slate-500">
          Link a branch before using POS.
        </p>
      </LiquidCard>
    );

  return (
    <div className="pos-layout">
      <LiquidCard className="rounded-[24px] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          {categories.map((value) => (
            <button
              key={value}
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={`pos-tab ${category === value ? "active" : ""}`}
            >
              {value === "all" ? "All" : value}
            </button>
          ))}
        </div>
        <div className="pos-item-grid">
          {items.map(({ product, variant }) => (
            <button
              key={variant.id}
              className="pos-item-btn"
              onClick={() => add(variant.id)}
            >
              <span className="pos-item-emoji">🛍️</span>
              <strong>{product.name}</strong>
              <span>
                {variant.title ? `${variant.title} · ` : ""}$
                {variant.price.toFixed(2)} USD
              </span>
            </button>
          ))}
          {!items.length && (
            <p className="place-detail-empty px-1">
              No active products available.
            </p>
          )}
        </div>
      </LiquidCard>
      <LiquidCard className="pos-cart rounded-[24px] p-4">
        <strong className="mb-3 block px-1 text-sm">Current order</strong>
        <div className="mb-3 flex gap-2 px-1">
          {orderTypes.map((type) => (
            <button
              key={type.key}
              onClick={() => setOrderType(type.key)}
              aria-pressed={orderType === type.key}
              className={`pos-tab ${orderType === type.key ? "active" : ""}`}
            >
              {type.label}
            </button>
          ))}
        </div>
        {lines.length ? (
          <div className="pos-cart-lines">
            {lines.map(({ product, variant, quantity }) => (
              <div className="pos-cart-line" key={variant.id}>
                <span className="min-w-0 flex-1">
                  <strong className="shop-item-name">{product.name}</strong>
                  <span className="block text-[10.5px] text-slate-500">
                    ${variant.price.toFixed(2)} each
                  </span>
                </span>
                <span className="stock-qty-control">
                  <button
                    onClick={() => change(variant.id, -1)}
                    aria-label={`Remove one ${product.name}`}
                  >
                    −
                  </button>
                  <strong>{quantity}</strong>
                  <button
                    onClick={() => change(variant.id, 1)}
                    aria-label={`Add one ${product.name}`}
                  >
                    +
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="place-detail-empty px-1">
            Select a product to add it to the order.
          </p>
        )}
        <div className="pos-cart-totals">
          <span>
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </span>
          <span>
            <span>Tax (10%)</span>
            <span>${tax.toFixed(2)}</span>
          </span>
          <span className="pos-cart-total-line">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </span>
        </div>
        <button
          className="place-detail-add"
          disabled={!lines.length || placing}
          onClick={() => void placeOrder()}
        >
          {placing ? "Placing…" : `Charge $${total.toFixed(2)}`}
        </button>
        {placed && (
          <p className="pos-placed-flag">
            <Icon name="star" className="h-3.5 w-3.5" /> {placed} placed
          </p>
        )}
      </LiquidCard>
    </div>
  );
}
