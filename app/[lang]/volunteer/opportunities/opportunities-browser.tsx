"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ApplyButton } from "@/app/[lang]/projects/[id]/apply-button"
import LocaleLink from "@/components/locale-link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { skillCategories, resolveSkillName } from "@/lib/skills-data"
import {
  X,
  Loader2,
  SlidersHorizontal,
  ChevronDown,
  MapPin,
  Clock,
  Calendar,
  Users,
} from "lucide-react"
import { UnifiedSearchBar } from "@/components/unified-search-bar"
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

const TIME_COMMITMENTS = [
  "1-5 hours/week",
  "5-10 hours/week",
  "10-20 hours/week",
  "20+ hours/week",
]

const WORK_MODES = [
  { value: "remote", label: "Remote" },
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
]

export function OpportunitiesBrowser() {
  const dict = useDictionary()
  const opp = dict.volunteer?.opportunities
  const common = dict.volunteer?.common

  const timeCommitmentLabels: Record<string, string> = {
    "1-5 hours/week": common?.time1to5 || "1-5 hours/week",
    "5-10 hours/week": common?.time5to10 || "5-10 hours/week",
    "10-20 hours/week": common?.time10to20 || "10-20 hours/week",
    "20+ hours/week": common?.time20plus || "20+ hours/week",
  }

  const workModeLabels: Record<string, string> = {
    remote: common?.remote || "Remote",
    onsite: common?.onsite || "On-site",
    hybrid: common?.hybrid || "Hybrid",
  }

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [selectedTimeCommitment, setSelectedTimeCommitment] = useState<string[]>([])
  const [selectedWorkMode, setSelectedWorkMode] = useState("")
  const [sortBy, setSortBy] = useState("newest")

  // ==========================================
  // UNIFIED SEARCH API
  // ==========================================
  const [unifiedMatchedIds, setUnifiedMatchedIds] = useState<string[] | null>(null)
  const [unifiedRelevanceOrder, setUnifiedRelevanceOrder] = useState<Map<string, number>>(new Map())
  const [isUnifiedSearching, setIsUnifiedSearching] = useState(false)
  const unifiedAbortRef = useRef<AbortController | null>(null)

  // Debounced unified search
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < 1) {
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
          `/api/unified-search?q=${encodeURIComponent(trimmed)}&types=opportunity&limit=50`,
          { signal: controller.signal }
        )
        const data = await res.json()
        if (data.success && !controller.signal.aborted) {
          // use mongoId when available since ES document IDs may differ
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

  // Fetch all projects
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch("/api/projects")
        if (res.ok) {
          const data = await res.json()
          setProjects(data.projects || [])
        }
      } catch (error) {
        console.error("Failed to fetch projects:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchProjects()
  }, [])

  // Toggle helpers
  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )
  }

  const toggleTimeCommitment = (time: string) => {
    setSelectedTimeCommitment((prev) =>
      prev.includes(time) ? prev.filter((t) => t !== time) : [...prev, time]
    )
  }

  const clearFilters = () => {
    setSelectedSkills([])
    setSelectedTimeCommitment([])
    setSelectedWorkMode("")
    setSearchQuery("")
  }

  const hasActiveFilters =
    selectedSkills.length > 0 || selectedTimeCommitment.length > 0 || selectedWorkMode !== ""

  const activeFilterCount =
    selectedSkills.length + selectedTimeCommitment.length + (selectedWorkMode ? 1 : 0)

  // Filter and sort
  const filteredProjects = useMemo(() => {
    let result = [...projects]

    // Search filter — powered by unified search API
    if (searchQuery.trim()) {
      if (unifiedMatchedIds !== null) {
        result = result.filter((project) => {
          const projectId = project._id?.toString() || project.id || ""
          return unifiedMatchedIds.includes(projectId)
        })
      } else {
        // API loading — basic client-side fallback
        const query = searchQuery.toLowerCase()
        result = result.filter((project) => {
          const titleMatch = project.title?.toLowerCase().includes(query)
          const descMatch = project.description?.toLowerCase().includes(query)
          const skillsMatch = project.skillsRequired?.some(
            (s) =>
              s.categoryId?.toLowerCase().includes(query) ||
              s.subskillId?.toLowerCase().includes(query)
          )
          const ngoMatch = project.ngo?.name?.toLowerCase().includes(query)
          return titleMatch || descMatch || skillsMatch || ngoMatch
        })
      }
    }

    // Skills filter (by category)
    if (selectedSkills.length > 0) {
      result = result.filter((project) => {
        const projectCategories = project.skillsRequired?.map((s) => s.categoryId) || []
        return selectedSkills.some((skill) => {
          const category = skillCategories.find((c) => c.name === skill)
          return projectCategories.includes(
            category?.id || skill.toLowerCase().replace(/\s+/g, "-")
          )
        })
      })
    }

    // Time commitment filter
    if (selectedTimeCommitment.length > 0) {
      result = result.filter((project) => {
        return selectedTimeCommitment.some((time) => {
          const projectTime = project.timeCommitment?.toLowerCase() || ""
          const filterTime = time.toLowerCase()
          if (filterTime.includes("1-5") && (projectTime.includes("1-5") || projectTime.includes("few hours"))) return true
          if (filterTime.includes("5-10") && projectTime.includes("5-10")) return true
          if (filterTime.includes("10-20") && projectTime.includes("10-20")) return true
          if (filterTime.includes("20+") && (projectTime.includes("20+") || projectTime.includes("full-time"))) return true
          return projectTime.includes(filterTime)
        })
      })
    }

    // Work mode filter
    if (selectedWorkMode && selectedWorkMode !== "all") {
      result = result.filter((project) => {
        const workMode = project.workMode?.toLowerCase() || ""
        return workMode === selectedWorkMode.toLowerCase()
      })
    }

    // Sorting
    switch (sortBy) {
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
      case "relevant":
      default:
        if (searchQuery.trim() && unifiedMatchedIds !== null) {
          result.sort((a, b) => {
            const idA = a._id?.toString() || a.id || ""
            const idB = b._id?.toString() || b.id || ""
            return (unifiedRelevanceOrder.get(idB) || 0) - (unifiedRelevanceOrder.get(idA) || 0)
          })
        }
        break
    }

    return result
  }, [
    projects,
    searchQuery,
    selectedSkills,
    selectedTimeCommitment,
    selectedWorkMode,
    sortBy,
    unifiedMatchedIds,
    unifiedRelevanceOrder,
  ])

  return (
    <div>
      {/* Search + Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <UnifiedSearchBar
            defaultType="opportunity"
            variant="default"
            placeholder={opp?.searchPlaceholder || "Search by title, skills, cause, or organization..."}
            value={searchQuery}
            onSearchChange={setSearchQuery}
            navigateOnSelect={false}
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={opp?.sortBy || "Sort by"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{opp?.sortNewest || "Newest First"}</SelectItem>
              <SelectItem value="relevant">{opp?.sortRelevant || "Most Relevant"}</SelectItem>
              <SelectItem value="closing">{opp?.sortClosing || "Closing Soon"}</SelectItem>
              <SelectItem value="popular">{opp?.sortPopular || "Most Popular"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Inline Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {/* Skills Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 bg-transparent">
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
              {common?.skills || "Skills"}
              {selectedSkills.length > 0 && (
                <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
                  {selectedSkills.length}
                </Badge>
              )}
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {skillCategories.map((category) => (
                <div key={category.name} className="flex items-center space-x-2">
                  <Checkbox
                    id={`opp-skill-${category.name}`}
                    checked={selectedSkills.includes(category.name)}
                    onCheckedChange={() => toggleSkill(category.name)}
                  />
                  <Label
                    htmlFor={`opp-skill-${category.name}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {category.name}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Time Commitment Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 bg-transparent">
              {opp?.filterTime || "Time"}
              {selectedTimeCommitment.length > 0 && (
                <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
                  {selectedTimeCommitment.length}
                </Badge>
              )}
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-3" align="start">
            <div className="space-y-2">
              {TIME_COMMITMENTS.map((time) => (
                <div key={time} className="flex items-center space-x-2">
                  <Checkbox
                    id={`opp-time-${time}`}
                    checked={selectedTimeCommitment.includes(time)}
                    onCheckedChange={() => toggleTimeCommitment(time)}
                  />
                  <Label
                    htmlFor={`opp-time-${time}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {timeCommitmentLabels[time] || time}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Work Mode Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 bg-transparent">
              {common?.workMode || "Work Mode"}
              {selectedWorkMode && (
                <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
                  1
                </Badge>
              )}
              <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-3" align="start">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="opp-mode-all"
                  checked={selectedWorkMode === ""}
                  onCheckedChange={() => setSelectedWorkMode("")}
                />
                <Label htmlFor="opp-mode-all" className="text-sm font-normal cursor-pointer">
                  {common?.any || "Any"}
                </Label>
              </div>
              {WORK_MODES.map((mode) => (
                <div key={mode.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`opp-mode-${mode.value}`}
                    checked={selectedWorkMode === mode.value}
                    onCheckedChange={() =>
                      setSelectedWorkMode((prev) => (prev === mode.value ? "" : mode.value))
                    }
                  />
                  <Label
                    htmlFor={`opp-mode-${mode.value}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {workModeLabels[mode.value] || mode.label}
                  </Label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear Filters */}
        {(hasActiveFilters || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground hover:text-foreground"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            {common?.clearAll || "Clear all"}
          </Button>
        )}
      </div>

      {/* Active Filter Badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {selectedSkills.map((skill) => (
            <Badge key={skill} variant="secondary" className="flex items-center gap-1 text-xs">
              {skill}
              <button onClick={() => toggleSkill(skill)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selectedTimeCommitment.map((time) => (
            <Badge key={time} variant="secondary" className="flex items-center gap-1 text-xs">
              {timeCommitmentLabels[time] || time}
              <button onClick={() => toggleTimeCommitment(time)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selectedWorkMode && (
            <Badge variant="secondary" className="flex items-center gap-1 text-xs">
              {workModeLabels[selectedWorkMode] || selectedWorkMode}
              <button onClick={() => setSelectedWorkMode("")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {opp?.showingOf || "Showing"}{" "}
          <span className="font-medium text-foreground">{filteredProjects.length}</span> {opp?.of || "of"}{" "}
          {projects.length} {opp?.opportunitiesLabel || "opportunities"}
          {isUnifiedSearching && <Loader2 className="inline h-3.5 w-3.5 animate-spin ml-2" />}
        </p>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg">
          <p className="text-muted-foreground">{opp?.noResults || "No opportunities found"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {hasActiveFilters || searchQuery
              ? (opp?.noResultsFilterHint || "Try adjusting your filters or search terms")
              : (opp?.noResultsHint || "Check back later for new opportunities")}
          </p>
          {(hasActiveFilters || searchQuery) && (
            <Button variant="outline" className="mt-4" onClick={clearFilters}>
              {opp?.clearFilters || "Clear Filters"}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => {
            const projectId = project._id?.toString() || project.id || ""
            return (
              <Card key={projectId} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <Badge variant="outline" className="text-xs">
                      {project.projectType}
                    </Badge>
                  </div>

                  <h3 className="font-semibold text-foreground mb-2 line-clamp-2">
                    {project.title}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {project.description}
                  </p>

                  <div className="space-y-2 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {project.workMode === "remote" ? (common?.remote || "Remote") : project.location || (common?.onsite || "On-site")}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {project.timeCommitment}
                    </div>
                    {project.deadline && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {common?.deadline || "Deadline:"} {new Date(project.deadline).toLocaleDateString()}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {project.applicantsCount || 0} {common?.applicants || "applicants"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-4">
                    {(project.skills || project.skillsRequired?.map((s) => s.subskillId) || []).slice(0, 3).map((skill: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {resolveSkillName(skill)}
                      </Badge>
                    ))}
                    {(project.skillsRequired?.length || 0) > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{(project.skillsRequired?.length || 0) - 3}
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <LocaleLink href={`/projects/${projectId}`}>
                        {common?.viewDetails || "View Details"}
                      </LocaleLink>
                    </Button>
                    <div className="flex-1">
                      <ApplyButton
                        projectId={projectId}
                        projectTitle={project.title}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
