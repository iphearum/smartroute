"use client";
import { useState } from "react";
import { useAuthStore } from "@/features/auth/store/auth-store";
import type { Place } from "@/features/routes/domain/types";
import { PlaceResults } from "@/features/search/components/place-results";
import { usePlaceSearch } from "@/features/search/hooks/use-place-search";
import { ApiError } from "@/shared/api/http";
import { LiquidCard } from "@/shared/ui/liquid";
import { toast } from "@/shared/ui/toast";
import { commerceApi } from "../api/commerce-api";

const businessTypes = ["shop", "restaurant", "cafe", "market_stall", "service"];

export function ClaimBusinessFlow({ onClaimed }: { onClaimed: (businessId: number) => void }) {
  const user = useAuthStore((s) => s.user);
  const [place, setPlace] = useState<Place | null>(null),
    [query, setQuery] = useState(""),
    [displayName, setDisplayName] = useState(""),
    [businessType, setBusinessType] = useState("shop"),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState<string | null>(null);
  const search = usePlaceSearch(place ? "" : query);

  const submit = async () => {
    if (!place?.id || !displayName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const business = await commerceApi.createBusiness({
        display_name: displayName.trim(),
        business_type: businessType,
        owner_user_id: user ? String(user.id) : undefined,
      });
      await commerceApi.createBranch(business.id, { place_id: place.id });
      toast.success(`${displayName.trim()} is now yours to manage`);
      onClaimed(business.id);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not create your business";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LiquidCard className="rounded-[28px] p-6">
      <p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-700">
        Shops
      </p>
      <strong className="text-lg">Claim a place</strong>
      <p className="mt-2 text-sm text-slate-500">
        Search for your shop on the map, then name your business to start
        managing it.
      </p>

      <div className="mt-5">
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
          1. Find your place
        </label>
        {place ? (
          <div className="claim-place-picked">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {place.name}
            </span>
            <button
              type="button"
              onClick={() => {
                setPlace(null);
                setQuery("");
              }}
              className="text-xs font-bold text-emerald-700"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by place name"
              className="w-full rounded-[16px] border border-slate-200 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
            />
            {query.trim().length >= 2 && (
              <div className="liquid-popover mt-2 max-h-56 overflow-auto rounded-[18px] p-1">
                <PlaceResults places={search.results} onSelect={setPlace} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
          2. Business name
        </label>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="e.g. Boeung Kak Noodle House"
          className="w-full rounded-[16px] border border-slate-200 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
        />
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
          3. Business type
        </label>
        <div className="flex flex-wrap gap-2">
          {businessTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setBusinessType(type)}
              aria-pressed={businessType === type}
              className={`pos-tab ${businessType === type ? "active" : ""}`}
            >
              {type.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!place || !displayName.trim() || submitting}
        className="mt-6 h-11 w-full rounded-[16px] bg-emerald-700 text-sm font-bold text-white disabled:opacity-40"
      >
        {submitting ? "Creating…" : "Create business"}
      </button>
    </LiquidCard>
  );
}
