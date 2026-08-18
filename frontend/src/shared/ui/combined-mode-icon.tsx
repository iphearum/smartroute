import type { SVGProps } from "react";

/** Compact car-to-motorbike transfer symbol for multimodal route controls. */
export function CombinedModeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 72 42"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M3.5 25.5h27l-2.6-8.3a4 4 0 0 0-3.8-2.8H13.5a4 4 0 0 0-3.4 1.9L5 24"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="10"
        cy="28.5"
        r="4.5"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <circle
        cx="25"
        cy="28.5"
        r="4.5"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <path
        d="M33 10h10m-3.5-3.5L43 10l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="49"
        cy="28.5"
        r="5.5"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <circle
        cx="66"
        cy="28.5"
        r="5.5"
        stroke="currentColor"
        strokeWidth="3.5"
      />
      <path
        d="m49 28.5 7-10 5 10H49Zm7-10h7l3 10m-12-14h6m2-4h5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
