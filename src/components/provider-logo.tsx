import * as React from "react";

import { providerMark } from "@/lib/provider-logos";
import { cn } from "@/lib/utils";

/**
 * A provider's own mark.
 *
 * The mark is the provider's trademark, shown beside the provider's name so
 * that a person can tell at a glance which provider they are giving a key to.
 * It is not Tavi's own branding, and the app draws none of its own here.
 *
 * **The mark is drawn in the page, not loaded as an image.** A mark loaded as
 * a file cannot take the colour of the text beside it: `currentColor` inside
 * a file is resolved against that file's own document, which has no colour of
 * its own, so it comes out black — invisible on the dark theme. Drawn in the
 * page, it is resolved against the page's colour, so it is light in the dark
 * theme and dark in the light one, and there is no second copy of it.
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
  const mark = providerMark(provider);

  if (!mark) {
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
    <span
      aria-hidden="true"
      /* The mark is ours, vendored, and the only thing in it is a path. It is
         drawn in the page so that it takes the page's colour, which is the
         whole point of it. */
      dangerouslySetInnerHTML={{ __html: mark }}
      className={cn(
        "provider-mark inline-flex size-6 shrink-0 items-center justify-center text-current",
        className,
      )}
    />
  );
}
