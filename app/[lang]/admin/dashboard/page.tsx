import { Suspense } from "react"
import Link from "next/link"
import { getDictionary } from "@/app/[lang]/dictionaries"
import { Locale } from "@/lib/i18n-config"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { getAdminAnalytics } from "@/lib/actions"
import { AnalyticsCharts } from "@/components/admin/analytics-charts"
import {
  Users,
  Building2,
  FolderKanban,
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  BarChart3,
  PieChart,
  Target,
  Zap,
  ArrowRight,
  Shield,
  MessageSquare,
  Eye,
  Calendar,
  Clock,
} from "lucide-react"

export default async function AdminDashboard({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale) as any;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">{dict.admin?.dashboard?.title || "Dashboard"}</h1>
          <p className="text-muted-foreground">
            {dict.admin?.dashboard?.subtitle || "Real-time overview of your platform's performance"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">{(dict.admin?.dashboard?.lastUpdated || "Last updated: {date}").replace("{date}", new Date().toLocaleString())}</span>
        </div>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent dict={dict} />
      </Suspense>
    </div>
  )
}

async function DashboardContent({ dict }: { dict: any }) {
  const analytics = await getAdminAnalytics()

  return (
    <>
      {/* Key Metrics Row */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title={dict.admin?.dashboard?.totalImpactAgents || "Total Impact Agents"}
          value={analytics.totalVolunteers}
          icon={Users}
          subtext={(dict.admin?.dashboard?.thisMonth || "+{count} this month").replace("{count}", `${analytics.recentVolunteers}`)}
          trend="up"
          trendValue={analytics.recentVolunteers > 0 ? `+${Math.round((analytics.recentVolunteers / Math.max(analytics.totalVolunteers - analytics.recentVolunteers, 1)) * 100)}%` : "0%"}
        />
        <MetricCard
          title={dict.admin?.dashboard?.totalNgos || "Total NGOs"}
          value={analytics.totalNGOs}
          icon={Building2}
          subtext={(dict.admin?.dashboard?.thisMonth || "+{count} this month").replace("{count}", `${analytics.recentNGOs}`)}
          trend="up"
          trendValue={analytics.recentNGOs > 0 ? `+${Math.round((analytics.recentNGOs / Math.max(analytics.totalNGOs - analytics.recentNGOs, 1)) * 100)}%` : "0%"}
        />
        <MetricCard
          title={dict.admin?.dashboard?.activeOpportunities || "Active Opportunities"}
          value={analytics.activeProjects}
          icon={FolderKanban}
          subtext={(dict.admin?.dashboard?.completed || "{count} completed").replace("{count}", `${analytics.completedProjects}`)}
          trend="up"
          trendValue={`+${analytics.recentProjects}`}
        />
        <MetricCard
          title={dict.admin?.dashboard?.applications || "Applications"}
          value={analytics.totalApplications}
          icon={FileText}
          subtext={(dict.admin?.dashboard?.pending || "{count} pending").replace("{count}", `${analytics.pendingApplications}`)}
          trend="up"
          trendValue={`+${analytics.recentApplications}`}
        />
        <MetricCard
          title={dict.admin?.dashboard?.totalRevenue || "Total Revenue"}
          value={`$${analytics.totalRevenue.toLocaleString()}`}
          icon={DollarSign}
          subtext={(dict.admin?.dashboard?.revenueThisMonth || "${amount} this month").replace("{amount}", analytics.monthlyRevenue.toLocaleString())}
          trend="up"
          trendValue={analytics.totalRevenue > 0 ? `+${Math.round((analytics.monthlyRevenue / analytics.totalRevenue) * 100)}%` : "0%"}
        />
      </div>

      {/* Conversion Metrics */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-600" />
                <span className="font-medium">{dict.admin?.dashboard?.ngoVerificationRate || "NGO Verification Rate"}</span>
              </div>
              <span className="text-2xl font-bold text-green-600">{analytics.ngoVerificationRate}%</span>
            </div>
            <Progress value={analytics.ngoVerificationRate} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {(dict.admin?.dashboard?.ngosVerified || "{verified} of {total} NGOs verified").replace("{verified}", `${analytics.verifiedNGOs}`).replace("{total}", `${analytics.totalNGOs}`)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                <span className="font-medium">{dict.admin?.dashboard?.projectSuccessRate || "Project Success Rate"}</span>
              </div>
              <span className="text-2xl font-bold text-blue-600">{analytics.projectSuccessRate}%</span>
            </div>
            <Progress value={analytics.projectSuccessRate} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {(dict.admin?.dashboard?.projectsCompleted || "{completed} of {total} projects completed").replace("{completed}", `${analytics.completedProjects}`).replace("{total}", `${analytics.totalProjects}`)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-600" />
                <span className="font-medium">{dict.admin?.dashboard?.applicationAcceptRate || "Application Accept Rate"}</span>
              </div>
              <span className="text-2xl font-bold text-purple-600">{analytics.applicationAcceptRate}%</span>
            </div>
            <Progress value={analytics.applicationAcceptRate} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {(dict.admin?.dashboard?.applicationsAccepted || "{accepted} of {total} applications accepted").replace("{accepted}", `${analytics.acceptedApplications}`).replace("{total}", `${analytics.totalApplications}`)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              {dict.admin?.dashboard?.recentActivity || "Recent Activity"}
            </CardTitle>
            <CardDescription>{dict.admin?.dashboard?.recentActivityDescription || "Real-time platform activity feed"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.recentActivity.length > 0 ? (
                analytics.recentActivity.map((activity: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      activity.type === "payment" ? "bg-green-500" :
                      activity.type === "volunteer_signup" ? "bg-blue-500" :
                      activity.type === "ngo_signup" ? "bg-purple-500" :
                      activity.type === "project_created" ? "bg-orange-500" :
                      "bg-primary"
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{activity.text}</p>
                      <p className="text-xs text-muted-foreground">{activity.timeAgo}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {activity.type.replace("_", " ")}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">{dict.admin?.dashboard?.noRecentActivity || "No recent activity"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              {dict.admin?.dashboard?.actionItems || "Action Items"}
            </CardTitle>
            <CardDescription>{dict.admin?.dashboard?.actionItemsDescription || "Tasks requiring your attention"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/admin/ngos?filter=pending">
                <div className="p-4 rounded-lg border bg-yellow-50 dark:bg-yellow-950/20 hover:bg-yellow-100 dark:hover:bg-yellow-950/40 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                      <div>
                        <p className="font-medium text-foreground">{dict.admin?.dashboard?.pendingNgoVerifications || "Pending NGO Verifications"}</p>
                        <p className="text-sm text-muted-foreground">{dict.admin?.dashboard?.reviewAndVerify || "Review and verify"}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{analytics.pendingNGOVerifications}</Badge>
                  </div>
                </div>
              </Link>
              
              <Link href="/admin/ngos?filter=pending">
                <div className="p-4 rounded-lg border hover:bg-muted transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-foreground">{dict.admin?.dashboard?.pendingApplications || "Pending Applications"}</p>
                        <p className="text-sm text-muted-foreground">{dict.admin?.dashboard?.awaitingNgoResponse || "Awaiting NGO response"}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{analytics.pendingApplications}</Badge>
                  </div>
                </div>
              </Link>
              
              <Link href="/admin/support">
                <div className="p-4 rounded-lg border hover:bg-muted transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-5 w-5 text-purple-600" />
                      <div>
                        <p className="font-medium text-foreground">{dict.admin?.dashboard?.supportTickets || "Support Tickets"}</p>
                        <p className="text-sm text-muted-foreground">{dict.admin?.dashboard?.userRequests || "User requests"}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">3</Badge>
                  </div>
                </div>
              </Link>
              
              <Link href="/admin/reports">
                <div className="p-4 rounded-lg border hover:bg-muted transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Eye className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="font-medium text-foreground">{dict.admin?.dashboard?.reportsToReview || "Reports to Review"}</p>
                        <p className="text-sm text-muted-foreground">{dict.admin?.dashboard?.contentUserReports || "Content/user reports"}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">2</Badge>
                  </div>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insights Row */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* Skills in Demand */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              {dict.admin?.dashboard?.skillsInDemand || "Skills in Demand"}
            </CardTitle>
            <CardDescription>{dict.admin?.dashboard?.skillsInDemandDescription || "Most requested skills from active opportunities"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.skillsInDemand.length > 0 ? (
                analytics.skillsInDemand.map((skill: any, i: number) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-32 text-sm font-medium truncate">{skill.skill}</div>
                    <div className="flex-1">
                      <Progress 
                        value={(skill.count / (analytics.skillsInDemand[0]?.count || 1)) * 100} 
                        className="h-2"
                      />
                    </div>
                    <div className="w-8 text-sm text-muted-foreground text-right">{skill.count}</div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">{dict.admin?.dashboard?.noDataAvailable || "No data available"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Causes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              {dict.admin?.dashboard?.topCauses || "Top Causes"}
            </CardTitle>
            <CardDescription>{dict.admin?.dashboard?.topCausesDescription || "Most popular cause categories"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.topCauses.length > 0 ? (
                analytics.topCauses.map((cause: any, i: number) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-32 text-sm font-medium truncate">{cause.cause}</div>
                    <div className="flex-1">
                      <Progress 
                        value={(cause.count / (analytics.topCauses[0]?.count || 1)) * 100} 
                        className="h-2"
                      />
                    </div>
                    <div className="w-8 text-sm text-muted-foreground text-right">{cause.count}</div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">{dict.admin?.dashboard?.noDataAvailable || "No data available"}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation */}
      <Card>
        <CardHeader>
          <CardTitle>{dict.admin?.dashboard?.quickNavigation || "Quick Navigation"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/admin/users">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {dict.admin?.dashboard?.manageUsers || "Manage Users"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin/projects">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4" />
                  {dict.admin?.dashboard?.allProjects || "All Projects"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin/payments">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {dict.admin?.dashboard?.payments || "Payments"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin/settings">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  {dict.admin?.dashboard?.settings || "Settings"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Charts (client-side, loaded async) */}
      <AnalyticsCharts />
    </>
  )
}

function MetricCard({
  title,
  value,
  icon: Icon,
  subtext,
  trend,
  trendValue,
}: {
  title: string
  value: string | number
  icon: any
  subtext: string
  trend: "up" | "down"
  trendValue: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <span
            className={`text-xs font-medium flex items-center gap-0.5 ${
              trend === "up" ? "text-green-600" : "text-red-600"
            }`}
          >
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {trendValue}
          </span>
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
      </CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-24 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-16 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
