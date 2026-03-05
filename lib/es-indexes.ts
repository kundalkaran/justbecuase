// ============================================
// Elasticsearch Index Management
// ============================================
// Creates/updates index mappings with:
// - Text fields with analyzers for keyword + fuzzy search
// - semantic_text fields for natural language understanding (ELSER)
// - Completion suggesters for instant autocomplete
// - Proper field boosting via mapping metadata
// ============================================

import esClient, { ES_INDEXES } from "./elasticsearch"

// ============================================
// SKILL & CAUSE NAME LOOKUPS (for denormalization)
// ============================================

// Auto-generate SKILL_MAP from the canonical skillCategories source
import { skillCategories as _skillCats } from "./skills-data"

const SKILL_MAP: Record<string, { categoryName: string; subskillName: string }> = {}
for (const cat of _skillCats) {
  for (const sub of cat.subskills) {
    SKILL_MAP[sub.id] = { categoryName: cat.name, subskillName: sub.name }
  }
}

const CAUSE_MAP: Record<string, string> = {
  "education": "Education",
  "healthcare": "Healthcare",
  "environment": "Environment",
  "poverty-alleviation": "Poverty Alleviation",
  "women-empowerment": "Women Empowerment",
  "child-welfare": "Child Welfare",
  "animal-welfare": "Animal Welfare",
  "disaster-relief": "Disaster Relief",
  "human-rights": "Human Rights",
  "arts-culture": "Arts & Culture",
  "senior-citizens": "Senior Citizens",
  "disability-support": "Disability Support",
}

export { SKILL_MAP, CAUSE_MAP }

// ============================================
// CUSTOM ANALYZER SETTINGS
// ============================================

const SHARED_ANALYSIS_SETTINGS = {
  analyzer: {
    // Autocomplete analyzer — produces edge n-grams for prefix matching
    autocomplete_analyzer: {
      type: "custom" as const,
      tokenizer: "autocomplete_tokenizer",
      filter: ["lowercase", "asciifolding"],
    },
    // Search-time analyzer — standard tokenization (no edge n-grams)
    autocomplete_search_analyzer: {
      type: "custom" as const,
      tokenizer: "standard",
      filter: ["lowercase", "asciifolding"],
    },
  },
  tokenizer: {
    autocomplete_tokenizer: {
      type: "edge_ngram" as const,
      min_gram: 1,
      max_gram: 20,
      token_chars: ["letter", "digit"],
    },
  },
}

// ============================================
// SHARED FIELD PATTERNS
// ============================================

// Multi-field text with autocomplete + keyword
// NOTE: boost is NOT set at mapping time (unsupported in ES serverless).
// We use query-time boosting in es-search.ts instead.
function searchableTextField(_boost: number = 1) {
  return {
    type: "text" as const,
    analyzer: "autocomplete_analyzer",
    search_analyzer: "autocomplete_search_analyzer",
    fields: {
      keyword: { type: "keyword" as const, ignore_above: 512 },
      exact: { type: "text" as const, analyzer: "standard" },
    },
  }
}

function keywordField() {
  return { type: "keyword" as const, ignore_above: 256 }
}

// ============================================
// INDEX CREATION
// ============================================

export async function ensureElasticsearchIndexes(): Promise<void> {
  console.log("[ES] Creating/updating Elasticsearch indexes...")

  // 1. VOLUNTEERS INDEX
  await createIndexIfNotExists(ES_INDEXES.VOLUNTEERS, {
    settings: {
      analysis: SHARED_ANALYSIS_SETTINGS,
    },
    mappings: {
      properties: {
        // Identity
        mongoId: keywordField(),
        userId: keywordField(),
        name: searchableTextField(10),
        avatar: keywordField(),
        
        // Profile content
        headline: searchableTextField(6),
        bio: searchableTextField(3),
        
        // Location
        location: searchableTextField(4),
        city: searchableTextField(4),
        country: searchableTextField(3),
        coordinates: { type: "geo_point" as const },
        
        // Skills — denormalized for search
        skillIds: keywordField(),
        skillNames: searchableTextField(8),
        skillCategories: searchableTextField(5),
        
        // Causes
        causeIds: keywordField(),
        causeNames: searchableTextField(6),
        
        // Filters
        volunteerType: keywordField(),
        workMode: keywordField(),
        experienceLevel: keywordField(),
        availability: keywordField(),
        hoursPerWeek: { type: "integer" as const },
        hourlyRate: { type: "float" as const },
        currency: keywordField(),
        rating: { type: "float" as const },
        totalRatings: { type: "integer" as const },
        completedProjects: { type: "integer" as const },
        
        // Metadata
        isVerified: { type: "boolean" as const },
        isActive: { type: "boolean" as const },
        subscriptionPlan: keywordField(),
        languages: searchableTextField(3),
        interests: searchableTextField(2),
        linkedinUrl: keywordField(),
        portfolioUrl: keywordField(),
        
        // Semantic field — all content combined for natural language search
        semantic_content: {
          type: "semantic_text" as const,
        },
        
        // Autocomplete suggest
        suggest: {
          type: "completion" as const,
          analyzer: "simple",
          preserve_separators: true,
          preserve_position_increments: true,
          max_input_length: 50,
        },
        
        // Timestamps
        createdAt: { type: "date" as const },
        updatedAt: { type: "date" as const },
        syncedAt: { type: "date" as const },
      },
    },
  })

  // 2. NGOS INDEX
  await createIndexIfNotExists(ES_INDEXES.NGOS, {
    settings: {
      analysis: SHARED_ANALYSIS_SETTINGS,
    },
    mappings: {
      properties: {
        mongoId: keywordField(),
        userId: keywordField(),
        orgName: searchableTextField(10),
        organizationName: searchableTextField(10),
        contactPersonName: searchableTextField(4),
        
        // Content
        description: searchableTextField(4),
        mission: searchableTextField(4),
        
        // Location
        address: searchableTextField(3),
        city: searchableTextField(4),
        country: searchableTextField(3),
        coordinates: { type: "geo_point" as const },
        website: keywordField(),
        
        // Skills needed
        skillIds: keywordField(),
        skillNames: searchableTextField(7),
        skillCategories: searchableTextField(5),
        
        // Causes
        causeIds: keywordField(),
        causeNames: searchableTextField(6),
        
        // Filters
        acceptRemoteVolunteers: { type: "boolean" as const },
        acceptOnsiteVolunteers: { type: "boolean" as const },
        yearFounded: keywordField(),
        teamSize: keywordField(),
        
        // Stats
        projectsPosted: { type: "integer" as const },
        projectsCompleted: { type: "integer" as const },
        volunteersEngaged: { type: "integer" as const },
        
        // Metadata
        isVerified: { type: "boolean" as const },
        isActive: { type: "boolean" as const },
        logo: keywordField(),
        
        // Semantic field
        semantic_content: {
          type: "semantic_text" as const,
        },
        
        // Autocomplete
        suggest: {
          type: "completion" as const,
          analyzer: "simple",
          preserve_separators: true,
          preserve_position_increments: true,
          max_input_length: 50,
        },
        
        createdAt: { type: "date" as const },
        updatedAt: { type: "date" as const },
        syncedAt: { type: "date" as const },
      },
    },
  })

  // 3. PROJECTS INDEX
  await createIndexIfNotExists(ES_INDEXES.PROJECTS, {
    settings: {
      analysis: SHARED_ANALYSIS_SETTINGS,
    },
    mappings: {
      properties: {
        mongoId: keywordField(),
        ngoId: keywordField(),
        ngoProfileId: keywordField(),
        ngoName: searchableTextField(5),
        
        title: searchableTextField(10),
        description: searchableTextField(5),
        
        // Skills
        skillIds: keywordField(),
        skillNames: searchableTextField(8),
        skillCategories: searchableTextField(5),
        
        // Causes
        causeIds: keywordField(),
        causeNames: searchableTextField(6),
        
        // Filters
        experienceLevel: keywordField(),
        timeCommitment: searchableTextField(2),
        duration: searchableTextField(2),
        projectType: keywordField(),
        workMode: keywordField(),
        location: searchableTextField(4),
        status: keywordField(),
        
        // Dates
        startDate: { type: "date" as const },
        deadline: { type: "date" as const },
        
        // Stats
        applicantsCount: { type: "integer" as const },
        viewsCount: { type: "integer" as const },
        
        // Semantic field
        semantic_content: {
          type: "semantic_text" as const,
        },
        
        // Autocomplete
        suggest: {
          type: "completion" as const,
          analyzer: "simple",
          preserve_separators: true,
          preserve_position_increments: true,
          max_input_length: 50,
        },
        
        createdAt: { type: "date" as const },
        updatedAt: { type: "date" as const },
        syncedAt: { type: "date" as const },
      },
    },
  })

  // 4. BLOG POSTS INDEX
  await createIndexIfNotExists(ES_INDEXES.BLOG_POSTS, {
    settings: {
      analysis: SHARED_ANALYSIS_SETTINGS,
    },
    mappings: {
      properties: {
        mongoId: keywordField(),
        slug: keywordField(),
        title: searchableTextField(10),
        excerpt: searchableTextField(6),
        content: searchableTextField(3),
        
        authorId: keywordField(),
        authorName: searchableTextField(4),
        
        tags: searchableTextField(5),
        category: searchableTextField(4),
        
        status: keywordField(),
        publishedAt: { type: "date" as const },
        viewCount: { type: "integer" as const },
        
        // Semantic field
        semantic_content: {
          type: "semantic_text" as const,
        },
        
        // Autocomplete
        suggest: {
          type: "completion" as const,
          analyzer: "simple",
          preserve_separators: true,
          preserve_position_increments: true,
          max_input_length: 50,
        },
        
        createdAt: { type: "date" as const },
        updatedAt: { type: "date" as const },
        syncedAt: { type: "date" as const },
      },
    },
  })

  // 5. STATIC PAGES INDEX
  await createIndexIfNotExists(ES_INDEXES.PAGES, {
    settings: {
      analysis: SHARED_ANALYSIS_SETTINGS,
    },
    mappings: {
      properties: {
        slug: keywordField(),
        title: searchableTextField(10),
        description: searchableTextField(5),
        content: searchableTextField(3),
        section: keywordField(),
        
        semantic_content: {
          type: "semantic_text" as const,
        },
        
        suggest: {
          type: "completion" as const,
          analyzer: "simple",
          preserve_separators: true,
          preserve_position_increments: true,
          max_input_length: 50,
        },
        
        updatedAt: { type: "date" as const },
        syncedAt: { type: "date" as const },
      },
    },
  })

  console.log("[ES] All indexes created/verified successfully")
}

// ============================================
// HELPER: Create index if it doesn't exist
// ============================================

async function createIndexIfNotExists(
  indexName: string,
  body: { settings: Record<string, any>; mappings: Record<string, any> }
): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: indexName })
    if (exists) {
      // Update mappings (additive — you can add fields but not change existing ones)
      try {
        await esClient.indices.putMapping({
          index: indexName,
          ...body.mappings,
        })
        console.log(`[ES] Updated mappings for index: ${indexName}`)
      } catch (mappingErr: any) {
        // This is expected if semantic_text fields already exist
        if (!mappingErr?.message?.includes("mapper_parsing_exception")) {
          console.warn(`[ES] Could not update mappings for ${indexName}:`, mappingErr?.message)
        }
      }
      return
    }

    await esClient.indices.create({
      index: indexName,
      ...body,
    })
    console.log(`[ES] Created index: ${indexName}`)
  } catch (error: any) {
    if (error?.meta?.body?.error?.type === "resource_already_exists_exception") {
      console.log(`[ES] Index already exists: ${indexName}`)
      return
    }
    console.error(`[ES] Failed to create index ${indexName}:`, error?.message || error)
    throw error
  }
}
