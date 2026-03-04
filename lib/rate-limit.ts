/**
 * Rate Limiting Utility
 * 
 * In-memory sliding window rate limiter for API routes.
 * Use `withRateLimit()` wrapper in API route handlers.
 * For production at scale, swap to Redis/Upstash.
 */

import { NextRequest, NextResponse } from "next/server"

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup stale entries periodically
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key)
  }
}

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  )
}

interface RateLimitOptions {
  /** Max requests per window */
  requests: number
  /** Window duration in milliseconds */
  windowMs: number
  /** Optional key prefix for grouping */
  keyPrefix?: string
}

// Common presets
export const RATE_LIMITS = {
  strict:   { requests: 5,   windowMs: 60 * 60 * 1000 },  // 5/hour (OTP, auth)
  ai:       { requests: 30,  windowMs: 60 * 1000 },        // 30/min
  search:   { requests: 60,  windowMs: 60 * 1000 },        // 60/min
  upload:   { requests: 20,  windowMs: 60 * 1000 },        // 20/min
  payment:  { requests: 10,  windowMs: 60 * 1000 },        // 10/min
  standard: { requests: 120, windowMs: 60 * 1000 },        // 120/min
} as const

/**
 * Check rate limit for a request.
 * Returns a 429 response if exceeded, or null if allowed.
 */
export function checkRateLimit(
  req: NextRequest,
  opts: RateLimitOptions = RATE_LIMITS.standard
): NextResponse | null {
  cleanup()

  const ip = getClientIP(req)
  const key = `${opts.keyPrefix || "api"}:${ip}`
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs })
    return null // allowed
  }

  if (entry.count >= opts.requests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return NextResponse.json(
      {
        error: "Too many requests",
        retryAfter,
        message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(opts.requests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      }
    )
  }

  entry.count++
  return null // allowed
}

/**
 * Wrap an API route handler with rate limiting.
 * 
 * Usage:
 * ```
 * export const GET = withRateLimit(
 *   async (req) => { ... return NextResponse.json(...) },
 *   RATE_LIMITS.search
 * )
 * ```
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse | Response>,
  opts: RateLimitOptions = RATE_LIMITS.standard
) {
  return async (req: NextRequest) => {
    const limited = checkRateLimit(req, opts)
    if (limited) return limited
    return handler(req)
  }
}

/**
 * Add security headers to any response.
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  // Allow geolocation for the same origin so in-browser location APIs work (mobile browsers)
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
  return response
}
