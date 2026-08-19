import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from "react";

const join = (...values: Array<string | undefined>) =>
  values.filter(Boolean).join(" ");

export const MapControlGroup = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { label: string }
>(function MapControlGroup({ label, className, children, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={join("map-control-group liquid-card", className)}
      role="group"
      aria-label={label}
      {...props}
    >
      {children}
    </div>
  );
});

export function MapControlButton({
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} {...props} />;
}
