"use client";

import { type ComponentProps, forwardRef } from "react";

import { Button } from "@/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/tooltip";
import { cn } from "@/lib/utils";

/**
 * The app's icon-only button.
 *
 * A button with nothing but an icon on it has to say what it does, and the
 * only place that is said is a tooltip — so the two travel together and a
 * caller cannot have one without the other.
 *
 * The button is the app's own, and the tooltip is the app's own, and both
 * are the canonical ones: `src/components/button` and
 * `src/components/tooltip`. There is a second, older generation of both
 * under `src/components/ui/`, kept because the vendored assistant-ui
 * elements still use it, and it is not what anything new is built from.
 */
export type TooltipIconButtonProps = ComponentProps<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

export const TooltipIconButton = forwardRef<
  HTMLButtonElement,
  TooltipIconButtonProps
>(({ children, tooltip, side = "bottom", className, ...rest }, ref) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              {...rest}
              className={cn(
                // local edit: padding used to be a fixed `p-1` in this base while
                // callers override `size-*`. Size and padding are independent
                // style groups, so a size override left the padding stale.
                // Deriving it from the presence of an icon keeps them in step.
                //
                // The selector is `svg` and not `>svg` because the button
                // puts its children inside a wrapper of its own when it is
                // showing a status, so the icon is a descendant rather than
                // a direct child.
                //
                // There is no press scale here. The button has one of its
                // own, and it is the app's: every other button in the app
                // presses the same way, and an icon button that pressed
                // differently was the odd one out.
                "aui-button-icon size-6 p-0 has-[svg]:p-1",
                className,
              )}
              ref={ref}
            />
          }
        >
          {children}
          <span className="aui-sr-only sr-only">{tooltip}</span>
        </TooltipTrigger>
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

TooltipIconButton.displayName = "TooltipIconButton";
