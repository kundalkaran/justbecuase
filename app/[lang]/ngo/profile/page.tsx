"use client"

import type React from "react"
import { useState, useEffect } from "react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Camera, Save, Loader2, Building2, Globe, Users, ExternalLink, FileText, Upload, X, CheckCircle } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useDictionary } from "@/components/dictionary-provider"
import { getNGOProfile, updateNGOProfile } from "@/lib/actions"
import { skillCategories } from "@/lib/skills-data"
import { uploadToCloudinary, validateImageFile, uploadDocumentToCloudinary, validateDocumentFile } from "@/lib/upload"
import type { NGOProfile } from "@/lib/types"
import { Skeleton } from "@/components/ui/skeleton"
import { ImageCropper } from "@/components/ui/image-cropper"

const teamSizes = [
  "1-5",
  "6-10",
  "11-25",
  "26-50",
  "51-100",
  "100+",
]

const causes = [
  "Education",
  "Healthcare",
  "Environment",
  "Poverty Alleviation",
  "Women Empowerment",
  "Child Welfare",
  "Animal Welfare",
  "Disaster Relief",
  "Community Development",
  "Arts & Culture",
  "Human Rights",
  "Technology for Good",
]

export default function NGOProfilePage() {
  const router = useRouter()
  const locale = useLocale()
  const { user, isLoading: authLoading } = useAuth()
  const dict = useDictionary()
  const [profile, setProfile] = useState<NGOProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [verificationDocs, setVerificationDocs] = useState<Array<{ name: string; url: string; type: string }>>([])
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [cropperOpen, setCropperOpen] = useState(false)

  const [formData, setFormData] = useState({
    orgName: "",
    description: "",
    mission: "",
    website: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    contactPersonName: "",
    contactEmail: "",
    yearFounded: "",
    teamSize: "",
    registrationNumber: "",
    socialLinks: {
      facebook: "",
      twitter: "",
      instagram: "",
      linkedin: "",
    },
  })

  const [selectedCauses, setSelectedCauses] = useState<string[]>([])

  // Fetch profile data
  useEffect(() => {
    async function loadProfile() {
      if (!user) return
      
      try {
        const profileData = await getNGOProfile()
        if (profileData) {
          setProfile(profileData)
          setFormData({
            orgName: profileData.orgName || "",
            description: profileData.description || "",
            mission: profileData.mission || "",
            website: profileData.website || "",
            phone: profileData.phone || "",
            address: profileData.address || "",
            city: profileData.city || "",
            country: profileData.country || "",
            contactPersonName: profileData.contactPersonName || "",
            contactEmail: profileData.contactEmail || "",
            yearFounded: profileData.yearFounded || "",
            teamSize: profileData.teamSize || "",
            registrationNumber: profileData.registrationNumber || "",
            socialLinks: {
              facebook: profileData.socialLinks?.facebook || "",
              twitter: profileData.socialLinks?.twitter || "",
              instagram: profileData.socialLinks?.instagram || "",
              linkedin: profileData.socialLinks?.linkedin || "",
            },
          })
          setSelectedCauses(profileData.causes || [])
          setVerificationDocs(profileData.verificationDocuments || [])
        }
      } catch (err) {
        console.error("Failed to load profile:", err)
        setError("Failed to load profile")
      } finally {
        setIsLoading(false)
      }
    }

    if (!authLoading && user) {
      loadProfile()
    } else if (!authLoading && !user) {
      router.push(localePath("/auth/signin", locale))
    }
  }, [user, authLoading, router])

  // Calculate profile completion
  const calculateCompletion = () => {
    let completion = 20 // Base for having account
    if (formData.orgName) completion += 10
    if (formData.description && formData.description.length > 50) completion += 15
    if (formData.mission && formData.mission.length > 30) completion += 10
    if (formData.website) completion += 10
    if (formData.phone) completion += 5
    if (formData.address && formData.city) completion += 10
    if (selectedCauses.length > 0) completion += 10
    if (profile?.logo) completion += 10
    return Math.min(completion, 100)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleCroppedLogo = async (croppedBlob: Blob) => {
    setCropperOpen(false)
    setCropImageSrc(null)
    setUploadingLogo(true)
    toast.loading("Uploading logo...", { id: "logo-upload" })

    try {
      // Convert blob to File for the upload function
      const croppedFile = new File([croppedBlob], "logo.jpg", { type: "image/jpeg" })

      // Upload with signed request
      const uploadResult = await uploadToCloudinary(croppedFile, "ngo_logos", {
        onProgress: (percent) => {
          // Could show progress here if needed
        },
      })

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Upload failed")
      }

      const result = await updateNGOProfile({ logo: uploadResult.url })
      
      if (result.success) {
        setProfile((prev) => prev ? { ...prev, logo: uploadResult.url } : null)
        toast.success("Logo updated!", { id: "logo-upload" })
      } else {
        throw new Error(result.error || "Failed to save logo")
      }
    } catch (err: any) {
      console.error("Logo upload error:", err)
      toast.error("Upload failed", { 
        id: "logo-upload",
        description: err.message || "Please try again."
      })
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleVerificationDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploadingDoc(true)

    try {
      for (const file of Array.from(files)) {
        // Validate file
        const validation = validateDocumentFile(file, 10)
        if (!validation.valid) {
          toast.error("Invalid file", { description: validation.error })
          continue
        }

        // Upload to Cloudinary
        const result = await uploadDocumentToCloudinary(file, "ngo_verification_documents")

        if (!result.success) {
          toast.error("Upload failed", { description: result.error })
          continue
        }

        // Add to documents list
        const newDoc = {
          name: file.name,
          url: result.url!,
          type: file.type,
        }
        
        setVerificationDocs(prev => [...prev, newDoc])
        
        // Save to profile
        const updatedDocs = [...verificationDocs, newDoc]
        await updateNGOProfile({ verificationDocuments: updatedDocs })
        
        toast.success("Document uploaded successfully!")
      }
    } catch (err) {
      console.error("Document upload error:", err)
      toast.error("Failed to upload document")
    } finally {
      setUploadingDoc(false)
    }
  }

  const removeVerificationDoc = async (index: number) => {
    const updatedDocs = verificationDocs.filter((_, i) => i !== index)
    setVerificationDocs(updatedDocs)
    
    try {
      await updateNGOProfile({ verificationDocuments: updatedDocs })
      toast.success("Document removed")
    } catch (err) {
      toast.error("Failed to remove document")
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError("")

    try {
      const result = await updateNGOProfile({
        ...formData,
        causes: selectedCauses,
      })

      if (result.success) {
        toast.success("Profile saved successfully!", {
          description: "Your organization profile has been updated.",
          duration: 4000,
          action: {
            label: "View Profile",
            onClick: () => router.push(localePath(`/ngos/${profile?._id}`, locale)),
          },
        })
      } else {
        toast.error("Failed to save profile", {
          description: result.error || "Please try again.",
          duration: 4000,
        })
      }
    } catch (err) {
      console.error("Save error:", err)
      toast.error("Failed to save profile", {
        description: "An unexpected error occurred. Please try again.",
        duration: 4000,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const toggleCause = (cause: string) => {
    setSelectedCauses((prev) =>
      prev.includes(cause) ? prev.filter((c) => c !== cause) : [...prev, cause]
    )
  }

  if (authLoading || isLoading) {
    return (
      <main className="flex-1 p-6 lg:p-8 max-w-5xl">
        <div className="mb-8">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-8 w-12" />
            </div>
            <Skeleton className="h-2 w-full" />
          </CardContent>
        </Card>
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-28 rounded-md" />
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64 mt-1" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <Skeleton className="w-24 h-24 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-9 w-32 rounded-md" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
          </CardContent>
        </Card>
        <div className="mt-8 flex justify-end">
          <Skeleton className="h-11 w-36 rounded-md" />
        </div>
      </main>
    )
  }

  const completion = calculateCompletion()

  return (
    <main className="flex-1 p-6 lg:p-8 max-w-5xl">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">{dict.ngo?.profile?.title}</h1>
            <p className="text-muted-foreground">
              {dict.ngo?.profile?.subtitle}
            </p>
          </div>

          {/* Profile Completion */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-foreground">{dict.ngo?.profile?.profileCompletion}</h3>
                  <p className="text-sm text-muted-foreground">
                    {dict.ngo?.profile?.completeToAttract}
                  </p>
                </div>
                <span className="text-2xl font-bold text-primary">{completion}%</span>
              </div>
              <Progress value={completion} className="h-2" />
            </CardContent>
          </Card>

          {error && (
            <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg">
              {error}
            </div>
          )}



          <Tabs defaultValue="basic" className="space-y-6">
            <TabsList>
              <TabsTrigger value="basic">{dict.ngo?.profile?.basicInfo}</TabsTrigger>
              <TabsTrigger value="details">{dict.ngo?.profile?.organizationDetails}</TabsTrigger>
              <TabsTrigger value="causes">{dict.ngo?.profile?.causesFocus}</TabsTrigger>
              <TabsTrigger value="skills">{dict.ngo?.profile?.skillsNeeded}</TabsTrigger>
              <TabsTrigger value="social">{dict.ngo?.profile?.socialLinks}</TabsTrigger>
            </TabsList>

            {/* Basic Info Tab */}
            <TabsContent value="basic" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{dict.ngo?.profile?.organizationLogo}</CardTitle>
                  <CardDescription>
                    {dict.ngo?.profile?.uploadLogo}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-border">
                        {profile?.logo ? (
                          <img
                            src={profile.logo}
                            alt="Organization logo"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Building2 className="h-10 w-10 text-muted-foreground" />
                        )}
                      </div>
                      <label className="absolute -bottom-2 -right-2 p-2 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors">
                        <Camera className="h-4 w-4" />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                          disabled={uploadingLogo}
                        />
                      </label>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {dict.ngo?.profile?.clickCamera}
                      </p>
                      {uploadingLogo && (
                        <p className="text-sm text-primary flex items-center gap-2 mt-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {dict.ngo?.common?.uploading}
                        </p>
                      )}
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
                      onCropComplete={handleCroppedLogo}
                      aspectRatio={1}
                      title={dict.ngo?.profile?.adjustLogo || "Adjust Logo"}
                      description={dict.ngo?.profile?.dragToReposition || "Drag to reposition and resize the crop area"}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Verification Documents Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {dict.ngo?.profile?.verificationDocs}
                    {profile?.isVerified && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-200">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {dict.ngo?.common?.verified}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {dict.ngo?.profile?.uploadVerificationDesc}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Upload Button */}
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      multiple
                      onChange={handleVerificationDocUpload}
                      className="hidden"
                      id="verification-doc-upload"
                      disabled={uploadingDoc}
                    />
                    <label htmlFor="verification-doc-upload" className="cursor-pointer">
                      {uploadingDoc ? (
                        <>
                          <Loader2 className="h-8 w-8 mx-auto mb-2 text-primary animate-spin" />
                          <p className="text-sm text-muted-foreground">{dict.ngo?.common?.uploading}</p>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm font-medium text-foreground">{dict.ngo?.profile?.uploadDocuments}</p>
                          <p className="text-xs text-muted-foreground mt-1">{dict.ngo?.common?.fileTypes}</p>
                        </>
                      )}
                    </label>
                  </div>
                  
                  {/* Uploaded documents list */}
                  {verificationDocs.length > 0 && (
                    <div className="space-y-2">
                      {verificationDocs.map((doc, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <a 
                              href={doc.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm font-medium hover:underline text-primary truncate max-w-[200px]"
                            >
                              {doc.name}
                            </a>
                            <Badge variant="secondary" className="text-xs">
                              {doc.type.includes("pdf") ? "PDF" : doc.type.includes("word") || doc.type.includes("doc") ? "DOC" : "Image"}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVerificationDoc(index)}
                            className="text-destructive hover:text-destructive/80 h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {!profile?.isVerified && verificationDocs.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      {dict.ngo?.profile?.docsSubmittedReview}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{dict.ngo?.profile?.basicInformation}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="orgName">{dict.ngo?.profile?.orgNameLabel}</Label>
                      <Input
                        id="orgName"
                        value={formData.orgName}
                        onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
                        placeholder={dict.ngo?.profile?.orgNamePlaceholder}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="registrationNumber">{dict.ngo?.common?.registrationNumber}</Label>
                      <Input
                        id="registrationNumber"
                        value={formData.registrationNumber}
                        onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                        placeholder={dict.ngo?.profile?.regNumberPlaceholder}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">{dict.ngo?.profile?.aboutOrg}</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder={dict.ngo?.profile?.aboutPlaceholder}
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mission">{dict.ngo?.common?.missionStatement}</Label>
                    <Textarea
                      id="mission"
                      value={formData.mission}
                      onChange={(e) => setFormData({ ...formData, mission: e.target.value })}
                      placeholder={dict.ngo?.profile?.missionPlaceholder}
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Organization Details Tab */}
            <TabsContent value="details" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{dict.ngo?.common?.contactInformation}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contactPersonName">{dict.ngo?.profile?.contactPerson}</Label>
                      <Input
                        id="contactPersonName"
                        value={formData.contactPersonName}
                        onChange={(e) => setFormData({ ...formData, contactPersonName: e.target.value })}
                        placeholder={dict.ngo?.profile?.contactPersonPlaceholder}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactEmail">{dict.ngo?.common?.contactEmail}</Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                        placeholder="contact@organization.org"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">{dict.ngo?.common?.phoneNumber}</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">{dict.ngo?.common?.website}</Label>
                      <Input
                        id="website"
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                        placeholder="https://www.yourorg.org"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{dict.ngo?.profile?.locationDetails}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="address">{dict.ngo?.common?.address}</Label>
                    <Textarea
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder={dict.ngo?.profile?.addressPlaceholder}
                      rows={2}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">{dict.ngo?.common?.city}</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder={dict.ngo?.common?.city}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">{dict.ngo?.common?.country}</Label>
                      <Input
                        id="country"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        placeholder={dict.ngo?.common?.country}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="yearFounded">{dict.ngo?.common?.yearFounded}</Label>
                      <Input
                        id="yearFounded"
                        value={formData.yearFounded}
                        onChange={(e) => setFormData({ ...formData, yearFounded: e.target.value })}
                        placeholder="e.g., 2010"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="teamSize">{dict.ngo?.common?.teamSize}</Label>
                      <Select
                        value={formData.teamSize}
                        onValueChange={(value) => setFormData({ ...formData, teamSize: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={dict.ngo?.profile?.selectTeamSize} />
                        </SelectTrigger>
                        <SelectContent>
                          {teamSizes.map((size) => (
                            <SelectItem key={size} value={size}>
                              {size} {dict.ngo?.profile?.people}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Causes Tab */}
            <TabsContent value="causes" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{dict.ngo?.profile?.focusAreas}</CardTitle>
                  <CardDescription>
                    {dict.ngo?.profile?.selectCauses}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {causes.map((cause) => (
                      <Badge
                        key={cause}
                        variant={selectedCauses.includes(cause) ? "default" : "outline"}
                        className="cursor-pointer text-sm py-2 px-4"
                        onClick={() => toggleCause(cause)}
                      >
                        {cause}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    {(dict.ngo?.profile?.selectedCauses || "Selected: {n} cause(s)").replace("{n}", String(selectedCauses.length))}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Skills Needed Tab */}
            <TabsContent value="skills" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{dict.ngo?.profile?.skillsTypicallyNeed}</CardTitle>
                  <CardDescription>
                    {dict.ngo?.profile?.skillsSetDuringOnboarding}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Label>{dict.ngo?.profile?.yourRequiredSkills}</Label>
                    <div className="flex flex-wrap gap-2">
                      {profile?.typicalSkillsNeeded && profile.typicalSkillsNeeded.length > 0 ? (
                        profile.typicalSkillsNeeded.map((skill: any, index: number) => {
                          const category = skillCategories.find((c: any) => c.id === skill.categoryId)
                          const subskill = category?.subskills.find((s: any) => s.id === skill.subskillId)
                          return (
                            <Badge 
                              key={index} 
                              className={skill.priority === "must-have" 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-secondary text-secondary-foreground"}
                            >
                              {subskill?.name || skill.subskillId}
                              {skill.priority === "must-have" && ` (${dict.ngo?.common?.mustHave})`}
                            </Badge>
                          )
                        })
                      ) : (
                        <p className="text-muted-foreground">{dict.ngo?.profile?.noSkillsSpecified}</p>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-4">
                      {dict.ngo?.profile?.updateSkillsInSettings}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Social Links Tab */}
            <TabsContent value="social" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{dict.ngo?.profile?.socialMediaLinks}</CardTitle>
                  <CardDescription>
                    {dict.ngo?.profile?.addSocialProfiles}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="facebook">{dict.ngo?.common?.facebook}</Label>
                      <Input
                        id="facebook"
                        value={formData.socialLinks.facebook}
                        onChange={(e) => setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, facebook: e.target.value }
                        })}
                        placeholder="https://facebook.com/yourorg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="twitter">{dict.ngo?.common?.twitterX}</Label>
                      <Input
                        id="twitter"
                        value={formData.socialLinks.twitter}
                        onChange={(e) => setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, twitter: e.target.value }
                        })}
                        placeholder="https://twitter.com/yourorg"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="instagram">{dict.ngo?.common?.instagram}</Label>
                      <Input
                        id="instagram"
                        value={formData.socialLinks.instagram}
                        onChange={(e) => setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, instagram: e.target.value }
                        })}
                        placeholder="https://instagram.com/yourorg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="linkedin">{dict.ngo?.common?.linkedin}</Label>
                      <Input
                        id="linkedin"
                        value={formData.socialLinks.linkedin}
                        onChange={(e) => setFormData({
                          ...formData,
                          socialLinks: { ...formData.socialLinks, linkedin: e.target.value }
                        })}
                        placeholder="https://linkedin.com/company/yourorg"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Button */}
          <div className="mt-8 flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} size="lg">
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {dict.ngo?.common?.saving}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {dict.ngo?.profile?.saveProfile}
                </>
              )}
            </Button>
          </div>
    </main>
  )
}
