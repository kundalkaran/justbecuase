"use server"

// ============================================
// Server Actions for JustBecause Network
// ============================================

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "./auth"
import {
  volunteerProfilesDb,
  ngoProfilesDb,
  projectsDb,
  applicationsDb,
  profileUnlocksDb,
  transactionsDb,
  notificationsDb,
  adminSettingsDb,
  subscriptionPlansDb,
  conversationsDb,
  messagesDb,
  banRecordsDb,
  teamMembersDb,
  followsDb,
  reviewsDb,
  endorsementsDb,
  badgesDb,
  userBadgesDb,
  referralsDb,
  blogPostsDb,
  getDb,
  userIdQuery,
  userIdBatchQuery,
} from "./database"
import { getUserInfo, getUsersInfo } from "./user-utils"
import { trackEvent } from "./analytics"
import {
  matchVolunteersToProject,
  matchOpportunitiesToVolunteer,
  getRecommendedVolunteers,
  getRecommendedOpportunities,
} from "./matching"
import { getOrCreateChannel, generateStreamToken, getStreamServerClient } from "./stream"
import type {
  VolunteerProfile,
  NGOProfile,
  Project,
  Application,
  VolunteerProfileView,
  ApiResponse,
  AdminSettings,
  BanRecord,
  TeamMember,
  Review,
  Endorsement,
  BlogPost,
} from "./types"

// ============================================
// SERIALIZATION HELPERS
// ============================================
// MongoDB returns objects with ObjectId and Date that can't be passed to client components
// These helpers convert them to plain JSON-serializable objects

function serializeDocument<T>(doc: T | null): T | null {
  if (!doc) return null
  return JSON.parse(JSON.stringify(doc))
}

function serializeDocuments<T>(docs: T[]): T[] {
  return JSON.parse(JSON.stringify(docs))
}

// Helper to check if error is a Next.js redirect that should not be caught
function isRedirectError(error: unknown): boolean {
  return (error as any)?.digest?.startsWith("NEXT_REDIRECT")
}

// ============================================
// AUTH HELPERS
// ============================================

export async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  return session?.user || null
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/auth/signin")
  }
  return user
}

export async function requireRole(roles: string[]) {
  const user = await requireAuth()
  if (!roles.includes(user.role as string)) {
    redirect("/")
  }
  return user
}

// Secure role selection - only allows volunteer or ngo roles (not admin)
// This prevents users from self-assigning admin role
export async function selectRole(role: "volunteer" | "ngo"): Promise<ApiResponse<boolean>> {
  try {
    const user = await getCurrentUser()
    
    // If no user session, return error (don't redirect - let client handle it)
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }
    
    // Security: Only allow volunteer or ngo roles, never admin
    if (role !== "volunteer" && role !== "ngo") {
      return { success: false, error: "Invalid role" }
    }
    
    // Don't allow role change if user already has a valid role (volunteer/ngo) AND is onboarded
    // Allow role change if user has "user" (default from admin plugin) or no role
    const currentRole = user.role as string | undefined
    const hasValidRole = currentRole === "volunteer" || currentRole === "ngo" || currentRole === "admin"
    
    if (hasValidRole && user.isOnboarded) {
      return { success: false, error: "Cannot change role after onboarding" }
    }
    
    // Prevent changing away from admin role
    if (currentRole === "admin") {
      return { success: false, error: "Admin users cannot change their role" }
    }
    
    // Update role in the database (Better Auth stores _id as ObjectId)
    const db = await getDb()
    const usersCollection = db.collection("user")
    
    let result = await usersCollection.updateOne(
      userIdQuery(user.id),
      { $set: { role: role, updatedAt: new Date() } }
    )
    
    // If not found, try by email as fallback
    if (result.matchedCount === 0 && user.email) {
      result = await usersCollection.updateOne(
        { email: user.email },
        { $set: { role: role, updatedAt: new Date() } }
      )
    }
    
    // Check if document was found (matchedCount) - modifiedCount may be 0 if same role
    if (result.matchedCount === 0) {
      console.error("User not found in database:", { userId: user.id, email: user.email })
      return { success: false, error: "User not found" }
    }
    
    revalidatePath("/")
    return { success: true, data: true }
  } catch (error) {
    console.error("Error selecting role:", error)
    return { success: false, error: "An error occurred" }
  }
}

// Mark user as onboarded - called after profile is saved
export async function completeOnboarding(): Promise<ApiResponse<boolean>> {
  try {
    const user = await requireAuth()
    
    const db = await getDb()
    const usersCollection = db.collection("user")
    
    // Update using userIdQuery (Better Auth stores _id as ObjectId)
    let result = await usersCollection.updateOne(
      userIdQuery(user.id),
      { $set: { isOnboarded: true, updatedAt: new Date() } }
    )
    
    // If not found, try by email as fallback
    if (result.matchedCount === 0 && user.email) {
      result = await usersCollection.updateOne(
        { email: user.email },
        { $set: { isOnboarded: true, updatedAt: new Date() } }
      )
    }
    
    if (result.matchedCount === 0) {
      console.error("User not found in database:", { userId: user.id, email: user.email })
      return { success: false, error: "User not found" }
    }

    // Complete referral if this user was referred
    try {
      const referral = await referralsDb.findByReferredUserId(user.id)
      if (referral && referral.status === "signed_up") {
        await referralsDb.updateStatus(referral.referralCode, "completed")
        // Notify the referrer that their referral completed onboarding
        await notificationsDb.create({
          userId: referral.referrerId,
          type: "referral_completed",
          title: "Referral Completed!",
          message: `Someone you referred has completed their onboarding! Keep sharing to earn more rewards.`,
          referenceId: referral.referralCode,
          referenceType: "referral",
          link: "/volunteer/referrals",
          isRead: false,
          createdAt: new Date(),
        })
      }
    } catch (refErr) {
      console.error("Failed to complete referral:", refErr)
    }
    
    revalidatePath("/")
    trackEvent("user", "onboarding_complete", { userId: user.id })
    return { success: true, data: true }
  } catch (error) {
    console.error("Error completing onboarding:", error)
    return { success: false, error: "An error occurred" }
  }
}

// ============================================
// VOLUNTEER PROFILE ACTIONS
// ============================================

export async function saveVolunteerOnboarding(data: {
  profile: {
    phone: string
    location: string
    bio: string
    linkedinUrl?: string
    portfolioUrl?: string
    coordinates?: { lat: number; lng: number } | null
  }
  skills: { categoryId: string; subskillId: string; level: string }[]
  causes: string[]
  workPreferences: {
    volunteerType: string
    freeHoursPerMonth?: number
    workMode: string
    hoursPerWeek: string
    availability: string
    hourlyRate?: number
    discountedRate?: number
    currency?: string
  }
}): Promise<ApiResponse<string>> {
  try {
    const user = await requireAuth()

    // Check if profile already exists
    const existing = await volunteerProfilesDb.findByUserId(user.id)
    
    const profileData: Omit<VolunteerProfile, "_id"> = {
      // Copy display name and avatar from auth user for easier display elsewhere
      name: (user as any).name || "",
      avatar: (user as any).image || undefined,
      userId: user.id,
      phone: data.profile.phone,
      location: data.profile.location,
      city: data.profile.location.split(",")[0]?.trim() || "",
      country: data.profile.location.split(",").pop()?.trim() || "India",
      bio: data.profile.bio,
      linkedinUrl: data.profile.linkedinUrl,
      portfolioUrl: data.profile.portfolioUrl,
      // Store exact coordinates if available
      coordinates: data.profile.coordinates || undefined,
      skills: data.skills.map((s) => ({
        categoryId: s.categoryId,
        subskillId: s.subskillId,
        level: s.level as "beginner" | "intermediate" | "expert",
      })),
      causes: data.causes,
      languages: [],
      interests: [],
      volunteerType: data.workPreferences.volunteerType as "free" | "paid" | "both",
      freeHoursPerMonth: data.workPreferences.volunteerType === "both" ? data.workPreferences.freeHoursPerMonth : undefined,
      hourlyRate: (data.workPreferences.volunteerType === "paid" || data.workPreferences.volunteerType === "both") ? data.workPreferences.hourlyRate : undefined,
      discountedRate: (data.workPreferences.volunteerType === "paid" || data.workPreferences.volunteerType === "both") ? data.workPreferences.discountedRate : undefined,
      currency: (data.workPreferences.volunteerType === "paid" || data.workPreferences.volunteerType === "both") ? (data.workPreferences.currency || "USD") : undefined,
      workMode: data.workPreferences.workMode as "remote", //| "onsite" | "hybrid",
      hoursPerWeek: data.workPreferences.hoursPerWeek,
      availability: data.workPreferences.availability as "weekdays" | "weekends" | "evenings" | "flexible",
      completedProjects: 0,
      hoursContributed: 0,
      rating: 0,
      totalRatings: 0,
      // Subscription defaults
      subscriptionPlan: "free",
      monthlyApplicationsUsed: 0,
      subscriptionResetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      isVerified: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    if (existing) {
      await volunteerProfilesDb.update(user.id, profileData)
    } else {
      await volunteerProfilesDb.create(profileData)
    }

    // Update user's onboarded status via Better Auth
    // This would be done through Better Auth's user update

    revalidatePath("/volunteer/dashboard")
    trackEvent("user", "signup", { userId: user.id, metadata: { role: "volunteer", skillCount: data.skills?.length || 0 } })
    trackEvent("user", "profile_complete", { userId: user.id, metadata: { role: "volunteer" } })
    return { success: true, data: "Profile saved successfully" }
  } catch (error) {
    console.error("Error saving volunteer onboarding:", error)
    return { success: false, error: "Failed to save profile" }
  }
}

export async function getVolunteerProfile(userId?: string): Promise<VolunteerProfile | null> {
  const targetUserId = userId || (await getCurrentUser())?.id
  if (!targetUserId) return null
  const profile = await volunteerProfilesDb.findByUserId(targetUserId)
  return serializeDocument(profile)
}

// Get volunteer subscription status with limits
export async function getVolunteerSubscriptionStatus(): Promise<{
  plan: "free" | "pro"
  applicationsUsed: number
  applicationsLimit: number
  canApply: boolean
  expiryDate?: Date
} | null> {
  const user = await getCurrentUser()
  if (!user || user.role !== "volunteer") return null
  
  const profile = await volunteerProfilesDb.findByUserId(user.id)
  if (!profile) return null

  const plan = profile.subscriptionPlan || "free"
  const applicationsUsed = profile.monthlyApplicationsUsed || 0
  const FREE_LIMIT = 3
  const applicationsLimit = plan === "pro" ? 999999 : FREE_LIMIT
  
  // Check if reset needed
  const now = new Date()
  const resetDate = profile.subscriptionResetDate ? new Date(profile.subscriptionResetDate) : null
  
  let currentUsed = applicationsUsed
  if (resetDate && now >= resetDate) {
    currentUsed = 0
  }

  return {
    plan,
    applicationsUsed: currentUsed,
    applicationsLimit,
    canApply: plan === "pro" || currentUsed < FREE_LIMIT,
    expiryDate: profile.subscriptionExpiry,
  }
}

// Get NGO subscription status
export async function getNGOSubscriptionStatus(): Promise<{
  plan: "free" | "pro"
  canViewFreeVolunteers: boolean
  expiryDate?: Date
} | null> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ngo") return null
  
  const profile = await ngoProfilesDb.findByUserId(user.id)
  if (!profile) return null

  const plan = profile.subscriptionPlan || "free"

  return {
    plan,
    canViewFreeVolunteers: plan === "pro",
    expiryDate: profile.subscriptionExpiry,
  }
}

// Allowed fields for volunteer profile updates - filters out sensitive fields
const ALLOWED_VOLUNTEER_UPDATE_FIELDS = [
  "name", "avatar", "phone", "location", "city", "country", "bio", "headline", "linkedinUrl", "portfolioUrl",
  "resumeUrl", "skills", "causes", "volunteerType", "freeHoursPerMonth", "hourlyRate", "discountedRate", "currency",
  "workMode", "hoursPerWeek", "availability", "languages", "interests"
] as const

export async function updateVolunteerProfile(
  updates: Partial<VolunteerProfile>
): Promise<ApiResponse<boolean>> {
  try {
    const user = await requireAuth()
    
    // Filter to only allowed fields - prevent modification of userId, isVerified, rating, etc.
    const filteredUpdates: Partial<VolunteerProfile> = {}
    for (const key of ALLOWED_VOLUNTEER_UPDATE_FIELDS) {
      if (key in updates) {
        (filteredUpdates as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[key]
      }
    }
    
    // Sanitize fields based on volunteerType
    if (filteredUpdates.volunteerType === "free") {
      filteredUpdates.hourlyRate = undefined
      filteredUpdates.discountedRate = undefined
      filteredUpdates.freeHoursPerMonth = undefined
      filteredUpdates.currency = undefined
    } else if (filteredUpdates.volunteerType === "paid") {
      filteredUpdates.freeHoursPerMonth = undefined
    }

    // Validate pricing data (IA-013 / IA-014)
    if (filteredUpdates.volunteerType) {
      const { validatePricingData } = await import("./validation")
      const pricingValidation = validatePricingData({
        volunteerType: filteredUpdates.volunteerType,
        hourlyRate: filteredUpdates.hourlyRate,
        discountedRate: filteredUpdates.discountedRate,
        freeHoursPerMonth: filteredUpdates.freeHoursPerMonth,
      })
      if (!pricingValidation.valid) {
        return { success: false, error: pricingValidation.errors.join(". ") }
      }
    }
    
    if (Object.keys(filteredUpdates).length === 0) {
      return { success: false, error: "No valid fields to update" }
    }
    
    // Auto-sync name/avatar to auth table (single source of truth)
    const syncData: { name?: string; image?: string } = {}
    if (filteredUpdates.name) syncData.name = filteredUpdates.name
    if (filteredUpdates.avatar) syncData.image = filteredUpdates.avatar
    
    if (Object.keys(syncData).length > 0) {
      const { syncUserDataToProfile } = await import("./user-utils")
      await syncUserDataToProfile(user.id, syncData)
    }
    
    const result = await volunteerProfilesDb.update(user.id, filteredUpdates)
    revalidatePath("/volunteer/profile")
    // Real-time ES sync — never block the profile save
    try {
      const { syncSingleDocument } = await import("@/lib/es-sync")
      await syncSingleDocument("volunteer", user.id)
    } catch (syncErr) {
      console.error("[updateVolunteerProfile] ES sync failed (non-blocking):", syncErr)
    }
    return { success: true, data: result }
  } catch (error: any) {
    // Re-throw Next.js internal errors (redirect, notFound, etc.)
    if (error?.digest?.startsWith?.("NEXT_")) {
      throw error
    }
    console.error("[Volunteer Save] Error:", error?.message || error, error?.stack)
    return { success: false, error: error?.message || "Failed to update profile" }
  }
}

// ============================================
// NGO PROFILE ACTIONS
// ============================================

export async function saveNGOOnboarding(data: {
  orgDetails: {
    orgName: string
    registrationNumber?: string
    website?: string
    phone: string
    address: string
    city: string
    country: string
    description: string
    mission: string
    yearFounded?: string
    teamSize?: string
    coordinates?: { lat: number; lng: number } | null
  }
  causes: string[]
  requiredSkills: { categoryId: string; subskillId: string; priority: string }[]
  verificationDocuments?: { name: string; url: string; type: string }[]
}): Promise<ApiResponse<string>> {
  try {
    const user = await requireAuth()

    const existing = await ngoProfilesDb.findByUserId(user.id)

    const profileData: Omit<NGOProfile, "_id"> = {
      // Save contact person name and contact email from auth user by default
      contactPersonName: (user as any).name || "",
      contactEmail: user.email || undefined,
      userId: user.id,
      orgName: data.orgDetails.orgName,
      registrationNumber: data.orgDetails.registrationNumber,
      website: data.orgDetails.website,
      phone: data.orgDetails.phone,
      address: data.orgDetails.address,
      city: data.orgDetails.city,
      country: data.orgDetails.country,
      // Store exact coordinates if available
      coordinates: data.orgDetails.coordinates || undefined,
      description: data.orgDetails.description,
      mission: data.orgDetails.mission,
      yearFounded: data.orgDetails.yearFounded,
      teamSize: data.orgDetails.teamSize,
      causes: data.causes,
      typicalSkillsNeeded: data.requiredSkills.map((s) => ({
        categoryId: s.categoryId,
        subskillId: s.subskillId,
        priority: s.priority as "must-have" | "nice-to-have",
      })),
      // Save verification documents if provided
      verificationDocuments: data.verificationDocuments || [],
      acceptRemoteVolunteers: true,
      acceptOnsiteVolunteers: true,
      projectsPosted: 0,
      projectsCompleted: 0,
      volunteersEngaged: 0,
      isVerified: false,
      isActive: true,
      // Subscription defaults (new simplified system)
      subscriptionPlan: "free",
      monthlyUnlocksUsed: 0,
      monthlyUnlocksLimit: 0, // Free plan = no unlocks, must upgrade
      monthlyProjectsPosted: 0, // Track projects posted this month
      subscriptionResetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      // Legacy fields (keeping for backwards compatibility)
      subscriptionTier: "free",
      profileUnlocksRemaining: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    if (existing) {
      await ngoProfilesDb.update(user.id, profileData)
    } else {
      await ngoProfilesDb.create(profileData)
    }

    revalidatePath("/ngo/dashboard")
    trackEvent("user", "ngo_signup", { userId: user.id, metadata: { orgName: data.orgDetails.orgName } })
    trackEvent("user", "profile_complete", { userId: user.id, metadata: { role: "ngo" } })
    // Real-time ES sync — never block onboarding
    try {
      const { syncSingleDocument } = await import("@/lib/es-sync")
      await syncSingleDocument("ngo", user.id)
    } catch (syncErr) {
      console.error("[saveNGOOnboarding] ES sync failed (non-blocking):", syncErr)
    }
    return { success: true, data: "NGO profile saved successfully" }
  } catch (error) {
    console.error("Error saving NGO onboarding:", error)
    return { success: false, error: "Failed to save profile" }
  }
}

export async function getNGOProfile(userId?: string): Promise<NGOProfile | null> {
  const targetUserId = userId || (await getCurrentUser())?.id
  if (!targetUserId) return null
  const profile = await ngoProfilesDb.findByUserId(targetUserId)
  return serializeDocument(profile)
}

// Allowed fields for NGO profile updates - filters out sensitive fields
const ALLOWED_NGO_UPDATE_FIELDS = [
  "orgName", "organizationName", "registrationNumber", "website", "phone",
  "address", "city", "country", "description", "mission", "yearFounded",
  "teamSize", "logo", "socialLinks", "causes", "typicalSkillsNeeded",
  "acceptRemoteVolunteers", "acceptOnsiteVolunteers", "contactPersonName", "contactEmail", "contactPhone",
  "coordinates", "verificationDocuments"
] as const

export async function updateNGOProfile(
  updates: Partial<NGOProfile>
): Promise<ApiResponse<boolean>> {
  try {
    const user = await requireAuth()
    
    // Filter to only allowed fields - prevent modification of userId, isVerified, subscriptionTier, etc.
    const filteredUpdates: Partial<NGOProfile> = {}
    for (const key of ALLOWED_NGO_UPDATE_FIELDS) {
      if (key in updates) {
        (filteredUpdates as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[key]
      }
    }
    
    console.log(`[NGO Save] userId=${user.id}, fields=${Object.keys(filteredUpdates).join(",")}`)
    
    if (Object.keys(filteredUpdates).length === 0) {
      console.log(`[NGO Save] No valid fields after filtering. Incoming keys: ${Object.keys(updates).join(",")}`)
      return { success: false, error: "No valid fields to update" }
    }
    
    // Auto-sync logo to auth table (single source of truth for images)
    if (filteredUpdates.logo) {
      const { syncUserDataToProfile } = await import("./user-utils")
      await syncUserDataToProfile(user.id, { image: filteredUpdates.logo })
    }
    
    const result = await ngoProfilesDb.update(user.id, filteredUpdates)
    console.log(`[NGO Save] DB update result: modified=${result}`)
    revalidatePath("/ngo/profile")
    revalidatePath("/ngo/settings")
    // Real-time ES sync — never block the profile save
    try {
      const { syncSingleDocument } = await import("@/lib/es-sync")
      await syncSingleDocument("ngo", user.id)
    } catch (syncErr) {
      console.error("[updateNGOProfile] ES sync failed (non-blocking):", syncErr)
    }
    return { success: true, data: result }
  } catch (error: any) {
    // Re-throw Next.js internal errors (redirect, notFound, etc.)
    if (error?.digest?.startsWith?.("NEXT_")) {
      throw error
    }
    console.error("[NGO Save] Error:", error?.message || error, error?.stack)
    return { success: false, error: error?.message || "Failed to update profile" }
  }
}

// ============================================
// PROJECT ACTIONS
// ============================================

import { validateProjectData, validateSkills, sanitizeString, isValidObjectId } from "./validation"

export async function createProject(data: {
  title: string
  description: string
  skillsRequired: { categoryId: string; subskillId: string; priority: string }[]
  experienceLevel: string
  timeCommitment: string
  duration: string
  projectType: string
  workMode: string
  location?: string
  causes: string[]
  startDate?: Date
  deadline?: Date
  documents?: Array<{ name: string; url: string; type: string }>
}): Promise<ApiResponse<string>> {
  try {
    const user = await requireRole(["ngo", "admin"])
    const ngoProfile = await ngoProfilesDb.findByUserId(user.id)

    if (!ngoProfile) {
      return { success: false, error: "NGO profile not found. Please complete onboarding." }
    }

    // Get admin settings for project limits
    const settings = await adminSettingsDb.get()
    const FREE_PLAN_PROJECT_LIMIT = settings?.ngoFreeProjectsPerMonth ?? 3

    // Check project posting limits for free plan NGOs
    const subscriptionPlan = ngoProfile.subscriptionPlan || "free"
    const monthlyProjectsPosted = ngoProfile.monthlyProjectsPosted || 0
    
    // Check if we need to reset monthly counter
    const now = new Date()
    const resetDate = ngoProfile.subscriptionResetDate ? new Date(ngoProfile.subscriptionResetDate) : null
    
    let shouldResetCounter = false
    if (resetDate && now >= resetDate) {
      // Reset the counter - it's a new month
      const nextResetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      await ngoProfilesDb.update(user.id, {
        monthlyProjectsPosted: 0,
        subscriptionResetDate: nextResetDate,
      })
      shouldResetCounter = true
    } else if (subscriptionPlan === "free" && !shouldResetCounter && monthlyProjectsPosted >= FREE_PLAN_PROJECT_LIMIT) {
      // Free plan limit reached
      return { 
        success: false, 
        error: `You've reached your monthly limit of ${FREE_PLAN_PROJECT_LIMIT} projects. Upgrade to Pro for unlimited projects!`,
      }
    }

    if (!ngoProfile) {
      return { success: false, error: "NGO profile not found. Please complete onboarding." }
    }

    // Input validation
    const projectValidation = validateProjectData({
      title: data.title,
      description: data.description,
      startDate: data.startDate,
      deadline: data.deadline,
    })
    if (!projectValidation.valid) {
      return { success: false, error: projectValidation.errors.join(", ") }
    }

    const skillsValidation = validateSkills(data.skillsRequired)
    if (!skillsValidation.valid) {
      return { success: false, error: skillsValidation.errors.join(", ") }
    }

    // Sanitize inputs
    const sanitizedTitle = sanitizeString(data.title, 200)
    const sanitizedDescription = sanitizeString(data.description, 10000)
    const sanitizedLocation = data.location ? sanitizeString(data.location, 200) : undefined

    const projectData: Omit<Project, "_id"> = {
      ngoId: user.id,
      ngoProfileId: ngoProfile._id?.toString() || "",
      title: sanitizedTitle,
      description: sanitizedDescription,
      skillsRequired: data.skillsRequired.map((s) => ({
        categoryId: s.categoryId,
        subskillId: s.subskillId,
        priority: s.priority as "must-have" | "nice-to-have",
      })),
      experienceLevel: data.experienceLevel as "beginner" | "intermediate" | "expert",
      timeCommitment: data.timeCommitment,
      duration: data.duration,
      projectType: data.projectType as "short-term" | "long-term" | "consultation" | "ongoing",
      workMode: data.workMode as "remote", // | "onsite" | "hybrid",
      location: sanitizedLocation,
      causes: data.causes,
      documents: data.documents,
      startDate: data.startDate,
      deadline: data.deadline,
      status: "active",
      applicantsCount: 0,
      viewsCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const projectId = await projectsDb.create(projectData)
    await ngoProfilesDb.incrementStat(user.id, "projectsPosted")

    // Increment monthly project counter for free plan NGOs
    if (subscriptionPlan === "free") {
      try {
        await ngoProfilesDb.update(user.id, {
          monthlyProjectsPosted: (monthlyProjectsPosted || 0) + 1,
          // Set reset date if not set
          ...(ngoProfile.subscriptionResetDate ? {} : { subscriptionResetDate: new Date(now.getFullYear(), now.getMonth() + 1, 1) }),
        })
      } catch (e) {
        console.error("Failed to increment monthly project count:", e)
      }
    }

    // Best effort: Email volunteers whose skills match this opportunity
    try {
      const { sendEmail, getNewOpportunityEmailHtml } = await import("@/lib/email")
      // Fetch only active volunteers with email notifications enabled
      const allVolunteers = await volunteerProfilesDb.findMany(
        { 
          isActive: { $ne: false },
          "privacy.emailNotifications": { $ne: false },
        } as any, 
        { limit: 500 } as any
      )
      
      // Build a Set of "categoryId::subskillId" for fast lookup
      const projectSkillKeys = new Set(
        data.skillsRequired.map(s => `${s.categoryId}::${s.subskillId}`)
      )
      
      const matchingVolunteers = allVolunteers.filter(v => {
        // Skip explicitly deactivated volunteers
        if (v.isActive === false) return false
        
        // Parse skills — handles both object array and string array formats
        const vSkills: Array<{categoryId?: string; subskillId?: string}> = Array.isArray(v.skills) ? v.skills : []
        if (vSkills.length === 0) return false
        
        // Require at least one EXACT categoryId + subskillId match
        return vSkills.some((s: any) => {
          if (!s || typeof s === 'string') return false
          const key = `${s.categoryId}::${s.subskillId}`
          return projectSkillKeys.has(key)
        })
      })

      // Get user emails for matching volunteers (up to 20)
      const db = await import("@/lib/database").then(m => m.getDb())
      const database = await db
      for (const vol of matchingVolunteers.slice(0, 20)) {
        try {
          const volUser = await database.collection("user").findOne(userIdQuery(vol.userId))
          
          // Create in-app notification for each matching volunteer
          try {
            await notificationsDb.create({
              userId: vol.userId,
              type: "project_match",
              title: "New Matching Opportunity",
              message: `A new project "${sanitizedTitle}" matches your skills`,
              referenceId: projectId,
              referenceType: "project",
              link: `/projects/${projectId}`,
              isRead: false,
              createdAt: new Date(),
            })
          } catch (notifErr) {
            console.error(`[createProject] Failed to create notification for ${vol.userId}:`, notifErr)
          }

          // Check notification preferences before sending email
          const prefs = volUser?.privacy
          if (volUser?.email && prefs?.emailNotifications !== false && prefs?.opportunityDigest !== false) {
            await sendEmail({
              to: volUser.email,
              subject: `New opportunity matching your skills: ${sanitizedTitle}`,
              html: getNewOpportunityEmailHtml(
                vol.name || volUser.name || "Impact Agent",
                sanitizedTitle,
                ngoProfile.organizationName || "An NGO",
                projectId
              ),
            })
          }
        } catch (emailErr) {
          console.error(`[createProject] Failed to email volunteer ${vol.userId}:`, emailErr)
        }
      }
      console.log(`[createProject] Notified ${Math.min(matchingVolunteers.length, 20)} matching volunteers (out of ${allVolunteers.length} total)`)
    } catch (emailError) {
      console.error("[createProject] Failed to send opportunity emails:", emailError)
    }

    // Notify followers of this NGO about the new project (in-app always, email only if skills match)
    try {
      const { followers } = await followsDb.getFollowers(user.id, 1, 50)
      const db = await import("@/lib/database").then(m => m.getDb())
      const database = await db
      const { sendEmail } = await import("@/lib/email")
      
      // Build skill keys set for matching (reuse same format as above)
      const projectSkillKeysForFollowers = new Set(
        data.skillsRequired.map(s => `${s.categoryId}::${s.subskillId}`)
      )
      
      for (const follow of followers.slice(0, 50)) {
        try {
          // In-app notification (always — they chose to follow this NGO)
          await notificationsDb.create({
            userId: follow.followerId,
            type: "followed_ngo_project",
            title: "New Project from NGO You Follow",
            message: `${ngoProfile.organizationName || "An NGO"} posted "${sanitizedTitle}"`,
            referenceId: projectId,
            referenceType: "project",
            link: `/projects/${projectId}`,
            isRead: false,
            createdAt: new Date(),
          })

          // Email ONLY if follower's skills match AND preferences allow
          const followerUser = await database.collection("user").findOne(userIdQuery(follow.followerId))
          if (!followerUser?.email) continue
          
          const followerPrefs = followerUser.privacy
          if (followerPrefs?.emailNotifications === false || followerPrefs?.opportunityDigest === false) continue
          
          // Check if the follower (if a volunteer) has matching skills
          const rawSkills = followerUser.skills
          const followerSkills = !rawSkills ? [] : typeof rawSkills === 'string' ? (() => { try { return JSON.parse(rawSkills) } catch { return [] } })() : rawSkills
          const hasMatchingSkills = Array.isArray(followerSkills) && followerSkills.length > 0 &&
            followerSkills.some((s: any) => {
              if (!s || typeof s === 'string') return false
              return projectSkillKeysForFollowers.has(`${s.categoryId}::${s.subskillId}`)
            })
          
          // Only send email if skills match the opportunity
          if (hasMatchingSkills) {
            await sendEmail({
              to: followerUser.email,
              subject: `${ngoProfile.organizationName || "An NGO you follow"} posted a new project matching your skills`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h1 style="color: #10b981;">JustBeCause Network</h1>
                  <div style="background: #f9fafb; border-radius: 8px; padding: 30px;">
                    <h2>New Project Alert</h2>
                    <p>Hi ${followerUser.name || "there"},</p>
                    <p><strong>${ngoProfile.organizationName || "An NGO"}</strong> that you follow just posted a new project that matches your skills:</p>
                    <div style="background: white; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                      <h3 style="margin: 0 0 8px 0;">${sanitizedTitle}</h3>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="https://justbecausenetwork.com/projects/${projectId}" style="background: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">View Project</a>
                    </div>
                  </div>
                  <p style="color: #999; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} JustBeCause Network</p>
                </div>
              `,
            })
          }
        } catch (followErr) {
          console.error(`[createProject] Failed to notify follower ${follow.followerId}:`, followErr)
        }
      }
      console.log(`[createProject] Notified ${Math.min(followers.length, 50)} followers`)
    } catch (followerErr) {
      console.error("[createProject] Failed to notify followers:", followerErr)
    }

    revalidatePath("/ngo/projects")
    revalidatePath("/projects")
    trackEvent("project", "created", { userId: user.id, metadata: { projectId, title: data.title, skillCount: data.skillsRequired?.length || 0 } })

    // Real-time ES sync — fire-and-forget so it never blocks project creation
    try {
      const { syncSingleDocument } = await import("@/lib/es-sync")
      await syncSingleDocument("projects", projectId)
    } catch (syncErr) {
      console.error("[createProject] ES sync failed (non-blocking):", syncErr)
    }

    return { success: true, data: projectId }
  } catch (error) {
    console.error("Error creating project:", error)
    return { success: false, error: "Failed to create project" }
  }
}

export async function getProject(id: string): Promise<Project | null> {
  const project = await projectsDb.findById(id)
  return serializeDocument(project)
}

// Alias for getProject
export async function getProjectById(id: string): Promise<Project | null> {
  const project = await projectsDb.findById(id)
  return serializeDocument(project)
}

// Get NGO by user ID or profile ID
export async function getNGOById(userId: string): Promise<NGOProfile | null> {
  const profile = await ngoProfilesDb.findByUserId(userId)
  return serializeDocument(profile)
}

export async function getActiveProjects(limit?: number): Promise<Project[]> {
  const projects = await projectsDb.findActive({}, { limit, sort: { createdAt: -1 } as any })
  return serializeDocuments(projects)
}

export async function getNGOProjects(): Promise<Project[]> {
  const user = await getCurrentUser()
  if (!user) return []
  const projects = await projectsDb.findByNgoId(user.id)
  return serializeDocuments(projects)
}

// Alias for getNGOProjects
export async function getMyProjectsAsNGO(): Promise<Project[]> {
  return getNGOProjects()
}

export async function updateProject(
  id: string,
  updates: Partial<Project>
): Promise<ApiResponse<boolean>> {
  try {
    const user = await requireRole(["ngo", "admin"])
    const project = await projectsDb.findById(id)

    if (!project || (project.ngoId !== user.id && user.role !== "admin")) {
      return { success: false, error: "Project not found or unauthorized" }
    }

    const result = await projectsDb.update(id, updates)

    // Notify applicants when project status changes to completed/closed/paused
    const statusChanged = updates.status && updates.status !== project.status
    const notifyStatuses = ["completed", "closed", "paused"]
    if (statusChanged && notifyStatuses.includes(updates.status as string)) {
      try {
        const applications = await applicationsDb.findByProjectId(id)
        const statusLabel = updates.status === "completed" ? "completed" : updates.status === "closed" ? "closed" : "paused"
        
        for (const app of applications.slice(0, 50)) {
          try {
            // In-app notification
            await notificationsDb.create({
              userId: app.volunteerId,
              type: "project_status_change",
              title: `Project ${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}`,
              message: `"${project.title}" has been ${statusLabel}`,
              referenceId: id,
              referenceType: "project",
              link: `/projects/${id}`,
              isRead: false,
              createdAt: new Date(),
            })

            // Email notification (respects preferences)
            const volUser = await (await getDb()).collection("user").findOne(userIdQuery(app.volunteerId))
            const volPrefs = volUser?.privacy
            if (volUser?.email && volPrefs?.applicationNotifications !== false && volPrefs?.emailNotifications !== false) {
              const { sendEmail } = await import("@/lib/email")
              await sendEmail({
                to: volUser.email,
                subject: `Project update: "${project.title}" has been ${statusLabel}`,
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #10b981;">JustBeCause Network</h1>
                    <div style="background: #f9fafb; border-radius: 8px; padding: 30px;">
                      <h2>Project Status Update</h2>
                      <p>Hi ${volUser.name || "there"},</p>
                      <p>The project <strong>"${project.title}"</strong> that you applied to has been <strong>${statusLabel}</strong>.</p>
                      <div style="text-align: center; margin: 30px 0;">
                        <a href="https://justbecausenetwork.com/projects/${id}" style="background: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">View Project</a>
                      </div>
                    </div>
                    <p style="color: #999; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} JustBeCause Network</p>
                  </div>
                `,
              })
            }
          } catch (appErr) {
            console.error(`[updateProject] Failed to notify applicant ${app.volunteerId}:`, appErr)
          }
        }
        console.log(`[updateProject] Notified ${Math.min(applications.length, 50)} applicants about status change to ${statusLabel}`)

        // When project completes, trigger milestone checks for accepted volunteers
        if (updates.status === "completed") {
          const acceptedApps = applications.filter((a) => a.status === "accepted")
          for (const app of acceptedApps) {
            try {
              const volUserId = app.volunteerId
              // Increment completed projects count & check milestones
              await volunteerProfilesDb.incrementCompletedProjects(volUserId)
              const updatedProfile = await volunteerProfilesDb.findByUserId(volUserId)
              if (updatedProfile) {
                await checkAndCelebrateMilestones(volUserId, "projects", updatedProfile.completedProjects || 0)
                await checkAndAwardBadges(volUserId, "projects_completed")
              }
            } catch (milestoneErr) {
              console.error(`[updateProject] Milestone check failed for ${app.volunteerId}:`, milestoneErr)
            }
          }
        }
      } catch (notifErr) {
        console.error("[updateProject] Failed to send status change notifications:", notifErr)
      }
    }

    revalidatePath(`/projects/${id}`)
    revalidatePath("/ngo/projects")

    // Real-time ES sync — fire-and-forget so it never blocks the update
    try {
      const { syncSingleDocument } = await import("@/lib/es-sync")
      await syncSingleDocument("projects", id)
    } catch (syncErr) {
      console.error("[updateProject] ES sync failed (non-blocking):", syncErr)
    }

    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: "Failed to update project" }
  }
}

export async function deleteProject(id: string): Promise<ApiResponse<boolean>> {
  try {
    const user = await requireRole(["ngo", "admin"])
    const project = await projectsDb.findById(id)

    if (!project || (project.ngoId !== user.id && user.role !== "admin")) {
      return { success: false, error: "Project not found or unauthorized" }
    }

    const result = await projectsDb.delete(id)
    revalidatePath("/ngo/projects")
    revalidatePath("/projects")
    // Remove from ES
    try {
      const { syncSingleDocument } = await import("@/lib/es-sync")
      await syncSingleDocument("projects", id, "delete")
    } catch (syncErr) {
      console.error("[deleteProject] ES sync failed (non-blocking):", syncErr)
    }
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: "Failed to delete project" }
  }
}

// ============================================
// APPLICATION ACTIONS
// ============================================

export async function applyToProject(
  projectId: string,
  coverMessage?: string
): Promise<ApiResponse<string>> {
  try {
    const user = await requireRole(["volunteer"])
    const volunteerProfile = await volunteerProfilesDb.findByUserId(user.id)

    if (!volunteerProfile) {
      return { success: false, error: "Please complete your profile before applying" }
    }

    // Get admin settings for application limits
    const settings = await adminSettingsDb.get()
    const FREE_PLAN_LIMIT = settings?.volunteerFreeApplicationsPerMonth ?? 3

    // Check application limits for free plan volunteers
    const subscriptionPlan = volunteerProfile.subscriptionPlan || "free"
    const monthlyApplicationsUsed = volunteerProfile.monthlyApplicationsUsed || 0
    
    // Check if we need to reset monthly counter
    const now = new Date()
    const resetDate = volunteerProfile.subscriptionResetDate ? new Date(volunteerProfile.subscriptionResetDate) : null
    
    if (resetDate && now >= resetDate) {
      // Reset the counter - it's a new month
      const nextResetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      await volunteerProfilesDb.update(user.id, {
        monthlyApplicationsUsed: 0,
        subscriptionResetDate: nextResetDate,
      })
    } else if (subscriptionPlan === "free" && monthlyApplicationsUsed >= FREE_PLAN_LIMIT) {
      // Free plan limit reached
      return { 
        success: false, 
        error: `You've reached your monthly limit of ${FREE_PLAN_LIMIT} applications. Upgrade to Pro for unlimited applications!`,
        data: "LIMIT_REACHED" as any
      }
    }

    const project = await projectsDb.findById(projectId)
    if (!project) {
      return { success: false, error: "Project not found" }
    }

    if (project.status !== "active" && project.status !== "open") {
      return { success: false, error: "This project is no longer accepting applications" }
    }

    // Check if project deadline has passed
    if (project.deadline) {
      const deadlineDate = new Date(project.deadline)
      const currentDate = new Date()
      if (currentDate > deadlineDate) {
        return { success: false, error: "The application deadline for this project has passed" }
      }
    }

    const applicationData: Omit<Application, "_id"> = {
      projectId,
      volunteerId: user.id,
      volunteerProfileId: volunteerProfile._id?.toString() || "",
      ngoId: project.ngoId,
      coverMessage,
      status: "pending",
      isProfileUnlocked: volunteerProfile.volunteerType === "paid", // Auto-unlock for paid-only volunteers
      appliedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Use atomic create-if-not-exists to prevent race condition duplicates
    const result = await applicationsDb.createIfNotExists(applicationData)
    
    if (!result.created) {
      return { success: false, error: "You have already applied to this project" }
    }

    const applicationId = result.id!
    
    // Increment application counter for free plan users
    if (subscriptionPlan === "free") {
      try {
        await volunteerProfilesDb.incrementApplicationCount(user.id)
        
        // Warn when approaching limit (used N-1 of N)
        const newCount = monthlyApplicationsUsed + 1
        if (newCount === FREE_PLAN_LIMIT - 1) {
          await notificationsDb.create({
            userId: user.id,
            type: "application_limit_warning",
            title: "Almost at Application Limit",
            message: `You have ${FREE_PLAN_LIMIT - newCount} application${FREE_PLAN_LIMIT - newCount === 1 ? "" : "s"} left this month. Upgrade to Pro for unlimited!`,
            referenceId: user.id,
            referenceType: "subscription",
            link: "/pricing",
            isRead: false,
            createdAt: new Date(),
          })
        } else if (newCount >= FREE_PLAN_LIMIT) {
          await notificationsDb.create({
            userId: user.id,
            type: "application_limit_reached",
            title: "Monthly Limit Reached",
            message: `You've used all ${FREE_PLAN_LIMIT} free applications this month. Upgrade to Pro for unlimited applications!`,
            referenceId: user.id,
            referenceType: "subscription",
            link: "/pricing",
            isRead: false,
            createdAt: new Date(),
          })
        }
      } catch (e) {
        console.error("Failed to increment application count:", e)
      }
    }
    
    // Best effort: increment applicants count and create notification
    // These are non-critical and won't fail the application
    try {
      await projectsDb.incrementApplicants(projectId)
    } catch (e) {
      console.error("Failed to increment applicants count:", e)
    }

    try {
      await notificationsDb.create({
        userId: project.ngoId,
        type: "new_application",
        title: "New Application Received",
        message: `An impact agent has applied to "${project.title}"`,
        referenceId: applicationId,
        referenceType: "application",
        isRead: false,
        createdAt: new Date(),
      })
    } catch (e) {
      console.error("Failed to create notification:", e)
    }

    // Best effort: Email NGO about new application (respects notification preferences)
    try {
      const ngoUserInfo = await getUserInfo(project.ngoId)
      const ngoUserDb = await (await getDb()).collection("user").findOne(userIdQuery(project.ngoId))
      const ngoPrefs = ngoUserDb?.privacy
      if (ngoUserInfo?.email && ngoPrefs?.applicationNotifications !== false && ngoPrefs?.emailNotifications !== false) {
        const { sendEmail, getNewApplicationEmailHtml } = await import("@/lib/email")
        const volunteerName = (await getUserInfo(user.id))?.name || "An Impact Agent"
        const html = getNewApplicationEmailHtml(
          ngoUserInfo.name,
          volunteerName,
          project.title,
          coverMessage
        )
        await sendEmail({
          to: ngoUserInfo.email,
          subject: `New application for "${project.title}" on JustBeCause`,
          html,
          text: `Hi ${ngoUserInfo.name}, ${volunteerName} has applied to your project "${project.title}" on JustBeCause Network. Log in to review the application.`,
        })
      }
    } catch (emailErr) {
      console.error("[applyToProject] Failed to send application email:", emailErr)
    }

    revalidatePath("/volunteer/applications")
    revalidatePath("/ngo/applications")
    trackEvent("application", "submitted", { userId: user.id, metadata: { applicationId, projectId } })
    return { success: true, data: applicationId }
  } catch (error) {
    console.error("Error applying to project:", error)
    return { success: false, error: "Failed to submit application" }
  }
}

export async function hasAppliedToProject(projectId: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  return applicationsDb.exists(projectId, user.id)
}

// ============================================
// SAVE/BOOKMARK PROJECTS
// ============================================

export async function toggleSaveProject(projectId: string): Promise<ApiResponse<{ isSaved: boolean }>> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    const profile = await volunteerProfilesDb.findByUserId(user.id)
    if (!profile) {
      return { success: false, error: "Impact agent profile not found" }
    }

    const savedProjects = profile.savedProjects || []
    const isCurrentlySaved = savedProjects.includes(projectId)

    let newSavedProjects: string[]
    if (isCurrentlySaved) {
      // Unsave
      newSavedProjects = savedProjects.filter((id) => id !== projectId)
    } else {
      // Save
      newSavedProjects = [...savedProjects, projectId]
    }

    // Update profile
    await volunteerProfilesDb.update(user.id, {
      savedProjects: newSavedProjects,
    } as any)

    revalidatePath("/volunteer/opportunities")
    revalidatePath(`/projects/${projectId}`)

    return { success: true, data: { isSaved: !isCurrentlySaved } }
  } catch (error) {
    console.error("Error toggling save project:", error)
    return { success: false, error: "Failed to save project" }
  }
}

export async function isProjectSaved(projectId: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  
  const profile = await volunteerProfilesDb.findByUserId(user.id)
  if (!profile) return false
  
  return (profile.savedProjects || []).includes(projectId)
}

export async function getSavedProjects(): Promise<Project[]> {
  const user = await getCurrentUser()
  if (!user) return []
  
  const profile = await volunteerProfilesDb.findByUserId(user.id)
  if (!profile || !profile.savedProjects?.length) return []
  
  const projects = await Promise.all(
    profile.savedProjects.map((id) => projectsDb.findById(id))
  )
  
  return serializeDocuments(projects.filter(Boolean) as Project[])
}

export async function getMyApplications(): Promise<Application[]> {
  const user = await getCurrentUser()
  if (!user) return []
  const applications = await applicationsDb.findByVolunteerId(user.id)
  return serializeDocuments(applications)
}

export async function getProjectApplications(projectId: string): Promise<Application[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const project = await projectsDb.findById(projectId)
  if (!project || (project.ngoId !== user.id && user.role !== "admin")) {
    return []
  }

  const applications = await applicationsDb.findByProjectId(projectId)
  return serializeDocuments(applications)
}

export async function getNGOApplications(): Promise<Application[]> {
  const user = await getCurrentUser()
  if (!user) return []
  const applications = await applicationsDb.findByNgoId(user.id)
  return serializeDocuments(applications)
}

/**
 * Get NGO applications with enriched data (project and volunteer info)
 * Optimized to avoid N+1 queries
 */
export async function getNGOApplicationsEnriched() {
  const user = await getCurrentUser()
  if (!user) return []
  
  const applications = await applicationsDb.findByNgoId(user.id)
  
  if (applications.length === 0) return []
  
  // Collect unique IDs
  const projectIds = [...new Set(applications.map((a) => a.projectId))]
  const volunteerIds = [...new Set(applications.map((a) => a.volunteerId))]
  
  // Batch fetch projects and volunteer profiles
  const [projects, volunteerProfiles] = await Promise.all([
    Promise.all(projectIds.map((id) => projectsDb.findById(id))),
    Promise.all(volunteerIds.map((id) => volunteerProfilesDb.findByUserId(id))),
  ])
  
  // Create lookup maps
  const projectMap = new Map(
    projects.filter(Boolean).map((p) => [p!._id?.toString(), p])
  )
  const volunteerMap = new Map(
    volunteerProfiles.filter(Boolean).map((v) => [v!.userId, v])
  )
  
  // Enrich applications
  const enrichedApplications = applications.map((app) => ({
    ...app,
    _id: app._id?.toString(),
    project: projectMap.get(app.projectId) || null,
    volunteerProfile: volunteerMap.get(app.volunteerId) || null,
  }))
  
  return serializeDocuments(enrichedApplications)
}

export async function updateApplicationStatus(
  applicationId: string,
  status: Application["status"],
  notes?: string
): Promise<ApiResponse<boolean>> {
  try {
    const user = await requireRole(["ngo", "admin"])
    const application = await applicationsDb.findById(applicationId)

    if (!application || (application.ngoId !== user.id && user.role !== "admin")) {
      return { success: false, error: "Application not found or unauthorized" }
    }

    const result = await applicationsDb.updateStatus(applicationId, status, notes)

    // Create notification for volunteer
    await notificationsDb.create({
      userId: application.volunteerId,
      type: status === "accepted" ? "application_accepted" : "application_rejected",
      title: `Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: `Your application has been ${status}`,
      referenceId: applicationId,
      referenceType: "application",
      isRead: false,
      createdAt: new Date(),
    })

    // Best effort: Email volunteer about status change (respects notification preferences)
    if (status === "accepted" || status === "rejected" || status === "shortlisted") {
      try {
        const volunteerInfo = await getUserInfo(application.volunteerId)
        const volUserDb = await (await getDb()).collection("user").findOne(userIdQuery(application.volunteerId))
        const volPrefs = volUserDb?.privacy
        if (volunteerInfo?.email && volPrefs?.applicationNotifications !== false && volPrefs?.emailNotifications !== false) {
          const project = await projectsDb.findById(application.projectId)
          const ngoInfo = await getUserInfo(application.ngoId)
          const { sendEmail, getApplicationStatusEmailHtml } = await import("@/lib/email")
          const html = getApplicationStatusEmailHtml(
            volunteerInfo.name,
            project?.title || "a project",
            ngoInfo?.name || "An NGO",
            status as "accepted" | "rejected" | "shortlisted",
            notes
          )
          await sendEmail({
            to: volunteerInfo.email,
            subject: status === "accepted"
              ? `Your application has been accepted on JustBeCause!`
              : status === "shortlisted"
                ? `You've been shortlisted on JustBeCause!`
                : `Application update on JustBeCause`,
            html,
            text: `Hi ${volunteerInfo.name}, your application for "${project?.title || "a project"}" has been ${status}. Log in for more details.`,
          })
        }
      } catch (emailErr) {
        console.error("[updateApplicationStatus] Failed to send status email:", emailErr)
      }
    }

    revalidatePath("/ngo/applications")
    trackEvent("application", status === "accepted" ? "accepted" : status === "rejected" ? "rejected" : "status_changed", {
      userId: user.id,
      metadata: { applicationId, status, projectId: application.projectId }
    })
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: "Failed to update application" }
  }
}

// ============================================
// PROFILE VISIBILITY & UNLOCK ACTIONS
// ============================================

/**
 * Get volunteer profile with visibility rules applied
 */
export async function getVolunteerProfileView(
  volunteerId: string
): Promise<VolunteerProfileView | null> {
  const currentUser = await getCurrentUser()
  const volunteerProfile = await volunteerProfilesDb.findByUserId(volunteerId)

  if (!volunteerProfile) return null
  
  // Also get user info for name fallback
  const db = await import("@/lib/database").then(m => m.getDb())
  const volunteerUser = await (await db).collection("user").findOne(userIdQuery(volunteerId))

  // Determine if profile should be unlocked
  let isUnlocked = false

  // If volunteer is "paid" type, always show full profile
  if (volunteerProfile.volunteerType === "paid") {
    isUnlocked = true
  }
  // If viewing own profile
  else if (currentUser?.id === volunteerId) {
    isUnlocked = true
  }
  // If current user is admin
  else if (currentUser?.role === "admin") {
    isUnlocked = true
  }
  // NGO with Pro subscription â†’ can see free/both profiles
  else if (currentUser && currentUser.role === "ngo") {
    const ngoProfile = await ngoProfilesDb.findByUserId(currentUser.id)
    isUnlocked = ngoProfile?.subscriptionPlan === "pro"
  }
  // Everyone else (non-logged-in, volunteers, free NGOs) â†’ locked for free/both

  // Get the best name available
  const displayName = volunteerProfile.name || volunteerUser?.name || "Impact Agent"

  // Build the view based on unlock status
  const view: VolunteerProfileView = {
    id: volunteerProfile.userId,
    location: volunteerProfile.city || volunteerProfile.location,
    skills: volunteerProfile.skills,
    causes: volunteerProfile.causes,
    workMode: volunteerProfile.workMode,
    hoursPerWeek: volunteerProfile.hoursPerWeek,
    volunteerType: volunteerProfile.volunteerType,
    freeHoursPerMonth: volunteerProfile.volunteerType === "both" ? volunteerProfile.freeHoursPerMonth : undefined,
    completedProjects: volunteerProfile.completedProjects,
    hoursContributed: volunteerProfile.hoursContributed,
    rating: volunteerProfile.rating,
    isVerified: volunteerProfile.isVerified,
    isUnlocked,
    canMessage: isUnlocked,

    // Conditional fields (locked for free volunteers until unlocked)
    name: isUnlocked ? displayName : null,
    avatar: isUnlocked ? (volunteerProfile.avatar || volunteerUser?.image) : null,
    bio: isUnlocked ? volunteerProfile.bio : null,
    phone: isUnlocked ? volunteerProfile.phone : null,
    linkedinUrl: isUnlocked ? volunteerProfile.linkedinUrl : null,
    portfolioUrl: isUnlocked ? volunteerProfile.portfolioUrl : null,
    resumeUrl: isUnlocked ? volunteerProfile.resumeUrl : null,
    hourlyRate: isUnlocked && volunteerProfile.volunteerType !== "free" ? volunteerProfile.hourlyRate : null,
    discountedRate: isUnlocked && volunteerProfile.volunteerType !== "free" ? volunteerProfile.discountedRate : null,
    currency: isUnlocked && volunteerProfile.volunteerType !== "free" ? volunteerProfile.currency : null,
  }

  return view
}

/**
 * @deprecated Profile unlocking has been replaced with subscription-based access.
 */
export async function unlockVolunteerProfile(
  volunteerId: string,
  paymentId?: string
): Promise<ApiResponse<boolean>> {
  return { 
    success: false, 
    error: "Profile unlocking has been replaced with subscription-based access. Upgrade to Pro to view all volunteer profiles." 
  }
}

// ============================================
// MATCHING ACTIONS
// ============================================

export async function getMatchedVolunteersForProject(
  projectId: string
): Promise<{ volunteerId: string; score: number; profile: VolunteerProfileView }[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const project = await projectsDb.findById(projectId)
  if (!project) return []

  // Fetch active volunteers (isActive: { $ne: false } includes users where field is undefined)
  const volunteers = await volunteerProfilesDb.findMany(
    { isActive: { $ne: false } } as any
  )
  
  // Subscription-based visibility: non-Pro NGOs can only see paid volunteers
  let visibleVolunteers = volunteers
  if (user.role === "ngo") {
    const ngoProfile = await ngoProfilesDb.findByUserId(user.id)
    if (!ngoProfile || ngoProfile.subscriptionPlan !== "pro") {
      visibleVolunteers = volunteers.filter(v => v.volunteerType === "paid")
    }
  }
  
  const matches = matchVolunteersToProject(project, visibleVolunteers)

  // Convert to profile views
  const results = await Promise.all(
    matches.slice(0, 20).map(async (match) => {
      const profileView = await getVolunteerProfileView(match.volunteerId)
      return {
        volunteerId: match.volunteerId,
        score: match.score,
        profile: profileView!,
      }
    })
  )

  return results.filter((r) => r.profile !== null)
}

export async function getMatchedOpportunitiesForVolunteer(): Promise<
  { projectId: string; score: number; project: Project }[]
> {
  const user = await getCurrentUser()
  if (!user) {
    console.log('[Matching] No user found')
    return []
  }

  const volunteerProfile = await volunteerProfilesDb.findByUserId(user.id)
  if (!volunteerProfile) {
    console.log('[Matching] No volunteer profile found for user:', user.id)
    return []
  }

  const projects = await projectsDb.findActive()
  console.log('[Matching] Found', projects.length, 'active projects')
  
  if (projects.length === 0) {
    console.log('[Matching] No active projects available')
    return []
  }

  const matches = matchOpportunitiesToVolunteer(volunteerProfile, projects)
  console.log('[Matching] Generated', matches.length, 'matches')

  return matches.slice(0, 20).map((m) => ({
    projectId: m.projectId,
    score: m.score,
    project: m.project,
  }))
}

// Get recommended volunteers for NGO based on their active projects' skills
export async function getRecommendedVolunteersForNGO(): Promise<
  { volunteerId: string; score: number; volunteer: { name?: string; headline?: string; skills?: any[]; avatar?: string; freeHoursPerMonth?: number } }[]
> {
  const user = await getCurrentUser()
  if (!user || user.role !== "ngo") return []

  // Get NGO's active projects to determine what skills they need
  const projects = await projectsDb.findByNgoId(user.id)
  const activeProjects = projects.filter(p => p.status === "open" || p.status === "active")
  
  if (activeProjects.length === 0) return []

  // Collect all required skills from active projects
  const requiredSkillIds = new Set<string>()
  activeProjects.forEach(project => {
    project.skillsRequired?.forEach((skill: any) => {
      requiredSkillIds.add(skill.subskillId)
    })
  })

  if (requiredSkillIds.size === 0) return []

  // Get all active volunteers (isActive: { $ne: false } includes users where field is undefined)
  const volunteers = await volunteerProfilesDb.findMany(
    { isActive: { $ne: false } } as any
  )
  
  // Subscription-based visibility: non-Pro NGOs can only see paid volunteers
  const ngoProfile = await ngoProfilesDb.findByUserId(user.id)
  const isPro = ngoProfile?.subscriptionPlan === "pro"
  const visibleVolunteers = isPro
    ? volunteers
    : volunteers.filter(v => v.volunteerType === "paid")
  
  // Score volunteers based on skill match
  const scoredVolunteers = visibleVolunteers
    .map(v => {
      const volunteerSkillIds = v.skills?.map((s: any) => s.subskillId) || []
      const matchingSkills = volunteerSkillIds.filter((id: string) => requiredSkillIds.has(id))
      const skillMatchScore = (matchingSkills.length / requiredSkillIds.size) * 100
      
      // Bonus for free hours availability (only for 'both' type volunteers)
      const freeHoursBonus = (v.volunteerType === "both" && v.freeHoursPerMonth && v.freeHoursPerMonth > 0) ? 10 : 0
      
      return {
        volunteerId: v.userId,
        score: Math.round(skillMatchScore + freeHoursBonus),
        volunteer: {
          name: isPro ? v.name : (v.volunteerType === "paid" ? v.name : undefined),
          headline: isPro ? v.bio?.slice(0, 60) : (v.volunteerType === "paid" ? v.bio?.slice(0, 60) : undefined),
          skills: v.skills?.slice(0, 4),
          avatar: isPro ? v.avatar : (v.volunteerType === "paid" ? v.avatar : undefined),
          freeHoursPerMonth: v.volunteerType === "both" ? v.freeHoursPerMonth : undefined,
        }
      }
    })
    .filter(v => v.score >= 20) // Only show genuinely relevant matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  return scoredVolunteers
}

// ============================================
// NOTIFICATION ACTIONS
// ============================================

export async function getNotifications() {
  const user = await getCurrentUser()
  if (!user) return []
  const notifications = await notificationsDb.findByUserId(user.id)
  return serializeDocuments(notifications)
}

export async function markNotificationRead(id: string): Promise<boolean> {
  return notificationsDb.markAsRead(id)
}

// Alias for backward compatibility
export const markNotificationAsRead = markNotificationRead

export async function deleteNotification(id: string): Promise<boolean> {
  return notificationsDb.delete(id)
}

export async function markAllNotificationsRead(): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  return notificationsDb.markAllAsRead(user.id)
}

export async function getUnreadNotificationCount(): Promise<number> {
  const user = await getCurrentUser()
  if (!user) return 0
  return notificationsDb.countUnread(user.id)
}

// ============================================
// ADMIN ACTIONS
// ============================================

export async function getAdminSettings(): Promise<AdminSettings | null> {
  const user = await requireRole(["admin"])
  let settings = await adminSettingsDb.get()
  
  // Auto-initialize settings if they don't exist
  if (!settings) {
    await adminSettingsDb.initialize(user.id)
    settings = await adminSettingsDb.get()
  }
  
  return settings
}

// Public settings getter - no auth required
export async function getPublicSettings(): Promise<Partial<AdminSettings> | null> {
  let settings = await adminSettingsDb.get()
  
  if (!settings) {
    return {
      platformName: "JustBeCause Network",
      platformDescription: "Connecting Skills with Purpose",
      supportEmail: "support@justbecausenetwork.com",
      currency: "USD",
      volunteerFreeApplicationsPerMonth: 3,
      volunteerProPrice: 1, // TEST PRICE (use 999 for production)
      ngoFreeProjectsPerMonth: 3,
      ngoFreeProfileUnlocksPerMonth: 0,
      ngoProPrice: 1, // TEST PRICE (use 2999 for production)
      enablePayments: true,
      enableMessaging: true,
    }
  }
  
  // Return only public settings
  return {
    platformName: settings.platformName,
    platformDescription: settings.platformDescription,
    supportEmail: settings.supportEmail,
    platformLogo: settings.platformLogo,
    currency: settings.currency,
    volunteerFreeApplicationsPerMonth: settings.volunteerFreeApplicationsPerMonth,
    volunteerProPrice: settings.volunteerProPrice,
    volunteerProFeatures: settings.volunteerProFeatures,
    ngoFreeProjectsPerMonth: settings.ngoFreeProjectsPerMonth,
    ngoFreeProfileUnlocksPerMonth: settings.ngoFreeProfileUnlocksPerMonth,
    ngoProPrice: settings.ngoProPrice,
    ngoProFeatures: settings.ngoProFeatures,
    enablePayments: settings.enablePayments,
    enableMessaging: settings.enableMessaging,
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage,
    metaTitle: settings.metaTitle,
    metaDescription: settings.metaDescription,
    socialLinks: settings.socialLinks,
  }
}

export async function updateAdminSettings(
  settings: Partial<AdminSettings>
): Promise<ApiResponse<boolean>> {
  try {
    const user = await requireRole(["admin"])
    
    // Remove _id field if present to avoid MongoDB errors
    const { _id, ...settingsWithoutId } = settings as any

    // Coerce price fields to numbers to prevent string storage
    const numericFields = [
      "volunteerProPrice", "ngoProPrice",
      "volunteerFreeUnlocks", "ngoFreeUnlocks",
      "volunteerProUnlocks", "ngoProUnlocks",
      "volunteerFreeApplications", "volunteerProApplications",
    ]
    for (const field of numericFields) {
      if (field in settingsWithoutId && settingsWithoutId[field] !== undefined) {
        settingsWithoutId[field] = Number(settingsWithoutId[field]) || 0
      }
    }
    
    const result = await adminSettingsDb.update(settingsWithoutId, user.id)
    revalidatePath("/admin/settings")
    revalidatePath("/pricing")
    revalidatePath("/checkout")
    return { success: true, data: result }
  } catch (error) {
    console.error("Update admin settings error:", error)
    return { success: false, error: "Failed to update settings" }
  }
}

export async function getAdminStats(): Promise<{
  totalVolunteers: number
  totalNGOs: number
  totalProjects: number
  totalApplications: number
  totalRevenue: number
}> {
  await requireRole(["admin"])

  const [totalVolunteers, totalNGOs, totalProjects, totalApplications, totalRevenue] =
    await Promise.all([
      volunteerProfilesDb.count(),
      ngoProfilesDb.count(),
      projectsDb.count(),
      applicationsDb.count({}),
      transactionsDb.sumAmount({ paymentStatus: "completed" }),
    ])

  return {
    totalVolunteers,
    totalNGOs,
    totalProjects,
    totalApplications,
    totalRevenue,
  }
}

// Enhanced analytics for admin dashboard
export async function getAdminAnalytics() {
  await requireRole(["admin"])
  
  const db = await getDb()
  const userCollection = db.collection("user")
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  
  // Get counts - use user collection with role filter
  const [
    totalVolunteers,
    totalNGOs,
    totalProjects,
    totalApplications,
    activeProjects,
    completedProjects,
    pendingApplications,
    acceptedApplications,
    verifiedNGOs,
    verifiedVolunteers,
  ] = await Promise.all([
    userCollection.countDocuments({ role: "volunteer" }),
    userCollection.countDocuments({ role: "ngo" }),
    projectsDb.count(),
    applicationsDb.count({}),
    projectsDb.count({ status: { $in: ["active", "open"] } }),
    projectsDb.count({ status: "completed" }),
    applicationsDb.count({ status: "pending" }),
    applicationsDb.count({ status: "accepted" }),
    userCollection.countDocuments({ role: "ngo", isVerified: true }),
    userCollection.countDocuments({ role: "volunteer", isVerified: true }),
  ])
  
  // Get recent signups (last 30 days) - use user collection
  const recentVolunteers = await userCollection.countDocuments({
    role: "volunteer",
    createdAt: { $gte: thirtyDaysAgo }
  })
  const recentNGOs = await userCollection.countDocuments({
    role: "ngo",
    createdAt: { $gte: thirtyDaysAgo }
  })
  
  // Get recent projects
  const recentProjects = await db.collection("projects").countDocuments({
    createdAt: { $gte: thirtyDaysAgo }
  })
  
  // Get recent applications
  const recentApplications = await db.collection("applications").countDocuments({
    createdAt: { $gte: sevenDaysAgo }
  })
  
  // Revenue stats
  const totalRevenue = await transactionsDb.sumAmount({ paymentStatus: "completed" })
  const monthlyRevenue = await db.collection("transactions").aggregate([
    { $match: { paymentStatus: "completed", createdAt: { $gte: thirtyDaysAgo } } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]).toArray()
  
  // Get pending verification counts - use user collection
  const pendingNGOVerifications = await userCollection.countDocuments({
    role: "ngo",
    isVerified: { $ne: true },
    isOnboarded: true
  })
  
  // Recent activity from user collection and other collections
  const recentActivity = await Promise.all([
    userCollection
      .find({ role: "volunteer" })
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ name: 1, createdAt: 1 })
      .toArray()
      .then(docs => docs.map(d => ({ 
        type: "volunteer_signup" as const, 
        text: `New volunteer: ${d.name || "Anonymous"}`,
        createdAt: d.createdAt 
      }))),
    userCollection
      .find({ role: "ngo" })
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ organizationName: 1, orgName: 1, name: 1, createdAt: 1 })
      .toArray()
      .then(docs => docs.map(d => ({ 
        type: "ngo_signup" as const,
        text: `New NGO: ${d.organizationName || d.orgName || d.name || "Organization"}`,
        createdAt: d.createdAt 
      }))),
    db.collection("projects")
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ title: 1, createdAt: 1 })
      .toArray()
      .then(docs => docs.map(d => ({ 
        type: "project_created" as const,
        text: `New project: ${d.title}`,
        createdAt: d.createdAt 
      }))),
    db.collection("applications")
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ createdAt: 1 })
      .toArray()
      .then(docs => docs.map(d => ({ 
        type: "application" as const,
        text: "New application submitted",
        createdAt: d.createdAt 
      }))),
    db.collection("transactions")
      .find({ paymentStatus: "completed" })
      .sort({ createdAt: -1 })
      .limit(5)
      .project({ amount: 1, createdAt: 1 })
      .toArray()
      .then(docs => docs.map(d => ({ 
        type: "payment" as const,
        text: `Payment received: â‚¹${d.amount}`,
        createdAt: d.createdAt 
      }))),
  ])
  
  // Merge and sort recent activity
  const allActivity = recentActivity
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map(a => ({
      ...a,
      timeAgo: getTimeAgo(a.createdAt)
    }))
  
  // Top skills in demand (from projects)
  const skillsInDemand = await db.collection("projects").aggregate([
    { $match: { status: "active" } },
    { $unwind: "$requiredSkills" },
    { $group: { _id: "$requiredSkills", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]).toArray()
  
  // Top causes
  const topCauses = await db.collection("projects").aggregate([
    { $match: { status: "active" } },
    { $unwind: "$causes" },
    { $group: { _id: "$causes", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]).toArray()
  
  return {
    // Overview stats
    totalVolunteers,
    totalNGOs,
    totalProjects,
    totalApplications,
    totalRevenue,
    monthlyRevenue: monthlyRevenue[0]?.total || 0,
    
    // Project stats
    activeProjects,
    completedProjects,
    recentProjects,
    
    // Application stats
    pendingApplications,
    acceptedApplications,
    recentApplications,
    applicationRate: totalProjects > 0 ? Math.round((totalApplications / totalProjects) * 100) / 100 : 0,
    
    // User stats
    verifiedNGOs,
    verifiedVolunteers,
    recentVolunteers,
    recentNGOs,
    
    // Action items
    pendingNGOVerifications,
    
    // Activity feed
    recentActivity: allActivity,
    
    // Insights
    skillsInDemand: skillsInDemand.map(s => ({ skill: s._id, count: s.count })),
    topCauses: topCauses.map(c => ({ cause: c._id, count: c.count })),
    
    // Conversion metrics
    ngoVerificationRate: totalNGOs > 0 ? Math.round((verifiedNGOs / totalNGOs) * 100) : 0,
    projectSuccessRate: totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0,
    applicationAcceptRate: totalApplications > 0 ? Math.round((acceptedApplications / totalApplications) * 100) : 0,
  }
}

// Helper for time ago
function getTimeAgo(date: Date | string): string {
  const now = new Date()
  const past = new Date(date)
  const diffMs = now.getTime() - past.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
  return past.toLocaleDateString()
}

// Admin user role change
export async function adminChangeUserRole(
  userId: string,
  newRole: "volunteer" | "ngo" | "admin"
): Promise<ApiResponse<boolean>> {
  try {
    await requireRole(["admin"])
    
    const db = await getDb()
    
    // Update user role in auth system (Better Auth stores _id as ObjectId)
    const result = await db.collection("user").updateOne(
      userIdQuery(userId),
      { $set: { role: newRole, updatedAt: new Date() } }
    )
    
    if (result.modifiedCount === 0) {
      return { success: false, error: "User not found" }
    }
    
    revalidatePath("/admin/users")
    return { success: true, data: true }
  } catch (error) {
    console.error("Admin change role error:", error)
    return { success: false, error: "Failed to change user role" }
  }
}

export async function getAllVolunteers(page: number = 1, limit: number = 20) {
  await requireRole(["admin"])
  const skip = (page - 1) * limit
  const [volunteers, total] = await Promise.all([
    volunteerProfilesDb.findMany({}, { skip, limit } as any),
    volunteerProfilesDb.count(),
  ])
  return { data: serializeDocuments(volunteers), total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getAllNGOs(page: number = 1, limit: number = 20) {
  await requireRole(["admin"])
  const skip = (page - 1) * limit
  const [ngos, total] = await Promise.all([
    ngoProfilesDb.findMany({}, { skip, limit } as any),
    ngoProfilesDb.count(),
  ])
  return { data: serializeDocuments(ngos), total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getAllProjects(page: number = 1, limit: number = 20) {
  await requireRole(["admin"])
  const skip = (page - 1) * limit
  const [projects, total] = await Promise.all([
    projectsDb.findMany({}, { skip, limit } as any),
    projectsDb.count(),
  ])
  return { data: projects, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function verifyNGO(userId: string, isVerified: boolean): Promise<ApiResponse<boolean>> {
  try {
    await requireRole(["admin"])
    console.log(`[verifyNGO] Updating NGO ${userId} to isVerified=${isVerified}`)
    const result = await ngoProfilesDb.update(userId, { isVerified })
    console.log(`[verifyNGO] Update result:`, result)
    revalidatePath("/admin/ngos")
    revalidatePath("/admin/users")
    return { success: true, data: result }
  } catch (error) {
    console.error("[verifyNGO] Error:", error)
    return { success: false, error: "Failed to update verification status" }
  }
}

export async function verifyVolunteer(userId: string, isVerified: boolean): Promise<ApiResponse<boolean>> {
  try {
    await requireRole(["admin"])
    console.log(`[verifyVolunteer] Updating volunteer ${userId} to isVerified=${isVerified}`)
    const result = await volunteerProfilesDb.update(userId, { isVerified })
    console.log(`[verifyVolunteer] Update result:`, result)
    revalidatePath("/admin/volunteers")
    revalidatePath("/admin/users")
    return { success: true, data: result }
  } catch (error) {
    console.error("[verifyVolunteer] Error:", error)
    return { success: false, error: "Failed to update verification status" }
  }
}

export async function suspendUser(
  userId: string,
  userType: "volunteer" | "ngo"
): Promise<ApiResponse<boolean>> {
  try {
    await requireRole(["admin"])
    
    if (userType === "volunteer") {
      await volunteerProfilesDb.update(userId, { isActive: false })
      revalidatePath("/admin/volunteers")
    } else {
      await ngoProfilesDb.update(userId, { isActive: false } as any)
      revalidatePath("/admin/ngos")
    }
    
    revalidatePath("/admin/users")
    return { success: true, data: true }
  } catch (error) {
    console.error("Suspend user error:", error)
    return { success: false, error: "Failed to suspend user" }
  }
}

export async function reactivateUser(
  userId: string,
  userType: "volunteer" | "ngo"
): Promise<ApiResponse<boolean>> {
  try {
    await requireRole(["admin"])
    
    if (userType === "volunteer") {
      await volunteerProfilesDb.update(userId, { isActive: true })
      revalidatePath("/admin/volunteers")
    } else {
      await ngoProfilesDb.update(userId, { isActive: true } as any)
      revalidatePath("/admin/ngos")
    }
    
    revalidatePath("/admin/users")
    return { success: true, data: true }
  } catch (error) {
    console.error("Reactivate user error:", error)
    return { success: false, error: "Failed to reactivate user" }
  }
}

export async function adminDeleteUser(
  userId: string,
  userType: "volunteer" | "ngo"
): Promise<ApiResponse<boolean>> {
  try {
    await requireRole(["admin"])
    
    const db = await getDb()
    
    // Delete user data based on type - data is stored in user collection directly now
    // But we still need to clean up applications and projects
    if (userType === "volunteer") {
      await db.collection("applications").deleteMany({ volunteerId: userId })
    } else {
      await Promise.all([
        db.collection("projects").deleteMany({ ngoId: userId }),
        db.collection("applications").deleteMany({ ngoId: userId }),
      ])
    }
    
    // Delete common data
    await Promise.all([
      db.collection("conversations").deleteMany({ participants: userId }),
      db.collection("messages").deleteMany({ 
        $or: [{ senderId: userId }, { receiverId: userId }] 
      }),
      db.collection("notifications").deleteMany({ userId }),
      db.collection("profileUnlocks").deleteMany({ 
        $or: [{ ngoId: userId }, { volunteerId: userId }] 
      }),
      db.collection("transactions").deleteMany({ userId }),
      // Delete from session and account tables
      db.collection("session").deleteMany({ userId }),
      db.collection("account").deleteMany({ userId }),
    ])
    
    // Delete user account - use ObjectId query (Better Auth stores _id as ObjectId)
    await db.collection("user").deleteOne(userIdQuery(userId))
    
    revalidatePath("/admin/users")
    revalidatePath("/admin/volunteers")
    revalidatePath("/admin/ngos")
    
    return { success: true, data: true }
  } catch (error) {
    console.error("Admin delete user error:", error)
    return { success: false, error: "Failed to delete user" }
  }
}

export async function verifyUser(
  userId: string,
  userType: "volunteer" | "ngo",
  isVerified: boolean
): Promise<ApiResponse<boolean>> {
  if (userType === "volunteer") {
    return verifyVolunteer(userId, isVerified)
  } else {
    return verifyNGO(userId, isVerified)
  }
}

// ============================================
// BAN/UNBAN USER ACTIONS
// ============================================

export async function banUser(
  userId: string,
  userType: "volunteer" | "ngo",
  reason: string
): Promise<ApiResponse<boolean>> {
  try {
    const adminUser = await requireRole(["admin"])
    
    // Suspend the user first
    if (userType === "volunteer") {
      await volunteerProfilesDb.update(userId, { isActive: false, isBanned: true })
    } else {
      await ngoProfilesDb.update(userId, { isActive: false, isBanned: true } as any)
    }
    
    // Create ban record
    await banRecordsDb.create({
      userId,
      userType,
      reason,
      bannedBy: adminUser.id,
      bannedAt: new Date(),
      isActive: true,
    })
    
    revalidatePath("/admin/users")
    revalidatePath("/admin/volunteers")
    revalidatePath("/admin/ngos")
    
    return { success: true, data: true }
  } catch (error) {
    console.error("Ban user error:", error)
    return { success: false, error: "Failed to ban user" }
  }
}

export async function unbanUser(
  userId: string,
  userType: "volunteer" | "ngo"
): Promise<ApiResponse<boolean>> {
  try {
    const adminUser = await requireRole(["admin"])
    
    // Reactivate the user
    if (userType === "volunteer") {
      await volunteerProfilesDb.update(userId, { isActive: true, isBanned: false })
    } else {
      await ngoProfilesDb.update(userId, { isActive: true, isBanned: false } as any)
    }
    
    // Deactivate ban record
    await banRecordsDb.deactivate(userId, adminUser.id)
    
    revalidatePath("/admin/users")
    revalidatePath("/admin/volunteers")
    revalidatePath("/admin/ngos")
    
    return { success: true, data: true }
  } catch (error) {
    console.error("Unban user error:", error)
    return { success: false, error: "Failed to unban user" }
  }
}

export async function getBanRecords(): Promise<ApiResponse<BanRecord[]>> {
  try {
    await requireRole(["admin"])
    const records = await banRecordsDb.findAll()
    return { success: true, data: records }
  } catch (error) {
    console.error("Get ban records error:", error)
    return { success: false, error: "Failed to get ban records" }
  }
}

export async function getUserBanHistory(userId: string): Promise<ApiResponse<BanRecord[]>> {
  try {
    await requireRole(["admin"])
    const records = await banRecordsDb.findByUserId(userId)
    return { success: true, data: records }
  } catch (error) {
    console.error("Get user ban history error:", error)
    return { success: false, error: "Failed to get user ban history" }
  }
}

// ============================================
// TEAM MEMBER ACTIONS (Admin)
// ============================================

export async function createTeamMember(
  member: Omit<TeamMember, "_id" | "createdAt" | "updatedAt">
): Promise<ApiResponse<string>> {
  try {
    await requireRole(["admin"])
    const id = await teamMembersDb.create(member as TeamMember)
    revalidatePath("/admin/team")
    revalidatePath("/about")
    return { success: true, data: id }
  } catch (error) {
    console.error("Create team member error:", error)
    return { success: false, error: "Failed to create team member" }
  }
}

export async function updateTeamMember(
  id: string,
  updates: Partial<TeamMember>
): Promise<ApiResponse<boolean>> {
  try {
    await requireRole(["admin"])
    const result = await teamMembersDb.update(id, updates)
    revalidatePath("/admin/team")
    revalidatePath("/about")
    return { success: true, data: result }
  } catch (error) {
    console.error("Update team member error:", error)
    return { success: false, error: "Failed to update team member" }
  }
}

export async function deleteTeamMember(id: string): Promise<ApiResponse<boolean>> {
  try {
    await requireRole(["admin"])
    const result = await teamMembersDb.delete(id)
    revalidatePath("/admin/team")
    revalidatePath("/about")
    return { success: true, data: result }
  } catch (error) {
    console.error("Delete team member error:", error)
    return { success: false, error: "Failed to delete team member" }
  }
}

export async function getTeamMembers(): Promise<ApiResponse<TeamMember[]>> {
  try {
    const members = await teamMembersDb.findAll()
    return { success: true, data: members }
  } catch (error) {
    console.error("Get team members error:", error)
    return { success: false, error: "Failed to get team members" }
  }
}

export async function getActiveTeamMembers(): Promise<ApiResponse<TeamMember[]>> {
  try {
    const members = await teamMembersDb.findActive()
    return { success: true, data: members }
  } catch (error) {
    console.error("Get active team members error:", error)
    return { success: false, error: "Failed to get active team members" }
  }
}

export async function reorderTeamMembers(orderedIds: string[]): Promise<ApiResponse<boolean>> {
  try {
    await requireRole(["admin"])
    const result = await teamMembersDb.reorder(orderedIds)
    revalidatePath("/admin/team")
    revalidatePath("/about")
    return { success: true, data: result }
  } catch (error) {
    console.error("Reorder team members error:", error)
    return { success: false, error: "Failed to reorder team members" }
  }
}

// ============================================
// BROWSE & SEARCH ACTIONS
// ============================================

export async function browseVolunteers(filters?: {
  skills?: string[]
  causes?: string[]
  workMode?: string
  volunteerType?: string
  location?: string
}) {
  console.log('[browseVolunteers] Fetching volunteers with filters:', filters)
  
  // Get all volunteers (arrays are now parsed by database helpers)
  const volunteers = await volunteerProfilesDb.findMany({}, { limit: 100 } as any)
  console.log(`[browseVolunteers] Found ${volunteers.length} total volunteers`)
  
  // Filter in JavaScript since arrays are stored as JSON strings
  let filteredVolunteers = volunteers.filter(v => {
    // Skip if explicitly inactive
    if (v.isActive === false) return false
    
    // Apply filters
    if (filters?.skills?.length) {
      const volunteerSkills = Array.isArray(v.skills) ? v.skills : []
      const hasSkill = volunteerSkills.some((skill: any) => 
        filters.skills!.includes(skill?.subskillId || skill)
      )
      if (!hasSkill) return false
    }
    
    if (filters?.causes?.length) {
      const volunteerCauses = Array.isArray(v.causes) ? v.causes : []
      const hasCause = volunteerCauses.some((cause: string) => 
        filters.causes!.includes(cause)
      )
      if (!hasCause) return false
    }
    
    if (filters?.workMode && filters.workMode !== "all" && v.workMode !== filters.workMode) {
      return false
    }
    
    if (filters?.volunteerType && filters.volunteerType !== "all" && v.volunteerType !== filters.volunteerType) {
      return false
    }
    
    if (filters?.location && v.location && !v.location.toLowerCase().includes(filters.location.toLowerCase())) {
      return false
    }
    
    return true
  })
  
  // Subscription-based visibility: non-Pro NGOs can only see paid volunteers
  const currentUser = await getCurrentUser()
  if (currentUser?.role === "ngo") {
    const ngoProfile = await ngoProfilesDb.findByUserId(currentUser.id)
    if (!ngoProfile || ngoProfile.subscriptionPlan !== "pro") {
      filteredVolunteers = filteredVolunteers.filter(v => v.volunteerType === "paid")
    }
  }

  // Limit results
  filteredVolunteers = filteredVolunteers.slice(0, 50)
  
  // Convert to profile views for proper visibility
  const views = await Promise.all(
    filteredVolunteers.map((v) => getVolunteerProfileView(v.userId))
  )
  
  return views.filter((v) => v !== null)
}

export async function browseProjects(filters?: {
  skills?: string[]
  causes?: string[]
  workMode?: string
  projectType?: string
}) {
  // Get active projects from database
  // Fetch all active projects (no cap — the listing page needs a full set
  // so that Elasticsearch search-result IDs can always be matched locally)
  const allProjects = await projectsDb.findActive({}, { sort: { createdAt: -1 } as any })
  
  // Filter in JavaScript since some filtering might be needed
  let filteredProjects = allProjects.filter(p => {
    if (filters?.skills?.length) {
      const projectSkills = p.skillsRequired?.map((s: any) => s.subskillId || s.skillId) || []
      const hasSkill = projectSkills.some((skill: string) => filters.skills!.includes(skill))
      if (!hasSkill) return false
    }
    
    if (filters?.causes?.length) {
      const hasCause = p.causes?.some((cause: string) => filters.causes!.includes(cause))
      if (!hasCause) return false
    }
    
    if (filters?.workMode && p.workMode !== filters.workMode) {
      return false
    }
    
    if (filters?.projectType && p.projectType !== filters.projectType) {
      return false
    }
    
    return true
  })
  
  // Fetch NGO info for each project
  const ngoIds = [...new Set(filteredProjects.map(p => p.ngoId).filter(Boolean))]
  const ngoMap: Record<string, { name: string; logo?: string; verified: boolean }> = {}
  
  for (const ngoId of ngoIds) {
    const ngoProfile = await ngoProfilesDb.findByUserId(ngoId)
    if (ngoProfile) {
      ngoMap[ngoId] = {
        name: ngoProfile.orgName || "Organization",
        logo: ngoProfile.logo,
        verified: ngoProfile.isVerified || false,
      }
    }
  }
  
  // Attach NGO info to projects
  const projectsWithNgo = filteredProjects.map(p => ({
    ...p,
    ngo: ngoMap[p.ngoId] || { name: "Organization", verified: false },
  }))
  
  return serializeDocuments(projectsWithNgo)
}

// Get skill category project counts for home page
export async function getSkillCategoryCounts() {
  const db = await getDb()
  
  // Define skill categories with their IDs and icons
  const categories = [
    { id: "digital-marketing", name: "Digital Marketing", icon: "Megaphone" },
    { id: "fundraising", name: "Fundraising Assistance", icon: "Heart" },
    { id: "website", name: "Website Design & Maintenance", icon: "Code" },
    { id: "finance", name: "Finance & Accounting", icon: "Calculator" },
    { id: "content-creation", name: "Content Creation", icon: "Palette" },
    { id: "communication", name: "Communication", icon: "Target" },
    { id: "planning-support", name: "Planning & Support", icon: "Users" },
  ]
  
  // Get all active projects
  const activeProjects = await db.collection("projects").find({
    status: { $in: ["active", "open", "published"] }
  }).toArray()
  
  // Count projects per category
  const categoryCounts = categories.map(category => {
    const count = activeProjects.filter(project => {
      const skills = project.skillsRequired || []
      return skills.some((skill: any) => skill.categoryId === category.id)
    }).length
    
    return {
      ...category,
      count
    }
  })
  
  return categoryCounts
}

export async function browseNGOs(filters?: {
  causes?: string[]
  location?: string
  isVerified?: boolean
}) {
  const query: any = { isActive: true }

  if (filters?.causes?.length) {
    query.causes = { $in: filters.causes }
  }
  if (filters?.isVerified !== undefined) {
    query.isVerified = filters.isVerified
  }

  const ngos = await ngoProfilesDb.findMany(query, { limit: 50 } as any)
  return serializeDocuments(ngos)
}

// ============================================
// CONVERSATIONS & MESSAGES
// ============================================

export async function getMyConversations() {
  const user = await getCurrentUser()
  if (!user) return []
  
  const conversations = await conversationsDb.findByUserId(user.id)
  
  // Get all other participant IDs
  const otherParticipantIds = conversations
    .map(conv => conv.participants.find((p: string) => p !== user.id))
    .filter(Boolean) as string[]
  
  // Batch fetch all user info using centralized utility
  const usersInfoMap = await getUsersInfo(otherParticipantIds)
  
  // Enrich conversations with participant details
  const enrichedConversations = conversations.map((conv) => {
    const otherParticipantId = conv.participants.find((p: string) => p !== user.id)
    if (!otherParticipantId) return conv
    
    const otherUser = usersInfoMap.get(otherParticipantId)
    
    if (otherUser?.type === "ngo") {
      return {
        ...conv,
        ngoName: otherUser.name,
        ngoLogo: otherUser.image,
        otherParticipantType: "ngo" as const,
        otherParticipantId,
      }
    }
    
    return {
      ...conv,
      volunteerName: otherUser?.name || "Volunteer",
      volunteerAvatar: otherUser?.image,
      otherParticipantType: "volunteer" as const,
      otherParticipantId,
    }
  })
  
  // Count unread messages for each conversation
  const db = await getDb()
  const messagesCollection = db.collection("messages")
  
  const conversationsWithUnread = await Promise.all(
    enrichedConversations.map(async (conv) => {
      const unreadCount = await messagesCollection.countDocuments({
        conversationId: conv._id?.toString(),
        receiverId: user.id,
        isRead: false,
      })
      return { ...conv, unreadCount }
    })
  )
  
  return serializeDocuments(conversationsWithUnread)
}

export async function getConversation(conversationId: string) {
  const user = await getCurrentUser()
  if (!user) return null
  
  const conversations = await conversationsDb.findByUserId(user.id)
  const conversation = conversations.find(c => c._id?.toString() === conversationId) || null
  return serializeDocument(conversation)
}

export async function getConversationMessages(conversationId: string, limit = 50) {
  const user = await getCurrentUser()
  if (!user) {
    console.log(`[getConversationMessages] No user found`)
    return []
  }
  
  console.log(`[getConversationMessages] User: ${user.id}, ConversationId: ${conversationId}`)
  
  // Verify user is part of conversation
  const conversations = await conversationsDb.findByUserId(user.id)
  console.log(`[getConversationMessages] Found ${conversations.length} conversations for user`)
  
  const conversation = conversations.find(c => c._id?.toString() === conversationId)
  if (!conversation) {
    console.log(`[getConversationMessages] Conversation not found or user not a participant`)
    return []
  }
  
  console.log(`[getConversationMessages] Conversation found with participants: ${conversation.participants.join(', ')}`)
  
  // Mark messages as read
  await messagesDb.markAsRead(conversationId, user.id)
  
  const messages = await messagesDb.findByConversationId(conversationId, limit)
  console.log(`[getConversationMessages] Found ${messages.length} messages`)
  
  return serializeDocuments(messages)
}

export async function sendMessage(
  receiverId: string,
  content: string,
  projectId?: string
): Promise<ApiResponse<string>> {
  try {
    const user = await requireAuth()
    
    if (!content.trim()) {
      return { success: false, error: "Message cannot be empty" }
    }
    
    console.log(`[sendMessage] From: ${user.id}, To: ${receiverId}, Content: ${content.substring(0, 30)}...`)
    
    // Find or create conversation
    const conversation = await conversationsDb.findOrCreate([user.id, receiverId], projectId)
    console.log(`[sendMessage] Conversation ID: ${conversation._id?.toString()}, Participants: ${conversation.participants.join(', ')}`)
    
    // Create message
    const messageId = await messagesDb.create({
      conversationId: conversation._id!.toString(),
      senderId: user.id,
      receiverId,
      content: content.trim(),
      isRead: false,
      createdAt: new Date(),
    })
    console.log(`[sendMessage] Message created: ${messageId}`)
    
    // Update conversation last message
    await conversationsDb.updateLastMessage(
      conversation._id!.toString(),
      content.length > 50 ? content.substring(0, 50) + "..." : content
    )
    console.log(`[sendMessage] Conversation updated with last message`)
    
    // Get sender and receiver info using centralized utility
    const [senderInfo, receiverInfo] = await Promise.all([
      getUserInfo(user.id),
      getUserInfo(receiverId),
    ])
    
    const senderName = senderInfo?.name || "Someone"
    const conversationIdStr = conversation._id!.toString()
    const messageLink = receiverInfo?.type === "ngo"
      ? `/ngo/messages/${conversationIdStr}`
      : `/volunteer/messages/${conversationIdStr}`
    
    // Create notification for receiver with link
    try {
      await notificationsDb.create({
        userId: receiverId,
        type: "new_message",
        title: "New Message",
        message: `${senderName} sent you a message`,
        referenceId: conversationIdStr,
        referenceType: "conversation",
        link: messageLink,
        isRead: false,
        createdAt: new Date(),
      })
    } catch (e) {
      console.error("Failed to create notification:", e)
    }

    // Send email notification to receiver (respects notification preferences)
    try {
      if (receiverInfo?.email) {
        const receiverUserDb = await (await getDb()).collection("user").findOne(userIdQuery(receiverId))
        const receiverPrefs = receiverUserDb?.privacy
        if (receiverPrefs?.messageNotifications !== false && receiverPrefs?.emailNotifications !== false) {
        const senderRole = senderInfo?.type || "volunteer"
        const { sendEmail, getNewMessageEmailHtml } = await import("@/lib/email")
        const html = getNewMessageEmailHtml(
          receiverInfo.name,
          senderName,
          senderRole,
          content.trim(),
          messageLink
        )
        await sendEmail({
          to: receiverInfo.email,
          subject: `New message from ${senderName} on JustBeCause`,
          html,
          text: `Hi ${receiverInfo.name}, ${senderName} sent you a message on JustBeCause Network: "${content.trim().substring(0, 100)}..." Log in to reply.`,
        })
        }
      }
    } catch (emailErr) {
      console.error("[sendMessage] Failed to send email notification:", emailErr)
    }
    
    // Revalidate message pages for both sender and receiver
    revalidatePath("/volunteer/messages")
    revalidatePath("/ngo/messages")
    revalidatePath(`/volunteer/messages/${conversationIdStr}`)
    revalidatePath(`/ngo/messages/${conversationIdStr}`)
    console.log(`[sendMessage] Revalidated paths for conversation ${conversationIdStr}`)
    
    return { success: true, data: messageId }
  } catch (error: any) {
    // Re-throw redirect errors (NEXT_REDIRECT) - they should not be caught
    if (isRedirectError(error)) {
      throw error
    }
    console.error("Error sending message:", error)
    return { success: false, error: "Failed to send message" }
  }
}

export async function startConversation(
  receiverId: string,
  projectId?: string,
  initialMessage?: string
): Promise<ApiResponse<string>> {
  try {
    const user = await requireAuth()
    
    console.log(`[startConversation] User ${user.id} starting conversation with ${receiverId}`)
    
    if (!receiverId) {
      return { success: false, error: "Recipient ID is required" }
    }
    
    // Find or create conversation
    const conversation = await conversationsDb.findOrCreate([user.id, receiverId], projectId)
    
    if (!conversation || !conversation._id) {
      console.error("[startConversation] Failed to create conversation")
      return { success: false, error: "Failed to create conversation" }
    }
    
    console.log(`[startConversation] Conversation created/found: ${conversation._id}`)
    
    // If initial message provided, send it (sendMessage handles email + notification)
    if (initialMessage?.trim()) {
      const msgResult = await sendMessage(receiverId, initialMessage, projectId)
      if (!msgResult.success) {
        console.error("[startConversation] Failed to send initial message:", msgResult.error)
      }
    }

    // Only send contact email if there's no initial message
    // (when there IS an initial message, sendMessage already sends the email)
    if (!initialMessage?.trim()) {
      try {
        const { sendEmail, getContactEmailHtml } = await import("@/lib/email")
        const db = await getDb()
        const senderUser = await db.collection("user").findOne(userIdQuery(user.id))
        const receiverUser = await db.collection("user").findOne(userIdQuery(receiverId))

        if (receiverUser?.email) {
          const senderName = senderUser?.orgName || senderUser?.name || "Someone"
          const senderRole = user.role || "volunteer"
          const receiverName = receiverUser.orgName || receiverUser.name || "there"
          const html = getContactEmailHtml(
            receiverName,
            senderName,
            senderRole
          )
          await sendEmail({
            to: receiverUser.email,
            subject: `${senderName} wants to connect with you on JustBeCause`,
            html,
            text: `Hi ${receiverName}, ${senderName} has reached out to you on JustBeCause Network. Log in to reply.`,
          })
        }
      } catch (emailError) {
        console.error("[startConversation] Failed to send connection email:", emailError)
      }
    }
    
    return { success: true, data: conversation._id!.toString() }
  } catch (error: any) {
    // Re-throw redirect errors (NEXT_REDIRECT) - they should not be caught
    if (isRedirectError(error)) {
      throw error
    }
    console.error("[startConversation] Error:", error)
    return { success: false, error: error.message || "Failed to start conversation" }
  }
}

/**
 * Start a conversation using GetStream (new messaging system).
 * Creates/gets a Stream channel and sends the initial message.
 */
export async function startStreamConversation(
  receiverId: string,
  projectId?: string,
  initialMessage?: string
): Promise<ApiResponse<string>> {
  try {
    const user = await requireAuth()
    
    console.log(`[startStreamConversation] User ${user.id} starting conversation with ${receiverId}`)
    
    if (!receiverId) {
      return { success: false, error: "Recipient ID is required" }
    }

    if (!initialMessage?.trim()) {
      return { success: false, error: "Initial message is required" }
    }

    // Get the DB to fetch user details
    const db = await getDb()
    const senderUser = await db.collection("user").findOne(userIdQuery(user.id))
    const receiverUser = await db.collection("user").findOne(userIdQuery(receiverId))

    if (!receiverUser) {
      return { success: false, error: "Recipient not found" }
    }

    // Ensure both users are upserted in Stream
    await generateStreamToken({
      id: user.id,
      name: senderUser?.orgName || senderUser?.name || "User",
      image: senderUser?.image || undefined,
      role: user.role || "volunteer",
    })

    await generateStreamToken({
      id: receiverId,
      name: receiverUser.orgName || receiverUser.name || "User",
      image: receiverUser.image || undefined,
      role: receiverUser.role || "volunteer",
    })

    // Create or get the Stream channel
    const channel = await getOrCreateChannel(user.id, receiverId, {
      projectId,
      projectTitle: projectId ? undefined : undefined, // Can be enhanced later
    })

    // Send the initial message
    await channel.sendMessage({
      text: initialMessage.trim(),
      user_id: user.id,
    })

    console.log(`[startStreamConversation] Message sent in channel ${channel.id}`)

    // Send email notification to receiver
    try {
      const { sendEmail, getContactEmailHtml } = await import("@/lib/email")
      if (receiverUser.email) {
        const senderName = senderUser?.orgName || senderUser?.name || "Someone"
        const receiverName = receiverUser.orgName || receiverUser.name || "there"
        const html = getContactEmailHtml(
          receiverName,
          senderName,
          user.role || "volunteer"
        )
        await sendEmail({
          to: receiverUser.email,
          subject: `${senderName} sent you a message on JustBeCause`,
          html,
          text: `Hi ${receiverName}, ${senderName} has sent you a message on JustBeCause Network. Log in to reply.`,
        })
      }
    } catch (emailError) {
      console.error("[startStreamConversation] Failed to send email:", emailError)
    }

    // Return the channel ID
    return { success: true, data: channel.id! }
  } catch (error: any) {
    // Re-throw redirect errors (NEXT_REDIRECT) - they should not be caught
    if (isRedirectError(error)) {
      throw error
    }
    console.error("[startStreamConversation] Error:", error)
    return { success: false, error: error.message || "Failed to start conversation" }
  }
}

export async function getUnreadMessageCount(): Promise<number> {
  const user = await getCurrentUser()
  if (!user) return 0
  return messagesDb.countUnread(user.id)
}

export async function getMyNotifications() {
  const user = await getCurrentUser()
  if (!user) return []
  
  const notifications = await notificationsDb.findByUserId(user.id)
  return serializeDocuments(notifications)
}

// ============================================
// PROFILE UNLOCKS & TRANSACTIONS
// ============================================

export async function getUnlockedProfiles() {
  // Deprecated: Profile unlocking replaced with subscription-based access
  return []
}

export async function getMyTransactions() {
  const user = await getCurrentUser()
  if (!user) return []
  
  const transactions = await transactionsDb.findByUserId(user.id)
  return serializeDocuments(transactions)
}

export async function getAllTransactions(page = 1, limit = 20) {
  const skip = (page - 1) * limit
  const [transactions, total] = await Promise.all([
    transactionsDb.findMany({}, { skip, limit, sort: { createdAt: -1 } }),
    transactionsDb.count({}),
  ])
  
  return {
    data: transactions,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}

export async function getPaymentStats() {
  const [totalRevenue, profileUnlockRevenue, totalTransactions, completedTransactions] = await Promise.all([
    transactionsDb.sumAmount({ paymentStatus: "completed" }),
    transactionsDb.sumAmount({ type: "profile_unlock", paymentStatus: "completed" }),
    transactionsDb.count({}),
    transactionsDb.count({ paymentStatus: "completed" }),
  ])
  
  return {
    totalRevenue,
    profileUnlockRevenue,
    totalTransactions,
    completedTransactions,
  }
}

// ============================================
// ACCOUNT MANAGEMENT
// ============================================

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ApiResponse<boolean>> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    // Validate new password
    if (newPassword.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" }
    }

    // Use Better Auth's change password API
    try {
      await auth.api.changePassword({
        body: {
          currentPassword,
          newPassword,
        },
        headers: await headers(),
      })
      return { success: true, data: true }
    } catch (authError: any) {
      // Handle specific error cases
      if (authError.message?.includes("incorrect")) {
        return { success: false, error: "Current password is incorrect" }
      }
      if (authError.message?.includes("OAuth")) {
        return { 
          success: false, 
          error: "Password change is only available for email/password accounts. OAuth users should manage passwords through their provider." 
        }
      }
      throw authError
    }
  } catch (error) {
    console.error("Change password error:", error)
    return { success: false, error: "Failed to change password. Please try again.May be due to you having created account via social login" }
  }
}

export async function deleteAccount(): Promise<ApiResponse<boolean>> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "Not authenticated" }
    }

    const db = await getDb()

    // Delete all user data
    await Promise.all([
      // Delete volunteer profile from volunteerProfiles collection
      db.collection("volunteerProfiles").deleteOne({ userId: user.id }),
      // Delete NGO profile from ngoProfiles collection
      db.collection("ngoProfiles").deleteOne({ userId: user.id }),
      // Delete user's projects (for NGOs)
      db.collection("projects").deleteMany({ ngoId: user.id }),
      // Delete user's applications (for volunteers)
      db.collection("applications").deleteMany({ volunteerId: user.id }),
      // Delete user's conversations
      db.collection("conversations").deleteMany({ participants: user.id }),
      // Delete user's messages
      db.collection("messages").deleteMany({ 
        $or: [{ senderId: user.id }, { receiverId: user.id }] 
      }),
      // Delete user's notifications
      db.collection("notifications").deleteMany({ userId: user.id }),
      // Delete profile unlocks related to user
      db.collection("profileUnlocks").deleteMany({ 
        $or: [{ ngoId: user.id }, { volunteerId: user.id }] 
      }),
      // Delete user's transactions
      db.collection("transactions").deleteMany({ userId: user.id }),
      // Finally, delete the user account (Better Auth stores _id as ObjectId)
      db.collection("user").deleteOne(userIdQuery(user.id)),
      db.collection("session").deleteMany({ userId: user.id }),
      db.collection("account").deleteMany({ userId: user.id }),
    ])

    return { success: true, data: true }
  } catch (error) {
    console.error("Delete account error:", error)
    return { success: false, error: "Failed to delete account" }
  }
}

// ============================================
// IMPACT METRICS
// ============================================

export async function getImpactMetrics() {
  try {
    const [volunteerCount, projectCount, ngoCount] = await Promise.all([
      volunteerProfilesDb.count({}),
      projectsDb.count({ status: "completed" }),
      ngoProfilesDb.count({}),
    ])

    // Calculate total hours from completed projects
    const completedProjects = await projectsDb.findMany({ status: "completed" })
    const totalHours = completedProjects.reduce((sum, p) => {
      // Parse timeCommitment like "10-15 hours" or "5 hours/week"
      const match = p.timeCommitment?.match(/(\d+)/)
      return sum + (match ? parseInt(match[1]) : 0)
    }, 0)

    // Estimated value at $50/hour for pro-bono work
    const estimatedValue = totalHours * 50

    return {
      volunteers: volunteerCount || 0,
      projectsCompleted: projectCount || 0,
      ngosSupported: ngoCount || 0,
      hoursContributed: totalHours || 0,
      valueGenerated: estimatedValue || 0,
    }
  } catch (error) {
    console.error("Failed to get impact metrics:", error)
    return {
      volunteers: 0,
      projectsCompleted: 0,
      ngosSupported: 0,
      hoursContributed: 0,
      valueGenerated: 0,
    }
  }
}

// ============================================
// INITIALIZATION
// ============================================

export async function initializePlatform(): Promise<void> {
  // Initialize subscription plans
  await subscriptionPlansDb.initializeDefaults()
  
  // Initialize admin settings with a system user
  await adminSettingsDb.initialize("system")
}

// ============================================
// NGO FOLLOW/UNFOLLOW
// ============================================

// ============================================
// FOLLOW SYSTEM (Professional)
// ============================================

/**
 * Follow any user (NGO or Impact Agent). Works for all authenticated users.
 */
export async function followUser(targetId: string): Promise<ApiResponse<{ followersCount: number }>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return { success: false, error: "You must be logged in to follow" }
    }

    if (session.user.id === targetId) {
      return { success: false, error: "You cannot follow yourself" }
    }

    const followerRole = (session.user as any).role || "volunteer"

    // Look up the target user to get their role (handles both ObjectId and Better Auth ID)
    const db = await getDb()
    const targetUser = await db.collection("user").findOne(userIdQuery(targetId))
    if (!targetUser) {
      return { success: false, error: "User not found" }
    }

    const created = await followsDb.follow(
      session.user.id,
      followerRole,
      targetId,
      targetUser.role || "volunteer"
    )

    if (!created) {
      return { success: false, error: "Already following this user" }
    }

    // Get updated follower count
    const followersCount = await followsDb.getFollowersCount(targetId)

    // Create notification for the person being followed
    const followerName = session.user.name || "Someone"
    const followerProfilePath = followerRole === "ngo" ? `/ngos/${session.user.id}` : `/volunteers/${session.user.id}`
    const targetRole = targetUser.role || "volunteer"
    const targetProfilePath = targetRole === "ngo" ? `/ngos/${targetId}` : `/volunteers/${targetId}`
    const targetName = targetRole === "ngo" ? (targetUser.orgName || targetUser.name || "there") : (targetUser.name || "there")
    await notificationsDb.create({
      userId: targetId,
      type: "new_follower",
      title: "New Follower",
      message: `${followerName} started following you`,
      referenceId: session.user.id,
      referenceType: "user",
      link: followerProfilePath,
      isRead: false,
      createdAt: new Date(),
    })

    // Send email notification to the person being followed (respects notification preferences)
    const targetPrefs = targetUser?.privacy
    if (targetUser.email && targetPrefs?.emailNotifications !== false) {
      try {
        const { sendEmail, getNewFollowerEmailHtml } = await import("@/lib/email")
        const html = getNewFollowerEmailHtml(
          targetName,
          followerName,
          followerRole,
          followerProfilePath,
          targetProfilePath,
          followersCount
        )
        await sendEmail({
          to: targetUser.email,
          subject: `${followerName} is now following you on JustBeCause!`,
          html,
          text: `Hi ${targetName}, ${followerName} just started following you on JustBeCause Network. You now have ${followersCount} follower${followersCount === 1 ? "" : "s"}. Visit your profile to see more.`,
        })
      } catch (err) {
        console.error("Failed to send follow email:", err)
      }
    }

    revalidatePath(`/ngos/${targetId}`)
    revalidatePath(`/volunteers/${targetId}`)
    return { success: true, data: { followersCount } }
  } catch (error) {
    console.error("Failed to follow user:", error)
    return { success: false, error: "Failed to follow" }
  }
}

/**
 * Unfollow any user.
 */
export async function unfollowUser(targetId: string): Promise<ApiResponse<{ followersCount: number }>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return { success: false, error: "You must be logged in" }
    }

    const removed = await followsDb.unfollow(session.user.id, targetId)
    if (!removed) {
      return { success: false, error: "You are not following this user" }
    }

    const followersCount = await followsDb.getFollowersCount(targetId)

    revalidatePath(`/ngos/${targetId}`)
    revalidatePath(`/volunteers/${targetId}`)
    return { success: true, data: { followersCount } }
  } catch (error) {
    console.error("Failed to unfollow user:", error)
    return { success: false, error: "Failed to unfollow" }
  }
}

/**
 * Get follow stats for a user (follower count, following count, isFollowing status).
 */
export async function getFollowStats(targetId: string): Promise<ApiResponse<{ followersCount: number; followingCount: number; isFollowing: boolean }>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    const viewerId = session?.user?.id
    const stats = await followsDb.getStats(targetId, viewerId)
    
    return {
      success: true,
      data: {
        followersCount: stats.followersCount,
        followingCount: stats.followingCount,
        isFollowing: stats.isFollowing,
      },
    }
  } catch (error) {
    console.error("Failed to get follow stats:", error)
    return { success: false, error: "Failed to get follow stats" }
  }
}

/**
 * Get paginated followers list with user details
 */
export async function getFollowersList(userId: string, page: number = 1, limit: number = 20): Promise<ApiResponse<{
  users: Array<{ id: string; name: string; avatar?: string; role: string; headline?: string }>
  total: number
  page: number
  totalPages: number
}>> {
  try {
    const { followers, total, totalPages } = await followsDb.getFollowers(userId, page, limit)
    
    if (followers.length === 0) {
      return { success: true, data: { users: [], total: 0, page, totalPages: 0 } }
    }

    // Batch fetch user details (handles both ObjectId and string IDs)
    const db = await getDb()
    const followerIds = followers.map(f => f.followerId)
    const users = await db.collection("user")
      .find(userIdBatchQuery(followerIds))
      .project({ _id: 1, id: 1, name: 1, image: 1, role: 1, bio: 1, orgName: 1, avatar: 1 })
      .toArray()

    const userMap = new Map<string, any>()
    for (const u of users) {
      if (u.id) userMap.set(u.id, u)
      if (u._id) userMap.set(u._id.toString(), u)
    }

    const enrichedUsers = followers.map(f => {
      const user = userMap.get(f.followerId)
      return {
        id: f.followerId,
        name: user?.role === "ngo" ? (user?.orgName || user?.name || "Unknown") : (user?.name || "Unknown"),
        avatar: user?.avatar || user?.image,
        role: f.followerRole,
        headline: user?.bio?.split("\n")[0]?.substring(0, 100),
      }
    })

    return { success: true, data: { users: enrichedUsers, total, page, totalPages } }
  } catch (error) {
    console.error("Failed to get followers:", error)
    return { success: false, error: "Failed to get followers" }
  }
}

/**
 * Get paginated following list with user details
 */
export async function getFollowingList(userId: string, page: number = 1, limit: number = 20): Promise<ApiResponse<{
  users: Array<{ id: string; name: string; avatar?: string; role: string; headline?: string }>
  total: number
  page: number
  totalPages: number
}>> {
  try {
    const { following, total, totalPages } = await followsDb.getFollowing(userId, page, limit)
    
    if (following.length === 0) {
      return { success: true, data: { users: [], total: 0, page, totalPages: 0 } }
    }

    // Batch fetch user details (handles both ObjectId and string IDs)
    const db = await getDb()
    const followingIds = following.map(f => f.followingId)
    const users = await db.collection("user")
      .find(userIdBatchQuery(followingIds))
      .project({ _id: 1, id: 1, name: 1, image: 1, role: 1, bio: 1, orgName: 1, avatar: 1 })
      .toArray()

    const userMap = new Map<string, any>()
    for (const u of users) {
      if (u.id) userMap.set(u.id, u)
      if (u._id) userMap.set(u._id.toString(), u)
    }

    const enrichedUsers = following.map(f => {
      const user = userMap.get(f.followingId)
      return {
        id: f.followingId,
        name: user?.role === "ngo" ? (user?.orgName || user?.name || "Unknown") : (user?.name || "Unknown"),
        avatar: user?.avatar || user?.image,
        role: f.followingRole,
        headline: user?.bio?.split("\n")[0]?.substring(0, 100),
      }
    })

    return { success: true, data: { users: enrichedUsers, total, page, totalPages } }
  } catch (error) {
    console.error("Failed to get following:", error)
    return { success: false, error: "Failed to get following" }
  }
}

// Legacy wrappers — keep backward compatibility
export async function followNgo(ngoId: string): Promise<ApiResponse<void>> {
  const result = await followUser(ngoId)
  return { success: result.success, error: result.error, data: undefined }
}

export async function unfollowNgo(ngoId: string): Promise<ApiResponse<void>> {
  const result = await unfollowUser(ngoId)
  return { success: result.success, error: result.error, data: undefined }
}

export async function isFollowingNgo(ngoId: string): Promise<boolean> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return false
    return followsDb.isFollowing(session.user.id, ngoId)
  } catch {
    return false
  }
}

// ============================================
// REVIEW & RATING SYSTEM
// ============================================

export async function submitReview(data: {
  revieweeId: string
  projectId: string
  overallRating: number
  communicationRating: number
  qualityRating: number
  timelinessRating: number
  title?: string
  comment: string
}): Promise<ApiResponse<any>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }

    const reviewerId = session.user.id

    // Check if already reviewed
    const existing = await reviewsDb.findExisting(reviewerId, data.revieweeId, data.projectId)
    if (existing) return { success: false, error: "You have already reviewed this user for this project" }

    // Verify the project exists and is completed
    const project = await projectsDb.findById(data.projectId)
    if (!project) return { success: false, error: "Project not found" }

    // Determine review type
    const reviewerProfile = await volunteerProfilesDb.findByUserId(reviewerId)
    const reviewType = reviewerProfile ? "volunteer_to_ngo" : "ngo_to_volunteer"

    const reviewId = await reviewsDb.create({
      reviewerId,
      revieweeId: data.revieweeId,
      reviewType,
      projectId: data.projectId,
      overallRating: data.overallRating,
      communicationRating: data.communicationRating,
      qualityRating: data.qualityRating,
      timelinessRating: data.timelinessRating,
      title: data.title,
      comment: data.comment,
      isPublic: true,
      isReported: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Update the reviewee's average rating
    const { average, count } = await reviewsDb.getAverageRating(data.revieweeId)
    if (reviewType === "ngo_to_volunteer") {
      await volunteerProfilesDb.update(data.revieweeId, { rating: average, totalRatings: count })
    }

    // Notify the reviewee
    await notificationsDb.create({
      userId: data.revieweeId,
      type: "new_review",
      title: "New Review Received",
      message: `You received a ${data.overallRating}-star review for "${project.title}"`,
      referenceId: data.projectId,
      referenceType: "project",
      link: `/projects/${data.projectId}`,
      isRead: false,
      createdAt: new Date(),
    })

    // Check badge: reviews_given
    await checkAndAwardBadges(reviewerId, "reviews_given")

    return { success: true, data: { reviewId } }
  } catch (error) {
    console.error("Failed to submit review:", error)
    return { success: false, error: "Failed to submit review" }
  }
}

export async function getReviewsForUser(userId: string): Promise<ApiResponse<any[]>> {
  try {
    const reviews = await reviewsDb.findByReviewee(userId)
    return { success: true, data: serializeDocuments(reviews) }
  } catch (error) {
    console.error("Failed to get reviews:", error)
    return { success: false, error: "Failed to get reviews" }
  }
}

export async function getReviewsForProject(projectId: string): Promise<ApiResponse<any[]>> {
  try {
    const reviews = await reviewsDb.findByProject(projectId)
    return { success: true, data: serializeDocuments(reviews) }
  } catch (error) {
    console.error("Failed to get reviews:", error)
    return { success: false, error: "Failed to get reviews" }
  }
}

// ============================================
// ENDORSEMENT SYSTEM
// ============================================

export async function endorseSkill(data: {
  endorseeId: string
  skillCategoryId: string
  skillSubskillId: string
}): Promise<ApiResponse<void>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }

    if (session.user.id === data.endorseeId) {
      return { success: false, error: "You cannot endorse your own skills" }
    }

    // Check if already endorsed this skill
    const existing = await endorsementsDb.findExisting(
      session.user.id, data.endorseeId, data.skillCategoryId, data.skillSubskillId
    )
    if (existing) return { success: false, error: "You have already endorsed this skill" }

    const userRole = (session.user as any).role || "volunteer"

    await endorsementsDb.create({
      endorserId: session.user.id,
      endorserName: session.user.name,
      endorserRole: userRole,
      endorseeId: data.endorseeId,
      skillCategoryId: data.skillCategoryId,
      skillSubskillId: data.skillSubskillId,
      createdAt: new Date(),
    })

    // Notify
    await notificationsDb.create({
      userId: data.endorseeId,
      type: "new_endorsement",
      title: "Skill Endorsed!",
      message: `${session.user.name} endorsed your skill`,
      isRead: false,
      createdAt: new Date(),
    })

    // Check badge: endorsements_received
    await checkAndAwardBadges(data.endorseeId, "endorsements_received")

    return { success: true }
  } catch (error) {
    console.error("Failed to endorse skill:", error)
    return { success: false, error: "Failed to endorse skill" }
  }
}

export async function removeEndorsement(data: {
  endorseeId: string
  skillCategoryId: string
  skillSubskillId: string
}): Promise<ApiResponse<void>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }

    await endorsementsDb.delete(session.user.id, data.endorseeId, data.skillCategoryId, data.skillSubskillId)
    return { success: true }
  } catch (error) {
    console.error("Failed to remove endorsement:", error)
    return { success: false, error: "Failed to remove endorsement" }
  }
}

export async function getEndorsementsForUser(userId: string): Promise<ApiResponse<Record<string, number>>> {
  try {
    const counts = await endorsementsDb.getSkillEndorsementCounts(userId)
    return { success: true, data: counts }
  } catch (error) {
    console.error("Failed to get endorsements:", error)
    return { success: false, error: "Failed to get endorsements" }
  }
}

export async function getEndorsementDetailsForUser(endorseeId: string): Promise<ApiResponse<{ counts: Record<string, number>, myEndorsedKeys: string[] }>> {
  try {
    const counts = await endorsementsDb.getSkillEndorsementCounts(endorseeId)
    const myEndorsedKeys: string[] = []

    const session = await auth.api.getSession({ headers: await headers() })
    if (session?.user) {
      const db = await getDb()
      const col = db.collection("endorsements")
      const myEndorsements = await col.find({ endorserId: session.user.id, endorseeId }).toArray()
      for (const e of myEndorsements) {
        myEndorsedKeys.push(`${(e as any).skillCategoryId}:${(e as any).skillSubskillId}`)
      }
    }

    return { success: true, data: { counts, myEndorsedKeys } }
  } catch (error) {
    console.error("Failed to get endorsement details:", error)
    return { success: false, error: "Failed to get endorsement details" }
  }
}

// ============================================
// GAMIFICATION: BADGE SYSTEM
// ============================================

export async function initializeBadges(): Promise<void> {
  await badgesDb.initializeDefaults()
}

export async function getUserBadges(userId: string): Promise<ApiResponse<any[]>> {
  try {
    const userBadges = await userBadgesDb.findByUserId(userId)
    const allBadges = await badgesDb.findAll()

    // Merge badge info with user's earned status
    const result = allBadges.map((badge) => {
      const earned = userBadges.find((ub) => ub.badgeId === badge.badgeId)
      return {
        ...serializeDocument(badge),
        earned: !!earned,
        earnedAt: earned?.earnedAt || null,
      }
    })

    return { success: true, data: result }
  } catch (error) {
    console.error("Failed to get user badges:", error)
    return { success: false, error: "Failed to get badges" }
  }
}

export async function checkAndAwardBadges(userId: string, triggerType: string): Promise<void> {
  try {
    const allBadges = await badgesDb.findAll()
    const relevantBadges = allBadges.filter((b) => b.criteria.type === triggerType)

    for (const badge of relevantBadges) {
      const alreadyEarned = await userBadgesDb.hasBadge(userId, badge.badgeId)
      if (alreadyEarned) continue

      let currentValue = 0

      switch (triggerType) {
        case "projects_completed": {
          const profile = await volunteerProfilesDb.findByUserId(userId)
          currentValue = profile?.completedProjects || 0
          break
        }
        case "hours_contributed": {
          const profile = await volunteerProfilesDb.findByUserId(userId)
          currentValue = profile?.hoursContributed || 0
          break
        }
        case "skills_count": {
          const profile = await volunteerProfilesDb.findByUserId(userId)
          currentValue = profile?.skills?.length || 0
          break
        }
        case "reviews_given": {
          const reviews = await reviewsDb.findByReviewer(userId)
          currentValue = reviews.length
          break
        }
        case "endorsements_received": {
          const endorsements = await endorsementsDb.findByEndorsee(userId)
          currentValue = endorsements.length
          break
        }
        case "referrals_completed": {
          currentValue = await referralsDb.countCompletedByReferrer(userId)
          break
        }
        case "average_rating": {
          const { average } = await reviewsDb.getAverageRating(userId)
          currentValue = average
          break
        }
      }

      if (currentValue >= badge.criteria.threshold) {
        await userBadgesDb.create({
          userId,
          badgeId: badge.badgeId,
          earnedAt: new Date(),
          triggerValue: currentValue,
        })

        // Notify user
        await notificationsDb.create({
          userId,
          type: "badge_earned",
          title: `Badge Earned: ${badge.name}!`,
          message: `${badge.icon} ${badge.description}`,
          isRead: false,
          createdAt: new Date(),
        })
      }
    }
  } catch (error) {
    console.error("Failed to check badges:", error)
  }
}

// ============================================
// MILESTONE CELEBRATIONS
// ============================================

const MILESTONES = {
  projects: [1, 5, 10, 25, 50, 100],
  hours: [10, 50, 100, 250, 500, 1000],
} as const

export async function checkAndCelebrateMilestones(
  userId: string,
  type: "projects" | "hours",
  currentValue: number
): Promise<void> {
  try {
    const thresholds = MILESTONES[type]
    // Find the highest milestone that was just crossed (currentValue >= threshold)
    // but only if we haven't already celebrated it (check notifications)
    const milestone = thresholds
      .filter((t) => currentValue >= t)
      .reverse()
      .find((t) => true) // Get the highest crossed threshold
    if (!milestone) return

    // Check if we already celebrated this milestone
    const db = await getDb()
    const existingNotification = await db.collection("notifications").findOne({
      userId,
      type: "milestone",
      title: { $regex: `Milestone: ${milestone} ${type === "projects" ? "Projects" : "Hours"}` },
    })
    if (existingNotification) return

    const profile = await volunteerProfilesDb.findByUserId(userId)
    if (!profile) return

    const label =
      type === "projects"
        ? `Projects Completed`
        : `Volunteer Hours Contributed`
    const nextMilestone = thresholds.find((t) => t > milestone)

    // Create notification
    await notificationsDb.create({
      userId,
      type: "milestone",
      title: `🎉 Milestone: ${milestone} ${type === "projects" ? "Projects" : "Hours"}!`,
      message: `You've reached ${milestone} ${label.toLowerCase()}! Keep up the amazing work.`,
      isRead: false,
      createdAt: new Date(),
    })

    // Send celebration email
    const { getMilestoneCelebrationEmailHtml } = await import("@/lib/email")
    const html = getMilestoneCelebrationEmailHtml(profile.name || "Volunteer", {
      type,
      value: milestone,
      label,
      nextMilestone,
    })

    await (await import("@/lib/email")).sendEmail({
      to: (profile as any).email || (await (await getDb()).collection("user").findOne(userIdQuery(userId)))?.email,
      subject: `🎉 Milestone Reached: ${milestone} ${type === "projects" ? "Projects" : "Hours"}!`,
      html,
    })
  } catch (error) {
    console.error("Failed to celebrate milestone:", error)
  }
}

// ============================================
// REFERRAL SYSTEM
// ============================================

export async function generateReferralCode(): Promise<ApiResponse<string>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }

    // Check if user already has a referral code
    const existing = await referralsDb.findByReferrerId(session.user.id)
    const existingCode = existing.find((r) => r.status === "pending" && !r.referredUserId)
    if (existingCode) return { success: true, data: existingCode.referralCode }

    const code = await referralsDb.generateUniqueCode()
    await referralsDb.create({
      referrerId: session.user.id,
      referralCode: code,
      status: "pending",
      rewardGranted: false,
      createdAt: new Date(),
    })

    return { success: true, data: code }
  } catch (error) {
    console.error("Failed to generate referral code:", error)
    return { success: false, error: "Failed to generate referral code" }
  }
}

export async function getReferralStats(): Promise<ApiResponse<any>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }

    const referrals = await referralsDb.findByReferrerId(session.user.id)
    const signedUp = referrals.filter((r) => r.status === "signed_up" || r.status === "completed").length
    const completed = referrals.filter((r) => r.status === "completed").length
    const codes = referrals.filter((r) => r.status === "pending").map((r) => r.referralCode)

    return {
      success: true,
      data: {
        totalReferrals: referrals.length,
        signedUp,
        completed,
        codes,
        referrals: serializeDocuments(referrals),
      },
    }
  } catch (error) {
    console.error("Failed to get referral stats:", error)
    return { success: false, error: "Failed to get referral stats" }
  }
}

export async function applyReferralCode(code: string): Promise<ApiResponse<void>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }

    const referral = await referralsDb.findByCode(code)
    if (!referral) return { success: false, error: "Invalid referral code" }
    if (referral.referrerId === session.user.id) return { success: false, error: "Cannot use your own referral code" }

    // Check if user was already referred
    const existingRef = await referralsDb.findByReferredUserId(session.user.id)
    if (existingRef) return { success: false, error: "You have already used a referral code" }

    await referralsDb.updateStatus(code, "signed_up", session.user.id)

    // Notify referrer
    await notificationsDb.create({
      userId: referral.referrerId,
      type: "referral_signup",
      title: "Referral Signed Up!",
      message: `Someone signed up using your referral code ${code}`,
      isRead: false,
      createdAt: new Date(),
    })

    return { success: true }
  } catch (error) {
    console.error("Failed to apply referral code:", error)
    return { success: false, error: "Failed to apply referral code" }
  }
}

// ============================================
// BLOG CMS
// ============================================

export async function createBlogPost(data: {
  title: string
  slug: string
  excerpt: string
  content: string
  coverImage?: string
  tags: string[]
  category: string
  status: "draft" | "published"
}): Promise<ApiResponse<any>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }
    if ((session.user as any).role !== "admin") return { success: false, error: "Admin only" }

    // Check slug uniqueness
    const existing = await blogPostsDb.findBySlug(data.slug)
    if (existing) return { success: false, error: "A post with this slug already exists" }

    const postId = await blogPostsDb.create({
      ...data,
      authorId: session.user.id,
      authorName: session.user.name,
      publishedAt: data.status === "published" ? new Date() : undefined,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    // Real-time ES sync for published posts
    if (data.status === "published") {
      try {
        const { syncSingleDocument } = await import("@/lib/es-sync")
        await syncSingleDocument("blogPosts", postId)
      } catch (syncErr) {
        console.error("[createBlogPost] ES sync failed (non-blocking):", syncErr)
      }
    }
    return { success: true, data: { postId } }
  } catch (error) {
    console.error("Failed to create blog post:", error)
    return { success: false, error: "Failed to create blog post" }
  }
}

export async function updateBlogPost(id: string, data: Partial<BlogPost>): Promise<ApiResponse<void>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }
    if ((session.user as any).role !== "admin") return { success: false, error: "Admin only" }

    if (data.status === "published" && !data.publishedAt) {
      data.publishedAt = new Date()
    }

    await blogPostsDb.update(id, data)
    // Sync to ES — if published, index it; if draft, this removes it (transformBlogPost returns null for non-published)
    try {
      const { syncSingleDocument } = await import("@/lib/es-sync")
      await syncSingleDocument("blogPosts", id)
    } catch (syncErr) {
      console.error("[updateBlogPost] ES sync failed (non-blocking):", syncErr)
    }
    return { success: true }
  } catch (error) {
    console.error("Failed to update blog post:", error)
    return { success: false, error: "Failed to update blog post" }
  }
}

export async function deleteBlogPost(id: string): Promise<ApiResponse<void>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }
    if ((session.user as any).role !== "admin") return { success: false, error: "Admin only" }

    await blogPostsDb.delete(id)
    // Remove from ES
    try {
      const { syncSingleDocument } = await import("@/lib/es-sync")
      await syncSingleDocument("blogPosts", id, "delete")
    } catch (syncErr) {
      console.error("[deleteBlogPost] ES sync failed (non-blocking):", syncErr)
    }
    return { success: true }
  } catch (error) {
    console.error("Failed to delete blog post:", error)
    return { success: false, error: "Failed to delete blog post" }
  }
}

export async function getPublishedBlogPosts(limit = 20, skip = 0): Promise<ApiResponse<any[]>> {
  try {
    const posts = await blogPostsDb.findPublished(limit, skip)
    return { success: true, data: serializeDocuments(posts) }
  } catch (error) {
    console.error("Failed to get blog posts:", error)
    return { success: false, error: "Failed to get blog posts" }
  }
}

export async function getBlogPostBySlug(slug: string): Promise<ApiResponse<any>> {
  try {
    const post = await blogPostsDb.findBySlug(slug)
    if (!post) return { success: false, error: "Post not found" }
    // Increment views
    await blogPostsDb.incrementViews(slug)
    return { success: true, data: serializeDocument(post) }
  } catch (error) {
    console.error("Failed to get blog post:", error)
    return { success: false, error: "Failed to get blog post" }
  }
}

export async function getAllBlogPosts(): Promise<ApiResponse<any[]>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }
    if ((session.user as any).role !== "admin") return { success: false, error: "Admin only" }

    const posts = await blogPostsDb.findAll()
    return { success: true, data: serializeDocuments(posts) }
  } catch (error) {
    console.error("Failed to get all blog posts:", error)
    return { success: false, error: "Failed to get all blog posts" }
  }
}

// ============================================
// ANALYTICS & PMF METRICS
// ============================================

export async function getPlatformAnalytics(): Promise<ApiResponse<any>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }
    if ((session.user as any).role !== "admin") return { success: false, error: "Admin only" }

    const db = await getDb()
    const userCollection = db.collection("user")

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      totalUsers,
      totalVolunteers,
      totalNGOs,
      totalProjects,
      activeProjects,
      completedProjects,
      totalApplications,
      acceptedApplications,
      newUsersLast30Days,
      newUsersLast7Days,
      totalReviews,
      totalReferrals,
      completedReferrals,
    ] = await Promise.all([
      userCollection.countDocuments(),
      userCollection.countDocuments({ role: "volunteer" }),
      userCollection.countDocuments({ role: "ngo" }),
      projectsDb.count({}),
      projectsDb.count({ status: "active" }),
      projectsDb.count({ status: "completed" }),
      applicationsDb.count({}),
      applicationsDb.count({ status: "accepted" }),
      userCollection.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      userCollection.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      reviewsDb.findAll().then((r) => r.length),
      getDb().then((db) => db.collection("referrals").countDocuments()),
      0, // Will be calculated below
    ])

    const acceptanceRate = totalApplications > 0 ? (acceptedApplications / totalApplications * 100).toFixed(1) : "0"

    return {
      success: true,
      data: {
        users: { total: totalUsers, volunteers: totalVolunteers, ngos: totalNGOs },
        growth: { last7Days: newUsersLast7Days, last30Days: newUsersLast30Days },
        projects: { total: totalProjects, active: activeProjects, completed: completedProjects },
        applications: { total: totalApplications, accepted: acceptedApplications, acceptanceRate },
        engagement: { reviews: totalReviews, referrals: totalReferrals },
      },
    }
  } catch (error) {
    console.error("Failed to get platform analytics:", error)
    return { success: false, error: "Failed to get platform analytics" }
  }
}

// ============================================
// PROJECT LIFECYCLE — MILESTONES & TIME LOGGING
// ============================================

export async function addProjectMilestone(
  projectId: string,
  milestone: { title: string; description?: string; dueDate?: string }
): Promise<ApiResponse<boolean>> {
  try {
    const user = await requireRole(["ngo", "admin"])
    const project = await projectsDb.findById(projectId)
    if (!project || (project.ngoId !== user.id && user.role !== "admin")) {
      return { success: false, error: "Not authorized" }
    }

    const milestones = project.milestones || []
    milestones.push({
      id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: milestone.title,
      description: milestone.description,
      dueDate: milestone.dueDate ? new Date(milestone.dueDate) : undefined,
      status: "pending",
    })

    await projectsDb.update(projectId, { milestones } as any)
    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: true }
  } catch (error) {
    return { success: false, error: "Failed to add milestone" }
  }
}

export async function updateProjectMilestone(
  projectId: string,
  milestoneId: string,
  updates: { status?: "pending" | "in_progress" | "completed"; title?: string; description?: string }
): Promise<ApiResponse<boolean>> {
  try {
    const user = await requireRole(["ngo", "admin"])
    const project = await projectsDb.findById(projectId)
    if (!project || (project.ngoId !== user.id && user.role !== "admin")) {
      return { success: false, error: "Not authorized" }
    }

    const milestones = (project.milestones || []).map((m: any) => {
      if (m.id === milestoneId) {
        return {
          ...m,
          ...updates,
          completedAt: updates.status === "completed" ? new Date() : m.completedAt,
        }
      }
      return m
    })

    await projectsDb.update(projectId, { milestones } as any)
    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: true }
  } catch (error) {
    return { success: false, error: "Failed to update milestone" }
  }
}

export async function logProjectHours(
  projectId: string,
  hours: number,
  description?: string
): Promise<ApiResponse<boolean>> {
  try {
    if (!hours || hours <= 0 || hours > 24) {
      return { success: false, error: "Hours must be between 0 and 24" }
    }

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return { success: false, error: "Not authenticated" }

    const project = await projectsDb.findById(projectId)
    if (!project) return { success: false, error: "Project not found" }

    // Only accepted volunteers or the NGO owner can log hours
    const isNGO = project.ngoId === session.user.id
    if (!isNGO) {
      const volunteerApps = await applicationsDb.findByVolunteerId(session.user.id)
      const acceptedApp = volunteerApps.find(a => a.projectId === projectId && a.status === "accepted")
      if (!acceptedApp) {
        return { success: false, error: "Only accepted volunteers can log hours" }
      }
    }

    const currentHours = (project as any).totalHoursLogged || 0
    await projectsDb.update(projectId, { totalHoursLogged: currentHours + hours } as any)

    // Also update volunteer's total hours
    if (!isNGO) {
      const profile = await volunteerProfilesDb.findByUserId(session.user.id)
      if (profile) {
        const newTotal = (profile.hoursContributed || 0) + hours
        await volunteerProfilesDb.update(session.user.id, { hoursContributed: newTotal } as any)
        await checkAndCelebrateMilestones(session.user.id, "hours", newTotal)
        await checkAndAwardBadges(session.user.id, "hours_contributed")
      }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: true }
  } catch (error) {
    return { success: false, error: "Failed to log hours" }
  }
}