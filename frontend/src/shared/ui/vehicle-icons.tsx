import type { SVGProps } from "react";

type VehicleIconProps = SVGProps<SVGSVGElement>;

const sharedProps = {
  viewBox: "0 0 72 42",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true,
  focusable: false,
} as const;

export function CarIcon(props: VehicleIconProps) {
  return (
    <svg {...sharedProps} {...props}>
      <path
        fill="currentColor"
        d="M8 27.5v-6.2c0-2.5 1.7-4.6 4.1-5.2l7.2-1.7 5.1-8.1A6 6 0 0 1 29.5 3h17.1a6 6 0 0 1 5.1 3.1l5 8.7 6.7 1.8a5 5 0 0 1 3.7 4.8v6.1h-5a8.5 8.5 0 0 0-16.7 0H26.6a8.5 8.5 0 0 0-16.7 0H8Zm17-13.8h27.2l-3.5-6.1a2.5 2.5 0 0 0-2.2-1.3H29.7c-.9 0-1.7.4-2.2 1.2L25 13.7Z"
      />
      <circle
        cx="18.2"
        cy="28.5"
        r="7"
        stroke="currentColor"
        strokeWidth="4.5"
      />
      <circle
        cx="53.8"
        cy="28.5"
        r="7"
        stroke="currentColor"
        strokeWidth="4.5"
      />
      <path
        d="M11 20h6m38 0h10"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BikeIcon(props: VehicleIconProps) {
  return (
    <svg {...sharedProps} {...props}>
      <circle cx="14" cy="30" r="9" stroke="currentColor" strokeWidth="3.5" />
      <circle cx="58" cy="30" r="9" stroke="currentColor" strokeWidth="3.5" />
      <path
        d="M14 30 27 13l9 17H14ZM27 13h18L36 30m9-17 13 17M24 13h8m10-5h7m-5 0 2 6"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="30" r="3" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="m36 30 5 4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WalkIcon(props: VehicleIconProps) {
  return (
    <svg {...sharedProps} {...props}>
      <circle cx="39" cy="6" r="5" fill="currentColor" />
      <path
        d="m35 13-6 11 7 5-4 10h6l5-11-5-6 3-4 4 6 9 3 1.7-5-7.7-2.6-5.5-7.2L35 13Zm-1 15-7 10h-7l9-14 5 4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CombindIcon(props: VehicleIconProps) {
  return (
    <svg {...sharedProps} {...props}>
      <path
        d="M12 12h31l7 8h10M9 26h8m38 0h8M24 26h24"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="29" r="7" stroke="currentColor" strokeWidth="4" />
      <circle cx="54" cy="29" r="7" stroke="currentColor" strokeWidth="4" />
      <path
        d="m31 6 5-4 5 4m-5-4v18"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
