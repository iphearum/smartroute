import type { Place, RouteOption, RouteStep } from "../domain/types";

const symbols: Record<RouteStep["type"], string> = {
  depart: "↑",
  continue: "›",
  ["slight-left"]: "↖",
  ["slight-right"]: "↗",
  ["turn-left"]: "↰",
  ["turn-right"]: "↱",
  ["u-turn"]: "↶",
  transfer: "⇄",
  arrive: "●",
};
const formatDistance = (metres: number) =>
  metres >= 1000
    ? `${(metres / 1000).toFixed(1)} km`
    : `${Math.max(0, Math.round(metres))} m`;
const formatDuration = (seconds: number) =>
  seconds >= 60
    ? `${Math.max(1, Math.round(seconds / 60))} min`
    : `${Math.max(1, Math.round(seconds))} sec`;

export function DirectionsDetail({
  route,
  destination,
  onBack,
  onFocus,
}: {
  route: RouteOption;
  destination: Place | null;
  onBack: () => void;
  onFocus: (coordinate: [number, number]) => void;
}) {
  const minutes = Math.max(1, Math.round(route.duration / 60));
  return (
    <div>
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex items-start gap-3">
          <button
            onClick={onBack}
            className="mt-0.5 grid h-8 w-8 place-items-center rounded-full text-xl text-slate-600 hover:bg-slate-100"
            aria-label="Back to route options"
          >
            ←
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold text-slate-900">
              {minutes} min{" "}
              <span className="font-normal text-slate-500">
                ({formatDistance(route.length)})
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {route.recommendation_reason || "Fastest available route"}
            </p>
          </div>
          <button
            onClick={() =>
              void navigator.clipboard?.writeText(window.location.href)
            }
            className="grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-slate-100"
            aria-label="Copy route link"
          >
            ⌯
          </button>
          <button
            onClick={() => window.print()}
            className="grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-slate-100"
            aria-label="Print directions"
          >
            ▣
          </button>
        </div>
      </div>
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
          Destination
        </p>
        <strong className="mt-1 block text-sm text-slate-800">
          {destination?.name || "Pinned destination"}
        </strong>
        {destination?.address && (
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {destination.address}
          </p>
        )}
      </div>
      <ol className="px-5 py-2">
        {route.steps?.map((step, index) => (
          <li key={`${index}-${step.instruction}`}>
            <button
              onClick={() => onFocus(step.coordinate)}
              className="group grid w-full grid-cols-[26px_1fr] gap-3 py-3 text-left"
            >
              <span
                className={`pt-0.5 text-xl ${step.type === "arrive" ? "text-red-500" : "text-slate-600"}`}
              >
                {symbols[step.type]}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] leading-[18px] text-slate-800 group-hover:text-emerald-700">
                  {step.instruction}
                </span>
                {step.type !== "arrive" && (
                  <span className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                    <span>
                      {formatDuration(step.duration)} (
                      {formatDistance(step.distance)})
                    </span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {!route.steps?.length && (
        <p className="px-5 py-8 text-center text-xs text-slate-500">
          Detailed directions are unavailable for this route.
        </p>
      )}
    </div>
  );
}
