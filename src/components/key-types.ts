/**
 * Shape of what the provider says about the key.
 *
 * It lives in `@/lib/chat` now, because the desktop app asks Rust for it and
 * the website asks its server — and both answer in the same shape.
 */
export type { KeyStatus } from "@/lib/chat";
