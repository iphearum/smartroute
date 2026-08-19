"use client";

import {
  forwardRef,
  useEffect,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";

const join = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

type LiquidCardVariant = "surface" | "popover" | "pill";

export const LiquidCard = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { variant?: LiquidCardVariant }
>(function LiquidCard({ variant = "surface", className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={join(
        "liquid-card",
        variant === "popover" && "liquid-popover",
        variant === "pill" && "liquid-pill",
        className,
      )}
      {...props}
    />
  );
});

export interface LiquidSwitchItem<Value extends string> {
  value: Value;
  label: string;
  icon?: ReactNode;
}

export function LiquidSwitch<Value extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: readonly LiquidSwitchItem<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      className={join("liquid-switch", className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={join("liquid-switch-item", active && "active")}
          >
            {item.icon && (
              <span className="liquid-switch-icon">{item.icon}</span>
            )}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type SheetSnap = "half" | "full";

export function DraggableLiquidSheet({
  open,
  onClose,
  children,
  className,
  ariaLabel = "Details",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const [snap, setSnap] = useState<SheetSnap>("half"),
    [mobile, setMobile] = useState(false),
    [viewportHeight, setViewportHeight] = useState(800),
    dragControls = useDragControls(),
    reducedMotion = useReducedMotion();

  useEffect(() => {
    if (open) setSnap("half");
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)"),
      updateViewport = () => {
        setMobile(query.matches);
        setViewportHeight(window.innerHeight);
      };
    updateViewport();
    query.addEventListener("change", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      query.removeEventListener("change", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  const halfOffset = viewportHeight * 0.36,
    finishDrag = (
      _event: MouseEvent | TouchEvent | PointerEvent,
      info: PanInfo,
    ) => {
      const finalOffset = (snap === "full" ? 0 : halfOffset) + info.offset.y;
      if (finalOffset > viewportHeight * 0.68 || info.velocity.y > 900)
        onClose();
      else setSnap(finalOffset < viewportHeight * 0.2 ? "full" : "half");
    },
    transition = reducedMotion
      ? { duration: 0.01 }
      : { type: "spring" as const, stiffness: 360, damping: 38, mass: 0.85 };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="draggable-liquid-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.01 : 0.22 }}
            onClick={onClose}
            aria-label={`Close ${ariaLabel.toLowerCase()}`}
          />
          <motion.div
            className={join(
              "liquid-card liquid-popover draggable-liquid-sheet",
              className,
            )}
            initial={{ opacity: 0, y: mobile ? viewportHeight : -14 }}
            animate={{
              opacity: 1,
              y: mobile && snap === "half" ? halfOffset : 0,
            }}
            exit={{ opacity: 0, y: mobile ? viewportHeight : -14 }}
            transition={transition}
            drag={mobile ? "y" : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{
              top: snap === "half" ? -halfOffset : 0,
              bottom: viewportHeight * 0.4,
            }}
            dragElastic={0.06}
            dragMomentum={false}
            onDragEnd={finishDrag}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
          >
            <div
              className="draggable-liquid-handle"
              role="button"
              tabIndex={0}
              aria-label={`${snap === "full" ? "Collapse" : "Expand"} ${ariaLabel.toLowerCase()}`}
              onPointerDown={(event) => mobile && dragControls.start(event)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") setSnap("full");
                if (event.key === "ArrowDown") setSnap("half");
                if (event.key === "Enter" || event.key === " ")
                  setSnap((current) => (current === "full" ? "half" : "full"));
              }}
            >
              <span />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
