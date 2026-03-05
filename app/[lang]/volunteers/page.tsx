"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { VolunteerCard } from "@/components/volunteers/volunteer-card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { skillCategories, causes } from "@/lib/skills-data"
import { SlidersHorizontal, X, Loader2 } from "lucide-react"
import { UnifiedSearchBar } from "@/components/unified-search-bar"
import { BrowseGridSkeleton } from "@/components/ui/page-skeletons"
import { useDictionary } from "@/components/dictionary-provider"
import type { VolunteerProfileView } from "@/lib/types"

export default function VolunteersPage() {
  const dict = useDictionary()
  const [volunteers, setVolunteers] = useState<VolunteerProfileView[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [selectedCauses, setSelectedCauses] = useState<string[]>([])
  const [selectedVolunteerType, setSelectedVolunteerType] = useState("")
  const [selectedWorkMode, setSelectedWorkMode] = useState("")
  const [sortBy, setSortBy] = useState("best-match")

  // ==========================================
  // UNIFIED SEARCH API — drives volunteer filtering
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
          `/api/unified-search?q=${encodeURIComponent(trimmed)}&types=volunteer&limit=50`,
          { signal: controller.signal }
        )
        const data = await res.json()
        if (data.success && !controller.signal.aborted) {
          // Use mongoId for reliable cross-referencing with volunteer list
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

  // Fetch volunteers
  useEffect(() => {
    async function fetchVolunteers() {
      try {
        const res = await fetch("/api/volunteers")
        if (res.ok) {
          const data = await res.json()
          setVolunteers(data.volunteers || [])
        }
      } catch (error) {
        console.error("Failed to fetch volunteers:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchVolunteers()
  }, [])

  // Toggle functions
  const toggleSkill = (skillId: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((s) => s !== skillId) : [...prev, skillId]
    )
  }

  const toggleCause = (causeId: string) => {
    setSelectedCauses((prev) =>
      prev.includes(causeId) ? prev.filter((c) => c !== causeId) : [...prev, causeId]
    )
  }

  const clearFilters = () => {
    setSelectedSkills([])
    setSelectedCauses([])
    setSelectedVolunteerType("")
    setSelectedWorkMode("")
    setSearchQuery("")
  }

  const hasActiveFilters =
    selectedSkills.length > 0 ||
    selectedCauses.length > 0 ||
    selectedVolunteerType !== "" ||
    selectedWorkMode !== ""

  // Filter and sort volunteers
  const filteredVolunteers = useMemo(() => {
    let result = [...volunteers]

    // Search filter — powered by unified search API
    if (searchQuery.trim()) {
      if (unifiedMatchedIds !== null) {
        // API results ready — filter by matched IDs
        result = result.filter((v) => unifiedMatchedIds.includes(v.id))
      } else {
        // API loading — basic client-side fallback
        const query = searchQuery.toLowerCase()
        result = result.filter((v) => {
          const nameMatch = v.name?.toLowerCase()?.includes(query)
          const bioMatch = v.bio?.toLowerCase()?.includes(query)
          const skillsMatch = v.skills?.some(
            (s) =>
              s.categoryId?.toLowerCase().includes(query) ||
              s.subskillId?.toLowerCase().includes(query)
          )
          const locationMatch = v.location?.toLowerCase()?.includes(query)
          const causeMatch = v.causes?.some((c) => c.toLowerCase().includes(query))
          return nameMatch || bioMatch || skillsMatch || locationMatch || causeMatch
        })
      }
    }

    // Skills filter (by category)
    if (selectedSkills.length > 0) {
      result = result.filter((v) => {
        const volCategoryIds = v.skills?.map((s) => s.categoryId) || []
        const volSubskillIds = v.skills?.map((s) => s.subskillId) || []
        return selectedSkills.some((skillId) => {
          return volCategoryIds.includes(skillId) || volSubskillIds.includes(skillId)
        })
      })
    }

    // Causes filter
    if (selectedCauses.length > 0) {
      result = result.filter((v) => {
        return selectedCauses.some((cause) => v.causes?.includes(cause))
      })
    }

    // Volunteer Type filter
    if (selectedVolunteerType && selectedVolunteerType !== "all") {
      result = result.filter((v) => v.volunteerType === selectedVolunteerType)
    }

    // Work Mode filter
    if (selectedWorkMode && selectedWorkMode !== "all") {
      result = result.filter((v) => v.workMode === selectedWorkMode)
    }

    // Sorting
    switch (sortBy) {
      case "rating":
        result.sort((a, b) => (b.rating || 0) - (a.rating || 0))
        break
      case "experienced":
        result.sort((a, b) => (b.completedProjects || 0) - (a.completedProjects || 0))
        break
      case "hours":
        result.sort((a, b) => (b.hoursContributed || 0) - (a.hoursContributed || 0))
        break
      case "best-match":
      default:
        // When search is active and API results are available, sort by API relevance
        if (searchQuery.trim() && unifiedMatchedIds !== null) {
          result.sort((a, b) => {
            return (unifiedRelevanceOrder.get(b.id) || 0) - (unifiedRelevanceOrder.get(a.id) || 0)
          })
        }
        break
    }

    return result
  }, [
    volunteers,
    searchQuery,
    selectedSkills,
    selectedCauses,
    selectedVolunteerType,
    selectedWorkMode,
    sortBy,
    unifiedMatchedIds,
    unifiedRelevanceOrder,
  ])

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Volunteer Type */}
      <div>
        <Label className="text-sm font-semibold text-foreground mb-3 block">{dict.volunteersListing?.impactAgentType || "Impact Agent Type"}</Label>
        <RadioGroup
          value={selectedVolunteerType || "all"}
          onValueChange={(value) => setSelectedVolunteerType(value === "all" ? "" : value)}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="type-all" />
            <Label htmlFor="type-all" className="text-sm font-normal cursor-pointer">
              {dict.volunteersListing?.allImpactAgents || "All Impact Agents"}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="free" id="type-free" />
            <Label htmlFor="type-free" className="text-sm font-normal cursor-pointer">
              {dict.volunteersListing?.proBono || "Pro Bono"}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="paid" id="type-paid" />
            <Label htmlFor="type-paid" className="text-sm font-normal cursor-pointer">
              {dict.volunteersListing?.paid || "Paid"}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="both" id="type-both" />
            <Label htmlFor="type-both" className="text-sm font-normal cursor-pointer">
              {dict.volunteersListing?.openToBoth || "Open to Both"}
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Work Mode */}
      <div>
        <Label className="text-sm font-semibold text-foreground mb-3 block">{dict.volunteersListing?.workMode || "Work Mode"}</Label>
        <RadioGroup
          value={selectedWorkMode || "all"}
          onValueChange={(value) => setSelectedWorkMode(value === "all" ? "" : value)}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="mode-all" />
            <Label htmlFor="mode-all" className="text-sm font-normal cursor-pointer">
              {dict.volunteersListing?.any || "Any"}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="remote" id="mode-remote" />
            <Label htmlFor="mode-remote" className="text-sm font-normal cursor-pointer">
              {dict.volunteersListing?.remote || "Remote"}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="onsite" id="mode-onsite" />
            <Label htmlFor="mode-onsite" className="text-sm font-normal cursor-pointer">
              {dict.volunteersListing?.onSite || "On-site"}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="hybrid" id="mode-hybrid" />
            <Label htmlFor="mode-hybrid" className="text-sm font-normal cursor-pointer">
              {dict.volunteersListing?.hybridMode || "Hybrid"}
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Skills */}
      <div>
        <Label className="text-sm font-semibold text-foreground mb-3 block">{dict.volunteersListing?.skills || "Skills"}</Label>
        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
          {skillCategories.map((category) => (
            <div key={category.id} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{category.name}</p>
              {category.subskills.slice(0, 4).map((skill) => (
                <div key={skill.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`filter-${skill.id}`}
                    checked={selectedSkills.includes(skill.id)}
                    onCheckedChange={() => toggleSkill(skill.id)}
                  />
                  <Label
                    htmlFor={`filter-${skill.id}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {skill.name}
                  </Label>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Causes */}
      <div>
        <Label className="text-sm font-semibold text-foreground mb-3 block">{dict.volunteersListing?.causes || "Causes"}</Label>
        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
          {causes.map((cause) => (
            <div key={cause.id} className="flex items-center space-x-2">
              <Checkbox
                id={`filter-cause-${cause.id}`}
                checked={selectedCauses.includes(cause.id)}
                onCheckedChange={() => toggleCause(cause.id)}
              />
              <Label
                htmlFor={`filter-cause-${cause.id}`}
                className="text-sm font-normal cursor-pointer flex items-center gap-1"
              >
                <span>{cause.icon}</span>
                {cause.name}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {hasActiveFilters && (
        <Button variant="outline" className="w-full bg-transparent" onClick={clearFilters}>
          <X className="h-4 w-4 mr-2" />
          {dict.volunteersListing?.clearAllFilters || "Clear all filters"}
        </Button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 py-12">
          <div className="container mx-auto px-4 md:px-6">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {dict.volunteersListing?.title || "Find Skilled Impact Agents"}
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                {dict.volunteersListing?.subtitle || "Connect with talented professionals ready to contribute their skills to your cause"}
              </p>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 md:px-6 py-8">
          {/* Search and Controls */}
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="flex-1">
              <UnifiedSearchBar
                defaultType="volunteer"
                allowedTypes={["volunteer"]}
                variant="default"
                placeholder={dict.volunteersListing?.searchPlaceholder || "Search by skills, location, or name..."}
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
                    {dict.volunteersListing?.filters || "Filters"}
                    {hasActiveFilters && (
                      <Badge className="ml-2 bg-primary text-primary-foreground">
                        {selectedSkills.length +
                          selectedCauses.length +
                          (selectedVolunteerType ? 1 : 0) +
                          (selectedWorkMode ? 1 : 0)}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 bg-background">
                  <SheetHeader>
                    <SheetTitle>{dict.volunteersListing?.filters || "Filters"}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6">
                    <FilterContent />
                  </div>
                </SheetContent>
              </Sheet>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32 sm:w-44">
                  <SelectValue placeholder={dict.volunteersListing?.sortBy || "Sort by"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best-match">{dict.volunteersListing?.bestMatch || "Best Match"}</SelectItem>
                  <SelectItem value="rating">{dict.volunteersListing?.highestRated || "Highest Rated"}</SelectItem>
                  <SelectItem value="experienced">{dict.volunteersListing?.mostExperienced || "Most Experienced"}</SelectItem>
                  <SelectItem value="hours">{dict.volunteersListing?.mostHours || "Most Hours"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className="text-sm text-muted-foreground">{dict.volunteersListing?.activeFilters || "Active filters:"}</span>
              {selectedSkills.map((skillId) => {
                let skillName = skillId
                for (const category of skillCategories) {
                  const found = category.subskills.find((s: { id: string; name: string }) => s.id === skillId)
                  if (found) { skillName = found.name; break }
                }
                return (
                  <Badge key={skillId} variant="secondary" className="flex items-center gap-1">
                    {skillName}
                    <button onClick={() => toggleSkill(skillId)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )
              })}
              {selectedCauses.map((causeId) => {
                const causeName = causes.find((c) => c.id === causeId)?.name || causeId
                return (
                  <Badge key={causeId} variant="secondary" className="flex items-center gap-1">
                    {causeName}
                    <button onClick={() => toggleCause(causeId)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )
              })}
              {selectedVolunteerType && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {selectedVolunteerType === "free"
                    ? (dict.volunteersListing?.proBono || "Pro Bono")
                    : selectedVolunteerType === "paid"
                    ? (dict.volunteersListing?.paid || "Paid")
                    : (dict.volunteersListing?.both || "Both")}
                  <button onClick={() => setSelectedVolunteerType("")}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {selectedWorkMode && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {selectedWorkMode.charAt(0).toUpperCase() + selectedWorkMode.slice(1)}
                  <button onClick={() => setSelectedWorkMode("")}>
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
                <h3 className="font-semibold text-foreground mb-4">{dict.volunteersListing?.filters || "Filters"}</h3>
                <FilterContent />
              </div>
            </aside>

            {/* Volunteers Grid */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-6">
                <p className="text-muted-foreground">
                  {(dict.volunteersListing?.showingTemplate || "Showing {shown} of {total} impact agents")
                    .replace("{shown}", String(filteredVolunteers.length))
                    .replace("{total}", String(volunteers.length))}
                  {isUnifiedSearching && (
                    <Loader2 className="inline h-4 w-4 animate-spin ml-2" />
                  )}
                </p>
              </div>

              {loading ? (
                <BrowseGridSkeleton columns={3} count={6} />
              ) : filteredVolunteers.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">{dict.volunteersListing?.noAgentsFound || "No impact agents found"}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {hasActiveFilters || searchQuery
                      ? (dict.volunteersListing?.tryAdjusting || "Try adjusting your filters or search terms")
                      : (dict.volunteersListing?.checkBackLater || "Check back later for new impact agents")}
                  </p>
                  {(hasActiveFilters || searchQuery) && (
                    <Button variant="outline" className="mt-4" onClick={clearFilters}>
                      {dict.volunteersListing?.clearFilters || "Clear Filters"}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredVolunteers.map((volunteer) => (
                    <VolunteerCard key={volunteer.id} volunteer={volunteer} />
                  ))}
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
