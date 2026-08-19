// Shapes matching backend/services/map_store.py's `.values()` output and
// backend/api/commerce.py's response bodies exactly (see
// docs/shop-management-design.md). Field names stay snake_case here because
// they cross the wire as-is -- no case translation happens in commerce-api.ts.

export interface ShopBranchSummary {
  id: number;
  place_id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  opening_hours: Record<string, unknown>;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  metadata: Record<string, unknown>;
  place__name: string;
  place__latitude: number;
  place__longitude: number;
}

export interface StorefrontSummary {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  currency: string;
  theme: Record<string, unknown>;
  published: boolean;
}

export type BusinessStatus = "draft" | "active" | "suspended";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export interface Business {
  id: number;
  owner_user_id: string | null;
  legal_name: string | null;
  display_name: string;
  business_type: string;
  description: string | null;
  logo_url: string | null;
  status: BusinessStatus;
  verification_status: VerificationStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  branches: ShopBranchSummary[];
  storefronts: StorefrontSummary[];
}

export interface ProductVariant {
  id: number;
  sku: string;
  title: string | null;
  price: number;
  compare_at_price: number | null;
  attributes: Record<string, unknown>;
  weight_grams: number | null;
  active: boolean;
}

export type ProductStatus = "draft" | "active" | "archived";

export interface Product {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  status: ProductStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  variants: ProductVariant[];
}

export interface InventoryItem {
  id: number;
  branch_id: number;
  variant_id: number;
  quantity_available: number;
  quantity_reserved: number;
}

export interface ImportRowPreview {
  row: number;
  name: string;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  category: string | null;
  variant_title: string | null;
  quantity: number | null;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportPreviewResult {
  columns: Record<string, string>;
  ignored_columns: string[];
  valid_count: number;
  errors: ImportRowError[];
  rows: ImportRowPreview[];
}

export interface ImportCommitResult {
  created_products: number;
  created_variants: number;
  stocked_variants: number;
  skipped: ImportRowError[];
  errors: ImportRowError[];
  columns: Record<string, string>;
}

export interface ExchangeRateRow {
  id: number;
  currency: string;
  buy_rate: number;
  sell_rate: number;
  average_rate: number;
  source: string;
  effective_date: string;
  fetched_at: string;
}

export interface BranchInventoryRow {
  id: number;
  variant_id: number;
  quantity_available: number;
  quantity_reserved: number;
  updated_at: string;
  variant__sku: string;
  variant__title: string | null;
  variant__product_id: number;
  variant__product__name: string;
}
