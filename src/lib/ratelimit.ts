// Lightweight in-memory rate limiter (per warm instance). Sufficient as a first line;
// pair with Vercel WAF/Firewall for distributed protection.
const g = globalThis as unknown as { __SFM_RL?: Map<string, { count: number; reset: number }> };
function bucket() { return (g.__SFM_RL ??= new Map()); }

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = bucket();
  const cur = b.get(key);
  if (!cur || cur.reset < now) {
    b.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  cur.count++;
  if (cur.count > limit) return { ok: false, retryAfter: Math.ceil((cur.reset - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}
