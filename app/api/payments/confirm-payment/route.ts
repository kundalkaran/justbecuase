import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getStripeClient } from "@/lib/payment-gateway"
import {
  ngoProfilesDb,
  volunteerProfilesDb,
  transactionsDb,
  notificationsDb,
  couponsDb,
  couponUsagesDb,
} from "@/lib/database"
import { getDb, userIdQuery } from "@/lib/database"
import { trackEvent } from "@/lib/analytics"

/**
 * Called by the frontend after stripe.confirmPayment succeeds.
 * Verifies the PaymentIntent status and activates the subscription.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { paymentIntentId, planId } = body

    if (!paymentIntentId || !planId) {
      return NextResponse.json({ error: "Missing paymentIntentId or planId" }, { status: 400 })
    }

    const { stripe } = await getStripeClient()

    // Retrieve & verify payment
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: `Payment not completed. Status: ${paymentIntent.status}` },
        { status: 400 }
      )
    }

    // Verify the user matches
    const userId = paymentIntent.metadata?.userId || session.user.id
    if (userId !== session.user.id) {
      return NextResponse.json({ error: "User mismatch" }, { status: 403 })
    }

    const metaPlanId = paymentIntent.metadata?.planId || planId
    const userRole = paymentIntent.metadata?.userRole || (session.user.role as string)
    const isNgoPlan = metaPlanId.startsWith("ngo-")
    const isPro = metaPlanId.endsWith("-pro")
    const dashboardPath = isNgoPlan ? "/ngo/dashboard" : "/volunteer/dashboard"

    // Calculate subscription dates
    const now = new Date()
    const subscriptionExpiry = new Date(now)
    subscriptionExpiry.setMonth(subscriptionExpiry.getMonth() + 1)

    // Activate subscription
    if (isNgoPlan) {
      const profile = await ngoProfilesDb.findByUserId(userId)
      if (!profile) {
        return NextResponse.json(
          { error: "NGO profile not found. Please complete onboarding first." },
          { status: 400 }
        )
      }
      await ngoProfilesDb.update(userId, {
        subscriptionPlan: isPro ? "pro" : "free",
        subscriptionExpiry,
        monthlyUnlocksUsed: 0,
      })
    } else {
      const profile = await volunteerProfilesDb.findByUserId(userId)
      if (!profile) {
        return NextResponse.json(
          { error: "Impact Agent profile not found. Please complete onboarding first." },
          { status: 400 }
        )
      }
      await volunteerProfilesDb.update(userId, {
        subscriptionPlan: isPro ? "pro" : "free",
        subscriptionExpiry,
        monthlyApplicationsUsed: 0,
      })
    }

    // Amount in whole units
    const amount = (paymentIntent.amount || 0) / 100
    const currency = (paymentIntent.currency || "usd").toUpperCase()

    // Analytics
    trackEvent("payment", "subscription", {
      userId,
      value: paymentIntent.amount || 0,
      metadata: { planId: metaPlanId, gateway: "stripe-elements", currency },
    })

    // Transaction record
    await transactionsDb.create({
      userId,
      type: "subscription",
      referenceId: metaPlanId,
      referenceType: "subscription",
      amount,
      currency,
      paymentGateway: "stripe",
      paymentId: paymentIntentId,
      status: "completed",
      paymentStatus: "completed",
      description: `${isPro ? "Pro" : "Free"} Plan Subscription (Elements)`,
      createdAt: now,
    })

    // Coupon usage
    const couponCode = paymentIntent.metadata?.couponCode
    const couponId = paymentIntent.metadata?.couponId
    if (couponCode && couponId) {
      try {
        await couponsDb.incrementUsage(couponCode)
        await couponUsagesDb.create({
          couponId,
          couponCode,
          userId,
          planId: metaPlanId,
          discountAmount: Number(paymentIntent.metadata?.discountAmount || 0),
          originalAmount: Number(paymentIntent.metadata?.originalAmount || 0),
          finalAmount: amount,
          usedAt: now,
        })
      } catch (couponErr) {
        console.error("[confirm-payment] Coupon usage error:", couponErr)
      }
    }

    // Notification
    try {
      await notificationsDb.create({
        userId,
        type: "subscription_activated",
        title: "Pro Plan Activated!",
        message: "Your Pro subscription is now active. Enjoy unlimited access!",
        referenceId: metaPlanId,
        referenceType: "subscription",
        link: dashboardPath,
        isRead: false,
        createdAt: now,
      })
    } catch (notifErr) {
      console.error("[confirm-payment] Notification error:", notifErr)
    }

    // Confirmation email
    try {
      const db = await getDb()
      const userRecord = await db.collection("user").findOne(userIdQuery(userId))
      if (userRecord?.email) {
        const { sendEmail, getSubscriptionConfirmationEmailHtml } = await import("@/lib/email")
        const planName = isNgoPlan ? "NGO Pro" : "Impact Agent Pro"
        const expiryFormatted = subscriptionExpiry.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
        const html = getSubscriptionConfirmationEmailHtml(
          userRecord.name || "there",
          planName,
          amount,
          currency,
          expiryFormatted,
          isNgoPlan ? "ngo" : "volunteer"
        )
        await sendEmail({
          to: userRecord.email,
          subject: `Your ${planName} subscription is active!`,
          html,
          text: `Hi ${userRecord.name || "there"}, your ${planName} subscription is now active! Valid until ${expiryFormatted}. Enjoy your Pro benefits!`,
        })
      }
    } catch (emailErr) {
      console.error("[confirm-payment] Email error:", emailErr)
    }

    return NextResponse.json({
      success: true,
      dashboardPath,
      message: "Subscription activated successfully!",
    })
  } catch (error: any) {
    console.error("Error confirming payment:", error)
    return NextResponse.json(
      { error: error.message || "Failed to confirm payment" },
      { status: 500 }
    )
  }
}
