import type { SVGProps } from "react";

/** Compact cruiser-style motorcycle silhouette designed for small map labels. */
export function MotorbikeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 72 42"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="14" cy="30" r="10" stroke="currentColor" strokeWidth="5" />
      <circle cx="58" cy="30" r="10" stroke="currentColor" strokeWidth="5" />
      <circle cx="14" cy="30" r="2.5" fill="currentColor" />
      <circle cx="58" cy="30" r="2.5" fill="currentColor" />
      <path
        fill="currentColor"
        d="M24.5 8.3 29 4.5h5.8l.9 2.7h-5.1l-3.4 3 3.2 8.4h11.4l5.6-5.2h9.1l1.4 3.8h-8.8l-4.4 4.1 8.2 5.1-2.7 4.3-13.4-8.2H28l-7.3 9.8-4-2.9 8.5-11.5-3.1-8.2 2.4-1.4Z"
      />
      <path
        fill="currentColor"
        d="M29.2 10.7c1.7-3.1 4.8-5 8.4-5 5.4 0 10.1 3.3 12 8.1H32.4c-2.5 0-4.2-1.1-3.2-3.1ZM22.4 9.5l-2.3-5.2 1.8-.8 2.2 4.7 5-3.5 1.1 1.6-7.8 5.5V9.5ZM19.3 2.4a2.4 2.4 0 1 1 4.8 0 2.4 2.4 0 0 1-4.8 0ZM37.8 23h8.8l-4 7H30.1c-2.4 0-3.1-2.8-1.3-4.2l4.7-3.7 4.3.9Z"
      />
      <path
        d="m25.8 19.2-7.4 10.9M45 21.5l13 8.5M31 30h20"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
