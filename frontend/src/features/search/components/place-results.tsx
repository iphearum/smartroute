"use client";
import type { Place } from "@/features/routes/domain/types";
import { placeName, type MapLanguage } from "@/features/i18n/language";
import { LocationPin } from "@/shared/ui/pin";
import { useAppShell } from "@/shared/state/app-shell-context";
export function PlaceResults({
  places,
  onSelect,
  history = false,
  language,
}: {
  places: Place[];
  onSelect: (place: Place) => void;
  history?: boolean;
  language?: MapLanguage;
}) {
  const preferredLanguage = useAppShell((state) => state.language),
    selectedLanguage = language ?? preferredLanguage;
  return (
    <div>
      {places.map((place) => (
        <button
          key={`${place.name}-${place.latitude}-${place.longitude}`}
          onClick={() => onSelect(place)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-emerald-50"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xl">
            {history ? (
              "◷"
            ) : (
              <LocationPin
                size={25}
                color="#047857"
                shadowColor="#475569"
                shadowOpacity={0.8}
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm">
              {placeName(place, selectedLanguage)}
            </strong>
            <small className="block truncate text-xs text-slate-500">
              {place.address || place.category || "Phnom Penh"}
            </small>
            {typeof place.metadata?.opening_hours === "string" && (
              <small className="block truncate text-xs text-emerald-700">
                {place.metadata.opening_hours}
              </small>
            )}
            {place.status && place.status !== "active" && (
              <small className="block truncate text-xs text-amber-700">
                {place.status.replaceAll("_", " ")}
              </small>
            )}
          </span>
          {place.category && (
            <span className="max-w-20 truncate rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
              {place.category}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
