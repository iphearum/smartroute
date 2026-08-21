"use client";

import type { Place } from "@/features/routes/domain/types";
import { Icon } from "@/shared/ui/icon";
import { shopPlaceGroup } from "../lib/shop-place";

export type ShopFilter = "all" | "restaurant" | "shop";

export function ShopPlatformContent({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  places,
  loading,
  onPlaceSelect,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  filter: ShopFilter;
  onFilterChange: (filter: ShopFilter) => void;
  places: Place[];
  loading: boolean;
  onPlaceSelect: (place: Place) => void;
}) {
  const visiblePlaces = places.filter(
    (place) => filter === "all" || shopPlaceGroup(place) === filter,
  );

  return (
    <>
      <div className="shop-platform-search-wrap liquid-search">
        <Icon name="search" className="h-4 w-4" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search shops or restaurants"
          aria-label="Search shops and restaurants"
        />
      </div>
      <div
        className="shop-platform-filters"
        role="group"
        aria-label="Shop categories"
      >
        {(["all", "restaurant", "shop"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            className={`liquid-chip${filter === item ? " active" : ""}`}
            onClick={() => onFilterChange(item)}
          >
            {item === "all"
              ? "All places"
              : item === "restaurant"
                ? "Restaurants"
                : "Shops & stores"}
          </button>
        ))}
      </div>
      <div
        className="shop-platform-results liquid-window-scroll"
        aria-live="polite"
      >
        {loading ? (
          <p className="place-detail-empty">Loading places…</p>
        ) : visiblePlaces.length ? (
          visiblePlaces.map((place) => (
            <button
              type="button"
              className="shop-platform-result"
              key={`${place.id || place.name}-${place.latitude}`}
              onClick={() => onPlaceSelect(place)}
            >
              <span className="shop-platform-result-icon">
                <Icon
                  name={
                    shopPlaceGroup(place) === "restaurant" ? "register" : "box"
                  }
                  className="h-4 w-4"
                />
              </span>
              <span className="shop-platform-result-body">
                <strong>{place.name}</strong>
                <span className="shop-platform-result-meta">
                  {(place.category || shopPlaceGroup(place)).replaceAll(
                    "_",
                    " ",
                  )}
                  {place.address ? ` · ${place.address}` : ""}
                </span>
              </span>
              <Icon name="chevron-left" className="h-3.5 w-3.5 rotate-180" />
            </button>
          ))
        ) : (
          <p className="place-detail-empty">No shops or restaurants found.</p>
        )}
      </div>
    </>
  );
}
