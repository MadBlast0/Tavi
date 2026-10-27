import { PromptBlock } from "@/blocks/prompt-input/prompt-block";
import { ComposerVariantProvider } from "@/blocks/prompt-input/composer-variant";
import { ThreadBridgeProvider } from "@/blocks/prompt-input/thread-bridge";
import { AnnounceBridge } from "@/blocks/shell/announce-bridge";
import { Shell } from "@/blocks/shell/shell";
import { TrayBridge } from "@/blocks/shell/tray-bridge";
import { PaneWindow, paneWindowIdFromUrl } from "@/blocks/workspace/pane-window";

/**
 * The app has no router yet. The prompt block is the app surface; its
 * components live in @/blocks/prompt-input. The shell around it supplies the
 * left sidebar and the work area's left edge.
 *
 * The two providers sit above both blocks because each one holds state that
 * spans the seam between them: the composer variant, whose switch is in the
 * rail and whose effect is in the work area; and the thread bridge, which is
 * how the rail starts and opens threads in the work area.
 *
 * The tray bridge sits with them for the same reason. It carries the system
 * tray's commands into the app, and both of the things it needs to act on —
 * the variant and the thread — are held above the shell.
 *
 * The announcement bridge is the third of them. It carries the app's own
 * announcements — a reply that finished while the reader was elsewhere — into
 * the window, and it carries the card they appear in.
 */
function App() {
  const paneId = paneWindowIdFromUrl();
  if (paneId) return <PaneWindow paneId={paneId} />;
  return (
    <ThreadBridgeProvider>
      <ComposerVariantProvider>
        <TrayBridge />
        <AnnounceBridge />
        <Shell>
          <PromptBlock />
        </Shell>
      </ComposerVariantProvider>
    </ThreadBridgeProvider>
  );
}

export default App;
