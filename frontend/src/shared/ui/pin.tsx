import { useId, type SVGProps } from "react";

export type PinVariant = "address" | "location" | "pin-location";

export interface PinProps extends SVGProps<SVGSVGElement> {
  /** Selects one of the source designs from `public/icons`. */
  variant?: PinVariant;
  /** Main marker color. Accepts CSS colors, including `currentColor`. */
  color?: string;
  /** Color of the oval shadow beneath the marker. */
  shadowColor?: string;
  /** Opacity of the oval shadow, from 0 to 1. */
  shadowOpacity?: number;
  /** Sets width and height unless either is supplied directly. */
  size?: number | string;
  /** Accessible name. Omit it when the pin is purely decorative. */
  title?: string;
  /** Hides the shadow or platform while retaining the marker. */
  showShadow?: boolean;
}

const designs: Record<
  PinVariant,
  { viewBox: string; base?: string; marker: string }
> = {
  address: {
    viewBox: "0 0 105.67 116.43",
    base: "M84.32 80.09c13 3.68 21.35 9.56 21.35 16.19 0 11.13-23.65 20.15-52.83 20.15S0 107.41 0 96.28c0-6.79 8.79-12.79 22.27-16.44l1.48 2c1 1.37 2.13 2.73 3.26 4.06-9.43 2.28-15.47 5.8-15.47 9.75 0 6.88 18.29 12.46 40.86 12.46s40.86-5.58 40.86-12.46c0-3.67-5.24-7-13.56-9.26 1.64-2 3.18-4.14 4.62-6.3Z",
    marker:
      "M70.19 82.78a69.18 69.18 0 0 1-15.11 12.51 2.14 2.14 0 0 1-2.43.07 85 85 0 0 1-21-18.76C24 67 19.13 56.34 17.48 46.07s-.11-20.42 5.07-28.56a35 35 0 0 1 7.83-8.68C37.68 3 46-.06 54.34 0a34.89 34.89 0 0 1 28.81 16.68c5.57 9.17 6.77 20.87 4.33 32.72a71.93 71.93 0 0 1-17.29 33.35v.03ZM52.76 18.51a17.88 17.88 0 1 1-17.88 17.87 17.87 17.87 0 0 1 17.88-17.87Z",
  },
  location: {
    viewBox: "0 0 122.88 115.23",
    base: "M25.32 75.31a3.59 3.59 0 1 1 0 7.18h-6.74L9.7 108.07h103.23l-9.64-25.58h-5.57a3.59 3.59 0 0 1 0-7.18h10.7l14.46 39.92H0l13.32-39.92Z",
    marker:
      "M79.06 83.64a70.16 70.16 0 0 1-15.28 12.64 2.15 2.15 0 0 1-2.45.08 86.21 86.21 0 0 1-21.25-19C32.34 67.69 27.46 56.92 25.8 46.55s-.11-20.63 5.12-28.86a35.35 35.35 0 0 1 7.91-8.76C46.21 3.05 54.64-.06 63 0a34.1 34.1 0 0 1 23 9.38 33.87 33.87 0 0 1 6.13 7.47c5.63 9.27 6.84 21.09 4.37 33.07a72.84 72.84 0 0 1-17.46 33.7v.02ZM61.44 18.7a18.06 18.06 0 1 1-18.06 18.06A18.06 18.06 0 0 1 61.44 18.7Z",
  },
  "pin-location": {
    viewBox: "0 0 92.25 122.88",
    marker:
      "M49.1 122.34a2.75 2.75 0 0 1-3.12.1A109.7 109.7 0 0 1 19 98.35C9.15 86 3 72.33.83 59.16-1.33 45.79.69 32.94 7.34 22.49a45.14 45.14 0 0 1 10.05-11.14C26.77 3.87 37.49-.08 48.16 0c10.29.08 20.43 3.92 29.2 11.91a43 43 0 0 1 7.79 9.49c7.15 11.77 8.69 26.8 5.55 42a92.52 92.52 0 0 1-41.6 58.92Zm-3-98.58a23 23 0 1 1-22.94 23 23 23 0 0 1 22.97-23Z",
  },
};

export function Pin({
  variant = "address",
  color = "#ef4136",
  shadowColor = "#2b2b2b",
  shadowOpacity = 1,
  size = 32,
  title,
  showShadow = true,
  width,
  height,
  ...props
}: PinProps) {
  const titleId = useId();
  const design = designs[variant];
  const accessible = Boolean(
    title || props["aria-label"] || props["aria-labelledby"],
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={design.viewBox}
      width={width ?? size}
      height={height ?? size}
      role={accessible ? "img" : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-hidden={accessible ? undefined : true}
      focusable="false"
      {...props}
    >
      {title && <title id={titleId}>{title}</title>}
      {showShadow && design.base && (
        <path
          fill={shadowColor}
          fillOpacity={shadowOpacity}
          fillRule="evenodd"
          d={design.base}
        />
      )}
      <path fill={color} fillRule="evenodd" d={design.marker} />
    </svg>
  );
}

export function AddressPin(props: Omit<PinProps, "variant">) {
  return <Pin variant="address" {...props} />;
}

export function LocationPin(props: Omit<PinProps, "variant">) {
  return <Pin variant="location" {...props} />;
}

export function PinLocation(props: Omit<PinProps, "variant">) {
  return <Pin variant="pin-location" {...props} />;
}
