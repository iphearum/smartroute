"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { mockMenuItems, type MenuCategory } from "../domain/mock-shop-data";

const orderTypes = [
  { key: "dine_in", label: "Dine-in" },
  { key: "takeaway", label: "Takeaway" },
  { key: "delivery", label: "Delivery" },
] as const;
type OrderTypeKey = (typeof orderTypes)[number]["key"];

const categoryTabs: { key: MenuCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "food", label: "Food" },
  { key: "cafe", label: "Drinks" },
];

const TAX_RATE = 0.1;

export function PosPanel() {
  const [category, setCategory] = useState<MenuCategory | "all">("all"),
    [orderType, setOrderType] = useState<OrderTypeKey>("dine_in"),
    [cart, setCart] = useState<Record<string, number>>({}),
    [placed, setPlaced] = useState(false);

  const items = mockMenuItems.filter(
    (item) => item.available && (category === "all" || item.category === category),
  );

  const addToCart = (id: string) => {
    setPlaced(false);
    setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  };
  const changeQty = (id: string, delta: number) =>
    setCart((current) => {
      const next = { ...current, [id]: (current[id] ?? 0) + delta };
      if (next[id] <= 0) delete next[id];
      return next;
    });

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({
          item: mockMenuItems.find((menuItem) => menuItem.id === id)!,
          qty,
        }))
        .filter((line) => line.item),
    [cart],
  );
  const subtotal = lines.reduce((sum, line) => sum + line.item.price * line.qty, 0),
    tax = subtotal * TAX_RATE,
    total = subtotal + tax;

  return (
    <div className="pos-layout">
      <LiquidCard className="rounded-[24px] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          {categoryTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setCategory(tab.key)}
              aria-pressed={category === tab.key}
              className={`pos-tab ${category === tab.key ? "active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="pos-item-grid">
          {items.map((item) => (
            <button
              key={item.id}
              className="pos-item-btn"
              onClick={() => addToCart(item.id)}
            >
              <span className="pos-item-emoji">{item.photoEmoji}</span>
              <strong>{item.name}</strong>
              <span>${item.price.toFixed(2)}</span>
            </button>
          ))}
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
            {lines.map(({ item, qty }) => (
              <div className="pos-cart-line" key={item.id}>
                <span className="min-w-0 flex-1">
                  <strong className="shop-item-name">{item.name}</strong>
                  <span className="block text-[10.5px] text-slate-500">
                    ${item.price.toFixed(2)} each
                  </span>
                </span>
                <span className="stock-qty-control">
                  <button onClick={() => changeQty(item.id, -1)} aria-label={`Remove one ${item.name}`}>
                    −
                  </button>
                  <strong>{qty}</strong>
                  <button onClick={() => changeQty(item.id, 1)} aria-label={`Add one ${item.name}`}>
                    +
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="place-detail-empty px-1">Tap an item to add it to the order.</p>
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
          disabled={!lines.length}
          onClick={() => {
            setCart({});
            setPlaced(true);
          }}
        >
          Charge ${total.toFixed(2)}
        </button>
        {placed && (
          <p className="pos-placed-flag">
            <Icon name="star" className="h-3.5 w-3.5" />
            Order placed (demo only)
          </p>
        )}
      </LiquidCard>
    </div>
  );
}
