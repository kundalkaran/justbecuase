"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLocale, localePath } from "@/hooks/use-locale"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { authClient } from "@/lib/auth-client"
import { getVolunteerProfile, updateVolunteerProfile, changePassword, deleteAccount } from "@/lib/actions"
import { skillCategories, causes as causesList } from "@/lib/skills-data"
import type { VolunteerSkill, ExperienceLevel } from "@/lib/types"
import { toast } from "sonner"
import { useDictionary } from "@/components/dictionary-provider"
import { NotificationPermissionButton } from "@/components/notifications/notification-listener"
import { AISkillSuggestions } from "@/components/ai/skill-suggestions"
import { getCurrencySymbol } from "@/lib/currency"
import { SettingsPageSkeleton } from "@/components/ui/page-skeletons"
import {
  User,
  Bell,
  CreditCard,
  Globe,
  Lock,
  Eye,
  Trash2,
  Download,
  Loader2,
  Save,
  CheckCircle,
  AlertCircle,
  X,
  Plus,
  Sparkles,
  BellRing,
  Clock,
} from "lucide-react"

interface SkillWithName extends VolunteerSkill {
  name?: string
}

interface PrivacySettings {
  showProfile: boolean
  showInSearch: boolean
  emailNotifications: boolean
  applicationNotifications: boolean
  messageNotifications: boolean
  opportunityDigest: boolean
}

export default function VolunteerSettingsPage() {
  const router = useRouter()
  const locale = useLocale()
  const dict = useDictionary()
  const { data: session, isPending } = authClient.useSession()
  const [profile, setProfile] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pricingErrors, setPricingErrors] = useState<Record<string, string>>({})
  
  // Skills state
  const [skills, setSkills] = useState<SkillWithName[]>([])
  const [causes, setCauses] = useState<string[]>([])
  const [addingSkill, setAddingSkill] = useState(false)
  const [newSkill, setNewSkill] = useState({
    categoryId: "",
    subskillId: "",
    level: "intermediate" as ExperienceLevel,
  })
  
  // Privacy settings state
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    showProfile: true,
    showInSearch: true,
    emailNotifications: true,
    applicationNotifications: true,
    messageNotifications: true,
    opportunityDigest: true,
  })
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [downloadingData, setDownloadingData] = useState(false)
  
  // Password state
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [changingPassword, setChangingPassword] = useState(false)
  
  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)

  // Fetch profile and privacy settings
  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) return
      try {
        const profileData = await getVolunteerProfile()
        if (profileData) {
          setProfile(profileData)
          setSkills(profileData.skills || [])
          setCauses(profileData.causes || [])
        }
        
        // Load privacy settings
        const privacyRes = await fetch('/api/user/privacy')
        if (privacyRes.ok) {
          const data = await privacyRes.json()
          if (data.privacy) {
            setPrivacy(data.privacy)
          }
        }
      } catch (err) {
        console.error("Failed to load profile:", err)
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

  const showNotification = (type: "success" | "error", message: string) => {
    if (type === "success") {
      setSuccess(message)
      setError(null)
    } else {
      setError(message)
      setSuccess(null)
    }
    setTimeout(() => {
      setSuccess(null)
      setError(null)
    }, 5000)
  }

  // Skills management
  const addSkill = () => {
    if (!newSkill.categoryId || !newSkill.subskillId) return
    
    const exists = skills.some(
      (s) => s.categoryId === newSkill.categoryId && s.subskillId === newSkill.subskillId
    )
    if (exists) {
      showNotification("error", "This skill is already added")
      return
    }

    const category = skillCategories.find((c) => c.id === newSkill.categoryId)
    const subskill = category?.subskills.find((s) => s.id === newSkill.subskillId)

    setSkills([...skills, { ...newSkill, name: subskill?.name }])
    setNewSkill({ categoryId: "", subskillId: "", level: "intermediate" })
    setAddingSkill(false)
  }

  const removeSkill = (index: number) => {
    setSkills(skills.filter((_, i) => i !== index))
  }

  const toggleCause = (cause: string) => {
    if (causes.includes(cause)) {
      setCauses(causes.filter((c) => c !== cause))
    } else {
      setCauses([...causes, cause])
    }
  }

  const saveSkillsAndCauses = async () => {
    setIsSaving(true)
    try {
      const result = await updateVolunteerProfile({
        skills: skills.map((s) => ({
          categoryId: s.categoryId,
          subskillId: s.subskillId,
          level: s.level,
        })),
        causes,
      })
      if (result.success) {
        showNotification("success", "Skills and causes updated successfully")
      } else {
        showNotification("error", result.error || "Failed to update")
      }
    } catch (err) {
      showNotification("error", "An error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  // Password change
  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showNotification("error", "Passwords do not match")
      return
    }
    if (passwordData.newPassword.length < 8) {
      showNotification("error", "Password must be at least 8 characters")
      return
    }

    setChangingPassword(true)
    try {
      const result = await changePassword(passwordData.currentPassword, passwordData.newPassword)
      if (result.success) {
        showNotification("success", "Password changed successfully")
        setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" })
      } else {
        showNotification("error", result.error || "Failed to change password May be Due to you have created account via social login")
      }
    } catch (err) {
      showNotification("error", "An error occurred")
    } finally {
      setChangingPassword(false)
    }
  }

  // Save privacy settings
  const handleSavePrivacy = async () => {
    setSavingPrivacy(true)
    try {
      const res = await fetch('/api/user/privacy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacy }),
      })
      if (res.ok) {
        toast.success("Privacy settings saved")
      } else {
        toast.error("Failed to save privacy settings")
      }
    } catch (err) {
      toast.error("An error occurred")
    } finally {
      setSavingPrivacy(false)
    }
  }

  // Download user data
  const handleDownloadData = async () => {
    setDownloadingData(true)
    try {
      const res = await fetch('/api/user/export-data')
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `justbecause-data-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success("Data downloaded successfully")
      } else {
        toast.error("Failed to download data")
      }
    } catch (err) {
      toast.error("An error occurred")
    } finally {
      setDownloadingData(false)
    }
  }

  // Delete account
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      showNotification("error", "Please type DELETE to confirm")
      return
    }

    setDeleting(true)
    try {
      const result = await deleteAccount()
      if (result.success) {
        await authClient.signOut()
        router.push(localePath("/", locale))
      } else {
        showNotification("error", result.error || "Failed to delete account")
      }
    } catch (err) {
      showNotification("error", "An error occurred")
    } finally {
      setDeleting(false)
    }
  }

  if (isPending || isLoading) {
    return <SettingsPageSkeleton />
  }

  if (!session?.user) return null

  const selectedCategory = skillCategories.find((c) => c.id === newSkill.categoryId)

  return (
    <main className="flex-1 p-6 lg:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">{dict.volunteer?.settings?.title || "Settings"}</h1>
            <p className="text-muted-foreground">
              {dict.volunteer?.settings?.subtitle || "Manage your account, skills, and preferences"}
            </p>
          </div>

          {/* Notifications */}
          {success && (
            <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200 text-green-700 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              {success}
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          )}

          <Tabs defaultValue="skills" className="space-y-6">
            <div className="overflow-x-auto -mx-2 px-2">
              <TabsList className="inline-flex w-auto min-w-full sm:w-full sm:max-w-xl sm:grid sm:grid-cols-5 h-auto gap-1">
                <TabsTrigger value="skills" className="whitespace-nowrap text-xs sm:text-sm px-3 py-2">{dict.volunteer?.settings?.tabSkills || "Skills"}</TabsTrigger>
                <TabsTrigger value="account" className="whitespace-nowrap text-xs sm:text-sm px-3 py-2">{dict.volunteer?.settings?.tabAccount || "Account"}</TabsTrigger>
                <TabsTrigger value="notifications" className="whitespace-nowrap text-xs sm:text-sm px-3 py-2">{dict.volunteer?.settings?.tabAlerts || "Alerts"}</TabsTrigger>
                <TabsTrigger value="privacy" className="whitespace-nowrap text-xs sm:text-sm px-3 py-2">{dict.volunteer?.settings?.tabPrivacy || "Privacy"}</TabsTrigger>
                <TabsTrigger value="billing" className="whitespace-nowrap text-xs sm:text-sm px-3 py-2">{dict.volunteer?.settings?.tabBilling || "Billing"}</TabsTrigger>
              </TabsList>
            </div>

            {/* Skills Settings */}
            <TabsContent value="skills">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      {dict.volunteer?.settings?.yourSkills || "Your Skills"}
                    </CardTitle>
                    <CardDescription>
                      {dict.volunteer?.settings?.skillsDesc || "Add or remove skills that NGOs can match you with"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Current Skills */}
                    <div className="space-y-3">
                      {skills.length === 0 ? (
                        <p className="text-muted-foreground py-4 text-center">
                          {dict.volunteer?.settings?.noSkills || "No skills added yet. Add skills to get matched with projects."}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {skills.map((skill, index) => {
                            const category = skillCategories.find((c) => c.id === skill.categoryId)
                            const subskill = category?.subskills.find((s) => s.id === skill.subskillId)
                            return (
                              <Badge
                                key={index}
                                className="py-2 px-3 flex items-center gap-2"
                              >
                                <span>{skill.name || subskill?.name || skill.subskillId}</span>
                                <span className="text-xs opacity-75">({skill.level})</span>
                                <button
                                  onClick={() => removeSkill(index)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Add Skill Form */}
                    {addingSkill ? (
                      <div className="p-4 border rounded-lg space-y-4">
                        <div className="grid sm:grid-cols-3 gap-4">
                          <div>
                            <Label>{dict.volunteer?.settings?.category || "Category"}</Label>
                            <Select
                              value={newSkill.categoryId}
                              onValueChange={(value) =>
                                setNewSkill({ ...newSkill, categoryId: value, subskillId: "" })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={dict.volunteer?.settings?.selectCategory || "Select category"} />
                              </SelectTrigger>
                              <SelectContent>
                                {skillCategories.map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>{dict.volunteer?.settings?.skill || "Skill"}</Label>
                            <Select
                              value={newSkill.subskillId}
                              onValueChange={(value) =>
                                setNewSkill({ ...newSkill, subskillId: value })
                              }
                              disabled={!newSkill.categoryId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={dict.volunteer?.settings?.selectSkill || "Select skill"} />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedCategory?.subskills.map((sub) => (
                                  <SelectItem key={sub.id} value={sub.id}>
                                    {sub.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>{dict.volunteer?.settings?.level || "Level"}</Label>
                            <Select
                              value={newSkill.level}
                              onValueChange={(value: ExperienceLevel) =>
                                setNewSkill({ ...newSkill, level: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="beginner">{dict.volunteer?.common?.beginner || "Beginner"}</SelectItem>
                                <SelectItem value="intermediate">{dict.volunteer?.common?.intermediate || "Intermediate"}</SelectItem>
                                <SelectItem value="expert">{dict.volunteer?.common?.expert || "Expert"}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={addSkill} size="sm">
                            {dict.volunteer?.settings?.addSkill || "Add Skill"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAddingSkill(false)}
                          >
                            {dict.volunteer?.common?.cancel || "Cancel"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setAddingSkill(true)}
                        className="gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        {dict.volunteer?.settings?.addSkill || "Add Skill"}
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* AI Skill Suggestions */}
                <Card>
                  <CardContent className="pt-6">
                    <AISkillSuggestions
                      currentSkills={skills.map((s) => {
                        const cat = skillCategories.find((c) => c.id === s.categoryId)
                        const sub = cat?.subskills.find((ss) => ss.id === s.subskillId)
                        return sub?.name || s.subskillId
                      })}
                      causes={causes}
                      bio={profile?.bio}
                      completedProjects={profile?.completedProjects}
                      onAddSkill={(skillName) => {
                        // Try to find matching skill in categories
                        for (const cat of skillCategories) {
                          const sub = cat.subskills.find(
                            (s) => s.name.toLowerCase() === skillName.toLowerCase()
                          )
                          if (sub) {
                            const newS: SkillWithName = {
                              categoryId: cat.id,
                              subskillId: sub.id,
                              level: "intermediate" as ExperienceLevel,
                              name: sub.name,
                            }
                            setSkills((prev) => [...prev, newS])
                            return
                          }
                        }
                        toast.info(`"${skillName}" isn't in our skill catalog yet, but noted!`)
                      }}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{dict.volunteer?.settings?.causesTitle || "Causes You Care About"}</CardTitle>
                    <CardDescription>
                      {dict.volunteer?.settings?.causesDesc || "Select causes to get matched with relevant projects"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {causesList.map((cause) => (
                        <Badge
                          key={cause.id}
                          variant={causes.includes(cause.id) ? "default" : "outline"}
                          className={`cursor-pointer transition-colors ${
                            causes.includes(cause.id)
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-primary/10"
                          }`}
                          onClick={() => toggleCause(cause.id)}
                        >
                          {cause.name}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Button onClick={saveSkillsAndCauses} disabled={isSaving} className="gap-2">
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {dict.volunteer?.settings?.saveSkillsCauses || "Save Skills & Causes"}
                </Button>
              </div>
            </TabsContent>

            {/* Account Settings */}
            <TabsContent value="account">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {dict.volunteer?.settings?.accountInfo || "Account Information"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>{dict.volunteer?.common?.fullName || "Full Name"}</Label>
                        <Input
                          value={profile?.name || session.user.name || ""}
                          disabled
                          className="mt-1.5 bg-muted"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {dict.volunteer?.settings?.editInProfile || "Edit in your profile settings"}
                        </p>
                      </div>
                      <div>
                        <Label>{dict.volunteer?.common?.email || "Email"}</Label>
                        <Input
                          value={session.user.email || ""}
                          disabled
                          className="mt-1.5 bg-muted"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      {dict.volunteer?.settings?.changePassword || "Change Password"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="current-password">{dict.volunteer?.settings?.currentPassword || "Current Password"}</Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={(e) =>
                          setPasswordData({ ...passwordData, currentPassword: e.target.value })
                        }
                        className="mt-1.5"
                      />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="new-password">{dict.volunteer?.settings?.newPassword || "New Password"}</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={passwordData.newPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, newPassword: e.target.value })
                          }
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="confirm-password">{dict.volunteer?.settings?.confirmPassword || "Confirm Password"}</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={passwordData.confirmPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                          }
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                    <Button onClick={handlePasswordChange} disabled={changingPassword}>
                      {changingPassword ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      {dict.volunteer?.settings?.updatePassword || "Update Password"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      {dict.volunteer?.settings?.connectedAccounts || "Connected Accounts"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#4285F4] rounded-full flex items-center justify-center">
                          <span className="text-white font-bold">G</span>
                        </div>
                        <div>
                          <p className="font-medium">{dict.volunteer?.settings?.google || "Google"}</p>
                          <p className="text-sm text-muted-foreground">
                            {session.user.email}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{dict.volunteer?.settings?.connected || "Connected"}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Notification Settings */}
            <TabsContent value="notifications">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BellRing className="h-5 w-5" />
                      {dict.volunteer?.settings?.browserNotifications || "Browser Notifications"}
                    </CardTitle>
                    <CardDescription>
                      {dict.volunteer?.settings?.browserNotificationsDesc || "Get instant notifications in your browser when something important happens"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <NotificationPermissionButton />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5" />
                      {dict.volunteer?.settings?.notificationPreferences || "Notification Preferences"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h4 className="font-medium mb-4">{dict.volunteer?.settings?.emailNotifications || "Email Notifications"}</h4>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{dict.volunteer?.settings?.applicationUpdates || "Application Updates"}</p>
                            <p className="text-sm text-muted-foreground">
                              {dict.volunteer?.settings?.applicationUpdatesDesc || "Get notified when NGOs respond to your applications"}
                            </p>
                          </div>
                          <Switch
                            checked={privacy.applicationNotifications}
                            onCheckedChange={(checked) => 
                              setPrivacy({ ...privacy, applicationNotifications: checked })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{dict.volunteer?.settings?.newMessages || "New Messages"}</p>
                            <p className="text-sm text-muted-foreground">
                              {dict.volunteer?.settings?.newMessagesDesc || "Receive emails for new messages from NGOs"}
                            </p>
                          </div>
                          <Switch
                            checked={privacy.messageNotifications}
                            onCheckedChange={(checked) => 
                              setPrivacy({ ...privacy, messageNotifications: checked })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{dict.volunteer?.settings?.opportunityRecommendations || "Opportunity Recommendations"}</p>
                            <p className="text-sm text-muted-foreground">
                              {dict.volunteer?.settings?.opportunityRecommendationsDesc || "Weekly digest of opportunities matching your skills"}
                            </p>
                          </div>
                          <Switch
                            checked={privacy.opportunityDigest}
                            onCheckedChange={(checked) => 
                              setPrivacy({ ...privacy, opportunityDigest: checked })
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <Button onClick={handleSavePrivacy} disabled={savingPrivacy}>
                      {savingPrivacy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {dict.volunteer?.settings?.savePreferences || "Save Preferences"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Privacy Settings */}
            <TabsContent value="privacy">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      {dict.volunteer?.settings?.profileVisibility || "Profile Visibility"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{dict.volunteer?.settings?.profileStatus || "Profile Status"}</p>
                        <p className="text-sm text-muted-foreground">
                          {dict.volunteer?.settings?.profileStatusDesc || "Make your profile visible to NGOs"}
                        </p>
                      </div>
                      <Switch
                        checked={privacy.showProfile}
                        onCheckedChange={(checked) => 
                          setPrivacy({ ...privacy, showProfile: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{dict.volunteer?.settings?.showInSearch || "Show in Search Results"}</p>
                        <p className="text-sm text-muted-foreground">
                          {dict.volunteer?.settings?.showInSearchDesc || "Allow your profile to appear in impact agent searches"}
                        </p>
                      </div>
                      <Switch
                        checked={privacy.showInSearch}
                        onCheckedChange={(checked) => 
                          setPrivacy({ ...privacy, showInSearch: checked })
                        }
                      />
                    </div>
                    <Button onClick={handleSavePrivacy} disabled={savingPrivacy}>
                      {savingPrivacy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {dict.volunteer?.settings?.savePrivacySettings || "Save Privacy Settings"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Download className="h-5 w-5" />
                      {dict.volunteer?.settings?.dataPrivacy || "Data & Privacy"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{dict.volunteer?.settings?.downloadYourData || "Download Your Data"}</p>
                        <p className="text-sm text-muted-foreground">
                          {dict.volunteer?.settings?.downloadDataDesc || "Get a copy of your profile and activity data"}
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={handleDownloadData}
                        disabled={downloadingData}
                        className="shrink-0"
                      >
                        {downloadingData && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {downloadingData ? (dict.volunteer?.settings?.preparing || "Preparing...") : (dict.volunteer?.settings?.downloadData || "Download Data")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                      <Trash2 className="h-5 w-5" />
                      {dict.volunteer?.settings?.dangerZone || "Danger Zone"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!showDeleteConfirm ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950">
                        <div>
                          <p className="font-medium text-red-600">{dict.volunteer?.settings?.deleteAccount || "Delete Account"}</p>
                          <p className="text-sm text-muted-foreground">
                            {dict.volunteer?.settings?.deleteAccountDesc || "Permanently delete your account and all associated data"}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="shrink-0"
                        >
                          {dict.volunteer?.settings?.deleteAccount || "Delete Account"}
                        </Button>
                      </div>
                    ) : (
                      <div className="p-4 border border-red-200 rounded-lg bg-red-50 dark:bg-red-950 space-y-4">
                        <p className="text-red-600 font-medium">
                          {dict.volunteer?.settings?.deleteConfirmWarning || "Are you sure? This action cannot be undone."}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {dict.volunteer?.settings?.deleteConfirmPrompt || <>Type <strong>DELETE</strong> to confirm:</>}
                        </p>
                        <Input
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder={dict.volunteer?.settings?.typeDeletePlaceholder || "Type DELETE"}
                          className="max-w-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            onClick={handleDeleteAccount}
                            disabled={deleting || deleteConfirmText !== "DELETE"}
                          >
                            {deleting ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            {dict.volunteer?.settings?.confirmDelete || "Confirm Delete"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowDeleteConfirm(false)
                              setDeleteConfirmText("")
                            }}
                          >
                            {dict.volunteer?.common?.cancel || "Cancel"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Billing Settings */}
            <TabsContent value="billing">
              <div className="space-y-6">
                {/* Volunteer Type & Pricing */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      {dict.volunteer?.settings?.pricingTitle || "Your Pricing & Impact Agent Type"}
                    </CardTitle>
                    <CardDescription>
                      {dict.volunteer?.settings?.pricingDesc || "Set your impact agent type and rates for NGOs"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Volunteer Type Selection */}
                    <div className="space-y-3">
                      <Label className="text-base font-medium">{dict.volunteer?.common?.impactAgentType || "Impact Agent Type"}</Label>
                      <div className="grid sm:grid-cols-3 gap-3">
                        {[
                          { value: "free", label: dict.volunteer?.common?.proBonoOnly || "Pro-Bono Only", desc: dict.volunteer?.common?.proBonoDesc || "Contribute for free", icon: "❤️" },
                          { value: "paid", label: dict.volunteer?.common?.paidOnly || "Paid Only", desc: dict.volunteer?.common?.paidDesc || "Charge for your time", icon: "💰" },
                          { value: "both", label: dict.volunteer?.common?.openToBoth || "Open to Both", desc: dict.volunteer?.common?.openToBothDesc || "Flexible based on opportunity", icon: "💡" },
                        ].map((type) => (
                          <div
                            key={type.value}
                            onClick={() => {
                              const updates: any = { ...profile, volunteerType: type.value }
                              if (type.value === "free") {
                                updates.hourlyRate = undefined
                                updates.discountedRate = undefined
                                updates.freeHoursPerMonth = undefined
                              } else if (type.value === "paid") {
                                updates.freeHoursPerMonth = undefined
                              }
                              setProfile(updates)
                            }}
                            className={`flex flex-col items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                              profile?.volunteerType === type.value
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <span className="text-2xl mb-2">{type.icon}</span>
                            <span className="font-medium">{type.label}</span>
                            <span className="text-xs text-muted-foreground text-center mt-1">{type.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Free Hours - Only show for 'Open to Both' */}
                    {profile?.volunteerType === "both" && (
                      <div className="space-y-4 p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
                        <h3 className="font-medium text-foreground flex items-center gap-2">
                          <Clock className="h-4 w-4 text-green-600" />
                          {dict.volunteer?.common?.freeHoursContribution || "Free Hours Contribution"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {dict.volunteer?.settings?.freeHoursDesc || "How many free hours per month would you like to offer NGOs?"}
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="freeHoursPerMonth">{dict.volunteer?.common?.freeHoursPerMonth || "Free Hours per Month"}</Label>
                          <div className="flex items-center gap-4">
                            <Input
                              id="freeHoursPerMonth"
                              type="number"
                              min="0"
                              max="40"
                              placeholder="e.g. 5"
                              className="w-32"
                              value={profile?.freeHoursPerMonth || ""}
                              onChange={(e) =>
                                setProfile({
                                  ...profile,
                                  freeHoursPerMonth: parseInt(e.target.value) || 0,
                                })
                              }
                            />
                            <span className="text-sm text-muted-foreground">{dict.volunteer?.common?.hoursPerMonth || "hours/month"}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Pricing Fields - Only show when paid or both */}
                    {(profile?.volunteerType === "paid" || profile?.volunteerType === "both") && (
                      <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                        <h3 className="font-medium text-foreground flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-green-600" />
                          {dict.volunteer?.settings?.yourRates || "Your Rates"}
                        </h3>
                        
                        <div className="grid sm:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="currency">{dict.volunteer?.common?.currency || "Currency"}</Label>
                            <select
                              id="currency"
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              value={profile?.currency || "USD"}
                              onChange={(e) =>
                                setProfile({ ...profile, currency: e.target.value })
                              }
                            >
                              <option value="USD">$ USD</option>
                              <option value="EUR">€ EUR</option>
                              <option value="GBP">£ GBP</option>
                              <option value="INR">₹ INR</option>
                              <option value="SGD">S$ SGD</option>
                              <option value="AED">د.إ AED</option>
                              <option value="MYR">RM MYR</option>
                            </select>
                            <p className="text-xs text-muted-foreground">{dict.volunteer?.common?.selectCurrency || "Select your currency"}</p>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="hourlyRate">{dict.volunteer?.common?.hourlyRate || "Hourly Rate"}</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                {getCurrencySymbol(profile?.currency || "USD")}
                              </span>
                              <Input
                                id="hourlyRate"
                                type="number"
                                min="1"
                                placeholder="e.g. 50"
                                className={`pl-8 ${pricingErrors.hourlyRate ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                                value={profile?.hourlyRate ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? undefined : parseInt(e.target.value)
                                  const numVal = val ?? 0
                                  setProfile({ ...profile, hourlyRate: val })
                                  if (numVal <= 0 && e.target.value !== "") {
                                    setPricingErrors(prev => ({ ...prev, hourlyRate: "Hourly rate must be greater than zero" }))
                                  } else {
                                    setPricingErrors(prev => { const { hourlyRate, ...rest } = prev; return rest })
                                  }
                                  // Re-validate discounted rate against new hourly rate
                                  if (profile?.discountedRate && numVal > 0 && profile.discountedRate >= numVal) {
                                    setPricingErrors(prev => ({ ...prev, discountedRate: "Discounted rate must be less than the hourly rate" }))
                                  } else if (profile?.discountedRate > 0) {
                                    setPricingErrors(prev => { const { discountedRate, ...rest } = prev; return rest })
                                  }
                                }}
                              />
                            </div>
                            {pricingErrors.hourlyRate ? (
                              <p className="text-sm text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {pricingErrors.hourlyRate}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">{dict.volunteer?.common?.hourlyRateDesc || "Your standard hourly rate"}</p>
                            )}
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="discountedRate">{dict.volunteer?.common?.discountedRate || "Discounted Rate for NGOs"}</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                {getCurrencySymbol(profile?.currency || "USD")}
                              </span>
                              <Input
                                id="discountedRate"
                                type="number"
                                min="0"
                                placeholder="e.g. 30"
                                className={`pl-8 ${pricingErrors.discountedRate ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                                value={profile?.discountedRate ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? undefined : parseInt(e.target.value)
                                  const numVal = val ?? 0
                                  setProfile({ ...profile, discountedRate: val })
                                  if (numVal < 0) {
                                    setPricingErrors(prev => ({ ...prev, discountedRate: "Discounted rate cannot be negative" }))
                                  } else if (profile?.hourlyRate && numVal > 0 && numVal >= profile.hourlyRate) {
                                    setPricingErrors(prev => ({ ...prev, discountedRate: "Discounted rate must be less than the hourly rate" }))
                                  } else {
                                    setPricingErrors(prev => { const { discountedRate, ...rest } = prev; return rest })
                                  }
                                }}
                              />
                            </div>
                            {pricingErrors.discountedRate ? (
                              <p className="text-sm text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {pricingErrors.discountedRate}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">{dict.volunteer?.common?.discountedRateDesc || "Special discounted rate for non-profits (Low Bono)"}</p>
                            )}
                          </div>
                        </div>
                        
                        {profile?.hourlyRate > 0 && profile?.discountedRate > 0 && (
                          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/20 p-2 rounded">
                            <CheckCircle className="h-4 w-4" />
                            <span>
                              {(dict.volunteer?.common?.ngoSavingsMessage || "NGOs save {percent}% with your discounted rate!").replace("{percent}", String(Math.round(((profile.hourlyRate - profile.discountedRate) / profile.hourlyRate) * 100)))}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <Button 
                      onClick={async () => {
                        // Client-side validation (IA-013 / IA-014)
                        const errors: Record<string, string> = {}
                        const isPaid = profile?.volunteerType === "paid" || profile?.volunteerType === "both"
                        const isBoth = profile?.volunteerType === "both"

                        if (isPaid) {
                          if (profile?.hourlyRate !== undefined && profile?.hourlyRate <= 0) {
                            errors.hourlyRate = "Hourly rate must be greater than zero"
                          }
                          if (profile?.discountedRate !== undefined && profile?.discountedRate < 0) {
                            errors.discountedRate = "Discounted rate cannot be negative"
                          }
                          if (profile?.hourlyRate > 0 && profile?.discountedRate > 0 && profile.discountedRate >= profile.hourlyRate) {
                            errors.discountedRate = "Discounted rate must be less than the hourly rate"
                          }
                        }
                        if (isBoth && profile?.freeHoursPerMonth !== undefined && profile?.freeHoursPerMonth < 0) {
                          errors.freeHours = "Free hours cannot be negative"
                        }

                        if (Object.keys(errors).length > 0) {
                          setPricingErrors(errors)
                          toast.error("Please fix the validation errors before saving")
                          return
                        }
                        setPricingErrors({})

                        setIsSaving(true)
                        try {
                          const result = await updateVolunteerProfile({
                            volunteerType: profile?.volunteerType,
                            freeHoursPerMonth: profile?.volunteerType === "both" ? (profile?.freeHoursPerMonth || 0) : undefined,
                            hourlyRate: (profile?.volunteerType === "paid" || profile?.volunteerType === "both") ? profile?.hourlyRate : undefined,
                            discountedRate: (profile?.volunteerType === "paid" || profile?.volunteerType === "both") ? profile?.discountedRate : undefined,
                            currency: (profile?.volunteerType === "paid" || profile?.volunteerType === "both") ? (profile?.currency || "USD") : undefined,
                          })
                          if (result.success) {
                            toast.success("Pricing updated successfully")
                          } else {
                            toast.error(result.error || "Failed to update pricing")
                          }
                        } catch (err) {
                          toast.error("An error occurred")
                        } finally {
                          setIsSaving(false)
                        }
                      }}
                      disabled={isSaving || Object.keys(pricingErrors).length > 0}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {dict.volunteer?.common?.saving || "Saving..."}
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          {dict.volunteer?.settings?.savePricing || "Save Pricing"}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Subscription Plan Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      {dict.volunteer?.settings?.subscriptionPlan || "Subscription Plan"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-lg">
                            {profile?.subscriptionPlan === "pro" ? (dict.volunteer?.settings?.proPlan || "Pro Plan") : (dict.volunteer?.settings?.freePlan || "Free Plan")}
                          </p>
                          <Badge
                            variant={profile?.subscriptionPlan === "pro" ? "default" : "secondary"}
                          >
                            {profile?.subscriptionPlan === "pro" ? "Pro" : "Free"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {profile?.subscriptionPlan === "pro"
                            ? (dict.volunteer?.settings?.unlimitedApps || "Unlimited applications per month")
                            : `${3 - (profile?.monthlyApplicationsUsed || 0)} ${dict.volunteer?.settings?.appsRemaining || "applications remaining this month"}`
                          }
                        </p>
                      </div>
                      {profile?.subscriptionPlan !== "pro" && (
                        <Button variant="outline" onClick={() => router.push(localePath("/checkout?plan=volunteer-pro", locale))}>
                          {dict.volunteer?.common?.upgradeToPro || "Upgrade to Pro"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
    </main>
  )
}
