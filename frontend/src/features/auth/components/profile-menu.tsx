"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LiquidCard } from "@/shared/ui/liquid";
import { MapControlButton, MapControlGroup } from "@/shared/ui/map-controls";
import { Icon } from "@/shared/ui/icon";
import { LanguageSwitcher } from "@/features/i18n/components/language-switcher";
import { useAuthStore } from "../store/auth-store";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function ProfileMenu() {
  const [open, setOpen] = useState(false),
    groupRef = useRef<HTMLDivElement>(null),
    popoverRef = useRef<HTMLDivElement>(null),
    status = useAuthStore((s) => s.status),
    user = useAuthStore((s) => s.user),
    logout = useAuthStore((s) => s.logout),
    router = useRouter();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !groupRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      )
        setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (status === "idle" || status === "loading")
    return (
      <div className="map-profile-control">
        <MapControlGroup label="Account" className="opacity-60">
          <MapControlButton disabled aria-label="Loading account">
            <Icon name="user" />
          </MapControlButton>
        </MapControlGroup>
      </div>
    );

  if (status !== "authenticated" || !user)
    return (
      <div className="map-profile-control">
        <MapControlGroup label="Account">
          <Link href="/login" aria-label="Log in">
            <Icon name="user" />
          </Link>
        </MapControlGroup>
      </div>
    );

  const label = user.displayName || user.email;

  return (
    <div className="map-profile-control" ref={groupRef}>
      <MapControlGroup label="Account">
        <MapControlButton
          onClick={() => setOpen((value) => !value)}
          aria-label="Account menu"
          aria-expanded={open}
          className={open ? "active" : undefined}
        >
          <span className="text-[11px] font-extrabold">{initials(label)}</span>
        </MapControlButton>
      </MapControlGroup>
      {open && (
        <LiquidCard
          ref={popoverRef}
          variant="popover"
          className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-[20px] p-2"
        >
          <p className="truncate px-3 pb-2 pt-1 text-xs font-semibold text-slate-500">
            {label}
          </p>
          <LanguageSwitcher />
          {[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/shops", label: "Shops" },
            { href: "/profile", label: "Profile" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-[14px] px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {item.label}
            </Link>
          ))}
          <button
            onClick={async () => {
              setOpen(false);
              await logout();
              router.push("/");
            }}
            className="mt-1 block w-full rounded-[14px] px-3 py-2 text-left text-sm font-semibold text-slate-500 hover:bg-slate-100"
          >
            Log out
          </button>
        </LiquidCard>
      )}
    </div>
  );
}
