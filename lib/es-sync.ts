// ============================================
// Elasticsearch Sync Engine
// ============================================
// Syncs data from MongoDB to Elasticsearch:
// 1. Bulk sync — full re-index of all collections
// 2. Incremental sync — only changed documents (via updatedAt)
// 3. Change streams — real-time sync for instant updates
//
// Data is denormalized for search (skill IDs → skill names, etc.)
// and a semantic_content field is populated for NL search.
// ============================================

import mongoClient from "./db"
import esClient, { ES_INDEXES } from "./elasticsearch"
import { SKILL_MAP, CAUSE_MAP } from "./es-indexes"
import type { BulkOperationContainer, BulkUpdateAction } from "@elastic/elasticsearch/lib/api/types"

const DB_NAME = "justbecause"

// The actual MongoDB collection where all users (volunteers, NGOs, admins) live
const USER_COLLECTION = "user"

// ============================================
// HELPER: Safely parse JSON string → array
// Handles fields stored as JSON strings in MongoDB
// e.g. '["education","healthcare"]' → ["education","healthcare"]
// ============================================

function safeParseArray(val: any): any[] {
  if (Array.isArray(val)) return val
  if (typeof val === "string" && val.startsWith("[")) {
    try { return JSON.parse(val) } catch { return [] }
  }
  return []
}

function safeParseCoordinates(val: any): { lat: number; lng: number } | null {
  if (!val) return null
  if (typeof val === "string") {
    try { val = JSON.parse(val) } catch { return null }
  }
  if (val && typeof val.lat === "number" && typeof val.lng === "number") return val
  return null
}

// ============================================
// HELPER: Denormalize skill IDs → names
// ============================================

function denormalizeSkills(skills: any): {
  skillIds: string[]
  skillNames: string[]
  skillCategories: string[]
} {
  const parsed = safeParseArray(skills)
  if (!parsed.length) return { skillIds: [], skillNames: [], skillCategories: [] }

  const ids: string[] = []
  const names: string[] = []
  const categories = new Set<string>()

  for (const skill of parsed) {
    const subskillId = skill.subskillId || skill.id || (typeof skill === "string" ? skill : null)
    if (!subskillId) continue
    ids.push(subskillId)
    const mapped = SKILL_MAP[subskillId]
    if (mapped) {
      names.push(mapped.subskillName)
      categories.add(mapped.categoryName)
    }
  }

  return { skillIds: ids, skillNames: names, skillCategories: [...categories] }
}

function denormalizeCauses(causes: any): {
  causeIds: string[]
  causeNames: string[]
} {
  const parsed = safeParseArray(causes)
  if (!parsed.length) return { causeIds: [], causeNames: [] }
  const ids = parsed.filter(Boolean)
  const names = ids.map(id => CAUSE_MAP[id] || id).filter(Boolean)
  return { causeIds: ids, causeNames: names }
}

// ============================================
// TRANSFORM FUNCTIONS: MongoDB doc → ES doc
// ============================================

function transformVolunteer(doc: any): Record<string, any> | null {
  if (!doc || doc.isBanned) return null
  if (doc.privacy?.showInSearch === false) return null

  const { skillIds, skillNames, skillCategories } = denormalizeSkills(doc.skills)
  const { causeIds, causeNames } = denormalizeCauses(doc.causes)

  // Build semantic content — a rich natural language blob for semantic_text
  // This drives NL search: NGOs search like "web developer expert 10 years",
  // "free volunteer for education", "cheap designer", "marketing remote Mumbai"
  const parts: string[] = []
  if (doc.name) parts.push(`${doc.name} is a volunteer`)
  if (doc.headline) parts.push(doc.headline)
  if (doc.bio) parts.push(doc.bio)

  // Skills + levels — map categorical levels to experience-year language
  const parsedSkills = safeParseArray(doc.skills)
  const LEVEL_DESCRIPTORS: Record<string, string> = {
    expert: "6+ years experience, senior-level specialist",
    advanced: "3-6 years experience, experienced professional",
    intermediate: "1-3 years experience, working knowledge",
    beginner: "entry-level, learning, basic knowledge",
  }
  const skillsByLevel: Record<string, string[]> = { expert: [], advanced: [], intermediate: [], beginner: [] }
  for (const s of parsedSkills) {
    const name = s?.subskillId ? (SKILL_MAP[s.subskillId]?.subskillName || s.subskillId) : null
    if (name && s.level && skillsByLevel[s.level]) skillsByLevel[s.level].push(name)
  }
  if (skillsByLevel.expert.length > 0) parts.push(`Expert-level (${LEVEL_DESCRIPTORS.expert}) in ${skillsByLevel.expert.join(", ")}`)
  if (skillsByLevel.advanced.length > 0) parts.push(`Advanced (${LEVEL_DESCRIPTORS.advanced}) in ${skillsByLevel.advanced.join(", ")}`)
  if (skillsByLevel.intermediate.length > 0) parts.push(`Intermediate (${LEVEL_DESCRIPTORS.intermediate}) in ${skillsByLevel.intermediate.join(", ")}`)
  if (skillsByLevel.beginner.length > 0) parts.push(`Beginner (${LEVEL_DESCRIPTORS.beginner}) in ${skillsByLevel.beginner.join(", ")}`)
  if (skillNames.length > 0) parts.push(`Skills: ${skillNames.join(", ")}`)
  if (skillCategories.length > 0) parts.push(`Expertise in ${skillCategories.join(", ")}`)

  // Compute overall experience level — highest level among all skills
  const LEVEL_RANK: Record<string, number> = { expert: 4, advanced: 3, intermediate: 2, beginner: 1 }
  let bestLevel = ""
  let bestRank = 0
  for (const s of parsedSkills) {
    const rank = LEVEL_RANK[s?.level] || 0
    if (rank > bestRank) { bestRank = rank; bestLevel = s.level }
  }
  const computedExperienceLevel = bestLevel || ""

  // Causes
  if (causeNames.length > 0) parts.push(`Passionate about ${causeNames.join(", ")}`)

  // Location
  if (doc.location || doc.city) parts.push(`Located in ${doc.city || doc.location || ""}, ${doc.country || ""}`.trim())

  // Pricing / cost — critical for NGO queries like "free volunteer", "cheap", "affordable", "budget"
  if (doc.volunteerType === "free") {
    parts.push("Available for free, pro-bono, no cost, voluntary work. Budget-friendly, affordable, zero cost")
  } else if (doc.volunteerType === "paid") {
    const rate = doc.hourlyRate || 0
    const curr = doc.currency || "INR"
    parts.push(`Paid volunteer, charges ${rate} ${curr} per hour`)
    if (rate > 0 && rate <= 300) parts.push("Affordable rate, budget-friendly, low cost")
    else if (rate > 300 && rate <= 800) parts.push("Mid-range rate, reasonable pricing")
    else if (rate > 800) parts.push("Premium rate, high-end professional")
    if (doc.discountedRate && doc.discountedRate < rate) {
      parts.push(`Offers discounted rate of ${doc.discountedRate} ${curr} per hour for NGOs. Low bono available`)
    }
  } else if (doc.volunteerType === "both") {
    const rate = doc.hourlyRate || 0
    const curr = doc.currency || "INR"
    parts.push("Available for both free pro-bono and paid work. Flexible pricing, affordable")
    if (rate > 0) parts.push(`Paid rate: ${rate} ${curr} per hour`)
    if (doc.freeHoursPerMonth) parts.push(`Offers ${doc.freeHoursPerMonth} free hours per month for NGOs`)
    if (doc.discountedRate) parts.push(`Discounted NGO rate: ${doc.discountedRate} ${curr}/hr`)
  }

  // Work mode + availability — for "remote", "onsite", "weekends", "flexible"
  if (doc.workMode === "remote") parts.push("Works remotely, available from anywhere, work from home")
  else if (doc.workMode === "onsite") parts.push("Available for on-site, in-person, office work")
  else if (doc.workMode === "hybrid") parts.push("Available for both remote and on-site hybrid work")

  if (doc.availability === "weekdays") parts.push("Available on weekdays, Monday to Friday")
  else if (doc.availability === "weekends") parts.push("Available on weekends, Saturday and Sunday")
  else if (doc.availability === "evenings") parts.push("Available in evenings after work hours")
  else if (doc.availability === "flexible") parts.push("Flexible schedule, available anytime")

  if (doc.hoursPerWeek) parts.push(`Can contribute ${doc.hoursPerWeek} hours per week`)

  // Experience indicators — for "experienced", "senior", queries
  const totalCompleted = doc.completedProjects || 0
  const totalHours = doc.hoursContributed || 0
  if (totalCompleted >= 10) parts.push(`Highly experienced volunteer, completed ${totalCompleted} projects. Senior, veteran`)
  else if (totalCompleted >= 5) parts.push(`Experienced volunteer, completed ${totalCompleted} projects`)
  else if (totalCompleted >= 1) parts.push(`Has completed ${totalCompleted} project${totalCompleted > 1 ? "s" : ""}`)
  if (totalHours >= 500) parts.push(`Major contributor with ${totalHours} hours volunteered`)
  else if (totalHours > 0) parts.push(`Has contributed ${totalHours} hours`)
  if (doc.rating && doc.rating >= 4) parts.push(`Highly rated ${doc.rating.toFixed(1)}/5 stars, top volunteer`)
  else if (doc.rating && doc.rating > 0) parts.push(`Rated ${doc.rating.toFixed(1)} out of 5`)
  if (doc.isVerified) parts.push("Verified volunteer, identity confirmed, trusted")

  // Languages
  if (doc.languages) {
    const langs = Array.isArray(doc.languages) ? doc.languages : typeof doc.languages === "string" ? [doc.languages] : []
    if (langs.length > 0) parts.push(`Speaks ${langs.join(", ")}`)
  }

  // Build suggest inputs for autocomplete
  const suggestInputs: string[] = []
  if (doc.name) suggestInputs.push(doc.name)
  if (skillNames.length > 0) suggestInputs.push(...skillNames.slice(0, 5))
  if (doc.city) suggestInputs.push(doc.city)

  return {
    mongoId: doc._id.toString(),
    userId: doc.userId,
    name: doc.name || "",
    avatar: doc.avatar || doc.image || "",
    headline: doc.headline || "",
    bio: doc.bio || "",
    location: doc.location || "",
    city: doc.city || "",
    country: doc.country || "",
    coordinates: (() => { const c = safeParseCoordinates(doc.coordinates); return c ? { lat: c.lat, lon: c.lng } : undefined; })(),
    skillIds,
    skillNames,
    skillCategories,
    causeIds,
    causeNames,
    volunteerType: doc.volunteerType || "free",
    workMode: doc.workMode || "remote",
    experienceLevel: computedExperienceLevel,
    availability: doc.availability || "flexible",
    hoursPerWeek: doc.hoursPerWeek ? Number(doc.hoursPerWeek) : undefined,
    hourlyRate: doc.hourlyRate || 0,
    currency: doc.currency || "INR",
    rating: doc.rating || 0,
    totalRatings: doc.totalRatings || 0,
    completedProjects: doc.completedProjects || 0,
    isVerified: doc.isVerified || false,
    isActive: doc.isActive !== false,
    subscriptionPlan: doc.subscriptionPlan || "free",
    languages: safeParseArray(doc.languages).join(", ") || "",
    interests: safeParseArray(doc.interests).join(", ") || "",
    linkedinUrl: doc.linkedinUrl || "",
    portfolioUrl: doc.portfolioUrl || "",
    semantic_content: parts.join(". ") || undefined,
    suggest: suggestInputs.length > 0 ? { input: suggestInputs, weight: Math.max(1, Math.round((doc.rating || 0) * 2 + (doc.completedProjects || 0))) } : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    syncedAt: new Date(),
  }
}

function transformNgo(doc: any): Record<string, any> | null {
  if (!doc || doc.isBanned) return null

  const { skillIds, skillNames, skillCategories } = denormalizeSkills(doc.typicalSkillsNeeded)
  const { causeIds, causeNames } = denormalizeCauses(doc.causes)

  const parts: string[] = []
  const orgName = doc.orgName || doc.organizationName || ""
  if (orgName) parts.push(`${orgName} is a non-profit organization, NGO`)
  if (doc.description) parts.push(doc.description)
  if (doc.mission) parts.push(`Mission: ${doc.mission}`)
  if (causeNames.length > 0) parts.push(`Works in ${causeNames.join(", ")}`)
  if (skillNames.length > 0) parts.push(`Looking for volunteers with skills in ${skillNames.join(", ")}`)
  if (doc.city || doc.address) parts.push(`Located in ${doc.city || ""}, ${doc.country || ""}`.trim())

  // Work mode — volunteers search "remote NGO", "onsite NGO near me"
  if (doc.acceptRemoteVolunteers && doc.acceptOnsiteVolunteers) parts.push("Accepts both remote and on-site volunteers, hybrid friendly")
  else if (doc.acceptRemoteVolunteers) parts.push("Accepts remote volunteers, work from anywhere")
  else if (doc.acceptOnsiteVolunteers) parts.push("On-site volunteers only, in-person work")

  // Scale / credibility — volunteers search "established NGO", "large organization"
  if (doc.yearFounded) {
    const age = new Date().getFullYear() - parseInt(doc.yearFounded)
    if (age > 10) parts.push(`Founded in ${doc.yearFounded}, established organization with ${age}+ years of experience`)
    else if (age > 3) parts.push(`Founded in ${doc.yearFounded}, ${age} years of operation`)
    else parts.push(`Founded in ${doc.yearFounded}, newer organization`)
  }
  if (doc.teamSize) parts.push(`Team size: ${doc.teamSize}`)
  const engaged = doc.volunteersEngaged || 0
  if (engaged >= 50) parts.push(`Large volunteer community with ${engaged} volunteers engaged`)
  else if (engaged >= 10) parts.push(`Active organization with ${engaged} volunteers engaged`)
  else if (engaged > 0) parts.push(`${engaged} volunteers engaged`)
  const posted = doc.projectsPosted || 0
  if (posted >= 10) parts.push(`Prolific with ${posted} projects posted, many opportunities available`)
  else if (posted > 0) parts.push(`Has posted ${posted} project${posted > 1 ? "s" : ""}`)
  if (doc.isVerified) parts.push("Verified organization, identity confirmed, trusted NGO")
  if (doc.website) parts.push(`Website: ${doc.website}`)

  const suggestInputs: string[] = []
  if (orgName) suggestInputs.push(orgName)
  if (causeNames.length > 0) suggestInputs.push(...causeNames.slice(0, 3))
  if (doc.city) suggestInputs.push(doc.city)

  return {
    mongoId: doc._id.toString(),
    userId: doc.userId,
    orgName,
    organizationName: doc.organizationName || orgName,
    contactPersonName: doc.contactPersonName || "",
    description: doc.description || "",
    mission: doc.mission || "",
    address: doc.address || "",
    city: doc.city || "",
    country: doc.country || "",
    coordinates: (() => { const c = safeParseCoordinates(doc.coordinates); return c ? { lat: c.lat, lon: c.lng } : undefined; })(),
    website: doc.website || "",
    skillIds,
    skillNames,
    skillCategories,
    causeIds,
    causeNames,
    acceptRemoteVolunteers: doc.acceptRemoteVolunteers || false,
    acceptOnsiteVolunteers: doc.acceptOnsiteVolunteers || false,
    yearFounded: doc.yearFounded || "",
    teamSize: doc.teamSize || "",
    projectsPosted: doc.projectsPosted || 0,
    projectsCompleted: doc.projectsCompleted || 0,
    volunteersEngaged: doc.volunteersEngaged || 0,
    isVerified: doc.isVerified || false,
    isActive: doc.isActive !== false,
    logo: doc.logo || "",
    semantic_content: parts.join(". ") || undefined,
    suggest: suggestInputs.length > 0 ? { input: suggestInputs, weight: Math.max(1, (doc.projectsPosted || 0) + (doc.volunteersEngaged || 0)) } : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    syncedAt: new Date(),
  }
}

function transformProject(doc: any, ngoNameMap: Map<string, string>): Record<string, any> | null {
  if (!doc) return null
  if (!["open", "active"].includes(doc.status)) return null

  const { skillIds, skillNames, skillCategories } = denormalizeSkills(doc.skillsRequired)
  const { causeIds, causeNames } = denormalizeCauses(doc.causes)
  // Always use string keys — ObjectId objects won't match string-keyed Map entries
  const ngoName = ngoNameMap.get(doc.ngoProfileId?.toString()) || ngoNameMap.get(doc.ngoId?.toString()) || ""

  const parts: string[] = []
  if (doc.title) parts.push(doc.title)
  if (doc.description) parts.push(doc.description)
  if (ngoName) parts.push(`Posted by ${ngoName}`)
  if (skillNames.length > 0) parts.push(`Requires skills in ${skillNames.join(", ")}`)
  if (causeNames.length > 0) parts.push(`Related to ${causeNames.join(", ")}`)

  // Work mode — volunteers search "remote project", "onsite opportunity", "work from home"
  if (doc.workMode === "remote") parts.push("Remote opportunity, work from anywhere, work from home")
  else if (doc.workMode === "onsite") parts.push(`On-site opportunity, in-person work${doc.location ? ` in ${doc.location}` : ""}`)
  else if (doc.workMode === "hybrid") parts.push("Hybrid opportunity, both remote and on-site")
  if (doc.location && doc.workMode !== "onsite") parts.push(`Location: ${doc.location}`)

  // Experience level — volunteers search "beginner friendly", "entry level", "for experts"
  if (doc.experienceLevel === "beginner") parts.push("Beginner friendly, entry level, no experience required, newcomers welcome, internship level")
  else if (doc.experienceLevel === "intermediate") parts.push("Intermediate level, some experience needed, 1-3 years")
  else if (doc.experienceLevel === "expert") parts.push("Expert level, highly experienced volunteers needed, senior, 6+ years")

  // Duration/commitment — volunteers search "short term", "quick project", "long term commitment"
  if (doc.timeCommitment) parts.push(`Time commitment: ${doc.timeCommitment}`)
  if (doc.projectType === "short-term") parts.push("Short-term project, quick task, temporary")
  else if (doc.projectType === "long-term") parts.push("Long-term project, ongoing commitment")
  else if (doc.projectType === "consultation") parts.push("Consultation, advisory role, one-time advice")
  else if (doc.projectType === "ongoing") parts.push("Ongoing project, continuous work, permanent volunteer role")
  if (doc.duration) parts.push(`Duration: ${doc.duration}`)

  // Deadline urgency — volunteers search "urgent", "starting soon"
  if (doc.deadline) {
    const daysLeft = Math.ceil((new Date(doc.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysLeft > 0 && daysLeft <= 7) parts.push("Urgent, deadline soon, apply quickly")
    else if (daysLeft > 7 && daysLeft <= 30) parts.push("Apply soon, deadline within a month")
  }
  if (doc.startDate) {
    const daysToStart = Math.ceil((new Date(doc.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysToStart >= 0 && daysToStart <= 7) parts.push("Starting soon, immediate start")
  }

  // Competition — "less applicants", "easy to get"
  const appCount = doc.applicantsCount || 0
  if (appCount === 0) parts.push("No applicants yet, great chance to get selected, new opportunity")
  else if (appCount < 5) parts.push(`Only ${appCount} applicant${appCount > 1 ? "s" : ""}, low competition`)
  else parts.push(`${appCount} applicants`)

  const suggestInputs: string[] = []
  if (doc.title) suggestInputs.push(doc.title)
  if (skillNames.length > 0) suggestInputs.push(...skillNames.slice(0, 3))

  return {
    mongoId: doc._id.toString(),
    ngoId: doc.ngoId,
    ngoProfileId: doc.ngoProfileId,
    ngoName,
    title: doc.title || "",
    description: doc.description || "",
    skillIds,
    skillNames,
    skillCategories,
    causeIds,
    causeNames,
    experienceLevel: doc.experienceLevel || "",
    timeCommitment: doc.timeCommitment || "",
    duration: doc.duration || "",
    projectType: doc.projectType || "",
    workMode: doc.workMode || "remote",
    location: doc.location || "",
    status: doc.status,
    startDate: doc.startDate,
    deadline: doc.deadline,
    applicantsCount: doc.applicantsCount || 0,
    viewsCount: doc.viewsCount || 0,
    isActive: true, // We already filtered for status "open"/"active" above
    semantic_content: parts.join(". ") || undefined,
    suggest: suggestInputs.length > 0 ? { input: suggestInputs, weight: Math.max(1, (doc.viewsCount || 0) + (doc.applicantsCount || 0) * 5) } : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    syncedAt: new Date(),
  }
}

function transformBlogPost(doc: any): Record<string, any> | null {
  if (!doc || doc.status !== "published") return null

  // Strip HTML/markdown for search
  const plainContent = (doc.content || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_`~\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000) // Limit content length for ES

  const parts: string[] = []
  if (doc.title) parts.push(doc.title)
  if (doc.excerpt) parts.push(doc.excerpt)
  if (plainContent) parts.push(plainContent.slice(0, 2000))
  if (doc.tags?.length > 0) parts.push(`Topics: ${doc.tags.join(", ")}`)
  if (doc.authorName) parts.push(`Written by ${doc.authorName}`)

  return {
    mongoId: doc._id.toString(),
    slug: doc.slug,
    title: doc.title || "",
    excerpt: doc.excerpt || "",
    content: plainContent,
    authorId: doc.authorId || "",
    authorName: doc.authorName || "",
    tags: Array.isArray(doc.tags) ? doc.tags.join(", ") : "",
    category: doc.category || "",
    status: doc.status,
    publishedAt: doc.publishedAt,
    viewCount: doc.viewCount || 0,
    semantic_content: parts.join(". ") || undefined,
    suggest: doc.title ? { input: [doc.title, ...(doc.tags || []).slice(0, 3)], weight: doc.viewCount || 1 } : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    syncedAt: new Date(),
  }
}

// ============================================
// STATIC PAGES DATA
// ============================================

const STATIC_PAGES = [
  {
    slug: "/about",
    title: "About JustBeCause Network",
    description: "Learn about our mission to connect skilled professionals with NGOs",
    content: "JustBeCause Network is a skills-based volunteering platform that connects talented professionals with NGOs and nonprofits. Our mission is to bridge the skill gap in the social sector by making it easy for skilled volunteers to find meaningful opportunities and for organizations to access the talent they need.",
    section: "info",
  },
  {
    slug: "/for-volunteers",
    title: "For Volunteers — Impact Agents",
    description: "How to volunteer your skills and make a real impact",
    content: "Join as a volunteer impact agent and use your professional skills to help NGOs grow. Whether you are a marketer, designer, developer, writer, or finance professional, your skills can make a real difference. Browse opportunities, apply with one click, and track your social impact.",
    section: "info",
  },
  {
    slug: "/for-ngos",
    title: "For NGOs — Find Skilled Volunteers",
    description: "Post opportunities and find skilled professionals to help your cause",
    content: "Post volunteer opportunities and find verified skilled professionals. Whether you need a website redesign, grant writer, social media manager, or event planner, JustBeCause helps you connect with the right talent. Post projects, review applications, and manage your volunteer team.",
    section: "info",
  },
  {
    slug: "/pricing",
    title: "Pricing Plans",
    description: "Free and Pro plans for volunteers and NGOs",
    content: "JustBeCause offers free and pro subscription plans. The free plan includes basic features for posting opportunities and applying. Pro plans offer unlimited applications, advanced matching, priority support, and analytics dashboards.",
    section: "info",
  },
  {
    slug: "/contact",
    title: "Contact Us",
    description: "Get in touch with the JustBeCause team",
    content: "Contact JustBeCause Network for support, partnerships, press inquiries, or general questions. We are here to help you make the most of skills-based volunteering.",
    section: "info",
  },
  {
    slug: "/privacy",
    title: "Privacy Policy",
    description: "How we protect your data and privacy",
    content: "JustBeCause Network privacy policy. We take your privacy seriously and protect your personal data in accordance with applicable laws.",
    section: "legal",
  },
  {
    slug: "/terms",
    title: "Terms of Service",
    description: "Terms and conditions for using JustBeCause Network",
    content: "Terms of service for JustBeCause Network platform. By using our platform you agree to these terms.",
    section: "legal",
  },
]

// ============================================
// BULK SYNC — Full re-index from MongoDB
// ============================================

export async function bulkSyncToElasticsearch(options?: {
  collections?: ("volunteers" | "ngos" | "projects" | "blog" | "pages")[]
  since?: Date // Only sync documents updated after this date
}): Promise<{ synced: Record<string, number>; errors: string[] }> {
  const db = mongoClient.db(DB_NAME)
  const collections = options?.collections || ["volunteers", "ngos", "projects", "blog", "pages"]
  const since = options?.since
  const synced: Record<string, number> = {}
  const errors: string[] = []

  // Build updatedAt filter for incremental sync
  const timeFilter = since ? { updatedAt: { $gte: since } } : {}

  // ---- VOLUNTEERS ----
  if (collections.includes("volunteers")) {
    try {
      const volunteers = await db.collection(USER_COLLECTION).find({
        ...timeFilter,
        role: "volunteer",
        isBanned: { $ne: true },
        banned: { $ne: true },
      }).toArray()

      console.log(`[ES Sync] Found ${volunteers.length} volunteer users in MongoDB`)

      const operations: Array<BulkOperationContainer | BulkUpdateAction | Record<string, any>> = []
      let count = 0

      for (const doc of volunteers) {
        const esDoc = transformVolunteer(doc)
        if (!esDoc) continue
        operations.push(
          { index: { _index: ES_INDEXES.VOLUNTEERS, _id: esDoc.mongoId } },
          esDoc,
        )
        count++
      }

      if (operations.length > 0) {
        const result = await esClient.bulk({ operations, refresh: true })
        if (result.errors) {
          const errItems = result.items.filter(item => item.index?.error)
          errors.push(...errItems.map(item => `Volunteer ${item.index?._id}: ${item.index?.error?.reason}`))
        }
      }
      synced.volunteers = count
      console.log(`[ES Sync] Synced ${count} volunteers`)
    } catch (err: any) {
      errors.push(`Volunteers sync failed: ${err.message}`)
      console.error("[ES Sync] Volunteers error:", err)
    }
  }

  // ---- NGOS ----
  if (collections.includes("ngos")) {
    try {
      const ngos = await db.collection(USER_COLLECTION).find({
        ...timeFilter,
        role: "ngo",
        isBanned: { $ne: true },
        banned: { $ne: true },
      }).toArray()

      console.log(`[ES Sync] Found ${ngos.length} NGO users in MongoDB`)

      const operations: Array<BulkOperationContainer | BulkUpdateAction | Record<string, any>> = []
      let count = 0

      for (const doc of ngos) {
        const esDoc = transformNgo(doc)
        if (!esDoc) continue
        operations.push(
          { index: { _index: ES_INDEXES.NGOS, _id: esDoc.mongoId } },
          esDoc,
        )
        count++
      }

      if (operations.length > 0) {
        const result = await esClient.bulk({ operations, refresh: true })
        if (result.errors) {
          const errItems = result.items.filter(item => item.index?.error)
          errors.push(...errItems.map(item => `NGO ${item.index?._id}: ${item.index?.error?.reason}`))
        }
      }
      synced.ngos = count
      console.log(`[ES Sync] Synced ${count} NGOs`)
    } catch (err: any) {
      errors.push(`NGOs sync failed: ${err.message}`)
      console.error("[ES Sync] NGOs error:", err)
    }
  }

  // ---- PROJECTS ----
  if (collections.includes("projects")) {
    try {
      // Get NGO name map for denormalization — NGOs are in the user collection
      const ngoUsers = await db.collection(USER_COLLECTION).find(
        { role: "ngo" },
        { projection: { _id: 1, orgName: 1, organizationName: 1, name: 1 } }
      ).toArray()
      const ngoNameMap = new Map<string, string>()
      for (const ngo of ngoUsers) {
        ngoNameMap.set(ngo._id.toString(), ngo.orgName || ngo.organizationName || ngo.name || "")
      }

      const projects = await db.collection("projects").find({
        ...timeFilter,
        status: { $in: ["open", "active"] },
      }).toArray()

      const operations: Array<BulkOperationContainer | BulkUpdateAction | Record<string, any>> = []
      let count = 0

      for (const doc of projects) {
        const esDoc = transformProject(doc, ngoNameMap)
        if (!esDoc) continue
        operations.push(
          { index: { _index: ES_INDEXES.PROJECTS, _id: esDoc.mongoId } },
          esDoc,
        )
        count++
      }

      if (operations.length > 0) {
        const result = await esClient.bulk({ operations, refresh: true })
        if (result.errors) {
          const errItems = result.items.filter(item => item.index?.error)
          errors.push(...errItems.map(item => `Project ${item.index?._id}: ${item.index?.error?.reason}`))
        }
      }
      synced.projects = count
      console.log(`[ES Sync] Synced ${count} projects`)
    } catch (err: any) {
      errors.push(`Projects sync failed: ${err.message}`)
      console.error("[ES Sync] Projects error:", err)
    }
  }

  // ---- BLOG POSTS ----
  if (collections.includes("blog")) {
    try {
      const posts = await db.collection("blogPosts").find({
        ...timeFilter,
        status: "published",
      }).toArray()

      const operations: Array<BulkOperationContainer | BulkUpdateAction | Record<string, any>> = []
      let count = 0

      for (const doc of posts) {
        const esDoc = transformBlogPost(doc)
        if (!esDoc) continue
        operations.push(
          { index: { _index: ES_INDEXES.BLOG_POSTS, _id: esDoc.mongoId } },
          esDoc,
        )
        count++
      }

      if (operations.length > 0) {
        const result = await esClient.bulk({ operations, refresh: true })
        if (result.errors) {
          const errItems = result.items.filter(item => item.index?.error)
          errors.push(...errItems.map(item => `Blog ${item.index?._id}: ${item.index?.error?.reason}`))
        }
      }
      synced.blog = count
      console.log(`[ES Sync] Synced ${count} blog posts`)
    } catch (err: any) {
      errors.push(`Blog sync failed: ${err.message}`)
      console.error("[ES Sync] Blog error:", err)
    }
  }

  // ---- STATIC PAGES ----
  if (collections.includes("pages")) {
    try {
      const operations: Array<BulkOperationContainer | BulkUpdateAction | Record<string, any>> = []

      for (const page of STATIC_PAGES) {
        operations.push(
          { index: { _index: ES_INDEXES.PAGES, _id: page.slug } },
          {
            ...page,
            semantic_content: `${page.title}. ${page.description}. ${page.content}`,
            suggest: { input: [page.title], weight: 1 },
            updatedAt: new Date(),
            syncedAt: new Date(),
          },
        )
      }

      if (operations.length > 0) {
        const result = await esClient.bulk({ operations, refresh: true })
        if (result.errors) {
          const errItems = result.items.filter(item => item.index?.error)
          errors.push(...errItems.map(item => `Page ${item.index?._id}: ${item.index?.error?.reason}`))
        }
      }
      synced.pages = STATIC_PAGES.length
      console.log(`[ES Sync] Synced ${STATIC_PAGES.length} static pages`)
    } catch (err: any) {
      errors.push(`Pages sync failed: ${err.message}`)
      console.error("[ES Sync] Pages error:", err)
    }
  }

  return { synced, errors }
}

// ============================================
// SINGLE DOCUMENT SYNC (for real-time updates)
// ============================================

export async function syncSingleDocument(
  collection: "volunteer" | "ngo" | "projects" | "blogPosts",
  documentId: string,
  operation: "upsert" | "delete" = "upsert"
): Promise<void> {
  const db = mongoClient.db(DB_NAME)

  try {
    if (operation === "delete") {
      const indexMap: Record<string, string> = {
        volunteer: ES_INDEXES.VOLUNTEERS,
        ngo: ES_INDEXES.NGOS,
        projects: ES_INDEXES.PROJECTS,
        blogPosts: ES_INDEXES.BLOG_POSTS,
      }
      await esClient.delete({
        index: indexMap[collection],
        id: documentId,
      }).catch(() => { /* ignore if not found */ })
      return
    }

    // Fetch from MongoDB
    const { ObjectId } = await import("mongodb")
    let objId: any
    try {
      objId = new ObjectId(documentId)
    } catch {
      objId = documentId
    }

    // Volunteers and NGOs live in the 'user' collection
    const isUserCollection = collection === "volunteer" || collection === "ngo"
    const mongoCollection = isUserCollection ? USER_COLLECTION : collection
    const doc = await db.collection(mongoCollection).findOne({ _id: objId })

    if (!doc) {
      // Document deleted from Mongo — remove from ES
      const indexMap: Record<string, string> = {
        volunteer: ES_INDEXES.VOLUNTEERS,
        ngo: ES_INDEXES.NGOS,
        projects: ES_INDEXES.PROJECTS,
        blogPosts: ES_INDEXES.BLOG_POSTS,
      }
      await esClient.delete({ index: indexMap[collection], id: documentId }).catch(() => {})
      return
    }

    let esDoc: Record<string, any> | null = null
    let indexName = ""

    switch (collection) {
      case "volunteer":
        esDoc = transformVolunteer(doc)
        indexName = ES_INDEXES.VOLUNTEERS
        break
      case "ngo":
        esDoc = transformNgo(doc)
        indexName = ES_INDEXES.NGOS
        break
      case "projects": {
        // Fetch NGO name from user collection
        const ngoNameMap = new Map<string, string>()
        const ngoRef = doc.ngoProfileId || doc.ngoId
        if (ngoRef) {
          let ngoObjId: any
          try { ngoObjId = new ObjectId(ngoRef.toString()) } catch { ngoObjId = ngoRef }
          const ngoUser = await db.collection(USER_COLLECTION).findOne(
            { _id: ngoObjId },
            { projection: { orgName: 1, organizationName: 1, name: 1 } }
          ).catch(() => null)
          if (ngoUser) {
            const ngoNameVal = ngoUser.orgName || ngoUser.organizationName || ngoUser.name || ""
            // Set BOTH possible key formats so transformProject.get() always finds it
            if (doc.ngoProfileId) ngoNameMap.set(doc.ngoProfileId.toString(), ngoNameVal)
            if (doc.ngoId) ngoNameMap.set(doc.ngoId.toString(), ngoNameVal)
          }
        }
        esDoc = transformProject(doc, ngoNameMap)
        indexName = ES_INDEXES.PROJECTS
        break
      }
      case "blogPosts":
        esDoc = transformBlogPost(doc)
        indexName = ES_INDEXES.BLOG_POSTS
        break
    }

    if (esDoc && indexName) {
      await esClient.index({
        index: indexName,
        id: documentId,
        document: esDoc,
        refresh: true,
      })
    } else if (indexName) {
      // Doc was filtered out (banned, not published, etc.) — remove from ES
      await esClient.delete({ index: indexName, id: documentId }).catch(() => {})
    }
  } catch (error: any) {
    console.error(`[ES Sync] Failed to sync ${collection}/${documentId}:`, error?.message)
  }
}

// ============================================
// MONGODB CHANGE STREAMS — Real-time sync
// ============================================

let changeStreamActive = false

export function startChangeStreams(): void {
  if (changeStreamActive) {
    console.log("[ES Change Streams] Already active")
    return
  }

  const db = mongoClient.db(DB_NAME)
  changeStreamActive = true
  console.log("[ES Change Streams] Starting real-time sync...")

  // Watch the user collection for volunteer/NGO changes
  try {
    const userChangeStream = db.collection(USER_COLLECTION).watch(
      [{ $match: { operationType: { $in: ["insert", "update", "replace", "delete"] } } }],
      { fullDocument: "updateLookup" }
    )

    userChangeStream.on("change", async (event) => {
      try {
        const documentId = (event as any).documentKey?._id?.toString()
        if (!documentId) return

        if (event.operationType === "delete") {
          // We don't know the role of deleted doc, try removing from both
          await syncSingleDocument("volunteer", documentId, "delete")
          await syncSingleDocument("ngo", documentId, "delete")
        } else {
          const fullDoc = (event as any).fullDocument
          const role = fullDoc?.role
          if (role === "volunteer") {
            await syncSingleDocument("volunteer", documentId, "upsert")
          } else if (role === "ngo") {
            await syncSingleDocument("ngo", documentId, "upsert")
          }
        }
      } catch (err: any) {
        console.error("[ES Change Stream] Error processing user change:", err?.message)
      }
    })

    userChangeStream.on("error", (err) => {
      console.error("[ES Change Stream] user stream error:", err)
    })

    console.log("[ES Change Streams] Watching user collection (volunteers & NGOs)")
  } catch (err: any) {
    console.error("[ES Change Streams] Failed to watch user collection:", err?.message)
  }

  // Watch projects and blog posts separately
  const otherCollections = [
    { name: "projects", esCollection: "projects" as const },
    { name: "blogPosts", esCollection: "blogPosts" as const },
  ]

  for (const { name, esCollection } of otherCollections) {
    try {
      const changeStream = db.collection(name).watch(
        [{ $match: { operationType: { $in: ["insert", "update", "replace", "delete"] } } }],
        { fullDocument: "updateLookup" }
      )

      changeStream.on("change", async (event) => {
        try {
          const documentId = (event as any).documentKey?._id?.toString()
          if (!documentId) return

          if (event.operationType === "delete") {
            await syncSingleDocument(esCollection, documentId, "delete")
          } else {
            await syncSingleDocument(esCollection, documentId, "upsert")
          }
        } catch (err: any) {
          console.error(`[ES Change Stream] Error processing ${name} change:`, err?.message)
        }
      })

      changeStream.on("error", (err) => {
        console.error(`[ES Change Stream] ${name} stream error:`, err)
      })

      console.log(`[ES Change Streams] Watching ${name}`)
    } catch (err: any) {
      console.error(`[ES Change Streams] Failed to watch ${name}:`, err?.message)
    }
  }
}

// ============================================
// CLEANUP: Remove stale documents from ES
// ============================================

export async function cleanupStaleDocuments(): Promise<number> {
  let removedCount = 0
  const db = mongoClient.db(DB_NAME)

  try {
    // Check volunteers
    const esVolunteers = await esClient.search({
      index: ES_INDEXES.VOLUNTEERS,
      size: 10000,
      _source: ["mongoId"],
    })
    for (const hit of esVolunteers.hits.hits) {
      const mongoId = (hit._source as any)?.mongoId
      if (mongoId) {
        const { ObjectId } = await import("mongodb")
        const exists = await db.collection(USER_COLLECTION).findOne(
          { _id: new ObjectId(mongoId), role: "volunteer" },
          { projection: { _id: 1 } }
        ).catch(() => null)
        if (!exists) {
          await esClient.delete({ index: ES_INDEXES.VOLUNTEERS, id: hit._id! }).catch(() => {})
          removedCount++
        }
      }
    }

    console.log(`[ES Cleanup] Removed ${removedCount} stale documents`)
  } catch (err: any) {
    console.error("[ES Cleanup] Error:", err?.message)
  }

  return removedCount
}
