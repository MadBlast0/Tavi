/** Shape returned by `GET /api/key`. Mirrors the server's KeyStatus. */
export type KeyStatus = {
  valid: boolean;
  reason?: string;
  label?: string;
  limit?: number | null;
  remaining?: number | null;
  usage?: number | null;
  isFreeTier?: boolean;
};