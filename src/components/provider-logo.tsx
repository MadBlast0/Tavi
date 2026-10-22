import * as React from "react";

import { providerLogo } from "@/lib/provider-logos";
import { cn } from "@/lib/utils";

/**
 * A provider's own mark.
 *
 * The mark is the provider's trademark, shown beside the provider's name so
 * that a person can tell at a glance which provider they are giving a key to.
 * It is not Tavi's own branding, and the app draws none of its own here.
 *
 * A provider with no vendored mark gets its name instead of a blank square:
 * the app does not draw a mark it does not have, and it does not fetch one
 * that might not be there.
 */
export function ProviderLogo({
  provider,
  providerLabel,
  className,
}: {
  /** The provider's id. */
  provider: string;
  /** The provider's name, used when there is no mark. */
  providerLabel: string;
  className?: string;
}) {
  const logo = providerLogo(provider);

  if (!logo) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[9px] font-semibold uppercase",
          className,
        )}
      >
        {providerLabel.slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={logo}
      alt=""
      aria-hidden="true"
      className={cn("size-6 shrink-0 object-contain", className)}
    />
  );
}
