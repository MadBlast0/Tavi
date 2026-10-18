type HapticKind = "tick" | "tap" | "success"

type HapticHandler = (kind: HapticKind, intensity: number) => void

let handler: HapticHandler | null = null

function setHapticHandler(next: HapticHandler | null) {
  handler = next
}

function haptic(kind: HapticKind = "tick", intensity = 0.5) {
  const strength = Math.min(1, Math.max(0, intensity))
  if (handler) {
    handler(kind, strength)
    return
  }
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return
  }
  const pattern =
    kind === "success"
      ? [8 + Math.round(strength * 8), 45, 12 + Math.round(strength * 10)]
      : kind === "tap"
        ? 10
        : 3 + Math.round(strength * 11)
  try {
    navigator.vibrate(pattern)
  } catch {}
}

export { haptic, setHapticHandler, type HapticHandler, type HapticKind }
