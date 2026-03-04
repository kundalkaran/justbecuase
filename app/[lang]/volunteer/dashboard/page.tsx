import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { Suspense } from "react"
import { auth } from "@/lib/auth"
import { WelcomeToast } from "@/components/dashboard/welcome-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getVolunteerProfile, getMyApplications, getMatchedOpportunitiesForVolunteer, getVolunteerSubscriptionStatus } from "@/lib/actions"
import { Clock, CheckCircle2, FolderKanban, TrendingUp, Star, ArrowRight, Edit, Briefcase, CreditCard, Zap } from "lucide-react"
import { AIMatchExplanation } from "@/components/ai/match-explanation"
import Link from "next/link"
import { resolveSkillName } from "@/lib/skills-data"
import { getDictionary } from "@/app/[lang]/dictionaries"
import type { Locale } from "@/lib/i18n-config"

export default async function VolunteerDashboard({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const dict = await getDictionary(lang as Locale) as any

  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    redirect("/auth/signin")
  }

  // Role verification: Ensure user is a volunteer
  if (session.user.role !== "volunteer") {
    if (session.user.role === "ngo") {
      redirect("/ngo/dashboard")
    } else if (session.user.role === "admin") {
      redirect("/admin")
    } else {
      redirect("/auth/role-select")
    }
  }

  // Redirect to onboarding if not completed
  if (!session.user.isOnboarded) {
    redirect("/volunteer/onboarding")
  }

  const profile = await getVolunteerProfile()
  const applications = await getMyApplications()
  const matchedOpportunities = await getMatchedOpportunitiesForVolunteer()
  const subscriptionStatus = await getVolunteerSubscriptionStatus()

  // Calculate stats
  const pendingApplications = applications.filter((a) => a.status === "pending")
  const acceptedApplications = applications.filter((a) => a.status === "accepted")
  const completedProjects = profile?.completedProjects || 0
  const hoursContributed = profile?.hoursContributed || 0
  
  // Profile completion calculation
  let profileCompletion = 20 // Base for having account
  if (profile?.phone) profileCompletion += 10
  if (profile?.location) profileCompletion += 10
  if (profile?.bio) profileCompletion += 15
  if (profile?.skills?.length) profileCompletion += 20
  if (profile?.causes?.length) profileCompletion += 10
  if (profile?.linkedinUrl || profile?.portfolioUrl) profileCompletion += 15

  return (
    <>
      <Suspense fallback={null}>
        <WelcomeToast />
      </Suspense>
      <div className="flex-1 p-4 sm:p-6 lg:p-8">
          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Welcome back, {session.user.name?.split(" ")[0] || (dict.volunteer?.dashboard?.fallbackName || "Impact Agent")}!
            </h1>
            <p className="text-muted-foreground">{dict.volunteer?.dashboard?.subtitle || "Here's what's happening with your impact journey."}</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FolderKanban className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{applications.length}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{dict.volunteer?.dashboard?.statsApplications || "Applications"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-secondary" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{acceptedApplications.length}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{dict.volunteer?.dashboard?.statsActiveOpportunities || "Active Opportunities"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{completedProjects}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{dict.volunteer?.dashboard?.statsCompleted || "Completed"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{hoursContributed}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{dict.volunteer?.dashboard?.statsHoursGiven || "Hours Given"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{dict.volunteer?.dashboard?.recommendedOpportunities || "Recommended Opportunities"}</CardTitle>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/volunteer/opportunities">{dict.volunteer?.common?.viewAll || "View All"}</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {matchedOpportunities.length === 0 ? (
                    <div className="text-center py-8">
                      <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">{dict.volunteer?.dashboard?.noMatchesYet || "No opportunities matched yet"}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {dict.volunteer?.dashboard?.completeProfilePrompt || "Complete your profile to get personalized recommendations"}
                      </p>
                      <Button variant="link" asChild>
                        <Link href="/volunteer/profile">{dict.volunteer?.common?.completeProfile || "Complete Profile"}</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {matchedOpportunities.slice(0, 4).map((match) => (
                        <div
                          key={match.projectId}
                          className="p-4 border rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-colors"
                        >
                          <Link
                            href={`/projects/${match.projectId}`}
                            className="block"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <h3 className="font-medium text-foreground line-clamp-1">
                                {match.project.title}
                              </h3>
                              <Badge
                                className={
                                  match.score >= 70
                                    ? "bg-green-100 text-green-700"
                                    : match.score >= 50
                                    ? "bg-blue-100 text-blue-700"
                                    : match.score >= 35
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-orange-100 text-orange-700"
                                }
                              >
                                {Math.round(match.score)}{dict.volunteer?.common?.percentMatch || "% match"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                              {match.project.description}
                            </p>
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span className="capitalize">{match.project.workMode}</span>
                              <span>•</span>
                              <span>{match.project.timeCommitment}</span>
                            </div>
                          </Link>
                          <AIMatchExplanation
                            volunteerSkills={profile?.skills?.map((s: any) => s.name || s.subskillId) || []}
                            volunteerBio={profile?.bio}
                            volunteerLocation={profile?.location}
                            projectTitle={match.project.title}
                            projectDescription={match.project.description}
                            projectSkills={match.project.skillsRequired?.map((s: any) => s.subskillId) || []}
                            matchScore={match.score}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Profile Card */}
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{dict.volunteer?.dashboard?.myProfile || "My Profile"}</CardTitle>
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/volunteer/profile">
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center text-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4 overflow-hidden">
                      {session.user.image ? (
                        <img
                          src={session.user.image}
                          alt={session.user.name || ""}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl font-bold text-muted-foreground">
                          {session.user.name?.charAt(0) || "V"}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-foreground">{session.user.name}</h3>
                    <p className="text-sm text-muted-foreground">{profile?.location || (dict.volunteer?.common?.locationNotSet || "Location not set")}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium">{profile?.rating || (dict.volunteer?.common?.newRating || "New")}</span>
                      <span className="text-muted-foreground">({completedProjects} {dict.volunteer?.dashboard?.tasks || "tasks"})</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">{dict.volunteer?.common?.profileCompletion || "Profile Completion"}</span>
                        <span className="font-medium">{profileCompletion}%</span>
                      </div>
                      <Progress value={profileCompletion} className="h-2" />
                    </div>
                  </div>

                  {profile?.skills && profile.skills.length > 0 && (
                    <div className="mt-6">
                      <p className="text-sm font-medium text-foreground mb-3">{dict.volunteer?.common?.skills || "Skills"}</p>
                      <div className="flex flex-wrap gap-2">
                        {profile.skills.slice(0, 5).map((skill, i) => (
                          <Badge key={i} variant="secondary" className="bg-accent text-accent-foreground">
                            {resolveSkillName(skill.subskillId)}
                          </Badge>
                        ))}
                        {profile.skills.length > 5 && (
                          <Badge variant="secondary">+{profile.skills.length - 5}</Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Impact Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{dict.volunteer?.dashboard?.yourImpact || "Your Impact"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        ${(hoursContributed * 500).toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">{dict.volunteer?.dashboard?.estimatedValueContributed || "Estimated value contributed"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Subscription Status */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      {dict.volunteer?.dashboard?.subscription || "Subscription"}
                    </CardTitle>
                    {subscriptionStatus?.plan === "pro" && (
                      <Badge className="bg-gradient-to-r from-primary to-secondary text-white">
                        <Zap className="h-3 w-3 mr-1" />
                        {dict.volunteer?.common?.pro || "PRO"}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {subscriptionStatus?.plan === "free" ? (
                    <>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">{dict.volunteer?.dashboard?.applicationsThisMonth || "Applications this month"}</span>
                          <span className="font-medium">
                            {subscriptionStatus.applicationsUsed} / 3
                          </span>
                        </div>
                        <Progress 
                          value={(subscriptionStatus.applicationsUsed / 3) * 100} 
                          className="h-2" 
                        />
                      </div>
                      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="text-sm font-medium text-foreground mb-1">
                          {dict.volunteer?.dashboard?.upgradeProTitle || "Upgrade to Pro for unlimited applications"}
                        </p>
                        <p className="text-xs text-muted-foreground mb-3">
                          {dict.volunteer?.dashboard?.upgradeProDesc || "Apply to as many opportunities as you want with Pro"}
                        </p>
                        <Button asChild size="sm" className="w-full">
                          <Link href="/checkout?plan=volunteer-pro">
                            <Zap className="h-4 w-4 mr-2" />
                            {dict.volunteer?.common?.upgradeToPro || "Upgrade to Pro"}
                          </Link>
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-5 w-5 text-primary" />
                        <span className="font-medium text-foreground">{dict.volunteer?.dashboard?.proPlanActive || "Pro Plan Active"}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {dict.volunteer?.dashboard?.unlimitedApplications || "Unlimited applications available"}
                      </p>
                      {subscriptionStatus?.expiryDate && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {dict.volunteer?.dashboard?.renews || "Renews:"} {new Date(subscriptionStatus.expiryDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
    </>
  )
}
