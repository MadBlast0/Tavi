"use client";

import { Assistant } from "@/assistant";
import { ThemeToggle } from "@/components/theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AssistantSurfaceVariant = "full-page" | "sidebar" | "modal";

const VARIANT_CONTAINER: Record<AssistantSurfaceVariant, string> = {
  // The default surface: the whole window, sized by the viewport.
  "full-page": "h-dvh w-full bg-background",
  // Docked beside the main workflow. Needs a bounded parent to sit against.
  sidebar: "h-dvh w-full max-w-md border-l bg-background",
  // Floats over the current screen; the Thread needs a fixed height here.
  modal: "flex h-[min(80dvh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl",
};

export type AssistantSurfaceProps = {
  variant?: AssistantSurfaceVariant;
  className?: string;
};

/**
 * Mounts the assistant in one of the agreed placements. `full-page` is the
 * default the setup selected; `sidebar` and `modal` are here so the placement
 * can change without touching the runtime.
 */
export const AssistantSurface = ({
  variant = "full-page",
  className,
}: AssistantSurfaceProps) => {
  const surface = (
    <div className={cn("relative flex min-h-0 flex-col", VARIANT_CONTAINER[variant], className)}>
      {/* Kept outside the generated Thread so regenerating that component
          cannot remove them. */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <ThemeToggle />
      </div>
      <Assistant />
    </div>
  );

  if (variant === "modal") {
    return (
      <TooltipProvider>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          {surface}
        </div>
      </TooltipProvider>
    );
  }

  return <TooltipProvider>{surface}</TooltipProvider>;
};