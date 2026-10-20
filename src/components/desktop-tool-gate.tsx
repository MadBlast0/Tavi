import { useAuiToolOverrides } from "@assistant-ui/react";

import { isDesktopApp } from "@/lib/desktop";

/**
 * Hides the desktop-only tools when the app is running in a browser.
 *
 * Toolkits are static, but `disabled: true` keeps a tool defined on the client
 * while dropping it from the set sent to the model. So on the web the model is
 * never told these tools exist, rather than being offered them and then failing
 * when they cannot run — which is what produced the "only available in the
 * desktop app" errors.
 *
 * Mounted unconditionally: the hook cannot be called conditionally, but on the
 * desktop it resolves to `disabled: false`, which restores the toolkit default.
 */
export const DesktopToolGate = () => {
  const desktop = isDesktopApp();

  useAuiToolOverrides({
    list_workspace_entries: { disabled: !desktop },
    read_workspace_file: { disabled: !desktop },
  });

  return null;
};