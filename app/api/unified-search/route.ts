import { NextRequest, NextResponse } from "next/server"
import { elasticSearch, elasticSuggest } from "@/lib/es-search"
// MongoDB fallback (kept for graceful degradation)
import { unifiedSearch, getSearchSuggestions } from "@/lib/search-indexes"
import { trackEvent } from "@/lib/analytics"

// ============================================
// Unified Search API — Elasticsearch-powered
// ============================================
// Params:
//   q        — search query
//   types    — comma-separated: "volunteer,ngo,opportunity,blog,page"
//   limit    — max results (default 20)
//   mode     — "suggestions" for autocomplete, "full" for search (default)
//   sort     — "relevance" | "newest" | "rating"
//   filters  — JSON-encoded filters object
//   engine   — "es" (default) or "mongo" (fallback)
// ============================================

const ELASTICSEARCH_ENABLED = !!(process.env.ELASTICSEARCH_URL && process.env.ELASTICSEARCH_API_KEY)

// Map legacy "opportunity" type to "project" for ES
function mapTypes(types: string[] | undefined): ("volunteer" | "ngo" | "project" | "blog" | "page")[] | undefined {
  if (!types) return undefined
  return types.map(t => t === "opportunity" ? "project" : t) as any
}

// Map ES types back to legacy for component compatibility
function mapResultType(type: string): string {
  return type === "project" ? "opportunity" : type
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q") || ""
    const typesParam = searchParams.get("types")
    const limitParam = searchParams.get("limit")
    const mode = searchParams.get("mode") || "full"
    const sort = (searchParams.get("sort") || "relevance") as "relevance" | "newest" | "rating"
    const filtersParam = searchParams.get("filters")
    const engine = searchParams.get("engine") || (ELASTICSEARCH_ENABLED ? "es" : "mongo")

    console.log(`[Search API] ===== NEW REQUEST =====`)
    console.log(`[Search API] query="${query}" mode=${mode} types=${typesParam} limit=${limitParam} engine=${engine} sort=${sort}`)
    console.log(`[Search API] ES_ENABLED=${ELASTICSEARCH_ENABLED} ES_URL=${process.env.ELASTICSEARCH_URL ? "SET" : "MISSING"} ES_KEY=${process.env.ELASTICSEARCH_API_KEY ? "SET" : "MISSING"}`)

    if (!query || query.trim().length < 1) {
      console.log(`[Search API] Query too short, returning empty`)
      return NextResponse.json({
        success: true,
        results: [],
        suggestions: [],
        message: "Query too short",
        query: "",
        count: 0,
        engine,
      })
    }

    const rawTypes = typesParam ? typesParam.split(",") : undefined
    const limit = limitParam ? parseInt(limitParam, 10) : 20

    // Parse optional filters
    let filters: Record<string, any> | undefined
    if (filtersParam) {
      try {
        filters = JSON.parse(filtersParam)
        console.log(`[Search API] Parsed filters:`, JSON.stringify(filters))
      } catch {
        console.log(`[Search API] Failed to parse filters: ${filtersParam}`)
      }
    }

    // ---- ELASTICSEARCH ENGINE ----
    if (engine === "es" && ELASTICSEARCH_ENABLED) {
      console.log(`[Search API] Using Elasticsearch engine`)

      // Autocomplete suggestions
      if (mode === "suggestions") {
        console.log(`[Search API] ES suggestions mode — types=${JSON.stringify(mapTypes(rawTypes))} limit=${Math.min(limit, 8)}`)
        const suggestions = await elasticSuggest({
          query,
          types: mapTypes(rawTypes),
          limit: Math.min(limit, 8),
        })
        console.log(`[Search API] ES suggestions returned: ${suggestions.length} results in ${Date.now() - startTime}ms`)
        if (suggestions.length > 0) {
          console.log(`[Search API] First suggestion: ${JSON.stringify(suggestions[0])}`)
        }

        // Map types back for component compatibility
        const mappedSuggestions = suggestions.map(s => ({
          text: s.text,
          type: mapResultType(s.type),
          id: s.id,
          subtitle: s.subtitle,
        }))

        return NextResponse.json({
          success: true,
          suggestions: mappedSuggestions,
          query,
          count: mappedSuggestions.length,
          engine: "elasticsearch",
        })
      }

      // Full search
      console.log(`[Search API] ES full search — types=${JSON.stringify(mapTypes(rawTypes))} limit=${Math.min(limit, 50)}`)
      const result = await elasticSearch({
        query,
        types: mapTypes(rawTypes),
        filters,
        limit: Math.min(limit, 50),
        sort,
      })
      console.log(`[Search API] ES search returned: ${result.results.length} of ${result.total} total, took ${result.took}ms (total ${Date.now() - startTime}ms)`)
      if (result.results.length > 0) {
        console.log(`[Search API] Top 3 results: ${result.results.slice(0, 3).map(r => `${r.type}:${r.title} (${r.score})`).join(", ")}`)
      } else {
        console.log(`[Search API] NO RESULTS from ES for query="${query}"`)
      }

      // Map types back and flatten metadata for frontend card components
      const mappedResults = result.results.map(r => {
        const m = r.metadata || {}
        // Build location string from city/country
        const locationParts = [m.city, m.country].filter(Boolean)
        const location = m.location || (locationParts.length > 0 ? locationParts.join(", ") : undefined)
        // Skills: volunteers/NGOs use skillNames, projects use skillNames too
        // Sort skills so query-matching ones appear first on cards
        let skills = Array.isArray(m.skillNames) && m.skillNames.length > 0 ? m.skillNames : undefined
        if (skills && query) {
          const queryTerms = query.toLowerCase().split(/\s+/).filter((t: string) => t.length >= 2)
          skills = [...skills].sort((a: string, b: string) => {
            const aLower = a.toLowerCase()
            const bLower = b.toLowerCase()
            const aMatch = queryTerms.some((t: string) => aLower.includes(t))
            const bMatch = queryTerms.some((t: string) => bLower.includes(t))
            if (aMatch && !bMatch) return -1
            if (!aMatch && bMatch) return 1
            return 0
          })
        }
        return {
          id: r.id,
          mongoId: r.mongoId,
          type: mapResultType(r.type),
          title: r.title,
          subtitle: r.subtitle,
          description: r.description,
          url: r.url,
          score: r.score,
          highlights: r.highlights,
          // Flattened fields for card rendering
          avatar: m.avatar || m.logo || undefined,
          location,
          skills,
          verified: m.isVerified || false,
          matchedField: r.highlights?.length > 0 ? r.highlights[0] : undefined,
          // Extra metadata for richer cards
          volunteerType: m.volunteerType || undefined,
          workMode: m.workMode || undefined,
          experienceLevel: m.experienceLevel || undefined,
          rating: m.rating || undefined,
          causes: Array.isArray(m.causeNames) && m.causeNames.length > 0 ? m.causeNames : undefined,
          ngoName: m.ngoName || undefined,
          status: m.status || undefined,
        }
      })

      // When ES returns no results, fall back to MongoDB so the user always gets something
      if (mappedResults.length === 0 && mode !== "suggestions") {
        console.log(`[Search API] ES returned 0 results for query="${query}" — falling back to MongoDB`)
        const mongoFallbackTypes = rawTypes as ("volunteer" | "ngo" | "opportunity")[] | undefined
        try {
          const mongoResults = await unifiedSearch({ query, types: mongoFallbackTypes, limit: Math.min(limit, 50) })
          console.log(`[Search API] MongoDB fallback returned ${mongoResults.length} results`)
          return NextResponse.json({
            success: true,
            results: mongoResults,
            query,
            count: mongoResults.length,
            engine: "mongodb-fallback",
          })
        } catch (mongoErr) {
          console.error("[Search API] MongoDB fallback also failed:", mongoErr)
        }
      }

      return NextResponse.json({
        success: true,
        results: mappedResults,
        query,
        count: result.total,
        took: result.took,
        engine: "elasticsearch",
      })
    }

    // ---- MONGODB FALLBACK ENGINE ----
    const mongoTypes = rawTypes as ("volunteer" | "ngo" | "opportunity")[] | undefined

    if (mode === "suggestions") {
      const suggestions = await getSearchSuggestions({
        query,
        types: mongoTypes,
        limit: Math.min(limit, 8),
      })
      trackEvent("search", "suggest", { metadata: { query, engine: "mongodb", count: suggestions.length } })
      return NextResponse.json({
        success: true,
        suggestions,
        query,
        count: suggestions.length,
        engine: "mongodb",
      })
    }

    const results = await unifiedSearch({
      query,
      types: mongoTypes,
      limit: Math.min(limit, 50),
    })

    trackEvent("search", "query", { metadata: { query, engine: "mongodb", count: results.length, took: Date.now() - startTime } })
    return NextResponse.json({
      success: true,
      results,
      query,
      count: results.length,
      engine: "mongodb",
    })
  } catch (error: any) {
    console.error(`[Search API] ERROR after ${Date.now() - startTime}ms:`, error?.message || error)
    console.error(`[Search API] Stack:`, error?.stack?.split("\n").slice(0, 5).join("\n"))

    // If ES fails, try MongoDB fallback
    if (ELASTICSEARCH_ENABLED) {
      console.log(`[Search API] Attempting MongoDB fallback...`)
      try {
        const { searchParams } = new URL(request.url)
        const query = searchParams.get("q") || ""
        const mode = searchParams.get("mode")

        if (mode === "suggestions") {
          const suggestions = await getSearchSuggestions({
            query,
            limit: 6,
          })
          return NextResponse.json({
            success: true,
            suggestions,
            query,
            count: suggestions.length,
            engine: "mongodb-fallback",
          })
        }

        const results = await unifiedSearch({ query, limit: 20 })
        return NextResponse.json({
          success: true,
          results,
          query,
          count: results.length,
          engine: "mongodb-fallback",
        })
      } catch (fallbackError: any) {
        console.error("[Unified Search API] Fallback also failed:", fallbackError)
      }
    }

    return NextResponse.json(
      { success: false, error: error.message || "Search failed", results: [], count: 0 },
      { status: 500 }
    )
  }
}
