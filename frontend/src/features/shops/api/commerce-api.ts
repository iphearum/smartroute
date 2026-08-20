import { api } from "@/shared/api/http";
import type {
  Business,
  BranchInventoryRow,
  BranchSchedule,
  ExchangeRateRow,
  ImportCommitResult,
  ImportPreviewResult,
  InventoryItem,
  Product,
  DashboardData,
  OrderResult,
  PayrollRunResult,
  StaffMember,
  PlaceStatus,
} from "../domain/commerce-types";

export const commerceApi = {
  createBusiness: (payload: {
    display_name: string;
    business_type?: string;
    owner_user_id?: string;
    description?: string;
  }) =>
    api<{ id: number; status: string }>("/commerce/businesses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getBusiness: (businessId: number) =>
    api<Business>(`/commerce/businesses/${businessId}`),

  myBusiness: () => api<Business>("/commerce/businesses/mine"),

  dashboard: (businessId: number) =>
    api<DashboardData>(`/commerce/businesses/${businessId}/dashboard`),

  updateBranch: (
    branchId: number,
    payload: Partial<{
      name: string;
      phone: string;
      email: string;
      opening_hours: Record<string, unknown>;
      pickup_enabled: boolean;
      delivery_enabled: boolean;
      active: boolean;
      metadata: Record<string, unknown>;
    }>,
  ) =>
    api<{ id: number; business_id: number }>(`/commerce/branches/${branchId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updatePlace: (
    placeId: number,
    payload: Partial<{
      name: string;
      address: string;
      category: string;
      latitude: number;
      longitude: number;
      status: PlaceStatus;
      moved_to_place_id: number;
    }>,
  ) =>
    api<{ id: number; status: PlaceStatus; active: boolean }>(`/commerce/places/${placeId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  listBranchSchedules: (branchId: number) =>
    api<BranchSchedule[]>(`/commerce/branches/${branchId}/schedules`),

  createBranchSchedule: (
    branchId: number,
    payload: {
      kind: BranchSchedule["kind"];
      title: string;
      starts_at: string;
      ends_at: string;
      all_day: boolean;
      is_closed: boolean;
      notes?: string;
    },
  ) =>
    api<{ id: number; branch_id: number; kind: BranchSchedule["kind"] }>(
      `/commerce/branches/${branchId}/schedules`,
      { method: "POST", body: JSON.stringify(payload) },
    ),

  deleteBranchSchedule: (scheduleId: number) =>
    api<{ id: number; active: boolean }>(`/commerce/schedules/${scheduleId}`, {
      method: "DELETE",
    }),

  createOrder: (
    businessId: number,
    payload: {
      branch_id: number;
      order_type: "dine_in" | "takeaway" | "delivery";
      lines: Array<{ variant_id: number; quantity: number }>;
    },
  ) =>
    api<OrderResult>(`/commerce/businesses/${businessId}/orders`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listStaff: (businessId: number) =>
    api<StaffMember[]>(`/commerce/businesses/${businessId}/staff`),

  createStaff: (
    businessId: number,
    payload: {
      name: string;
      role: string;
      hourly_rate: number;
      hours_this_week: number;
      clocked_in: boolean;
    },
  ) =>
    api<{ id: number; name: string }>(
      `/commerce/businesses/${businessId}/staff`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  updateStaff: (
    staffId: number,
    payload: Partial<{
      name: string;
      role: string;
      hourly_rate: number;
      hours_this_week: number;
      clocked_in: boolean;
      active: boolean;
    }>,
  ) =>
    api<{ id: number; name: string }>(`/commerce/staff/${staffId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  runPayroll: (
    businessId: number,
    payload: { period_start: string; period_end: string },
  ) =>
    api<PayrollRunResult>(`/commerce/businesses/${businessId}/payroll/runs`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateBusiness: (
    businessId: number,
    payload: Partial<{
      display_name: string;
      legal_name: string;
      description: string;
      logo_url: string;
      status: "draft" | "active" | "suspended";
    }>,
  ) =>
    api<{ id: number; status: string }>(`/commerce/businesses/${businessId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  createBranch: (
    businessId: number,
    payload: {
      place_id: number;
      name?: string;
      phone?: string;
      email?: string;
      pickup_enabled?: boolean;
      delivery_enabled?: boolean;
    },
  ) =>
    api<{ id: number; business_id: number; place_id: number }>(
      `/commerce/businesses/${businessId}/branches`,
      { method: "POST", body: JSON.stringify(payload) },
    ),

  createProduct: (
    businessId: number,
    payload: { name: string; description?: string; category?: string },
  ) =>
    api<{ id: number; status: string }>(
      `/commerce/businesses/${businessId}/products`,
      { method: "POST", body: JSON.stringify(payload) },
    ),

  listProducts: (businessId: number) =>
    api<Product[]>(`/commerce/businesses/${businessId}/products`),

  updateProduct: (
    productId: number,
    payload: Partial<{
      name: string;
      description: string;
      category: string;
      status: "draft" | "active" | "archived";
    }>,
  ) =>
    api<{ id: number; status: string }>(`/commerce/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  createVariant: (
    productId: number,
    payload: {
      sku: string;
      title?: string;
      price: number;
      compare_at_price?: number;
      active?: boolean;
    },
  ) =>
    api<{ id: number; sku: string; price: number }>(
      `/commerce/products/${productId}/variants`,
      { method: "POST", body: JSON.stringify(payload) },
    ),

  updateVariant: (
    variantId: number,
    payload: Partial<{
      title: string;
      price: number;
      compare_at_price: number;
      active: boolean;
    }>,
  ) =>
    api<{ id: number; sku: string; price: number }>(
      `/commerce/variants/${variantId}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),

  setInventory: (
    branchId: number,
    variantId: number,
    payload: { quantity_available: number; quantity_reserved?: number },
  ) =>
    api<InventoryItem>(
      `/commerce/branches/${branchId}/inventory/${variantId}`,
      { method: "PUT", body: JSON.stringify(payload) },
    ),

  listBranchInventory: (branchId: number) =>
    api<BranchInventoryRow[]>(`/commerce/branches/${branchId}/inventory`),

  previewProductImport: (businessId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api<ImportPreviewResult>(
      `/commerce/businesses/${businessId}/products/import/preview`,
      { method: "POST", body: form },
    );
  },

  commitProductImport: (businessId: number, file: File, branchId?: number) => {
    const form = new FormData();
    form.append("file", file);
    if (branchId !== undefined) form.append("branch_id", String(branchId));
    return api<ImportCommitResult>(
      `/commerce/businesses/${businessId}/products/import`,
      { method: "POST", body: form },
    );
  },

  latestExchangeRates: () =>
    api<ExchangeRateRow[]>("/commerce/exchange-rates/latest"),

  refreshExchangeRates: () =>
    api<{ count: number; currencies: string[] }>(
      "/commerce/exchange-rates/refresh",
      { method: "POST" },
    ),
};
