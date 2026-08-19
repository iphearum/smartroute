export interface PoiTheme {
  key: string;
  label: string;
  iconSvg: string;
  color: string;
  softColor: string;
  priority: number;
  keywords: string[];
  group: string;
}

// Mirrors the poi_themes table (see backend/database/migrations/0007 and
// 0008) -- used until the /maps/poi-themes call resolves, and as a safety
// net if the backend is ever unreachable, so the map never renders blank or
// unstyled markers. Keep this in sync with the DB seed data exactly,
// keyword-for-keyword, so the fallback never drifts from the source of
// truth.
export const FALLBACK_POI_THEMES: PoiTheme[] = [
  {
    key: "food",
    label: "Food",
    priority: 15,
    color: "#e85d04",
    softColor: "#fff1e8",
    group: "food_drink",
    iconSvg:
      '<path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M16 3v18M16 3c3 2 4 5 4 8h-4"/>',
    keywords: [
      "restaurant", "fast_food", "food", "bar\\b", "\\bpub\\b", "bakery",
      "nightclub", "casino", "ice_cream", "food_court", "deli", "seafood",
    ],
  },
  {
    key: "cafe",
    label: "Cafe",
    priority: 16,
    color: "#a16207",
    softColor: "#fef3c7",
    group: "food_drink",
    iconSvg:
      '<path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 2h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2"/>',
    keywords: ["cafe", "coffee"],
  },
  {
    key: "hotel",
    label: "Hotel",
    priority: 5,
    color: "#7c3aed",
    softColor: "#f3e8ff",
    group: "lodging",
    iconSvg:
      '<path d="M3 20V7m18 13V11a3 3 0 0 0-3-3h-7v8M3 16h18M6 11h5V7a2 2 0 0 0-2-2H6v6Z"/>',
    keywords: ["hotel", "guest", "hostel", "motel"],
  },
  {
    key: "medical",
    label: "Medical",
    priority: 0,
    color: "#dc2626",
    softColor: "#fee2e2",
    group: "health",
    iconSvg: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
    keywords: [
      "hospital", "clinic", "doctor", "dentist", "pharmacy", "health",
      "optician", "optometrist",
    ],
  },
  {
    key: "shopping",
    label: "Shopping",
    priority: 4,
    color: "#0284c7",
    softColor: "#e0f2fe",
    group: "shopping",
    iconSvg: '<path d="M5 8h14l-1 13H6L5 8Zm3 1V6a4 4 0 0 1 8 0v3"/>',
    keywords: [
      "shop", "mall", "market", "supermarket", "convenience", "clothes",
      "furniture", "gift", "variety_store", "department_store", "beverages",
      "shoes", "books", "jewelry", "greengrocer", "florist", "toys",
      "baby_goods", "hardware", "butcher", "chemist", "stationery",
      "second_hand", "houseware",
    ],
  },
  {
    key: "fuel",
    label: "Fuel",
    priority: 2,
    color: "#475569",
    softColor: "#e2e8f0",
    group: "transport",
    iconSvg: '<path d="M5 3h10v18H5V3Zm2 3h6v5H7V6Zm8 1h3l2 3v8a2 2 0 0 1-4 0v-5"/>',
    keywords: ["fuel", "charging"],
  },
  {
    key: "education",
    label: "Education",
    priority: 6,
    color: "#4f46e5",
    softColor: "#e0e7ff",
    group: "education",
    iconSvg: '<path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v5c3 3 9 3 12 0v-5M22 9v7"/>',
    keywords: ["school", "college", "university", "library", "educational_institution", "kindergarten"],
  },
  {
    key: "finance",
    label: "Finance",
    priority: 8,
    color: "#0f766e",
    softColor: "#ccfbf1",
    group: "finance",
    iconSvg: '<path d="m3 9 9-5 9 5M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M3 21h18"/>',
    keywords: ["bank", "atm", "finance", "bureau_de_change"],
  },
  {
    key: "park",
    label: "Park",
    priority: 13,
    color: "#16a34a",
    softColor: "#dcfce7",
    group: "nature",
    iconSvg: '<path d="M12 3 7 10h3l-5 7h6v4h2v-4h6l-5-7h3l-5-7Z"/>',
    keywords: ["\\bpark\\b", "garden", "playground", "nature"],
  },
  {
    key: "transit",
    label: "Transit",
    priority: 1,
    color: "#0891b2",
    softColor: "#cffafe",
    group: "transport",
    iconSvg: '<path d="M5 4h14v12H5V4Zm3 15h8M8 8h8M8 13h.01M16 13h.01"/>',
    keywords: [
      "bus", "transit", "ferry", "platform", "parking", "taxi", "car_rental",
      "bicycle_rental", "motorcycle_rental", "motorcycle_parking", "boat_rental",
    ],
  },
  {
    key: "worship",
    label: "Worship",
    priority: 14,
    color: "#92400e",
    softColor: "#fde8d0",
    group: "worship",
    iconSvg: '<path d="M12 2v3M9 9a3 3 0 0 1 6 0v2H9V9Z M5 21V11h14v10M3 21h18"/>',
    keywords: ["place_of_worship", "temple", "pagoda", "church", "mosque", "grave_yard", "cemetery"],
  },
  {
    key: "government",
    label: "Government",
    priority: 3,
    color: "#1e40af",
    softColor: "#dbeafe",
    group: "civic",
    iconSvg: '<path d="M12 3 3 9h18L12 3Z M5 9v10M9 9v10M15 9v10M19 9v10M3 21h18"/>',
    keywords: [
      "government", "police", "townhall", "courthouse", "diplomatic", "prison",
      "fire_station", "gouvernment", "post_office", "public_building",
      "information", "community_centre",
    ],
  },
  {
    key: "automotive",
    label: "Automotive",
    priority: 7,
    color: "#57534e",
    softColor: "#e7e5e4",
    group: "transport",
    iconSvg:
      '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8Z"/>',
    keywords: ["car_repair", "\\bcar\\b", "motorcycle", "car_wash", "tyres", "car_parts"],
  },
  {
    key: "beauty",
    label: "Beauty",
    priority: 11,
    color: "#db2777",
    softColor: "#fce7f3",
    group: "lifestyle",
    iconSvg:
      '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    keywords: ["hairdresser", "massage", "beauty", "cosmetics", "spa", "sauna"],
  },
  {
    key: "attraction",
    label: "Attraction",
    priority: 9,
    color: "#ca8a04",
    softColor: "#fef9c3",
    group: "culture",
    iconSvg:
      '<path d="M12 2l2.6 6.6L21 9l-5 4.6L17.4 21 12 17.3 6.6 21 8 13.6 3 9l6.4-.4L12 2Z"/>',
    keywords: [
      "attraction", "monument", "viewpoint", "museum", "gallery", "artwork",
      "memorial", "castle", "theme_park", "zoo", "cinema", "theatre",
      "arts_centre", "exhibition_centre",
    ],
  },
  {
    key: "fitness",
    label: "Fitness",
    priority: 10,
    color: "#65a30d",
    softColor: "#ecfccb",
    group: "lifestyle",
    iconSvg: '<path d="M4 9v6M2 10v4M20 9v6M22 10v4M8 12h8M6 8v8M18 8v8"/>',
    keywords: ["fitness_centre", "sports_centre", "stadium", "swimming_pool", "golf_course", "\\bpitch\\b"],
  },
  {
    key: "electronics",
    label: "Electronics",
    priority: 12,
    color: "#4338ca",
    softColor: "#e0e7ff",
    group: "tech",
    iconSvg:
      '<path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15h4"/>',
    keywords: ["mobile_phone", "electronics", "computer", "hifi", "camera", "telecommunication"],
  },
  {
    key: "office",
    label: "Offices & Services",
    priority: 18,
    color: "#334155",
    softColor: "#e2e8f0",
    group: "business",
    iconSvg:
      '<path d="M3 8h18v11H3V8Zm5-3h8a1 1 0 0 1 1 1v2H7V6a1 1 0 0 1 1-1ZM3 13h18"/>',
    keywords: [
      "company", "\\boffice\\b", "\\bngo\\b", "estate_agent", "travel_agen",
      "lawyer", "insurance", "architect", "engineer", "coworking",
      "consulting", "logistics", "association", "advertising_agency",
    ],
  },
  {
    key: "services",
    label: "Services",
    priority: 19,
    color: "#b45309",
    softColor: "#fef3c7",
    group: "business",
    iconSvg:
      '<path d="M6 3v6M3 6h6M14 14l7 7M14 14a4 4 0 1 1 4-6.9L15 10l1 1 2.9-3A4 4 0 0 1 14 14Z"/>',
    keywords: [
      "laundry", "dry_clean", "tailor", "dressmaker", "shoemaker",
      "watchmaker", "copyshop", "printing", "locksmith",
    ],
  },
  {
    key: "housing",
    label: "Housing",
    priority: 20,
    color: "#78716c",
    softColor: "#f5f5f4",
    group: "housing",
    iconSvg:
      '<path d="M4 21V6l8-3 8 3v15M4 21h16M9 21v-6h2v6M13 21v-6h2v6M8 9h1M8 12h1M15 9h1M15 12h1"/>',
    keywords: ["apartment", "residential"],
  },
  {
    key: "place",
    label: "Place",
    priority: 17,
    color: "#087f5b",
    softColor: "#d9f2e7",
    group: "other",
    iconSvg:
      '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>',
    keywords: [],
  },
];

export function iconMarkup(theme: PoiTheme) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${theme.iconSvg}</svg>`;
}
