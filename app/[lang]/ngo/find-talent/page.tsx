import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getDictionary } from "@/app/[lang]/dictionaries"
import type { Locale } from "@/lib/i18n-config"
import { getNGOProfile, browseVolunteers, getNGOSubscriptionStatus } from "@/lib/actions"
import React from "react"
import VolunteersPage from "../../volunteers/page"
import { Users } from "lucide-react"
import { BrowseGridSkeleton } from "@/components/ui/page-skeletons"

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

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              {dict.ngo?.findTalent?.title || "Find Talent"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {dict.ngo?.findTalent?.subtitle || "Browse skilled impact agents to help with your opportunities"}
            </p>
          </div>
        </div>
      </div>

      <React.Suspense fallback={
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 h-10 rounded-md bg-muted animate-pulse" />
            <div className="h-10 w-32 rounded-md bg-muted animate-pulse" />
          </div>
          <BrowseGridSkeleton columns={3} count={6} />
        </div>
      }>
        <VolunteersPage embed />
      </React.Suspense>
    </main>
  )
}
