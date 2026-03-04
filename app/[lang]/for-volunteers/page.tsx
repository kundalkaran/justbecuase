"use client"

import LocaleLink from "@/components/locale-link"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { testimonials } from "@/lib/data"
import { Briefcase, Award, TrendingUp, Heart, Clock, Globe, ArrowRight, CheckCircle, Gift, DollarSign, Sparkles } from "lucide-react"
import { useDictionary } from "@/components/dictionary-provider"

export default function ForVolunteersPage() {
  const dict = useDictionary()
  const v = (dict as any).forVolunteers || {}

  const benefits = [
    { icon: Briefcase, title: v.benefitPortfolioTitle || "Build Your Portfolio", description: v.benefitPortfolioDesc || "Add real-world opportunities to your resume and showcase your impact to future employers." },
    { icon: TrendingUp, title: v.benefitSkillsTitle || "Develop New Skills", description: v.benefitSkillsDesc || "Take on challenging opportunities that push your boundaries and help you grow professionally." },
    { icon: Heart, title: v.benefitDifferenceTitle || "Make a Difference", description: v.benefitDifferenceDesc || "Use your expertise to create lasting positive change in communities worldwide." },
    { icon: Globe, title: v.benefitFlexibleTitle || "Flexible Contributions", description: v.benefitFlexibleDesc || "Choose from virtual opportunities or local opportunities that fit your schedule and lifestyle." },
    { icon: Award, title: v.benefitRecognizedTitle || "Get Recognized", description: v.benefitRecognizedDesc || "Earn badges, testimonials, and track your impact with our comprehensive impact agent profiles." },
    { icon: Clock, title: v.benefitCommitmentTitle || "Choose Your Commitment", description: v.benefitCommitmentDesc || "From 1-hour consultations to long-term opportunities, find ones that match your availability." },
  ]

  const exchangeOptions = [
    { icon: Gift, title: v.proBonoTitle || "Pro Bono (Free)", description: v.proBonoDesc || "Donate your expertise entirely." },
    { icon: DollarSign, title: v.lowBonoTitle || "Low Bono (Discounted)", description: v.lowBonoDesc || "Offer your services at a significantly reduced rate." },
    { icon: Sparkles, title: v.comboTitle || "Pro Bono + Low Bono", description: v.comboDesc || "Combine pure contributions with discounted work." },
  ]

  const steps = [
    { number: "01", title: v.step1Title || "Create Your Profile", description: v.step1Desc || "Sign up and showcase your skills, experience, and the causes you care about." },
    { number: "02", title: v.step2Title || "Browse Opportunities", description: v.step2Desc || "Explore opportunities matched to your skills and interests from vetted NGOs." },
    { number: "03", title: v.step3Title || "Apply & Connect", description: v.step3Desc || "Submit your application and connect directly with the organization." },
    { number: "04", title: v.step4Title || "Make an Impact", description: v.step4Desc || "Complete the opportunity, receive feedback, and add it to your portfolio." },
  ]

  const faqs = [
    { question: v.faq1Q || "Is it really free to join as an impact agent?", answer: v.faq1A || "Yes! Signing up as an impact agent is completely free." },
    { question: v.faq2Q || "How much time do I need to commit?", answer: v.faq2A || "It's entirely up to you." },
    { question: v.faq3Q || "What types of skills are in demand?", answer: v.faq3A || "Everything from web development, design, and marketing to financial planning." },
    { question: v.faq4Q || "Will I get recognition for my work?", answer: v.faq4A || "Absolutely! NGOs can rate and review your contributions." },
    { question: v.faq5Q || "Can I choose which NGOs to work with?", answer: v.faq5A || "Yes, you have full control over which opportunities you apply to." },
    { question: v.faq6Q || "What if I want to offer paid services too?", answer: v.faq6A || "You can! Our platform supports pro bono, low bono, and paid engagements." },
  ]
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 bg-linear-to-b from-primary/10 to-background">
          <div className="container mx-auto px-4 md:px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">{v.heroTitle || "Your Skills Have the Power to Change a Life"}</h1>
                <p className="text-xl text-muted-foreground mb-4">
                  {v.heroPara1 || "At the JustBeCause Network, we believe your professional expertise is more than just a paycheck—it's a pathway to impact."}
                </p>
                <p className="text-lg text-muted-foreground mb-6">
                  {v.heroPara2 || "Join our Purpose-Driven Exchange and lend your talent to NGOs who are changing the world."}
                </p>
                <p className="text-muted-foreground mb-8">
                  {v.heroPara3 || "Our platform serves as a high-impact marketplace connecting skilled professionals with NGOs."}
                </p>
                <div className="flex flex-wrap gap-4">
                  <Button asChild size="lg" className="bg-primary hover:bg-primary/90">
                    <LocaleLink href="/auth/signup">
                      {v.registerNow || "Impact Agents – Register Now"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </LocaleLink>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="bg-transparent">
                    <LocaleLink href="/projects">{v.browseOpportunities || "Browse Opportunities"}</LocaleLink>
                  </Button>
                </div>
              </div>
              <div className="relative overflow-hidden">
                <img
                  src="/diverse-professionals-volunteering-laptop-teamwork.png"
                  alt="Impact agents collaborating"
                  className="rounded-2xl shadow-2xl w-full" />
                <div className="absolute -bottom-4 left-2 md:-bottom-6 md:-left-6 bg-card p-3 md:p-4 rounded-xl shadow-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-success-light flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-success" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{v.agentCount || "2,847 Impact Agents"}</p>
                      <p className="text-sm text-muted-foreground">{v.makingImpact || "Making an impact"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The Global Purpose-Driven Exchange */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">{v.exchangeTitle || "The Global Purpose-Driven Exchange"}</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                {v.exchangeSubtitle || "Impact Agents (Professionals): Your \"Time\" is the new currency."}
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {exchangeOptions.map((option) => (
                <Card key={option.title} className="border-2 hover:border-primary/50 transition-colors">
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <option.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">{option.title}</h3>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-16">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">{v.whyBecomeTitle || "Why Become an Impact Agent?"}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {v.whyBecomeSubtitle || "Skills-based contributions offer unique benefits that traditional volunteering can't match"}
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {benefits.map((benefit) => (
                <Card key={benefit.title}>
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <benefit.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
                    <p className="text-sm text-muted-foreground">{benefit.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

      {/* How It Works */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">{v.howItWorksTitle || "How It Works"}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {v.howItWorksSubtitle || "Getting started is easy. Here's how you can begin making an impact today."}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                <div className="text-6xl font-bold text-primary/10 mb-4">{step.number}</div>
                <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
                {index < steps.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute top-8 -right-4 h-6 w-6 text-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">{v.storiesTitle || "Impact Agent Stories"}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {v.storiesSubtitle || "Hear from impact agents who have made a difference through our platform"}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials
              .filter((t) => t.type === "volunteer")
              .concat(testimonials.filter((t) => t.type === "ngo").slice(0, 2))
              .map((testimonial) => (
                <Card key={testimonial.id}>
                  <CardContent className="pt-6">
                    <p className="text-foreground mb-6 italic">"{testimonial.quote}"</p>
                    <div className="flex items-center gap-3">
                      <img
                        src={testimonial.avatar || "/placeholder.svg"}
                        alt={testimonial.author}
                        className="w-12 h-12 rounded-full object-cover" />
                      <div>
                        <p className="font-semibold text-foreground">{testimonial.author}</p>
                        <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6 max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">{v.faqTitle || "Frequently Asked Questions"}</h2>
            <p className="text-muted-foreground">{v.faqSubtitle || "Everything you need to know about becoming an impact agent"}</p>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-foreground">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">{v.ctaHeading || "Ready to Start Making an Impact?"}</h2>
          <p className="text-lg opacity-90 max-w-2xl mx-auto mb-8">
            {v.ctaPara || "Join our community of skilled impact agents and start contributing to causes you care about today."}
          </p>
          <Button asChild size="lg" variant="secondary">
            <LocaleLink href="/auth/signup">
              {v.ctaButton || "Create Your Free Account"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </LocaleLink>
          </Button>
        </div>
      </section>
      </main>

      <Footer />
    </div>
  )
}
