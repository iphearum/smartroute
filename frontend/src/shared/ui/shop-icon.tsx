import type { SVGProps } from "react";

export function ShopIcon({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      className={className}
      viewBox="0 0 90 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={props["aria-label"] ? undefined : true}
    >
      <path d="M9 33.3V79.6c0 1.6 1.3 2.9 2.9 2.9h66.3c1.6 0 2.9-1.3 2.9-2.9V33.3H9Z" fill="#40596B" />
      <path d="M52.5 45.3h19v33.3h-19V45.3Z" fill="#D6E0EB" />
      <rect x="18.5" y="43.1" width="24.9" height="24.9" rx="2" fill="#D6E0EB" />
      <path d="M0 21.4h18v3.1a9 9 0 1 1-18 0v-3.1Z" fill="#E74E3A" />
      <path d="M18 21.4h18v3.1a9 9 0 1 1-18 0v-3.1Z" fill="#B0B6BC" />
      <path d="M36 21.4h18v3.1a9 9 0 1 1-18 0v-3.1Z" fill="#E74E3A" />
      <path d="M54 21.4h18v3.1a9 9 0 1 1-18 0v-3.1Z" fill="#B0B6BC" />
      <path d="M72 21.4h18v3.1a9 9 0 1 1-18 0v-3.1Z" fill="#E74E3A" />
      <path d="M18 21.4 23.2 7.6H36v13.8H18Z" fill="#D6E0EB" />
      <path d="M0 21.4 11.4 7.6h11.8L18 21.4H0Z" fill="#FF7058" />
      <path d="M54 21.4V7.6h12.8L72 21.4H54Z" fill="#D6E0EB" />
      <path d="M72 21.4 66.8 7.6h11.8L90 21.4H72Z" fill="#FF7058" />
      <path d="M36 21.4h18v3.1a9 9 0 1 1-18 0v-3.1Z" fill="#E74E3A" />
      <path d="M36 7.6h18v13.8H36V7.6Z" fill="#FF7058" />
    </svg>
  );
}

export default ShopIcon;
