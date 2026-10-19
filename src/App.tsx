import { PromptBlock } from "@/blocks/prompt-input/prompt-block";
import { ComposerVariantProvider } from "@/blocks/prompt-input/composer-variant";
import { ThreadBridgeProvider } from "@/blocks/prompt-input/thread-bridge";
import { Shell } from "@/blocks/shell/shell";

/**
 * The app has no router yet. The prompt block is the app surface; its
 * components live in @/blocks/prompt-input. The shell around it supplies the
 * left sidebar and the work area's left edge.
 *
 * The two providers sit above both blocks because each one holds state that
 * spans the seam between them: the composer variant, whose switch is in the
 * rail and whose effect is in the work area; and the thread bridge, which is
 * how the rail starts and opens threads in the work area.
 */
function App() {
  return (
    <ThreadBridgeProvider>
      <ComposerVariantProvider>
        <Shell>
          <PromptBlock />
        </Shell>
      </ComposerVariantProvider>
    </ThreadBridgeProvider>
  );
}

export default App;