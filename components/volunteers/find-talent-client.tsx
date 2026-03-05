"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
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

import LocaleLink from "@/components/locale-link"
import {
  MapPin,
  Clock,
  Star,
  Crown,
  DollarSign,
  Heart,
  MessageSquare,
  Sparkles,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  CheckCircle,
  Zap,
  Loader2,
  Wand2,
} from "lucide-react"
import { skillCategories } from "@/lib/skills-data"
import { getCurrencySymbol } from "@/lib/currency"
import { UnifiedSearchBar } from "@/components/unified-search-bar"

// ==========================================
// SKILL NAME TO ID MAPPING
// Build a lookup map from human-readable skill names to skill IDs
// ==========================================

const skillNameToIdMap: Map<string, string> = new Map()
const skillIdToNameMap: Map<string, string> = new Map()

// Populate the maps
skillCategories.forEach(cat => {
  // Add category mappings
  skillNameToIdMap.set(cat.name.toLowerCase(), cat.id)
  skillIdToNameMap.set(cat.id, cat.name)
  
  cat.subskills.forEach(sub => {
    // Add subskill mappings
    skillNameToIdMap.set(sub.name.toLowerCase(), sub.id)
    skillIdToNameMap.set(sub.id, sub.name)
    
    // Also add partial matches (e.g., "graphic design" -> "graphic-design")
    // Handle words separately for better matching
    const words = sub.name.toLowerCase().split(/\s+/)
    words.forEach(word => {
      if (word.length > 2 && !skillNameToIdMap.has(word)) {
        // Map significant words to the skill ID (first match wins)
        skillNameToIdMap.set(word, sub.id)
      }
    })
  })
})

// Helper function to find matching skill IDs from a search term
function findMatchingSkillIds(term: string): string[] {
  const lowercaseTerm = term.toLowerCase()
  const matches: string[] = []
  
  // Direct match in name map
  if (skillNameToIdMap.has(lowercaseTerm)) {
    matches.push(skillNameToIdMap.get(lowercaseTerm)!)
  }
  
  // Partial matches
  skillNameToIdMap.forEach((skillId, skillName) => {
    if (skillName.includes(lowercaseTerm) || lowercaseTerm.includes(skillName)) {
      if (!matches.includes(skillId)) {
        matches.push(skillId)
      }
    }
  })
  
  // Also check skill IDs directly
  skillIdToNameMap.forEach((_, skillId) => {
    if (skillId.includes(lowercaseTerm) || lowercaseTerm.includes(skillId)) {
      if (!matches.includes(skillId)) {
        matches.push(skillId)
      }
    }
  })
  
  return matches
}

// Get human-readable skill name from ID
function getSkillDisplayName(skillId: string): string {
  return skillIdToNameMap.get(skillId) || skillId.replace(/-/g, ' ')
}

// ==========================================
// ADVANCED SEARCH TYPES & UTILITIES
// ==========================================

interface Volunteer {
  id: string
  userId?: string
  name?: string
  avatar?: string
  headline?: string
  location?: string
  city?: string
  country?: string
  hoursPerWeek?: number
  skills?: { categoryId: string; subskillId: string; level?: string }[]
  volunteerType?: "free" | "paid" | "both"
  hourlyRate?: number
  discountedRate?: number
  currency?: string
  rating?: number
  completedProjects?: number
  freeHoursPerMonth?: number
}

interface SearchFilters {
  minRating: number
  minHoursPerWeek: number
  maxHoursPerWeek: number
  minProjects: number
  verifiedOnly: boolean
  hasDiscountedRate: boolean
  maxHourlyRate: number
  experienceLevel: "all" | "beginner" | "intermediate" | "expert"
  hasFreeHours: boolean
}

type SortOption = "relevance" | "rating" | "projects" | "rate-low" | "rate-high" | "hours"

// Fuzzy match function - handles typos with Levenshtein distance
function fuzzyMatch(str: string, pattern: string, threshold: number = 2): boolean {
  if (!str || !pattern) return false
  str = str.toLowerCase()
  pattern = pattern.toLowerCase()
  
  // Exact match or contains
  if (str.includes(pattern)) return true
  
  // For short patterns, require exact match
  if (pattern.length < 3) return str.includes(pattern)
  
  // Levenshtein distance for fuzzy matching
  const matrix: number[][] = []
  for (let i = 0; i <= pattern.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= str.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= pattern.length; i++) {
    for (let j = 1; j <= str.length; j++) {
      const cost = pattern[i - 1] === str[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  
  // Check if any substring matches within threshold
  const minDist = Math.min(...matrix[pattern.length])
  return minDist <= threshold
}

// Parse advanced search query with operators
interface ParsedQuery {
  skills: string[]
  locations: string[]
  names: string[]
  generalTerms: string[]
  exactPhrases: string[]
  excludeTerms: string[]
  orGroups: string[][]
}

function parseSearchQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {
    skills: [],
    locations: [],
    names: [],
    generalTerms: [],
    exactPhrases: [],
    excludeTerms: [],
    orGroups: [],
  }
  
  if (!query.trim()) return result
  
  // Extract exact phrases (quoted strings)
  const phraseRegex = /"([^"]+)"/g
  let match
  while ((match = phraseRegex.exec(query)) !== null) {
    result.exactPhrases.push(match[1].toLowerCase())
  }
  // Remove quoted phrases from query for further parsing
  let remainingQuery = query.replace(/"[^"]+"/g, " ")
  
  // Extract skill: operator
  const skillRegex = /skill:(\S+)/gi
  while ((match = skillRegex.exec(remainingQuery)) !== null) {
    result.skills.push(match[1].toLowerCase())
  }
  remainingQuery = remainingQuery.replace(/skill:\S+/gi, " ")
  
  // Extract location: operator
  const locationRegex = /location:(\S+)/gi
  while ((match = locationRegex.exec(remainingQuery)) !== null) {
    result.locations.push(match[1].toLowerCase())
  }
  remainingQuery = remainingQuery.replace(/location:\S+/gi, " ")
  
  // Extract name: operator
  const nameRegex = /name:(\S+)/gi
  while ((match = nameRegex.exec(remainingQuery)) !== null) {
    result.names.push(match[1].toLowerCase())
  }
  remainingQuery = remainingQuery.replace(/name:\S+/gi, " ")
  
  // Extract exclusions (-)
  const excludeRegex = /-(\S+)/g
  while ((match = excludeRegex.exec(remainingQuery)) !== null) {
    result.excludeTerms.push(match[1].toLowerCase())
  }
  remainingQuery = remainingQuery.replace(/-\S+/g, " ")
  
  // Handle OR groups
  const orParts = remainingQuery.split(/\s+OR\s+/i)
  if (orParts.length > 1) {
    result.orGroups = orParts.map(part => 
      part.trim().toLowerCase().split(/[,\s]+/).filter(t => t.length > 0)
    )
  } else {
    // Regular terms
    result.generalTerms = remainingQuery
      .toLowerCase()
      .split(/[,\s]+/)
      .filter(t => t.length > 0)
  }
  
  return result
}

// Calculate relevance score for sorting
function calculateRelevanceScore(volunteer: Volunteer, parsedQuery: ParsedQuery): number {
  let score = 0
  
  // Exact phrase matches score highest
  for (const phrase of parsedQuery.exactPhrases) {
    if (volunteer.name?.toLowerCase().includes(phrase)) score += 100
    if (volunteer.headline?.toLowerCase().includes(phrase)) score += 80
    if (volunteer.skills?.some(s => s.subskillId.toLowerCase().includes(phrase))) score += 90
    // Also check against skill display names
    if (volunteer.skills?.some(s => getSkillDisplayName(s.subskillId).toLowerCase().includes(phrase))) score += 85
  }
  
  // Skill operator matches
  for (const skill of parsedQuery.skills) {
    const matchingIds = findMatchingSkillIds(skill)
    if (volunteer.skills?.some(s => 
      s.subskillId.toLowerCase().includes(skill) || 
      s.categoryId.toLowerCase().includes(skill) ||
      matchingIds.includes(s.subskillId) ||
      matchingIds.includes(s.categoryId)
    )) {
      score += 50
    }
  }
  
  // Location operator matches
  for (const loc of parsedQuery.locations) {
    if (volunteer.location?.toLowerCase().includes(loc) ||
        volunteer.city?.toLowerCase().includes(loc) ||
        volunteer.country?.toLowerCase().includes(loc)) {
      score += 40
    }
  }
  
  // Name operator matches
  for (const name of parsedQuery.names) {
    if (volunteer.name?.toLowerCase().includes(name)) score += 60
  }
  
  // General term matches - ENHANCED with skill name matching
  for (const term of parsedQuery.generalTerms) {
    if (volunteer.name?.toLowerCase().includes(term)) score += 30
    if (volunteer.headline?.toLowerCase().includes(term)) score += 20
    if (volunteer.location?.toLowerCase().includes(term)) score += 15
    
    // Direct skill ID match
    if (volunteer.skills?.some(s => s.subskillId.toLowerCase().includes(term))) score += 25
    
    // Skill DISPLAY NAME match (e.g., "Graphic Design" matches "graphic-design")
    const matchingSkillIds = findMatchingSkillIds(term)
    if (volunteer.skills?.some(s => matchingSkillIds.includes(s.subskillId) || matchingSkillIds.includes(s.categoryId))) {
      score += 35 // Higher score for proper skill name matches
    }
    
    // Fuzzy match bonus (lower score for fuzzy)
    if (fuzzyMatch(volunteer.name || "", term)) score += 10
    if (volunteer.skills?.some(s => fuzzyMatch(s.subskillId, term))) score += 8
  }
  
  // Bonus for verified/high-quality profiles
  if (volunteer.rating && volunteer.rating >= 4.5) score += 20
  if ((volunteer.completedProjects || 0) >= 5) score += 15
  
  return score
}

// ==========================================
// MAIN COMPONENT
// ==========================================

interface FindTalentClientProps {
  volunteers: Volunteer[]
  subscriptionPlan: "free" | "pro"
}

export function FindTalentClient({ volunteers, subscriptionPlan }: FindTalentClientProps) {
  const searchParams = useSearchParams()
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [locationFilter, setLocationFilter] = useState<string>("all")
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>("relevance")
  const [isAISearching, setIsAISearching] = useState(false)
  const [aiSearchApplied, setAiSearchApplied] = useState(false)
  const [aiSkillFilters, setAiSkillFilters] = useState<string[]>([])
  const [aiCauseFilters, setAiCauseFilters] = useState<string[]>([])
  const [aiMatchedIds, setAiMatchedIds] = useState<string[]>([])
  const [aiLocationFilter, setAiLocationFilter] = useState<string | null>(null)

  // ==========================================
  // UNIFIED SEARCH API Ã¢â‚¬â€ drives the volunteer grid
  // When user types, we call the powerful unified search API
  // (synonyms, multi-strategy, fuzzy, 30+ fields)
  // and use returned IDs to filter the local volunteer list,
  // so advanced filters still work on top.
  // ==========================================
  const [unifiedMatchedIds, setUnifiedMatchedIds] = useState<string[] | null>(null)
  const [unifiedRelevanceOrder, setUnifiedRelevanceOrder] = useState<Map<string, number>>(new Map())
  const [isUnifiedSearching, setIsUnifiedSearching] = useState(false)
  const unifiedAbortRef = useRef<AbortController | null>(null)

  // Debounced unified search Ã¢â‚¬â€ fires when searchQuery changes
  useEffect(() => {
    // Don't search when AI search is applied (AI has its own filters)
    if (aiSearchApplied) return

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
          // Use userId (Better Auth user ID) for cross-referencing with the
          // pre-loaded volunteer list whose IDs are userId, not MongoDB _id.
          // Fall back to mongoId/id for non-volunteer result types.
          const ids = (data.results || []).map((r: any) => r.userId || r.mongoId || r.id)
          setUnifiedMatchedIds(ids)
          // Store relevance order from API (index 0 = most relevant)
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

    return () => {
      clearTimeout(timer)
    }
  }, [searchQuery, aiSearchApplied])

  // Cleanup on unmount
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
  const [aiVolunteerType, setAiVolunteerType] = useState<string | null>(null)
  const [aiSearchIntent, setAiSearchIntent] = useState<string>("")
  
  // AI Search handler
  const handleAISearch = async () => {
    if (!searchQuery.trim() || searchQuery.length < 3) return
    setIsAISearching(true)
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      })
      const data = await res.json()
      if (data.success && data.data) {
        const f = data.data
        // Set all AI filters
        if (f.skills?.length) setAiSkillFilters(f.skills)
        if (f.causes?.length) setAiCauseFilters(f.causes)
        if (f.matchedVolunteerIds?.length) setAiMatchedIds(f.matchedVolunteerIds)
        if (f.location) setAiLocationFilter(f.location)
        if (f.volunteerType) setAiVolunteerType(f.volunteerType)
        if (f.searchIntent) setAiSearchIntent(f.searchIntent)
        if (f.workMode) setLocationFilter(f.workMode)
        if (f.minRating) setFilters(prev => ({ ...prev, minRating: f.minRating }))
        if (f.maxHourlyRate) setFilters(prev => ({ ...prev, maxHourlyRate: f.maxHourlyRate }))
        setAiSearchApplied(true)
      }
    } catch (err) {
      console.error("AI search failed:", err)
    } finally {
      setIsAISearching(false)
    }
  }

  const clearAISearch = () => {
    setAiSearchApplied(false)
    setAiSkillFilters([])
    setAiCauseFilters([])
    setAiMatchedIds([])
    setAiLocationFilter(null)
    setAiVolunteerType(null)
    setAiSearchIntent("")
    setSearchQuery("")
    setCategoryFilter("all")
    setLocationFilter("all")
    setFilters({
      minRating: 0,
      minHoursPerWeek: 0,
      maxHoursPerWeek: 40,
      minProjects: 0,
      verifiedOnly: false,
      hasDiscountedRate: false,
      maxHourlyRate: 500,
      experienceLevel: "all",
      hasFreeHours: false,
    })
  }
  
  // Advanced filters
  const [filters, setFilters] = useState<SearchFilters>({
    minRating: 0,
    minHoursPerWeek: 0,
    maxHoursPerWeek: 40,
    minProjects: 0,
    verifiedOnly: false,
    hasDiscountedRate: false,
    maxHourlyRate: 500,
    experienceLevel: "all",
    hasFreeHours: false,
  })

  // Separate volunteers by type
  const paidVolunteers = volunteers.filter((v) => v.volunteerType === "paid")
  const freeVolunteers = volunteers.filter((v) => v.volunteerType === "free" || v.volunteerType === "both")

  // Get unique locations
  const locations = useMemo(() => {
    const locs = new Set<string>()
    volunteers.forEach((v) => {
      if (v.location) locs.add(v.location)
      if (v.city) locs.add(v.city)
    })
    return Array.from(locs).filter(Boolean).slice(0, 10)
  }, [volunteers])

  // Parse the search query
  const parsedQuery = useMemo(() => parseSearchQuery(searchQuery), [searchQuery])

  // Advanced filter and search function
  // When a search query is active and API results are available,
  // we use unifiedMatchedIds to determine which volunteers match the search.
  // Advanced filters (rating, hourly rate, etc.) still apply on top.
  const filterAndScoreVolunteers = useCallback((vols: Volunteer[]): Array<Volunteer & { relevanceScore: number }> => {
    return vols
      .map(v => {
        let matches = true
        const volunteerId = v.userId || v.id
        
        // ==========================================
        // UNIFIED SEARCH API MATCHING
        // If the user typed a search query and API results are ready,
        // only show volunteers whose IDs were returned by the API.
        // This gives us synonym expansion, multi-strategy fuzzy,
        // 30+ field matching Ã¢â‚¬â€ the full power of the search engine.
        // ==========================================
        if (!aiSearchApplied && searchQuery.trim().length >= 1) {
          if (unifiedMatchedIds !== null) {
            // API results are ready Ã¢â‚¬â€ only include matched IDs
            if (!unifiedMatchedIds.includes(volunteerId)) {
              matches = false
            }
          } else {
            // API hasn't returned yet Ã¢â‚¬â€ fall back to basic client-side text match
            // so results don't flash empty while loading
            const query = searchQuery.toLowerCase()
            const nameMatch = v.name?.toLowerCase().includes(query)
            const headlineMatch = v.headline?.toLowerCase().includes(query)
            const locationMatch = v.location?.toLowerCase().includes(query) || v.city?.toLowerCase().includes(query)
            const skillMatch = v.skills?.some(s =>
              s.subskillId.toLowerCase().includes(query) ||
              s.categoryId.toLowerCase().includes(query) ||
              getSkillDisplayName(s.subskillId).toLowerCase().includes(query) ||
              getSkillDisplayName(s.categoryId).toLowerCase().includes(query)
            )
            // Also match multi-word queries against category names (e.g. "content creator" matches "content-creation-design")
            const categoryNameMatch = v.skills?.some(s => {
              const catName = getSkillDisplayName(s.categoryId).toLowerCase()
              return query.split(/\s+/).every(word => catName.includes(word) || s.categoryId.toLowerCase().includes(word))
            })
            if (!nameMatch && !headlineMatch && !locationMatch && !skillMatch && !categoryNameMatch) {
              matches = false
            }
          }
        }
        
        // ==========================================
        // DROPDOWN FILTERS
        // ==========================================
        
        if (categoryFilter && categoryFilter !== "all" && matches) {
          const hasCategory = v.skills?.some(s => {
            const categoryId = s.categoryId?.toLowerCase() || ""
            return categoryId.includes(categoryFilter.toLowerCase())
          })
          if (!hasCategory) matches = false
        }
        
        if (locationFilter && locationFilter !== "all" && matches) {
          const matchLocation = v.location?.toLowerCase().includes(locationFilter.toLowerCase()) ||
                               v.city?.toLowerCase().includes(locationFilter.toLowerCase())
          if (!matchLocation) matches = false
        }
        
        // ==========================================
        // ADVANCED FILTERS
        // ==========================================
        
        if (matches && filters.minRating > 0) {
          if ((v.rating || 0) < filters.minRating) matches = false
        }
        
        if (matches && filters.minProjects > 0) {
          if ((v.completedProjects || 0) < filters.minProjects) matches = false
        }
        
        if (matches && (v.hoursPerWeek || 10) < filters.minHoursPerWeek) {
          matches = false
        }
        
        if (matches && (v.hoursPerWeek || 10) > filters.maxHoursPerWeek) {
          matches = false
        }
        
        if (matches && filters.hasDiscountedRate) {
          if (!v.discountedRate || v.discountedRate <= 0) matches = false
        }
        
        if (matches && filters.maxHourlyRate < 500) {
          if ((v.hourlyRate || 0) > filters.maxHourlyRate) matches = false
        }
        
        if (matches && filters.experienceLevel !== "all") {
          const hasExpertise = v.skills?.some(s => s.level === filters.experienceLevel)
          if (!hasExpertise) matches = false
        }
        
        if (matches && filters.hasFreeHours) {
          if (!v.freeHoursPerMonth || v.freeHoursPerMonth <= 0) matches = false
        }

        // ==========================================
        // AI SEARCH FILTERS
        // When AI search is applied, use matched IDs from server-side DB search
        // as the primary filter. Fall back to skill-based filtering if no IDs.
        // ==========================================
        if (matches && aiSearchApplied) {
          if (aiMatchedIds.length > 0) {
            // Primary: Use server-side matched volunteer IDs
            const volunteerId = v.userId || v.id
            if (!aiMatchedIds.includes(volunteerId)) {
              matches = false
            }
          } else if (aiSkillFilters.length > 0) {
            // Fallback: Only filter by skills (no location restriction)
            // This ensures we always show skill-matched volunteers even if
            // nobody is in the specific city the user searched for
            const hasAISkill = v.skills?.some(s => aiSkillFilters.includes(s.subskillId))
            if (!hasAISkill) matches = false
          }
          // If neither matchedIds nor skills Ã¢â‚¬â€ show all (no AI filter applied)
        }
        
        // Calculate relevance score
        let relevanceScore = -1
        if (matches) {
          // Use API relevance order when unified search is active
          if (!aiSearchApplied && unifiedMatchedIds !== null && searchQuery.trim().length >= 1) {
            const volunteerId = v.userId || v.id
            relevanceScore = unifiedRelevanceOrder.get(volunteerId) || 1
          } else {
            relevanceScore = calculateRelevanceScore(v, parsedQuery)
          }
          
          // Boost relevance for AI-matched volunteers based on skill match count
          if (aiSearchApplied && aiSkillFilters.length > 0) {
            const matchedSkillCount = v.skills?.filter(s => aiSkillFilters.includes(s.subskillId)).length || 0
            relevanceScore += matchedSkillCount * 15
          }
          
          // Boost for location match when AI specified a location
          if (aiSearchApplied && aiLocationFilter) {
            const hasLocMatch = 
              v.location?.toLowerCase().includes(aiLocationFilter.toLowerCase()) ||
              v.city?.toLowerCase().includes(aiLocationFilter.toLowerCase())
            if (hasLocMatch) relevanceScore += 20
          }
        }
        
        return { ...v, relevanceScore }
      })
      .filter(v => v.relevanceScore >= 0)
  }, [parsedQuery, categoryFilter, locationFilter, filters, aiSearchApplied, aiSkillFilters, aiCauseFilters, aiMatchedIds, aiLocationFilter, aiVolunteerType, searchQuery, unifiedMatchedIds, unifiedRelevanceOrder])

  // Sort volunteers
  const sortVolunteers = useCallback((vols: Array<Volunteer & { relevanceScore: number }>) => {
    return [...vols].sort((a, b) => {
      switch (sortBy) {
        case "relevance":
          return b.relevanceScore - a.relevanceScore
        case "rating":
          return (b.rating || 0) - (a.rating || 0)
        case "projects":
          return (b.completedProjects || 0) - (a.completedProjects || 0)
        case "rate-low":
          return (a.hourlyRate || 0) - (b.hourlyRate || 0)
        case "rate-high":
          return (b.hourlyRate || 0) - (a.hourlyRate || 0)
        case "hours":
          return (b.hoursPerWeek || 0) - (a.hoursPerWeek || 0)
        default:
          return 0
      }
    })
  }, [sortBy])

  // Apply filters and sorting
  const filteredAll = useMemo(() => sortVolunteers(filterAndScoreVolunteers(volunteers)), [volunteers, filterAndScoreVolunteers, sortVolunteers])
  const filteredPaid = useMemo(() => sortVolunteers(filterAndScoreVolunteers(paidVolunteers)), [paidVolunteers, filterAndScoreVolunteers, sortVolunteers])
  const filteredFree = useMemo(() => sortVolunteers(filterAndScoreVolunteers(freeVolunteers)), [freeVolunteers, filterAndScoreVolunteers, sortVolunteers])

  const hasActiveFilters = searchQuery.trim() !== "" || 
    categoryFilter !== "all" || 
    locationFilter !== "all" ||
    filters.minRating > 0 ||
    filters.minProjects > 0 ||
    filters.hasDiscountedRate ||
    filters.hasFreeHours ||
    filters.experienceLevel !== "all" ||
    filters.maxHourlyRate < 500

  const clearFilters = () => {
    setSearchQuery("")
    setCategoryFilter("all")
    setLocationFilter("all")
    setFilters({
      minRating: 0,
      minHoursPerWeek: 0,
      maxHoursPerWeek: 40,
      minProjects: 0,
      verifiedOnly: false,
      hasDiscountedRate: false,
      maxHourlyRate: 500,
      experienceLevel: "all",
      hasFreeHours: false,
    })
    setSortBy("relevance")
  }

  // Count active advanced filters
  const activeAdvancedFilterCount = [
    filters.minRating > 0,
    filters.minProjects > 0,
    filters.hasDiscountedRate,
    filters.hasFreeHours,
    filters.experienceLevel !== "all",
    filters.maxHourlyRate < 500,
  ].filter(Boolean).length

  return (
    <>
      {/* Search & Filters */}
      <Card className="mb-6">
        <CardContent className="p-4 space-y-3">
          {/* Row 1: Search input + AI Search */}
          <div className="flex gap-2">
            <div className="flex-1">
              <UnifiedSearchBar
                defaultType="volunteer"
                allowedTypes={["volunteer"]}
                variant="default"
                placeholder='Try: "SEO expert for education" or "remote designer near Mumbai"'
                value={searchQuery}
                onSearchChange={(val) => {
                  setSearchQuery(val)
                  if (aiSearchApplied) setAiSearchApplied(false)
                }}
                navigateOnSelect={false}
              />
            </div>
            <Button 
              onClick={handleAISearch} 
              disabled={isAISearching || searchQuery.length < 3}
              variant={aiSearchApplied ? "default" : "secondary"}
              size="lg"
              className="h-12 px-5 gap-2 shrink-0"
            >
              {isAISearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {aiSearchApplied ? "AI Applied" : "AI Search"}
            </Button>
          </div>

          {/* Row 2: Filters & Sort */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {skillCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Advanced Filters Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 relative">
                  <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                  Filters
                  {activeAdvancedFilterCount > 0 && (
                    <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                      {activeAdvancedFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent>
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      Advanced Filters
                    </SheetTitle>
                  </SheetHeader>
                  <div className="space-y-6 mt-6">
                    
                    {/* Minimum Rating */}
                    <div className="space-y-2">
                      <Label className="text-sm">Minimum Rating (0-5)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        step={0.5}
                        value={filters.minRating || ""}
                        placeholder="Any"
                        onChange={(e) => setFilters(f => ({ ...f, minRating: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    
                    {/* Minimum Opportunities */}
                    <div className="space-y-2">
                      <Label className="text-sm">Minimum Completed Opportunities</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={filters.minProjects || ""}
                        placeholder="Any"
                        onChange={(e) => setFilters(f => ({ ...f, minProjects: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                    
                    {/* Experience Level */}
                    <div className="space-y-2">
                      <Label className="text-sm">Experience Level</Label>
                      <Select 
                        value={filters.experienceLevel} 
                        onValueChange={(val) => setFilters(f => ({ ...f, experienceLevel: val as SearchFilters["experienceLevel"] }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Levels</SelectItem>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="expert">Expert</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Max Hourly Rate */}
                    <div className="space-y-2">
                      <Label className="text-sm">Max Hourly Rate ($)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={10}
                        value={filters.maxHourlyRate >= 500 ? "" : filters.maxHourlyRate}
                        placeholder="No limit"
                        onChange={(e) => setFilters(f => ({ ...f, maxHourlyRate: parseInt(e.target.value) || 500 }))}
                      />
                    </div>
                    
                    {/* Toggle Filters */}
                    <div className="space-y-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Has NGO Discounted Rate</Label>
                        <Switch
                          checked={filters.hasDiscountedRate}
                          onCheckedChange={(val) => setFilters(f => ({ ...f, hasDiscountedRate: val }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Offers Free Hours</Label>
                        <Switch
                          checked={filters.hasFreeHours}
                          onCheckedChange={(val) => setFilters(f => ({ ...f, hasFreeHours: val }))}
                        />
                      </div>
                    </div>

                    {/* Reset Filters */}
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => setFilters({
                        minRating: 0,
                        minHoursPerWeek: 0,
                        maxHoursPerWeek: 40,
                        minProjects: 0,
                        verifiedOnly: false,
                        hasDiscountedRate: false,
                        maxHourlyRate: 500,
                        experienceLevel: "all",
                        hasFreeHours: false,
                      })}
                    >
                      Reset Filters
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Sort Dropdown */}
              <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortOption)}>
                <SelectTrigger className="w-[150px] h-9">
                  <ArrowUpDown className="h-3 w-3 mr-1.5" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Relevance</SelectItem>
                  <SelectItem value="rating">Highest Rated</SelectItem>
                  <SelectItem value="projects">Most Opportunities</SelectItem>
                  <SelectItem value="rate-low">Rate: Low to High</SelectItem>
                  <SelectItem value="rate-high">Rate: High to Low</SelectItem>
                  <SelectItem value="hours">Most Available</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>

          {/* AI Search Applied Banner */}
          {aiSearchApplied && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
              <Wand2 className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm text-primary flex-1">
                {aiSearchIntent ? (
                  <>AI: <em>{aiSearchIntent}</em></>
                ) : (
                  <>AI matched: <strong>{aiSkillFilters.join(", ") || "all impact agents"}</strong></>
                )}
                {aiLocationFilter && <> in <strong>{aiLocationFilter}</strong></>}
                {aiMatchedIds.length > 0 && <> ({aiMatchedIds.length} found)</>}
              </span>
              <Button variant="ghost" size="sm" onClick={clearAISearch} className="h-6 px-2 text-primary hover:text-primary/80">
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          )}

          {/* Active filters summary */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">
                {isUnifiedSearching ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Searching...
                  </span>
                ) : (
                  <>Showing {filteredAll.length} of {volunteers.length} impact agents</>
                )}
              </span>
              {searchQuery.trim() && !aiSearchApplied && (
                <Badge variant="secondary" className="text-xs">
                  Search: &quot;{searchQuery.trim()}&quot;
                  {unifiedMatchedIds !== null && ` (${unifiedMatchedIds.length} matched)`}
                </Badge>
              )}
              {filters.minRating > 0 && (
                <Badge variant="outline" className="text-xs">
                  {filters.minRating}+ rating
                </Badge>
              )}
              {filters.hasDiscountedRate && (
                <Badge variant="outline" className="text-xs">
                  NGO Discount
                </Badge>
              )}
              {filters.hasFreeHours && (
                <Badge variant="outline" className="text-xs">
                  Free Hours
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Banner */}
      <Card className="mb-8 border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">Profile Visibility</h3>
              <p className="text-sm text-muted-foreground">
                <strong>Paid impact agents</strong> have fully visible profiles.{" "}
                <strong>Free impact agents</strong> are available to Pro subscribers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {subscriptionPlan === "free" && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Crown className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Upgrade to Pro</p>
                <p className="text-sm text-muted-foreground">
                  You&apos;re viewing paid impact agents only. Subscribe to Pro to discover free and pro-bono impact agents too.
                </p>
              </div>
              <Button asChild size="sm">
                <LocaleLink href="/ngo/settings?tab=subscription">
                  Upgrade
                </LocaleLink>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="all">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="all">
            All Impact Agents
            <Badge variant="secondary" className="ml-2">{filteredAll.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="paid">
            <DollarSign className="h-3 w-3 mr-1" />
            Paid
            <Badge variant="secondary" className="ml-2">{filteredPaid.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="free">
            <Heart className="h-3 w-3 mr-1" />
            Free
            <Badge variant="secondary" className="ml-2">{filteredFree.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="recommended">
            <Sparkles className="h-3 w-3 mr-1" />
            Recommended
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <VolunteerGrid
            volunteers={filteredAll}
          />
        </TabsContent>

        <TabsContent value="paid">
          <VolunteerGrid
            volunteers={filteredPaid}
          />
        </TabsContent>

        <TabsContent value="free">
          <VolunteerGrid
            volunteers={filteredFree}
          />
        </TabsContent>

        <TabsContent value="recommended">
          <RecommendedVolunteers 
            volunteers={volunteers.slice(0, 6)} 
          />
        </TabsContent>
      </Tabs>
    </>
  )
}

function VolunteerGrid({
  volunteers,
}: {
  volunteers: Volunteer[]
}) {
  if (volunteers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No impact agents found</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {volunteers.map((volunteer) => (
        <VolunteerCard
          key={volunteer.id || volunteer.userId}
          volunteer={volunteer}
        />
      ))}
    </div>
  )
}

function VolunteerCard({
  volunteer,
}: {
  volunteer: Volunteer
}) {
  const isFree = volunteer.volunteerType === "free"
  const isPaid = volunteer.volunteerType === "paid"
  const isBoth = volunteer.volunteerType === "both"
  const volunteerId = volunteer.id || volunteer.userId || ""

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4 mb-4">
          <div className="relative shrink-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden">
              {volunteer.avatar ? (
                <img
                  src={volunteer.avatar}
                  alt={volunteer.name || "Impact Agent"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl sm:text-2xl font-bold text-muted-foreground">
                  {volunteer.name?.charAt(0) || "V"}
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate text-sm sm:text-base">
              {volunteer.name || "Impact Agent"}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {volunteer.headline || "Skilled Impact Agent"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {isBoth ? (
              <>
                {(volunteer.freeHoursPerMonth && volunteer.freeHoursPerMonth > 0) ? (
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                    {volunteer.freeHoursPerMonth} hrs/mo free
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                    Open to Both
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  {getCurrencySymbol(volunteer.currency || "USD")}{volunteer.hourlyRate}/hr
                </Badge>
                {volunteer.discountedRate && (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                    NGO: {getCurrencySymbol(volunteer.currency || "USD")}{volunteer.discountedRate}/hr
                  </Badge>
                )}
              </>
            ) : (
              <>
                <Badge variant={isFree ? "secondary" : "outline"} className="text-xs">
                  {isFree ? "Free" : `${getCurrencySymbol(volunteer.currency || "USD")}${volunteer.hourlyRate}/hr`}
                </Badge>
                {isPaid && volunteer.discountedRate && (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                    NGO: {getCurrencySymbol(volunteer.currency || "USD")}{volunteer.discountedRate}/hr
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>

        <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground mb-4">
          {(volunteer.location || volunteer.city) && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="truncate">{volunteer.location || volunteer.city}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            {volunteer.hoursPerWeek || 10} hrs/week
          </div>
          <div className="flex items-center gap-2">
            <Star className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500 shrink-0" />
            {volunteer.rating || "New"} ({volunteer.completedProjects || 0} opportunities)
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-4">
          {volunteer.skills?.slice(0, 3).map((skill, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {getSkillDisplayName(skill.subskillId)}
            </Badge>
          ))}
          {(volunteer.skills?.length || 0) > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{(volunteer.skills?.length || 0) - 3}
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs sm:text-sm" asChild>
            <LocaleLink href={`/volunteers/${volunteerId}`}>
              View Profile
            </LocaleLink>
          </Button>
          <Button size="sm" className="flex-1 text-xs sm:text-sm" asChild>
            <LocaleLink href={`/volunteers/${volunteerId}?action=contact`}>
              <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              Contact
            </LocaleLink>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RecommendedVolunteers({ 
  volunteers,
}: { 
  volunteers: Volunteer[]
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-4">
        Impact agents recommended based on your active opportunities and hiring history
      </p>
      <VolunteerGrid
        volunteers={volunteers}
      />
    </div>
  )
}
