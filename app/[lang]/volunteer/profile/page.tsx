"use client"

import type React from "react"
import { useState, useEffect } from "react"
import LocaleLink from "@/components/locale-link"
import { useRouter } from "next/navigation"
import { useLocale, localePath } from "@/hooks/use-locale"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Camera, Save, Loader2, CheckCircle, MapPin, FileText, Upload, X } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { getVolunteerProfile, updateVolunteerProfile } from "@/lib/actions"
import { skillCategories } from "@/lib/skills-data"
import { uploadToCloudinary, validateImageFile, uploadDocumentToCloudinary, validateDocumentFile } from "@/lib/upload"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AIBioGenerator } from "@/components/ai/bio-generator"
import { VolunteerProfileSkeleton } from "@/components/ui/page-skeletons"
import { ImageCropper } from "@/components/ui/image-cropper"
import { useDictionary } from "@/components/dictionary-provider"

export default function VolunteerProfileEditPage() {
  const router = useRouter()
  const locale = useLocale()
  const dict = useDictionary()
  const { data: session, isPending } = authClient.useSession()
  const [profile, setProfile] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [error, setError] = useState("")
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingResume, setUploadingResume] = useState(false)
  const [isGettingLocation, setIsGettingLocation] = useState(false)
  const [cropperOpen, setCropperOpen] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: "",
    headline: "",
    bio: "",
    location: "",
    phone: "",
    linkedinUrl: "",
    portfolioUrl: "",
    hoursPerWeek: "5-10",
    workMode: "remote" as "remote" , //| "onsite" | "hybrid",
  })

  // Get location using browser geolocation + Nominatim (OpenStreetMap) — state/region level
  const getGoogleLocation = async () => {
    setIsGettingLocation(true)
    setError("")
    
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser")
      setIsGettingLocation(false)
      return
    }
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=5&addressdetails=1`,
            {
              headers: {
                'User-Agent': 'JustBecauseNetwork/1.0',
                'Accept-Language': 'en-US,en;q=0.9',
              },
            }
          )
          
          if (!response.ok) throw new Error('Geocoding failed')
          const data = await response.json()
          
          const state = data.address?.state || data.address?.region || data.address?.state_district
          const country = data.address?.country
          const locationParts = [state, country].filter(Boolean)
          
          if (locationParts.length > 0) {
            setFormData(prev => ({ ...prev, location: locationParts.join(", ") }))
            toast.success("Location updated!")
          } else {
            setError("Could not determine your region. Please enter manually.")
          }
        } catch (err) {
          console.error('Nominatim geocoding error:', err)
          setError("Failed to get location details")
        } finally {
          setIsGettingLocation(false)
        }
      },
      (error) => {
        let errorMessage = "Unable to get your location."
        if (error.code === 1) errorMessage = "Location permission denied."
        else if (error.code === 2) errorMessage = "Location unavailable."
        else if (error.code === 3) errorMessage = "Location request timed out."
        setError(errorMessage)
        setIsGettingLocation(false)
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
    )
  }

  // Fetch profile data
  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) return
      
      try {
        const profileData = await getVolunteerProfile()
        if (profileData) {
          setProfile(profileData)
          setFormData({
            name: profileData.name || session.user.name || "",
            headline: profileData.headline || "",
            bio: profileData.bio || "",
            location: profileData.location || "",
            phone: profileData.phone || "",
            linkedinUrl: profileData.linkedinUrl || "",
            portfolioUrl: profileData.portfolioUrl || "",
            hoursPerWeek: profileData.hoursPerWeek || "5-10",
            workMode: profileData.workMode || "remote",
          })
        }
      } catch (err) {
        console.error("Failed to load profile:", err)
        setError("Failed to load profile")
      } finally {
        setIsLoading(false)
      }
    }

    if (!isPending && session?.user) {
      loadProfile()
    } else if (!isPending && !session?.user) {
      router.push(localePath("/auth/signin", locale))
    }
  }, [session, isPending, router])

  // Calculate profile completion
  const calculateCompletion = () => {
    let completion = 20 // Base for having account
    if (formData.phone) completion += 10
    if (formData.location) completion += 10
    if (formData.bio && formData.bio.length > 50) completion += 20
    if (profile?.skills?.length > 0) completion += 20
    if (profile?.causes?.length > 0) completion += 10
    if (formData.linkedinUrl || formData.portfolioUrl) completion += 10
    return Math.min(completion, 100)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    const validation = validateImageFile(file)
    if (!validation.valid) {
      toast.error("Invalid file", { description: validation.error })
      return
    }

    // Create a preview URL and open the cropper
    const reader = new FileReader()
    reader.onload = () => {
      setCropImageSrc(reader.result as string)
      setCropperOpen(true)
    }
    reader.readAsDataURL(file)
    // Reset the input so the same file can be re-selected
    e.target.value = ""
  }

  const handleCroppedPhoto = async (croppedBlob: Blob) => {
    setCropperOpen(false)
    setCropImageSrc(null)
    setUploadingPhoto(true)
    toast.loading("Uploading photo...", { id: "photo-upload" })

    try {
      // Convert blob to File for the upload function
      const croppedFile = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" })

      // Upload with signed request
      const uploadResult = await uploadToCloudinary(croppedFile, "volunteer_avatars", {
        onProgress: (percent) => {
          // Could show progress here if needed
        },
      })

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Upload failed")
      }

      // Update profile with new avatar URL
      const result = await updateVolunteerProfile({ avatar: uploadResult.url })
      
      if (result.success) {
        setProfile((prev: any) => ({ ...prev, avatar: uploadResult.url }))
        toast.success("Photo updated!", { id: "photo-upload" })
      } else {
        throw new Error(result.error || "Failed to save avatar")
      }
    } catch (err: any) {
      console.error("Photo upload error:", err)
      toast.error("Upload failed", { 
        id: "photo-upload",
        description: err.message || "Please try again."
      })
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    const validation = validateDocumentFile(file, 10)
    if (!validation.valid) {
      toast.error("Invalid file", { description: validation.error })
      return
    }

    setUploadingResume(true)
    toast.loading("Uploading resume...", { id: "resume-upload" })

    try {
      // Upload with signed request
      const uploadResult = await uploadDocumentToCloudinary(file, "volunteer_resumes", {
        onProgress: (percent) => {
          // Could show progress here if needed
        },
      })

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Upload failed")
      }

      // Update profile with new resume URL
      const result = await updateVolunteerProfile({ resumeUrl: uploadResult.url })
      
      if (result.success) {
        setProfile((prev: any) => ({ ...prev, resumeUrl: uploadResult.url }))
        toast.success("Resume uploaded!", { id: "resume-upload" })
      } else {
        throw new Error(result.error || "Failed to save resume")
      }
    } catch (err: any) {
      console.error("Resume upload error:", err)
      toast.error("Upload failed", { 
        id: "resume-upload",
        description: err.message || "Please try again."
      })
    } finally {
      setUploadingResume(false)
    }
  }

  const removeResume = async () => {
    try {
      const result = await updateVolunteerProfile({ resumeUrl: "" })
      if (result.success) {
        setProfile((prev: any) => ({ ...prev, resumeUrl: null }))
        toast.success("Resume removed")
      }
    } catch (err) {
      toast.error("Failed to remove resume")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError("")

    try {
      const result = await updateVolunteerProfile({
        name: formData.name,
        headline: formData.headline,
        bio: formData.bio,
        location: formData.location,
        phone: formData.phone,
        linkedinUrl: formData.linkedinUrl,
        portfolioUrl: formData.portfolioUrl,
        hoursPerWeek: formData.hoursPerWeek,
        workMode: formData.workMode,
      })

      if (!result.success) {
        throw new Error(result.error || "Failed to save profile")
      }

      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 3000)
    } catch (err: any) {
      setError(err.message || "Failed to save profile")
    } finally {
      setIsSaving(false)
    }
  }

  if (isPending || isLoading) {
    return <VolunteerProfileSkeleton />
  }

  if (!session?.user) {
    return null
  }

  const profileCompletion = calculateCompletion()
  const userName = formData.name || session.user.name || "Impact Agent"
  const userAvatar = profile?.avatar || session.user.image || undefined

  return (
    <main className="flex-1 p-6 lg:p-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-foreground mb-2">{dict.volunteer?.profile?.title || "Edit Profile"}</h1>
                <p className="text-muted-foreground">{dict.volunteer?.profile?.subtitle || "Update your information to help NGOs find you"}</p>
              </div>
              <Button asChild variant="outline" className="bg-transparent">
                <LocaleLink href={`/volunteers/${session.user.id}`}>{dict.volunteer?.profile?.viewPublicProfile || "View Public Profile"}</LocaleLink>
              </Button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Profile Completion */}
            <Card className="mb-8">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">{dict.volunteer?.common?.profileCompletion || "Profile Completion"}</span>
                  <span className="text-sm font-medium text-primary">{profileCompletion}%</span>
                </div>
                <Progress value={profileCompletion} className="h-2 mb-4" />
                <p className="text-sm text-muted-foreground">
                  {dict.volunteer?.profile?.completionHint || "Complete your profile to increase your chances of being matched with projects."}
                </p>
              </CardContent>
            </Card>

            <form onSubmit={handleSubmit}>
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="mb-6">
                  <TabsTrigger value="basic">{dict.volunteer?.profile?.tabBasicInfo || "Basic Info"}</TabsTrigger>
                  <TabsTrigger value="skills">{dict.volunteer?.profile?.tabSkills || "Skills & Experience"}</TabsTrigger>
                  <TabsTrigger value="preferences">{dict.volunteer?.profile?.tabPreferences || "Preferences"}</TabsTrigger>
                </TabsList>

                <TabsContent value="basic">
                  <Card>
                    <CardHeader>
                      <CardTitle>{dict.volunteer?.profile?.basicInfoTitle || "Basic Information"}</CardTitle>
                      <CardDescription>{dict.volunteer?.profile?.basicInfoDesc || "Your personal details and bio"}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Avatar */}
                      <div className="flex items-center gap-6">
                        <div className="relative">
                          <img
                            src={userAvatar || "/placeholder.svg?height=96&width=96"}
                            alt={userName}
                            className="w-24 h-24 rounded-full object-cover"
                          />
                          <label
                            htmlFor="avatar-upload"
                            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 cursor-pointer"
                          >
                            {uploadingPhoto ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Camera className="h-4 w-4" />
                            )}
                          </label>
                          <input
                            id="avatar-upload"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handlePhotoUpload}
                            disabled={uploadingPhoto}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{dict.volunteer?.profile?.profilePhoto || "Profile Photo"}</p>
                          <p className="text-sm text-muted-foreground">{dict.volunteer?.profile?.photoHint || "JPG or PNG. Max 5MB."}</p>
                        </div>
                      </div>

                      {/* Image Cropper Dialog */}
                      {cropImageSrc && (
                        <ImageCropper
                          open={cropperOpen}
                          onClose={() => {
                            setCropperOpen(false)
                            setCropImageSrc(null)
                          }}
                          imageSrc={cropImageSrc}
                          onCropComplete={handleCroppedPhoto}
                          aspectRatio={1}
                          title={dict.volunteer?.profile?.adjustPhoto || "Adjust Photo"}
                          description={dict.volunteer?.profile?.cropDescription || "Drag to reposition and resize the crop area"}
                        />
                      )}

                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">{dict.volunteer?.common?.fullName || "Full Name"}</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">{dict.volunteer?.common?.phoneNumber || "Phone Number"}</Label>
                          <Input
                            id="phone"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="+91 98765 43210"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="location">{dict.volunteer?.common?.location || "Location"}</Label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="location"
                            value={formData.location}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                            placeholder="City, State, Country"
                            className="pl-10"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {dict.volunteer?.profile?.locationHint || "Your location helps match you with nearby opportunities"}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="headline">{dict.volunteer?.profile?.headline || "Professional Headline"}</Label>
                        <Input
                          id="headline"
                          value={formData.headline}
                          onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                          placeholder="e.g. Senior Web Developer · 8+ years · WordPress & React specialist"
                          maxLength={120}
                        />
                        <p className="text-xs text-muted-foreground">
                          {dict.volunteer?.profile?.headlineHint || "A short tagline that appears in search results. Include your top skill and experience."}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="bio">{dict.volunteer?.common?.bio || "Bio"}</Label>
                        <Textarea
                          id="bio"
                          value={formData.bio}
                          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                          rows={4}
                          placeholder="Describe your experience, years of expertise, what kind of projects you enjoy. E.g. '10+ years of web development experience specializing in WordPress sites for non-profits...'"
                        />
                        <AIBioGenerator
                          name={formData.name}
                          skills={profile?.skills || []}
                          causes={profile?.causes || []}
                          completedProjects={profile?.completedProjects}
                          hoursContributed={profile?.hoursContributed}
                          location={formData.location}
                          currentBio={formData.bio}
                          onGenerated={(bio) => setFormData({ ...formData, bio })}
                        />
                        <p className="text-xs text-muted-foreground">
                          <strong>Tip:</strong> {dict.volunteer?.profile?.bioTip || "Mention your years of experience, specialties, and preferred project types — NGOs search for these details!"}
                        </p>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="linkedin">{dict.volunteer?.common?.linkedinUrl || "LinkedIn URL"}</Label>
                          <Input
                            id="linkedin"
                            type="url"
                            value={formData.linkedinUrl}
                            onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                            placeholder="https://linkedin.com/in/yourprofile"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="portfolio">{dict.volunteer?.common?.portfolioUrl || "Portfolio URL"}</Label>
                          <Input
                            id="portfolio"
                            type="url"
                            value={formData.portfolioUrl}
                            onChange={(e) => setFormData({ ...formData, portfolioUrl: e.target.value })}
                            placeholder="https://yourportfolio.com"
                          />
                        </div>
                      </div>

                      {/* Resume Upload Section */}
                      <div className="space-y-3 pt-4 border-t">
                        <Label>{dict.volunteer?.profile?.resumeCv || "Resume / CV"}</Label>
                        <p className="text-sm text-muted-foreground">
                          {dict.volunteer?.profile?.resumeHint || "Upload your resume to help NGOs understand your experience (PDF, DOC, DOCX - max 10MB)"}
                        </p>
                        
                        {profile?.resumeUrl ? (
                          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <div className="flex items-center gap-2">
                              <FileText className="h-5 w-5 text-primary" />
                              <div>
                                <a 
                                  href={profile.resumeUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium hover:underline text-primary"
                                >
                                  {dict.volunteer?.profile?.viewResume || "View Resume"}
                                </a>
                                <p className="text-xs text-muted-foreground">{dict.volunteer?.profile?.resumeClickHint || "Click to download or view"}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="cursor-pointer">
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx"
                                  onChange={handleResumeUpload}
                                  className="hidden"
                                  disabled={uploadingResume}
                                />
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  size="sm"
                                  asChild
                                  disabled={uploadingResume}
                                >
                                  <span>
                                    {uploadingResume ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      (dict.volunteer?.common?.replace || "Replace")
                                    )}
                                  </span>
                                </Button>
                              </label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={removeResume}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx"
                              onChange={handleResumeUpload}
                              className="hidden"
                              id="resume-upload"
                              disabled={uploadingResume}
                            />
                            <label htmlFor="resume-upload" className="cursor-pointer">
                              {uploadingResume ? (
                                <>
                                  <Loader2 className="h-8 w-8 mx-auto mb-2 text-primary animate-spin" />
                                  <p className="text-sm text-muted-foreground">{dict.volunteer?.common?.uploading || "Uploading..."}</p>
                                </>
                              ) : (
                                <>
                                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                  <p className="text-sm font-medium text-foreground">{dict.volunteer?.profile?.uploadResume || "Upload Resume"}</p>
                                  <p className="text-xs text-muted-foreground mt-1">{dict.volunteer?.profile?.resumeFileTypes || "PDF, DOC, or DOCX up to 10MB"}</p>
                                </>
                              )}
                            </label>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="skills">
                  <Card>
                    <CardHeader>
                      <CardTitle>{dict.volunteer?.profile?.skillsTitle || "Skills & Expertise"}</CardTitle>
                      <CardDescription>{dict.volunteer?.profile?.skillsDesc || "Your skills were set during onboarding."}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <Label>{dict.volunteer?.profile?.currentSkills || "Your Current Skills"}</Label>
                        <div className="flex flex-wrap gap-2">
                          {profile?.skills?.length > 0 ? (
                            profile.skills.map((skill: any, index: number) => {
                              const category = skillCategories.find((c: any) => c.id === skill.categoryId)
                              const subskill = category?.subskills.find((s: any) => s.id === skill.subskillId)
                              return (
                                <Badge key={index} className="bg-primary text-primary-foreground">
                                  {subskill?.name || skill.subskillId} ({skill.level})
                                </Badge>
                              )
                            })
                          ) : (
                            <p className="text-muted-foreground">{dict.volunteer?.profile?.noSkills || "No skills added yet. Complete onboarding to add skills."}</p>
                          )}
                        </div>
                        <Button variant="outline" asChild className="mt-4">
                          <LocaleLink href="/volunteer/settings">{dict.volunteer?.profile?.manageSkillsLink || "Manage Skills in Settings"}</LocaleLink>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="preferences">
                  <Card>
                    <CardHeader>
                      <CardTitle>{dict.volunteer?.profile?.preferencesTitle || "Impact Preferences"}</CardTitle>
                      <CardDescription>{dict.volunteer?.profile?.preferencesDesc || "Set your availability and preferences"}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="availability">{dict.volunteer?.profile?.weeklyAvailability || "Weekly Availability"}</Label>
                        <Select
                          value={formData.hoursPerWeek}
                          onValueChange={(value) => setFormData({ ...formData, hoursPerWeek: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1-5">{dict.volunteer?.common?.hours1to5 || "1-5 hours per week"}</SelectItem>
                            <SelectItem value="5-10">{dict.volunteer?.common?.hours5to10 || "5-10 hours per week"}</SelectItem>
                            <SelectItem value="10-20">{dict.volunteer?.common?.hours10to20 || "10-20 hours per week"}</SelectItem>
                            <SelectItem value="20+">{dict.volunteer?.common?.hours20plus || "20+ hours per week"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>{dict.volunteer?.profile?.yourCauses || "Your Causes"}</Label>
                        <div className="flex flex-wrap gap-2">
                          {profile?.causes?.length > 0 ? (
                            profile.causes.map((cause: string) => (
                              <Badge key={cause} variant="secondary">
                                {cause}
                              </Badge>
                            ))
                          ) : (
                            <p className="text-muted-foreground">{dict.volunteer?.profile?.noCauses || "No causes selected."}</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>{dict.volunteer?.common?.workMode || "Work Mode"}</Label>
                        <Select
                          value={formData.workMode}
                          onValueChange={(value) => setFormData({ ...formData, workMode: value as "remote" })} //| "onsite" | "hybrid" })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="remote">{dict.volunteer?.common?.remote || "Remote"}</SelectItem>
                            {/*
                            <SelectItem value="onsite">{dict.volunteer?.common?.onSite || "On-site"}</SelectItem>
                            <SelectItem value="hybrid">{dict.volunteer?.common?.hybrid || "Hybrid"}</SelectItem>
                            */}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>{dict.volunteer?.common?.impactAgentType || "Impact Agent Type"}</Label>
                        <Badge variant="secondary" className="capitalize">
                          {profile?.volunteerType === "free" ? (dict.volunteer?.common?.proBonoOnly || "Pro-Bono Only") : 
                           profile?.volunteerType === "paid" ? (dict.volunteer?.common?.paidOnly || "Paid Only") : 
                           profile?.volunteerType === "both" ? (dict.volunteer?.common?.openToBoth || "Open to Both") : (dict.volunteer?.common?.notSet || "Not set")}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Save Button */}
              <div className="flex justify-end mt-8">
                <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {dict.volunteer?.common?.saving || "Saving..."}
                    </>
                  ) : isSaved ? (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      {dict.volunteer?.common?.saved || "Saved!"}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {dict.volunteer?.common?.saveChanges || "Save Changes"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
    </main>
  )
}
