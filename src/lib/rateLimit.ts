// ─── Per-instance request budget for expensive endpoints (AI calls) ─────────
// Best-effort sliding window held in memory. On serverless this bounds each
// warm instance rather than the whole deployment, which is enough to stop a
// runaway client loop from burning the AI budget.

const buckets = new Map<string, number[]>()

/** Returns 0 when allowed (and records the hit), else seconds until retry. */
export function takeRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): number {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    buckets.set(key, recent)
    return Math.ceil((recent[0] + windowMs - now) / 1000)
  }
  recent.push(now)
  buckets.set(key, recent)
  return 0
}

// Shared budget for all AI endpoints: 30 calls per 10 minutes.
export const AI_RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 }
