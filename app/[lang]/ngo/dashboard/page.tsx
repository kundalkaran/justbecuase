import { redirect } from "next/navigation"
import { Suspense } from "react"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getDictionary } from "@/app/[lang]/dictionaries"
import { Locale } from "@/lib/i18n-config"
import { WelcomeToast } from "@/components/dashboard/welcome-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getNGOProfile, getMyProjectsAsNGO, getNGOApplications, getNGOSubscriptionStatus, getRecommendedVolunteersForNGO } from "@/lib/actions"
import { PlusCircle, FolderKanban, Users, CheckCircle2, Eye, MessageSquare, Clock, ArrowRight, CreditCard, Zap, Unlock, Star, Sparkles } from "lucide-react"
import Link from "next/link"

export default async function NGODashboard({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const dict = await getDictionary(lang as Locale) as any;

  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    redirect("/auth/signin")
  }

  // Role verification: Ensure user is an NGO
  if (session.user.role !== "ngo") {
    if (session.user.role === "volunteer") {
      redirect("/volunteer/dashboard")
    } else if (session.user.role === "admin") {
      redirect("/admin")
    } else {
      redirect("/auth/role-select")
    }
  }

  // Redirect to onboarding if not completed
  if (!session.user.isOnboarded) {
    redirect("/ngo/onboarding")
  }

  const ngoProfile = await getNGOProfile()
  const projects = await getMyProjectsAsNGO()
  const applications = await getNGOApplications()
  const subscriptionStatus = await getNGOSubscriptionStatus()
  const recommendedVolunteers = await getRecommendedVolunteersForNGO()

  // Calculate stats
  const activeProjects = projects.filter((p) => p.status === "open" || p.status === "active")
  const completedProjects = projects.filter((p) => p.status === "completed")
  const pendingApplications = applications.filter((a) => a.status === "pending")

  return (
    <>
      <Suspense fallback={null}>
        <WelcomeToast />
      </Suspense>
      <div className="flex-1 p-4 sm:p-6 lg:p-8">
          {/* Welcome Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {dict.ngo?.dashboard?.welcome || "Welcome, "}{ngoProfile?.organizationName || session.user.name}
              </h1>
              <p className="text-muted-foreground">{dict.ngo?.dashboard?.subtitle || "Manage your opportunities and connect with skilled impact agents."}</p>
            </div>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link href="/ngo/post-project" className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                {dict.ngo?.common?.postNewOpportunity || "Post New Opportunity"}
              </Link>
            </Button>
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
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{activeProjects.length}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{dict.ngo?.common?.activeOpportunities || "Active Opportunities"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 sm:h-6 sm:w-6 text-secondary" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{pendingApplications.length}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{dict.ngo?.common?.pendingApplications || "Pending Applications"}</p>
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
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{completedProjects.length}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{dict.ngo?.common?.completed || "Completed"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{applications.length}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{dict.ngo?.dashboard?.totalApplications || "Total Applications"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content - Projects */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{dict.ngo?.common?.activeOpportunities || "Active Opportunities"}</CardTitle>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/ngo/projects">{dict.ngo?.common?.viewAll || "View All"}</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeProjects.length === 0 ? (
                    <div className="text-center py-8">
                      <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">{dict.ngo?.dashboard?.noActiveOpportunities || "No active opportunities"}</p>
                      <Button variant="link" asChild>
                        <Link href="/ngo/post-project">{dict.ngo?.dashboard?.createFirstOpportunity || "Create your first opportunity"}</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activeProjects.slice(0, 4).map((project) => (
                        <div key={project._id?.toString()} className="p-4 border rounded-lg hover:border-primary/50 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-foreground">{project.title}</h3>
                                <Badge variant="outline" className="text-xs">
                                  {project.projectType}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Users className="h-4 w-4" />
                                  {project.applicantsCount || 0} {dict.ngo?.common?.applications || "applications"}
                                </span>
                                <span className="flex items-center gap-1 capitalize">
                                  <Clock className="h-4 w-4" />
                                  {project.workMode}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/ngo/applications?project=${project._id?.toString()}`}>
                                  {dict.ngo?.common?.viewApplications || "View Applications"}
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Recent Applications */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{dict.ngo?.dashboard?.recentApplications || "Recent Applications"}</CardTitle>
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/ngo/applications">{dict.ngo?.common?.viewAll || "View All"}</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {pendingApplications.length === 0 ? (
                    <div className="text-center py-6">
                      <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">{dict.ngo?.dashboard?.noPendingApplications || "No pending applications"}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingApplications.slice(0, 5).map((application) => (
                        <div key={application._id?.toString()} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">V</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {dict.ngo?.dashboard?.newApplication || "New Application"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {new Date(application.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Button size="sm" variant="ghost" className="text-primary" asChild>
                            <Link href="/ngo/applications">{dict.ngo?.common?.view || "View"}</Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recommended Volunteers - Best Matches */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      {dict.ngo?.dashboard?.bestMatches || "Best Matches"}
                    </CardTitle>
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/ngo/find-talent">{dict.ngo?.dashboard?.findMore || "Find More"}</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {recommendedVolunteers.length === 0 ? (
                    <div className="text-center py-6">
                      <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">{dict.ngo?.dashboard?.noMatchingAgents || "No matching impact agents yet"}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {dict.ngo?.dashboard?.postToGetMatched || "Post an opportunity to get matched"}
                      </p>
                      <Button variant="link" size="sm" asChild>
                        <Link href="/ngo/post-project">{dict.ngo?.common?.postOpportunity || "Post Opportunity"}</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recommendedVolunteers.slice(0, 4).map((match) => (
                        <Link
                          key={match.volunteerId}
                          href={`/ngo/find-talent`}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {match.volunteer.avatar ? (
                              <img src={match.volunteer.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-sm font-medium text-primary">
                                {match.volunteer.name?.charAt(0) || "V"}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {match.volunteer.name || dict.ngo?.common?.impactAgent || "Impact Agent"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {match.volunteer.headline || dict.ngo?.dashboard?.skilledProfessional || "Skilled professional"}
                            </p>
                          </div>
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
                            {match.score}%
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{dict.ngo?.dashboard?.quickActions || "Quick Actions"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/ngo/post-project">
                      <PlusCircle className="h-4 w-4 mr-2" />
                      {dict.ngo?.common?.postNewOpportunity || "Post New Opportunity"}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/ngo/find-talent">
                      <Users className="h-4 w-4 mr-2" />
                      {dict.ngo?.dashboard?.browseImpactAgents || "Browse Impact Agents"}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/ngo/messages">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      {dict.ngo?.common?.messages || "Messages"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Subscription Status */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      {dict.ngo?.dashboard?.subscription || "Subscription"}
                    </CardTitle>
                    {subscriptionStatus?.plan === "pro" && (
                      <Badge className="bg-gradient-to-r from-primary to-secondary text-white">
                        <Zap className="h-3 w-3 mr-1" />
                        {dict.ngo?.common?.pro || "PRO"}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {subscriptionStatus?.plan === "free" ? (
                    <>
                      <div className="p-4 rounded-lg bg-muted/50 border border-yellow-200">
                        <div className="flex items-center gap-2 text-yellow-600 mb-2">
                          <Unlock className="h-4 w-4" />
                          <span className="text-sm font-medium">{dict.ngo?.dashboard?.freePlanNoUnlocks || "Free Plan - No Unlocks"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {dict.ngo?.dashboard?.upgradeToPro || "Upgrade to Pro to unlock impact agent profiles"}
                        </p>
                      </div>
                      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="text-sm font-medium text-foreground mb-1">
                          {dict.ngo?.dashboard?.upgradeForUnlimited || "Upgrade to Pro for unlimited unlocks"}
                        </p>
                        <p className="text-xs text-muted-foreground mb-3">
                          {dict.ngo?.dashboard?.viewContactDetails || "View contact details of any impact agent"}
                        </p>
                        <Button asChild size="sm" className="w-full">
                          <Link href="/checkout?plan=ngo-pro">
                            <Zap className="h-4 w-4 mr-2" />
                            {dict.ngo?.common?.upgradeToPro || "Upgrade to Pro"}
                          </Link>
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-5 w-5 text-primary" />
                        <span className="font-medium text-foreground">{dict.ngo?.dashboard?.proPlanActive || "Pro Plan Active"}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {dict.ngo?.dashboard?.unlimitedUnlocks || "Unlimited impact agent profile unlocks"}
                      </p>
                      {subscriptionStatus?.expiryDate && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {dict.ngo?.dashboard?.renews || "Renews: "}{new Date(subscriptionStatus.expiryDate).toLocaleDateString()}
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
