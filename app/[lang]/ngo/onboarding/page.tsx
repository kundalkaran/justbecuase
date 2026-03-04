"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { useGeolocated } from "react-geolocated"
import { useRouter } from "next/navigation"
import { useLocale, localePath } from "@/hooks/use-locale"
import { useDictionary } from "@/components/dictionary-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  ArrowRight,
  ArrowLeft,
  Building2,
  MapPin,
  Loader2,
  CheckCircle,
  Globe,
  Users,
  FileText,
  Upload,
  LocateFixed,
  Phone,
  ShieldCheck,
  X,
} from "lucide-react"
import { skillCategories, causes } from "@/lib/skills-data"
import { saveNGOOnboarding, completeOnboarding } from "@/lib/actions"
import { authClient } from "@/lib/auth-client"
import { uploadDocumentToCloudinary, validateDocumentFile } from "@/lib/upload"
import { toast } from "sonner"
import { OnboardingPageSkeleton } from "@/components/ui/page-skeletons"

type RequiredSkill = {
  categoryId: string
  subskillId: string
  priority: "must-have" | "nice-to-have"
}

export default function NGOOnboardingPage() {
  const router = useRouter()
  const locale = useLocale()
  const dict = useDictionary()
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState("")
  const totalSteps = 4

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
          router.push(localePath("/ngo/dashboard", locale))
        } else if (user.role !== "ngo" && user.role !== "user") {
          // Wrong role, redirect to correct onboarding or dashboard
          if (user.role === "volunteer") {
            router.push(localePath("/volunteer/onboarding", locale))
          } else {
            router.push(localePath("/auth/role-select", locale))
          }
        } else {
          setIsCheckingAuth(false)
        }
      }
    }
  }, [session, isPending, router])

  // Step 1: Organization details
  const [orgDetails, setOrgDetails] = useState({
    orgName: "",
    registrationNumber: "",
    website: "",
    phone: "",
    address: "",
    city: "",
    country: "India",
    description: "",
    mission: "",
    yearFounded: "",
    teamSize: "",
  })

  // Phone verification state
  const [phoneVerificationStep, setPhoneVerificationStep] = useState<"input" | "otp" | "verified">("input")
  const [phoneOtp, setPhoneOtp] = useState(["", "", "", "", "", ""])
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false)
  const [phoneResendCooldown, setPhoneResendCooldown] = useState(0)
  const [devOtp, setDevOtp] = useState<string | null>(null)
  const phoneOtpRefs = useRef<(HTMLInputElement | null)[]>([])
  const verificationDocRef = useRef<HTMLInputElement>(null)

  // Verification documents state
  const [verificationDocuments, setVerificationDocuments] = useState<Array<{ name: string; url: string; type: string }>>([])
  const [uploadingDoc, setUploadingDoc] = useState(false)

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

  // Phone verification functions
  const sendPhoneOtp = async () => {
    if (!orgDetails.phone || orgDetails.phone.length < 10) {
      setError(dict.ngo?.onboarding?.invalidPhone || "Please enter a valid phone number")
      return
    }
    
    setError("")
    setPhoneOtpLoading(true)
    
    try {
      const response = await fetch("/api/auth/send-sms-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: orgDetails.phone }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        setError(data.error || "Failed to send verification code")
        setPhoneOtpLoading(false)
        return
      }
      
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
      setError(dict.ngo?.onboarding?.enterCompleteCode || "Please enter the complete 6-digit code")
      return
    }
    
    setError("")
    setPhoneOtpLoading(true)
    
    try {
      const response = await fetch("/api/auth/verify-sms-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: orgDetails.phone, otp: otpCode }),
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

  // Handle verification document upload
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
        const result = await uploadDocumentToCloudinary(file, "ngo_verification_documents", {
          onProgress: (percent) => {
            // Could show progress if needed
          }
        })

        if (!result.success) {
          toast.error("Upload failed", { description: result.error })
          continue
        }

        // Add to documents list
        setVerificationDocuments(prev => [...prev, {
          name: file.name,
          url: result.url!,
          type: file.type,
        }])
        
        toast.success("Document uploaded successfully!")
      }
    } catch (err) {
      console.error("Document upload error:", err)
      toast.error("Failed to upload document")
    } finally {
      setUploadingDoc(false)
      // Reset file input
      if (verificationDocRef.current) {
        verificationDocRef.current.value = ""
      }
    }
  }

  // Remove a verification document
  const removeVerificationDoc = (index: number) => {
    setVerificationDocuments(prev => prev.filter((_, i) => i !== index))
  }

  // IP-based location detection (for fallback) — state/region level
  const getIPLocation = async () => {
    setError("");
    setIsGettingLocation(true);
    
    try {
      const response = await fetch('/api/location');
      const data = await response.json();
      
      if (data.success && data.location) {
        const { region, country } = data.location;
        
        if (region || country) {
          setOrgDetails(prev => ({ 
            ...prev, 
            city: region || prev.city,
            country: country || prev.country
          }));
        } else {
          setError("Could not determine location from your IP address");
        }
      } else {
        setError(data.error || "Failed to get location from IP");
      }
    } catch (err) {
      console.error('IP location error:', err);
      setError("Failed to get location from IP. Please try manual entry.");
    } finally {
      setIsGettingLocation(false);
    }
  };

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
      setError("Geolocation is not supported by your browser");
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
          
          if (state || country) {
            setOrgDetails(prev => ({ 
              ...prev, 
              city: state || prev.city,
              country: country || prev.country
            }));
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
          
          if (state || country) {
            setOrgDetails(prev => ({ 
              ...prev, 
              city: state || prev.city,
              country: country || prev.country
            }));
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

  // Step 2: Cause & Focus
  const [selectedCauses, setSelectedCauses] = useState<string[]>([])

  // Step 3: Skills needed
  const [requiredSkills, setRequiredSkills] = useState<RequiredSkill[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const progress = (step / totalSteps) * 100

  const handleCauseToggle = (causeId: string) => {
    if (selectedCauses.includes(causeId)) {
      setSelectedCauses(selectedCauses.filter((c) => c !== causeId))
    } else if (selectedCauses.length < 3) {
      setSelectedCauses([...selectedCauses, causeId])
    }
  }

  const handleSkillToggle = (categoryId: string, subskillId: string) => {
    const existing = requiredSkills.find(
      (s) => s.categoryId === categoryId && s.subskillId === subskillId
    )

    if (existing) {
      setRequiredSkills(
        requiredSkills.filter((s) => !(s.categoryId === categoryId && s.subskillId === subskillId))
      )
    } else {
      setRequiredSkills([
        ...requiredSkills,
        { categoryId, subskillId, priority: "nice-to-have" },
      ])
    }
  }

  const handleSkillPriorityChange = (
    categoryId: string,
    subskillId: string,
    priority: "must-have" | "nice-to-have"
  ) => {
    setRequiredSkills(
      requiredSkills.map((s) =>
        s.categoryId === categoryId && s.subskillId === subskillId
          ? { ...s, priority }
          : s
      )
    )
  }

  const isSkillSelected = (categoryId: string, subskillId: string) => {
    return requiredSkills.some((s) => s.categoryId === categoryId && s.subskillId === subskillId)
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setError("")

    try {
      // Save onboarding data to backend
      const onboardingData = {
        orgDetails: {
          ...orgDetails,
        },
        causes: selectedCauses,
        requiredSkills,
        verificationDocuments, // Include uploaded verification documents
      }

      const result = await saveNGOOnboarding(onboardingData)
      
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

      // Redirect to dashboard with welcome message
      const orgName = orgDetails.orgName || session?.user?.name || "there"
      router.push(localePath(`/ngo/dashboard?welcome=${encodeURIComponent(orgName)}`, locale))
    } catch (error) {
      console.error("Onboarding error:", error)
      setError(dict.ngo?.common?.somethingWentWrong || "Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">{dict.ngo?.onboarding?.orgDetails || "Organization Details"}</h2>
        <p className="text-muted-foreground">{dict.ngo?.onboarding?.orgDetailsDesc || "Tell us about your NGO or nonprofit"}</p>
      </div>

      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">{dict.ngo?.common?.organizationName || "Organization Name"} *</Label>
            <Input
              id="orgName"
              placeholder={dict.ngo?.onboarding?.orgNamePlaceholder || "Your NGO name"}
              value={orgDetails.orgName}
              onChange={(e) => setOrgDetails({ ...orgDetails, orgName: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registrationNumber">{dict.ngo?.onboarding?.regNumberRequired || "Registration Number"} *</Label>
            <Input
              id="registrationNumber"
              placeholder={dict.ngo?.onboarding?.regNumberPlaceholder || "NGO registration ID"}
              value={orgDetails.registrationNumber}
              onChange={(e) =>
                setOrgDetails({ ...orgDetails, registrationNumber: e.target.value })
              }
              required
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="website">{dict.ngo?.common?.website || "Website"}</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="website"
                placeholder="https://yourorg.org"
                value={orgDetails.website}
                onChange={(e) => setOrgDetails({ ...orgDetails, website: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>
          
          {/* Phone Number with Verification */}
          <div className="space-y-3">
            <Label htmlFor="phone">{dict.ngo?.common?.phoneNumber || "Phone Number"} *</Label>
            
            {phoneVerificationStep === "input" && (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    placeholder={dict.ngo?.onboarding?.phoneRequired || "+91 98765 43210"}
                    value={orgDetails.phone}
                    onChange={(e) => setOrgDetails({ ...orgDetails, phone: e.target.value })}
                    className="pl-10"
                  />
                </div>
                <Button
                  type="button"
                  onClick={sendPhoneOtp}
                  disabled={phoneOtpLoading || !orgDetails.phone}
                  className="shrink-0"
                >
                  {phoneOtpLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    dict.ngo?.onboarding?.verify || "Verify"
                  )}
                </Button>
              </div>
            )}

            {phoneVerificationStep === "otp" && (
              <div className="p-4 rounded-lg border bg-muted/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{dict.ngo?.onboarding?.enterCode || "Enter verification code"}</p>
                    <p className="text-xs text-muted-foreground">{(dict.ngo?.onboarding?.sentTo || "Sent to {phone}").replace("{phone}", orgDetails.phone)}</p>
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
                    {dict.ngo?.common?.change || "Change"}
                  </Button>
                </div>
                
                {devOtp && (
                  <div className="p-2 rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs text-center">
                    <span className="font-medium">Dev Mode:</span> OTP is <span className="font-mono font-bold">{devOtp}</span>
                  </div>
                )}
                
                <div className="flex justify-center gap-2" onPaste={handlePhoneOtpPaste}>
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
                      className="w-10 h-12 text-center text-xl font-bold"
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
                        {dict.ngo?.onboarding?.verifying || "Verifying..."}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        {dict.ngo?.onboarding?.verifyPhone || "Verify Phone"}
                      </>
                    )}
                  </Button>
                  
                  <p className="text-xs text-center text-muted-foreground">
                    {dict.ngo?.onboarding?.didntReceiveCode || "Didn't receive code?"}{" "}
                    {phoneResendCooldown > 0 ? (
                      <span>{(dict.ngo?.onboarding?.resendIn || "Resend in {n}s").replace("{n}", String(phoneResendCooldown))}</span>
                    ) : (
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={sendPhoneOtp}
                        disabled={phoneOtpLoading}
                      >
                        {dict.ngo?.onboarding?.resend || "Resend"}
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
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">{orgDetails.phone}</p>
                  <p className="text-xs text-green-600 dark:text-green-500">{dict.ngo?.onboarding?.phoneVerified || "Phone verified"}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPhoneVerificationStep("input")
                    setOrgDetails({ ...orgDetails, phone: "" })
                    setPhoneOtp(["", "", "", "", "", ""])
                  }}
                >
                  {dict.ngo?.common?.change || "Change"}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">{dict.ngo?.common?.address || "Address"}</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                id="address"
                placeholder={dict.ngo?.onboarding?.fullAddress || "Full address"}
                value={orgDetails.address}
                onChange={(e) => setOrgDetails({ ...orgDetails, address: e.target.value })}
                className="pl-10 min-h-[80px]"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={getIPLocation}
                disabled={isGettingLocation}
                className="shrink-0"
              >
                {isGettingLocation ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    {dict.ngo?.onboarding?.ipLocation || "IP Location"}
                  </>
                )}
              </Button>
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
                    {dict.ngo?.onboarding?.useMyLocation || "Use my location"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">{dict.ngo?.common?.city || "City"} *</Label>
            <Input
              id="city"
              placeholder={dict.ngo?.onboarding?.cityRequired || "City"}
              value={orgDetails.city}
              onChange={(e) => setOrgDetails({ ...orgDetails, city: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">{dict.ngo?.common?.country || "Country"}</Label>
            <Input
              id="country"
              placeholder={dict.ngo?.common?.country || "Country"}
              value={orgDetails.country}
              onChange={(e) => setOrgDetails({ ...orgDetails, country: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="yearFounded">{dict.ngo?.common?.yearFounded || "Year Founded"}</Label>
            <Input
              id="yearFounded"
              placeholder="2010"
              value={orgDetails.yearFounded}
              onChange={(e) => setOrgDetails({ ...orgDetails, yearFounded: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{dict.ngo?.onboarding?.aboutOrg || "About Your Organization"} *</Label>
          <Textarea
            id="description"
            placeholder={dict.ngo?.onboarding?.aboutOrgPlaceholder || "Describe what your organization does..."}
            value={orgDetails.description}
            onChange={(e) => setOrgDetails({ ...orgDetails, description: e.target.value })}
            rows={4}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mission">{dict.ngo?.common?.missionStatement || "Mission Statement"}</Label>
          <Textarea
            id="mission"
            placeholder={dict.ngo?.profile?.missionPlaceholder || "Your organization's mission..."}
            value={orgDetails.mission}
            onChange={(e) => setOrgDetails({ ...orgDetails, mission: e.target.value })}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="teamSize">{dict.ngo?.common?.teamSize || "Team Size"}</Label>
          <RadioGroup
            value={orgDetails.teamSize}
            onValueChange={(value: string) => setOrgDetails({ ...orgDetails, teamSize: value })}
            className="flex flex-wrap gap-3"
          >
            {["1-5", "6-20", "21-50", "51-100", "100+"].map((size) => (
              <Label
                key={size}
                htmlFor={`size-${size}`}
                className={`flex items-center px-4 py-2 rounded-lg border cursor-pointer transition-all ${
                  orgDetails.teamSize === size
                    ? "border-secondary bg-secondary/5"
                    : "border-border hover:border-secondary/50"
                }`}
              >
                <RadioGroupItem value={size} id={`size-${size}`} className="sr-only" />
                <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                {size}
              </Label>
            ))}
          </RadioGroup>
        </div>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">{dict.ngo?.onboarding?.causeAreas || "Your Cause Areas"}</h2>
        <p className="text-muted-foreground">{dict.ngo?.onboarding?.selectCauses || "Select up to 3 causes your organization focuses on"}</p>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        {causes.map((cause) => (
          <div
            key={cause.id}
            onClick={() => handleCauseToggle(cause.id)}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedCauses.includes(cause.id)
                ? "border-secondary bg-secondary/5"
                : "border-border hover:border-secondary/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{cause.icon}</span>
              <div className="flex-1">
                <p className="font-medium text-sm">{cause.name}</p>
              </div>
              {selectedCauses.includes(cause.id) && (
                <CheckCircle className="h-4 w-4 text-secondary" />
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{(dict.ngo?.onboarding?.selectedCount || "Selected: {n}/3").replace("{n}", String(selectedCauses.length))}</p>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">{dict.ngo?.onboarding?.skillsLookingFor || "Skills You're Looking For"}</h2>
        <p className="text-muted-foreground">
          {dict.ngo?.onboarding?.selectSkillsDesc || "Select the skills that would help your organization most"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {skillCategories.map((category) => (
          <Button
            key={category.id}
            variant={activeCategory === category.id ? "secondary" : "outline"}
            size="sm"
            onClick={() => setActiveCategory(activeCategory === category.id ? null : category.id)}
          >
            <span className="mr-2">{category.icon}</span>
            {category.name}
            {requiredSkills.filter((s) => s.categoryId === category.id).length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {requiredSkills.filter((s) => s.categoryId === category.id).length}
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
              {dict.ngo?.onboarding?.setSkillPriority || "Select the skills you need help with and set priority"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-2">
              {skillCategories
                .find((c) => c.id === activeCategory)
                ?.subskills.map((subskill) => {
                  const selected = isSkillSelected(activeCategory, subskill.id)
                  const skill = requiredSkills.find(
                    (s) => s.categoryId === activeCategory && s.subskillId === subskill.id
                  )
                  return (
                    <div
                      key={subskill.id}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selected
                          ? "border-secondary bg-secondary/5"
                          : "border-border hover:border-secondary/50"
                      }`}
                      onClick={() => handleSkillToggle(activeCategory, subskill.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{subskill.name}</span>
                        {selected && <CheckCircle className="h-4 w-4 text-secondary" />}
                      </div>
                      {selected && (
                        <div className="mt-2 flex gap-1">
                          <Badge
                            variant={skill?.priority === "must-have" ? "default" : "outline"}
                            className="cursor-pointer text-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSkillPriorityChange(activeCategory, subskill.id, "must-have")
                            }}
                          >
                            {dict.ngo?.common?.mustHave || "Must Have"}
                          </Badge>
                          <Badge
                            variant={skill?.priority === "nice-to-have" ? "default" : "outline"}
                            className="cursor-pointer text-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSkillPriorityChange(activeCategory, subskill.id, "nice-to-have")
                            }}
                          >
                            {dict.ngo?.common?.niceToHave || "Nice to Have"}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {requiredSkills.length > 0 && (
        <div className="p-4 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground mb-2">
            {(dict.ngo?.onboarding?.selectedSkills || "Selected skills ({n}):").replace("{n}", String(requiredSkills.length))}
          </p>
          <div className="flex flex-wrap gap-2">
            {requiredSkills.map((skill) => {
              const category = skillCategories.find((c) => c.id === skill.categoryId)
              const subskill = category?.subskills.find((s) => s.id === skill.subskillId)
              return (
                <Badge
                  key={`${skill.categoryId}-${skill.subskillId}`}
                  variant={skill.priority === "must-have" ? "default" : "secondary"}
                >
                  {subskill?.name}
                </Badge>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="h-8 w-8 text-secondary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">{(dict.ngo?.onboarding?.welcomeTitle || "Welcome to JustBeCause, {name}!").replace("{name}", orgDetails.orgName || "there")}</h2>
        <p className="text-muted-foreground">
          {dict.ngo?.onboarding?.profileReady || "Your organization profile is ready. Review and complete setup."}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-secondary/10 flex items-center justify-center">
                <Building2 className="h-8 w-8 text-secondary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{orgDetails.orgName || (dict.ngo?.onboarding?.yourOrganization || "Your Organization")}</h3>
                <p className="text-sm text-muted-foreground">
                  {orgDetails.city}, {orgDetails.country}
                </p>
              </div>
            </div>
            <Separator />
            <div>
              <h3 className="font-medium text-sm text-muted-foreground">{dict.ngo?.onboarding?.about || "About"}</h3>
              <p className="text-foreground">
                {orgDetails.description?.slice(0, 150) || (dict.ngo?.postProject?.noDescription || "No description provided")}...
              </p>
            </div>
            <Separator />
            <div>
              <h3 className="font-medium text-sm text-muted-foreground">{dict.ngo?.profile?.focusAreas || "Focus Areas"}</h3>
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
            <div>
              <h3 className="font-medium text-sm text-muted-foreground">
                {(dict.ngo?.onboarding?.skillsNeededCount || "Skills Needed ({n})").replace("{n}", String(requiredSkills.length))}
              </h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {requiredSkills.slice(0, 6).map((skill) => {
                  const category = skillCategories.find((c) => c.id === skill.categoryId)
                  const subskill = category?.subskills.find((s) => s.id === skill.subskillId)
                  return (
                    <Badge
                      key={`${skill.categoryId}-${skill.subskillId}`}
                      variant={skill.priority === "must-have" ? "default" : "secondary"}
                    >
                      {subskill?.name}
                    </Badge>
                  )
                })}
                {requiredSkills.length > 6 && (
                  <Badge variant="outline">{(dict.ngo?.common?.plusMore || "+{n} more").replace("{n}", String(requiredSkills.length - 6))}</Badge>
                )}
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">{dict.ngo?.common?.teamSize || "Team Size"}</h3>
                <p className="text-foreground">{orgDetails.teamSize || (dict.ngo?.common?.notSpecified || "Not specified")}</p>
              </div>
              <div>
                <h3 className="font-medium text-sm text-muted-foreground">{dict.ngo?.onboarding?.founded || "Founded"}</h3>
                <p className="text-foreground">{orgDetails.yearFounded || (dict.ngo?.common?.notSpecified || "Not specified")}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="text-center">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <h3 className="font-medium">{dict.ngo?.onboarding?.uploadVerification || "Upload Verification Documents (Optional)"}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {dict.ngo?.onboarding?.uploadVerificationDesc || "Add your registration certificate to get verified badge"}
            </p>
            
            {/* Hidden file input */}
            <input
              ref={verificationDocRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              multiple
              onChange={handleVerificationDocUpload}
              className="hidden"
              id="verification-doc-upload"
            />
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => verificationDocRef.current?.click()}
              disabled={uploadingDoc}
            >
              {uploadingDoc ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {dict.ngo?.common?.saving || "Uploading..."}
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  {dict.ngo?.onboarding?.uploadDocument || "Upload Document"}
                </>
              )}
            </Button>
            
            {/* Uploaded documents list */}
            {verificationDocuments.length > 0 && (
              <div className="mt-4 space-y-2 text-left">
                {verificationDocuments.map((doc, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm truncate max-w-[200px]">{doc.name}</span>
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
            <Building2 className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{dict.ngo?.onboarding?.title || "Complete Your Organization Profile"}</h1>
            <p className="text-sm text-muted-foreground">{(dict.ngo?.onboarding?.stepOf || "Step {step} of {total}").replace("{step}", String(step)).replace("{total}", String(totalSteps))}</p>
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
            {dict.ngo?.common?.back || "Back"}
          </Button>

          {step < totalSteps ? (
            <Button 
              variant="secondary" 
              onClick={() => {
                // Validate step 1: phone must be verified
                if (step === 1) {
                  if (phoneVerificationStep !== "verified") {
                    setError(dict.ngo?.onboarding?.verifyPhoneError || "Please verify your phone number to continue")
                    return
                  }
                  if (!orgDetails.orgName) {
                    setError(dict.ngo?.onboarding?.orgNameError || "Please enter your organization name")
                    return
                  }
                  if (!orgDetails.registrationNumber) {
                    setError(dict.ngo?.onboarding?.regNumberError || "Please enter your organization registration number")
                    return
                  }
                }
                setError("")
                setStep(step + 1)
              }}
              disabled={step === 1 && phoneVerificationStep !== "verified"}
            >
              {dict.ngo?.common?.continue || "Continue"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button variant="secondary" onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {dict.ngo?.onboarding?.completing || "Completing..."}
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {dict.ngo?.onboarding?.completeSetup || "Complete Setup"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
