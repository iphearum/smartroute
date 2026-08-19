// Sample data for the admin-shell Dashboard/Overview module. Same rules as
// mock-shop-data.ts: nothing here is fetched or persisted, it exists to
// pressure-test the UI shape before the real orders/staff schema exists.

export type OrderStatus = "preparing" | "ready" | "completed" | "cancelled";
export type OrderType = "dine_in" | "takeaway" | "delivery";

export interface DailySales {
  date: string;
  totalSales: number;
  orderCount: number;
}

export interface RecentOrder {
  id: string;
  label: string;
  type: OrderType;
  items: string[];
  total: number;
  status: OrderStatus;
  placedMinutesAgo: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  hourlyRate: number;
  hoursThisWeek: number;
  clockedIn: boolean;
}

export const mockDailySales: DailySales[] = [
  { date: "Mon", totalSales: 84, orderCount: 22 },
  { date: "Tue", totalSales: 96, orderCount: 27 },
  { date: "Wed", totalSales: 71, orderCount: 19 },
  { date: "Thu", totalSales: 108, orderCount: 30 },
  { date: "Fri", totalSales: 142, orderCount: 38 },
  { date: "Sat", totalSales: 165, orderCount: 44 },
  { date: "Sun", totalSales: 119, orderCount: 33 },
];

export const mockRecentOrders: RecentOrder[] = [
  {
    id: "order_1042",
    label: "Order #1042",
    type: "dine_in",
    items: ["Kuy Teav (Pork)", "Iced Coffee"],
    total: 5.0,
    status: "preparing",
    placedMinutesAgo: 4,
  },
  {
    id: "order_1041",
    label: "Order #1041",
    type: "takeaway",
    items: ["Num Banh Chok x2"],
    total: 5.0,
    status: "ready",
    placedMinutesAgo: 9,
  },
  {
    id: "order_1040",
    label: "Order #1040",
    type: "delivery",
    items: ["Lort Cha", "Sugarcane Juice"],
    total: 4.0,
    status: "completed",
    placedMinutesAgo: 21,
  },
  {
    id: "order_1039",
    label: "Order #1039",
    type: "dine_in",
    items: ["Family Set (4 pax)"],
    total: 14.0,
    status: "completed",
    placedMinutesAgo: 47,
  },
];

export const mockStaff: StaffMember[] = [
  {
    id: "staff_dara",
    name: "Dara S.",
    role: "Cook",
    hourlyRate: 2.5,
    hoursThisWeek: 38,
    clockedIn: true,
  },
  {
    id: "staff_sophea",
    name: "Sophea K.",
    role: "Server",
    hourlyRate: 2.0,
    hoursThisWeek: 32,
    clockedIn: true,
  },
  {
    id: "staff_ratanak",
    name: "Ratanak P.",
    role: "Cashier",
    hourlyRate: 2.0,
    hoursThisWeek: 24,
    clockedIn: false,
  },
];
