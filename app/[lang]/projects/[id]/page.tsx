import Link from "next/link"
import { notFound } from "next/navigation"
import { getDictionary } from "@/app/[lang]/dictionaries"
import type { Locale } from "@/lib/i18n-config"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getProject, getNGOById, getActiveProjects, hasAppliedToProject, isProjectSaved, getVolunteerProfile } from "@/lib/actions"
import { skillCategories } from "@/lib/skills-data"
import { ApplyButton } from "./apply-button"
import { SaveButton } from "./save-button"
import { ShareButton } from "@/components/share-button"
import {
  Clock,
  MapPin,
  Calendar,
  Users,
  CheckCircle,
  ArrowLeft,
  Building2,
  FileText,
  Eye,
  Briefcase,
  Download,
} from "lucide-react"

// Helper to get skill name
function getSkillName(categoryId: string, subskillId: string): string {
  const category = skillCategories.find((c) => c.id === categoryId)
  if (!category) return subskillId
  const subskill = category.subskills.find((s) => s.id === subskillId)
  return subskill?.name || subskillId
}

// Format date
function formatDate(date?: Date | string, flexibleText: string = "Flexible"): string {
  if (!date) return flexibleText
  const d = new Date(date)
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string; lang: string }> }) {
  const { id, lang } = await params
  const dict = await getDictionary(lang as Locale) as any;
  
  // Get project from database
  const project = await getProject(id)
  
  if (!project) {
    notFound()
  }
  
  // Get NGO profile
  const ngo = await getNGOById(project.ngoId)

  // Check if user has applied
  const hasApplied = await hasAppliedToProject(id)
  
  // Check if user has saved this project
  const isSaved = await isProjectSaved(id)

  // Get volunteer profile for AI features (may be null if not logged in or not a volunteer)
  const volunteerProfile = await getVolunteerProfile().catch(() => null)
  
  // Get similar projects (same cause or skills)
  const allProjects = await getActiveProjects(10)
  const similarProjects = allProjects
    .filter(p => p._id?.toString() !== id)
    .filter(p => 
      p.causes.some(c => project.causes.includes(c)) ||
      p.skillsRequired.some(s => 
        project.skillsRequired.some(ps => ps.categoryId === s.categoryId)
      )
    )
    .slice(0, 3)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Breadcrumb */}
        <div className="border-b border-border">
          <div className="container mx-auto px-4 md:px-6 py-4">
            <Link
              href="/projects"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {dict.projectDetail?.backToOpportunities || "Back to Opportunities"}
            </Link>
          </div>
        </div>

        <div className="container mx-auto px-4 md:px-6 py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Header */}
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Badge className="bg-blue-100 text-blue-700 capitalize">{project.projectType}</Badge>
                  <Badge variant="outline" className="capitalize">
                    <Briefcase className="h-3 w-3 mr-1" />
                    {project.workMode}
                  </Badge>
                  {project.location && (
                    <Badge variant="outline">
                      <MapPin className="h-3 w-3 mr-1" />
                      {project.location}
                    </Badge>
                  )}
                  <Badge 
                    variant={project.status === "active" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {project.status}
                  </Badge>
                </div>

                <h1 className="text-3xl font-bold text-foreground mb-4">{project.title}</h1>

                {ngo && (
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                      {ngo.logo ? (
                        <img
                          src={ngo.logo}
                          alt={ngo.orgName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Link 
                          href={`/ngos/${project.ngoId}`}
                          className="font-semibold text-foreground hover:text-primary transition-colors"
                        >
                          {ngo.orgName}
                        </Link>
                        {ngo.isVerified && <CheckCircle className="h-4 w-4 text-primary" />}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {ngo.isVerified ? (dict.projectDetail?.verifiedOrganization || "Verified Organization") : (dict.projectDetail?.organization || "Organization")}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Project Description */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    {dict.projectDetail?.opportunityDescription || "Opportunity Description"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="prose prose-slate max-w-none">
                  <div className="text-foreground leading-relaxed whitespace-pre-line">
                    {project.description}
                  </div>
                </CardContent>
              </Card>

              {/* Skills Required */}
              <Card>
                <CardHeader>
                  <CardTitle>{dict.projectDetail?.skillsRequired || "Skills Required"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {project.skillsRequired.map((skill, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <span className="font-medium text-foreground">
                          {getSkillName(skill.categoryId, skill.subskillId)}
                        </span>
                        <Badge 
                          variant={skill.priority === "must-have" ? "default" : "outline"}
                          className="capitalize"
                        >
                          {skill.priority.replace("-", " ")}
                        </Badge>
                      </div>
                    ))}
                    {project.skillsRequired.length === 0 && (
                      <p className="text-muted-foreground italic">{dict.projectDetail?.noSkillsRequired || "No specific skills required"}</p>
                    )}
                  </div>
                  
                  {project.experienceLevel && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{dict.projectDetail?.experienceLevel || "Experience Level"}</span>
                        <Badge variant="secondary" className="capitalize">
                          {project.experienceLevel}
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Causes */}
              {project.causes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{dict.projectDetail?.causes || "Causes"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {project.causes.map((cause, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="text-sm py-1 px-3"
                        >
                          {cause}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Project Documents */}
              {project.documents && project.documents.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      {dict.projectDetail?.opportunityDocuments || "Opportunity Documents"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {project.documents.map((doc, index) => (
                        <a
                          key={index}
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                                {doc.name}
                              </p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {doc.type.replace("application/", "").replace("text/", "")}
                              </p>
                            </div>
                          </div>
                          <Download className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* About the Organization */}
              {ngo && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      {(dict.projectDetail?.aboutOrg || "About {name}").replace("{name}", ngo.orgName || "")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {ngo.logo ? (
                          <img
                            src={ngo.logo}
                            alt={ngo.orgName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Building2 className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-foreground leading-relaxed">
                          {ngo.description || (dict.projectDetail?.orgFallbackDesc || "{name} is a registered nonprofit organization working to make a positive impact.").replace("{name}", ngo.orgName || "")}
                        </p>
                        {ngo.causes && ngo.causes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {ngo.causes.slice(0, 3).map((cause, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {cause}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <Button asChild variant="link" className="px-0 mt-2 text-primary">
                          <Link href={`/ngos/${project.ngoId}`}>
                            {dict.projectDetail?.viewOrgProfile || "View Organization Profile →"}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Apply Card - Sticky */}
              <Card className="lg:sticky lg:top-24">
                <CardContent className="p-6">
                  <div className="space-y-4 mb-6">
                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{dict.projectDetail?.timeCommitment || "Time Commitment"}</span>
                      </div>
                      <span className="font-medium text-foreground">{project.timeCommitment || (dict.projectDetail?.flexible || "Flexible")}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{dict.projectDetail?.duration || "Duration"}</span>
                      </div>
                      <span className="font-medium text-foreground">{project.duration || (dict.projectDetail?.flexible || "Flexible")}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{dict.projectDetail?.deadline || "Deadline"}</span>
                      </div>
                      <span className="font-medium text-foreground">{formatDate(project.deadline, dict.projectDetail?.flexible || "Flexible")}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Briefcase className="h-4 w-4" />
                        <span>{dict.projectDetail?.workMode || "Work Mode"}</span>
                      </div>
                      <span className="font-medium text-foreground capitalize">{project.workMode}</span>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{dict.projectDetail?.applications || "Applications"}</span>
                      </div>
                      <span className="font-medium text-foreground">{project.applicantsCount}</span>
                    </div>
                  </div>

                  {project.status === "active" ? (
                    <ApplyButton 
                      projectId={project._id?.toString() || id} 
                      projectTitle={project.title} 
                      hasApplied={hasApplied}
                      projectDescription={project.description}
                      projectSkills={project.skillsRequired?.map((s: any) => getSkillName(s.categoryId, s.subskillId)) || []}
                      volunteerName={volunteerProfile?.name || ""}
                      volunteerSkills={volunteerProfile?.skills?.map((s: any) => s.subskillId || s.categoryId || "") || []}
                      volunteerBio={volunteerProfile?.bio || ""}
                      deadline={project.deadline}
                    />
                  ) : (
                    <Button className="w-full" disabled>
                      {project.status === "completed" ? (dict.projectDetail?.opportunityCompleted || "Opportunity Completed") : 
                       project.status === "closed" ? (dict.projectDetail?.applicationsClosed || "Applications Closed") : 
                       (dict.projectDetail?.notAccepting || "Not Accepting Applications")}
                    </Button>
                  )}

                  <div className="flex gap-2 mt-3">
                    <SaveButton 
                      projectId={project._id?.toString() || id}
                      initialSaved={isSaved}
                    />
                    <ShareButton 
                      title={project.title}
                      description={project.description?.substring(0, 150) + "..."}
                      className="flex-1 bg-transparent"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Stats */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Eye className="h-4 w-4" />
                    <span>{(dict.projectDetail?.viewedCount || "{count} people viewed this opportunity").replace("{count}", String(project.viewsCount))}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Similar Projects */}
              {similarProjects.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{dict.projectDetail?.similarOpportunities || "Similar Opportunities"}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {similarProjects.map((p) => (
                      <Link
                        key={p._id?.toString()}
                        href={`/projects/${p._id?.toString()}`}
                        className="block p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
                      >
                        <p className="font-medium text-foreground text-sm mb-1 line-clamp-2">{p.title}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs capitalize">{p.projectType}</Badge>
                          <span className="text-xs text-muted-foreground">{p.timeCommitment}</span>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
