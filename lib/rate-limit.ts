import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// When Upstash env vars are set, use distributed Redis rate limiting.
// Falls back to the caller-provided in-memory check when not configured.
const isUpstashConfigured = !!(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
)

let redis: Redis | null = null
if (isUpstashConfigured) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

// Guest: 10 requests per day per IP (distributed via Redis)
const guestDailyLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(10, '1 d'),
      prefix: 'mw:guest:daily',
    })
  : null

// Guest: 5 requests per minute per IP (anti-burst, in addition to daily cap)
const guestMinuteLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(5, '1 m'),
      prefix: 'mw:guest:minute',
    })
  : null

// Free user: 5 requests per minute per userId (anti-burst)
const freeUserMinuteLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(5, '1 m'),
      prefix: 'mw:free:minute',
    })
  : null

export interface RateLimitResult {
  allowed: boolean
  error?: 'GUEST_LIMIT_REACHED' | 'RATE_LIMITED'
  remaining?: number
}

/** Check guest rate limits (daily + per-minute). Returns allowed=false with error code if blocked. */
export async function checkGuestLimits(ip: string): Promise<RateLimitResult> {
  if (!guestDailyLimiter || !guestMinuteLimiter) {
    // Upstash not configured — fall back to permissive mode (local dev or missing config)
    return { allowed: true }
  }

  // Per-minute burst check first (cheap fail-fast)
  const minuteResult = await guestMinuteLimiter.limit(ip)
  if (!minuteResult.success) {
    return { allowed: false, error: 'RATE_LIMITED', remaining: 0 }
  }

  // Daily quota check
  const dailyResult = await guestDailyLimiter.limit(ip)
  if (!dailyResult.success) {
    return { allowed: false, error: 'GUEST_LIMIT_REACHED', remaining: 0 }
  }

  return { allowed: true, remaining: dailyResult.remaining }
}

/** Check free-tier user burst rate (5 req/min). Returns allowed=false if rate-limited. */
export async function checkFreeUserRateLimit(userId: string): Promise<RateLimitResult> {
  if (!freeUserMinuteLimiter) {
    return { allowed: true }
  }
  const result = await freeUserMinuteLimiter.limit(userId)
  if (!result.success) {
    return { allowed: false, error: 'RATE_LIMITED', remaining: 0 }
  }
  return { allowed: true, remaining: result.remaining }
}
