"use client";

import { useCallback, useRef, useState } from "react";
import { useWindowSession } from "./use-window-session";

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type Geometry = { x: number; y: number; width: number; height: number };
type Gesture = Geometry & {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  direction: ResizeDirection | null;
};

const EDGE = 12;

/**
 * Elements that own their own pointer behavior. A drag region may cover them
 * (a title bar holds buttons), so a gesture starting on one is left alone.
 */
const INTERACTIVE =
  'button, a, input, select, textarea, [role="button"], [contenteditable="true"]';

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Drag, resize and stacking for a floating window.
 *
 * Geometry is always committed as layout values (`left`/`top`/`width`/
 * `height`), never as a transform, so the committed value and the painted
 * position cannot disagree. Live gesture values stay in component state and
 * are written to the persisted session only when the pointer is released.
 */
export function useWindowFrame(
  id: string,
  {
    minWidth = 300,
    minHeight = 220,
    locked = false,
  }: { minWidth?: number; minHeight?: number; locked?: boolean } = {},
) {
  const windowRef = useRef<HTMLElement>(null),
    gestureRef = useRef<Gesture | null>(null),
    liveRef = useRef<Geometry | null>(null);
  const [live, setLive] = useState<Geometry | null>(null);
  const { entry, update, setOpen, bringToFront, zIndex, focused } =
    useWindowSession(id);

  const begin = useCallback(
    (direction: ResizeDirection | null) =>
      (event: React.PointerEvent<HTMLElement>) => {
        const element = windowRef.current;
        if (locked || !element || event.button !== 0) return;
        if (
          !direction &&
          (event.target as HTMLElement | null)?.closest?.(INTERACTIVE)
        )
          return;
        event.preventDefault();
        bringToFront();
        // offsetLeft/offsetTop are layout values: unlike getBoundingClientRect
        // they ignore an entrance transform that is still running.
        const geometry = {
          x: element.offsetLeft,
          y: element.offsetTop,
          width: element.offsetWidth,
          height: element.offsetHeight,
        };
        gestureRef.current = {
          ...geometry,
          pointerId: event.pointerId,
          pointerX: event.clientX,
          pointerY: event.clientY,
          direction,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        liveRef.current = geometry;
        setLive(geometry);
      },
    [bringToFront, locked],
  );

  const move = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - gesture.pointerX,
        deltaY = event.clientY - gesture.pointerY,
        viewportWidth = window.innerWidth,
        viewportHeight = window.innerHeight;
      let { x, y, width, height } = gesture;

      if (!gesture.direction) {
        x = clamp(gesture.x + deltaX, EDGE, viewportWidth - width - EDGE);
        y = clamp(gesture.y + deltaY, EDGE, viewportHeight - height - EDGE);
      } else {
        const { direction } = gesture;
        if (direction.includes("e"))
          width = clamp(
            gesture.width + deltaX,
            minWidth,
            viewportWidth - gesture.x - EDGE,
          );
        if (direction.includes("w")) {
          width = clamp(
            gesture.width - deltaX,
            minWidth,
            gesture.x + gesture.width - EDGE,
          );
          x = gesture.x + gesture.width - width;
        }
        if (direction.includes("s"))
          height = clamp(
            gesture.height + deltaY,
            minHeight,
            viewportHeight - gesture.y - EDGE,
          );
        if (direction.includes("n")) {
          height = clamp(
            gesture.height - deltaY,
            minHeight,
            gesture.y + gesture.height - EDGE,
          );
          y = gesture.y + gesture.height - height;
        }
      }

      const geometry = { x, y, width, height };
      liveRef.current = geometry;
      setLive(geometry);
    },
    [minHeight, minWidth],
  );

  const finish = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const element = event.currentTarget,
        geometry = liveRef.current ?? gesture;
      gestureRef.current = null;
      liveRef.current = null;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      update({
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
      });
      setLive(null);
    },
    [update],
  );

  const gestureProps = (direction: ResizeDirection | null) => ({
    onPointerDown: begin(direction),
    onPointerMove: move,
    onPointerUp: finish,
    onPointerCancel: finish,
  });

  const restored: Geometry = live ?? entry;
  const sized = restored.width > 0 && restored.height > 0;
  // A stored size can predate a raised minWidth/minHeight (or come from a
  // resize gesture that only clamps live values, never the persisted one).
  // Clamping restored sizes here keeps a window's content from spilling past
  // its own rounded corners after a reload, without needing every reader of
  // the session record to re-derive this floor itself.
  const geometry: Geometry = sized
    ? {
        ...restored,
        width: Math.max(restored.width, minWidth),
        height: Math.max(restored.height, minHeight),
      }
    : restored;
  const placed = geometry.x !== 0 || geometry.y !== 0;

  return {
    windowRef,
    entry,
    zIndex,
    focused,
    dragging: live !== null && gestureRef.current?.direction === null,
    geometry,
    placed,
    sized,
    /** Inline geometry for a free floating window, or `undefined` when it still sits where CSS put it. */
    frameStyle:
      placed || sized
        ? {
            ...(placed
              ? { left: geometry.x, top: geometry.y, right: "auto" }
              : {}),
            ...(sized
              ? { width: geometry.width, height: geometry.height }
              : {}),
          }
        : undefined,
    dragHandleProps: gestureProps(null),
    resizeHandleProps: (direction: ResizeDirection) => gestureProps(direction),
    update,
    setOpen,
    bringToFront,
  };
}
