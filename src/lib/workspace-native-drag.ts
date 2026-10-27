/** Runs a native workspace drag and always clears the shared drag state. */
export const runWorkspaceNativeDrag = async ({
  announceStart,
  drag,
  announceEnd,
}: {
  announceStart: () => Promise<void>
  drag: () => Promise<void>
  announceEnd: () => Promise<void>
}): Promise<void> => {
  try {
    await announceStart()
    await drag()
  } catch {
    // Failed or cancelled native drags leave the workspace layout unchanged.
  } finally {
    await announceEnd().catch(() => {})
  }
}
