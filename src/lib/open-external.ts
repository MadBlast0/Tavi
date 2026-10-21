import { openUrl } from "@tauri-apps/plugin-opener"

import { isDesktopApp } from "./desktop"

/**
 * Opening a page outside the app.
 *
 * The desktop's webview swallows a new-window request — a link opened with
 * `window.open` goes nowhere, because there is nowhere in the app for it to
 * go — so the page is handed to the operating system and opens in the
 * browser the person already uses. In a browser there is no operating system
 * to hand it to, and a new tab is what the link means.
 *
 * Only https is handed over. A link that can say `file:` or `javascript:` is
 * a link that can do things the app did not mean, and the app has no reason
 * to open either.
 */
export const openExternal = async (url: string) => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }

  if (parsed.protocol !== "https:") {
    return
  }

  if (isDesktopApp()) {
    await openUrl(parsed.toString())
    return
  }

  window.open(parsed.toString(), "_blank", "noopener")
}
