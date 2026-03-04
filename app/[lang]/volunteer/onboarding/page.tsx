"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useGeolocated } from "react-geolocated"
import { useRouter } from "next/navigation"
import { useLocale, localePath } from "@/hooks/use-locale"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { getCurrencySymbol } from "@/lib/currency"
import { Separator } from "@/components/ui/separator"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Heart,
  ArrowRight,
  ArrowLeft,
  User,
  Briefcase,
  MapPin,
  Loader2,
  CheckCircle,
  Clock,
  DollarSign,
  Lightbulb,
  LocateFixed,
  Phone,
  ShieldCheck,
} from "lucide-react"
import { skillCategories, experienceLevels, causes, workModes } from "@/lib/skills-data"
import { saveVolunteerOnboarding, completeOnboarding } from "@/lib/actions"
import { authClient } from "@/lib/auth-client"
import { OnboardingPageSkeleton } from "@/components/ui/page-skeletons"
import { useDictionary } from "@/components/dictionary-provider"

type SelectedSkill = {
  categoryId: string
  subskillId: string
  level: string
}

export default function VolunteerOnboardingPage() {
  const router = useRouter()
  const locale = useLocale()
  const dict = useDictionary()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState("")
  const totalSteps = 5

  // Check if user is authenticated
  const { data: session, isPending } = authClient.useSession()
  
  useEffect(() => {
    if (!isPending) {
      if (!session?.user) {
        // Not authenticated, redirect to sign in
        router.push(localePath("/auth/signin", locale))
      } else {
        const user = session.user as any
        // If already onboarded, redirect to dashboard
        if (user.isOnboarded) {
          router.push(localePath("/volunteer/dashboard", locale))
        } else if (user.role !== "volunteer" && user.role !== "user") {
          // Wrong role, redirect to correct onboarding or dashboard
          if (user.role === "ngo") {
            router.push(localePath("/ngo/onboarding", locale))
          } else {
            router.push(localePath("/auth/role-select", locale))
          }
        } else {
          setIsCheckingAuth(false)
        }
      }
    }
  }, [session, isPending, router])

  // Step 1: Profile basics
  const [profile, setProfile] = useState({
    phone: "",
    location: "",
    bio: "",
    linkedinUrl: "",
    portfolioUrl: "",
  })

  // Phone verification state
  const [phoneVerificationStep, setPhoneVerificationStep] = useState<"input" | "otp" | "verified">("input")
  const [phoneOtp, setPhoneOtp] = useState(["", "", "", "", "", ""])
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false)
  const [phoneResendCooldown, setPhoneResendCooldown] = useState(0)
  const [devOtp, setDevOtp] = useState<string | null>(null) // For development mode only
  const phoneOtpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Phone resend cooldown timer
  useEffect(() => {
    if (phoneResendCooldown > 0) {
      const timer = setTimeout(() => setPhoneResendCooldown(phoneResendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [phoneResendCooldown])

  // Use react-geolocated for geolocation
  const {
    coords,
    getPosition,
    positionError,
  } = useGeolocated({
    positionOptions: { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    watchPosition: false,
    suppressLocationOnMount: true,
  });
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Reverse geocode location using free Nominatim (OpenStreetMap) — state/region level
  const getGoogleLocation = async () => {
    console.log('[GEO-DEBUG] === getGoogleLocation called ===' );
    console.log('[GEO-DEBUG] window.isSecureContext:', window.isSecureContext);
    console.log('[GEO-DEBUG] location.protocol:', window.location.protocol);
    console.log('[GEO-DEBUG] navigator.geolocation exists:', !!navigator.geolocation);
    
    setError("");
    setIsGettingLocation(true);
    
    if (!navigator.geolocation) {
      console.log('[GEO-DEBUG] navigator.geolocation is falsy — not supported');
      setError(dict.volunteer?.onboarding?.geoNotSupported || "Geolocation is not supported by your browser");
      setIsGettingLocation(false);
      return;
    }
    
    // Log current permission state for debugging (but never block — always try getCurrentPosition)
    try {
      if (navigator.permissions) {
        const permStatus = await navigator.permissions.query({ name: 'geolocation' });
        console.log('[GEO-DEBUG] Permission state BEFORE request:', permStatus.state);
        // 'granted' → will succeed immediately
        // 'prompt'  → browser will show the permission popup
        // 'denied'  → getCurrentPosition will fire error callback, but some browsers re-prompt
      } else {
        console.log('[GEO-DEBUG] navigator.permissions not available, skipping pre-check');
      }
    } catch (permErr) {
      console.log('[GEO-DEBUG] Permissions API query failed:', permErr);
    }
    
    console.log('[GEO-DEBUG] Calling navigator.geolocation.getCurrentPosition...');
    
    // This triggers the browser permission prompt if state is 'prompt'
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        console.log('[GEO-DEBUG] SUCCESS! Got position:', position.coords.latitude, position.coords.longitude);
        const { latitude, longitude } = position.coords;
        
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=5&addressdetails=1`,
            {
              headers: {
                'User-Agent': 'JustBecauseNetwork/1.0',
                'Accept-Language': 'en-US,en;q=0.9',
              },
            }
          );
          
          if (!response.ok) throw new Error('Geocoding failed');
          const data = await response.json();
          
          const state = data.address?.state || data.address?.region || data.address?.state_district;
          const country = data.address?.country;
          const locationParts = [state, country].filter(Boolean);
          
          if (locationParts.length > 0) {
            setProfile(prev => ({ ...prev, location: locationParts.join(", ") }));
          } else {
            setError("Could not determine your region. Please enter manually.");
          }
        } catch (err) {
          console.error('Nominatim reverse geocoding error:', err);
          setError("Failed to get location details. Please try manual entry.");
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        console.log('[GEO-DEBUG] ERROR callback fired!');
        console.log('[GEO-DEBUG] error.code:', error.code, '(1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT)');
        console.log('[GEO-DEBUG] error.message:', error.message);
        let errorMessage = "Unable to get your location.";
        if (error.code === 1) {
          errorMessage = "Location permission denied. Click the lock/site-settings icon in your browser's address bar, set Location to 'Allow', then reload and try again.";
        } else if (error.code === 2) {
          errorMessage = "Location unavailable. Your device may not support geolocation or network location services are disabled.";
        } else if (error.code === 3) {
          errorMessage = "Location request timed out. Please check your internet connection and try again.";
        }
        setError(errorMessage);
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 300000
      }
    );
  };

  // When coords change, reverse geocode to state/region level
  useEffect(() => {
    const fetchLocation = async () => {
      if (coords) {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&zoom=5&addressdetails=1`,
            {
              headers: {
                'User-Agent': 'JustBecauseNetwork/1.0',
                'Accept-Language': 'en-US,en;q=0.9'
              }
            }
          );
          if (!response.ok) throw new Error('Failed to fetch address');
          const data = await response.json();
          const state = data.address?.state || data.address?.region || data.address?.state_district;
          const country = data.address?.country;
          const locationParts = [state, country].filter(Boolean);
          const locationString = locationParts.join(", ");
          if (locationString) {
            setProfile(prev => ({ ...prev, location: locationString }));
          } else {
            setError('Could not determine your region. Please enter manually.');
            setTimeout(() => setError(''), 5000);
          }
        } catch (error) {
          console.error('Reverse geocoding failed:', error);
          setError('Failed to fetch location details. Please enter manually.');
          setTimeout(() => setError(''), 5000);
        }
        setIsGettingLocation(false);
      }
    };
    if (isGettingLocation && coords) {
      fetchLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  useEffect(() => {
    if (positionError && isGettingLocation) {
      let errorMessage = "Unable to get your location.";
      if (positionError.code === 1) errorMessage = "Location permission denied. Please enable location services in your browser settings.";
      else if (positionError.code === 2) errorMessage = "Location unavailable. Your device may not support geolocation or network location services are disabled.";
      else if (positionError.code === 3) errorMessage = "Location request timed out. Please check your internet connection and try again. This can happen in areas with poor GPS signal.";
      setError(errorMessage);
      setIsGettingLocation(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionError]);

  // Step 2: Skills
  const [selectedSkills, setSelectedSkills] = useState<SelectedSkill[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Step 3: Causes & Interests
  const [selectedCauses, setSelectedCauses] = useState<string[]>([])

  // Step 4: Work preferences
  const [workPreferences, setWorkPreferences] = useState({
    volunteerType: "free", // free, paid, both
    freeHoursPerMonth: 5, // Hours available to work for free per month
    hourlyRate: 0, // Hourly rate for paid work
    discountedRate: 0, // Discounted rate for NGOs (low bono)
    currency: "USD",
    workMode: "remote", // remote, onsite, hybrid
    hoursPerWeek: "5-10",
    availability: "weekends", // weekdays, weekends, evenings, flexible
  })

  const progress = (step / totalSteps) * 100

  // Phone verification functions
  const sendPhoneOtp = async () => {
    if (!profile.phone || profile.phone.length < 10) {
      setError("Please enter a valid phone number")
      return
    }
    
    setError("")
    setPhoneOtpLoading(true)
    
    try {
      const response = await fetch("/api/auth/send-sms-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profile.phone }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        setError(data.error || "Failed to send verification code")
        setPhoneOtpLoading(false)
        return
      }
      
      // For development mode, store the OTP
      if (data.devOtp) {
        setDevOtp(data.devOtp)
      }
      
      setPhoneVerificationStep("otp")
      setPhoneResendCooldown(60)
    } catch (err: any) {
      setError("Failed to send verification code. Please try again.")
    } finally {
      setPhoneOtpLoading(false)
    }
  }

  const verifyPhoneOtp = async () => {
    const otpCode = phoneOtp.join("")
    if (otpCode.length !== 6) {
      setError("Please enter the complete 6-digit code")
      return
    }
    
    setError("")
    setPhoneOtpLoading(true)
    
    try {
      const response = await fetch("/api/auth/verify-sms-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: profile.phone, otp: otpCode }),
      })
      
      const data = await response.json()
      
      if (!response.ok || !data.success) {
        setError(data.error || "Invalid verification code")
        setPhoneOtpLoading(false)
        return
      }
      
      setPhoneVerificationStep("verified")
      setDevOtp(null)
    } catch (err: any) {
      setError("Failed to verify code. Please try again.")
    } finally {
      setPhoneOtpLoading(false)
    }
  }

  const handlePhoneOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    
    const newOtp = [...phoneOtp]
    newOtp[index] = value.slice(-1)
    setPhoneOtp(newOtp)
    
    if (value && index < 5) {
      phoneOtpRefs.current[index + 1]?.focus()
    }
  }

  const handlePhoneOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (pastedData) {
      const newOtp = [...phoneOtp]
      for (let i = 0; i < 6; i++) {
        newOtp[i] = pastedData[i] || ""
      }
      setPhoneOtp(newOtp)
      const lastIndex = Math.min(pastedData.length, 5)
      phoneOtpRefs.current[lastIndex]?.focus()
    }
  }

  const handlePhoneOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !phoneOtp[index] && index > 0) {
      phoneOtpRefs.current[index - 1]?.focus()
    }
  }

  const handleSkillToggle = (categoryId: string, subskillId: string) => {
    const existing = selectedSkills.find(
      (s) => s.categoryId === categoryId && s.subskillId === subskillId
    )

    if (existing) {
      setSelectedSkills(selectedSkills.filter((s) => !(s.categoryId === categoryId && s.subskillId === subskillId)))
    } else {
      setSelectedSkills([
        ...selectedSkills,
        { categoryId, subskillId, level: "intermediate" },
      ])
    }
  }

  const handleSkillLevelChange = (categoryId: string, subskillId: string, level: string) => {
    setSelectedSkills(
      selectedSkills.map((s) =>
        s.categoryId === categoryId && s.subskillId === subskillId
          ? { ...s, level }
          : s
      )
    )
  }

  const isSkillSelected = (categoryId: string, subskillId: string) => {
    return selectedSkills.some((s) => s.categoryId === categoryId && s.subskillId === subskillId)
  }

  const handleCauseToggle = (causeId: string) => {
    if (selectedCauses.includes(causeId)) {
      setSelectedCauses(selectedCauses.filter((c) => c !== causeId))
    } else if (selectedCauses.length < 5) {
      setSelectedCauses([...selectedCauses, causeId])
    }
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setError("")

    try {
      // Save onboarding data to backend
      const onboardingData = {
        profile: {
          ...profile,
        },
        skills: selectedSkills,
        causes: selectedCauses,
        workPreferences,
      }

      const result = await saveVolunteerOnboarding(onboardingData)
      
      if (!result.success) {
        setError(result.error || "Failed to save profile")
        console.error("Failed to save profile:", result.error)
        setIsLoading(false)
        return
      }

      // Mark user as onboarded
      const onboardResult = await completeOnboarding()
      
      if (!onboardResult.success) {
        console.error("Failed to complete onboarding:", onboardResult.error)
        // Still redirect - profile is saved
      }

      // Get the volunteer's name from session
      const volunteerName = session?.user?.name || "there"
      
      // Redirect to dashboard with welcome message
      router.push(localePath(`/volunteer/dashboard?welcome=${encodeURIComponent(volunteerName)}`, locale))
    } catch (error) {
      console.error("Onboarding error:", error)
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">{dict.volunteer?.onboarding?.step1Title || "Tell us about yourself"}</h2>
        <p className="text-muted-foreground">{dict.volunteer?.onboarding?.step1Subtitle || "Help NGOs understand who you are"}</p>
      </div>

      <div className="grid gap-4">
        {/* Phone Number with Verification */}
        <div className="space-y-3">
          <Label htmlFor="phone">{dict.volunteer?.common?.phoneNumber || "Phone Number"} <span className="text-destructive">*</span></Label>
          
          {phoneVerificationStep === "input" && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  placeholder="+91 98765 43210"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="pl-10"
                />
              </div>
              <Button
                type="button"
                onClick={sendPhoneOtp}
                disabled={phoneOtpLoading || !profile.phone}
                className="shrink-0"
              >
                {phoneOtpLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  dict.volunteer?.onboarding?.verify || "Verify"
                )}
              </Button>
            </div>
          )}

          {phoneVerificationStep === "otp" && (
            <div className="p-4 rounded-lg border bg-muted/50 space-y-4 w-full max-w-full overflow-visible">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{dict.volunteer?.onboarding?.enterVerificationCode || "Enter verification code"}</p>
                  <p className="text-xs text-muted-foreground">{dict.volunteer?.onboarding?.sentTo || "Sent to"} {profile.phone}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPhoneVerificationStep("input")
                    setPhoneOtp(["", "", "", "", "", ""])
                    setDevOtp(null)
                  }}
                >
                  Change
                </Button>
              </div>
              
              {/* Dev mode OTP display */}
              {devOtp && (
                <div className="p-2 rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs text-center">
                  <span className="font-medium">Dev Mode:</span> OTP is <span className="font-mono font-bold">{devOtp}</span>
                </div>
              )}
              
              <div className="flex flex-wrap justify-center gap-2" onPaste={handlePhoneOtpPaste}>
                {phoneOtp.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => { phoneOtpRefs.current[index] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePhoneOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handlePhoneOtpKeyDown(index, e)}
                    className="w-10 h-12 text-center text-xl font-bold flex-shrink-0"
                    autoFocus={index === 0}
                  />
                ))}
              </div>
              
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  onClick={verifyPhoneOtp}
                  disabled={phoneOtpLoading || phoneOtp.join("").length !== 6}
                  className="w-full"
                >
                  {phoneOtpLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {dict.volunteer?.onboarding?.verifying || "Verifying..."}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {dict.volunteer?.onboarding?.verifyPhone || "Verify Phone"}
                    </>
                  )}
                </Button>
                
                <p className="text-xs text-center text-muted-foreground">
                  {dict.volunteer?.onboarding?.didntReceiveCode || "Didn't receive code?"}{" "}
                  {phoneResendCooldown > 0 ? (
                    <span>{(dict.volunteer?.onboarding?.resendIn || "Resend in {n}s").replace("{n}", String(phoneResendCooldown))}</span>
                  ) : (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={sendPhoneOtp}
                      disabled={phoneOtpLoading}
                    >
                      {dict.volunteer?.onboarding?.resend || "Resend"}
                    </button>
                  )}
                </p>
              </div>
            </div>
          )}

          {phoneVerificationStep === "verified" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">{profile.phone}</p>
                <p className="text-xs text-green-600 dark:text-green-500">{dict.volunteer?.onboarding?.phoneVerified || "Phone verified"}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPhoneVerificationStep("input")
                  setProfile({ ...profile, phone: "" })
                  setPhoneOtp(["", "", "", "", "", ""])
                }}
              >
                Change
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">{dict.volunteer?.common?.location || "Location"}</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="location"
                placeholder="State, Country"
                value={profile.location}
                onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                className="pl-10"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={getGoogleLocation}
              disabled={isGettingLocation}
              className="shrink-0"
            >
              {isGettingLocation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <LocateFixed className="h-4 w-4 mr-2" />
                  {dict.volunteer?.onboarding?.useMyLocation || "Use my location"}
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {dict.volunteer?.onboarding?.locationHint || "We only detect your state/region for privacy — you can edit this."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">{dict.volunteer?.onboarding?.bioLabel || "Tell us about yourself"}</Label>
          <Textarea
            id="bio"
            placeholder="Share your background, interests, and what drives you to make an impact..."
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            rows={4}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="linkedin">{dict.volunteer?.onboarding?.linkedinOptional || "LinkedIn URL (optional)"}</Label>
            <Input
              id="linkedin"
              placeholder="https://linkedin.com/in/yourprofile"
              value={profile.linkedinUrl}
              onChange={(e) => setProfile({ ...profile, linkedinUrl: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portfolio">{dict.volunteer?.onboarding?.portfolioOptional || "Portfolio URL (optional)"}</Label>
            <Input
              id="portfolio"
              placeholder="https://yourportfolio.com"
              value={profile.portfolioUrl}
              onChange={(e) => setProfile({ ...profile, portfolioUrl: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">{dict.volunteer?.onboarding?.step2Title || "What are your skills?"}</h2>
        <p className="text-muted-foreground">
          {dict.volunteer?.onboarding?.step2Subtitle || "Select the skills you can offer to NGOs. You can add up to 10 skills."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {skillCategories.map((category) => (
          <Button
            key={category.id}
            variant={activeCategory === category.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(activeCategory === category.id ? null : category.id)}
          >
            <span className="mr-2">{category.icon}</span>
            {category.name}
            {selectedSkills.filter((s) => s.categoryId === category.id).length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {selectedSkills.filter((s) => s.categoryId === category.id).length}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {activeCategory && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              {skillCategories.find((c) => c.id === activeCategory)?.name}
            </CardTitle>
            <CardDescription>
              {dict.volunteer?.onboarding?.selectSkillsInCategory || "Select the specific skills you have in this category"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-2">
              {skillCategories
                .find((c) => c.id === activeCategory)
                ?.subskills.map((subskill) => {
                  const selected = isSkillSelected(activeCategory, subskill.id)
                  return (
                    <div
                      key={subskill.id}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => handleSkillToggle(activeCategory, subskill.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{subskill.name}</span>
                        {selected && <CheckCircle className="h-4 w-4 text-primary" />}
                      </div>
                      {selected && (
                        <div className="mt-2 flex gap-1">
                          {experienceLevels.map((level) => {
                            const skill = selectedSkills.find(
                              (s) => s.categoryId === activeCategory && s.subskillId === subskill.id
                            )
                            return (
                              <Badge
                                key={level.id}
                                variant={skill?.level === level.id ? "default" : "outline"}
                                className="cursor-pointer text-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSkillLevelChange(activeCategory, subskill.id, level.id)
                                }}
                              >
                                {level.name}
                              </Badge>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedSkills.length > 0 && (
        <div className="p-4 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground mb-2">
            {(dict.volunteer?.onboarding?.selectedSkillsCount || "Selected skills ({count}/10):").replace("{count}", String(selectedSkills.length))}
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedSkills.map((skill) => {
              const category = skillCategories.find((c) => c.id === skill.categoryId)
              const subskill = category?.subskills.find((s) => s.id === skill.subskillId)
              const level = experienceLevels.find((l) => l.id === skill.level)
              return (
                <Badge key={`${skill.categoryId}-${skill.subskillId}`} variant="secondary">
                  {subskill?.name} ({level?.name})
                </Badge>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">{dict.volunteer?.onboarding?.step3Title || "What causes do you care about?"}</h2>
        <p className="text-muted-foreground">{dict.volunteer?.onboarding?.step3Subtitle || "Select up to 5 causes you're passionate about"}</p>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        {causes.map((cause) => (
          <div
            key={cause.id}
            onClick={() => handleCauseToggle(cause.id)}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedCauses.includes(cause.id)
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{cause.icon}</span>
              <div className="flex-1">
                <p className="font-medium text-sm">{cause.name}</p>
              </div>
              {selectedCauses.includes(cause.id) && (
                <CheckCircle className="h-4 w-4 text-primary" />
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {(dict.volunteer?.onboarding?.selectedCausesCount || "Selected: {count}/5").replace("{count}", String(selectedCauses.length))}
      </p>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">{dict.volunteer?.onboarding?.step4Title || "Your work preferences"}</h2>
        <p className="text-muted-foreground">{dict.volunteer?.onboarding?.step4Subtitle || "Help us match you with the right opportunities"}</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <Label className="text-base font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {dict.volunteer?.common?.impactAgentType || "Impact Agent Type"}
          </Label>
          <RadioGroup
            value={workPreferences.volunteerType}
            onValueChange={(value: string) =>
              setWorkPreferences({ ...workPreferences, volunteerType: value })
            }
            className="grid sm:grid-cols-3 gap-3"
          >
            <Label
              htmlFor="free"
              className={`flex flex-col items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                workPreferences.volunteerType === "free"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <RadioGroupItem value="free" id="free" className="sr-only" />
              <Heart className="h-6 w-6 mb-2 text-primary" />
              <span className="font-medium">{dict.volunteer?.common?.proBonoOnly || "Pro-Bono Only"}</span>
              <span className="text-xs text-muted-foreground text-center mt-1">
                {dict.volunteer?.common?.proBonoDesc || "Contribute for free"}
              </span>
            </Label>
            <Label
              htmlFor="paid"
              className={`flex flex-col items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                workPreferences.volunteerType === "paid"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <RadioGroupItem value="paid" id="paid" className="sr-only" />
              <DollarSign className="h-6 w-6 mb-2 text-green-600" />
              <span className="font-medium">{dict.volunteer?.common?.paidOnly || "Paid Only"}</span>
              <span className="text-xs text-muted-foreground text-center mt-1">
                {dict.volunteer?.common?.paidDesc || "Charge for your time"}
              </span>
            </Label>
            <Label
              htmlFor="both"
              className={`flex flex-col items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                workPreferences.volunteerType === "both"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <RadioGroupItem value="both" id="both" className="sr-only" />
              <Lightbulb className="h-6 w-6 mb-2 text-amber-500" />
              <span className="font-medium">{dict.volunteer?.common?.openToBoth || "Open to Both"}</span>
              <span className="text-xs text-muted-foreground text-center mt-1">
                {dict.volunteer?.common?.openToBothDesc || "Flexible based on project"}
              </span>
            </Label>
          </RadioGroup>
        </div>

        {/* Free Hours Section - Only show for 'Open to Both' volunteer type */}
        {workPreferences.volunteerType === "both" && (
          <>
            <Separator />
            <div className="space-y-4 p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-5 w-5 text-green-600" />
                <h3 className="font-medium text-foreground">{dict.volunteer?.common?.freeHoursContribution || "Free Hours Contribution"}</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {dict.volunteer?.onboarding?.freeHoursDesc || "Would you like to offer some free hours per month for NGOs? After these hours, your paid rate applies."}
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
                    value={workPreferences.freeHoursPerMonth || ""}
                    onChange={(e) =>
                      setWorkPreferences({
                        ...workPreferences,
                        freeHoursPerMonth: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <span className="text-sm text-muted-foreground">{dict.volunteer?.common?.hoursPerMonth || "hours/month"}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {dict.volunteer?.onboarding?.freeHoursExample || "Example: If you set 5 free hours, NGOs can use your services for 5 hours at no charge, then your hourly rate applies."}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Pricing Section - Only show when paid or both is selected */}
        {(workPreferences.volunteerType === "paid" || workPreferences.volunteerType === "both") && (
          <>
            <Separator />
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <h3 className="font-medium text-foreground">{dict.volunteer?.onboarding?.yourPricing || "Your Pricing"}</h3>
              </div>
              
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">{dict.volunteer?.common?.currency || "Currency"}</Label>
                  <select
                    id="currency"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={workPreferences.currency}
                    onChange={(e) =>
                      setWorkPreferences({ ...workPreferences, currency: e.target.value })
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
                      {getCurrencySymbol(workPreferences.currency || "USD")}
                    </span>
                    <Input
                      id="hourlyRate"
                      type="number"
                      placeholder="e.g. 50"
                      className="pl-8"
                      value={workPreferences.hourlyRate || ""}
                      onChange={(e) =>
                        setWorkPreferences({
                          ...workPreferences,
                          hourlyRate: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{dict.volunteer?.common?.hourlyRateDesc || "Your standard hourly rate"}</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="discountedRate">{dict.volunteer?.common?.discountedRate || "Discounted Rate for NGOs"}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {getCurrencySymbol(workPreferences.currency || "USD")}
                    </span>
                    <Input
                      id="discountedRate"
                      type="number"
                      placeholder="e.g. 30"
                      className="pl-8"
                      value={workPreferences.discountedRate || ""}
                      onChange={(e) =>
                        setWorkPreferences({
                          ...workPreferences,
                          discountedRate: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{dict.volunteer?.common?.discountedRateDesc || "Special discounted rate for non-profits (Low Bono)"}</p>
                </div>
              </div>
              
              {workPreferences.hourlyRate > 0 && workPreferences.discountedRate > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/20 p-2 rounded">
                  <CheckCircle className="h-4 w-4" />
                  <span>
                    {(dict.volunteer?.common?.ngoSavingsMessage || "NGOs save {percent}% with your discounted rate!").replace("{percent}", String(Math.round(((workPreferences.hourlyRate - workPreferences.discountedRate) / workPreferences.hourlyRate) * 100)))}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        <Separator />

        <div className="space-y-3">
          <Label className="text-base font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {dict.volunteer?.common?.workMode || "Work Mode"}
          </Label>
          <RadioGroup
            value={workPreferences.workMode}
            onValueChange={(value: string) =>
              setWorkPreferences({ ...workPreferences, workMode: value })
            }
            className="grid sm:grid-cols-3 gap-3"
          >
            {workModes.map((mode) => (
              <Label
                key={mode.id}
                htmlFor={mode.id}
                className={`flex flex-col items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  workPreferences.workMode === mode.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value={mode.id} id={mode.id} className="sr-only" />
                <span className="text-2xl mb-2">{mode.icon}</span>
                <span className="font-medium">{mode.name}</span>
              </Label>
            ))}
          </RadioGroup>
        </div>

        <Separator />

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label className="text-base font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {dict.volunteer?.onboarding?.hoursPerWeek || "Hours per Week"}
            </Label>
            <RadioGroup
              value={workPreferences.hoursPerWeek}
              onValueChange={(value: string) =>
                setWorkPreferences({ ...workPreferences, hoursPerWeek: value })
              }
              className="space-y-2"
            >
              {[
                { value: "1-5", label: dict.volunteer?.common?.time1to5 || "1-5 hours/week" },
                { value: "5-10", label: dict.volunteer?.common?.time5to10 || "5-10 hours/week" },
                { value: "10-20", label: dict.volunteer?.common?.time10to20 || "10-20 hours/week" },
                { value: "20+", label: dict.volunteer?.common?.time20plus || "20+ hours/week" },
              ].map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`hours-${option.value}`}
                  className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                    workPreferences.hoursPerWeek === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem value={option.value} id={`hours-${option.value}`} className="mr-3" />
                  {option.label}
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-medium flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              {dict.volunteer?.onboarding?.availability || "Availability"}
            </Label>
            <RadioGroup
              value={workPreferences.availability}
              onValueChange={(value: string) =>
                setWorkPreferences({ ...workPreferences, availability: value })
              }
              className="space-y-2"
            >
              {[
                { id: "weekdays", label: dict.volunteer?.onboarding?.availWeekdays || "Weekdays (9am-5pm)" },
                { id: "evenings", label: dict.volunteer?.onboarding?.availEvenings || "Evenings (after 6pm)" },
                { id: "weekends", label: dict.volunteer?.onboarding?.availWeekends || "Weekends" },
                { id: "flexible", label: dict.volunteer?.onboarding?.availFlexible || "Flexible" },
              ].map((option) => (
                <Label
                  key={option.id}
                  htmlFor={`avail-${option.id}`}
                  className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                    workPreferences.availability === option.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem value={option.id} id={`avail-${option.id}`} className="mr-3" />
                  {option.label}
                </Label>
              ))}
            </RadioGroup>
          </div>
        </div>
      </div>
    </div>
  )

  const renderStep5 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">{(dict.volunteer?.onboarding?.step5Title || "You're all set, {name}!").replace("{name}", session?.user?.name || "there")}</h2>
        <p className="text-muted-foreground">{dict.volunteer?.onboarding?.step5Subtitle || "Your profile is ready. Review your details and start exploring opportunities."}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-sm text-muted-foreground">{dict.volunteer?.onboarding?.reviewProfile || "Profile"}</h3>
              <p className="text-foreground">{profile.location || (dict.volunteer?.common?.locationNotSet || "Location not set")}</p>
              <p className="text-sm text-muted-foreground">{profile.bio?.slice(0, 100) || (dict.volunteer?.onboarding?.noBio || "No bio")}...</p>
            </div>
            <Separator />
            <div>
              <h3 className="font-medium text-sm text-muted-foreground">{(dict.volunteer?.onboarding?.reviewSkills || "Skills ({count})").replace("{count}", String(selectedSkills.length))}</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedSkills.slice(0, 5).map((skill) => {
                  const category = skillCategories.find((c) => c.id === skill.categoryId)
                  const subskill = category?.subskills.find((s) => s.id === skill.subskillId)
                  return (
                    <Badge key={`${skill.categoryId}-${skill.subskillId}`} variant="secondary">
                      {subskill?.name}
                    </Badge>
                  )
                })}
                {selectedSkills.length > 5 && (
                  <Badge variant="outline">+{selectedSkills.length - 5} more</Badge>
                )}
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="font-medium text-sm text-muted-foreground">{dict.volunteer?.onboarding?.reviewCauses || "Causes"}</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedCauses.map((causeId) => {
                  const cause = causes.find((c) => c.id === causeId)
                  return (
                    <Badge key={causeId} variant="secondary">
                      {cause?.icon} {cause?.name}
                    </Badge>
                  )
                })}
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">{dict.volunteer?.onboarding?.reviewWorkType || "Work Type"}</h3>
                <p className="text-foreground capitalize">{workPreferences.volunteerType}</p>
              </div>
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">{dict.volunteer?.common?.workMode || "Work Mode"}</h3>
                <p className="text-foreground capitalize">{workPreferences.workMode}</p>
              </div>
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">{dict.volunteer?.onboarding?.reviewHoursWeek || "Hours/Week"}</h3>
                <p className="text-foreground">{workPreferences.hoursPerWeek}</p>
              </div>
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">{dict.volunteer?.onboarding?.availability || "Availability"}</h3>
                <p className="text-foreground capitalize">{workPreferences.availability}</p>
              </div>
              {workPreferences.volunteerType === "both" && (
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground">{dict.volunteer?.onboarding?.reviewFreeHours || "Free Hours/Month"}</h3>
                  <p className="text-foreground text-green-600">{workPreferences.freeHoursPerMonth || 0} {dict.volunteer?.common?.hours || "hours"}</p>
                </div>
              )}
              {(workPreferences.volunteerType === "paid" || workPreferences.volunteerType === "both") && (
                <>
                  <div>
                    <h3 className="font-medium text-sm text-muted-foreground">{dict.volunteer?.common?.hourlyRate || "Hourly Rate"}</h3>
                    <p className="text-foreground">{getCurrencySymbol(workPreferences.currency || "USD")}{workPreferences.hourlyRate || 0}/hr</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-sm text-muted-foreground">{dict.volunteer?.common?.discountedRate || "Discounted Rate"}</h3>
                    <p className="text-foreground text-green-600">{getCurrencySymbol(workPreferences.currency || "USD")}{workPreferences.discountedRate || 0}/hr</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  // Show loading state while checking authentication
  if (isPending || isCheckingAuth) {
    return <OnboardingPageSkeleton />
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8">
      <div className="container max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Image src="/logo-main.png" alt="JBC Logo" width={200} height={98} className="h-14 w-auto" />
          <div>
            <h1 className="text-xl font-bold text-foreground">{dict.volunteer?.onboarding?.headerTitle || "Complete Your Profile"}</h1>
            <p className="text-sm text-muted-foreground">{(dict.volunteer?.onboarding?.stepOfTotal || "Step {current} of {total}").replace("{current}", String(step)).replace("{total}", String(totalSteps))}</p>
          </div>
        </div>

        {/* Progress */}
        <Progress value={progress} className="mb-8" />

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Step Content */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
            {step === 5 && renderStep5()}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {dict.volunteer?.common?.back || "Back"}
          </Button>

          {step < totalSteps ? (
            <Button 
              onClick={() => {
                // Validate step 1: phone must be verified
                if (step === 1) {
                  if (phoneVerificationStep !== "verified") {
                    setError(dict.volunteer?.onboarding?.verifyPhoneError || "Please verify your phone number to continue")
                    return
                  }
                  if (!profile.location) {
                    setError(dict.volunteer?.onboarding?.locationRequired || "Please enter your location")
                    return
                  }
                }
                setError("")
                setStep(step + 1)
              }}
              disabled={step === 1 && phoneVerificationStep !== "verified"}
            >
              {dict.volunteer?.common?.continue || "Continue"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {dict.volunteer?.onboarding?.completing || "Completing..."}
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {dict.volunteer?.onboarding?.completeSetup || "Complete Setup"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
