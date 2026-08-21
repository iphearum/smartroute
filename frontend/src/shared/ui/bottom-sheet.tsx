"use client";

import type { ComponentProps, ReactNode } from "react";
import { useAppShell } from "@/shared/state/app-shell-context";
import { DraggableLiquidSheet } from "./liquid";

export function BottomSheet({
  id,
  title,
  children,
  className,
  overlayClassName,
  role = "dialog",
  ariaLabelledBy,
  ariaDescribedBy,
  draggableProps,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  role?: "dialog" | "alertdialog";
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  draggableProps?: Omit<
    ComponentProps<typeof DraggableLiquidSheet>,
    | "open"
    | "onClose"
    | "children"
    | "className"
    | "overlayClassName"
    | "ariaLabel"
    | "role"
    | "ariaLabelledBy"
    | "ariaDescribedBy"
  >;
}) {
  const activeSheet = useAppShell((state) => state.bottomSheet);
  const closeBottomSheet = useAppShell((state) => state.closeBottomSheet);

  return (
    <DraggableLiquidSheet
      {...draggableProps}
      open={activeSheet?.id === id}
      onClose={() => closeBottomSheet(id)}
      ariaLabel={activeSheet?.title || title}
      overlayClassName={overlayClassName}
      role={role}
      ariaLabelledBy={ariaLabelledBy}
      ariaDescribedBy={ariaDescribedBy}
      initialSnap="full"
      className={className}
    >
      {children}
    </DraggableLiquidSheet>
  );
}
