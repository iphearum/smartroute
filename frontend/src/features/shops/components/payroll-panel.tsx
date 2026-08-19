"use client";
import { useState } from "react";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard } from "@/shared/ui/liquid";
import { mockStaff } from "../domain/mock-dashboard-data";

export function PayrollPanel() {
  const [paid, setPaid] = useState(false);
  const totalPayroll = mockStaff.reduce(
    (sum, staff) => sum + staff.hourlyRate * staff.hoursThisWeek,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="kpi-grid kpi-grid-3">
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Staff on payroll</span>
          <strong className="kpi-value">{mockStaff.length}</strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Hours this week</span>
          <strong className="kpi-value">
            {mockStaff.reduce((sum, staff) => sum + staff.hoursThisWeek, 0)}
          </strong>
        </LiquidCard>
        <LiquidCard className="kpi-card rounded-[20px] p-4">
          <span className="kpi-label">Payroll total</span>
          <strong className="kpi-value">${totalPayroll.toFixed(2)}</strong>
        </LiquidCard>
      </div>

      <LiquidCard className="rounded-[24px] p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <strong className="text-sm">Staff this week</strong>
          <button className="shop-add-action">＋ Add staff</button>
        </div>
        <div className="payroll-table">
          <div className="payroll-row payroll-header">
            <span>Name</span>
            <span>Role</span>
            <span>Rate</span>
            <span>Hours</span>
            <span>Pay</span>
          </div>
          {mockStaff.map((staff) => (
            <div className="payroll-row" key={staff.id}>
              <span className="payroll-name">
                <span
                  className={`payroll-status-dot ${staff.clockedIn ? "on" : ""}`}
                  aria-hidden="true"
                />
                {staff.name}
              </span>
              <span className="stock-category">{staff.role}</span>
              <span>${staff.hourlyRate.toFixed(2)}/hr</span>
              <span>{staff.hoursThisWeek}h</span>
              <span className="shop-item-price">
                ${(staff.hourlyRate * staff.hoursThisWeek).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <button
          className="place-detail-add"
          onClick={() => setPaid(true)}
          disabled={paid}
        >
          {paid ? "Payroll run recorded" : `Run payroll · $${totalPayroll.toFixed(2)}`}
        </button>
        {paid && (
          <p className="pos-placed-flag">
            <Icon name="star" className="h-3.5 w-3.5" />
            Payroll marked as paid (demo only)
          </p>
        )}
      </LiquidCard>
    </div>
  );
}
