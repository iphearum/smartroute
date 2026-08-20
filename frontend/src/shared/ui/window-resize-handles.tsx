"use client";

import type { ResizeDirection } from "@/shared/hooks/use-window-frame";

const directions: ResizeDirection[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];

/**
 * Eight pointer targets around the window: four edges and four corners, so a
 * window can be resized from any side instead of only the bottom-right grip.
 */
export function WindowResizeHandles({
  handleProps,
  hidden = false,
}: {
  handleProps: (
    direction: ResizeDirection,
  ) => React.HTMLAttributes<HTMLDivElement>;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <>
      {directions.map((direction) => (
        <div
          key={direction}
          className={`liquid-window-resize liquid-window-resize-${direction}`}
          data-direction={direction}
          aria-hidden="true"
          {...handleProps(direction)}
        />
      ))}
    </>
  );
}
