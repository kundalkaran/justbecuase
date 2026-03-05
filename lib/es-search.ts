// ============================================
// Elasticsearch Search Engine
// ============================================
// Provides:
// 1. Hybrid search — BM25 text match + semantic_text for NL understanding
// 2. Autocomplete — Completion suggesters + prefix matching
// 3. Cross-entity search — Volunteers, NGOs, Projects, Blog, Pages
// 4. Filters — workMode, volunteerType, causes, skills, location, etc.
// ============================================

import esClient, { ES_INDEXES, type ESIndexName } from "./elasticsearch"
import { skillCategories } from "./skills-data"
import { findMatchingSkillIds } from "./search-indexes"

// ============================================
// TYPES
// ============================================

export interface ESSearchParams {
  query: string
  types?: ("volunteer" | "ngo" | "project" | "blog" | "page")[]
  filters?: {
    workMode?: string
    volunteerType?: string
    causes?: string[]
    skills?: string[]
    location?: string
    experienceLevel?: string
    isVerified?: boolean
    minRating?: number
    maxHourlyRate?: number
    status?: string
  }
  limit?: number
  offset?: number
  sort?: "relevance" | "newest" | "rating"
}

export interface ESSearchResult {
  id: string
  mongoId: string
  type: "volunteer" | "ngo" | "project" | "blog" | "page"
  title: string
  subtitle: string
  description: string
  url: string
  score: number
  highlights: string[]
  metadata: Record<string, any>
}

export interface ESSuggestion {
  text: string
  type: "volunteer" | "ngo" | "project" | "blog" | "page" | "skill" | "cause"
  id: string
  subtitle?: string
  score?: number
}

// ============================================
// TYPE → INDEX MAPPING
// ============================================

const TYPE_TO_INDEX: Record<string, ESIndexName> = {
  volunteer: ES_INDEXES.VOLUNTEERS,
  ngo: ES_INDEXES.NGOS,
  project: ES_INDEXES.PROJECTS,
  blog: ES_INDEXES.BLOG_POSTS,
  page: ES_INDEXES.PAGES,
}

const INDEX_TO_TYPE: Record<string, string> = {
  [ES_INDEXES.VOLUNTEERS]: "volunteer",
  [ES_INDEXES.NGOS]: "ngo",
  [ES_INDEXES.PROJECTS]: "project",
  [ES_INDEXES.BLOG_POSTS]: "blog",
  [ES_INDEXES.PAGES]: "page",
}

// ============================================
// MAIN SEARCH FUNCTION
// ============================================

export async function elasticSearch(params: ESSearchParams): Promise<{
  results: ESSearchResult[]
  total: number
  took: number
}> {
  const { query, types, filters, limit = 20, offset = 0, sort = "relevance" } = params
  const trimmedQuery = query.trim()

  if (!trimmedQuery || trimmedQuery.length < 1) {
    return { results: [], total: 0, took: 0 }
  }

  // Determine which indexes to search
  const targetTypes = types && types.length > 0 ? types : ["volunteer", "ngo", "project", "blog", "page"]
  const indexes = targetTypes.map(t => TYPE_TO_INDEX[t]).filter(Boolean)

  console.log(`[ES Search] query="${trimmedQuery}" types=${JSON.stringify(targetTypes)} indexes=${JSON.stringify(indexes)} limit=${limit} sort=${sort}`)

  if (indexes.length === 0) {
    console.log(`[ES Search] No indexes to search — returning empty`)
    return { results: [], total: 0, took: 0 }
  }

  // Build the query
  const esQuery = buildSearchQuery(trimmedQuery, filters)
  console.log(`[ES Search] Built query:`, JSON.stringify(esQuery).substring(0, 500))

  // Build sort
  const sortConfig = buildSortConfig(sort)

  try {
    const response = await esClient.search({
      index: indexes,
      query: esQuery,
      highlight: {
        fields: {
          name: { number_of_fragments: 1, fragment_size: 150 },
          orgName: { number_of_fragments: 1, fragment_size: 150 },
          title: { number_of_fragments: 1, fragment_size: 150 },
          description: { number_of_fragments: 2, fragment_size: 200 },
          bio: { number_of_fragments: 2, fragment_size: 200 },
          mission: { number_of_fragments: 1, fragment_size: 200 },
          skillNames: { number_of_fragments: 3, fragment_size: 100 },
          causeNames: { number_of_fragments: 3, fragment_size: 100 },
          content: { number_of_fragments: 2, fragment_size: 200 },
          excerpt: { number_of_fragments: 1, fragment_size: 200 },
        },
        pre_tags: ["<mark>"],
        post_tags: ["</mark>"],
      },
      from: offset,
      size: limit,
      sort: sortConfig,
      _source: true,
      track_total_hits: true,
      min_score: 2.0, // Filter out very low relevance / tangential matches
    })

    const total = typeof response.hits.total === "number"
      ? response.hits.total
      : (response.hits.total as any)?.value || 0
    console.log(`[ES Search] Response: ${response.hits.hits.length} hits, total=${total}, took=${response.took}ms`)

    const results: ESSearchResult[] = response.hits.hits.map(hit => {
      const source = hit._source as Record<string, any>
      const indexType = INDEX_TO_TYPE[hit._index] || "page"
      const highlights = Object.values(hit.highlight || {}).flat()

      return {
        ...transformHitToResult(source, indexType, hit._id || ""),
        score: hit._score || 0,
        highlights,
      }
    })

    // Post-filter: drop results scoring below 15% of the top result's score.
    // This removes tail matches where the MUST clause barely passed
    // (e.g. fuzzy single-token match with low TF-IDF).
    const topScore = results.length > 0 ? results[0].score : 0
    const scoreThreshold = topScore * 0.15
    const qualityResults = topScore > 0
      ? results.filter(r => r.score >= scoreThreshold)
      : results

    if (qualityResults.length < results.length) {
      console.log(`[ES Search] Dropped ${results.length - qualityResults.length} low-quality results (threshold=${scoreThreshold.toFixed(2)})`)
    }

    if (qualityResults.length > 0) {
      console.log(`[ES Search] Top result: type=${qualityResults[0].type} title="${qualityResults[0].title}" score=${qualityResults[0].score}`)
    }

    return {
      results: qualityResults,
      total,
      took: response.took || 0,
    }
  } catch (error: any) {
    console.error("[ES Search] Error:", error?.message || error)
    console.error("[ES Search] Full error:", JSON.stringify(error?.meta?.body || {}).substring(0, 500))
    // If semantic_text query fails, fall back to text-only search
    if (error?.message?.includes("semantic_text") || error?.message?.includes("semantic")) {
      console.log("[ES Search] Falling back to text-only search (semantic query failed)")
      return elasticSearchTextOnly(trimmedQuery, indexes, filters, limit, offset, sort)
    }
    throw error
  }
}

// ============================================
// FALLBACK: Text-only search (no semantic)
// ============================================

async function elasticSearchTextOnly(
  query: string,
  indexes: string[],
  filters: ESSearchParams["filters"],
  limit: number,
  offset: number,
  sort: string
): Promise<{ results: ESSearchResult[]; total: number; took: number }> {
  const esQuery = buildTextOnlyQuery(query, filters)
  const sortConfig = buildSortConfig(sort)

  const response = await esClient.search({
    index: indexes,
    query: esQuery,
    highlight: {
      fields: {
        "*": { number_of_fragments: 2, fragment_size: 200 },
      },
      pre_tags: ["<mark>"],
      post_tags: ["</mark>"],
    },
    from: offset,
    size: limit,
    sort: sortConfig,
    _source: true,
  })

  const results: ESSearchResult[] = response.hits.hits.map(hit => {
    const source = hit._source as Record<string, any>
    const indexType = INDEX_TO_TYPE[hit._index] || "page"
    const highlights = Object.values(hit.highlight || {}).flat()

    return {
      ...transformHitToResult(source, indexType, hit._id || ""),
      score: hit._score || 0,
      highlights,
    }
  })

  const total = typeof response.hits.total === "number"
    ? response.hits.total
    : (response.hits.total as any)?.value || 0

  return { results, total, took: response.took || 0 }
}

// ============================================
// AUTOCOMPLETE / SUGGESTIONS
// ============================================

export async function elasticSuggest(params: {
  query: string
  types?: ("volunteer" | "ngo" | "project" | "blog" | "page")[]
  limit?: number
}): Promise<ESSuggestion[]> {
  const { query, types, limit = 8 } = params
  const trimmedQuery = query.trim()

  if (!trimmedQuery || trimmedQuery.length < 1) {
    return []
  }

  const targetTypes = types && types.length > 0 ? types : ["volunteer", "ngo", "project", "blog", "page"]
  const indexes = targetTypes.map(t => TYPE_TO_INDEX[t]).filter(Boolean)

  console.log(`[ES Suggest] query="${trimmedQuery}" types=${JSON.stringify(targetTypes)} indexes=${JSON.stringify(indexes)} limit=${limit}`)

  if (indexes.length === 0) {
    console.log(`[ES Suggest] No indexes — returning empty`)
    return []
  }

  try {
    // Strategy 0: In-memory skill/category suggestions (instant, no ES roundtrip)
    const skillSuggestions = getInMemorySkillSuggestions(trimmedQuery, Math.ceil(limit / 3))
    console.log(`[ES Suggest] In-memory skill suggestions: ${skillSuggestions.length}`)

    // Strategy 1: Completion suggester (fastest ES query)
    const completionResults = await getCompletionSuggestions(trimmedQuery, indexes, Math.ceil(limit / 2))
    console.log(`[ES Suggest] Completion got ${completionResults.length} results`)

    // Strategy 2: Prefix search (most comprehensive)
    const prefixResults = await getPrefixSearchSuggestions(trimmedQuery, indexes, limit)
    console.log(`[ES Suggest] Prefix search got ${prefixResults.length} results`)

    // Merge & deduplicate: skill suggestions first (instant + highly relevant), then completion, then prefix
    const seen = new Set<string>()
    const merged: ESSuggestion[] = []

    for (const item of [...skillSuggestions, ...completionResults, ...prefixResults]) {
      const key = `${item.type}-${item.id}`
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(item)
      }
    }

    console.log(`[ES Suggest] Merged ${merged.length} unique results, returning ${Math.min(merged.length, limit)}`)
    return merged.slice(0, limit)
  } catch (error: any) {
    console.error("[ES Suggest] Error:", error?.message)
    // Fallback: at least return skill suggestions (no ES needed)
    const fallbackSkills = getInMemorySkillSuggestions(trimmedQuery, limit)
    if (fallbackSkills.length > 0) return fallbackSkills
    // Try prefix-only search
    try {
      return await getPrefixSearchSuggestions(trimmedQuery, indexes, limit)
    } catch {
      return []
    }
  }
}

// ============================================
// IN-MEMORY SKILL/CATEGORY SUGGESTIONS
// ============================================
// Provides instant autocomplete for platform skills and categories
// without needing an Elasticsearch roundtrip. When user types "web",
// they immediately see "Web Development", "Website Redesign", etc.
// ============================================

// Pre-build flat skill list for fast lookup
import { skillCategories as _skillCategoriesData, causes as _causesData } from "./skills-data"

interface SkillSuggestionEntry {
  text: string
  type: "skill" | "cause"
  id: string
  categoryName?: string
}

const SKILL_SUGGESTION_ENTRIES: SkillSuggestionEntry[] = []

// Add all subskills
for (const cat of _skillCategoriesData) {
  for (const sub of cat.subskills) {
    SKILL_SUGGESTION_ENTRIES.push({
      text: sub.name,
      type: "skill",
      id: `skill:${sub.id}`,
      categoryName: cat.name,
    })
  }
  // Add category itself
  SKILL_SUGGESTION_ENTRIES.push({
    text: cat.name,
    type: "skill",
    id: `skill:${cat.id}`,
  })
}

// Add causes
for (const cause of _causesData) {
  SKILL_SUGGESTION_ENTRIES.push({
    text: cause.name,
    type: "cause",
    id: `cause:${cause.id}`,
  })
}

// Add common role terms that map to skills
const ROLE_SUGGESTIONS: Array<{ text: string; subtitle: string; id: string }> = [
  { text: "Web Developer", subtitle: "React, HTML/CSS, WordPress, Node.js", id: "skill:website" },
  { text: "Graphic Designer", subtitle: "Canva, Figma, Photoshop, Branding", id: "skill:content-creation" },
  { text: "Video Editor", subtitle: "Premiere Pro, DaVinci, Motion Graphics", id: "skill:content-creation" },
  { text: "Content Creator", subtitle: "Social Media, Reels, Photography", id: "skill:content-creation" },
  { text: "Content Writer", subtitle: "Blog Writing, SEO, Copywriting", id: "skill:communication" },
  { text: "Social Media Manager", subtitle: "Strategy, Ads, Analytics", id: "skill:digital-marketing" },
  { text: "SEO Expert", subtitle: "SEO/Content, Analytics, Content Marketing", id: "skill:digital-marketing" },
  { text: "Data Analyst", subtitle: "Excel, Power BI, Google Sheets", id: "skill:data-technology" },
  { text: "Fundraiser", subtitle: "Grant Writing, Crowdfunding, CSR", id: "skill:fundraising" },
  { text: "Event Planner", subtitle: "Event Planning, Logistics, Coordination", id: "skill:planning-support" },
  { text: "Accountant", subtitle: "Bookkeeping, Tax Compliance, Tally", id: "skill:finance" },
  { text: "Project Manager", subtitle: "Notion, Trello, Asana", id: "skill:planning-support" },
  { text: "UX/UI Designer", subtitle: "Figma, User Experience, Prototyping", id: "skill:website" },
  { text: "Mobile Developer", subtitle: "React Native, Flutter", id: "skill:website" },
  { text: "Legal Advisor", subtitle: "NGO Registration, FCRA, Contracts", id: "skill:legal" },
  { text: "Photographer", subtitle: "Event, Documentary, Photo Editing", id: "skill:content-creation" },
  { text: "Translator", subtitle: "Translation, Localization", id: "skill:communication" },
  { text: "Digital Marketer", subtitle: "SEO, Social Media, Ads, Analytics", id: "skill:digital-marketing" },
]

function getInMemorySkillSuggestions(query: string, limit: number): ESSuggestion[] {
  const q = query.toLowerCase().trim()
  if (q.length < 1) return []

  const results: Array<ESSuggestion & { matchScore: number }> = []

  // Clean the query for matching (remove intent words)
  const cleanedQ = cleanQueryForTextSearch(query).toLowerCase().trim()
  const searchTerms = cleanedQ.split(/\s+/).filter(t => t.length >= 2)

  if (searchTerms.length === 0) return []

  // Match against skills
  for (const entry of SKILL_SUGGESTION_ENTRIES) {
    const textLower = entry.text.toLowerCase()
    let matchScore = 0

    // Exact prefix match (highest)
    if (textLower.startsWith(cleanedQ)) {
      matchScore = 100
    }
    // Word starts with query
    else if (textLower.split(/[\s/()]+/).some(word => searchTerms.some(t => word.startsWith(t)))) {
      matchScore = 70
    }
    // Contains query
    else if (searchTerms.some(t => textLower.includes(t))) {
      matchScore = 40
    }
    // Category name match
    else if (entry.categoryName && searchTerms.some(t => entry.categoryName!.toLowerCase().includes(t))) {
      matchScore = 20
    }

    if (matchScore > 0) {
      results.push({
        text: entry.text,
        type: entry.type as any,
        id: entry.id,
        subtitle: entry.categoryName || undefined,
        score: matchScore,
        matchScore,
      })
    }
  }

  // Match against role suggestions
  for (const role of ROLE_SUGGESTIONS) {
    const textLower = role.text.toLowerCase()
    let matchScore = 0

    if (textLower.startsWith(cleanedQ)) matchScore = 95
    else if (textLower.split(/\s+/).some(word => searchTerms.some(t => word.startsWith(t)))) matchScore = 65
    else if (searchTerms.some(t => textLower.includes(t))) matchScore = 35

    if (matchScore > 0) {
      results.push({
        text: role.text,
        type: "skill" as any,
        id: role.id,
        subtitle: role.subtitle,
        score: matchScore,
        matchScore,
      })
    }
  }

  // Sort by match score (best first) and deduplicate
  results.sort((a, b) => b.matchScore - a.matchScore)
  const seen = new Set<string>()
  const deduped: ESSuggestion[] = []
  for (const r of results) {
    if (!seen.has(r.text.toLowerCase())) {
      seen.add(r.text.toLowerCase())
      deduped.push({ text: r.text, type: r.type, id: r.id, subtitle: r.subtitle, score: r.score })
    }
  }

  return deduped.slice(0, limit)
}

// ============================================
// COMPLETION SUGGESTER
// ============================================

async function getCompletionSuggestions(
  query: string,
  indexes: string[],
  limit: number
): Promise<ESSuggestion[]> {
  const response = await esClient.search({
    index: indexes,
    suggest: {
      name_suggest: {
        prefix: query,
        completion: {
          field: "suggest",
          size: limit,
          skip_duplicates: true,
          fuzzy: {
            fuzziness: "AUTO" as any,
          },
        },
      },
    },
    _source: ["mongoId", "name", "orgName", "title", "slug", "skillNames", "causeNames", "city", "country", "headline", "subtitle", "description", "excerpt"],
  })

  const suggestions: ESSuggestion[] = []
  const suggestResults = (response.suggest as any)?.name_suggest?.[0]?.options || []

  for (const option of suggestResults) {
    const source = option._source as Record<string, any>
    const indexType = INDEX_TO_TYPE[option._index] || "page"
    suggestions.push(hitToSuggestion(source, indexType, option._id, option._score || 0))
  }

  return suggestions
}

// ============================================
// PREFIX SEARCH SUGGESTIONS
// ============================================

async function getPrefixSearchSuggestions(
  query: string,
  indexes: string[],
  limit: number
): Promise<ESSuggestion[]> {
  // Clean the query — strip intent/noise words so suggestions focus on skills/names
  const textQuery = cleanQueryForTextSearch(query)
  console.log(`[ES Suggest] Cleaned query for prefix: "${query}" → "${textQuery}"`)

  // Expand abbreviations and detect synonyms for better suggestions
  const expansion = expandQueryWithSynonyms(textQuery)
  const searchText = expansion.expandedQuery || textQuery
  if (expansion.expansions.length > 0) {
    console.log(`[ES Suggest] Synonym expansions: ${expansion.expansions.join(", ")}`)
  }

  // Extract location so "designer in mumbai" suggests Mumbai-based designers
  const locationExtraction = extractLocationFromQuery(query)

  // Detect intent from original query for boosting
  const intent = detectQueryIntent(query)
  const intentBoosts = intent.boosts.length > 0 ? intent.boosts : []

  // Build should clauses
  const shouldClauses: any[] = [
    // Prefix matching across key fields only (no bio/description/content)
    // NOTE: skillCategories excluded — too broad for autocomplete
    {
      multi_match: {
        query: searchText,
        type: "bool_prefix",
        fields: [
          "name^10",
          "name.exact^15",
          "orgName^10",
          "orgName.exact^15",
          "title^10",
          "title.exact^15",
          "skillNames^12",
          "causeNames^6",
          "headline^5",
          "tags^5",
          "city^3",
        ],
        fuzziness: "AUTO",
      },
    },
    // Boost exact phrase prefix matches on skill names / titles
    {
      multi_match: {
        query: searchText,
        type: "phrase_prefix",
        fields: [
          "skillNames^14",
          "name^12",
          "orgName^12",
          "title^12",
          "causeNames^8",
        ],
        boost: 2.0,
      },
    },
    // Add intent-based boosts (e.g. experience level, pricing)
    ...intentBoosts,
    // Add synonym boosts for better suggestion ranking
    ...expansion.synonymBoosts,
  ]

  // Location boost for suggestions
  if (locationExtraction.location) {
    shouldClauses.push({
      multi_match: {
        query: locationExtraction.location,
        fields: ["city^8", "country^6", "location^6"],
        type: "best_fields",
        fuzziness: "AUTO",
        boost: 3.0,
      },
    })
  }

  // Use bool_prefix multi_match with CLEANED query for partial word matching
  const response = await esClient.search({
    index: indexes,
    query: {
      bool: {
        should: shouldClauses,
        minimum_should_match: 1,
        filter: [
          {
            bool: {
              should: [
                { term: { isActive: true } },
                { bool: { must_not: { exists: { field: "isActive" } } } },
              ],
            },
          },
        ],
      },
    },
    size: limit,
    _source: ["mongoId", "name", "orgName", "title", "slug", "skillNames", "causeNames", "city", "country", "headline", "subtitle", "description", "excerpt", "bio", "mission"],
  })

  const suggestions: ESSuggestion[] = []

  for (const hit of response.hits.hits) {
    const source = hit._source as Record<string, any>
    const indexType = INDEX_TO_TYPE[hit._index] || "page"
    suggestions.push(hitToSuggestion(source, indexType, hit._id || "", hit._score || 0))
  }

  return suggestions
}

// ============================================
// SYNONYM / ROLE-TO-SKILL MAPPING
// ============================================
// Maps common user search terms (roles, job titles, abbreviations,
// tool names) to the actual skill names stored in Elasticsearch.
// This ensures "video editor" matches people with "Video Editing
// (Premiere Pro / DaVinci)" even though the exact text differs.
// ============================================

/** Common role/title → platform skill names */
const ROLE_TO_SKILLS: Record<string, string[]> = {
  // Content Creation roles
  "content creator": ["Social Media Content", "Video Editing", "Photo Editing", "Graphic Design", "Social Media Copywriting", "Reels", "Shorts", "Content Creation"],
  "video editor": ["Video Editing", "Premiere Pro", "DaVinci", "Motion Graphics", "After Effects", "Content Creation"],
  "video maker": ["Video Editing", "Videography", "Motion Graphics", "Premiere Pro", "Content Creation"],
  "videographer": ["Videography", "Video Editing", "Documentary", "Content Creation", "Video Production"],
  "videography": ["Videography", "Video Editing", "Documentary", "Content Creation", "Video Production"],
  "photographer": ["Photography", "Photo Editing", "Retouching", "Event", "Documentary", "Content Creation"],
  "photo editor": ["Photo Editing", "Retouching", "Photoshop"],
  "graphic designer": ["Graphic Design", "Canva", "Figma", "Photoshop", "Branding", "Visual Identity"],
  "logo designer": ["Graphic Design", "Branding", "Visual Identity", "Illustration"],
  "illustrator": ["Illustration", "Infographics", "Graphic Design"],
  "animator": ["Motion Graphics", "After Effects", "Animation"],
  "motion designer": ["Motion Graphics", "After Effects", "Animation"],
  "podcaster": ["Podcast Production"],
  "brand designer": ["Branding", "Visual Identity", "Graphic Design"],
  "presentation designer": ["Presentation Design", "PowerPoint", "Google Slides"],
  "ui designer": ["UX / UI Design", "Figma", "Graphic Design"],
  "ux designer": ["UX / UI Design", "Figma", "User Experience"],

  // Digital Marketing roles
  "social media manager": ["Social Media Strategy", "Social Media Content", "Social Media Copywriting", "Social Media Ads", "Reels", "Shorts"],
  "digital marketer": ["Digital Marketing", "Content Marketing", "Social Media Strategy", "SEO", "Analytics"],
  "seo expert": ["SEO / Content", "Content Marketing", "Analytics"],
  "seo specialist": ["SEO / Content", "Content Marketing", "Analytics"],
  "marketer": ["Digital Marketing", "Content Marketing", "Social Media Strategy"],
  "marketing manager": ["Digital Marketing", "Content Marketing", "Social Media Strategy", "Analytics"],
  "email marketer": ["Email Marketing", "Automation", "Email Copywriting", "Newsletter"],
  "ads expert": ["Social Media Ads", "Meta Ads", "Facebook Ads", "PPC", "Google Ads"],
  "ads manager": ["Social Media Ads", "Meta Ads", "Facebook Ads", "PPC", "Google Ads"],
  "community manager": ["Community Management", "Social Media Strategy"],
  "influencer": ["Influencer Marketing", "Social Media Content"],
  "growth hacker": ["Digital Marketing", "SEO", "Social Media Ads", "Analytics"],
  "analytics expert": ["Analytics & Reporting", "GA4", "Meta Insights", "Data Analysis"],
  "crm manager": ["CRM Management", "HubSpot", "Mailchimp", "Zoho"],
  "whatsapp marketer": ["WhatsApp Marketing"],

  // Web Development roles
  "web developer": ["React / Next.js", "HTML / CSS", "WordPress", "Node.js", "Website Redesign"],
  "frontend developer": ["React / Next.js", "HTML / CSS", "UX / UI Design", "JavaScript"],
  "frontend dev": ["React / Next.js", "HTML / CSS", "JavaScript"],
  "backend developer": ["Node.js", "Backend Development", "Database Management", "API Integration"],
  "backend dev": ["Node.js", "Backend Development", "Database Management"],
  "fullstack developer": ["React / Next.js", "Node.js", "Database Management", "API Integration"],
  "full stack developer": ["React / Next.js", "Node.js", "Database Management", "API Integration"],
  "app developer": ["Mobile App Development", "React Native", "Flutter"],
  "mobile developer": ["Mobile App Development", "React Native", "Flutter"],
  "ios developer": ["Mobile App Development", "React Native"],
  "android developer": ["Mobile App Development", "React Native", "Flutter"],
  "wordpress developer": ["WordPress Development", "CMS Maintenance", "Website Redesign"],
  "shopify developer": ["Shopify", "E-Commerce"],
  "webflow designer": ["Webflow", "No-Code"],
  "no-code developer": ["Webflow", "No-Code Tools"],
  "devops engineer": ["DevOps", "Hosting", "Vercel", "AWS"],
  "python developer": ["Python", "Scripting", "Automation"],
  "react developer": ["React / Next.js", "JavaScript", "Frontend"],
  "nextjs developer": ["React / Next.js", "Node.js"],
  "software engineer": ["React / Next.js", "Node.js", "Database Management", "API Integration", "Python"],
  "programmer": ["React / Next.js", "Node.js", "Python", "HTML / CSS"],
  "coder": ["React / Next.js", "Node.js", "Python", "HTML / CSS"],
  "website designer": ["WordPress Development", "UX / UI Design", "Website Redesign", "HTML / CSS"],

  // Communication & Writing roles
  "writer": ["Blog / Article Writing", "Impact Story Writing", "Newsletter Creation", "Social Media Copywriting"],
  "content writer": ["Blog / Article Writing", "Content Marketing", "SEO / Content", "Social Media Copywriting"],
  "blog writer": ["Blog / Article Writing", "Content Marketing"],
  "copywriter": ["Email Copywriting", "Social Media Copywriting", "Blog / Article Writing"],
  "editor": ["Blog / Article Writing", "Newsletter Creation", "Annual Report Writing"],
  "grant writer": ["Grant Writing", "Grant Research", "Proposal / RFP Writing"],
  "proposal writer": ["Proposal / RFP Writing", "Grant Writing"],
  "translator": ["Translation / Localization"],
  "public speaker": ["Public Speaking", "Training"],
  "trainer": ["Training & Workshop Facilitation", "Public Speaking"],
  "communications manager": ["Donor Communications", "Press Release", "Media Outreach", "Impact Story Writing"],
  "pr manager": ["Press Release", "Media Outreach"],
  "newsletter writer": ["Newsletter Creation", "Email Copywriting"],

  // Finance & Accounting roles
  "accountant": ["Bookkeeping", "Financial Reporting", "Tax Compliance", "Audit Support", "Accounting Software"],
  "bookkeeper": ["Bookkeeping", "Accounting Software", "Tally", "QuickBooks"],
  "financial analyst": ["Financial Modelling", "Budgeting & Forecasting", "Financial Reporting"],
  "auditor": ["Audit Support", "Financial Reporting", "Tax Compliance"],
  "tax consultant": ["Tax Compliance", "80G", "12A", "FCRA"],
  "payroll specialist": ["Payroll Processing", "Accounting Software"],
  "finance manager": ["Financial Reporting", "Budgeting & Forecasting", "Financial Modelling"],
  "ca": ["Bookkeeping", "Financial Reporting", "Tax Compliance", "Audit Support"],
  "chartered accountant": ["Bookkeeping", "Financial Reporting", "Tax Compliance", "Audit Support"],

  // Fundraising roles
  "fundraiser": ["Grant Writing", "Crowdfunding", "Peer-to-Peer Campaigns", "Fundraising Pitch Deck"],
  "grant researcher": ["Grant Research", "Grant Writing"],
  "crowdfunding expert": ["Crowdfunding", "GoFundMe", "Ketto", "Milaap"],
  "donor manager": ["Donor Database Management", "Major Gift Strategy"],
  "csr expert": ["CSR Partnerships", "Corporate Sponsorship"],
  "sponsorship manager": ["Corporate Sponsorship", "CSR Partnerships"],

  // Operations & Planning roles
  "event planner": ["Event Planning", "Event On-Ground Support", "Logistics"],
  "event manager": ["Event Planning", "Event On-Ground Support", "Logistics"],
  "event coordinator": ["Event Planning", "Event On-Ground Support"],
  "project manager": ["Project Management", "Notion", "Trello", "Asana"],
  "recruiter": ["HR & Recruitment", "Volunteer Recruitment"],
  "hr manager": ["HR & Recruitment", "Volunteer Recruitment", "Training"],
  "operations manager": ["Logistics", "Project Management", "Volunteer Recruitment"],
  "volunteer coordinator": ["Volunteer Recruitment & Management", "Event Planning"],
  "researcher": ["Research & Surveys", "Data Analysis", "Grant Research"],
  "data entry": ["Data Entry & Documentation"],
  "telecaller": ["Telecalling", "Outreach"],
  "customer support": ["Customer / Beneficiary Support"],

  // Legal roles
  "lawyer": ["Legal Advisory", "Pro Bono Counsel", "Contract Drafting"],
  "advocate": ["Legal Advisory", "Pro Bono Counsel", "RTI"],
  "legal advisor": ["Legal Advisory", "Pro Bono Counsel", "Policy Drafting"],
  "compliance officer": ["FCRA Compliance", "Tax Compliance", "Policy Drafting"],
  "company secretary": ["NGO Registration", "Contract Drafting", "Policy Drafting"],

  // Data & Technology roles
  "data analyst": ["Data Analysis", "Excel", "Google Sheets", "Power BI"],
  "data scientist": ["AI / Machine Learning", "Data Analysis", "Python"],
  "ai engineer": ["AI / Machine Learning", "Python", "Chatbot"],
  "ml engineer": ["AI / Machine Learning", "Python"],
  "chatbot developer": ["Chatbot Development"],
  "it support": ["IT Support", "Google Workspace", "Microsoft 365"],
  "cybersecurity": ["Cybersecurity Basics", "Website Security"],
  "automation expert": ["Automation", "Zapier", "Make", "n8n"],
}

/** Abbreviation / shorthand → expanded search term */
const ABBREVIATION_MAP: Record<string, string> = {
  "smm": "social media manager",
  "seo": "SEO / Content",
  "sem": "PPC / Google Ads",
  "ppc": "PPC / Google Ads",
  "ux": "UX / UI Design",
  "ui": "UX / UI Design",
  "ux/ui": "UX / UI Design",
  "ui/ux": "UX / UI Design",
  "dev": "developer",
  "devops": "DevOps / Hosting",
  "ml": "AI / Machine Learning",
  "ai": "AI / Machine Learning",
  "ga4": "Analytics & Reporting",
  "ga": "Analytics & Reporting",
  "csr": "CSR Partnerships",
  "hr": "HR & Recruitment",
  "pr": "Press Release / Media Outreach",
  "crm": "CRM Management",
  "cms": "CMS Maintenance",
  "vfx": "Motion Graphics / After Effects",
  "pm": "Project Management",
  "ngo": "organization",
  "it": "IT Support",
  "wp": "WordPress Development",
  "js": "JavaScript",
  "ts": "TypeScript",
  "db": "Database Management",
  "api": "API Integration",
  "rn": "React Native",
  "qa": "quality assurance",
  "rti": "RTI / Legal Advocacy",
  "fcra": "FCRA Compliance",
  "ca": "chartered accountant",
  "mba": "Financial Modelling",
}

/** Tool / software name → skill name it belongs to */
const TOOL_TO_SKILL: Record<string, string[]> = {
  "canva": ["Graphic Design", "Canva"],
  "figma": ["UX / UI Design", "Graphic Design", "Figma"],
  "photoshop": ["Graphic Design", "Photo Editing", "Photoshop"],
  "illustrator": ["Illustration", "Graphic Design"],
  "after effects": ["Motion Graphics", "After Effects"],
  "premiere pro": ["Video Editing", "Premiere Pro"],
  "premiere": ["Video Editing", "Premiere Pro"],
  "davinci": ["Video Editing", "DaVinci"],
  "davinci resolve": ["Video Editing", "DaVinci"],
  "final cut": ["Video Editing"],
  "capcut": ["Video Editing", "Social Media Content"],
  "lightroom": ["Photo Editing", "Photography"],
  "indesign": ["Graphic Design", "Branding"],
  "wordpress": ["WordPress Development", "CMS Maintenance"],
  "shopify": ["Shopify", "E-Commerce"],
  "webflow": ["Webflow", "No-Code"],
  "wix": ["Website Redesign", "No-Code"],
  "squarespace": ["Website Redesign", "No-Code"],
  "react": ["React / Next.js"],
  "nextjs": ["React / Next.js"],
  "next.js": ["React / Next.js"],
  "angular": ["Website & App Development"],
  "vue": ["Website & App Development"],
  "node": ["Node.js", "Backend Development"],
  "nodejs": ["Node.js", "Backend Development"],
  "node.js": ["Node.js", "Backend Development"],
  "express": ["Node.js", "Backend Development"],
  "python": ["Python", "Scripting"],
  "django": ["Python", "Backend Development"],
  "flask": ["Python", "Backend Development"],
  "flutter": ["Mobile App Development", "Flutter"],
  "react native": ["Mobile App Development", "React Native"],
  "swift": ["Mobile App Development"],
  "kotlin": ["Mobile App Development"],
  "mongodb": ["Database Management", "MongoDB"],
  "postgresql": ["Database Management", "PostgreSQL"],
  "mysql": ["Database Management"],
  "redis": ["Database Management"],
  "aws": ["DevOps", "Hosting", "AWS"],
  "vercel": ["DevOps", "Hosting", "Vercel"],
  "docker": ["DevOps"],
  "kubernetes": ["DevOps"],
  "tally": ["Accounting Software", "Bookkeeping", "Tally"],
  "quickbooks": ["Accounting Software", "QuickBooks"],
  "zoho": ["Accounting Software", "CRM Management", "Zoho"],
  "hubspot": ["CRM Management", "HubSpot"],
  "mailchimp": ["CRM Management", "Email Marketing", "Mailchimp"],
  "notion": ["Project Management", "Notion"],
  "trello": ["Project Management", "Trello"],
  "asana": ["Project Management", "Asana"],
  "jira": ["Project Management"],
  "slack": ["Operations"],
  "zapier": ["Automation", "Zapier"],
  "make": ["Automation"],
  "n8n": ["Automation", "n8n"],
  "chatgpt": ["AI Content Tools", "ChatGPT"],
  "midjourney": ["AI Content Tools", "Midjourney"],
  "stable diffusion": ["AI Content Tools"],
  "power bi": ["Data Visualization", "Power BI"],
  "tableau": ["Data Visualization", "Tableau"],
  "looker": ["Data Visualization", "Looker"],
  "excel": ["Data Analysis", "Excel"],
  "google sheets": ["Data Analysis", "Google Sheets"],
  "powerpoint": ["Presentation Design", "PowerPoint"],
  "google slides": ["Presentation Design", "Google Slides"],
  "gofundme": ["Crowdfunding"],
  "ketto": ["Crowdfunding", "Ketto"],
  "milaap": ["Crowdfunding", "Milaap"],
}

/** Cause keywords → cause IDs */
const CAUSE_KEYWORDS: Record<string, string[]> = {
  "education": ["education", "teaching", "school", "tutoring", "literacy", "tutor", "academic", "student", "learning", "scholarship", "edtech"],
  "healthcare": ["healthcare", "health", "medical", "hospital", "nutrition", "doctor", "nurse", "mental health", "therapy", "wellness", "sanitation"],
  "environment": ["environment", "climate", "green", "sustainability", "ecology", "conservation", "recycle", "renewable", "pollution", "wildlife", "forest", "ocean", "biodiversity", "nature", "tree"],
  "poverty-alleviation": ["poverty", "hunger", "food", "shelter", "livelihood", "homeless", "slum", "rural", "microfinance"],
  "women-empowerment": ["women", "gender", "feminism", "girls", "women empowerment", "menstruation", "maternal"],
  "child-welfare": ["child", "children", "kids", "youth", "orphan", "juvenile", "pediatric", "adoption", "child rights"],
  "animal-welfare": ["animal", "pet", "wildlife", "stray", "veterinary", "dog", "cat", "cow", "rescue", "shelter"],
  "disaster-relief": ["disaster", "flood", "earthquake", "cyclone", "tsunami", "relief", "emergency", "crisis", "hurricane", "drought"],
  "human-rights": ["human rights", "justice", "equality", "advocacy", "discrimination", "refugee", "minority", "lgbtq", "civil rights", "freedom"],
  "arts-culture": ["arts", "culture", "music", "dance", "theatre", "theater", "heritage", "folk", "craft", "museum", "painting"],
  "senior-citizens": ["senior", "elderly", "old age", "retirement", "geriatric"],
  "disability-support": ["disability", "disabled", "handicap", "accessible", "accessibility", "blind", "deaf", "wheelchair", "inclusive"],
}

// ============================================
// QUERY CLEANING — strip intent/noise words
// ============================================
// Removes words that indicate intent (experience, years, pricing,
// work-mode, etc.) from the raw query so the core text-matching
// only uses the "what" (skills, role, name) and not the "how".
// The stripped tokens are handled separately via detectQueryIntent.
// ============================================

function cleanQueryForTextSearch(query: string): string {
  let cleaned = query

  // Remove anything inside parentheses (tool names, extras) and slashes
  cleaned = cleaned.replace(/\([^)]*\)/g, " ")
  cleaned = cleaned.replace(/[\/\\]/g, " ")

  // Remove numeric experience patterns: "2 year experience", "5+ years of exp", "10 yrs"
  cleaned = cleaned.replace(/\b\d+\+?\s*(?:years?|yrs?|yr)\s*(?:of\s+)?(?:experience|exp)?\b/gi, " ")

  // Remove standalone intent words
  const intentWords = [
    // Experience / level
    "experience", "experienced", "expert", "beginner", "intermediate",
    "senior", "junior", "fresher", "entry-level", "entry level", "specialist",
    "veteran", "seasoned", "newbie", "newcomer", "intern", "level",
    // Pricing
    "free", "paid", "premium", "pro bono", "probono", "affordable",
    "cheap", "budget", "low cost", "no cost",
    // Work mode
    "remote", "onsite", "on-site", "hybrid", "work from home", "wfh",
    "online", "virtual", "in person", "in-person",
    // Urgency / quality
    "urgent", "asap", "immediately",
    "verified", "trusted", "reliable", "top", "best", "rated",
    "top rated", "highly rated",
    // Availability
    "weekend", "weekday", "evening", "part-time", "full-time",
    "flexible", "anytime",
    // Common filler prepositions / articles (only if not the entire query)
    "with", "for", "who", "that", "has", "have", "having",
    "looking", "need", "find", "search", "looking for",
    // NL sentence starters
    "i need a", "i need an", "i need", "i am looking for", "i want a", "i want an",
    "i want", "find me a", "find me an", "find me", "get me a", "get me an",
    "get me", "show me", "can you find", "help me find", "looking for a",
    "looking for an", "searching for", "searching for a", "want to hire",
    "need to hire", "hire a", "hire an", "hire", "someone who can",
    "someone to", "person who can", "person to", "people who",
    "anybody who", "anyone who", "anyone to",
    // Titles / salutations
    "please", "plz", "pls",
  ]

  // Sort longest first so multi-word patterns are removed before their sub-words
  const sortedIntentWords = [...intentWords].sort((a, b) => b.length - a.length)
  for (const w of sortedIntentWords) {
    const regex = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "gi")
    cleaned = cleaned.replace(regex, " ")
  }

  // Remove lone numbers that aren't part of a word (e.g. leftover "2" from "2 year")
  cleaned = cleaned.replace(/\b\d+\b/g, " ")

  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim()

  // If cleaning stripped everything, fall back to original
  return cleaned.length >= 2 ? cleaned : query.trim()
}

// ============================================
// LOCATION EXTRACTION
// ============================================
// Pulls location mentions out of NL queries (e.g. "designer in Mumbai")
// Returns the detected location and a query with location removed.
// ============================================

// Common Indian cities & states for robust detection
const KNOWN_LOCATIONS = new Set([
  // Major Indian cities
  "mumbai", "delhi", "bangalore", "bengaluru", "hyderabad", "chennai",
  "kolkata", "pune", "ahmedabad", "jaipur", "lucknow", "surat",
  "chandigarh", "noida", "gurgaon", "gurugram", "indore", "bhopal",
  "nagpur", "patna", "kochi", "coimbatore", "thiruvananthapuram",
  "visakhapatnam", "vadodara", "goa", "dehradun", "ranchi",
  "bhubaneswar", "mangalore", "mysore", "nashik", "aurangabad",
  "thane", "faridabad", "ghaziabad", "agra", "varanasi", "allahabad",
  "prayagraj", "amritsar", "ludhiana", "jodhpur", "udaipur",
  "rajkot", "madurai", "tiruchirappalli", "salem", "hubli",
  // International cities
  "new york", "london", "san francisco", "singapore", "dubai",
  "toronto", "sydney", "berlin", "tokyo", "paris", "hong kong",
  "los angeles", "chicago", "seattle", "boston", "austin",
  // Indian states / regions
  "maharashtra", "karnataka", "tamil nadu", "telangana", "kerala",
  "uttar pradesh", "rajasthan", "gujarat", "west bengal", "madhya pradesh",
  "andhra pradesh", "bihar", "odisha", "punjab", "haryana",
  "uttarakhand", "jharkhand", "chhattisgarh", "assam", "goa",
  // Countries
  "india", "usa", "uk", "united states", "united kingdom", "canada",
  "australia", "germany", "france", "japan", "singapore", "uae",
  "dubai", "qatar", "saudi arabia", "south africa", "brazil",
  "nepal", "sri lanka", "bangladesh",
])

interface LocationExtraction {
  /** Query with location removed */
  cleanedQuery: string
  /** Detected location string (null if none found) */
  location: string | null
}

function extractLocationFromQuery(query: string): LocationExtraction {
  const q = query.toLowerCase()

  // Pattern 1: "in <City>", "from <City>", "near <City>", "based in <City>", "located in <City>"
  const locationPrepositionPattern = /\b(?:in|from|near|based\s+in|located\s+in|at|around)\s+([a-z][a-z\s]+?)(?:\s*$|\s+(?:with|who|that|and|for|free|remote|paid|online|expert|senior|junior|experience|yr|year))/i
  const prepMatch = q.match(locationPrepositionPattern)
  if (prepMatch) {
    const candidate = prepMatch[1].trim()
    // Verify against known locations (multi-word aware)
    if (KNOWN_LOCATIONS.has(candidate)) {
      return {
        cleanedQuery: query.replace(prepMatch[0], " ").replace(/\s+/g, " ").trim(),
        location: candidate,
      }
    }
    // Also try if the candidate starts with a known location
    for (const loc of KNOWN_LOCATIONS) {
      if (candidate.startsWith(loc)) {
        return {
          cleanedQuery: query.replace(new RegExp(`\\b(?:in|from|near|based\\s+in|located\\s+in|at|around)\\s+${loc.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`, "gi"), " ").replace(/\s+/g, " ").trim(),
          location: loc,
        }
      }
    }
  }

  // Pattern 2: Location at end of query without preposition — "graphic designer mumbai"
  const words = q.split(/\s+/)
  // Check last 1-2 words
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const tail = words.slice(-n).join(" ")
    if (KNOWN_LOCATIONS.has(tail)) {
      return {
        cleanedQuery: words.slice(0, -n).join(" ").trim(),
        location: tail,
      }
    }
  }

  // Pattern 3: Location at start — "mumbai graphic designer"
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const head = words.slice(0, n).join(" ")
    if (KNOWN_LOCATIONS.has(head)) {
      return {
        cleanedQuery: words.slice(n).join(" ").trim(),
        location: head,
      }
    }
  }

  return { cleanedQuery: query, location: null }
}

// ============================================
// CAUSE DETECTION
// ============================================
// Detects cause-area mentions in the query (e.g. "education volunteers")
// Returns matching cause IDs to boost/filter by.
// ============================================

function detectCausesFromQuery(query: string): string[] {
  const q = query.toLowerCase()
  const detected: string[] = []
  for (const [causeId, keywords] of Object.entries(CAUSE_KEYWORDS)) {
    if (keywords.some(k => {
      // For multi-word keywords, check substring; for single words, check word boundary
      if (k.includes(" ")) return q.includes(k)
      return new RegExp(`\\b${k}\\b`).test(q)
    })) {
      detected.push(causeId)
    }
  }
  return detected
}

// ============================================
// SYNONYM EXPANSION
// ============================================
// Expands the cleaned query with synonym skill names so ES can find
// volunteers/projects whose skill fields contain official platform names.
// Returns extra should clauses to inject into the query.
// ============================================

interface QueryExpansion {
  /** Extra should clauses to boost synonym matches */
  synonymBoosts: any[]
  /** The original or abbreviation-expanded query */
  expandedQuery: string
  /** Debug log of what was expanded */
  expansions: string[]
}

function expandQueryWithSynonyms(query: string): QueryExpansion {
  const q = query.toLowerCase().trim()
  const synonymBoosts: any[] = []
  const expansions: string[] = []

  // --- Step 1: Expand abbreviations in the query itself ---
  let expandedQuery = q
  const words = q.split(/\s+/)
  for (const word of words) {
    if (ABBREVIATION_MAP[word]) {
      const expanded = ABBREVIATION_MAP[word]
      expandedQuery = expandedQuery.replace(new RegExp(`\\b${word}\\b`, "gi"), expanded)
      expansions.push(`abbr:${word}→${expanded}`)
    }
  }

  // --- Step 2: Check if query matches a known role → boost those skill names ---
  // Check multi-word roles first (longest match wins)
  const sortedRoles = Object.keys(ROLE_TO_SKILLS).sort((a, b) => b.length - a.length)
  for (const role of sortedRoles) {
    if (expandedQuery.includes(role)) {
      const skillNames = ROLE_TO_SKILLS[role]
      // Add a should clause that boosts documents with any of these skill names
      for (const skillName of skillNames) {
        synonymBoosts.push({
          multi_match: {
            query: skillName,
            fields: ["skillNames^14", "skillCategories^4", "title^6", "description^3"],
            type: "phrase_prefix",
            boost: 3.0,
          },
        })
      }
      expansions.push(`role:${role}→[${skillNames.slice(0, 4).join(", ")}${skillNames.length > 4 ? "..." : ""}]`)
      break // Only match the first (longest) role
    }
  }

  // --- Step 3: Check if query mentions a specific tool → boost the skill ---
  const sortedTools = Object.keys(TOOL_TO_SKILL).sort((a, b) => b.length - a.length)
  for (const tool of sortedTools) {
    if (expandedQuery.includes(tool)) {
      const skillNames = TOOL_TO_SKILL[tool]
      for (const skillName of skillNames) {
        synonymBoosts.push({
          multi_match: {
            query: skillName,
            fields: ["skillNames^12", "description^3"],
            type: "phrase_prefix",
            boost: 2.5,
          },
        })
      }
      expansions.push(`tool:${tool}→[${skillNames.join(", ")}]`)
      break // Only match the first (longest) tool
    }
  }

  // --- Step 4: For single-word queries, check if it's a partial skill match ---
  if (words.length === 1 && synonymBoosts.length === 0) {
    const word = words[0]
    // Check if it partially matches any role
    for (const role of sortedRoles) {
      if (role.includes(word) || word.includes(role.split(" ")[0])) {
        const skillNames = ROLE_TO_SKILLS[role]
        for (const skillName of skillNames.slice(0, 3)) {
          synonymBoosts.push({
            multi_match: {
              query: skillName,
              fields: ["skillNames^10", "title^4"],
              type: "phrase_prefix",
              boost: 1.5,
            },
          })
        }
        expansions.push(`partial:${word}~${role}→[${skillNames.slice(0, 3).join(", ")}]`)
        break
      }
    }
  }

  return { synonymBoosts, expandedQuery, expansions }
}

// ============================================
// NATURAL LANGUAGE QUERY UNDERSTANDING
// ============================================
// Pre-processes the raw search query to detect intent signals
// like pricing, experience, availability, work mode, etc.
// Returns extra should/filter clauses to inject into the query.
// ============================================

interface QueryIntent {
  /** Extra should clauses to boost matching results */
  boosts: any[]
  /** Extra filter clauses to hard-filter results */
  filters: any[]
  /** Detected intent labels for logging */
  signals: string[]
}

function detectQueryIntent(query: string): QueryIntent {
  const q = query.toLowerCase()
  const boosts: any[] = []
  const filters: any[] = []
  const signals: string[] = []

  // --- PRICING INTENT ---
  // "free", "pro bono", "no cost", "budget", "voluntary"
  if (/\b(free|pro[- ]?bono|no[- ]?cost|voluntary|gratis|without[- ]?pay)\b/.test(q)) {
    boosts.push({ term: { volunteerType: { value: "free", boost: 5.0 } } })
    boosts.push({ term: { volunteerType: { value: "both", boost: 2.0 } } })
    signals.push("price:free")
  }
  // "cheap", "affordable", "budget", "low cost", "inexpensive"
  if (/\b(cheap|affordable|budget|low[- ]?cost|inexpensive|economical)\b/.test(q)) {
    boosts.push({ range: { hourlyRate: { lte: 300, boost: 3.0 } } })
    boosts.push({ term: { volunteerType: { value: "free", boost: 4.0 } } })
    boosts.push({ term: { volunteerType: { value: "both", boost: 2.0 } } })
    signals.push("price:cheap")
  }
  // "paid", "premium", "professional"
  if (/\b(paid|premium|professional|hire)\b/.test(q) && !/\b(un[- ]?paid)\b/.test(q)) {
    boosts.push({ term: { volunteerType: { value: "paid", boost: 3.0 } } })
    boosts.push({ term: { volunteerType: { value: "both", boost: 1.5 } } })
    signals.push("price:paid")
  }
  // "under X per hour", "below X/hr", "less than X"
  const rateMatch = q.match(/(?:under|below|less than|max|upto|up to|within)\s*(?:rs\.?|inr|₹|\$|usd)?\s*(\d+)/)
  if (rateMatch) {
    const maxRate = parseInt(rateMatch[1])
    boosts.push({ range: { hourlyRate: { lte: maxRate, boost: 4.0 } } })
    boosts.push({ term: { volunteerType: { value: "free", boost: 3.0 } } })
    signals.push(`price:under_${maxRate}`)
  }

  // --- EXPERIENCE LEVEL INTENT ---
  // "expert", "senior", "experienced", "specialist", "10 years", "5+ years"
  if (/\b(expert|senior|specialist|veteran|seasoned|highly[- ]?experienced)\b/.test(q)) {
    boosts.push({ term: { experienceLevel: { value: "expert", boost: 4.0 } } })
    signals.push("exp:expert")
  }
  // Numeric years: "10 years", "5 years experience", "3+ years"
  const yearsMatch = q.match(/(\d+)\+?\s*(?:years?|yrs?|yr)\b/)
  if (yearsMatch) {
    const years = parseInt(yearsMatch[1])
    if (years >= 6) {
      boosts.push({ term: { experienceLevel: { value: "expert", boost: 5.0 } } })
      // Also boost high completedProjects as proxy for experience
      boosts.push({ range: { completedProjects: { gte: 3, boost: 2.0 } } })
      boosts.push({ range: { rating: { gte: 4, boost: 1.5 } } })
      signals.push(`exp:years_${years}_expert`)
    } else if (years >= 3) {
      boosts.push({ term: { experienceLevel: { value: "intermediate", boost: 3.0 } } })
      boosts.push({ term: { experienceLevel: { value: "expert", boost: 2.0 } } })
      signals.push(`exp:years_${years}_advanced`)
    } else {
      boosts.push({ term: { experienceLevel: { value: "intermediate", boost: 2.0 } } })
      boosts.push({ term: { experienceLevel: { value: "beginner", boost: 1.5 } } })
      signals.push(`exp:years_${years}_intermediate`)
    }
  }
  // "beginner", "entry level", "fresher", "newbie", "no experience"
  if (/\b(beginner|entry[- ]?level|fresher|newbie|no[- ]?experience|starter|newcomer|intern)\b/.test(q)) {
    boosts.push({ term: { experienceLevel: { value: "beginner", boost: 4.0 } } })
    signals.push("exp:beginner")
  }
  // "beginner friendly" — for projects
  if (/\b(beginner[- ]?friendly|easy|simple|basic|first[- ]?time)\b/.test(q)) {
    boosts.push({ term: { experienceLevel: { value: "beginner", boost: 4.0 } } })
    signals.push("exp:beginner_friendly")
  }

  // --- WORK MODE INTENT ---
  if (/\b(remote|work from home|wfh|from anywhere|online|virtual)\b/.test(q)) {
    boosts.push({ term: { workMode: { value: "remote", boost: 3.0 } } })
    boosts.push({ term: { acceptRemoteVolunteers: { value: true, boost: 2.0 } } })
    signals.push("mode:remote")
  }
  if (/\b(onsite|on[- ]?site|in[- ]?person|office|local|nearby|near me)\b/.test(q)) {
    boosts.push({ term: { workMode: { value: "onsite", boost: 3.0 } } })
    signals.push("mode:onsite")
  }
  if (/\b(hybrid|flexible location)\b/.test(q)) {
    boosts.push({ term: { workMode: { value: "hybrid", boost: 3.0 } } })
    signals.push("mode:hybrid")
  }

  // --- AVAILABILITY INTENT ---
  if (/\b(weekend|saturday|sunday)\b/.test(q)) {
    boosts.push({ term: { availability: { value: "weekends", boost: 3.0 } } })
    boosts.push({ term: { availability: { value: "flexible", boost: 1.5 } } })
    signals.push("avail:weekends")
  }
  if (/\b(weekday|monday|friday|morning)\b/.test(q)) {
    boosts.push({ term: { availability: { value: "weekdays", boost: 3.0 } } })
    boosts.push({ term: { availability: { value: "flexible", boost: 1.5 } } })
    signals.push("avail:weekdays")
  }
  if (/\b(evening|after[- ]?hours|part[- ]?time|night)\b/.test(q)) {
    boosts.push({ term: { availability: { value: "evenings", boost: 3.0 } } })
    boosts.push({ term: { availability: { value: "flexible", boost: 1.5 } } })
    signals.push("avail:evenings")
  }
  if (/\b(flexible|anytime|any time|full[- ]?time)\b/.test(q)) {
    boosts.push({ term: { availability: { value: "flexible", boost: 3.0 } } })
    signals.push("avail:flexible")
  }

  // --- PROJECT TYPE INTENT ---
  if (/\b(short[- ]?term|quick|temporary|one[- ]?time|sprint)\b/.test(q)) {
    boosts.push({ term: { projectType: { value: "short-term", boost: 3.0 } } })
    signals.push("type:short")
  }
  if (/\b(long[- ]?term|ongoing|permanent|continuous|regular)\b/.test(q)) {
    boosts.push({ term: { projectType: { value: "long-term", boost: 2.0 } } })
    boosts.push({ term: { projectType: { value: "ongoing", boost: 2.0 } } })
    signals.push("type:long")
  }
  if (/\b(consult|advisory|advice|mentor|guidance)\b/.test(q)) {
    boosts.push({ term: { projectType: { value: "consultation", boost: 3.0 } } })
    signals.push("type:consult")
  }

  // --- URGENCY INTENT ---
  if (/\b(urgent|asap|immediately|right away|starting soon|deadline)\b/.test(q)) {
    // Boost recently created projects (likely more urgent)
    boosts.push({ range: { createdAt: { gte: "now-7d", boost: 2.0 } } })
    signals.push("urgency:high")
  }

  // --- VERIFIED/TRUST INTENT ---
  if (/\b(verified|trusted|reliable|reputable|authentic|legitimate)\b/.test(q)) {
    boosts.push({ term: { isVerified: { value: true, boost: 5.0 } } })
    signals.push("trust:verified")
  }

  // --- HIGHLY RATED INTENT ---
  if (/\b(top rated|highly rated|best|top|star|rated|popular)\b/.test(q)) {
    boosts.push({ range: { rating: { gte: 4, boost: 4.0 } } })
    boosts.push({ range: { completedProjects: { gte: 3, boost: 2.0 } } })
    signals.push("quality:top_rated")
  }

  return { boosts, filters, signals }
}

// ============================================
// QUERY BUILDERS
// ============================================

export function buildSearchQuery(query: string, filters?: ESSearchParams["filters"]): Record<string, any> {
  const must: any[] = []
  const should: any[] = []
  const filterClauses: any[] = []

  // --- Step 1: Detect NL intent signals from raw query ---
  const intent = detectQueryIntent(query)
  if (intent.signals.length > 0) {
    console.log(`[ES Search] Detected intent signals: ${intent.signals.join(", ")}`)
  }

  // --- Step 2: Extract location from query ---
  const locationExtraction = extractLocationFromQuery(query)
  const queryAfterLocation = locationExtraction.cleanedQuery
  if (locationExtraction.location) {
    console.log(`[ES Search] Extracted location: "${locationExtraction.location}" from query`)
  }

  // --- Step 3: Detect cause mentions ---
  const detectedCauses = detectCausesFromQuery(query)
  if (detectedCauses.length > 0) {
    console.log(`[ES Search] Detected causes: ${detectedCauses.join(", ")}`)
  }

  // --- Step 4: Clean query — remove intent/noise words ---
  const textQuery = cleanQueryForTextSearch(queryAfterLocation)
  console.log(`[ES Search] Cleaned query: "${query}" → "${textQuery}"`)

  // --- Step 5: Expand with synonyms ---
  const expansion = expandQueryWithSynonyms(textQuery)
  if (expansion.expansions.length > 0) {
    console.log(`[ES Search] Synonym expansions: ${expansion.expansions.join(", ")}`)
  }

  // Use the expanded query for text matching (abbreviations resolved)
  let searchText = expansion.expandedQuery || textQuery

  // Normalize the text a bit: collapse any duplicate tokens that might
  // occur from expansions like "CSR Partnerships partnerships". This keeps
  // the query from being polluted by repeated words.
  const tokens = searchText.trim().split(/\s+/)
  const seen = new Set<string>()
  searchText = tokens
    .filter((t) => {
      const lower = t.toLowerCase()
      if (seen.has(lower)) return false
      seen.add(lower)
      return true
    })
    .join(" ")

  // Safety: if processing stripped everything, fall back to original query
  if (!searchText || searchText.length < 2) {
    searchText = query.trim()
  }

  // ---- Pure-intent detection ----
  // When the entire query is a single intent word (e.g. "onsite", "remote",
  // "hybrid"), cleanQueryForTextSearch strips it and we fall back to the raw
  // query. But these words DO NOT appear in ES text fields (title, skillNames,
  // etc.) — they live in the `workMode` keyword field. If we send them as a
  // text-match MUST clause ES finds nothing, then falls back to whatever
  // min-score results exist (often the wrong workMode). 
  //
  // Fix: detect pure work-mode queries and convert to a hard filter so only
  // results with the matching workMode are returned, with no text-match gate.
  const WORK_MODE_MAP: Record<string, string> = {
    onsite: "onsite",
    "on-site": "onsite",
    "on site": "onsite",
    "in-person": "onsite",
    "in person": "onsite",
    office: "onsite",
    remote: "remote",
    "work from home": "remote",
    wfh: "remote",
    online: "remote",
    virtual: "remote",
    hybrid: "hybrid",
  }
  const rawQ = query.trim().toLowerCase()
  const pureWorkMode = WORK_MODE_MAP[rawQ]
  if (pureWorkMode) {
    // Hard-filter by workMode — skip text matching entirely
    filterClauses.push({ term: { workMode: pureWorkMode } })
    console.log(`[ES Search] Pure work-mode query "${rawQ}" → filter workMode=${pureWorkMode}`)
    // Return a match_all with the filter applied via the caller's filter chain
    must.push({ match_all: {} })
    // Still apply type/status filters below by NOT returning early here
  } else {

  // Determine if this query matches any known skill names or IDs. We'll also
  // collect the matching skill IDs, which we can use to *require* a result to
  // actually contain that skill. This avoids generic hits like projects that
  // merely mention "partnerships".
  const matchedSkillIds = findMatchingSkillIds([searchText.toLowerCase()])
  const isSkillQuery = matchedSkillIds.length > 0

  console.log(`[ES Search] searchText="${searchText}" isSkillQuery=${isSkillQuery} skillIds=${matchedSkillIds}`)

  // Adaptive minimum_should_match based on cleaned word count.
  // Use concrete numbers instead of percentages — ES percentage rounds DOWN
  // which gives counterintuitive results (e.g. 75% of 2 = 1.5 → 1, not 2).
  const wordCount = searchText.split(/\s+/).length
  const mustMinMatch = wordCount <= 2
    ? `${wordCount}`  // 1→"1", 2→"2" (all words required for short queries)
    : `${Math.max(2, Math.ceil(wordCount * 0.65))}` // 3→"2", 4→"3", 5→"4"

  // When the user types a very short query (3 characters or fewer) we
  // want strict prefix matching and no fuzziness. Fuzzy matching on tiny
  // terms causes noisy hits like "fim" → "financial".
  const useFuzziness: any = searchText.length <= 3 ? 0 : "AUTO"
  const prefixLen = searchText.length <= 3 ? 0 : 2

  // For the MUST clause, use operator "and" for very short queries (1-2 words)
  // to require ALL terms to be present. For longer queries, "or" + mustMinMatch
  // lets role/filler words miss while core terms still gate.
  const mustOperator = wordCount <= 2 ? "and" : "or"

  // ============================================
  // MUST: Core text match — every result MUST match the cleaned query
  //   on at least one of the key fields (name, title, skills, headline).
  //   This prevents the semantic clause or bio mentions from pulling in
  //   completely irrelevant results.
  // ============================================
  must.push({
    bool: {
      should: [
        // 1. Cross-fields (PRIMARY gate): treats all key fields as one corpus
        //    so "web design" matches even if "web" is in title and "design"
        //    is in skillNames. Stricter operator for short queries.
        {
          multi_match: {
            query: searchText,
            type: "cross_fields",
            fields: [
              "title^10",
              "skillNames^12",
              "causeNames^6",
              "headline^6",
              "name^8",
              "orgName^8",
            ],
            operator: mustOperator,
            minimum_should_match: mustMinMatch,
          },
        },
        // 2. Most-fields with fuzziness (fuzzy fallback): allows typo
        //    tolerance but restricted to key fields and stricter matching.
        //    NOTE: skillCategories intentionally excluded from must — it's too
        //    broad ("Content Creation & Design" matches "content" but
        //    includes Graphic Designers who aren't content creators).
        {
          multi_match: {
            query: searchText,
            type: "most_fields",
            fields: [
              "title^10",
              "skillNames^12",
              "causeNames^6",
              "ngoName^8",
            ],
            fuzziness: useFuzziness,
            prefix_length: prefixLen,
            operator: mustOperator,
            minimum_should_match: mustMinMatch,
          },
        },
        // 3. If this query appears to be a skill search, also allow description
        //    to satisfy the MUST clause so projects mentioning the skill only
        //    in the description are returned. Requires ALL terms.
        ...(isSkillQuery ? [{
          multi_match: {
            query: searchText,
            type: "most_fields",
            fields: ["description"],
            fuzziness: useFuzziness,
            prefix_length: prefixLen,
            operator: "and",
          },
        }] : []),
        // 4. When we actually recognized a specific skill, require the result
        //    to have that skill present. This stops generic projects from
        //    sneaking in.
        ...(matchedSkillIds.length > 0 ? [{ terms: { skillIds: matchedSkillIds } }] : []),
      ],
      minimum_should_match: 1,
    },
  })

  // ============================================
  // bool_prefix for search-as-you-type (moved to SHOULD — bonus only,
  // not a gate; prefix matches alone shouldn't qualify a result)
  // ============================================
  should.push({
    multi_match: {
      query: searchText,
      type: "bool_prefix",
      fields: [
        "title^8",
        "skillNames^8",
        "name^6",
        "headline^5",
      ],
      boost: 1.5,
    },
  })

  // ============================================
  // SHOULD: Bonus scoring — re-rank but don't gate results
  // ============================================

  // Phrase match boosts (exact phrase on key fields scores higher)
  should.push({
    multi_match: {
      query: searchText,
      type: "phrase",
      fields: [
        "name^15",
        "orgName^15",
        "title^15",
        "headline^8",
        "skillNames^14",
      ],
      slop: 2,
      boost: 2.5,
    },
  })

  // Skill categories — bonus scoring only (not gating)
  should.push({
    multi_match: {
      query: searchText,
      type: "best_fields",
      fields: ["skillCategories^4"],
      fuzziness: "AUTO",
      prefix_length: 2,
      boost: 0.5,
    },
  })

  // Secondary text match on broader fields (bio, description) — bonus, not required
  // No fuzziness here — avoid inflating scores for tangential fuzzy matches
  should.push({
    multi_match: {
      query: searchText,
      type: "most_fields",
      fields: [
        "bio^3",
        "description^4",
        "mission^4",
        "content^2",
        "excerpt^4",
        "languages^2",
        "interests^2",
      ],
      operator: "or",
      minimum_should_match: mustMinMatch,
      boost: 0.5,
    },
  })

  // --- Synonym skill boosts (maps "video editor" → "Video Editing (Premiere Pro / DaVinci)") ---
  if (expansion.synonymBoosts.length > 0) {
    should.push(...expansion.synonymBoosts)
  }

  // --- Location boost (not a hard filter — boosts nearby matches) ---
  if (locationExtraction.location) {
    should.push({
      multi_match: {
        query: locationExtraction.location,
        fields: ["city^8", "country^6", "location^6", "address^4"],
        type: "best_fields",
        fuzziness: "AUTO",
        boost: 4.0,
      },
    })
  }

  // --- Cause boosts (detected from NL query like "education volunteers") ---
  if (detectedCauses.length > 0) {
    for (const causeId of detectedCauses) {
      should.push({ term: { causeIds: { value: causeId, boost: 4.0 } } })
    }
    // Also boost causeNames text match
    const causeNames = detectedCauses.map(id => {
      const entry = Object.entries(CAUSE_KEYWORDS).find(([k]) => k === id)
      return entry ? id.replace(/-/g, " ") : id
    })
    should.push({
      multi_match: {
        query: causeNames.join(" "),
        fields: ["causeNames^8", "mission^4", "description^3"],
        type: "best_fields",
        boost: 3.0,
      },
    })
  }

  // Semantic search via semantic_text (if available) — uses ORIGINAL query for NL understanding
  // This will be ignored gracefully on indexes without semantic_text
  should.push({
    semantic: {
      field: "semantic_content",
      query,
      boost: 1.2,
    },
  })

  } // end else (non-pure-work-mode branch)

  // Apply filters
  if (filters) {
    if (filters.workMode) {
      filterClauses.push({ term: { workMode: filters.workMode } })
    }
    if (filters.volunteerType) {
      filterClauses.push({
        bool: {
          should: [
            { term: { volunteerType: filters.volunteerType } },
            { term: { volunteerType: "both" } },
          ],
        },
      })
    }
    if (filters.causes && filters.causes.length > 0) {
      filterClauses.push({ terms: { causeIds: filters.causes } })
    }
    if (filters.skills && filters.skills.length > 0) {
      filterClauses.push({ terms: { skillIds: filters.skills } })
    }
    if (filters.location) {
      filterClauses.push({
        multi_match: {
          query: filters.location,
          fields: ["city", "country", "location", "address"],
          type: "best_fields",
          fuzziness: "AUTO",
        },
      })
    }
    if (filters.experienceLevel) {
      filterClauses.push({ term: { experienceLevel: filters.experienceLevel } })
    }
    if (filters.isVerified !== undefined) {
      filterClauses.push({ term: { isVerified: filters.isVerified } })
    }
    if (filters.minRating && filters.minRating > 0) {
      filterClauses.push({ range: { rating: { gte: filters.minRating } } })
    }
    if (filters.maxHourlyRate && filters.maxHourlyRate > 0) {
      filterClauses.push({
        bool: {
          should: [
            { range: { hourlyRate: { lte: filters.maxHourlyRate } } },
            { term: { volunteerType: "free" } },
            { bool: { must_not: { exists: { field: "hourlyRate" } } } },
          ],
        },
      })
    }
    if (filters.status) {
      filterClauses.push({ term: { status: filters.status } })
    }
  }

  // Always filter out banned/inactive
  filterClauses.push({
    bool: {
      should: [
        { term: { isActive: true } },
        { bool: { must_not: { exists: { field: "isActive" } } } }, // Pages/blog don't have isActive
      ],
    },
  })

  // Inject NL intent boosts — these are extra should clauses that boost
  // results matching detected signals (free, expert, remote, etc.)
  if (intent.boosts.length > 0) {
    should.push(...intent.boosts)
  }
  // Inject NL intent hard filters
  if (intent.filters.length > 0) {
    filterClauses.push(...intent.filters)
  }

  return {
    function_score: {
      query: {
        bool: {
          must,
          should,
          filter: filterClauses.length > 0 ? filterClauses : undefined,
          minimum_should_match: 0, // should clauses are purely for scoring
        },
      },
      functions: [
        // Boost verified users — small uplift, not enough to distort relevance
        { filter: { term: { isVerified: true } }, weight: 1.1 },
        // Boost profiles with ratings
        { filter: { range: { rating: { gte: 3 } } }, weight: 1.05 },
        // Boost profiles with completed projects (experienced)
        { filter: { range: { completedProjects: { gte: 1 } } }, weight: 1.05 },
      ],
      score_mode: "multiply",
      boost_mode: "multiply",
      max_boost: 1.5,
    },
  }
}

function buildTextOnlyQuery(query: string, filters?: ESSearchParams["filters"]): Record<string, any> {
  // Same as buildSearchQuery but without the semantic clause
  const fullQuery = buildSearchQuery(query, filters)
  // Remove the semantic clause from should (nested inside function_score)
  const boolQuery = fullQuery.function_score?.query?.bool || fullQuery.bool
  if (boolQuery?.should) {
    boolQuery.should = boolQuery.should.filter(
      (clause: any) => !clause.semantic
    )
  }
  return fullQuery
}

function buildSortConfig(sort: string): any[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: { order: "desc", unmapped_type: "date" } }, "_score"]
    case "rating":
      return [{ rating: { order: "desc", unmapped_type: "float" } }, "_score"]
    case "relevance":
    default:
      return ["_score", { createdAt: { order: "desc", unmapped_type: "date" } }]
  }
}

// ============================================
// HIT → RESULT TRANSFORMERS
// ============================================

function transformHitToResult(
  source: Record<string, any>,
  type: string,
  esId: string
): Omit<ESSearchResult, "score" | "highlights"> {
  switch (type) {
    case "volunteer":
      return {
        id: esId,
        mongoId: source.mongoId || esId,
        type: "volunteer",
        title: source.name || "Unknown Volunteer",
        subtitle: source.headline || (source.skillNames && source.skillNames.length > 0 ? `Skills: ${Array.isArray(source.skillNames) ? source.skillNames.slice(0, 3).join(", ") : String(source.skillNames).substring(0, 80)}` : ""),
        description: source.bio || "",
        url: `/volunteers/${source.mongoId || esId}`,
        metadata: {
          avatar: source.avatar,
          city: source.city,
          country: source.country,
          rating: source.rating,
          skillNames: source.skillNames,
          causeNames: source.causeNames,
          volunteerType: source.volunteerType,
          workMode: source.workMode,
          experienceLevel: source.experienceLevel,
          hourlyRate: source.hourlyRate,
          completedProjects: source.completedProjects,
          isVerified: source.isVerified,
        },
      }

    case "ngo":
      return {
        id: esId,
        mongoId: source.mongoId || esId,
        type: "ngo",
        title: source.orgName || source.organizationName || "Unknown Organization",
        subtitle: source.mission ? source.mission.substring(0, 120) : "",
        description: source.description || "",
        url: `/ngos/${source.mongoId || esId}`,
        metadata: {
          logo: source.logo,
          city: source.city,
          country: source.country,
          causeNames: source.causeNames,
          skillNames: source.skillNames,
          isVerified: source.isVerified,
          volunteersEngaged: source.volunteersEngaged,
          projectsPosted: source.projectsPosted,
        },
      }

    case "project":
      return {
        id: esId,
        mongoId: source.mongoId || esId,
        type: "project",
        title: source.title || "Untitled Project",
        subtitle: source.ngoName ? `by ${source.ngoName}` : "",
        description: source.description || "",
        url: `/projects/${source.mongoId || esId}`,
        metadata: {
          ngoName: source.ngoName,
          skillNames: source.skillNames,
          causeNames: source.causeNames,
          workMode: source.workMode,
          experienceLevel: source.experienceLevel,
          location: source.location,
          status: source.status,
          applicantsCount: source.applicantsCount,
        },
      }

    case "blog":
      return {
        id: esId,
        mongoId: source.mongoId || esId,
        type: "blog",
        title: source.title || "Untitled Post",
        subtitle: source.authorName ? `by ${source.authorName}` : "",
        description: source.excerpt || "",
        url: `/blog/${source.slug || esId}`,
        metadata: {
          slug: source.slug,
          tags: source.tags,
          category: source.category,
          publishedAt: source.publishedAt,
          viewCount: source.viewCount,
        },
      }

    case "page":
      return {
        id: esId,
        mongoId: esId,
        type: "page",
        title: source.title || "Page",
        subtitle: source.section || "",
        description: source.description || "",
        url: source.slug || "/",
        metadata: {
          section: source.section,
        },
      }

    default:
      return {
        id: esId,
        mongoId: source.mongoId || esId,
        type: type as any,
        title: source.name || source.title || source.orgName || "Unknown",
        subtitle: "",
        description: source.description || source.bio || "",
        url: "#",
        metadata: {},
      }
  }
}

function hitToSuggestion(
  source: Record<string, any>,
  type: string,
  esId: string,
  score: number
): ESSuggestion {
  let text = ""
  let subtitle = ""

  switch (type) {
    case "volunteer": {
      text = source.name || "Volunteer"
      // Show location first, then top skills — gives a quick profile snapshot
      const location = source.city || source.country || ""
      const skillPreview = Array.isArray(source.skillNames) && source.skillNames.length > 0
        ? source.skillNames.slice(0, 2).join(", ")
        : ""
      if (location && skillPreview) {
        subtitle = `${location} · ${skillPreview}`
      } else {
        subtitle = source.headline || location || skillPreview || ""
      }
      break
    }
    case "ngo":
      text = source.orgName || "Organization"
      subtitle = source.city || source.mission?.substring(0, 60) || ""
      break
    case "project":
      text = source.title || "Project"
      subtitle = source.description?.replace(/<[^>]*>/g, "").substring(0, 60) || ""
      break
    case "blog":
      text = source.title || "Blog Post"
      subtitle = source.excerpt?.substring(0, 60) || ""
      break
    case "page":
      text = source.title || "Page"
      subtitle = source.description?.substring(0, 60) || ""
      break
  }

  // Map types for backward compatibility with existing component
  const mappedType = type === "project" ? "opportunity" : type

  return {
    text,
    type: mappedType as any,
    id: source.mongoId || source.slug || esId,
    subtitle,
    score,
  }
}
