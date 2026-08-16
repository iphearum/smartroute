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
  | "close";
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
