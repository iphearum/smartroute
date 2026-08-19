"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/shops", label: "Shops" },
  { href: "/profile", label: "Profile" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-4 flex gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-full px-4 py-2 text-xs font-bold ${
            pathname === link.href
              ? "bg-emerald-700 text-white"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
