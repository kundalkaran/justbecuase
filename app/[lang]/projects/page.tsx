"use client"

import { useState, useEffect, useMemo, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProjectCard } from "@/components/project-card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { skillCategories, resolveSkillName } from "@/lib/skills-data"
import { SlidersHorizontal, Grid3X3, List, X, Loader2 } from "lucide-react"
import { UnifiedSearchBar } from "@/components/unified-search-bar"
import { BrowseGridSkeleton } from "@/components/ui/page-skeletons"
import { useDictionary } from "@/components/dictionary-provider"

interface Project {
  _id?: { toString: () => string }
  id?: string
  title: string
  description: string
  skillsRequired: { categoryId: string; subskillId: string }[]
  ngoId: string
  status: string
  workMode: string
  location?: string
  timeCommitment: string
  deadline?: Date
  projectType: string
  applicantsCount: number
  createdAt: Date
  ngo?: {
    name: string
    logo?: string
    verified?: boolean
  }
  skills?: string[]
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <ProjectsContent />
    </Suspense>
  )
}

function ProjectsContent() {
  const searchParams = useSearchParams()
  const dict = useDictionary()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [selectedTimeCommitment, setSelectedTimeCommitment] = useState<string[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>("")
  const [sortBy, setSortBy] = useState("bestMatch")
  const [isPersonalized, setIsPersonalized] = useState(false)
  // Map of projectId → { score, matchReasons }
  const [matchScores, setMatchScores] = useState<Map<string, { score: number; matchReasons: string[] }>>(new Map())

  // ==========================================
  // UNIFIED SEARCH API — drives project filtering
  // When user types, calls the powerful unified search API
  // (synonyms, multi-strategy, fuzzy, 30+ fields)
  // and uses returned IDs to filter the local project list.
  // ==========================================
  const [unifiedMatchedIds, setUnifiedMatchedIds] = useState<string[] | null>(null)
  const [unifiedRelevanceOrder, setUnifiedRelevanceOrder] = useState<Map<string, number>>(new Map())
  const [isUnifiedSearching, setIsUnifiedSearching] = useState(false)
  const unifiedAbortRef = useRef<AbortController | null>(null)

  // Debounced unified search
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < 2) {
      setUnifiedMatchedIds(null)
      setUnifiedRelevanceOrder(new Map())
      return
    }

    const timer = setTimeout(async () => {
      unifiedAbortRef.current?.abort()
      const controller = new AbortController()
      unifiedAbortRef.current = controller

      setIsUnifiedSearching(true)
      try {
        const res = await fetch(
          `/api/unified-search?q=${encodeURIComponent(trimmed)}&types=opportunity&limit=100`,
          { signal: controller.signal }
        )
        const data = await res.json()
        if (data.success && !controller.signal.aborted) {
          // Use mongoId for reliable cross-referencing with local project list
          const ids = (data.results || []).map((r: any) => r.mongoId || r.id)
          setUnifiedMatchedIds(ids)
          const orderMap = new Map<string, number>()
          ids.forEach((id: string, idx: number) => orderMap.set(id, ids.length - idx))
          setUnifiedRelevanceOrder(orderMap)
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Unified search failed:", err)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsUnifiedSearching(false)
        }
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    return () => { unifiedAbortRef.current?.abort() }
  }, [])

  // Read initial search query from URL
  useEffect(() => {
    const q = searchParams.get("q")
    if (q) {
      setSearchQuery(q)
    }
  }, [searchParams])

  useEffect(() => {
    async function fetchProjects() {
      try {
        // Try personalized endpoint first (works for logged-in volunteers)
        let personalized = false
        try {
          const pRes = await fetch("/api/projects/personalized")
          if (pRes.ok) {
            const pData = await pRes.json()
            if (pData.success && pData.opportunities?.length > 0) {
              const scoreMap = new Map<string, { score: number; matchReasons: string[] }>()
              const projectList = pData.opportunities.map((opp: any) => {
                const p = opp.project
                const pid = p._id?.toString?.() || p.id || opp.projectId
                scoreMap.set(pid, { score: opp.score, matchReasons: opp.matchReasons || [] })
                return { ...p, _id: p._id || { toString: () => pid }, id: pid }
              })
              setProjects(projectList)
              setMatchScores(scoreMap)
              setIsPersonalized(true)
              personalized = true
            }
          }
        } catch {
          // Personalized endpoint failed — fall back silently
        }

        // Fallback to regular endpoint
        if (!personalized) {
          const res = await fetch("/api/projects")
          if (res.ok) {
            const data = await res.json()
            setProjects(data.projects || [])
          }
        }
      } catch (error) {
        console.error("Failed to fetch projects:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchProjects()
  }, [])

  const timeCommitments = ["1-5 hours/week", "5-10 hours/week", "10-20 hours/week", "20+ hours/week"]
  const locations = ["Remote", "On-site", "Hybrid"]

  const timeCommitmentLabels: Record<string, string> = {
    "1-5 hours/week": dict.projectsListing?.hours1to5 || "1-5 hours/week",
    "5-10 hours/week": dict.projectsListing?.hours5to10 || "5-10 hours/week",
    "10-20 hours/week": dict.projectsListing?.hours10to20 || "10-20 hours/week",
    "20+ hours/week": dict.projectsListing?.hours20plus || "20+ hours/week",
  }

  const locationLabels: Record<string, string> = {
    "Remote": dict.projectsListing?.remote || "Remote",
    "On-site": dict.projectsListing?.onSite || "On-site",
    "Hybrid": dict.projectsListing?.hybrid || "Hybrid",
  }

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]))
  }

  const toggleTimeCommitment = (time: string) => {
    setSelectedTimeCommitment((prev) => (prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time]))
  }

  const clearFilters = () => {
    setSelectedSkills([])
    setSelectedTimeCommitment([])
    setSelectedLocation("")
    setSearchQuery("")
  }

  const hasActiveFilters = selectedSkills.length > 0 || selectedTimeCommitment.length > 0 || selectedLocation !== ""

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    let result = [...projects]
    
    // Search filter — powered by unified search API
    if (searchQuery.trim().length >= 2) {
      if (unifiedMatchedIds !== null) {
        // API results ready — filter by matched IDs
        result = result.filter((project) => {
          const projectId = project._id?.toString() || project.id || ""
          return unifiedMatchedIds.includes(projectId)
        })
      } else {
        // API loading — basic client-side fallback (title + skills only, not description)
        const queryTerms = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length >= 2)
        result = result.filter((project) => {
          const title = project.title?.toLowerCase() || ""
          const ngoName = project.ngo?.name?.toLowerCase() || ""
          const skillTexts = project.skillsRequired?.map(s => 
            `${s.categoryId} ${s.subskillId}`.toLowerCase()
          ).join(" ") || ""
          const searchable = `${title} ${ngoName} ${skillTexts}`
          return queryTerms.some(term => searchable.includes(term))
        })
      }
    }
    
    // Skills filter (by category)
    if (selectedSkills.length > 0) {
      result = result.filter((project) => {
        const projectCategories = project.skillsRequired?.map(s => s.categoryId) || []
        return selectedSkills.some(skill => {
          const category = skillCategories.find(c => c.name === skill)
          return projectCategories.includes(category?.id || skill.toLowerCase().replace(/\s+/g, '-'))
        })
      })
    }
    
    // Time commitment filter
    if (selectedTimeCommitment.length > 0) {
      result = result.filter((project) => {
        return selectedTimeCommitment.some(time => {
          const projectTime = project.timeCommitment?.toLowerCase() || ""
          const filterTime = time.toLowerCase()
          // Match similar time ranges
          if (filterTime.includes("1-5") && (projectTime.includes("1-5") || projectTime.includes("few hours"))) return true
          if (filterTime.includes("5-10") && projectTime.includes("5-10")) return true
          if (filterTime.includes("10-20") && projectTime.includes("10-20")) return true
          if (filterTime.includes("20+") && (projectTime.includes("20+") || projectTime.includes("full-time"))) return true
          return projectTime.includes(filterTime)
        })
      })
    }
    
    // Location/Work mode filter
    if (selectedLocation && selectedLocation !== "all") {
      result = result.filter((project) => {
        const workMode = project.workMode?.toLowerCase() || ""
        const location = project.location?.toLowerCase() || ""
        const filterLocation = selectedLocation.toLowerCase()
        return workMode === filterLocation || location.includes(filterLocation)
      })
    }
    
    // Sorting — auto-use relevance when searching
    const effectiveSort = (searchQuery.trim().length >= 2 && unifiedMatchedIds !== null && sortBy === "bestMatch") ? "relevant" : sortBy
    switch (effectiveSort) {
      case "newest":
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case "closing":
        result.sort((a, b) => {
          if (!a.deadline) return 1
          if (!b.deadline) return -1
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        })
        break
      case "popular":
        result.sort((a, b) => (b.applicantsCount || 0) - (a.applicantsCount || 0))
        break
      case "bestMatch":
        // Sort by personalization score if available, then by date
        if (isPersonalized && matchScores.size > 0) {
          result.sort((a, b) => {
            const idA = a._id?.toString() || a.id || ""
            const idB = b._id?.toString() || b.id || ""
            const scoreA = matchScores.get(idA)?.score || 0
            const scoreB = matchScores.get(idB)?.score || 0
            if (scoreA !== scoreB) return scoreB - scoreA
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          })
        } else {
          result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        }
        break
      case "relevant":
        // When search is active and API results are available, sort by API relevance
        if (searchQuery.trim().length >= 2 && unifiedMatchedIds !== null) {
          result.sort((a, b) => {
            const idA = a._id?.toString() || a.id || ""
            const idB = b._id?.toString() || b.id || ""
            return (unifiedRelevanceOrder.get(idB) || 0) - (unifiedRelevanceOrder.get(idA) || 0)
          })
        }
        break
    }
    
    return result
  }, [projects, searchQuery, selectedSkills, selectedTimeCommitment, selectedLocation, sortBy, unifiedMatchedIds, unifiedRelevanceOrder, isPersonalized, matchScores])

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Skills */}
      <div>
        <Label className="text-sm font-semibold text-foreground mb-3 block">{dict.projectsListing?.skills || "Skills"}</Label>
        <div className="space-y-2">
          {skillCategories.map((category) => (
            <div key={category.name} className="flex items-center space-x-2">
              <Checkbox
                id={category.name}
                checked={selectedSkills.includes(category.name)}
                onCheckedChange={() => toggleSkill(category.name)}
              />
              <label
                htmlFor={category.name}
                className="text-sm text-foreground cursor-pointer flex-1 flex items-center justify-between"
              >
                <span>{category.name}</span>
                <span className="text-muted-foreground text-xs">{(dict.projectsListing?.skillsCount || "({count} skills)").replace("{count}", category.subskills.length.toString())}</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Time Commitment */}
      <div>
        <Label className="text-sm font-semibold text-foreground mb-3 block">{dict.projectsListing?.timeCommitment || "Time Commitment"}</Label>
        <div className="space-y-2">
          {timeCommitments.map((time) => (
            <div key={time} className="flex items-center space-x-2">
              <Checkbox
                id={time}
                checked={selectedTimeCommitment.includes(time)}
                onCheckedChange={() => toggleTimeCommitment(time)}
              />
              <label htmlFor={time} className="text-sm text-foreground cursor-pointer">
                {timeCommitmentLabels[time] || time}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Location */}
      <div>
        <Label className="text-sm font-semibold text-foreground mb-3 block">{dict.projectsListing?.location || "Location"}</Label>
        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
          <SelectTrigger>
            <SelectValue placeholder={dict.projectsListing?.allLocations || "All locations"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{dict.projectsListing?.allLocations || "All locations"}</SelectItem>
            {locations.map((location) => (
              <SelectItem key={location} value={location}>
                {locationLabels[location] || location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters && (
        <Button variant="outline" className="w-full bg-transparent" onClick={clearFilters}>
          <X className="h-4 w-4 mr-2" />
          {dict.projectsListing?.clearAllFilters || "Clear all filters"}
        </Button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Header */}
        <div className="border-b border-border bg-muted/30">
          <div className="container mx-auto px-4 md:px-6 py-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">{dict.projectsListing?.title || "Browse Opportunities"}</h1>
            <p className="text-muted-foreground">{dict.projectsListing?.subtitle || "Find opportunities that match your skills and interests"}</p>
          </div>
        </div>

        <div className="container mx-auto px-4 md:px-6 py-8">
          {/* Search and Controls */}
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="flex-1">
              <UnifiedSearchBar
                defaultType="opportunity"
                allowedTypes={["opportunity"]}
                variant="default"
                placeholder={dict.projectsListing?.searchPlaceholder || "Search opportunities, skills, or organizations..."}
                value={searchQuery}
                onSearchChange={setSearchQuery}
                navigateOnSelect={false}
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Mobile Filter Button */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="lg:hidden bg-transparent">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    {dict.projectsListing?.filters || "Filters"}
                    {hasActiveFilters && (
                      <Badge className="ml-2 bg-primary text-primary-foreground">
                        {selectedSkills.length + selectedTimeCommitment.length + (selectedLocation ? 1 : 0)}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 bg-background">
                  <SheetHeader>
                    <SheetTitle>{dict.projectsListing?.filters || "Filters"}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6">
                    <FilterContent />
                  </div>
                </SheetContent>
              </Sheet>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-28 sm:w-40">
                  <SelectValue placeholder={dict.projectsListing?.sortBy || "Sort by"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bestMatch">{isPersonalized ? "Best Match" : (dict.projectsListing?.newestFirst || "Newest First")}</SelectItem>
                  <SelectItem value="newest">{dict.projectsListing?.newestFirst || "Newest First"}</SelectItem>
                  <SelectItem value="relevant">{dict.projectsListing?.mostRelevant || "Most Relevant"}</SelectItem>
                  <SelectItem value="closing">{dict.projectsListing?.closingSoon || "Closing Soon"}</SelectItem>
                  <SelectItem value="popular">{dict.projectsListing?.mostPopular || "Most Popular"}</SelectItem>
                </SelectContent>
              </Select>

              <div className="hidden sm:flex items-center border border-border rounded-lg p-1">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className="text-sm text-muted-foreground">{dict.projectsListing?.activeFilters || "Active filters:"}</span>
              {selectedSkills.map((skill) => (
                <Badge key={skill} variant="secondary" className="flex items-center gap-1">
                  {skill}
                  <button onClick={() => toggleSkill(skill)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {selectedTimeCommitment.map((time) => (
                <Badge key={time} variant="secondary" className="flex items-center gap-1">
                  {timeCommitmentLabels[time] || time}
                  <button onClick={() => toggleTimeCommitment(time)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {selectedLocation && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {locationLabels[selectedLocation] || selectedLocation}
                  <button onClick={() => setSelectedLocation("")}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}

          <div className="flex gap-8">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:block w-64 flex-shrink-0">
              <div className="sticky top-24 bg-card border border-border rounded-xl p-6">
                <h3 className="font-semibold text-foreground mb-4">{dict.projectsListing?.filters || "Filters"}</h3>
                <FilterContent />
              </div>
            </aside>

            {/* Projects Grid/List */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-6">
                <p className="text-muted-foreground">
                  {(dict.projectsListing?.showingTemplate || "Showing {shown} of {total} opportunities").replace("{shown}", filteredProjects.length.toString()).replace("{total}", projects.length.toString())}
                </p>
              </div>

              {loading ? (
                <BrowseGridSkeleton columns={3} count={6} />
              ) : filteredProjects.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">{dict.projectsListing?.noOpportunitiesFound || "No opportunities found"}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {hasActiveFilters ? (dict.projectsListing?.tryAdjustingFilters || "Try adjusting your filters") : (dict.projectsListing?.checkBackLater || "Check back later for new opportunities")}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="outline" className="mt-4" onClick={clearFilters}>
                      {dict.projectsListing?.clearFilters || "Clear Filters"}
                    </Button>
                  )}
                </div>
              ) : (
                <div className={viewMode === "grid" ? "grid sm:grid-cols-2 xl:grid-cols-3 gap-6" : "space-y-4"}>
                  {filteredProjects.map((project) => {
                    const pid = project._id?.toString() || project.id || ""
                    const scoreData = matchScores.get(pid)
                    return (
                    <ProjectCard key={pid} project={{
                      id: pid,
                      title: project.title,
                      description: project.description,
                      skills: (project.skills || project.skillsRequired?.map(s => s.subskillId) || []).map(resolveSkillName),
                      location: project.workMode === "remote" ? (dict.projectsListing?.remote || "Remote") : project.location || (dict.projectsListing?.onSite || "On-site"),
                      timeCommitment: project.timeCommitment,
                      applicants: project.applicantsCount || 0,
                      postedAt: project.createdAt ? new Date(project.createdAt).toLocaleDateString() : (dict.projectsListing?.recently || "Recently"),
                      projectType: project.projectType,
                      ngo: project.ngo || { name: dict.projectsListing?.ngoFallback || "NGO", verified: false },
                      matchScore: scoreData?.score,
                      matchReasons: scoreData?.matchReasons,
                    }} />
                    )
                  })}
                </div>
              )}

              {/* Load More */}
              {projects.length > 0 && (
                <div className="mt-12 text-center">
                  <Button variant="outline" size="lg">
                    {dict.projectsListing?.loadMore || "Load More Opportunities"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
