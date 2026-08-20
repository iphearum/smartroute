"use client";

import { useEffect, useState } from "react";
import { commerceApi } from "../api/commerce-api";
import type { StaffMember } from "../domain/commerce-types";
import { useMyBusiness } from "../hooks/use-my-business";
import { NoBusinessPrompt } from "./no-business-prompt";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { SkeletonRows } from "@/shared/ui/skeleton";
import { toast } from "@/shared/ui/toast";

export function PayrollPanel() {
  const { business, status } = useMyBusiness();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [paid, setPaid] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("Staff");
  const [rate, setRate] = useState("0");
  const [hours, setHours] = useState("0");

  const load = () =>
    business
      ? commerceApi
          .listStaff(business.id)
          .then(setStaff)
          .catch(() => toast.error("Could not load staff"))
      : Promise.resolve();
  useEffect(() => {
    void load();
  }, [business]);
  const totalHours = staff.reduce(
    (sum, member) => sum + member.hours_this_week,
    0,
  );
  const totalPayroll = staff.reduce(
    (sum, member) => sum + member.hourly_rate * member.hours_this_week,
    0,
  );
  const addStaff = async () => {
    if (!business || !name.trim()) return;
    setAdding(true);
    try {
      await commerceApi.createStaff(business.id, {
        name: name.trim(),
        role,
        hourly_rate: Number(rate),
        hours_this_week: Number(hours),
        clocked_in: false,
      });
      setName("");
      setRole("Staff");
      setRate("0");
      setHours("0");
      await load();
      toast.success("Staff member added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add staff",
      );
    } finally {
      setAdding(false);
    }
  };
  const runPayroll = async () => {
    if (!business || !staff.length) return;
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    try {
      await commerceApi.runPayroll(business.id, {
        period_start: start.toISOString().slice(0, 10),
        period_end: end.toISOString().slice(0, 10),
      });
      setPaid(true);
      toast.success("Payroll run recorded");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not run payroll",
      );
    }
  };

  if (status === "loading")
    return (
      <LiquidCard className="rounded-[24px] p-4">
        <SkeletonRows rows={5} />
      </LiquidCard>
    );
  if (!business) return <NoBusinessPrompt />;
  return (
    <div className="flex flex-col gap-4">
      <div className="kpi-grid kpi-grid-3">
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Staff on payroll</span>
          <strong className="kpi-value">{staff.length}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Hours this week</span>
          <strong className="kpi-value">{totalHours}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Payroll total</span>
          <strong className="kpi-value">${totalPayroll.toFixed(2)}</strong>
        </LiquidCard>
      </div>
      <LiquidCard className="rounded-[24px] p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <strong className="text-sm">Staff this week</strong>
          <button
            className="shop-add-action"
            onClick={() => setShowAdd((value) => !value)}
          >
            ＋ Add staff
          </button>
        </div>
        {showAdd && (
          <div className="mb-4 grid gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-4">
            <input
              className="admin-form-input"
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <input
              className="admin-form-input"
              placeholder="Role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            />
            <input
              className="admin-form-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Hourly rate"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
            <input
              className="admin-form-input"
              type="number"
              min="0"
              step="0.25"
              placeholder="Hours"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
            <button
              className="place-detail-add sm:col-span-4"
              disabled={adding || !name.trim()}
              onClick={() => void addStaff()}
            >
              {adding ? "Saving…" : "Add staff"}
            </button>
          </div>
        )}
        {staff.length ? (
          <div className="payroll-table">
            <div className="payroll-row payroll-header">
              <span>Name</span>
              <span>Role</span>
              <span>Rate</span>
              <span>Hours</span>
              <span>Pay</span>
            </div>
            {staff.map((member) => (
              <div className="payroll-row" key={member.id}>
                <span className="payroll-name">
                  <span
                    className={`payroll-status-dot ${member.clocked_in ? "on" : ""}`}
                    aria-hidden="true"
                  />
                  {member.name}
                </span>
                <span className="stock-category">{member.role}</span>
                <span>${member.hourly_rate.toFixed(2)}/hr</span>
                <span>{member.hours_this_week}h</span>
                <span className="shop-item-price">
                  ${(member.hourly_rate * member.hours_this_week).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="place-detail-empty px-1">No staff members yet.</p>
        )}
        <button
          className="place-detail-add"
          onClick={() => void runPayroll()}
          disabled={paid || !staff.length}
        >
          {paid
            ? "Payroll run recorded"
            : `Run payroll · $${totalPayroll.toFixed(2)}`}
        </button>
        {paid && (
          <p className="pos-placed-flag">
            <Icon name="star" className="h-3.5 w-3.5" /> Payroll marked as paid
          </p>
        )}
      </LiquidCard>
    </div>
  );
}
