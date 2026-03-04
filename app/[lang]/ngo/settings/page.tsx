"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useLocale, localePath } from "@/hooks/use-locale"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { authClient } from "@/lib/auth-client"
import { toast } from "sonner"
import { getCurrencySymbol } from "@/lib/currency"
import { usePlatformSettingsStore } from "@/lib/store"
import { NotificationPermissionButton } from "@/components/notifications/notification-listener"
import { 
  getNGOProfile, 
  updateNGOProfile, 
  getMyTransactions,
  changePassword, 
  deleteAccount 
} from "@/lib/actions"
import { skillCategories, causes as causesList } from "@/lib/skills-data"
import type { RequiredSkill, SkillPriority } from "@/lib/types"
import { SettingsPageSkeleton } from "@/components/ui/page-skeletons"
import {
  Building2,
  Bell,
  BellRing,
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
  Users,
  Mail,
  History,
  Briefcase,
} from "lucide-react"
import LocaleLink from "@/components/locale-link"
import { useDictionary } from "@/components/dictionary-provider"

interface PrivacySettings {
  showProfile: boolean
  showInSearch: boolean
  emailNotifications: boolean
  applicationNotifications: boolean
  messageNotifications: boolean
}

export default function NGOSettingsPage() {
  const router = useRouter()
  const locale = useLocale()
  const dict = useDictionary()
  const { data: session, isPending } = authClient.useSession()
  const [profile, setProfile] = useState<any>(null)
  const [transactions, setTransactions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState("")

  // Form states
  const [orgName, setOrgName] = useState("")
  const [registrationNumber, setRegistrationNumber] = useState("")
  const [website, setWebsite] = useState("")
  const [description, setDescription] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [address, setAddress] = useState("")

  // Skills and causes
  const [skills, setSkills] = useState<RequiredSkill[]>([])
  const [causes, setCauses] = useState<string[]>([])

  // Privacy settings state
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    showProfile: true,
    showInSearch: true,
    emailNotifications: true,
    applicationNotifications: true,
    messageNotifications: true,
  })
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [downloadingData, setDownloadingData] = useState(false)

  // Password state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState("")
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Delete account state
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Fetch profile data and privacy settings
  useEffect(() => {
    async function loadData() {
      if (!session?.user) return
      
      try {
        const [profileData, txData] = await Promise.all([
          getNGOProfile(),
          getMyTransactions(),
        ])
        
        if (profileData) {
          setProfile(profileData)
          setOrgName(profileData.organizationName || "")
          setRegistrationNumber(profileData.registrationNumber || "")
          setWebsite(profileData.website || "")
          setDescription(profileData.description || "")
          setContactEmail(profileData.contactEmail || session.user.email || "")
          setContactPhone(profileData.contactPhone || "")
          setAddress(profileData.address || "")
          setSkills(profileData.typicalSkillsNeeded || [])
          setCauses(profileData.causes || [])
        }
        
        setTransactions(txData)

        // Load privacy settings
        const privacyRes = await fetch('/api/user/privacy')
        if (privacyRes.ok) {
          const data = await privacyRes.json()
          if (data.privacy) {
            setPrivacy(data.privacy)
          }
        }
      } catch (err) {
        console.error("Failed to load data:", err)
        setError(dict.ngo?.settings?.loadError || "Failed to load profile data")
      } finally {
        setIsLoading(false)
      }
    }

    if (!isPending && session?.user) {
      loadData()
    } else if (!isPending && !session?.user) {
      router.push(localePath("/auth/signin", locale))
    }
  }, [session, isPending, router])

  const toggleSkill = (categoryId: string, subskillId: string) => {
    setSkills((prev) => {
      const exists = prev.some((s) => s.categoryId === categoryId && s.subskillId === subskillId)
      if (exists) {
        return prev.filter((s) => !(s.categoryId === categoryId && s.subskillId === subskillId))
      } else {
        return [...prev, { categoryId, subskillId, priority: "must-have" as SkillPriority }]
      }
    })
  }

  const toggleCause = (causeId: string) => {
    setCauses((prev) =>
      prev.includes(causeId) ? prev.filter((c) => c !== causeId) : [...prev, causeId]
    )
  }

  const isSkillSelected = (categoryId: string, subskillId: string) => {
    return skills.some((s) => s.categoryId === categoryId && s.subskillId === subskillId)
  }

  const saveOrganizationInfo = async () => {
    setIsSaving(true)
    setError("")
    setSaveSuccess(false)

    try {
      const result = await updateNGOProfile({
        organizationName: orgName,
        registrationNumber,
        website,
        description,
        contactEmail,
        contactPhone,
        address,
      })

      if (result.success) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        setError(result.error || (dict.ngo?.settings?.failedToSave || "Failed to save"))
      }
    } catch (err) {
      setError(dict.ngo?.common?.unexpectedError || "An unexpected error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  const saveSkillsAndCauses = async () => {
    setIsSaving(true)
    setError("")
    setSaveSuccess(false)

    try {
      const result = await updateNGOProfile({
        typicalSkillsNeeded: skills,
        causes,
      })

      if (result.success) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        setError(result.error || (dict.ngo?.settings?.failedToSave || "Failed to save"))
      }
    } catch (err) {
      setError(dict.ngo?.common?.unexpectedError || "An unexpected error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordError(dict.ngo?.settings?.passwordsNoMatch || "Passwords do not match")
      return
    }
    if (newPassword.length < 8) {
      setPasswordError(dict.ngo?.settings?.passwordMinLength || "Password must be at least 8 characters")
      return
    }

    setIsChangingPassword(true)
    setPasswordError("")
    setPasswordSuccess(false)

    try {
      const result = await changePassword(currentPassword, newPassword)
      if (result.success) {
        setPasswordSuccess(true)
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        setTimeout(() => setPasswordSuccess(false), 3000)
      } else {
        setPasswordError(result.error || (dict.ngo?.settings?.failedToSave || "Failed to change password"))
      }
    } catch (err) {
      setPasswordError(dict.ngo?.common?.unexpectedError || "An unexpected error occurred")
    } finally {
      setIsChangingPassword(false)
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

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE") {
      return
    }

    setIsDeleting(true)
    try {
      const result = await deleteAccount()
      if (result.success) {
        await authClient.signOut()
        router.push(localePath("/", locale))
      } else {
        setError(result.error || (dict.ngo?.settings?.failedToSave || "Failed to delete account"))
      }
    } catch (err) {
      setError(dict.ngo?.common?.unexpectedError || "An unexpected error occurred")
    } finally {
      setIsDeleting(false)
    }
  }

  if (isPending || isLoading) {
    return <SettingsPageSkeleton />
  }

  return (
    <main className="flex-1 p-6 lg:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">{dict.ngo?.settings?.title || "Settings"}</h1>
            <p className="text-muted-foreground">
              {dict.ngo?.settings?.subtitle || "Manage your organization account and preferences"}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {saveSuccess && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              {dict.ngo?.settings?.changesSaved || "Changes saved successfully!"}
            </div>
          )}

          <Tabs defaultValue="organization" className="space-y-6">
            <div className="overflow-x-auto -mx-2 px-2">
              <TabsList className="inline-flex w-auto min-w-full sm:w-full sm:max-w-3xl sm:grid sm:grid-cols-5 h-auto gap-1">
                <TabsTrigger value="organization" className="whitespace-nowrap text-xs sm:text-sm px-3 py-2">{dict.ngo?.settings?.organization || "Organization"}</TabsTrigger>
                <TabsTrigger value="skills" className="whitespace-nowrap text-xs sm:text-sm px-3 py-2">{dict.ngo?.settings?.skillsCauses || "Skills & Causes"}</TabsTrigger>
                <TabsTrigger value="billing" className="whitespace-nowrap text-xs sm:text-sm px-3 py-2">{dict.ngo?.settings?.billing || "Billing"}</TabsTrigger>
                <TabsTrigger value="security" className="whitespace-nowrap text-xs sm:text-sm px-3 py-2">{dict.ngo?.settings?.security || "Security"}</TabsTrigger>
                <TabsTrigger value="privacy" className="whitespace-nowrap text-xs sm:text-sm px-3 py-2">{dict.ngo?.settings?.privacy || "Privacy"}</TabsTrigger>
              </TabsList>
            </div>

            {/* Organization Settings */}
            <TabsContent value="organization">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      {dict.ngo?.settings?.orgInfo || "Organization Information"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="org-name">{dict.ngo?.common?.organizationName || "Organization Name"}</Label>
                        <Input
                          id="org-name"
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="reg-number">{dict.ngo?.common?.registrationNumber || "Registration Number"}</Label>
                        <Input
                          id="reg-number"
                          value={registrationNumber}
                          onChange={(e) => setRegistrationNumber(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="website">{dict.ngo?.common?.website || "Website"}</Label>
                      <Input
                        id="website"
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        className="mt-1.5"
                        placeholder="https://yourorganization.org"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">{dict.ngo?.common?.description || "Description"}</Label>
                      <Textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="mt-1.5 min-h-[100px]"
                        placeholder={dict.ngo?.settings?.descriptionPlaceholder || "Describe your organization's mission and work"}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      {dict.ngo?.common?.contactInformation || "Contact Information"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="contact-email">{dict.ngo?.common?.contactEmail || "Contact Email"}</Label>
                        <Input
                          id="contact-email"
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="contact-phone">{dict.ngo?.settings?.contactPhone || "Contact Phone"}</Label>
                        <Input
                          id="contact-phone"
                          type="tel"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="address">{dict.ngo?.common?.address || "Address"}</Label>
                      <Input
                        id="address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="mt-1.5"
                        placeholder={dict.ngo?.settings?.addressPlaceholder || "Full organization address"}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Button onClick={saveOrganizationInfo} disabled={isSaving} className="gap-2">
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {dict.ngo?.settings?.saveOrganizationInfo || "Save Organization Info"}
                </Button>
              </div>
            </TabsContent>

            {/* Skills & Causes Settings */}
            <TabsContent value="skills">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      {dict.ngo?.settings?.skillsYouNeed || "Skills You Need"}
                    </CardTitle>
                    <CardDescription>
                      {dict.ngo?.settings?.selectSkillsDesc || "Select skills your organization typically needs from impact agents"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {skillCategories.map((category) => (
                      <div key={category.id}>
                        <h4 className="text-sm font-medium text-muted-foreground mb-3">
                          {category.name}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {category.subskills.map((subskill) => (
                            <Badge
                              key={subskill.id}
                              variant={isSkillSelected(category.id, subskill.id) ? "default" : "outline"}
                              className={`cursor-pointer transition-colors ${
                                isSkillSelected(category.id, subskill.id)
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-primary/10"
                              }`}
                              onClick={() => toggleSkill(category.id, subskill.id)}
                            >
                              {subskill.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{dict.ngo?.settings?.causesYouFocusOn || "Causes You Focus On"}</CardTitle>
                    <CardDescription>
                      {dict.ngo?.settings?.selectCausesDesc || "Select causes to get matched with relevant impact agents"}
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
                  {dict.ngo?.settings?.saveSkillsCauses || "Save Skills & Causes"}
                </Button>
              </div>
            </TabsContent>

            {/* Billing Settings */}
            <TabsContent value="billing">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5" />
                      {dict.ngo?.settings?.transactionHistory || "Transaction History"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {transactions.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>{dict.ngo?.settings?.noTransactions || "No transactions yet"}</p>
                        <p className="text-sm mt-1">
                          {dict.ngo?.settings?.paymentHistoryAppears || "Your payment history will appear here"}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {transactions.map((tx, i) => (
                          <div
                            key={i}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 border rounded-lg"
                          >
                            <div className="min-w-0">
                              <p className="font-medium truncate">{tx.description}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(tx.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-left sm:text-right shrink-0">
                              <p className="font-medium">{getCurrencySymbol(usePlatformSettingsStore.getState().settings?.currency || "USD")}{tx.amount}</p>
                              <Badge
                                variant={tx.status === "completed" ? "default" : "secondary"}
                              >
                                {tx.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Security Settings */}
            <TabsContent value="security">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      {dict.ngo?.settings?.changePassword || "Change Password"}
                    </CardTitle>
                    <CardDescription>
                      {dict.ngo?.settings?.changePasswordDesc || "Update your password to keep your account secure"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {passwordError && (
                      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {passwordError}
                      </div>
                    )}
                    {passwordSuccess && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        {dict.ngo?.settings?.passwordChanged || "Password changed successfully!"}
                      </div>
                    )}
                    <div>
                      <Label htmlFor="current-password">{dict.ngo?.settings?.currentPassword || "Current Password"}</Label>
                      <Input
                        id="current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="mt-1.5"
                      />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="new-password">{dict.ngo?.settings?.newPassword || "New Password"}</Label>
                        <Input
                          id="new-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="confirm-password">{dict.ngo?.settings?.confirmPassword || "Confirm New Password"}</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleChangePassword}
                      disabled={isChangingPassword || !currentPassword || !newPassword}
                      className="gap-2"
                    >
                      {isChangingPassword ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Lock className="h-4 w-4" />
                      )}
                      {dict.ngo?.settings?.updatePassword || "Update Password"}
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
                      <BellRing className="h-5 w-5" />
                      {dict.ngo?.settings?.browserNotifications || "Browser Notifications"}
                    </CardTitle>
                    <CardDescription>
                      {dict.ngo?.settings?.browserNotificationsDesc || "Get instant notifications in your browser when something important happens"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <NotificationPermissionButton />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      {dict.ngo?.settings?.profileVisibility || "Profile Visibility"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{dict.ngo?.settings?.publicProfile || "Public Profile"}</p>
                        <p className="text-sm text-muted-foreground">
                          {dict.ngo?.settings?.publicProfileDesc || "Allow impact agents to see your organization profile"}
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
                        <p className="font-medium">{dict.ngo?.settings?.showInDirectory || "Show in Directory"}</p>
                        <p className="text-sm text-muted-foreground">
                          {dict.ngo?.settings?.showInDirectoryDesc || "List your organization in the NGO directory"}
                        </p>
                      </div>
                      <Switch
                        checked={privacy.showInSearch}
                        onCheckedChange={(checked) => 
                          setPrivacy({ ...privacy, showInSearch: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{dict.ngo?.settings?.emailNotifications || "Email Notifications"}</p>
                        <p className="text-sm text-muted-foreground">
                          {dict.ngo?.settings?.emailNotificationsDesc || "Receive email notifications for applications and messages"}
                        </p>
                      </div>
                      <Switch
                        checked={privacy.emailNotifications}
                        onCheckedChange={(checked) => 
                          setPrivacy({ ...privacy, emailNotifications: checked })
                        }
                      />
                    </div>
                    <Button onClick={handleSavePrivacy} disabled={savingPrivacy}>
                      {savingPrivacy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {dict.ngo?.settings?.savePrivacySettings || "Save Privacy Settings"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Download className="h-5 w-5" />
                      {dict.ngo?.settings?.dataPrivacy || "Data & Privacy"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{dict.ngo?.settings?.downloadData || "Download Your Data"}</p>
                        <p className="text-sm text-muted-foreground">
                          {dict.ngo?.settings?.downloadDataDesc || "Get a copy of your organization data"}
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={handleDownloadData}
                        disabled={downloadingData}
                        className="shrink-0"
                      >
                        {downloadingData && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {downloadingData ? (dict.ngo?.settings?.preparing || "Preparing...") : (dict.ngo?.settings?.downloadDataBtn || "Download Data")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                      <Trash2 className="h-5 w-5" />
                      {dict.ngo?.settings?.dangerZone || "Danger Zone"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!showDeleteConfirm ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-red-200 rounded-lg bg-red-50">
                        <div>
                          <p className="font-medium text-red-600">{dict.ngo?.settings?.deleteOrganization || "Delete Organization"}</p>
                          <p className="text-sm text-muted-foreground">
                            {dict.ngo?.settings?.deleteOrgDesc || "Permanently delete your organization account"}
                          </p>
                        </div>
                        <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} className="shrink-0">
                          {dict.ngo?.settings?.deleteAccount || "Delete Account"}
                        </Button>
                      </div>
                    ) : (
                      <div className="p-4 border border-red-200 rounded-lg bg-red-50 space-y-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                          <div>
                            <p className="font-medium text-red-600">
                              {dict.ngo?.settings?.deleteConfirmTitle || "Are you absolutely sure?"}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {dict.ngo?.settings?.deleteConfirmDesc || "This action cannot be undone. This will permanently delete your organization account, all opportunities, applications, and remove all associated data."}
                            </p>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="delete-confirm" className="text-sm">
                            {dict.ngo?.settings?.typeDeleteConfirm || <>Type <span className="font-mono font-bold">DELETE</span> to confirm</>}
                          </Label>
                          <Input
                            id="delete-confirm"
                            value={deleteConfirmation}
                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                            className="mt-1.5"
                            placeholder="DELETE"
                          />
                        </div>
                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowDeleteConfirm(false)
                              setDeleteConfirmation("")
                            }}
                          >
                            {dict.ngo?.common?.cancel || "Cancel"}
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={handleDeleteAccount}
                            disabled={deleteConfirmation !== "DELETE" || isDeleting}
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Trash2 className="h-4 w-4 mr-2" />
                            )}
                            {dict.ngo?.settings?.deleteOrganization || "Delete Organization"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
    </main>
  )
}
