"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
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

type LiquidCardVariant = "surface" | "popover" | "pill" | "nested";

export const LiquidCard = forwardRef<
  HTMLElement,
  HTMLAttributes<HTMLElement> & {
    variant?: LiquidCardVariant;
    as?: "div" | "aside";
  }
>(function LiquidCard(
  { variant = "surface", as = "div", className, ...props },
  ref,
) {
  const Element = as;
  return (
    <Element
      ref={ref as Ref<HTMLDivElement>}
      className={join(
        "liquid-card",
        variant === "popover" && "liquid-popover",
        variant === "pill" && "liquid-pill",
        variant === "nested" && "liquid-nested",
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
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusItem = (index: number) => {
    const nextIndex = (index + items.length) % items.length;
    itemRefs.current[nextIndex]?.focus();
    onChange(items[nextIndex].value);
  };
  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(items.length - 1);
    }
  };
  return (
    <div
      className={join("liquid-switch", className)}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
    >
      {items.map((item, index) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
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

type SheetSnap = "peek" | "half" | "full";

export function DraggableLiquidSheet({
  open,
  onClose,
  children,
  className,
  overlayClassName,
  ariaLabel = "Details",
  role = "dialog",
  ariaLabelledBy,
  ariaDescribedBy,
  initialSnap = "half",
  drag,
  dragListener,
  sheetDragControls,
  dragConstraints,
  dragElastic,
  dragMomentum,
  onDragEnd,
  style,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  ariaLabel?: string;
  role?: "dialog" | "alertdialog";
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  initialSnap?: SheetSnap;
  drag?: boolean | "x" | "y";
  dragListener?: boolean;
  sheetDragControls?: ReturnType<typeof useDragControls>;
  dragConstraints?: React.ComponentProps<typeof motion.div>["dragConstraints"];
  dragElastic?: number;
  dragMomentum?: boolean;
  onDragEnd?: React.ComponentProps<typeof motion.div>["onDragEnd"];
  style?: React.ComponentProps<typeof motion.div>["style"];
}) {
  const [snap, setSnap] = useState<SheetSnap>(initialSnap),
    [mobile, setMobile] = useState(false),
    [viewportHeight, setViewportHeight] = useState(800),
    dragControls = useDragControls(),
    reducedMotion = useReducedMotion();

  useEffect(() => {
    if (open) setSnap(initialSnap);
  }, [initialSnap, open]);

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

  // The mobile sheet has three deliberate resting positions: a peek for
  // context, a half-open editing state, and a full directions state.
  const snapOffset =
      snap === "peek"
        ? viewportHeight * 0.42
        : snap === "half"
          ? viewportHeight * 0.18
          : 0,
    finishDrag = (
      _event: MouseEvent | TouchEvent | PointerEvent,
      info: PanInfo,
    ) => {
      const finalOffset = snapOffset + info.offset.y;
      if (finalOffset > viewportHeight * 0.68 || info.velocity.y > 900)
        onClose();
      else if (finalOffset < viewportHeight * 0.08) setSnap("full");
      else if (finalOffset < viewportHeight * 0.3) setSnap("half");
      else setSnap("peek");
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
            className={join("draggable-liquid-overlay", overlayClassName)}
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
              y: mobile ? snapOffset : 0,
            }}
            exit={{ opacity: 0, y: mobile ? viewportHeight : -14 }}
            transition={transition}
            drag={mobile ? "y" : (drag ?? false)}
            dragListener={dragListener ?? false}
            dragControls={sheetDragControls ?? dragControls}
            dragConstraints={
              mobile
                ? {
                    top: snap === "full" ? 0 : -snapOffset,
                    bottom: viewportHeight * 0.4,
                  }
                : (dragConstraints ?? {
                    top: snap === "full" ? 0 : -snapOffset,
                    bottom: viewportHeight * 0.4,
                  })
            }
            dragElastic={dragElastic ?? 0.06}
            dragMomentum={dragMomentum ?? false}
            onDragEnd={mobile ? finishDrag : (onDragEnd ?? finishDrag)}
            // Desktop window offsets are persisted in the session store. They
            // must not leak into the fixed mobile sheet, where they can move a
            // previously dragged desktop panel below the usable viewport.
            style={mobile ? undefined : style}
            role={role}
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
          >
            <div
              className="draggable-liquid-handle"
              role="button"
              tabIndex={0}
              aria-label={`${snap === "full" ? "Collapse" : snap === "half" ? "Expand" : "Open"} ${ariaLabel.toLowerCase()}`}
              onPointerDown={(event) => mobile && dragControls.start(event)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp")
                  setSnap((current) =>
                    current === "peek"
                      ? "half"
                      : current === "half"
                        ? "full"
                        : "full",
                  );
                if (event.key === "ArrowDown")
                  setSnap((current) =>
                    current === "full"
                      ? "half"
                      : current === "half"
                        ? "peek"
                        : "peek",
                  );
                if (event.key === "Enter" || event.key === " ")
                  setSnap((current) =>
                    current === "peek"
                      ? "half"
                      : current === "half"
                        ? "full"
                        : "peek",
                  );
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
