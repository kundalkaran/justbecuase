// ============================================
// MongoDB Search Engine - Amazon-Level Search
// ============================================
// Features:
// - Instant search from 1 character (prefix matching)
// - Fuzzy matching with Levenshtein distance for typo tolerance
// - Multi-strategy: $text → regex prefix → fuzzy fallback
// - Privacy enforcement (showInSearch)
// - Smart scoring with field-weighted relevance
// - Search suggestions/autocomplete support
// - Covers ALL fields: skills, causes, hours, rates, languages, etc.
// - Natural language number parsing ("4 hours" → numeric match)
// - Project/Opportunity search with dot-notation on skillsRequired
// ============================================

import client from "./db"
import { skillCategories as _srcSkillCategories, causes as _srcCauses } from "./skills-data"

const DB_NAME = "justbecause"

// ============================================
// SKILL & CAUSE LOOKUP TABLES
// ============================================

interface SkillEntry {
  categoryId: string
  categoryName: string
  subskillId: string
  subskillName: string
  searchableText: string
}

interface CauseEntry {
  id: string
  name: string
}

// Derive from canonical source (lib/skills-data.tsx) — no more stale duplicates
const SKILL_CATEGORIES: { id: string; name: string; subskills: { id: string; name: string }[] }[] =
  _srcSkillCategories.map(c => ({
    id: c.id,
    name: c.name,
    subskills: c.subskills.map(s => ({ id: s.id, name: s.name })),
  }))

const CAUSE_LIST: CauseEntry[] = _srcCauses.map(c => ({ id: c.id, name: c.name }))

// ============================================
// SEMANTIC SYNONYM / RELATED-TERMS MAP
// ============================================
// When a user searches "ad campaign", we also want to find
// PPC, Google Ads, Meta Ads, Social Media Ads, etc.
// This maps concept keywords → all related terms that should
// also be searched (bidirectional expansion).

const SYNONYM_GROUPS: string[][] = [
  // Advertising & Campaigns
  ["ad", "ads", "advert", "advertising", "advertisement", "campaign", "campaigns", "promotion", "promote", "ppc", "google ads", "meta ads", "facebook ads", "social media ads", "paid media", "sponsored", "boost", "boosting"],
  // Marketing broad
  ["marketing", "digital marketing", "branding", "brand", "outreach", "engagement", "reach", "growth", "awareness"],
  // SEO & Content Marketing
  ["seo", "search engine", "ranking", "organic", "keywords", "content marketing", "blog", "blogging", "content strategy"],
  // Social Media
  ["social media", "social", "facebook", "instagram", "twitter", "linkedin", "youtube", "tiktok", "reels", "posts", "stories", "influencer"],
  // Email & Messaging
  ["email", "newsletter", "mailchimp", "email marketing", "automation", "drip", "email copywriting", "bulk email", "mailing"],
  // WhatsApp
  ["whatsapp", "whatsapp marketing", "messaging", "sms", "text message", "broadcast"],
  // Website & Web Development
  ["web", "website", "webpage", "site", "wordpress", "html", "css", "frontend", "front-end", "landing page", "cms", "web design", "web development", "webdev", "react", "nextjs", "next.js", "shopify", "webflow", "wix", "squarespace", "ecommerce", "e-commerce", "vercel", "netlify"],
  // Backend & Full-Stack Development
  ["backend", "back-end", "node", "nodejs", "node.js", "express", "api", "rest", "graphql", "server", "database", "mongodb", "postgresql", "mysql", "sql", "python", "django", "flask", "full stack", "fullstack"],
  // Mobile Development
  ["mobile", "mobile app", "react native", "flutter", "ios", "android", "app development", "native app", "cross platform"],
  // DevOps & Infrastructure
  ["devops", "hosting", "aws", "azure", "gcp", "digitalocean", "docker", "kubernetes", "ci/cd", "deployment", "infrastructure", "cloud"],
  // UX/UI Design
  ["ux", "ui", "user experience", "user interface", "design", "wireframe", "prototype", "figma", "usability"],
  // Content Creation & Design (the CATEGORY — photography, video, graphic design)
  ["content creator", "content creation", "content creation & design", "creator", "creative", "multimedia", "media", "visual content", "digital content", "social media content"],
  // Graphic Design & Creative
  ["graphic", "graphics", "graphic design", "visual", "illustration", "poster", "banner", "flyer", "brochure", "canva", "photoshop", "illustrator", "figma", "infographic", "branding", "logo", "brand identity", "presentation", "powerpoint", "google slides"],
  // Video & Motion
  ["video", "videography", "video editing", "motion graphics", "animation", "film", "filming", "shooting", "documentary", "premiere", "after effects", "reel", "reels", "shorts", "youtube", "tiktok", "davinci", "davinci resolve", "podcast", "podcast production", "audio"],
  // Photography
  ["photo", "photography", "photographer", "photo editing", "retouching", "lightroom", "camera", "portrait", "event photography"],
  // Writing & Communication (NOT conflated with Content Creation category)
  ["writing", "writer", "copywriting", "copywriter", "blog", "article", "storytelling", "impact story", "press release", "annual report", "report writing", "newsletter", "proposal", "rfp", "translation", "localization", "public speaking", "training"],
  // Fundraising & Grants
  ["fundraising", "fundraiser", "donation", "donate", "grant", "grants", "grant writing", "grant research", "sponsorship", "sponsor", "corporate sponsorship", "crowdfunding", "charity", "philanthropy", "giving", "donor", "donors", "csr", "gofundme", "ketto", "milaap", "donor management"],
  // Finance & Accounting
  ["finance", "financial", "accounting", "accountant", "bookkeeping", "bookkeeper", "budget", "budgeting", "forecasting", "payroll", "tally", "quickbooks", "zoho", "audit", "tax", "taxation", "revenue", "fcra", "80g", "12a", "compliance", "financial modelling"],
  // Legal & Compliance
  ["legal", "law", "lawyer", "advocate", "compliance", "contract", "policy", "ngo registration", "trust", "society", "section 8", "fcra", "trademark", "ip", "intellectual property", "rti", "governance", "pro bono counsel"],
  // Events & Planning
  ["event", "events", "event planning", "event management", "conference", "seminar", "workshop", "meetup", "webinar", "logistics", "coordination", "organizing"],
  // Support & Communication
  ["support", "customer support", "helpdesk", "telecalling", "calling", "phone support", "customer service", "help"],
  // Volunteer & Recruitment
  ["volunteer", "volunteering", "recruitment", "recruit", "hire", "hiring", "talent", "onboarding", "staffing"],
  // Education & Learning
  ["education", "teaching", "teacher", "tutor", "tutoring", "mentoring", "mentor", "training", "learning", "school", "student", "academic", "literacy", "scholarship"],
  // Healthcare & Medical
  ["healthcare", "health", "medical", "medicine", "doctor", "hospital", "clinic", "nursing", "nurse", "wellness", "mental health", "therapy", "counseling", "sanitation", "hygiene"],
  // Environment & Climate
  ["environment", "environmental", "climate", "green", "sustainability", "sustainable", "ecology", "conservation", "pollution", "recycle", "recycling", "clean energy", "renewable", "tree", "plantation", "nature", "wildlife"],
  // Poverty & Development
  ["poverty", "poor", "underprivileged", "slum", "rural", "development", "livelihood", "income", "microfinance", "welfare", "food", "hunger", "nutrition", "shelter", "housing"],
  // Women & Gender
  ["women", "woman", "girl", "girls", "gender", "empowerment", "women empowerment", "feminine", "maternal", "pregnancy", "domestic violence"],
  // Children & Youth
  ["child", "children", "kids", "youth", "young", "child welfare", "orphan", "juvenile", "adolescent", "teen", "teenager", "pediatric"],
  // Animals
  ["animal", "animals", "animal welfare", "pet", "pets", "dog", "cat", "stray", "shelter", "rescue", "veterinary", "wildlife", "endangered"],
  // Disaster & Emergency
  ["disaster", "relief", "emergency", "flood", "earthquake", "cyclone", "tsunami", "hurricane", "rescue", "rehabilitation", "crisis", "humanitarian"],
  // Human Rights & Advocacy
  ["human rights", "rights", "justice", "advocacy", "equality", "discrimination", "refugee", "migrants", "freedom", "democracy", "legal aid"],
  // Disability
  ["disability", "disabled", "differently abled", "handicap", "accessibility", "inclusive", "inclusion", "special needs", "blind", "deaf", "wheelchair"],
  // Senior Citizens
  ["senior", "elderly", "old age", "senior citizens", "retirement", "aged", "geriatric"],
  // Arts & Culture
  ["art", "arts", "culture", "cultural", "heritage", "music", "dance", "drama", "theater", "theatre", "painting", "craft", "crafts", "folk", "tradition"],
  // Technology & IT
  ["technology", "tech", "it", "software", "developer", "programming", "coding", "app", "application", "mobile", "data", "database", "cloud", "server", "devops", "api", "automation", "zapier", "make", "n8n", "chatbot", "ai", "machine learning", "ml", "power bi", "tableau", "looker", "data analysis", "data visualization", "cybersecurity", "google workspace", "microsoft 365"],
  // Management & Strategy
  ["management", "manager", "strategy", "strategic", "planning", "operations", "project management", "leadership", "administration", "admin", "notion", "trello", "asana", "jira", "monitoring", "evaluation", "m&e", "data entry", "documentation", "hr", "human resources", "crm", "hubspot"],
  // Remote / Work Mode
  ["remote", "work from home", "wfh", "online", "virtual", "distributed", "telecommute"],
  ["onsite", "on-site", "in-person", "office", "physical", "field work", "on ground"],
  ["hybrid", "flexible", "part remote", "mixed"],
  // Free / Paid volunteering
  ["free", "unpaid", "pro bono", "no cost", "voluntary", "complimentary"],
  ["paid", "stipend", "compensated", "salary", "honorarium", "remuneration"],
]

// Build a fast lookup: word → set of all related words
const SYNONYM_MAP = new Map<string, Set<string>>()
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    const termLower = term.toLowerCase()
    if (!SYNONYM_MAP.has(termLower)) {
      SYNONYM_MAP.set(termLower, new Set<string>())
    }
    const set = SYNONYM_MAP.get(termLower)!
    for (const related of group) {
      if (related.toLowerCase() !== termLower) {
        set.add(related.toLowerCase())
      }
    }
  }
}

/**
 * Expand search terms with synonyms/related concepts.
 * "ad campaign" → ["ad", "campaign", "ads", "advertising", "ppc", "google ads", "meta ads", ...]
 * Only expands terms that have known synonyms. Does NOT expand random words.
 */
function expandWithSynonyms(searchTerms: string[]): string[] {
  const expanded = new Set<string>(searchTerms)
  const fullQuery = searchTerms.join(" ").toLowerCase()

  // First try matching the full query as a phrase (e.g., "ad campaign")
  for (const [key, synonyms] of SYNONYM_MAP) {
    if (fullQuery.includes(key) || key.includes(fullQuery)) {
      for (const syn of synonyms) expanded.add(syn)
    }
  }

  // Then match each individual term
  for (const term of searchTerms) {
    const termLower = term.toLowerCase()
    const synonyms = SYNONYM_MAP.get(termLower)
    if (synonyms) {
      for (const syn of synonyms) expanded.add(syn)
    }
    // Also check if term is a substring of any synonym key (e.g., "fund" → matches "fundraising")
    if (termLower.length >= 3) {
      for (const [key, synonyms] of SYNONYM_MAP) {
        if (key.startsWith(termLower) || (termLower.length >= 4 && key.includes(termLower))) {
          expanded.add(key)
          for (const syn of synonyms) expanded.add(syn)
        }
      }
    }
  }

  return Array.from(expanded)
}

// Build flat lookup: subskillId → full searchable data
const SKILL_LOOKUP = new Map<string, SkillEntry>()
const ALL_SKILL_ENTRIES: SkillEntry[] = []
for (const cat of SKILL_CATEGORIES) {
  for (const sub of cat.subskills) {
    const entry: SkillEntry = {
      categoryId: cat.id,
      categoryName: cat.name,
      subskillId: sub.id,
      subskillName: sub.name,
      searchableText: `${sub.name} ${cat.name} ${sub.id.replace(/-/g, " ")} ${cat.id.replace(/-/g, " ")}`.toLowerCase(),
    }
    SKILL_LOOKUP.set(sub.id, entry)
    ALL_SKILL_ENTRIES.push(entry)
  }
}

/**
 * Given search terms like ["email"], find all matching skill subskillIds.
 * Uses synonym expansion: "ad campaign" → finds PPC, Google Ads, Meta Ads, etc.
 */
export function findMatchingSkillIds(searchTerms: string[]): string[] {
  const matchedIds = new Set<string>()
  // Expand with synonym/related terms
  const expandedTerms = expandWithSynonyms(searchTerms)
  for (const term of expandedTerms) {
    const termLower = term.toLowerCase()
    for (const entry of ALL_SKILL_ENTRIES) {
      if (entry.searchableText.includes(termLower)) {
        matchedIds.add(entry.subskillId)
      }
      if (termLower.length >= 4) {
        const words = entry.searchableText.split(/\s+/)
        for (const word of words) {
          if (word.length >= 3 && levenshteinDistance(termLower, word) <= Math.floor(termLower.length / 4)) {
            matchedIds.add(entry.subskillId)
            break
          }
        }
      }
    }
  }
  return Array.from(matchedIds)
}

/**
 * Given search terms, find all matching cause IDs.
 * Uses synonym expansion: "children" → finds child-welfare, education, etc.
 */
function findMatchingCauseIds(searchTerms: string[]): string[] {
  const matchedIds = new Set<string>()
  const expandedTerms = expandWithSynonyms(searchTerms)
  for (const term of expandedTerms) {
    const termLower = term.toLowerCase()
    for (const cause of CAUSE_LIST) {
      const searchable = `${cause.name} ${cause.id.replace(/-/g, " ")}`.toLowerCase()
      if (searchable.includes(termLower)) {
        matchedIds.add(cause.id)
      }
    }
  }
  return Array.from(matchedIds)
}

function getSkillDisplayName(subskillId: string): string {
  return SKILL_LOOKUP.get(subskillId)?.subskillName || subskillId.replace(/-/g, " ")
}

function getCauseDisplayName(causeId: string): string {
  return CAUSE_LIST.find(c => c.id === causeId)?.name || causeId.replace(/-/g, " ")
}

// ============================================
// INDEX MANAGEMENT
// ============================================

let indexesEnsured = false

export async function ensureSearchIndexes(): Promise<void> {
  if (indexesEnsured) return
  try {
    await client.connect()
    const db = client.db(DB_NAME)

    const userCollection = db.collection("user")
    const userIndexes = await userCollection.listIndexes().toArray()
    const hasUserTextIndex = userIndexes.some(idx => idx.name === "user_text_search")

    if (!hasUserTextIndex) {
      await userCollection.createIndex(
        {
          name: "text",
          bio: "text",
          location: "text",
          city: "text",
          country: "text",
          organizationName: "text",
          orgName: "text",
          description: "text",
          headline: "text",
          mission: "text",
          address: "text",
          experience: "text",
          contactPersonName: "text",
        },
        {
          name: "user_text_search",
          weights: {
            name: 10,
            organizationName: 10,
            orgName: 10,
            headline: 5,
            bio: 3,
            description: 3,
            mission: 3,
            experience: 2,
            contactPersonName: 2,
            address: 2,
            location: 2,
            city: 2,
            country: 1,
          },
          default_language: "english",
        }
      )
      console.log("[Search] Created text index on user collection")
    }

    const hasNameIndex = userIndexes.some(idx => idx.key?.name === 1)
    if (!hasNameIndex) {
      await userCollection.createIndex({ name: 1 })
      await userCollection.createIndex({ organizationName: 1 })
      await userCollection.createIndex({ orgName: 1 })
    }

    const projectsCollection = db.collection("projects")
    const projectIndexes = await projectsCollection.listIndexes().toArray()
    const hasProjectTextIndex = projectIndexes.some(idx => idx.name === "project_text_search")

    if (!hasProjectTextIndex) {
      await projectsCollection.createIndex(
        {
          title: "text",
          description: "text",
          location: "text",
          timeCommitment: "text",
          duration: "text",
        },
        {
          name: "project_text_search",
          weights: {
            title: 10,
            description: 5,
            location: 2,
            timeCommitment: 1,
            duration: 1,
          },
          default_language: "english",
        }
      )
      console.log("[Search] Created text index on projects collection")
    }

    const hasTitleIndex = projectIndexes.some(idx => idx.key?.title === 1)
    if (!hasTitleIndex) {
      await projectsCollection.createIndex({ title: 1 })
    }

    indexesEnsured = true
    console.log("[Search] All search indexes verified")
  } catch (error) {
    console.error("[Search] Failed to create indexes:", error)
  }
}

// ============================================
// TYPES
// ============================================

export interface SearchResult {
  type: "volunteer" | "ngo" | "opportunity"
  id: string
  title: string
  subtitle?: string
  description?: string
  location?: string
  skills?: string[]
  score: number
  avatar?: string
  verified?: boolean
  matchedField?: string
}

export interface UnifiedSearchParams {
  query: string
  types?: ("volunteer" | "ngo" | "opportunity")[]
  limit?: number
}

export interface SearchSuggestionsParams {
  query: string
  types?: ("volunteer" | "ngo" | "opportunity")[]
  limit?: number
}

export interface SearchSuggestion {
  text: string
  type: "volunteer" | "ngo" | "opportunity"
  id: string
  subtitle?: string
}

// ============================================
// FUZZY / UTILITY HELPERS
// ============================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  const aLen = a.length
  const bLen = b.length

  if (aLen === 0) return bLen
  if (bLen === 0) return aLen

  for (let i = 0; i <= bLen; i++) matrix[i] = [i]
  for (let j = 0; j <= aLen; j++) matrix[0][j] = j

  for (let i = 1; i <= bLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[bLen][aLen]
}

function generateFuzzyPattern(term: string): RegExp {
  if (term.length <= 2) {
    return new RegExp(`^${escapeRegex(term)}`, "i")
  }
  const escaped = escapeRegex(term)
  return new RegExp(`${escaped}`, "i")
}

/**
 * Privacy filter - simplified to avoid $or collision
 * MongoDB: $ne false matches missing fields, undefined, true, etc.
 */
function buildPrivacyFilter(): Record<string, any> {
  return { "privacy.showInSearch": { $ne: false } }
}

// ============================================
// PARSE HELPERS
// ============================================

function parseSkillIds(skills: any): string[] {
  if (!skills) return []
  try {
    const parsed = typeof skills === "string" ? JSON.parse(skills) : skills
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((s: any) => {
        if (typeof s === "string") return s
        return s.subskillId || s.name || s.label || String(s)
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function parseSkillDisplayNames(skills: any): string[] {
  const ids = parseSkillIds(skills)
  return ids.slice(0, 5).map(id => getSkillDisplayName(id))
}

function parseCauses(causes: any): string[] {
  if (!causes) return []
  try {
    const parsed = typeof causes === "string" ? JSON.parse(causes) : causes
    if (!Array.isArray(parsed)) return []
    return parsed.filter((c: any) => typeof c === "string")
  } catch {
    return []
  }
}

/**
 * Build searchable text from skills (JSON string or array)
 */
function buildSkillsSearchText(skills: any): string {
  const ids = parseSkillIds(skills)
  return ids.map(id => {
    const entry = SKILL_LOOKUP.get(id)
    if (entry) return `${entry.subskillName} ${entry.categoryName}`
    return id.replace(/-/g, " ")
  }).join(" ").toLowerCase()
}

function buildCausesSearchText(causes: any): string {
  const ids = parseCauses(causes)
  return ids.map(id => getCauseDisplayName(id)).join(" ").toLowerCase()
}

/**
 * Build searchable text from typicalSkillsNeeded (NGO) or skillsRequired (Project)
 * These are stored as arrays of objects: [{categoryId, subskillId, ...}]
 */
function buildObjectSkillsSearchText(skillsArr: any): string {
  if (!skillsArr) return ""
  try {
    const parsed = typeof skillsArr === "string" ? JSON.parse(skillsArr) : skillsArr
    if (!Array.isArray(parsed)) return ""
    return parsed.map((s: any) => {
      const subId = s.subskillId || ""
      const entry = SKILL_LOOKUP.get(subId)
      if (entry) return `${entry.subskillName} ${entry.categoryName}`
      return `${subId.replace(/-/g, " ")} ${(s.categoryId || "").replace(/-/g, " ")}`
    }).join(" ").toLowerCase()
  } catch {
    return ""
  }
}

/**
 * Extract numbers from search terms for numeric field matching.
 * e.g., ["4", "hours"] → [4], ["10-15"] → [10, 15]
 */
function extractNumbers(searchTerms: string[]): number[] {
  const numbers: number[] = []
  for (const term of searchTerms) {
    const num = parseFloat(term)
    if (!isNaN(num) && isFinite(num)) {
      numbers.push(num)
    }
    const rangeMatch = term.match(/^(\d+)\s*[-–]\s*(\d+)$/)
    if (rangeMatch) {
      numbers.push(parseFloat(rangeMatch[1]))
      numbers.push(parseFloat(rangeMatch[2]))
    }
  }
  return [...new Set(numbers)]
}

/**
 * Convert any value to string for text-based scoring
 */
function numericToString(val: any): string {
  if (val === null || val === undefined) return ""
  if (typeof val === "number") return String(val)
  if (typeof val === "string") return val
  return ""
}

// ============================================
// RELEVANCE SCORING
// ============================================

/**
 * Advanced relevance scoring - searches ALL profile + project fields
 */
function computeRelevanceScore(doc: any, searchTerms: string[]): number {
  let score = 0

  // Direct string fields with weights
  const fields = [
    { key: "name", weight: 15 },
    { key: "title", weight: 15 },
    { key: "organizationName", weight: 15 },
    { key: "orgName", weight: 14 },
    { key: "headline", weight: 8 },
    { key: "bio", weight: 4 },
    { key: "description", weight: 4 },
    { key: "mission", weight: 4 },
    { key: "experience", weight: 3 },
    { key: "location", weight: 3 },
    { key: "city", weight: 3 },
    { key: "address", weight: 3 },
    { key: "country", weight: 2 },
    { key: "workMode", weight: 3 },
    { key: "volunteerType", weight: 3 },
    { key: "availability", weight: 2 },
    { key: "contactPersonName", weight: 2 },
    { key: "contactEmail", weight: 1 },
    { key: "hoursPerWeek", weight: 2 },
    { key: "currency", weight: 1 },
    { key: "phone", weight: 1 },
    { key: "linkedIn", weight: 1 },
    { key: "portfolio", weight: 1 },
    { key: "website", weight: 1 },
    { key: "yearFounded", weight: 1 },
    { key: "teamSize", weight: 1 },
    { key: "registrationNumber", weight: 1 },
    // Project-specific string fields
    { key: "timeCommitment", weight: 2 },
    { key: "duration", weight: 2 },
    { key: "projectType", weight: 2 },
    { key: "experienceLevel", weight: 2 },
  ]

  for (const term of searchTerms) {
    const termLower = term.toLowerCase()

    // --- Score direct text fields ---
    for (const field of fields) {
      const value = doc[field.key]
      if (!value || typeof value !== "string") continue
      const valueLower = value.toLowerCase()

      if (valueLower === termLower) {
        score += field.weight * 4
        continue
      }
      if (valueLower.startsWith(termLower)) {
        score += field.weight * 3
        continue
      }
      const wordBoundary = new RegExp(`\\b${escapeRegex(termLower)}`, "i")
      if (wordBoundary.test(value)) {
        score += field.weight * 2.5
        continue
      }
      if (valueLower.includes(termLower)) {
        score += field.weight * 1.5
        continue
      }
      if (termLower.length >= 3) {
        const words = valueLower.split(/\s+/)
        for (const word of words) {
          const dist = levenshteinDistance(termLower, word.slice(0, termLower.length + 2))
          if (dist <= Math.max(2, Math.floor(termLower.length / 3))) {
            score += field.weight * 0.8
            break
          }
        }
      }
    }

    // --- Score SKILLS (user skills - JSON strings expanded to human-readable names) ---
    const skillsText = buildSkillsSearchText(doc.skills || doc.skillsRequired)
    if (skillsText) {
      if (skillsText.includes(termLower)) {
        const wordBoundary = new RegExp(`\\b${escapeRegex(termLower)}`, "i")
        if (wordBoundary.test(skillsText)) {
          score += 14
        } else {
          score += 8
        }
      } else if (termLower.length >= 3) {
        const skillWords = skillsText.split(/\s+/)
        for (const word of skillWords) {
          if (word.length >= 3 && levenshteinDistance(termLower, word) <= Math.max(2, Math.floor(termLower.length / 3))) {
            score += 6
            break
          }
        }
      }
    }

    // --- Score CAUSES (expanded to names) ---
    const causesText = buildCausesSearchText(doc.causes)
    if (causesText) {
      if (causesText.includes(termLower)) {
        score += 10
      } else if (termLower.length >= 3) {
        const causeWords = causesText.split(/\s+/)
        for (const word of causeWords) {
          if (word.length >= 3 && levenshteinDistance(termLower, word) <= Math.floor(termLower.length / 3)) {
            score += 5
            break
          }
        }
      }
    }

    // --- Score TYPICAL SKILLS NEEDED (NGO) / skillsRequired (Project) as object arrays ---
    const objectSkillsText = buildObjectSkillsSearchText(doc.typicalSkillsNeeded || doc.skillsRequired)
    if (objectSkillsText) {
      if (objectSkillsText.includes(termLower)) {
        score += 10
      } else if (termLower.length >= 3) {
        const words = objectSkillsText.split(/\s+/)
        for (const word of words) {
          if (word.length >= 3 && levenshteinDistance(termLower, word) <= Math.floor(termLower.length / 3)) {
            score += 5
            break
          }
        }
      }
    }

    // --- Score LANGUAGES (JSON string) ---
    if (doc.languages) {
      const langText = (typeof doc.languages === "string" ? doc.languages : JSON.stringify(doc.languages || [])).toLowerCase()
      if (langText.includes(termLower)) score += 5
    }

    // --- Score INTERESTS (JSON string) ---
    if (doc.interests) {
      const interestText = (typeof doc.interests === "string" ? doc.interests : JSON.stringify(doc.interests || [])).toLowerCase()
      if (interestText.includes(termLower)) score += 3
    }

    // --- Score NUMERIC FIELDS (converted to string for matching) ---
    const numericFields = [
      { key: "freeHoursPerMonth", weight: 3 },
      { key: "hourlyRate", weight: 2 },
      { key: "discountedRate", weight: 2 },
      { key: "rating", weight: 2 },
      { key: "completedProjects", weight: 1 },
      { key: "hoursContributed", weight: 1 },
      { key: "activeProjects", weight: 1 },
      { key: "projectsPosted", weight: 1 },
      { key: "volunteersEngaged", weight: 1 },
    ]
    for (const nf of numericFields) {
      const val = numericToString(doc[nf.key])
      if (!val) continue
      if (val === termLower) {
        score += nf.weight * 3
      } else if (val.includes(termLower)) {
        score += nf.weight
      }
    }
  }

  // --- SYNONYM-AWARE SCORING ---
  // If the doc didn't match direct terms well, check if it matches expanded synonyms
  // Synonym matches score lower than direct matches but still rank the result
  if (score < 5) {
    const expandedTerms = expandWithSynonyms(searchTerms)
    const synonymOnly = expandedTerms.filter(t => !searchTerms.includes(t))

    // Build a combined text blob for matching
    const contentBlob = [
      doc.headline, doc.bio, doc.description, doc.mission, doc.experience,
      doc.workMode, doc.volunteerType,
      buildSkillsSearchText(doc.skills || doc.skillsRequired),
      buildCausesSearchText(doc.causes),
      buildObjectSkillsSearchText(doc.typicalSkillsNeeded || doc.skillsRequired),
    ].filter(Boolean).join(" ").toLowerCase()

    for (const syn of synonymOnly) {
      if (contentBlob.includes(syn)) {
        score += 3 // Synonym match = moderate boost
      }
    }
  }

  return score
}

/**
 * Determine which field was the best match (for highlighting)
 */
function findMatchedField(doc: any, searchTerms: string[]): string | undefined {
  const fieldNames = [
    "name", "title", "organizationName", "orgName", "headline",
    "bio", "description", "mission", "location", "city", "address",
    "contactPersonName", "contactEmail", "experience", "workMode",
    "volunteerType", "availability", "hoursPerWeek", "currency",
    "phone", "linkedIn", "portfolio", "website", "yearFounded",
    "teamSize", "registrationNumber", "timeCommitment", "duration",
    "projectType", "experienceLevel",
  ]
  for (const term of searchTerms) {
    const termLower = term.toLowerCase()
    for (const field of fieldNames) {
      const val = doc[field]
      if (val && typeof val === "string" && val.toLowerCase().includes(termLower)) {
        return field
      }
    }
    // Check skills (JSON string)
    const skillsText = buildSkillsSearchText(doc.skills || doc.skillsRequired)
    if (skillsText && skillsText.includes(termLower)) return "skills"
    // Check causes
    const causesText = buildCausesSearchText(doc.causes)
    if (causesText && causesText.includes(termLower)) return "causes"
    // Check typical skills needed (NGO object array)
    const typicalText = buildObjectSkillsSearchText(doc.typicalSkillsNeeded)
    if (typicalText && typicalText.includes(termLower)) return "typicalSkillsNeeded"
    // Check languages
    if (doc.languages) {
      const langText = (typeof doc.languages === "string" ? doc.languages : "").toLowerCase()
      if (langText.includes(termLower)) return "languages"
    }
    // Check interests
    if (doc.interests) {
      const intText = (typeof doc.interests === "string" ? doc.interests : "").toLowerCase()
      if (intText.includes(termLower)) return "interests"
    }
    // Check numeric fields
    const numFields = ["freeHoursPerMonth", "hourlyRate", "discountedRate", "rating", "completedProjects"]
    for (const f of numFields) {
      const v = numericToString(doc[f])
      if (v && v.includes(termLower)) return f
    }
  }

  // Fallback: check synonym-expanded terms (so we can report WHICH field matched via synonym)
  const expandedTerms = expandWithSynonyms(searchTerms)
  const synonymOnly = expandedTerms.filter(t => !searchTerms.includes(t))
  for (const syn of synonymOnly) {
    for (const field of fieldNames) {
      const val = doc[field]
      if (val && typeof val === "string" && val.toLowerCase().includes(syn)) {
        return field
      }
    }
    const skillsText = buildSkillsSearchText(doc.skills || doc.skillsRequired)
    if (skillsText && skillsText.includes(syn)) return "skills"
    const causesText = buildCausesSearchText(doc.causes)
    if (causesText && causesText.includes(syn)) return "causes"
    const typicalText = buildObjectSkillsSearchText(doc.typicalSkillsNeeded)
    if (typicalText && typicalText.includes(syn)) return "typicalSkillsNeeded"
  }

  return undefined
}

// ============================================
// RESULT MAPPERS
// ============================================

function mapUserToResult(user: any, searchTerms: string[]): SearchResult {
  const matchedField = findMatchedField(user, searchTerms)
  if (user.role === "volunteer") {
    let subtitle = user.headline || user.bio?.slice(0, 80)
    if (matchedField === "skills") {
      const skillNames = parseSkillDisplayNames(user.skills)
      subtitle = skillNames.join(", ") || subtitle
    } else if (matchedField === "causes") {
      const causeIds = parseCauses(user.causes)
      subtitle = causeIds.map(getCauseDisplayName).join(", ") || subtitle
    } else if (matchedField === "volunteerType") {
      subtitle = `Impact Agent Type: ${user.volunteerType}` + (user.headline ? ` · ${user.headline}` : "")
    } else if (matchedField === "hoursPerWeek") {
      subtitle = `${user.hoursPerWeek} hrs/week` + (user.headline ? ` · ${user.headline}` : "")
    } else if (matchedField === "freeHoursPerMonth" && (user.volunteerType === "both")) {
      subtitle = `${user.freeHoursPerMonth} free hrs/month` + (user.headline ? ` · ${user.headline}` : "")
    } else if (matchedField === "hourlyRate") {
      subtitle = `Rate: ${user.currency || "USD"} ${user.hourlyRate}/hr` + (user.headline ? ` · ${user.headline}` : "")
    } else if (matchedField === "workMode") {
      subtitle = `Work Mode: ${user.workMode}` + (user.headline ? ` · ${user.headline}` : "")
    } else if (matchedField === "languages") {
      subtitle = `Languages: ${user.languages}` + (user.headline ? ` · ${user.headline}` : "")
    }
    return {
      type: "volunteer",
      id: user._id.toString(),
      title: user.name || "Impact Agent",
      subtitle,
      location: user.location || user.city,
      skills: parseSkillDisplayNames(user.skills),
      score: user.score ?? computeRelevanceScore(user, searchTerms),
      avatar: user.image || user.avatar,
      matchedField,
    }
  }
  // NGO
  let subtitle = user.description?.slice(0, 80)
  if (matchedField === "causes") {
    const causeIds = parseCauses(user.causes)
    subtitle = causeIds.map(getCauseDisplayName).join(", ") || subtitle
  } else if (matchedField === "mission") {
    subtitle = user.mission?.slice(0, 80) || subtitle
  } else if (matchedField === "typicalSkillsNeeded") {
    const skillsText = buildObjectSkillsSearchText(user.typicalSkillsNeeded)
    subtitle = `Needs: ${skillsText.slice(0, 80)}` || subtitle
  } else if (matchedField === "yearFounded") {
    subtitle = `Founded: ${user.yearFounded}` + (user.description ? ` · ${user.description.slice(0, 60)}` : "")
  } else if (matchedField === "teamSize") {
    subtitle = `Team Size: ${user.teamSize}` + (user.description ? ` · ${user.description.slice(0, 60)}` : "")
  }
  return {
    type: "ngo",
    id: user._id.toString(),
    title: user.organizationName || user.orgName || user.name || "Organization",
    subtitle,
    location: user.location || user.city,
    score: user.score ?? computeRelevanceScore(user, searchTerms),
    avatar: user.logo || user.image,
    verified: user.isVerified,
    matchedField,
  }
}

function mapProjectToResult(project: any, searchTerms: string[]): SearchResult {
  let subtitle = project.workMode === "remote" ? "Remote" : project.location
  if (project.timeCommitment) subtitle += ` · ${project.timeCommitment}`
  if (project.duration) subtitle += ` · ${project.duration}`

  // Build skills display from object array
  let skills: string[] = []
  if (project.skillsRequired && Array.isArray(project.skillsRequired)) {
    skills = project.skillsRequired.slice(0, 5).map((s: any) => {
      if (typeof s === "string") return getSkillDisplayName(s)
      return getSkillDisplayName(s.subskillId || s.name || "")
    })
  } else {
    skills = parseSkillDisplayNames(project.skillsRequired)
  }

  return {
    type: "opportunity",
    id: project._id.toString(),
    title: project.title,
    subtitle,
    description: project.description?.slice(0, 100),
    location: project.workMode === "remote" ? "Remote" : project.location,
    skills,
    score: project.score ?? computeRelevanceScore(project, searchTerms),
    matchedField: findMatchedField(project, searchTerms),
  }
}

// ============================================
// PROJECTIONS
// ============================================

const USER_PROJECTION = {
  _id: 1, name: 1, role: 1, bio: 1, headline: 1,
  location: 1, city: 1, country: 1, skills: 1,
  image: 1, avatar: 1, organizationName: 1, orgName: 1,
  description: 1, mission: 1, address: 1,
  causes: 1, workMode: 1, volunteerType: 1,
  availability: 1, contactPersonName: 1, contactEmail: 1,
  isVerified: 1, logo: 1, privacy: 1,
  // Volunteer work/time fields
  experience: 1, hoursPerWeek: 1, freeHoursPerMonth: 1,
  hourlyRate: 1, discountedRate: 1, currency: 1,
  // Contact/links
  phone: 1, linkedIn: 1, portfolio: 1,
  // NGO-specific
  website: 1, yearFounded: 1, teamSize: 1,
  registrationNumber: 1, typicalSkillsNeeded: 1,
  // Stats
  rating: 1, completedProjects: 1, hoursContributed: 1,
  activeProjects: 1, projectsPosted: 1, volunteersEngaged: 1,
  // JSON string fields
  languages: 1, interests: 1,
}

const PROJECT_PROJECTION = {
  _id: 1, title: 1, description: 1, location: 1,
  skillsRequired: 1, workMode: 1, timeCommitment: 1,
  causes: 1, duration: 1, projectType: 1,
  experienceLevel: 1, ngoId: 1,
}

// ============================================
// SEARCH STRATEGIES
// ============================================

/**
 * Strategy 1: MongoDB $text search (fastest, uses text index)
 */
// helper: remove any projects that lack one of the provided skillIds
function filterProjectsBySkills(projects: any[], skillIds: string[]): any[] {
  if (!skillIds || skillIds.length === 0) return projects
  return projects.filter((proj) => {
    const skills = proj.skillsRequired || []
    return skills.some((s: any) =>
      skillIds.includes(s.subskillId) || skillIds.includes(s.categoryId)
    )
  })
}

async function textSearch(
  db: any,
  searchQuery: string,
  types: string[],
  limit: number,
  searchTerms: string[]
): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const privacyFilter = buildPrivacyFilter()

  if (types.includes("volunteer") || types.includes("ngo")) {
    const roleIn: string[] = []
    if (types.includes("volunteer")) roleIn.push("volunteer")
    if (types.includes("ngo")) roleIn.push("ngo")

    const users = await db.collection("user")
      .find(
        {
          $text: { $search: searchQuery },
          role: { $in: roleIn },
          isOnboarded: true,
          ...privacyFilter,
        },
        { projection: { score: { $meta: "textScore" }, ...USER_PROJECTION } }
      )
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .toArray()

    for (const user of users) {
      results.push(mapUserToResult(user, searchTerms))
    }
  }

  if (types.includes("opportunity")) {
    let projects = await db.collection("projects")
      .find(
        {
          $text: { $search: searchQuery },
          status: { $in: ["open", "active"] },
        },
        { projection: { score: { $meta: "textScore" }, ...PROJECT_PROJECTION } }
      )
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .toArray()

    // enforce skill requirement if searchTerms match any known skills
    const matchedSkillIds = findMatchingSkillIds(searchTerms)
    if (matchedSkillIds.length > 0) {
      projects = filterProjectsBySkills(projects, matchedSkillIds)
    }

    for (const project of projects) {
      results.push(mapProjectToResult(project, searchTerms))
    }
  }

  return results
}

/**
 * Build regex conditions for user search (all fields)
 */
function buildUserRegexConditions(searchTerms: string[], prefixOnly = false): any[] {
  const conditions: any[] = []

  // Expand terms with synonyms/related concepts for broader matching
  const expandedTerms = expandWithSynonyms(searchTerms)
  // Use original terms for direct field matching, expanded for skills/causes/work mode
  const allTerms = [...new Set([...searchTerms, ...expandedTerms])]

  for (const term of searchTerms) {
    const escaped = escapeRegex(term)
    const prefixRegex = new RegExp(`^${escaped}`, "i")
    const containsRegex = prefixOnly ? prefixRegex : new RegExp(escaped, "i")

    // Core identity fields (prefix match for names)
    conditions.push({ name: prefixRegex })
    conditions.push({ organizationName: prefixRegex })
    conditions.push({ orgName: prefixRegex })
    conditions.push({ contactPersonName: containsRegex })
    conditions.push({ contactEmail: containsRegex })

    // Content/description fields (contains match)
    conditions.push({ headline: containsRegex })
    conditions.push({ bio: containsRegex })
    conditions.push({ description: containsRegex })
    conditions.push({ mission: containsRegex })
    conditions.push({ experience: containsRegex })

    // Location fields
    conditions.push({ location: containsRegex })
    conditions.push({ city: containsRegex })
    conditions.push({ country: containsRegex })
    conditions.push({ address: containsRegex })

    // Work mode / volunteer type / availability
    conditions.push({ workMode: containsRegex })
    conditions.push({ volunteerType: containsRegex })
    conditions.push({ availability: containsRegex })

    // Hours / rates / currency (string fields)
    conditions.push({ hoursPerWeek: containsRegex })
    conditions.push({ currency: containsRegex })

    // Contact/links
    conditions.push({ phone: containsRegex })
    conditions.push({ linkedIn: containsRegex })
    conditions.push({ portfolio: containsRegex })
    conditions.push({ website: containsRegex })

    // NGO metadata
    conditions.push({ yearFounded: containsRegex })
    conditions.push({ teamSize: containsRegex })
    conditions.push({ registrationNumber: containsRegex })

    // Skills (JSON strings - search raw text)
    conditions.push({ skills: containsRegex })
    // Causes (JSON strings)
    conditions.push({ causes: containsRegex })
    // Languages & interests (JSON strings)
    conditions.push({ languages: containsRegex })
    conditions.push({ interests: containsRegex })

    // NGO typicalSkillsNeeded (array of objects - dot notation)
    conditions.push({ "typicalSkillsNeeded.subskillId": containsRegex })
    conditions.push({ "typicalSkillsNeeded.categoryId": containsRegex })
  }

  // Add expanded synonym terms for content + mode fields
  // (so searching "ad campaign" also matches "ppc", "google ads" etc. in bio/description)
  const synonymOnly = expandedTerms.filter(t => !searchTerms.includes(t))
  for (const syn of synonymOnly) {
    const synRegex = new RegExp(escapeRegex(syn), "i")
    // Only search expanded synonyms in content-heavy & mode fields — not in name/phone/etc.
    conditions.push({ headline: synRegex })
    conditions.push({ bio: synRegex })
    conditions.push({ description: synRegex })
    conditions.push({ mission: synRegex })
    conditions.push({ experience: synRegex })
    conditions.push({ skills: synRegex })
    conditions.push({ causes: synRegex })
    conditions.push({ workMode: synRegex })
    conditions.push({ volunteerType: synRegex })
    conditions.push({ "typicalSkillsNeeded.subskillId": synRegex })
    conditions.push({ "typicalSkillsNeeded.categoryId": synRegex })
  }

  // Add matched skill/cause IDs from human-readable terms
  const matchedSkillIds = findMatchingSkillIds(searchTerms)
  const matchedCauseIds = findMatchingCauseIds(searchTerms)

  for (const skillId of matchedSkillIds) {
    const skillRegex = new RegExp(escapeRegex(skillId), "i")
    conditions.push({ skills: skillRegex })
    conditions.push({ "typicalSkillsNeeded.subskillId": skillRegex })
  }
  for (const causeId of matchedCauseIds) {
    conditions.push({ causes: new RegExp(escapeRegex(causeId), "i") })
  }

  // Add numeric field matching for extracted numbers
  const extractedNums = extractNumbers(searchTerms)
  for (const num of extractedNums) {
    conditions.push({ freeHoursPerMonth: num })
    conditions.push({ hourlyRate: num })
    conditions.push({ discountedRate: num })
    conditions.push({ rating: num })
    conditions.push({ completedProjects: num })
    conditions.push({ hoursContributed: num })
    conditions.push({ activeProjects: num })
  }

  return conditions
}

/**
 * Build regex conditions for project search (all fields)
 */
function buildProjectRegexConditions(searchTerms: string[], prefixOnly = false): any[] {
  const conditions: any[] = []
  const expandedTerms = expandWithSynonyms(searchTerms)

  for (const term of searchTerms) {
    const escaped = escapeRegex(term)
    const prefixRegex = new RegExp(`^${escaped}`, "i")
    const containsRegex = prefixOnly ? prefixRegex : new RegExp(escaped, "i")

    conditions.push({ title: prefixRegex })
    conditions.push({ description: containsRegex })
    conditions.push({ location: containsRegex })
    conditions.push({ workMode: containsRegex })
    conditions.push({ timeCommitment: containsRegex })
    conditions.push({ duration: containsRegex })
    conditions.push({ projectType: containsRegex })
    conditions.push({ experienceLevel: containsRegex })

    // skillsRequired is array of objects - dot notation
    conditions.push({ "skillsRequired.subskillId": containsRegex })
    conditions.push({ "skillsRequired.categoryId": containsRegex })

    // causes is array of strings - regex matches any element
    conditions.push({ causes: containsRegex })
  }

  // Add expanded synonym terms for project content fields
  const synonymOnly = expandedTerms.filter(t => !searchTerms.includes(t))
  for (const syn of synonymOnly) {
    const synRegex = new RegExp(escapeRegex(syn), "i")
    conditions.push({ title: synRegex })
    conditions.push({ description: synRegex })
    conditions.push({ workMode: synRegex })
    conditions.push({ "skillsRequired.subskillId": synRegex })
    conditions.push({ "skillsRequired.categoryId": synRegex })
    conditions.push({ causes: synRegex })
  }

  // Add matched skill/cause IDs (already synonym-expanded inside these functions)
  const matchedSkillIds = findMatchingSkillIds(searchTerms)
  const matchedCauseIds = findMatchingCauseIds(searchTerms)

  for (const skillId of matchedSkillIds) {
    const skillRegex = new RegExp(escapeRegex(skillId), "i")
    conditions.push({ "skillsRequired.subskillId": skillRegex })
    conditions.push({ "skillsRequired.categoryId": skillRegex })
  }
  for (const causeId of matchedCauseIds) {
    conditions.push({ causes: new RegExp(escapeRegex(causeId), "i") })
  }

  return conditions
}

/**
 * Strategy 2: Prefix + contains regex search (works from 1 character)
 * This is what makes Amazon-like instant search possible
 */
async function prefixRegexSearch(
  db: any,
  searchQuery: string,
  types: string[],
  limit: number,
  searchTerms: string[]
): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const privacyFilter = buildPrivacyFilter()
  // If the raw query is really short, prefer prefix-only regexes to avoid
  // fuzzy/contains matches like "fim" → "financial". Adjust helpers
  // accordingly by passing a flag.
  const isShort = searchQuery.length <= 3
  const userConditions = buildUserRegexConditions(searchTerms, isShort)
  const projectConditions = buildProjectRegexConditions(searchTerms, isShort)

  if (types.includes("volunteer") || types.includes("ngo")) {
    const roleIn: string[] = []
    if (types.includes("volunteer")) roleIn.push("volunteer")
    if (types.includes("ngo")) roleIn.push("ngo")

    const users = await db.collection("user")
      .find({
        role: { $in: roleIn },
        isOnboarded: true,
        ...privacyFilter,
        $or: userConditions,
      })
      .project(USER_PROJECTION)
      .limit(limit)
      .toArray()

    for (const user of users) {
      user.score = computeRelevanceScore(user, searchTerms)
      results.push(mapUserToResult(user, searchTerms))
    }
  }

  if (types.includes("opportunity")) {
    let projects = await db.collection("projects")
      .find({
        status: { $in: ["open", "active"] },
        $or: projectConditions,
      })
      .project(PROJECT_PROJECTION)
      .limit(limit)
      .toArray()

    // filter by skill IDs if the query looks like a skill search
    const matchedSkillIds = findMatchingSkillIds(searchTerms)
    if (matchedSkillIds.length > 0) {
      projects = filterProjectsBySkills(projects, matchedSkillIds)
    }

    for (const project of projects) {
      project.score = computeRelevanceScore(project, searchTerms)
      results.push(mapProjectToResult(project, searchTerms))
    }
  }

  return results
}

/**
 * Build fuzzy regex conditions for user search
 */
function buildUserFuzzyConditions(searchTerms: string[]): any[] {
  const conditions: any[] = []
  const expandedTerms = expandWithSynonyms(searchTerms)
  const allTerms = [...new Set([...searchTerms, ...expandedTerms])]

  const looseRegex = searchTerms.map(term => {
    if (term.length < 2) return new RegExp(escapeRegex(term), "i")
    const chars = term.split("")
    const variants: string[] = []
    // Allow a wildcard character at each position
    for (let i = 0; i < chars.length; i++) {
      const variant = [...chars]
      variant[i] = "."
      variants.push(variant.join(""))
    }
    variants.push(escapeRegex(term))
    // Remove each char (deletion)
    for (let i = 0; i < chars.length; i++) {
      const variant = [...chars]
      variant.splice(i, 1)
      variants.push(variant.join(""))
    }
    return new RegExp(variants.join("|"), "i")
  })

  for (const regex of looseRegex) {
    // Core fields
    conditions.push({ name: regex })
    conditions.push({ organizationName: regex })
    conditions.push({ orgName: regex })
    conditions.push({ contactPersonName: regex })
    conditions.push({ contactEmail: regex })

    // Content fields
    conditions.push({ headline: regex })
    conditions.push({ title: regex })
    conditions.push({ bio: regex })
    conditions.push({ description: regex })
    conditions.push({ mission: regex })
    conditions.push({ experience: regex })

    // Location
    conditions.push({ location: regex })
    conditions.push({ city: regex })
    conditions.push({ address: regex })
    conditions.push({ country: regex })

    // Work prefs
    conditions.push({ workMode: regex })
    conditions.push({ volunteerType: regex })
    conditions.push({ availability: regex })
    conditions.push({ hoursPerWeek: regex })
    conditions.push({ currency: regex })

    // Skills/causes JSON strings
    conditions.push({ skills: regex })
    conditions.push({ causes: regex })
    conditions.push({ languages: regex })
    conditions.push({ interests: regex })

    // Links/meta
    conditions.push({ phone: regex })
    conditions.push({ linkedIn: regex })
    conditions.push({ portfolio: regex })
    conditions.push({ website: regex })
    conditions.push({ yearFounded: regex })
    conditions.push({ teamSize: regex })

    // NGO object skills
    conditions.push({ "typicalSkillsNeeded.subskillId": regex })
    conditions.push({ "typicalSkillsNeeded.categoryId": regex })
  }

  // Add exact regex conditions for expanded synonym terms (no fuzzy on synonyms — they're already expansions)
  const synonymOnly = expandedTerms.filter(t => !searchTerms.includes(t))
  for (const syn of synonymOnly) {
    const synRegex = new RegExp(escapeRegex(syn), "i")
    conditions.push({ headline: synRegex })
    conditions.push({ bio: synRegex })
    conditions.push({ description: synRegex })
    conditions.push({ mission: synRegex })
    conditions.push({ skills: synRegex })
    conditions.push({ causes: synRegex })
    conditions.push({ workMode: synRegex })
    conditions.push({ volunteerType: synRegex })
    conditions.push({ "typicalSkillsNeeded.subskillId": synRegex })
    conditions.push({ "typicalSkillsNeeded.categoryId": synRegex })
  }

  // Add fuzzy-matched skill/cause IDs
  const matchedSkillIds = findMatchingSkillIds(searchTerms)
  const matchedCauseIds = findMatchingCauseIds(searchTerms)
  for (const skillId of matchedSkillIds) {
    const r = new RegExp(escapeRegex(skillId), "i")
    conditions.push({ skills: r })
    conditions.push({ "typicalSkillsNeeded.subskillId": r })
  }
  for (const causeId of matchedCauseIds) {
    conditions.push({ causes: new RegExp(escapeRegex(causeId), "i") })
  }

  // Numeric matches
  const extractedNums = extractNumbers(searchTerms)
  for (const num of extractedNums) {
    conditions.push({ freeHoursPerMonth: num })
    conditions.push({ hourlyRate: num })
    conditions.push({ discountedRate: num })
    conditions.push({ rating: num })
    conditions.push({ completedProjects: num })
  }

  return conditions
}

/**
 * Build fuzzy regex conditions for project search
 */
function buildProjectFuzzyConditions(searchTerms: string[]): any[] {
  const conditions: any[] = []
  const expandedTerms = expandWithSynonyms(searchTerms)

  const looseRegex = searchTerms.map(term => {
    if (term.length < 2) return new RegExp(escapeRegex(term), "i")
    const chars = term.split("")
    const variants: string[] = []
    for (let i = 0; i < chars.length; i++) {
      const variant = [...chars]
      variant[i] = "."
      variants.push(variant.join(""))
    }
    variants.push(escapeRegex(term))
    for (let i = 0; i < chars.length; i++) {
      const variant = [...chars]
      variant.splice(i, 1)
      variants.push(variant.join(""))
    }
    return new RegExp(variants.join("|"), "i")
  })

  for (const regex of looseRegex) {
    conditions.push({ title: regex })
    conditions.push({ description: regex })
    conditions.push({ location: regex })
    conditions.push({ workMode: regex })
    conditions.push({ timeCommitment: regex })
    conditions.push({ duration: regex })
    conditions.push({ projectType: regex })
    conditions.push({ experienceLevel: regex })
    conditions.push({ "skillsRequired.subskillId": regex })
    conditions.push({ "skillsRequired.categoryId": regex })
    conditions.push({ causes: regex })
  }

  // Add synonym expansion conditions for project fields
  const synonymOnly = expandedTerms.filter(t => !searchTerms.includes(t))
  for (const syn of synonymOnly) {
    const synRegex = new RegExp(escapeRegex(syn), "i")
    conditions.push({ title: synRegex })
    conditions.push({ description: synRegex })
    conditions.push({ workMode: synRegex })
    conditions.push({ "skillsRequired.subskillId": synRegex })
    conditions.push({ "skillsRequired.categoryId": synRegex })
    conditions.push({ causes: synRegex })
  }

  // Matched skill/cause IDs
  const matchedSkillIds = findMatchingSkillIds(searchTerms)
  const matchedCauseIds = findMatchingCauseIds(searchTerms)
  for (const skillId of matchedSkillIds) {
    const r = new RegExp(escapeRegex(skillId), "i")
    conditions.push({ "skillsRequired.subskillId": r })
  }
  for (const causeId of matchedCauseIds) {
    conditions.push({ causes: new RegExp(escapeRegex(causeId), "i") })
  }

  return conditions
}

/**
 * Strategy 3: Fuzzy search with Levenshtein tolerance (catches typos)
 */
async function fuzzyFallbackSearch(
  db: any,
  searchQuery: string,
  types: string[],
  limit: number,
  searchTerms: string[]
): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const privacyFilter = buildPrivacyFilter()
  const userConditions = buildUserFuzzyConditions(searchTerms)
  const projectConditions = buildProjectFuzzyConditions(searchTerms)

  if (types.includes("volunteer") || types.includes("ngo")) {
    const roleIn: string[] = []
    if (types.includes("volunteer")) roleIn.push("volunteer")
    if (types.includes("ngo")) roleIn.push("ngo")

    const users = await db.collection("user")
      .find({
        role: { $in: roleIn },
        isOnboarded: true,
        ...privacyFilter,
        $or: userConditions,
      })
      .project(USER_PROJECTION)
      .limit(limit)
      .toArray()

    for (const user of users) {
      user.score = computeRelevanceScore(user, searchTerms) * 0.7
      results.push(mapUserToResult(user, searchTerms))
    }
  }

  if (types.includes("opportunity")) {
    let projects = await db.collection("projects")
      .find({
        status: { $in: ["open", "active"] },
        $or: projectConditions,
      })
      .project(PROJECT_PROJECTION)
      .limit(limit)
      .toArray()

    const matchedSkillIds = findMatchingSkillIds(searchTerms)
    if (matchedSkillIds.length > 0) {
      projects = filterProjectsBySkills(projects, matchedSkillIds)
    }

    for (const project of projects) {
      project.score = computeRelevanceScore(project, searchTerms) * 0.7
      results.push(mapProjectToResult(project, searchTerms))
    }
  }

  return results
}

// ============================================
// MAIN SEARCH FUNCTION (Multi-Strategy)
// ============================================

export async function unifiedSearch(params: UnifiedSearchParams): Promise<SearchResult[]> {
  const { query, types = ["volunteer", "ngo", "opportunity"], limit = 20 } = params

  const trimmed = query?.trim()
  if (!trimmed || trimmed.length < 1) return []

  await ensureSearchIndexes()

  await client.connect()
  const db = client.db(DB_NAME)

  const searchTerms = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
  const matchedSkillIds = findMatchingSkillIds(searchTerms)
  if (matchedSkillIds.length > 0) {
    console.log(`[Mongo Search] skill query detected: ${matchedSkillIds.join(",")}`)
  }

  // Expand with synonyms for the $text search query
  const expandedTerms = expandWithSynonyms(searchTerms)
  const expandedQuery = expandedTerms.slice(0, 30).join(" ") // Cap at 30 terms for $text
  const resultMap = new Map<string, SearchResult>()

  const addResults = (results: SearchResult[]) => {
    for (const result of results) {
      const key = `${result.type}-${result.id}`
      const existing = resultMap.get(key)
      if (!existing || result.score > existing.score) {
        resultMap.set(key, result)
      }
    }
  }

  try {
    // Strategy 1: $text search (fastest, uses index, needs 3+ chars)
    if (trimmed.length >= 3) {
      try {
        const textResults = await textSearch(db, expandedQuery, types, limit, searchTerms)
        addResults(textResults)
      } catch (error: any) {
        if (error.code !== 27 && !error.message?.includes("text index")) {
          console.error("[Search] Text search error:", error)
        }
      }
    }

    // Strategy 2: Prefix/regex search (works from 1 character)
    if (resultMap.size < limit) {
      const prefixResults = await prefixRegexSearch(db, trimmed, types, limit, searchTerms)
      addResults(prefixResults)
    }

    // Strategy 3: Fuzzy fallback (only if very few results)
    if (resultMap.size < Math.min(3, limit) && trimmed.length >= 3) {
      const fuzzyResults = await fuzzyFallbackSearch(db, trimmed, types, limit, searchTerms)
      addResults(fuzzyResults)
    }

    const allResults = Array.from(resultMap.values())
    allResults.sort((a, b) => b.score - a.score)

    return allResults.slice(0, limit)
  } catch (error: any) {
    console.error("[Search] Unrecoverable error:", error)
    try {
      return await prefixRegexSearch(db, trimmed, types, limit, searchTerms)
    } catch {
      return []
    }
  }
}

// ============================================
// SEARCH SUGGESTIONS (Autocomplete)
// ============================================

export async function getSearchSuggestions(params: SearchSuggestionsParams): Promise<SearchSuggestion[]> {
  const { query, types, limit = 8 } = params
  const trimmed = query?.trim()
  if (!trimmed || trimmed.length < 1) return []

  // Determine which collections to search
  const searchVolunteers = !types || types.includes("volunteer")
  const searchNgos = !types || types.includes("ngo")
  const searchOpportunities = !types || types.includes("opportunity")

  await client.connect()
  const db = client.db(DB_NAME)

  const escaped = escapeRegex(trimmed)
  const prefixRegex = new RegExp(`^${escaped}`, "i")
  const containsRegex = new RegExp(escaped, "i")
  const privacyFilter = buildPrivacyFilter()
  const suggestions: SearchSuggestion[] = []

  const matchedSkillIds = findMatchingSkillIds([trimmed.toLowerCase()])
  const matchedCauseIds = findMatchingCauseIds([trimmed.toLowerCase()])

  // Build comprehensive user search conditions
  const userOrConditions: any[] = [
    { name: prefixRegex },
    { organizationName: prefixRegex },
    { orgName: prefixRegex },
    { headline: containsRegex },
    { bio: containsRegex },
    { description: containsRegex },
    { mission: containsRegex },
    { experience: containsRegex },
    { location: containsRegex },
    { city: containsRegex },
    { country: containsRegex },
    { address: containsRegex },
    { workMode: containsRegex },
    { volunteerType: containsRegex },
    { availability: containsRegex },
    { hoursPerWeek: containsRegex },
    { skills: containsRegex },
    { causes: containsRegex },
    { languages: containsRegex },
    { website: containsRegex },
    { yearFounded: containsRegex },
    { teamSize: containsRegex },
    { "typicalSkillsNeeded.subskillId": containsRegex },
    { "typicalSkillsNeeded.categoryId": containsRegex },
  ]
  for (const skillId of matchedSkillIds) {
    const r = new RegExp(escapeRegex(skillId), "i")
    userOrConditions.push({ skills: r })
    userOrConditions.push({ "typicalSkillsNeeded.subskillId": r })
  }
  for (const causeId of matchedCauseIds) {
    userOrConditions.push({ causes: new RegExp(escapeRegex(causeId), "i") })
  }

  // Numeric matching for suggestions
  const nums = extractNumbers([trimmed.toLowerCase()])
  for (const num of nums) {
    userOrConditions.push({ freeHoursPerMonth: num })
    userOrConditions.push({ hourlyRate: num })
    userOrConditions.push({ rating: num })
  }

  // Only search users if we need volunteers or NGOs
  const users = (searchVolunteers || searchNgos)
    ? await db.collection("user")
      .find({
        isOnboarded: true,
        ...privacyFilter,
        // If only one user type needed, filter by role
        ...(searchVolunteers && !searchNgos ? { role: "volunteer" } : {}),
        ...(!searchVolunteers && searchNgos ? { role: "ngo" } : {}),
        $or: userOrConditions,
      })
      .project({
        _id: 1, name: 1, role: 1, organizationName: 1, orgName: 1,
        headline: 1, skills: 1, causes: 1, location: 1, city: 1,
        volunteerType: 1, workMode: 1, hoursPerWeek: 1,
        freeHoursPerMonth: 1, hourlyRate: 1, bio: 1, description: 1,
      })
      .limit(limit)
      .toArray()
    : []

  for (const user of users) {
    const isNgo = user.role === "ngo"
    let subtitle = user.headline || user.bio?.slice(0, 60) || (isNgo ? "Organization" : "Impact Agent")
    if (isNgo) subtitle = user.description?.slice(0, 60) || "Organization"

    // If a skill matched, show it
    const skillsText = buildSkillsSearchText(user.skills)
    if (skillsText && skillsText.includes(trimmed.toLowerCase())) {
      const matchedDisplayNames = parseSkillDisplayNames(user.skills)
        .filter(name => name.toLowerCase().includes(trimmed.toLowerCase()))
      if (matchedDisplayNames.length > 0) subtitle = matchedDisplayNames.join(", ")
    }
    // If a cause matched, show it
    const causesText = buildCausesSearchText(user.causes)
    if (causesText && causesText.includes(trimmed.toLowerCase())) {
      const causeIds = parseCauses(user.causes)
      const matchedCauses = causeIds
        .map(getCauseDisplayName)
        .filter(name => name.toLowerCase().includes(trimmed.toLowerCase()))
      if (matchedCauses.length > 0) subtitle = matchedCauses.join(", ")
    }
    // Show work details if relevant
    if (user.volunteerType && trimmed.toLowerCase().includes("free") && user.volunteerType === "free") {
      subtitle = `Free impact agent (Pro Bono)`
    } else if (user.volunteerType === "both" && trimmed.toLowerCase().includes("free")) {
      subtitle = `Open to Both · ${user.freeHoursPerMonth || 0} free hrs/month`
    }
    if (user.workMode && ["remote", "onsite", "hybrid"].includes(trimmed.toLowerCase())) {
      subtitle = `${user.workMode} · ${subtitle}`
    }

    suggestions.push({
      text: isNgo ? (user.organizationName || user.orgName || user.name) : user.name,
      type: isNgo ? "ngo" : "volunteer",
      id: user._id.toString(),
      subtitle,
    })
  }

  // Add skill-name suggestions (relevant to volunteers and opportunities)
  if (suggestions.length < limit && (searchVolunteers || searchOpportunities)) {
    for (const entry of ALL_SKILL_ENTRIES) {
      if (suggestions.length >= limit) break
      if (entry.subskillName.toLowerCase().includes(trimmed.toLowerCase()) ||
          entry.categoryName.toLowerCase().includes(trimmed.toLowerCase())) {
        if (!suggestions.some(s => s.text === entry.subskillName)) {
          suggestions.push({
            text: entry.subskillName,
            type: searchOpportunities ? "opportunity" : "volunteer",
            id: `skill:${entry.subskillId}`,
            subtitle: entry.categoryName,
          })
        }
      }
    }
  }

  // Add cause suggestions (relevant to NGOs and opportunities)
  if (suggestions.length < limit && (searchNgos || searchOpportunities)) {
    for (const cause of CAUSE_LIST) {
      if (suggestions.length >= limit) break
      const searchable = `${cause.name} ${cause.id.replace(/-/g, " ")}`.toLowerCase()
      if (searchable.includes(trimmed.toLowerCase())) {
        if (!suggestions.some(s => s.text === cause.name)) {
          suggestions.push({
            text: cause.name,
            type: searchOpportunities ? "opportunity" : "ngo",
            id: `cause:${cause.id}`,
            subtitle: "Cause Area",
          })
        }
      }
    }
  }

  // Get project suggestions (only if opportunities type is requested)
  if (!searchOpportunities) return suggestions.slice(0, limit)

  const projectOrConditions: any[] = [
    { title: prefixRegex },
    { title: containsRegex },
    { description: containsRegex },
    { location: containsRegex },
    { workMode: containsRegex },
    { timeCommitment: containsRegex },
    { duration: containsRegex },
    { projectType: containsRegex },
    { experienceLevel: containsRegex },
    { "skillsRequired.subskillId": containsRegex },
    { "skillsRequired.categoryId": containsRegex },
    { causes: containsRegex },
  ]
  for (const skillId of matchedSkillIds) {
    projectOrConditions.push({ "skillsRequired.subskillId": new RegExp(escapeRegex(skillId), "i") })
  }
  for (const causeId of matchedCauseIds) {
    projectOrConditions.push({ causes: new RegExp(escapeRegex(causeId), "i") })
  }

  let projects = await db.collection("projects")
    .find({
      status: { $in: ["open", "active"] },
      $or: projectOrConditions,
    })
    .project({ _id: 1, title: 1, location: 1, workMode: 1, timeCommitment: 1, duration: 1 })
    .limit(Math.max(2, limit - suggestions.length))
    .toArray()

  // apply post-filter for skill-based queries
  if (matchedSkillIds.length > 0) {
    projects = filterProjectsBySkills(projects, matchedSkillIds)
  }

  for (const project of projects) {
    let subtitle = project.workMode === "remote" ? "Remote" : project.location
    if (project.timeCommitment) subtitle += ` · ${project.timeCommitment}`
    suggestions.push({
      text: project.title,
      type: "opportunity",
      id: project._id.toString(),
      subtitle,
    })
  }

  return suggestions.slice(0, limit)
}
