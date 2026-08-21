"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  MiniPlatformAside,
  MiniPlatformRailButton,
} from "./mini-platform-aside";
import { Icon, type IconName } from "./icon";
import { LiquidSwitch } from "./liquid";

/**
 * One feature that can occupy the aside. Everything about the shell — width,
 * height, glass chrome, resize edge — is owned by the dock, so a panel only
 * describes its own identity and content.
 */
export type MiniPlatformPanel = {
  id: string;
  /** Vertical text on the collapsed rail launcher. Keep it short. */
  railLabel: string;
  icon: IconName;
  title: ReactNode;
  ariaLabel: string;
  /** Optional line under the header, e.g. a connection state. */
  status?: ReactNode;
  /** Extra header controls for this panel, placed after the view tabs. */
  headerActions?: ReactNode;
  content: ReactNode;
};

/**
 * A rail of launchers over a single shared aside.
 *
 * Every panel renders into the same `MiniPlatformAside` instance, so they are
 * identical in size, position and chrome by construction — there is no second
 * window to keep in sync. The rail (collapsed) and the view tabs (open) are
 * both loops over the same `panels` array, so adding a feature is one entry.
 *
 * `open` is controlled: the rail launchers live outside the aside and have to
 * be able to open it, and the surrounding map layout reserves `width` while it
 * is open, so the owner of that layout owns the open state too.
 */
export function MiniPlatformDock({
  windowId,
  panels,
  activeId,
  onActiveChange,
  open,
  onOpenChange,
  width,
  onWidthChange,
  minHeight = 360,
  eyebrow,
  placementStyle,
}: {
  windowId: string;
  panels: MiniPlatformPanel[];
  /** Controlled active panel; falls back to the first panel. */
  activeId?: string;
  onActiveChange?: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: number;
  onWidthChange?: (width: number) => void;
  minHeight?: number;
  eyebrow?: ReactNode;
  placementStyle?: CSSProperties;
}) {
  const [internalId, setInternalId] = useState(panels[0]?.id);
  const reduceMotion = useReducedMotion();
  const currentId = activeId ?? internalId;
  // A panel can be removed while it is showing, so never trust the id alone.
  const active = panels.find((panel) => panel.id === currentId) ?? panels[0];

  if (!active) return null;

  const select = (id: string) => {
    if (activeId === undefined) setInternalId(id);
    onActiveChange?.(id);
  };
  const openPanel = (id: string) => {
    select(id);
    onOpenChange(true);
  };

  return (
    <MiniPlatformAside
      windowId={windowId}
      open={open}
      onOpenChange={onOpenChange}
      title={active.title}
      ariaLabel={active.ariaLabel}
      eyebrow={eyebrow}
      width={width}
      onWidthChange={onWidthChange}
      minHeight={minHeight}
      placementStyle={placementStyle}
      panelKey={active.id}
      status={active.status}
      // The dock draws the whole rail itself so every launcher is a loop over
      // the same list; the aside's built-in single launcher would be a
      // hand-written duplicate of the first entry.
      showCollapsedButton={false}
      collapsedActions={panels.map((panel) => (
        <MiniPlatformRailButton
          key={panel.id}
          label={panel.railLabel}
          icon={panel.icon}
          ariaLabel={`Open ${panel.ariaLabel}`}
          onClick={() => openPanel(panel.id)}
        />
      ))}
      headerActions={active.headerActions}
      // A centered tab strip under the header, built from the same `panels`
      // list as the rail. `LiquidSwitch` is the house tablist, so these read as
      // the map's other switches rather than as a control invented here.
      // The wrapper is `liquid-pill` — the sizeless glass primitive. Not
      // `liquid-dock`, which is the bottom navigation bar and carries a fixed
      // 280x60 box that would strand these tabs in a half-empty pill.
      toolbar={
        panels.length > 1 ? (
          <div className="mini-platform-tabs">
            <div className="liquid-pill p-1">
              <LiquidSwitch
                items={panels.map((panel) => ({
                  value: panel.id,
                  label: panel.railLabel,
                  icon: <Icon name={panel.icon} />,
                }))}
                value={active.id}
                onChange={select}
                ariaLabel="Panel views"
              />
            </div>
          </div>
        ) : undefined
      }
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={active.id}
          className="mini-platform-panel-content"
          initial={reduceMotion ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, x: -8 }}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }
          }
        >
          {active.content}
        </motion.div>
      </AnimatePresence>
    </MiniPlatformAside>
  );
}
