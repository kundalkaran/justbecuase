import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { ngoProfilesDb, volunteerProfilesDb } from "@/lib/database"

/**
 * Returns subscription info for the current user.
 * Checks expiry dates — if a subscription has expired, returns "free" instead of "pro".
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = session.user
    const role = user.role as string
    const now = new Date()

    if (role === "ngo") {
      const profile = await ngoProfilesDb.findByUserId(user.id)
      if (!profile) {
        return NextResponse.json({ ngoSubscription: null })
      }
      
      // Check if subscription has expired
      const isExpired = profile.subscriptionExpiry && new Date(profile.subscriptionExpiry) < now
      const effectivePlan = isExpired ? "free" : (profile.subscriptionPlan || "free")
      
      return NextResponse.json({
        ngoSubscription: {
          plan: effectivePlan,
          unlocksUsed: profile.monthlyUnlocksUsed || 0,
          expiryDate: profile.subscriptionExpiry?.toISOString(),
          isExpired: !!isExpired,
        }
      })
    } else if (role === "volunteer") {
      const profile = await volunteerProfilesDb.findByUserId(user.id)
      if (!profile) {
        return NextResponse.json({ volunteerSubscription: null })
      }
      
      // Check if subscription has expired
      const isExpired = profile.subscriptionExpiry && new Date(profile.subscriptionExpiry) < now
      const effectivePlan = isExpired ? "free" : (profile.subscriptionPlan || "free")
      
      return NextResponse.json({
        volunteerSubscription: {
          plan: effectivePlan,
          applicationsUsed: profile.monthlyApplicationsUsed || 0,
          expiryDate: profile.subscriptionExpiry?.toISOString(),
          isExpired: !!isExpired,
        }
      })
    }

    return NextResponse.json({})
  } catch (error: any) {
    console.error("Error fetching subscription:", error)
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 })
  }
}
