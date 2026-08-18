"use client";

import type { ReactNode } from "react";
import { MapControlButton, MapControlGroup } from "@/shared/ui/map-controls";
import {
  mapLayerOptions,
  mapLayerPresets,
  useMapLayerSettings,
} from "@/features/map/hooks/use-map-layer-settings";

export function MapLayerSettings({ children }: { children: ReactNode }) {
  const {
    triggerGroupRef,
    popoverRef,
    open,
    layers,
    toggleOpen,
    toggleLayer,
    selectPreset,
    isPresetActive,
    destinationAccessAvailable,
    allowDestinationAccess,
    updateDestinationAccess,
  } = useMapLayerSettings();

  return (
    <>
      <MapControlGroup
        ref={triggerGroupRef}
        className="map-action-controls"
        label="Map controls"
      >
        <MapControlButton
          onClick={toggleOpen}
          aria-label="Map layer settings"
          aria-expanded={open}
          aria-controls="map-layer-settings"
          className={open ? "active" : undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 3-9 5 9 5 9-5-9-5Z" />
            <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
          </svg>
        </MapControlButton>
        {children}
      </MapControlGroup>
      {open && (
        <section
          ref={popoverRef}
          id="map-layer-settings"
          className="map-layer-settings liquid-card"
          aria-label="Map layer settings"
        >
          <header>
            <strong>Map display</strong>
            <small>Choose a preset or individual layers</small>
          </header>
          <div className="map-layer-presets" aria-label="Map presets">
            {mapLayerPresets.map((preset) => {
              const active = isPresetActive(preset.layers);
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={active ? "active" : undefined}
                  aria-pressed={active}
                  onClick={() => selectPreset(preset.layers)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="map-layer-list">
            {mapLayerOptions.map(({ key, label }) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={() => toggleLayer(key)}
                />
              </label>
            ))}
          </div>
          <div className="map-routing-settings">
            <strong>Routing</strong>
            <label className={destinationAccessAvailable ? "" : "is-disabled"}>
              <input
                type="checkbox"
                checked={allowDestinationAccess}
                disabled={!destinationAccessAvailable}
                onChange={(event) =>
                  updateDestinationAccess(event.target.checked)
                }
              />
              <span>
                <b>Allow destination-access roads</b>
                <small>
                  May enter private or service roads near your destination. Use
                  only with permission.
                </small>
                {!destinationAccessAvailable && (
                  <small>
                    Available for car, motorbike, and combined routes.
                  </small>
                )}
              </span>
            </label>
          </div>
        </section>
      )}
    </>
  );
}
