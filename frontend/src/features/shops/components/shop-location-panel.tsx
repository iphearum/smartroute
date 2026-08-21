"use client";

import { useEffect, useState } from "react";
import type {
  BranchSchedule,
  Business,
  BranchScheduleKind,
  PlaceStatus,
} from "../domain/commerce-types";
import { commerceApi } from "../api/commerce-api";
import { MapView } from "@/features/map/components/map-view";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { toast } from "@/shared/ui/toast";

export function ShopLocationPanel({
  business,
  onSaved,
}: {
  business: Business;
  onSaved?: () => void;
}) {
  const branch = business.branches[0];
  const [branchName, setBranchName] = useState(branch?.name || "");
  const [phone, setPhone] = useState(branch?.phone || "");
  const [hours, setHours] = useState(
    String(branch?.opening_hours?.daily || ""),
  );
  const [pickup, setPickup] = useState(branch?.pickup_enabled || false);
  const [delivery, setDelivery] = useState(branch?.delivery_enabled || false);
  const [placeName, setPlaceName] = useState(branch?.place__name || "");
  const [placeAddress, setPlaceAddress] = useState(
    branch?.place__address || "",
  );
  const [latitude, setLatitude] = useState(
    String(branch?.place__latitude || ""),
  );
  const [longitude, setLongitude] = useState(
    String(branch?.place__longitude || ""),
  );
  const [placeStatus, setPlaceStatus] = useState<PlaceStatus>(
    branch?.place__status || "active",
  );
  const [schedules, setSchedules] = useState<BranchSchedule[]>(
    branch?.schedules || [],
  );
  const [scheduleKind, setScheduleKind] =
    useState<BranchScheduleKind>("closure");
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const current = business.branches[0];
    if (!current) return;
    setBranchName(current.name || "");
    setPhone(current.phone || "");
    setHours(String(current.opening_hours?.daily || ""));
    setPickup(current.pickup_enabled);
    setDelivery(current.delivery_enabled);
    setPlaceName(current.place__name);
    setPlaceAddress(current.place__address || "");
    setLatitude(String(current.place__latitude));
    setLongitude(String(current.place__longitude));
    setPlaceStatus(current.place__status || "active");
    setSchedules(current.schedules || []);
  }, [business]);

  useEffect(() => {
    if (!branch) return;
    void commerceApi
      .listBranchSchedules(branch.id)
      .then(setSchedules)
      .catch(() => undefined);
  }, [branch?.id]);

  if (!branch) {
    return (
      <LiquidCard className="shop-location-empty rounded-[24px] p-5">
        <Icon name="pin" className="h-6 w-6 text-emerald-700" />
        <strong>Connect a branch to manage its location</strong>
        <p>
          Claim a place first, then this workspace will show its live map
          position.
        </p>
      </LiquidCard>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const parsedLatitude = Number(latitude);
      const parsedLongitude = Number(longitude);
      if (
        !Number.isFinite(parsedLatitude) ||
        !Number.isFinite(parsedLongitude)
      ) {
        throw new Error("Enter valid map coordinates");
      }
      await Promise.all([
        commerceApi.updateBranch(branch.id, {
          name: branchName,
          phone,
          opening_hours: { ...branch.opening_hours, daily: hours },
          pickup_enabled: pickup,
          delivery_enabled: delivery,
        }),
        commerceApi.updatePlace(branch.place_id, {
          name: placeName,
          address: placeAddress,
          latitude: parsedLatitude,
          longitude: parsedLongitude,
          status: placeStatus,
        }),
      ]);
      toast.success("Branch information updated");
      onSaved?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update branch",
      );
    } finally {
      setSaving(false);
    }
  };

  const addSchedule = async () => {
    if (!scheduleTitle.trim() || !scheduleStart || !scheduleEnd) return;
    setScheduleSaving(true);
    try {
      const end = new Date(`${scheduleEnd}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      await commerceApi.createBranchSchedule(branch.id, {
        kind: scheduleKind,
        title: scheduleTitle.trim(),
        starts_at: `${scheduleStart}T00:00:00Z`,
        ends_at: end.toISOString(),
        all_day: true,
        is_closed: true,
        notes: scheduleNotes.trim() || undefined,
      });
      setSchedules(await commerceApi.listBranchSchedules(branch.id));
      setScheduleTitle("");
      setScheduleNotes("");
      toast.success("Closure schedule added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add schedule",
      );
    } finally {
      setScheduleSaving(false);
    }
  };

  const removeSchedule = async (scheduleId: number) => {
    try {
      await commerceApi.deleteBranchSchedule(scheduleId);
      setSchedules((current) =>
        current.filter((item) => item.id !== scheduleId),
      );
      toast.success("Schedule removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove schedule",
      );
    }
  };

  const scheduleDate = (value: string, end = false) => {
    const date = new Date(value);
    if (end) date.setUTCDate(date.getUTCDate() - 1);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };
  const now = Date.now();
  const currentSchedule = schedules.find(
    (schedule) =>
      schedule.is_closed &&
      new Date(schedule.starts_at).getTime() <= now &&
      new Date(schedule.ends_at).getTime() > now,
  );
  const operationalStatus =
    branch.active === false || placeStatus === "disabled"
      ? "disabled"
      : currentSchedule
        ? "closed"
        : "open";

  return (
    <section
      className="shop-location-section"
      aria-label="Shop location management"
    >
      <div className="shop-location-heading">
        <div>
          <span className="kpi-label">Location management</span>
          <h2>Manage your shop location</h2>
          <p>
            Keep customers and staff aligned with the exact branch location.
          </p>
        </div>
        <span className="shop-location-coordinate">
          {branch.place__latitude.toFixed(5)},{" "}
          {branch.place__longitude.toFixed(5)}
        </span>
      </div>
      <div className="shop-location-grid">
        <MapView
          className="shop-location-map"
          center={{
            latitude: branch.place__latitude,
            longitude: branch.place__longitude,
          }}
          zoom={16}
          mapLabel={`Map showing ${branch.place__name}`}
          markers={[
            {
              id: `branch-${branch.id}`,
              latitude: branch.place__latitude,
              longitude: branch.place__longitude,
              color: "var(--color-brand-primary)",
              label: branch.place__name,
            },
          ]}
          showZoomControls
          showRecenterControl
        >
          <div className="shop-location-map-label">
            <span className="shop-location-live-dot" />
            Live branch location
          </div>
        </MapView>
        <LiquidCard className="shop-location-form rounded-[24px] p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="shop-logo shop-logo-sm">
              <Icon name="box" />
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-sm">
                {branch.place__name}
              </strong>
              <span className="block text-[11px] text-slate-500">
                Primary branch
              </span>
            </span>
          </div>
          <label className="shop-location-field">
            <span>Branch name</span>
            <input
              className="admin-form-input"
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder="Main branch"
            />
          </label>
          <label className="shop-location-field">
            <span>Map place name</span>
            <input
              className="admin-form-input"
              value={placeName}
              onChange={(event) => setPlaceName(event.target.value)}
            />
          </label>
          <label className="shop-location-field">
            <span>Map address</span>
            <input
              className="admin-form-input"
              value={placeAddress}
              onChange={(event) => setPlaceAddress(event.target.value)}
              placeholder="Street or area"
            />
          </label>
          <div className="shop-location-coordinate-fields">
            <label className="shop-location-field">
              <span>Latitude</span>
              <input
                className="admin-form-input"
                inputMode="decimal"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
              />
            </label>
            <label className="shop-location-field">
              <span>Longitude</span>
              <input
                className="admin-form-input"
                inputMode="decimal"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
              />
            </label>
          </div>
          <label className="shop-location-field">
            <span>Place visibility</span>
            <select
              className="admin-form-input"
              value={placeStatus}
              onChange={(event) =>
                setPlaceStatus(event.target.value as PlaceStatus)
              }
            >
              <option value="active">Active</option>
              <option value="temporarily_closed">Temporarily closed</option>
              <option value="permanently_closed">Permanently closed</option>
              <option value="moved">Moved to another place</option>
              <option value="disabled">Disabled from map</option>
            </select>
          </label>
          <label className="shop-location-field">
            <span>Phone</span>
            <input
              className="admin-form-input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Branch phone"
            />
          </label>
          <label className="shop-location-field">
            <span>Opening hours</span>
            <input
              className="admin-form-input"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder="Daily · 6:00 – 20:00"
            />
          </label>
          <div className="shop-location-switches">
            <label>
              <span>Pickup</span>
              <span className="shop-location-toggle">
                <input
                  type="checkbox"
                  role="switch"
                  checked={pickup}
                  aria-label="Enable pickup"
                  onChange={(event) => setPickup(event.target.checked)}
                />
                <span aria-hidden="true" />
              </span>
            </label>
            <label>
              <span>Delivery</span>
              <span className="shop-location-toggle">
                <input
                  type="checkbox"
                  role="switch"
                  checked={delivery}
                  aria-label="Enable delivery"
                  onChange={(event) => setDelivery(event.target.checked)}
                />
                <span aria-hidden="true" />
              </span>
            </label>
          </div>
          <button
            type="button"
            className="place-detail-add mt-4 w-full"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save location info"}
          </button>
        </LiquidCard>
      </div>
      <LiquidCard className="shop-location-schedule rounded-[24px] p-4">
        <div className="shop-location-schedule-heading">
          <div>
            <span className="kpi-label">Operational calendar</span>
            <h3>Closures and special days</h3>
            <p>
              Schedule holidays, maintenance, fires, or temporary closures.
              These override regular hours.
            </p>
          </div>
          <span
            className={`shop-location-availability shop-location-availability-${operationalStatus}`}
          >
            {operationalStatus === "closed"
              ? "Closed now"
              : operationalStatus === "disabled"
                ? "Disabled"
                : "Open now"}
          </span>
        </div>
        <div className="shop-location-schedule-form">
          <select
            className="admin-form-input"
            value={scheduleKind}
            onChange={(event) =>
              setScheduleKind(event.target.value as BranchScheduleKind)
            }
            aria-label="Schedule type"
          >
            <option value="closure">Temporary closure</option>
            <option value="holiday">Holiday</option>
            <option value="fire">Fire or emergency</option>
            <option value="maintenance">Maintenance</option>
            <option value="event">Special event</option>
            <option value="other">Other</option>
          </select>
          <input
            className="admin-form-input"
            value={scheduleTitle}
            onChange={(event) => setScheduleTitle(event.target.value)}
            placeholder="Reason or title"
          />
          <input
            className="admin-form-input"
            type="date"
            value={scheduleStart}
            onChange={(event) => setScheduleStart(event.target.value)}
            aria-label="Start date"
          />
          <input
            className="admin-form-input"
            type="date"
            value={scheduleEnd}
            onChange={(event) => setScheduleEnd(event.target.value)}
            aria-label="End date"
          />
          <input
            className="admin-form-input"
            value={scheduleNotes}
            onChange={(event) => setScheduleNotes(event.target.value)}
            placeholder="Notes for customers (optional)"
          />
          <button
            type="button"
            className="place-detail-add"
            disabled={
              scheduleSaving ||
              !scheduleTitle.trim() ||
              !scheduleStart ||
              !scheduleEnd
            }
            onClick={() => void addSchedule()}
          >
            {scheduleSaving ? "Adding…" : "Add closure"}
          </button>
        </div>
        <div className="shop-location-schedule-list">
          {schedules.length === 0 ? (
            <p className="place-detail-empty">No upcoming closure schedules.</p>
          ) : (
            schedules.map((schedule) => (
              <div className="shop-location-schedule-row" key={schedule.id}>
                <div>
                  <strong>{schedule.title}</strong>
                  <span>
                    {schedule.kind} · {scheduleDate(schedule.starts_at)} –{" "}
                    {scheduleDate(schedule.ends_at, true)}
                  </span>
                  {schedule.notes && <small>{schedule.notes}</small>}
                </div>
                <button
                  type="button"
                  className="shop-location-schedule-remove"
                  onClick={() => void removeSchedule(schedule.id)}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </LiquidCard>
    </section>
  );
}
