import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getDictionary } from "@/app/[lang]/dictionaries"
import type { Locale } from "@/lib/i18n-config"
import { getNGOProfile, browseVolunteers, getNGOSubscriptionStatus } from "@/lib/actions"

export default async function NGOFindTalentPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const dict = await getDictionary(lang as Locale) as any

  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    redirect("/auth/signin")
  }

  if (session.user.role !== "ngo") {
    if (session.user.role === "volunteer") {
      redirect("/volunteer/dashboard")
    } else if (session.user.role === "admin") {
      redirect("/admin")
    } else {
      redirect("/auth/role-select")
    }
  }

  if (!session.user.isOnboarded) {
    redirect("/ngo/onboarding")
  }

  const ngoProfile = await getNGOProfile()
  const volunteers = await browseVolunteers()
  const ngoSubscription = await getNGOSubscriptionStatus()

  // Serialize volunteer data for client component.
  // CRITICAL: v.id comes from getVolunteerProfileView which sets
  // id = volunteerProfile.userId = user._id.toString() (the Better Auth user ID).
  // We set BOTH id and userId to the same value so the client can cross-reference
  // with ES search results that also use user._id as their ID.
  const serializedVolunteers = volunteers.map((v: any) => ({
    id: v.id || "",
    userId: v.id,
    name: v.name || undefined,
    avatar: v.avatar || undefined,
    headline: (v as any).bio?.slice(0, 60) || undefined,
    location: v.location,
    city: v.location?.split(',')[0]?.trim(),
    country: v.location?.split(',')[1]?.trim(),
    hoursPerWeek: typeof v.hoursPerWeek === 'number' ? v.hoursPerWeek : parseInt(v.hoursPerWeek) || 10,
    skills: v.skills,
    volunteerType: v.volunteerType as "free" | "paid" | "both" | undefined,
    hourlyRate: v.hourlyRate || undefined,
    discountedRate: v.discountedRate || undefined,
    currency: v.currency || "USD",
    rating: v.rating,
    completedProjects: v.completedProjects,
    freeHoursPerMonth: v.freeHoursPerMonth,
  }))

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-2">{dict.ngo?.findTalent?.title || "Find Talent"}</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {dict.ngo?.findTalent?.subtitle || "Browse skilled impact agents to help with your opportunities"}
            </p>
          </div>

         
    </main>
  )
}
