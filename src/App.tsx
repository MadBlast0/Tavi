import { PromptBlock } from "@/blocks/prompt-input/prompt-block";
import { ComposerVariantProvider } from "@/blocks/prompt-input/composer-variant";
import { Shell } from "@/blocks/shell/shell";

/**
 * The app has no router yet. The prompt block is the app surface; its
 * components live in @/blocks/prompt-input. The shell around it supplies the
 * left sidebar and the work area's left edge.
 *
 * The composer variant is provided here rather than inside either block: the
 * switch that sets it is in the sidebar, and the layout it chooses is in the
 * work area, so it has to sit above both.
 */
function App() {
  return (
    <ComposerVariantProvider>
      <Shell>
        <PromptBlock />
      </Shell>
    </ComposerVariantProvider>
  );
}

export default App;