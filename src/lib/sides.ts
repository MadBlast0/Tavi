/**
 * Which of the app's two surfaces you are on.
 *
 * Chat and Code are separate places with separate threads, so the word for one
 * of them is needed in the thread stores, in the preferences and in the
 * composer alike. It lives here rather than in any one of them, because none
 * of them owns it.
 *
 * The other word that gets confused with this one is **mode**, which is the
 * agent behaviour a code session runs in — edit, plan or ask. A chat has no
 * mode, and a mode is not a side.
 */
export type Side = "chat" | "code"

/** Both sides, in the order the switch shows them. */
export const SIDES: readonly Side[] = ["chat", "code"]
