"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { loadStripe, type Stripe as StripeJs, type StripeElements } from "@stripe/stripe-js"
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { useLocale, localePath } from "@/hooks/use-locale"
import type { Locale } from "@/lib/i18n-config"
import { client } from "@/lib/auth-client"
import { useSubscriptionStore, usePlatformSettingsStore } from "@/lib/store"
import { formatPrice, getCurrencySymbol } from "@/lib/currency"
import type { SupportedCurrency } from "@/lib/types"
import { toast } from "sonner"
import { useDictionary } from "@/components/dictionary-provider"
import {
  Loader2, Tag, X, Sparkles, Zap, CheckCircle2, Shield, CreditCard, ArrowLeft, AlertTriangle,
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Outer page — wraps in Suspense for useSearchParams                */
/* ------------------------------------------------------------------ */
export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <CheckoutOrchestrator />
    </Suspense>
  )
}

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
interface PlanInfo {
  id: string
  name: string
  description: string
  price: number
  features: string[]
  icon: typeof Zap
}

interface AppliedCoupon {
  code: string
  discountAmount: number
  finalAmount: number
  originalAmount: number
  discountType: "percentage" | "fixed"
  discountValue: number
}

/* ------------------------------------------------------------------ */
/*  Orchestrator — fetches PaymentIntent, then renders <Elements>     */
/* ------------------------------------------------------------------ */
function CheckoutOrchestrator() {
  const router = useRouter()
  const locale = useLocale()
  const dict = useDictionary()
  const searchParams = useSearchParams()
  const planId = searchParams.get("plan")

  const { data: session } = client.useSession()
  const user = session?.user
  const userRole = user?.role as string | undefined

  const { ngoSubscription, volunteerSubscription, setNGOSubscription, setVolunteerSubscription } = useSubscriptionStore()
  const {
    settings: platformSettings,
    isLoaded: settingsLoaded,
    setSettings,
    setLoaded,
  } = usePlatformSettingsStore()

  /* ---------- local state ---------- */
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false)
  const [couponInput, setCouponInput] = useState("")
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState("")
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null)

  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [publishableKey, setPublishableKey] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [intentLoading, setIntentLoading] = useState(false)
  const [intentError, setIntentError] = useState("")
  const [pageError, setPageError] = useState("")

  /* ---------- fetch platform settings ---------- */
  useEffect(() => {
    const shouldFetch =
      !settingsLoaded || usePlatformSettingsStore.getState().needsRefresh()
    if (shouldFetch) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data) setSettings(d.data)
          setLoaded(true)
        })
        .catch(() => setLoaded(true))
    }
  }, [settingsLoaded, setSettings, setLoaded])

  /* ---------- always refresh subscription status on checkout ---------- */
  useEffect(() => {
    if (!user) { setSubscriptionLoaded(true); return }
    fetch("/api/user/subscription")
      .then((r) => r.json())
      .then((data) => {
        if (data.ngoSubscription) setNGOSubscription(data.ngoSubscription)
        if (data.volunteerSubscription) setVolunteerSubscription(data.volunteerSubscription)
      })
      .catch(() => {})
      .finally(() => setSubscriptionLoaded(true))
  }, [user, setNGOSubscription, setVolunteerSubscription])

  /* ---------- redirect unauthenticated ---------- */
  useEffect(() => {
    if (session === null) {
      router.push(
        localePath(`/auth/signin?redirect=/checkout?plan=${planId}`, locale)
      )
    }
  }, [session, router, planId, locale])

  /* ---------- derived data ---------- */
  const currency = (platformSettings?.currency || "INR") as SupportedCurrency
  const currencySymbol = getCurrencySymbol(currency)
  const ngoProPrice = Number(platformSettings?.ngoProPrice) || 2999
  const volunteerProPrice = Number(platformSettings?.volunteerProPrice) || 999

  const plan = useMemo<PlanInfo | null>(() => {
    if (!planId) return null
    if (planId === "ngo-pro") {
      return {
        id: "ngo-pro",
        name: dict.checkout?.ngoPlanName || "NGO Pro Plan",
        description: dict.checkout?.ngoPlanDesc || "Unlimited projects and profile unlocks for your organization",
        price: ngoProPrice,
        features: platformSettings?.ngoProFeatures || [
          dict.checkout?.ngoFeature1 || "Unlimited projects",
          dict.checkout?.ngoFeature2 || "Unlimited profile unlocks",
          dict.checkout?.ngoFeature3 || "Advanced AI-powered matching",
          dict.checkout?.ngoFeature4 || "Priority support",
          dict.checkout?.ngoFeature5 || "Project analytics & reports",
          dict.checkout?.ngoFeature6 || "Featured NGO badge",
        ],
        icon: Zap,
      }
    }
    if (planId === "volunteer-pro") {
      return {
        id: "volunteer-pro",
        name: dict.checkout?.agentPlanName || "Impact Agent Pro Plan",
        description: dict.checkout?.agentPlanDesc || "Unlimited applications and premium features",
        price: volunteerProPrice,
        features: platformSettings?.volunteerProFeatures || [
          dict.checkout?.agentFeature1 || "Unlimited job applications",
          dict.checkout?.agentFeature2 || "Featured profile badge",
          dict.checkout?.agentFeature3 || "Priority in search results",
          dict.checkout?.agentFeature4 || "Direct message NGOs",
          dict.checkout?.agentFeature5 || "Early access to opportunities",
          dict.checkout?.agentFeature6 || "Profile analytics",
          dict.checkout?.agentFeature7 || "Certificate downloads",
        ],
        icon: Sparkles,
      }
    }
    return null
  }, [planId, ngoProPrice, volunteerProPrice, platformSettings, dict])

  const currentPlan = planId?.startsWith("ngo-")
    ? ngoSubscription?.plan
    : volunteerSubscription?.plan
  const isAlreadyPro = currentPlan === "pro"

  const roleMatchesPlan = planId?.startsWith("ngo-")
    ? userRole === "ngo"
    : planId?.startsWith("volunteer-")
      ? userRole === "volunteer"
      : false

  const originalAmount = plan?.price ?? 0
  const savings = appliedCoupon ? appliedCoupon.discountAmount : 0
  const finalAmount = appliedCoupon ? appliedCoupon.finalAmount : originalAmount

  /* ---------- coupon handlers ---------- */
  const handleApplyCoupon = async () => {
    if (!couponInput.trim() || !plan) return
    setCouponLoading(true)
    setCouponError("")

    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput.trim(), planId: plan.id }),
      })
      const data = await res.json()
      if (!data.valid) {
        setCouponError(data.error || (dict.checkout?.invalidCoupon || "Invalid coupon code"))
        setAppliedCoupon(null)
      } else {
        setAppliedCoupon({
          code: couponInput.trim().toUpperCase(),
          discountAmount: data.discountAmount,
          finalAmount: data.finalAmount,
          originalAmount: data.originalAmount,
          discountType: data.discountType,
          discountValue: data.discountValue,
        })
        setCouponError("")
        // Reset any existing PaymentIntent so a new one is created with the coupon
        setClientSecret(null)
        setPaymentIntentId(null)
        toast.success(dict.checkout?.couponApplied || "Coupon applied!", {
          description:
            data.discountType === "percentage"
              ? (dict.checkout?.percentOff || "{percent}% off applied").replace("{percent}", String(data.discountValue))
              : (dict.checkout?.amountOff || "{symbol}{amount} off applied").replace("{symbol}", currencySymbol).replace("{amount}", String(data.discountAmount)),
        })
      }
    } catch {
      setCouponError(dict.checkout?.couponValidateFailed || "Failed to validate coupon")
    } finally {
      setCouponLoading(false)
    }
  }

  const clearCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput("")
    setCouponError("")
    setClientSecret(null)
    setPaymentIntentId(null)
  }

  /* ---------- create PaymentIntent ---------- */
  const createPaymentIntent = async () => {
    if (!plan) return
    setIntentLoading(true)
    setIntentError("")
    try {
      const res = await fetch("/api/payments/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          couponCode: appliedCoupon?.code || undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setIntentError(data.error || (dict.checkout?.paymentInitFailed || "Failed to initialise payment"))
        return
      }

      // 100 % coupon → redirect to free activation
      if (data.free && data.redirectUrl) {
        window.location.href = data.redirectUrl
        return
      }

      setClientSecret(data.clientSecret)
      setPublishableKey(data.publishableKey)
      setPaymentIntentId(data.paymentIntentId)
    } catch {
      setIntentError(dict.checkout?.networkError || "Network error — please try again")
    } finally {
      setIntentLoading(false)
    }
  }

  // Auto-create a PaymentIntent when the plan is resolved and there is no secret yet
  useEffect(() => {
    if (plan && !clientSecret && !intentLoading && !intentError && settingsLoaded) {
      createPaymentIntent()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, settingsLoaded, appliedCoupon])

  /* ---------- Stripe promise ---------- */
  const stripePromise = useMemo(() => {
    if (!publishableKey) return null
    return loadStripe(publishableKey)
  }, [publishableKey])

  /* ---------- early returns ---------- */
  if (!settingsLoaded || session === undefined || !subscriptionLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!planId || !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
          <h2 className="text-xl font-semibold">{dict.checkout?.invalidPlan || "Invalid Plan"}</h2>
          <p className="text-muted-foreground">
            {dict.checkout?.noPlanSelected || "No plan selected. Please choose a plan from the pricing page."}
          </p>
          <button
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg"
            onClick={() => router.push(localePath("/pricing", locale))}
          >
            {dict.checkout?.viewPricing || "View Pricing"}
          </button>
        </div>
      </div>
    )
  }

  if (!roleMatchesPlan) {
    const expected = planId.startsWith("ngo-") ? (dict.checkout?.roleNGO || "NGO") : (dict.checkout?.roleAgent || "Impact Agent")
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
          <h2 className="text-xl font-semibold">{dict.checkout?.roleMismatch || "Role Mismatch"}</h2>
          <p className="text-muted-foreground">
            {(dict.checkout?.roleMismatchDesc || "This plan is for {expected}s. Your role doesn't match.").replace("{expected}", expected)}
          </p>
          <button
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg"
            onClick={() => router.push(localePath("/pricing", locale))}
          >
            {dict.checkout?.viewPricing || "View Pricing"}
          </button>
        </div>
      </div>
    )
  }

  if (isAlreadyPro) {
    const dashPath = planId.startsWith("ngo-") ? "/ngo/dashboard" : "/volunteer/dashboard"
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <h2 className="text-xl font-semibold">{dict.checkout?.alreadySubscribed || "Already Subscribed"}</h2>
          <p className="text-muted-foreground">
            {dict.checkout?.alreadySubscribedDesc || "You're already on the Pro plan!"}
          </p>
          <button
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg"
            onClick={() => router.push(localePath(dashPath, locale))}
          >
            {dict.checkout?.goToDashboard || "Go to Dashboard"}
          </button>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Main checkout layout                                            */
  /* ---------------------------------------------------------------- */
  const PlanIcon = plan.icon

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-6 sm:py-8">
      <div className="container max-w-5xl mx-auto px-4">
        {/* Back button */}
        <button
          onClick={() => router.push(localePath("/pricing", locale))}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 sm:mb-6 transition-colors text-sm sm:text-base"
        >
          <ArrowLeft className="h-4 w-4" /> {dict.checkout?.backToPricing || "Back to Pricing"}
        </button>

        <div className="grid md:grid-cols-5 gap-6 sm:gap-8">
          {/* ---- Left: Order summary ---- */}
          <div className="md:col-span-2 space-y-6">
            {/* Plan card */}
            <div className="rounded-xl border bg-card p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <PlanIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>
              </div>

              <ul className="space-y-2">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Coupon section */}
            <div className="rounded-xl border bg-card p-6 space-y-3 shadow-sm">
              <h4 className="font-medium flex items-center gap-2">
                <Tag className="h-4 w-4" /> {dict.checkout?.haveCoupon || "Have a coupon code?"}
              </h4>

              {appliedCoupon ? (
                <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-4 py-2">
                  <div>
                    <span className="font-medium text-green-700 dark:text-green-400">
                      {appliedCoupon.code}
                    </span>
                    <span className="text-sm text-green-600 dark:text-green-500 ml-2">
                      {appliedCoupon.discountType === "percentage"
                        ? (dict.checkout?.percentOffLabel || "{percent}% off").replace("{percent}", String(appliedCoupon.discountValue))
                        : (dict.checkout?.amountOffLabel || "{symbol}{amount} off").replace("{symbol}", currencySymbol).replace("{amount}", String(appliedCoupon.discountAmount))}
                    </span>
                  </div>
                  <button
                    onClick={clearCoupon}
                    className="text-green-600 hover:text-green-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={dict.checkout?.enterCode || "Enter code"}
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                    className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponInput.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {couponLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      dict.checkout?.apply || "Apply"
                    )}
                  </button>
                </div>
              )}
              {couponError && (
                <p className="text-sm text-destructive">{couponError}</p>
              )}
              {appliedCoupon && savings > 0 && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  {(dict.checkout?.youSave || "You save {amount} on this order!").replace("{amount}", formatPrice(savings, currency))}
                </p>
              )}
            </div>

            {/* Price summary */}
            <div className="rounded-xl border bg-card p-6 space-y-3 shadow-sm">
              <h4 className="font-medium">{dict.checkout?.orderSummary || "Order Summary"}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{plan.name}</span>
                  <span>{formatPrice(originalAmount, currency)}{dict.checkout?.perMonth || "/mo"}</span>
                </div>
                {savings > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{(dict.checkout?.couponLabel || "Coupon ({code})").replace("{code}", appliedCoupon?.code || "")}</span>
                    <span>-{formatPrice(savings, currency)}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="font-medium">{dict.checkout?.total || "Total"}</span>
                  <span className="text-2xl font-bold">
                    {formatPrice(finalAmount, currency)}
                  </span>
                </div>
                {savings > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {(dict.checkout?.youSaveCoupon || "You save {amount} with coupon!").replace("{amount}", formatPrice(savings, currency))}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ---- Right: Payment form ---- */}
          <div className="md:col-span-3">
            <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> {dict.checkout?.paymentDetails || "Payment Details"}
              </h2>

              {intentError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                  {intentError}
                  <button
                    onClick={createPaymentIntent}
                    className="ml-2 underline font-medium"
                  >
                    {dict.checkout?.retry || "Retry"}
                  </button>
                </div>
              )}

              {pageError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                  {pageError}
                </div>
              )}

              {intentLoading && !clientSecret && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span>{dict.checkout?.preparingPayment || "Preparing secure payment\u2026"}</span>
                </div>
              )}

              {clientSecret && stripePromise && (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: "stripe",
                      variables: {
                        colorPrimary: "#6d28d9",
                        borderRadius: "8px",
                      },
                    },
                  }}
                >
                  <StripePaymentForm
                    paymentIntentId={paymentIntentId!}
                    planId={plan.id}
                    finalAmount={finalAmount}
                    currency={currency}
                    locale={locale}
                  />
                </Elements>
              )}

              {/* Trust badges */}
              <div className="flex items-center gap-4 pt-4 border-t text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" /> {dict.checkout?.sslEncrypted || "SSL Encrypted"}
                </div>
                <div className="flex items-center gap-1">
                  <CreditCard className="h-3.5 w-3.5" /> {dict.checkout?.poweredByStripe || "Powered by Stripe"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Inner form — has access to Stripe Elements context                */
/* ------------------------------------------------------------------ */
interface PaymentFormProps {
  paymentIntentId: string
  planId: string
  finalAmount: number
  currency: SupportedCurrency
  locale: Locale
}

function StripePaymentForm({
  paymentIntentId,
  planId,
  finalAmount,
  currency,
  locale,
}: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const dict = useDictionary()

  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentError, setPaymentError] = useState("")
  const [elementReady, setElementReady] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsProcessing(true)
    setPaymentError("")

    try {
      // Trigger form validation & 3-D Secure
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href, // fallback (shouldn't redirect)
        },
        redirect: "if_required", // stay on page when possible
      })

      if (error) {
        setPaymentError(
          error.message || (dict.checkout?.paymentFailed || "Payment failed. Please check your details and try again.")
        )
        setIsProcessing(false)
        return
      }

      if (paymentIntent && paymentIntent.status === "succeeded") {
        // Confirm with server → activate subscription
        toast.loading(dict.checkout?.activating || "Activating your subscription…")

        const confirmRes = await fetch("/api/payments/confirm-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId: paymentIntent.id, planId }),
        })
        const confirmData = await confirmRes.json()

        toast.dismiss()

        if (confirmData.success) {
          toast.success(dict.checkout?.paymentSuccessful || "Payment successful!", {
            description: dict.checkout?.proActive || "Your Pro plan is now active.",
          })
          const dashboard = localePath(
            confirmData.dashboardPath || (planId.startsWith("ngo-") ? "/ngo/dashboard" : "/volunteer/dashboard"),
            locale
          )
          router.push(`${dashboard}?subscription=success`)
        } else {
          setPaymentError(
            confirmData.error || (dict.checkout?.activationFailed || "Payment succeeded but activation failed. Please contact support.")
          )
        }
      } else {
        setPaymentError(
          (dict.checkout?.unexpectedStatus || "Unexpected payment status: {status}. Please contact support.").replace("{status}", paymentIntent?.status || "unknown")
        )
      }
    } catch (err: any) {
      setPaymentError(err.message || (dict.checkout?.unexpectedError || "An unexpected error occurred"))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        onReady={() => setElementReady(true)}
        options={{ layout: "tabs" }}
      />

      {paymentError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {paymentError}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || isProcessing || !elementReady}
        className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-semibold
                   disabled:opacity-50 disabled:cursor-not-allowed transition-all
                   hover:brightness-110 flex items-center justify-center gap-2"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {dict.checkout?.processing || "Processing…"}
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" /> {(dict.checkout?.payAmount || "Pay {amount}").replace("{amount}", formatPrice(finalAmount, currency))}
          </>
        )}
      </button>
    </form>
  )
}
