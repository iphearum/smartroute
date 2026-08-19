import type { SVGProps } from "react";

export type IconName =
  | "brand"
  | "home"
  | "locate"
  | "database"
  | "bookmark"
  | "help"
  | "search"
  | "directions"
  | "car"
  | "motorbike"
  | "bike"
  | "walk"
  | "close"
  | "phone"
  | "globe"
  | "clock"
  | "pin"
  | "heart"
  | "edit"
  | "star"
  | "grid"
  | "box"
  | "wallet"
  | "register"
  | "info"
  | "alert"
  | "trending"
  | "menu"
  | "chevron-left";
const paths: Record<IconName, React.ReactNode> = {
  brand: (
    <>
      <path d="M8 25V10a4 4 0 0 1 8 0v12a4 4 0 0 0 8 0V7" />
      <circle cx="8" cy="25" r="3" fill="currentColor" />
      <circle cx="24" cy="7" r="3" />
    </>
  ),
  home: <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  locate: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2" />
    </>
  ),
  database: (
    <>
      <path d="M4 7c0-2 3.6-3 8-3s8 1 8 3-3.6 3-8 3-8-1-8-3Z" />
      <path d="M4 7v5c0 2 3.6 3 8 3m8-8v5c0 1.3-1.5 2.2-3.7 2.7M4 12v5c0 2 3.6 3 8 3 1.1 0 2.1-.1 3-.2" />
    </>
  ),
  bookmark: <path d="M5 4h14v16l-7-4-7 4z" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.7 9a2.4 2.4 0 1 1 3.3 2.2c-.7.3-1 1-1 1.8m0 3h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  directions: (
    <>
      <path d="M12 3 3 12l9 9 9-9-9-9Z" />
      <path d="M8 14v-2a2 2 0 0 1 2-2h5m-2-2 2 2-2 2" />
    </>
  ),
  car: (
    <>
      <path d="m5 11 2-5h10l2 5M4 11h16v7H4z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </>
  ),
  motorbike: (
    <>
      <circle cx="5" cy="17" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="M8 17h4l3-6h3m-8 0 3 6M8 8h4" />
    </>
  ),
  bike: (
    <>
      <circle cx="5" cy="17" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="m5 17 4-8 4 8 3-6H9m3-4h3" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4" r="2" />
      <path d="m10 21 2-6-3-3 2-5 4 3 3 1m-3 10-3-6" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  phone: (
    <path d="M6.6 3h3l1.4 4.4-2.2 1.6a13 13 0 0 0 5.2 5.2l1.6-2.2 4.4 1.4v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3Z" />
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
  ),
  edit: (
    <path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Zm11-13 3 3" />
  ),
  star: (
    <path d="m12 3 2.6 5.6 6 .7-4.4 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.4-4.2 6-.7L12 3Z" />
  ),
  grid: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </>
  ),
  box: (
    <>
      <path d="M3 8 12 3l9 5-9 5-9-5Z" />
      <path d="M3 8v9l9 5 9-5V8M12 13v9" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M16 13h3v3h-3a1.5 1.5 0 0 1 0-3Z" />
    </>
  ),
  register: (
    <>
      <path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z" />
      <path d="M7 9V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3M9 13h6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-9.5h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 2.4 18a1.5 1.5 0 0 0 1.3 2.2h16.6a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z" />
      <path d="M12 9.5v4m0 3h.01" />
    </>
  ),
  trending: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  menu: (
    <path d="M4 6h16M4 12h16M4 18h16" />
  ),
  "chevron-left": <path d="m15 5-7 7 7 7" />,
};
export function Icon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox={name === "brand" ? "0 0 32 32" : "0 0 24 24"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
