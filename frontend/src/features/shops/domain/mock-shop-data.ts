// Sample data for the Dashboard/POS prototype sections only (see
// docs/shop-management-design.md -- Manage shop and Stock now use the real
// /commerce/* API instead of this file). Nothing here is fetched or
// persisted.

export type MenuCategory = "food" | "cafe" | "shopping";

export interface MenuItem {
  id: string;
  name: string;
  category: MenuCategory;
  price: number;
  discountPercent?: number;
  rating: number;
  photoEmoji: string;
  available: boolean;
  stockQty: number;
  lowStockThreshold: number;
  unitsSoldToday: number;
}

export const mockMenuItems: MenuItem[] = [
  {
    id: "item_kuyteav",
    name: "Kuy Teav (Pork)",
    category: "food",
    price: 3.5,
    discountPercent: 20,
    rating: 4.8,
    photoEmoji: "🍲",
    available: true,
    stockQty: 42,
    lowStockThreshold: 15,
    unitsSoldToday: 31,
  },
  {
    id: "item_lortcha",
    name: "Lort Cha",
    category: "food",
    price: 3.0,
    rating: 4.6,
    photoEmoji: "🍝",
    available: true,
    stockQty: 9,
    lowStockThreshold: 15,
    unitsSoldToday: 24,
  },
  {
    id: "item_numbanhchok",
    name: "Num Banh Chok",
    category: "food",
    price: 2.5,
    discountPercent: 15,
    rating: 4.9,
    photoEmoji: "🥗",
    available: true,
    stockQty: 18,
    lowStockThreshold: 15,
    unitsSoldToday: 19,
  },
  {
    id: "item_skewers",
    name: "Grilled Pork Skewers",
    category: "food",
    price: 4.0,
    rating: 4.5,
    photoEmoji: "🍢",
    available: false,
    stockQty: 0,
    lowStockThreshold: 10,
    unitsSoldToday: 0,
  },
  {
    id: "item_icedcoffee",
    name: "Iced Coffee",
    category: "cafe",
    price: 1.5,
    rating: 4.7,
    photoEmoji: "🧋",
    available: true,
    stockQty: 60,
    lowStockThreshold: 20,
    unitsSoldToday: 27,
  },
  {
    id: "item_sugarcane",
    name: "Sugarcane Juice",
    category: "cafe",
    price: 1.0,
    rating: 4.4,
    photoEmoji: "🥤",
    available: true,
    stockQty: 6,
    lowStockThreshold: 15,
    unitsSoldToday: 12,
  },
];
