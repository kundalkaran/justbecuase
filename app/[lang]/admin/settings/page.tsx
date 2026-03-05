"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Settings,
  Globe,
  CreditCard,
  Shield,
  Save,
  Loader2,
  Users,
  Building2,
  Plus,
  X,
  MessageSquare,
  Phone,
  Send,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  TestTube,
  Zap,
} from "lucide-react"
import { getAdminSettings, updateAdminSettings } from "@/lib/actions"
import { toast } from "sonner"
import { useDictionary } from "@/components/dictionary-provider"
import type { AdminSettings, SupportedCurrency, PaymentGatewayType } from "@/lib/types"
import { SettingsPageSkeleton } from "@/components/ui/page-skeletons"
import { usePlatformSettingsStore } from "@/lib/store"

const CURRENCIES: { value: SupportedCurrency; label: string; symbol: string }[] = [
  { value: "INR", label: "Indian Rupee (INR)", symbol: "₹" },
  { value: "USD", label: "US Dollar (USD)", symbol: "$" },
  { value: "EUR", label: "Euro (EUR)", symbol: "€" },
  { value: "GBP", label: "British Pound (GBP)", symbol: "£" },
  { value: "SGD", label: "Singapore Dollar (SGD)", symbol: "S$" },
  { value: "AED", label: "UAE Dirham (AED)", symbol: "د.إ" },
  { value: "MYR", label: "Malaysian Ringgit (MYR)", symbol: "RM" },
]

export default function AdminSettingsPage() {
  const dict = useDictionary();
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [newVolunteerFeature, setNewVolunteerFeature] = useState("")
  const [newNGOFeature, setNewNGOFeature] = useState("")
  
  // SMS Configuration State
  const [smsConfig, setSmsConfig] = useState<{
    provider: string
    twilioConfigured: boolean
    vonageConfigured: boolean
    msg91Configured: boolean
    textlocalConfigured: boolean
    twilioAccountSid: string
    twilioPhoneNumber: string
    vonageApiKey: string
    vonageFromNumber: string
    msg91SenderId: string
    textlocalSender: string
  } | null>(null)
  const [smsForm, setSmsForm] = useState({
    provider: "none",
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioPhoneNumber: "",
    vonageApiKey: "",
    vonageApiSecret: "",
    vonageFromNumber: "",
    msg91AuthKey: "",
    msg91SenderId: "",
    msg91TemplateId: "",
    textlocalApiKey: "",
    textlocalSender: "",
  })
  const [smsSaving, setSmsSaving] = useState(false)
  const [smsTestPhone, setSmsTestPhone] = useState("")
  const [smsTesting, setSmsTesting] = useState(false)

  // Payment Gateway Configuration State
  const [paymentConfig, setPaymentConfig] = useState<{
    gateway: PaymentGatewayType
    isLive: boolean
    stripeConfigured: boolean
    stripePublishableKey: string
    stripeSecretKeyMasked: string
    razorpayConfigured: boolean
    razorpayKeyId: string
    razorpayKeySecretMasked: string
    configuredAt?: string
    lastTestedAt?: string
    testSuccessful?: boolean
  } | null>(null)
  const [paymentForm, setPaymentForm] = useState({
    gateway: "none" as PaymentGatewayType,
    isLive: false,
    stripePublishableKey: "",
    stripeSecretKey: "",
    razorpayKeyId: "",
    razorpayKeySecret: "",
  })
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentTesting, setPaymentTesting] = useState(false)
  const [showStripeSecret, setShowStripeSecret] = useState(false)
  const [showRazorpaySecret, setShowRazorpaySecret] = useState(false)
  const [testAmount, setTestAmount] = useState("1")

  useEffect(() => {
    loadSettings()
    loadSmsConfig()
    loadPaymentConfig()
  }, [])

  const loadSettings = async () => {
    setIsLoading(true)
    const data = await getAdminSettings()
    setSettings(data)
    setIsLoading(false)
  }

  const loadSmsConfig = async () => {
    try {
      const response = await fetch("/api/admin/sms-config")
      if (response.ok) {
        const data = await response.json()
        setSmsConfig(data)
        setSmsForm(prev => ({
          ...prev,
          provider: data.provider || "none",
          twilioPhoneNumber: data.twilioPhoneNumber || "",
          vonageApiKey: data.vonageApiKey || "",
          vonageFromNumber: data.vonageFromNumber || "",
          msg91SenderId: data.msg91SenderId || "",
          textlocalSender: data.textlocalSender || "",
        }))
      }
    } catch (error) {
      console.error("Failed to load SMS config:", error)
    }
  }

  const loadPaymentConfig = async () => {
    try {
      const response = await fetch("/api/admin/payment-config")
      if (response.ok) {
        const data = await response.json()
        setPaymentConfig(data)
        setPaymentForm(prev => ({
          ...prev,
          gateway: data.gateway || "none",
          isLive: data.isLive || false,
          stripePublishableKey: data.stripePublishableKey || "",
          razorpayKeyId: data.razorpayKeyId || "",
        }))
      }
    } catch (error) {
      console.error("Failed to load payment config:", error)
    }
  }

  const savePaymentConfig = async () => {
    setPaymentSaving(true)
    try {
      const response = await fetch("/api/admin/payment-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentForm)
      })
      const data = await response.json()
      if (response.ok) {
        toast.success(dict.admin?.settings?.toasts?.paymentConfigSaved || "Payment gateway configuration saved successfully")
        loadPaymentConfig()
      } else {
        toast.error(data.error || (dict.admin?.settings?.toasts?.paymentConfigFailed || "Failed to save payment configuration"))
      }
    } catch (error) {
      toast.error(dict.admin?.settings?.toasts?.paymentConfigFailed || "Failed to save payment configuration")
    } finally {
      setPaymentSaving(false)
    }
  }

  const testPaymentConfig = async () => {
    setPaymentTesting(true)
    try {
      const response = await fetch("/api/admin/payment-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway: paymentForm.gateway })
      })
      const data = await response.json()
      if (data.success) {
        toast.success(data.message)
        loadPaymentConfig()
      } else {
        toast.error(data.error || data.message || (dict.admin?.settings?.toasts?.paymentTestFailed || "Failed to test payment gateway"))
      }
    } catch (error) {
      toast.error(dict.admin?.settings?.toasts?.paymentTestFailed || "Failed to test payment gateway")
    } finally {
      setPaymentTesting(false)
    }
  }

  const saveSmsConfig = async () => {
    setSmsSaving(true)
    console.log("[Admin] Saving SMS config:", smsForm)
    try {
      const response = await fetch("/api/admin/sms-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smsForm)
      })
      const data = await response.json()
      console.log("[Admin] Save response:", data)
      if (response.ok) {
        toast.success(dict.admin?.settings?.toasts?.smsConfigSaved || "SMS configuration saved successfully")
        loadSmsConfig()
      } else {
        console.error("[Admin] Save failed:", data.error)
        toast.error(data.error || (dict.admin?.settings?.toasts?.smsConfigFailed || "Failed to save SMS configuration"))
      }
    } catch (error) {
      console.error("[Admin] Save error:", error)
      toast.error(dict.admin?.settings?.toasts?.smsConfigFailed || "Failed to save SMS configuration")
    } finally {
      setSmsSaving(false)
    }
  }

  const testSmsConfig = async () => {
    if (!smsTestPhone) {
      toast.error(dict.admin?.settings?.toasts?.smsTestPhoneRequired || "Please enter a phone number to test")
      return
    }
    setSmsTesting(true)
    try {
      const response = await fetch("/api/admin/sms-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: smsTestPhone })
      })
      const data = await response.json()
      if (data.success) {
        toast.success(data.message)
      } else {
        toast.error(data.error || (dict.admin?.settings?.toasts?.smsTestFailed || "Failed to send test SMS"))
      }
    } catch (error) {
      toast.error(dict.admin?.settings?.toasts?.smsTestFailed || "Failed to send test SMS")
    } finally {
      setSmsTesting(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return
    setIsSaving(true)
    const result = await updateAdminSettings(settings)
    if (result.success) {
      // Invalidate the cached platform settings so all pages refresh
      usePlatformSettingsStore.getState().invalidate()
      toast.success(dict.admin?.settings?.toasts?.settingsSaved || "Settings saved successfully — changes will propagate to all users within minutes")
    } else {
      toast.error(result.error || "Failed to save settings")
    }
    setIsSaving(false)
  }

  const getCurrencySymbol = () => {
    const curr = CURRENCIES.find(c => c.value === settings?.currency)
    return curr?.symbol || "$"
  }

  const addVolunteerFeature = () => {
    if (!newVolunteerFeature.trim() || !settings) return
    setSettings({
      ...settings,
      volunteerProFeatures: [...(settings.volunteerProFeatures || []), newVolunteerFeature.trim()],
    })
    setNewVolunteerFeature("")
  }

  const removeVolunteerFeature = (index: number) => {
    if (!settings) return
    setSettings({
      ...settings,
      volunteerProFeatures: settings.volunteerProFeatures?.filter((_, i) => i !== index) || [],
    })
  }

  const addNGOFeature = () => {
    if (!newNGOFeature.trim() || !settings) return
    setSettings({
      ...settings,
      ngoProFeatures: [...(settings.ngoProFeatures || []), newNGOFeature.trim()],
    })
    setNewNGOFeature("")
  }

  const removeNGOFeature = (index: number) => {
    if (!settings) return
    setSettings({
      ...settings,
      ngoProFeatures: settings.ngoProFeatures?.filter((_, i) => i !== index) || [],
    })
  }

  if (isLoading) {
    return <SettingsPageSkeleton />
  }

  if (!settings) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{dict.admin?.settings?.failedToLoadSettings || "Failed to load settings"}</p>
        <Button onClick={loadSettings} className="mt-4">
          {dict.admin?.common?.retry || "Retry"}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">{dict.admin?.settings?.title || "Platform Settings"}</h1>
          <p className="text-muted-foreground">
            {dict.admin?.settings?.subtitle || "Configure all platform settings, pricing, and subscription plans"}
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {dict.admin?.common?.saving || "Saving..."}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {dict.admin?.settings?.saveAllChanges || "Save All Changes"}
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {dict.admin?.settings?.tabs?.general || "General"}
          </TabsTrigger>
          <TabsTrigger value="payment" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {dict.admin?.settings?.tabs?.payment || "Payment"}
          </TabsTrigger>
          <TabsTrigger value="volunteer-plans" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {dict.admin?.settings?.tabs?.volunteerPlans || "Impact Agent Plans"}
          </TabsTrigger>
          <TabsTrigger value="ngo-plans" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {dict.admin?.settings?.tabs?.ngoPlans || "NGO Plans"}
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {dict.admin?.settings?.tabs?.features || "Features"}
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            {dict.admin?.settings?.tabs?.integrations || "SMS & Integrations"}
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {dict.admin?.settings?.tabs?.security || "Security"}
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{dict.admin?.settings?.general?.platformInformation || "Platform Information"}</CardTitle>
              <CardDescription>
                {dict.admin?.settings?.general?.platformInformationDescription || "Basic information about your platform displayed across the site"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="platformName">{dict.admin?.settings?.general?.platformName || "Platform Name"}</Label>
                  <Input
                    id="platformName"
                    value={settings.platformName}
                    onChange={(e) =>
                      setSettings({ ...settings, platformName: e.target.value })
                    }
                    placeholder="JustBeCause Network"
                  />
                  <p className="text-xs text-muted-foreground">
                    {dict.admin?.settings?.general?.platformNameHint || "Displayed in navbar, emails, and meta tags"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">{dict.admin?.settings?.general?.supportEmail || "Support Email"}</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={settings.supportEmail}
                    onChange={(e) =>
                      setSettings({ ...settings, supportEmail: e.target.value })
                    }
                    placeholder="support@example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="platformDescription">{dict.admin?.settings?.general?.platformDescription || "Platform Description"}</Label>
                <Textarea
                  id="platformDescription"
                  value={settings.platformDescription}
                  onChange={(e) =>
                    setSettings({ ...settings, platformDescription: e.target.value })
                  }
                  rows={3}
                  placeholder="Connecting NGOs with skilled impact agents..."
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="platformLogo">{dict.admin?.settings?.general?.logoUrl || "Logo URL"}</Label>
                  <Input
                    id="platformLogo"
                    value={settings.platformLogo || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, platformLogo: e.target.value })
                    }
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="platformFavicon">{dict.admin?.settings?.general?.faviconUrl || "Favicon URL"}</Label>
                  <Input
                    id="platformFavicon"
                    value={settings.platformFavicon || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, platformFavicon: e.target.value })
                    }
                    placeholder="https://example.com/favicon.ico"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{dict.admin?.settings?.general?.seoSettings || "SEO Settings"}</CardTitle>
              <CardDescription>
                {dict.admin?.settings?.general?.seoSettingsDescription || "Search engine optimization settings"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="metaTitle">{dict.admin?.settings?.general?.metaTitle || "Meta Title"}</Label>
                <Input
                  id="metaTitle"
                  value={settings.metaTitle}
                  onChange={(e) =>
                    setSettings({ ...settings, metaTitle: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="metaDescription">{dict.admin?.settings?.general?.metaDescription || "Meta Description"}</Label>
                <Textarea
                  id="metaDescription"
                  value={settings.metaDescription}
                  onChange={(e) =>
                    setSettings({ ...settings, metaDescription: e.target.value })
                  }
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{dict.admin?.settings?.general?.socialLinks || "Social Links"}</CardTitle>
              <CardDescription>
                {dict.admin?.settings?.general?.socialLinksDescription || "Social media links displayed in the footer"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="facebook">{dict.admin?.settings?.general?.facebook || "Facebook"}</Label>
                  <Input
                    id="facebook"
                    value={settings.socialLinks?.facebook || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        socialLinks: { ...settings.socialLinks, facebook: e.target.value },
                      })
                    }
                    placeholder="https://facebook.com/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="twitter">{dict.admin?.settings?.general?.twitterX || "Twitter/X"}</Label>
                  <Input
                    id="twitter"
                    value={settings.socialLinks?.twitter || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        socialLinks: { ...settings.socialLinks, twitter: e.target.value },
                      })
                    }
                    placeholder="https://twitter.com/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instagram">{dict.admin?.settings?.general?.instagram || "Instagram"}</Label>
                  <Input
                    id="instagram"
                    value={settings.socialLinks?.instagram || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        socialLinks: { ...settings.socialLinks, instagram: e.target.value },
                      })
                    }
                    placeholder="https://instagram.com/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedin">{dict.admin?.settings?.general?.linkedin || "LinkedIn"}</Label>
                  <Input
                    id="linkedin"
                    value={settings.socialLinks?.linkedin || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        socialLinks: { ...settings.socialLinks, linkedin: e.target.value },
                      })
                    }
                    placeholder="https://linkedin.com/company/..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{dict.admin?.settings?.general?.maintenanceMode || "Maintenance Mode"}</CardTitle>
              <CardDescription>
                {dict.admin?.settings?.general?.maintenanceModeDescription || "Put the site in maintenance mode when needed"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{dict.admin?.settings?.general?.enableMaintenanceMode || "Enable Maintenance Mode"}</p>
                  <p className="text-sm text-muted-foreground">
                    {dict.admin?.settings?.general?.enableMaintenanceModeHint || "Users will see a maintenance message instead of the site"}
                  </p>
                </div>
                <Switch
                  checked={settings.maintenanceMode}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, maintenanceMode: checked })
                  }
                />
              </div>
              {settings.maintenanceMode && (
                <div className="space-y-2">
                  <Label htmlFor="maintenanceMessage">{dict.admin?.settings?.general?.maintenanceMessage || "Maintenance Message"}</Label>
                  <Textarea
                    id="maintenanceMessage"
                    value={settings.maintenanceMessage || ""}
                    onChange={(e) =>
                      setSettings({ ...settings, maintenanceMessage: e.target.value })
                    }
                    placeholder="We're currently performing scheduled maintenance..."
                    rows={2}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Settings */}
        <TabsContent value="payment" className="space-y-6">
          {/* Payment Gateway Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                {dict.admin?.settings?.payment?.paymentGatewayConfiguration || "Payment Gateway Configuration"}
              </CardTitle>
              <CardDescription>
                {dict.admin?.settings?.payment?.paymentGatewayConfigurationDescription || "Configure your payment gateway (Stripe or Razorpay). Keys are stored securely in the database."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Status */}
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm font-medium mb-2">{dict.admin?.settings?.payment?.currentStatus || "Current Status"}</p>
                <div className="flex flex-wrap gap-2">
                  {paymentConfig?.gateway === "none" || !paymentConfig?.gateway ? (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {dict.admin?.settings?.payment?.noPaymentGatewayConfigured || "No Payment Gateway Configured"}
                    </Badge>
                  ) : (
                    <>
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                        <Check className="h-3 w-3 mr-1" />
                        {(dict.admin?.settings?.payment?.gatewayActive || "{gateway} Active").replace("{gateway}", paymentConfig.gateway.charAt(0).toUpperCase() + paymentConfig.gateway.slice(1))}
                      </Badge>
                      <Badge variant={paymentConfig.isLive ? "default" : "secondary"}>
                        {paymentConfig.isLive ? ("🔴 " + (dict.admin?.settings?.payment?.liveMode || "LIVE MODE")) : ("🟡 " + (dict.admin?.settings?.payment?.testMode || "Test Mode"))}
                      </Badge>
                      {paymentConfig.testSuccessful !== undefined && (
                        <Badge variant={paymentConfig.testSuccessful ? "outline" : "destructive"}>
                          {paymentConfig.testSuccessful ? ("✓ " + (dict.admin?.settings?.payment?.connectionVerified || "Connection Verified")) : ("✗ " + (dict.admin?.settings?.payment?.connectionFailed || "Connection Failed"))}
                        </Badge>
                      )}
                    </>
                  )}
                </div>
                {paymentConfig?.lastTestedAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {(dict.admin?.settings?.payment?.lastTested || "Last tested: {date}").replace("{date}", new Date(paymentConfig.lastTestedAt).toLocaleString())}
                  </p>
                )}
              </div>

              {/* Gateway Selection */}
              <div className="space-y-2">
                <Label>{dict.admin?.settings?.payment?.activePaymentGateway || "Active Payment Gateway"}</Label>
                <Select 
                  value={paymentForm.gateway} 
                  onValueChange={(value: PaymentGatewayType) => setPaymentForm({ ...paymentForm, gateway: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment gateway" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{dict.admin?.settings?.payment?.nonePaymentsDisabled || "None (Payments Disabled)"}</SelectItem>
                    <SelectItem value="stripe">{dict.admin?.settings?.payment?.stripeGlobal || "Stripe (Global)"}</SelectItem>
                    <SelectItem value="razorpay">{dict.admin?.settings?.payment?.razorpayIndia || "Razorpay (India)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Live Mode Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium">{dict.admin?.settings?.payment?.liveModeLabel || "Live Mode"}</p>
                  <p className="text-sm text-muted-foreground">
                    {dict.admin?.settings?.payment?.liveModeHint || "Enable to process real payments. Keep disabled for testing."}
                  </p>
                </div>
                <Switch
                  checked={paymentForm.isLive}
                  onCheckedChange={(checked) => setPaymentForm({ ...paymentForm, isLive: checked })}
                />
              </div>

              <Separator />

              {/* Stripe Configuration */}
              {paymentForm.gateway === "stripe" && (
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    {dict.admin?.settings?.payment?.stripeConfiguration || "Stripe Configuration"}
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="stripePublishableKey">{dict.admin?.settings?.payment?.publishableKey || "Publishable Key"}</Label>
                      <Input
                        id="stripePublishableKey"
                        value={paymentForm.stripePublishableKey}
                        onChange={(e) => setPaymentForm({ ...paymentForm, stripePublishableKey: e.target.value })}
                        placeholder={paymentConfig?.stripePublishableKey || "pk_live_... or pk_test_..."}
                      />
                      <p className="text-xs text-muted-foreground">
                        {dict.admin?.settings?.payment?.publishableKeyHint || "Safe to expose - used on frontend"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stripeSecretKey">{dict.admin?.settings?.payment?.secretKey || "Secret Key"}</Label>
                      <div className="relative">
                        <Input
                          id="stripeSecretKey"
                          type={showStripeSecret ? "text" : "password"}
                          value={paymentForm.stripeSecretKey}
                          onChange={(e) => setPaymentForm({ ...paymentForm, stripeSecretKey: e.target.value })}
                          placeholder={paymentConfig?.stripeSecretKeyMasked || "sk_live_... or sk_test_..."}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={() => setShowStripeSecret(!showStripeSecret)}
                        >
                          {showStripeSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {dict.admin?.settings?.payment?.secretKeyHint || "Keep secret - stored encrypted in database"}
                      </p>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm">
                    <p className="font-medium mb-2">{dict.admin?.settings?.payment?.getStripeKeys || "Get Stripe Keys:"}</p>
                    <ol className="list-decimal ml-4 space-y-1 text-xs text-muted-foreground">
                      <li>{dict.admin?.settings?.payment?.stripeStep1 || "Go to "}<a href="https://dashboard.stripe.com/apikeys" target="_blank" className="text-blue-600 hover:underline">Stripe Dashboard → API Keys</a></li>
                      <li>{dict.admin?.settings?.payment?.stripeStep2 || "Copy your Publishable key (pk_live_... or pk_test_...)"}</li>
                      <li>{dict.admin?.settings?.payment?.stripeStep3 || "Reveal and copy your Secret key (sk_live_... or sk_test_...)"}</li>
                      <li>{dict.admin?.settings?.payment?.stripeStep4 || "For testing, use test mode keys first"}</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* Razorpay Configuration */}
              {paymentForm.gateway === "razorpay" && (
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    {dict.admin?.settings?.payment?.razorpayConfiguration || "Razorpay Configuration"}
                  </h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="razorpayKeyId">{dict.admin?.settings?.payment?.keyId || "Key ID"}</Label>
                      <Input
                        id="razorpayKeyId"
                        value={paymentForm.razorpayKeyId}
                        onChange={(e) => setPaymentForm({ ...paymentForm, razorpayKeyId: e.target.value })}
                        placeholder={paymentConfig?.razorpayKeyId || "rzp_live_... or rzp_test_..."}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="razorpayKeySecret">{dict.admin?.settings?.payment?.keySecret || "Key Secret"}</Label>
                      <div className="relative">
                        <Input
                          id="razorpayKeySecret"
                          type={showRazorpaySecret ? "text" : "password"}
                          value={paymentForm.razorpayKeySecret}
                          onChange={(e) => setPaymentForm({ ...paymentForm, razorpayKeySecret: e.target.value })}
                          placeholder={paymentConfig?.razorpayKeySecretMasked || "Enter secret key"}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={() => setShowRazorpaySecret(!showRazorpaySecret)}
                        >
                          {showRazorpaySecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm">
                    <p className="font-medium mb-2">{dict.admin?.settings?.payment?.getRazorpayKeys || "Get Razorpay Keys:"}</p>
                    <ol className="list-decimal ml-4 space-y-1 text-xs text-muted-foreground">
                      <li>{dict.admin?.settings?.payment?.razorpayStep1 || "Go to "}<a href="https://dashboard.razorpay.com/app/keys" target="_blank" className="text-blue-600 hover:underline">Razorpay Dashboard → API Keys</a></li>
                      <li>{dict.admin?.settings?.payment?.razorpayStep2 || "Generate new keys or copy existing ones"}</li>
                      <li>{dict.admin?.settings?.payment?.razorpayStep3 || "Use test mode keys for development"}</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* Save & Test Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button onClick={savePaymentConfig} disabled={paymentSaving}>
                  {paymentSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {dict.admin?.common?.saving || "Saving..."}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {dict.admin?.settings?.payment?.savePaymentConfiguration || "Save Payment Configuration"}
                    </>
                  )}
                </Button>
                {paymentForm.gateway !== "none" && (
                  <Button variant="outline" onClick={testPaymentConfig} disabled={paymentTesting}>
                    {paymentTesting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {dict.admin?.settings?.payment?.testing || "Testing..."}
                      </>
                    ) : (
                      <>
                        <TestTube className="h-4 w-4 mr-2" />
                        {dict.admin?.settings?.payment?.testConnection || "Test Connection"}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Test Payment Card */}
          {paymentForm.gateway !== "none" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  {dict.admin?.settings?.payment?.testPaymentTitle || "Test Payment ($1)"}
                </CardTitle>
                <CardDescription>
                  {dict.admin?.settings?.payment?.testPaymentDescription || "Create a test payment to verify your payment gateway is working correctly. This will create a real payment intent but won't charge unless completed."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{dict.admin?.settings?.payment?.testAmount || "Test Amount"}</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{getCurrencySymbol()}</span>
                      <Input
                        type="number"
                        value={testAmount}
                        onChange={(e) => setTestAmount(e.target.value)}
                        min="1"
                        max="100"
                        className="w-24"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {dict.admin?.settings?.payment?.testAmountHint || "Minimum $1 for testing"}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="outline"
                  onClick={async () => {
                    try {
                      const amount = Math.max(1, parseInt(testAmount) || 1) * 100; // Convert to cents
                      const response = await fetch("/api/admin/test-payment", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                          amount,
                          currency: settings?.currency || "USD"
                        })
                      });
                      const data = await response.json();
                      if (data.success) {
                        toast.success(`Test payment created: ${data.message}`);
                        console.log("Test payment details:", data);
                      } else {
                        toast.error(data.error || (dict.admin?.settings?.toasts?.testPaymentFailed || "Failed to create test payment"));
                      }
                    } catch (error) {
                      toast.error(dict.admin?.settings?.toasts?.testPaymentFailed || "Failed to create test payment");
                    }
                  }}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {dict.admin?.settings?.payment?.createTestPayment || "Create Test Payment"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {dict.admin?.settings?.payment?.testPaymentHint || "This creates a PaymentIntent. Check the browser console for details."}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{dict.admin?.settings?.payment?.currencyAndPricing || "Currency & Pricing"}</CardTitle>
              <CardDescription>
                {dict.admin?.settings?.payment?.currencyAndPricingDescription || "Configure your payment currency and default pricing"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">{dict.admin?.settings?.payment?.currency || "Currency"}</Label>
                  <Select
                    value={settings?.currency}
                    onValueChange={(value: SupportedCurrency) =>
                      setSettings(settings ? { ...settings, currency: value } : null)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((curr) => (
                        <SelectItem key={curr.value} value={curr.value}>
                          {curr.symbol} - {curr.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {dict.admin?.settings?.payment?.currencyHint || "All prices will be displayed in this currency"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{dict.admin?.settings?.payment?.businessModelInfo || "Business Model Info"}</CardTitle>
              <CardDescription>
                {dict.admin?.settings?.payment?.businessModelInfoDescription || "How the subscription system works"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                <div className="flex items-start gap-2">
                  <Building2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">{dict.admin?.settings?.payment?.ngoProSubscription || "NGO Pro Subscription"}</p>
                    <p className="text-sm text-muted-foreground">
                      {dict.admin?.settings?.payment?.ngoProSubscriptionDescription || "NGOs with Pro subscription can unlock unlimited FREE impact agent profiles. NGOs can view paid impact agent profiles without subscription."}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">{dict.admin?.settings?.payment?.impactAgentProSubscription || "Impact Agent Pro Subscription"}</p>
                    <p className="text-sm text-muted-foreground">
                      {(dict.admin?.settings?.payment?.impactAgentProSubscriptionDescription || "Impact Agents with Pro subscription can apply to unlimited jobs. Free impact agents are limited to {count} applications/month.").replace("{count}", String(settings?.volunteerFreeApplicationsPerMonth || 3))}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {dict.admin?.settings?.payment?.businessModelNote || "Note: Individual profile unlock payments are not part of the business model. NGOs must upgrade to Pro to unlock impact agent profiles."}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Volunteer Plans */}
        <TabsContent value="volunteer-plans" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="secondary">Free Plan</Badge>
                {dict.admin?.settings?.volunteerPlans?.freePlanTitle || "Impact Agent Free Plan Limits"}
              </CardTitle>
              <CardDescription>
                {dict.admin?.settings?.volunteerPlans?.freePlanDescription || "Configure limits for impact agents on the free plan"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="volunteerFreeApps">{dict.admin?.settings?.volunteerPlans?.applicationsPerMonth || "Applications per Month"}</Label>
                  <Input
                    id="volunteerFreeApps"
                    type="number"
                    value={settings.volunteerFreeApplicationsPerMonth || 3}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        volunteerFreeApplicationsPerMonth: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {dict.admin?.settings?.volunteerPlans?.applicationsPerMonthHint || "Number of opportunity applications allowed per month"}
                  </p>
                </div>
                <div className="space-y-2 flex items-center gap-4 pt-6">
                  <Switch
                    checked={settings.volunteerFreeProfileVisibility !== false}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, volunteerFreeProfileVisibility: checked })
                    }
                  />
                  <div>
                    <Label>{dict.admin?.settings?.volunteerPlans?.profileVisibility || "Profile Visibility"}</Label>
                    <p className="text-xs text-muted-foreground">
                      {dict.admin?.settings?.volunteerPlans?.profileVisibilityHint || "Allow free plan impact agents to be visible in search"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge className="bg-primary">Pro Plan</Badge>
                {dict.admin?.settings?.volunteerPlans?.proPlanTitle || "Impact Agent Pro Plan"}
              </CardTitle>
              <CardDescription>
                {dict.admin?.settings?.volunteerPlans?.proPlanDescription || "Configure pricing and features for the impact agent pro plan"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="volunteerProPrice">{dict.admin?.settings?.volunteerPlans?.monthlyPrice || "Monthly Price"}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {getCurrencySymbol()}
                  </span>
                  <Input
                    id="volunteerProPrice"
                    type="number"
                    className="pl-8"
                    value={settings.volunteerProPrice || 999}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        volunteerProPrice: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label>{dict.admin?.settings?.volunteerPlans?.proPlanFeatures || "Pro Plan Features"}</Label>
                <p className="text-sm text-muted-foreground">
                  {dict.admin?.settings?.volunteerPlans?.proPlanFeaturesHint || "These features are displayed on the pricing page"}
                </p>
                <div className="space-y-2">
                  {(settings.volunteerProFeatures || []).map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={feature}
                        onChange={(e) => {
                          const newFeatures = [...(settings.volunteerProFeatures || [])]
                          newFeatures[index] = e.target.value
                          setSettings({ ...settings, volunteerProFeatures: newFeatures })
                        }}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeVolunteerFeature(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newVolunteerFeature}
                    onChange={(e) => setNewVolunteerFeature(e.target.value)}
                    placeholder={dict.admin?.settings?.volunteerPlans?.addFeaturePlaceholder || "Add a feature..."}
                    onKeyDown={(e) => e.key === "Enter" && addVolunteerFeature()}
                  />
                  <Button variant="outline" onClick={addVolunteerFeature}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NGO Plans */}
        <TabsContent value="ngo-plans" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant="secondary">Free Plan</Badge>
                {dict.admin?.settings?.ngoPlans?.freePlanTitle || "NGO Free Plan Limits"}
              </CardTitle>
              <CardDescription>
                {dict.admin?.settings?.ngoPlans?.freePlanDescription || "Configure limits for NGOs on the free plan"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ngoFreeProjects">{dict.admin?.settings?.ngoPlans?.opportunitiesPerMonth || "Opportunities per Month"}</Label>
                  <Input
                    id="ngoFreeProjects"
                    type="number"
                    value={settings.ngoFreeProjectsPerMonth || 3}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        ngoFreeProjectsPerMonth: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {dict.admin?.settings?.ngoPlans?.opportunitiesPerMonthHint || "Number of opportunities NGOs can post per month"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ngoFreeUnlocks">{dict.admin?.settings?.ngoPlans?.profileUnlocksPerMonth || "Profile Unlocks per Month"}</Label>
                  <Input
                    id="ngoFreeUnlocks"
                    type="number"
                    value={settings.ngoFreeProfileUnlocksPerMonth || 0}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        ngoFreeProfileUnlocksPerMonth: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {dict.admin?.settings?.ngoPlans?.profileUnlocksPerMonthHint || "Free profile unlocks (0 = must upgrade to Pro)"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge className="bg-primary">Pro Plan</Badge>
                {dict.admin?.settings?.ngoPlans?.proPlanTitle || "NGO Pro Plan"}
              </CardTitle>
              <CardDescription>
                {dict.admin?.settings?.ngoPlans?.proPlanDescription || "Configure pricing and features for the NGO pro plan"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ngoProPrice">{dict.admin?.settings?.ngoPlans?.monthlyPrice || "Monthly Price"}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {getCurrencySymbol()}
                    </span>
                    <Input
                      id="ngoProPrice"
                      type="number"
                      className="pl-8"
                      value={settings.ngoProPrice || 2999}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          ngoProPrice: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2 flex items-center gap-2 pt-6">
                  <Switch
                    checked={settings.ngoProProjectsUnlimited !== false}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, ngoProProjectsUnlimited: checked })
                    }
                  />
                  <Label>{dict.admin?.settings?.ngoPlans?.unlimitedOpportunities || "Unlimited Opportunities"}</Label>
                </div>
                <div className="space-y-2 flex items-center gap-2 pt-6">
                  <Switch
                    checked={settings.ngoProUnlocksUnlimited !== false}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, ngoProUnlocksUnlimited: checked })
                    }
                  />
                  <Label>{dict.admin?.settings?.ngoPlans?.unlimitedUnlocks || "Unlimited Unlocks"}</Label>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label>{dict.admin?.settings?.ngoPlans?.proPlanFeatures || "Pro Plan Features"}</Label>
                <p className="text-sm text-muted-foreground">
                  {dict.admin?.settings?.ngoPlans?.proPlanFeaturesHint || "These features are displayed on the pricing page"}
                </p>
                <div className="space-y-2">
                  {(settings.ngoProFeatures || []).map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={feature}
                        onChange={(e) => {
                          const newFeatures = [...(settings.ngoProFeatures || [])]
                          newFeatures[index] = e.target.value
                          setSettings({ ...settings, ngoProFeatures: newFeatures })
                        }}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeNGOFeature(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newNGOFeature}
                    onChange={(e) => setNewNGOFeature(e.target.value)}
                    placeholder={dict.admin?.settings?.ngoPlans?.addFeaturePlaceholder || "Add a feature..."}
                    onKeyDown={(e) => e.key === "Enter" && addNGOFeature()}
                  />
                  <Button variant="outline" onClick={addNGOFeature}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features Toggle */}
        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{dict.admin?.settings?.features?.featureToggles || "Feature Toggles"}</CardTitle>
              <CardDescription>
                {dict.admin?.settings?.features?.featureTogglesDescription || "Enable or disable platform features globally"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{dict.admin?.settings?.features?.paymentsFeature || "Payments"}</p>
                  <p className="text-sm text-muted-foreground">
                    {dict.admin?.settings?.features?.paymentsFeatureHint || "Enable payment processing for subscriptions and profile unlocks"}
                  </p>
                </div>
                <Switch
                  checked={settings.enablePayments}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, enablePayments: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{dict.admin?.settings?.features?.messagingFeature || "Messaging"}</p>
                  <p className="text-sm text-muted-foreground">
                    {dict.admin?.settings?.features?.messagingFeatureHint || "Allow users to send messages to each other"}
                  </p>
                </div>
                <Switch
                  checked={settings.enableMessaging}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, enableMessaging: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{dict.admin?.settings?.features?.notificationsFeature || "Notifications"}</p>
                  <p className="text-sm text-muted-foreground">
                    {dict.admin?.settings?.features?.notificationsFeatureHint || "Send email and in-app notifications to users"}
                  </p>
                </div>
                <Switch
                  checked={settings.enableNotifications}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, enableNotifications: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SMS & Integrations */}
        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                {dict.admin?.settings?.integrations?.smsProviderConfiguration || "SMS Provider Configuration"}
              </CardTitle>
              <CardDescription>
                {dict.admin?.settings?.integrations?.smsProviderConfigurationDescription || "Configure SMS provider for phone number verification during onboarding"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Status */}
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm font-medium mb-2">{dict.admin?.settings?.integrations?.currentStatus || "Current Status"}</p>
                <div className="flex flex-wrap gap-2">
                  {smsConfig?.provider === "none" ? (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {dict.admin?.settings?.integrations?.noSmsProviderConfigured || "No SMS Provider Configured (Dev Mode)"}
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-700">
                      <Check className="h-3 w-3 mr-1" />
                      {(dict.admin?.settings?.integrations?.providerConfigured || "{provider} Configured").replace("{provider}", smsConfig?.provider?.toUpperCase() || "")}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Provider Selection */}
              <div className="space-y-2">
                <Label>{dict.admin?.settings?.integrations?.smsProvider || "SMS Provider"}</Label>
                <Select 
                  value={smsForm.provider} 
                  onValueChange={(value) => setSmsForm({ ...smsForm, provider: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select SMS provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{dict.admin?.settings?.integrations?.noneDevelopmentMode || "None (Development Mode)"}</SelectItem>
                    <SelectItem value="twilio">{dict.admin?.settings?.integrations?.twilio || "Twilio"}</SelectItem>
                    <SelectItem value="vonage">{dict.admin?.settings?.integrations?.vonageNexmo || "Vonage (Nexmo)"}</SelectItem>
                    <SelectItem value="msg91">{dict.admin?.settings?.integrations?.msg91India || "MSG91 (India)"}</SelectItem>
                    <SelectItem value="textlocal">{dict.admin?.settings?.integrations?.textLocal || "TextLocal"}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {dict.admin?.settings?.integrations?.devModeHint || "In development mode, OTP codes are shown in console/browser"}
                </p>
              </div>

              <Separator />

              {/* Twilio Configuration */}
              {smsForm.provider === "twilio" && (
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    {dict.admin?.settings?.integrations?.twilioConfiguration || "Twilio Configuration"}
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="twilioAccountSid">{dict.admin?.settings?.integrations?.accountSid || "Account SID"}</Label>
                      <Input
                        id="twilioAccountSid"
                        value={smsForm.twilioAccountSid}
                        onChange={(e) => setSmsForm({ ...smsForm, twilioAccountSid: e.target.value })}
                        placeholder={smsConfig?.twilioAccountSid || "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="twilioAuthToken">{dict.admin?.settings?.integrations?.authToken || "Auth Token"}</Label>
                      <Input
                        id="twilioAuthToken"
                        type="password"
                        value={smsForm.twilioAuthToken}
                        onChange={(e) => setSmsForm({ ...smsForm, twilioAuthToken: e.target.value })}
                        placeholder="Enter auth token"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twilioPhoneNumber">{dict.admin?.settings?.integrations?.twilioPhoneNumber || "Twilio Phone Number"}</Label>
                    <Input
                      id="twilioPhoneNumber"
                      value={smsForm.twilioPhoneNumber}
                      onChange={(e) => setSmsForm({ ...smsForm, twilioPhoneNumber: e.target.value })}
                      placeholder="+1234567890"
                    />
                    <p className="text-xs text-muted-foreground">
                      {dict.admin?.settings?.integrations?.twilioPhoneNumberHint || "The phone number SMS messages will be sent from"}
                    </p>
                  </div>
                </div>
              )}

              {/* Vonage Configuration */}
              {smsForm.provider === "vonage" && (
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    {dict.admin?.settings?.integrations?.vonageConfiguration || "Vonage (Nexmo) Configuration"}
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vonageApiKey">{dict.admin?.settings?.integrations?.apiKey || "API Key"}</Label>
                      <Input
                        id="vonageApiKey"
                        value={smsForm.vonageApiKey}
                        onChange={(e) => setSmsForm({ ...smsForm, vonageApiKey: e.target.value })}
                        placeholder="Enter Vonage API Key"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vonageApiSecret">{dict.admin?.settings?.integrations?.apiSecret || "API Secret"}</Label>
                      <Input
                        id="vonageApiSecret"
                        type="password"
                        value={smsForm.vonageApiSecret}
                        onChange={(e) => setSmsForm({ ...smsForm, vonageApiSecret: e.target.value })}
                        placeholder="Enter API Secret"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vonageFromNumber">{dict.admin?.settings?.integrations?.fromNumberBrandName || "From Number / Brand Name"}</Label>
                    <Input
                      id="vonageFromNumber"
                      value={smsForm.vonageFromNumber}
                      onChange={(e) => setSmsForm({ ...smsForm, vonageFromNumber: e.target.value })}
                      placeholder="JustBecause or +1234567890"
                    />
                    <p className="text-xs text-muted-foreground">
                      {dict.admin?.settings?.integrations?.fromNumberBrandNameHint || "Can be a brand name (alphanumeric) or phone number. Brand names work in most countries."}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm">
                    <p className="font-medium mb-2">{dict.admin?.settings?.integrations?.getVonageCredentials || "Get Vonage Credentials:"}</p>
                    <ol className="list-decimal ml-4 space-y-1 text-xs text-muted-foreground">
                      <li>{dict.admin?.settings?.integrations?.vonageStep1 || "Login: "}<a href="https://dashboard.nexmo.com" target="_blank" className="text-blue-600 hover:underline">dashboard.nexmo.com</a></li>
                      <li>{dict.admin?.settings?.integrations?.vonageStep2 || "Go to Settings → API Settings"}</li>
                      <li>{dict.admin?.settings?.integrations?.vonageStep3 || "Copy your API Key and API Secret"}</li>
                      <li>{dict.admin?.settings?.integrations?.vonageStep4 || "Current Balance: $9.00"}</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* MSG91 Configuration */}
              {smsForm.provider === "msg91" && (
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    {dict.admin?.settings?.integrations?.msg91Configuration || "MSG91 Configuration"}
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="msg91AuthKey">{dict.admin?.settings?.integrations?.msg91AuthKey || "Auth Key"}</Label>
                      <Input
                        id="msg91AuthKey"
                        type="password"
                        value={smsForm.msg91AuthKey}
                        onChange={(e) => setSmsForm({ ...smsForm, msg91AuthKey: e.target.value })}
                        placeholder="Enter MSG91 auth key"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="msg91SenderId">{dict.admin?.settings?.integrations?.msg91SenderId || "Sender ID"}</Label>
                      <Input
                        id="msg91SenderId"
                        value={smsForm.msg91SenderId}
                        onChange={(e) => setSmsForm({ ...smsForm, msg91SenderId: e.target.value })}
                        placeholder="VERIFY"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="msg91TemplateId">{dict.admin?.settings?.integrations?.msg91TemplateId || "Template ID (Optional)"}</Label>
                    <Input
                      id="msg91TemplateId"
                      value={smsForm.msg91TemplateId}
                      onChange={(e) => setSmsForm({ ...smsForm, msg91TemplateId: e.target.value })}
                      placeholder="DLT approved template ID"
                    />
                    <p className="text-xs text-muted-foreground">
                      {dict.admin?.settings?.integrations?.msg91TemplateIdHint || "Required for Indian DLT compliance"}
                    </p>
                  </div>
                </div>
              )}

              {/* TextLocal Configuration */}
              {smsForm.provider === "textlocal" && (
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    {dict.admin?.settings?.integrations?.textLocalConfiguration || "TextLocal Configuration"}
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="textlocalApiKey">{dict.admin?.settings?.integrations?.textLocalApiKey || "API Key"}</Label>
                      <Input
                        id="textlocalApiKey"
                        type="password"
                        value={smsForm.textlocalApiKey}
                        onChange={(e) => setSmsForm({ ...smsForm, textlocalApiKey: e.target.value })}
                        placeholder="Enter TextLocal API key"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="textlocalSender">{dict.admin?.settings?.integrations?.textLocalSenderName || "Sender Name"}</Label>
                      <Input
                        id="textlocalSender"
                        value={smsForm.textlocalSender}
                        onChange={(e) => setSmsForm({ ...smsForm, textlocalSender: e.target.value })}
                        placeholder="VERIFY"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Save Button */}
              <Button onClick={saveSmsConfig} disabled={smsSaving} className="w-full sm:w-auto">
                {smsSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {dict.admin?.common?.saving || "Saving..."}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {dict.admin?.settings?.integrations?.saveSmsConfiguration || "Save SMS Configuration"}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Test SMS */}
          <Card>
            <CardHeader>
              <CardTitle>{dict.admin?.settings?.integrations?.testSmsConfiguration || "Test SMS Configuration"}</CardTitle>
              <CardDescription>
                {dict.admin?.settings?.integrations?.testSmsConfigurationDescription || "Send a test SMS to verify your configuration is working"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder={dict.admin?.settings?.integrations?.testPhonePlaceholder || "Enter phone number (e.g., +919876543210)"}
                  value={smsTestPhone}
                  onChange={(e) => setSmsTestPhone(e.target.value)}
                />
                <Button onClick={testSmsConfig} disabled={smsTesting || smsForm.provider === "none"}>
                  {smsTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      {dict.admin?.settings?.integrations?.sendTest || "Send Test"}
                    </>
                  )}
                </Button>
              </div>
              {smsForm.provider === "none" && (
                <p className="text-sm text-yellow-600">
                  {dict.admin?.settings?.integrations?.configureProviderFirst || "Configure an SMS provider above before testing"}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Phone Verification Toggle */}
          <Card>
            <CardHeader>
              <CardTitle>{dict.admin?.settings?.integrations?.phoneVerificationSettings || "Phone Verification Settings"}</CardTitle>
              <CardDescription>
                {dict.admin?.settings?.integrations?.phoneVerificationSettingsDescription || "Control phone verification requirements"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{dict.admin?.settings?.integrations?.requirePhoneVerification || "Require Phone Verification"}</p>
                  <p className="text-sm text-muted-foreground">
                    {dict.admin?.settings?.integrations?.requirePhoneVerificationHint || "Require impact agents to verify their phone number during onboarding"}
                  </p>
                </div>
                <Switch
                  checked={settings?.requirePhoneVerification || false}
                  onCheckedChange={(checked) =>
                    setSettings(settings ? { ...settings, requirePhoneVerification: checked } : null)
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{dict.admin?.settings?.security?.verificationRequirements || "Verification Requirements"}</CardTitle>
              <CardDescription>
                {dict.admin?.settings?.security?.verificationRequirementsDescription || "Set verification requirements for users"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{dict.admin?.settings?.security?.emailVerification || "Email Verification"}</p>
                  <p className="text-sm text-muted-foreground">
                    {dict.admin?.settings?.security?.emailVerificationHint || "Require users to verify their email address before using the platform"}
                  </p>
                </div>
                <Switch
                  checked={settings.requireEmailVerification}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, requireEmailVerification: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{dict.admin?.settings?.security?.ngoVerification || "NGO Verification"}</p>
                  <p className="text-sm text-muted-foreground">
                    {dict.admin?.settings?.security?.ngoVerificationHint || "Require NGOs to be verified by admin before they can post opportunities"}
                  </p>
                </div>
                <Switch
                  checked={settings.requireNGOVerification}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, requireNGOVerification: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
