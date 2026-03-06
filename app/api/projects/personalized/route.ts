import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { projectsDb, volunteerProfilesDb, ngoProfilesDb } from "@/lib/database"
import { rankPersonalizedOpportunities } from "@/lib/matching"
import type { NGOProfile } from "@/lib/types"

// ============================================
// Personalized Opportunity Feed API
// ============================================
// Returns projects scored and ranked for the logged-in volunteer.
//
// Scoring signals:
//   1. Skill match        (35%)  — How well your skills fit the project
//   2. Geo distance       (20%)  — Haversine distance (coords) or city/country match
//   3. Cause alignment    (15%)  — Shared mission with the project
//   4. Work mode match    (10%)  — Remote/onsite/hybrid compatibility
//   5. Freshness          (8%)   — Newer + urgent projects rank higher
//   6. NGO quality        (7%)   — Verified, experienced organizations
//   7. Experience fit     (5%)   — Beginner/intermediate/expert alignment
//
// Geo-location:
//   - Primary: volunteer.coordinates + NGO profile coordinates
//   - Fallback: IP-based geolocation via request headers (X-Forwarded-For)
//   - Last resort: fuzzy city/country string matching
// ============================================

/**
 * Resolve coordinates from an IP address using a free geolocation API.
 * Returns null if the lookup fails — we never block on this.
 */
async function geolocateIP(ip: string): Promise<{ lat: number; lng: number } | null> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return null // Local / private IPs have no geo data
  }
  try {
    // ip-api.com is free for non-commercial use, 45 req/min limit
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,lat,lon`, {
      signal: AbortSignal.timeout(2000), // 2 second timeout — never slow the feed
    })
    const data = await res.json()
    if (data.status === "success" && typeof data.lat === "number" && typeof data.lon === "number") {
      return { lat: data.lat, lng: data.lon }
    }
  } catch {
    // IP geolocation is best-effort — silently fail
  }
  return null
}

function serializeDocuments<T>(docs: T[]): T[] {
  return JSON.parse(JSON.stringify(docs))
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Authenticate
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Volunteers only
    if (session.user.role !== "volunteer") {
      return NextResponse.json(
        { success: false, error: "Only volunteers can access personalized opportunities" },
        { status: 403 }
      )
    }

    // Load volunteer profile
    const volunteer = await volunteerProfilesDb.findByUserId(session.user.id)
    if (!volunteer) {
      return NextResponse.json({
        success: true,
        opportunities: [],
        message: "Complete your profile to get personalized recommendations",
        meta: { took: Date.now() - startTime },
      })
    }

    // Load all active projects
    const allProjects = await projectsDb.findActive({}, { sort: { createdAt: -1 } as any })
    if (allProjects.length === 0) {
      return NextResponse.json({
        success: true,
        opportunities: [],
        message: "No active opportunities available",
        meta: { took: Date.now() - startTime },
      })
    }

    // Collect unique NGO IDs and batch-load their profiles
    const ngoIds = [...new Set(allProjects.map(p => p.ngoId).filter(Boolean))]
    const ngoProfileMap = new Map<string, NGOProfile>()
    const ngoCoordMap = new Map<string, { lat: number; lng: number }>()
    const ngoInfoMap: Record<string, { name: string; logo?: string; verified: boolean; city?: string; country?: string }> = {}

    await Promise.all(
      ngoIds.map(async (ngoId) => {
        const profile = await ngoProfilesDb.findByUserId(ngoId)
        if (profile) {
          ngoProfileMap.set(ngoId, profile)
          ngoInfoMap[ngoId] = {
            name: profile.orgName || "Organization",
            logo: (profile as any).logo,
            verified: profile.isVerified || false,
            city: profile.city,
            country: profile.country,
          }
          // Extract NGO coordinates
          const coords = profile.coordinates
          if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
            ngoCoordMap.set(ngoId, { lat: coords.lat, lng: coords.lng })
          }
        }
      })
    )

    // Attach NGO info to projects
    const projectsWithNgo = allProjects.map(p => ({
      ...p,
      ngo: ngoInfoMap[p.ngoId] || { name: "Organization", verified: false },
    }))

    // Resolve volunteer coordinates
    let volunteerCoords: { lat: number; lng: number } | null = null
    if (
      volunteer.coordinates &&
      typeof volunteer.coordinates.lat === "number" &&
      typeof volunteer.coordinates.lng === "number"
    ) {
      volunteerCoords = { lat: volunteer.coordinates.lat, lng: volunteer.coordinates.lng }
    }

    // IP-based geolocation fallback if no stored coordinates
    if (!volunteerCoords) {
      const forwarded = request.headers.get("x-forwarded-for")
      const realIp = request.headers.get("x-real-ip")
      const ip = forwarded?.split(",")[0]?.trim() || realIp || ""
      if (ip) {
        volunteerCoords = await geolocateIP(ip)
      }
    }

    // Score & rank
    const ranked = rankPersonalizedOpportunities(
      volunteer,
      projectsWithNgo,
      ngoProfileMap,
      volunteerCoords,
      ngoCoordMap,
    )

    // If too few personalized results, fall back to all active projects
    // This prevents showing 2 opportunities when 16 are available
    let finalOpportunities = ranked
    if (ranked.length < 8 && allProjects.length > ranked.length) {
      // Return all active projects as fallback (no personalization)
      return NextResponse.json({
        success: true,
        opportunities: serializeDocuments(allProjects),
        meta: {
          total: allProjects.length,
          totalProjects: allProjects.length,
          hasCoordinates: !!volunteerCoords,
          personalized: false,
          took: Date.now() - startTime,
        },
      })
    }

    const serialized = serializeDocuments(finalOpportunities)

    return NextResponse.json({
      success: true,
      opportunities: serialized,
      meta: {
        total: serialized.length,
        totalProjects: allProjects.length,
        hasCoordinates: !!volunteerCoords,
        took: Date.now() - startTime,
      },
    })
  } catch (error: any) {
    console.error("[Personalized API] Error:", error?.message || error)
    return NextResponse.json(
      { success: false, error: "Failed to load personalized opportunities" },
      { status: 500 }
    )
  }
}
