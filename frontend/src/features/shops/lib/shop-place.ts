import type { Place } from "@/features/routes/domain/types";

const SHOP_WORDS =
  /restaurant|food|cafe|coffee|bakery|bar|pub|shop|store|market|mall|supermarket|convenience|retail|grocery|butcher|florist|clothes|furniture|bakery|deli|fast_food/i;

export function isShopPlace(place: Place) {
  return SHOP_WORDS.test(`${place.category || ""} ${place.name}`);
}

export function shopPlaceGroup(place: Place): "restaurant" | "shop" {
  return /restaurant|food|cafe|coffee|bakery|bar|pub|deli|fast_food/i.test(
    `${place.category || ""} ${place.name}`,
  )
    ? "restaurant"
    : "shop";
}
