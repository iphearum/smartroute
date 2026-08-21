"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/shared/ui/icon";

export type AdminNavigationItem = {
  key: string;
  label: string;
  icon: IconName;
  href?: string;
  onSelect?: () => void;
};

type AdminShellProps = {
  navigation: readonly AdminNavigationItem[];
  activeKey: string;
  brand: React.ReactNode;
  brandHref?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  notice?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AppShellFooter() {
  return (
    <footer className="app-shell-footer">
      <span className="app-shell-footer-brand">
        <span className="app-shell-footer-mark" aria-hidden="true">
          <Icon name="spark" />
        </span>
        <span>PsarAI Platform</span>
      </span>
      <span className="app-shell-footer-note">Shop owner console</span>
      <Link href="/" className="app-shell-footer-link">
        Open map <Icon name="chevron-left" className="h-3.5 w-3.5 rotate-180" />
      </Link>
    </footer>
  );
}

function NavigationItem({
  item,
  activeKey,
  mobile = false,
  dock = false,
}: {
  item: AdminNavigationItem;
  activeKey: string;
  mobile?: boolean;
  dock?: boolean;
}) {
  const className = `${
    dock
      ? "liquid-switch-item admin-dock-item"
      : mobile
        ? "shop-shell-bottomnav-item"
        : "shop-shell-nav-item"
  } ${activeKey === item.key ? "active" : ""}`;
  const content = (
    <>
      <Icon name={item.icon} className="h-5 w-5" />
      <span>{item.label}</span>
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        aria-current={activeKey === item.key ? "page" : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={item.onSelect}
      aria-current={activeKey === item.key ? "page" : undefined}
      className={className}
    >
      {content}
    </button>
  );
}

/**
 * Shared admin chrome. Consumers provide navigation and the content slot;
 * page-specific business logic stays outside this presentation boundary.
 */
export function AdminShell({
  navigation,
  activeKey,
  brand,
  brandHref = "/",
  title,
  subtitle,
  backHref,
  backLabel,
  notice,
  children,
  footer = <AppShellFooter />,
}: AdminShellProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleNavigation = normalizedQuery
    ? navigation.filter((item) =>
        item.label.toLowerCase().includes(normalizedQuery),
      )
    : navigation;

  return (
    <div className="shop-shell">
      <aside className="shop-shell-sidebar">
        {backHref ? (
          <Link
            href={backHref}
            className="shop-shell-back"
            aria-label={backLabel}
          >
            <Icon name="chevron-left" className="h-4 w-4" />
            <span className="shop-shell-back-label">{backLabel}</span>
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="shop-shell-back"
            aria-label="PsarAI home"
          >
            {brand}
          </Link>
        )}
        <nav className="shop-shell-nav" aria-label="Admin sections">
          {navigation.map((item) => (
            <NavigationItem key={item.key} item={item} activeKey={activeKey} />
          ))}
        </nav>
      </aside>

      <div className="shop-shell-main">
        <header className="shop-shell-topbar">
          <Link
            href={brandHref}
            className="shop-shell-brand-link"
            aria-label="Go to home"
          >
            {brand}
          </Link>
          <nav
            className="desktop-rail liquid-card liquid-dock shop-shell-topnav"
            aria-label="Admin sections"
          >
            {visibleNavigation.map((item) => (
              <NavigationItem
                key={item.key}
                item={item}
                activeKey={activeKey}
                dock
              />
            ))}
          </nav>
          <span className="shop-shell-context">
            <strong className="block truncate text-sm">{title}</strong>
            {subtitle && (
              <span className="block truncate text-[11px]">{subtitle}</span>
            )}
          </span>
          <span className="shop-shell-tools">
            <span className="shop-shell-search">
              <Icon name="search" className="h-4 w-4" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="shop-shell-search-input"
                placeholder="Search admin sections"
                aria-label="Search admin sections"
              />
            </span>
            <Link
              href="/profile"
              className="shop-shell-avatar"
              aria-label="Open profile"
            >
              <Icon name="user" className="h-4 w-4" />
            </Link>
          </span>
        </header>

        {notice && <div className="shop-shell-flag">{notice}</div>}

        <main className="shop-shell-content">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
          {footer}
        </main>
      </div>

      <nav className="shop-shell-bottomnav" aria-label="Admin sections">
        {navigation.map((item) => (
          <NavigationItem
            key={item.key}
            item={item}
            activeKey={activeKey}
            mobile
          />
        ))}
      </nav>
    </div>
  );
}
