import LocaleLink from "@/components/locale-link"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getImpactMetrics } from "@/lib/actions"
import { getDictionary } from "@/app/[lang]/dictionaries"
import type { Locale } from "@/lib/i18n-config"
import { Users, Clock, DollarSign, FileText, MessageSquare, Shield, ArrowRight, Star, Briefcase, Database, Target, Search, Gift } from "lucide-react"

export default async function ForNGOsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const dict = await getDictionary(lang as Locale)
  const n = (dict as any).forNGOs || {}
  const impactMetrics = await getImpactMetrics()

  const benefits = [
    { icon: Briefcase, title: n.benefit1Title || "Custom Job Postings", description: n.benefit1Desc || "Post remote roles for specialized job functions." },
    { icon: Database, title: n.benefit2Title || "Pro Bono & Low Bono Database", description: n.benefit2Desc || "Access our vetted directory of Skilled Impact Agents." },
    { icon: Target, title: n.benefit3Title || "Skill-Matched Opportunities", description: n.benefit3Desc || "Post a specific opportunity and let our matching engine find the perfect specialist." },
    { icon: Shield, title: n.benefit4Title || "Vetted Impact Agents", description: n.benefit4Desc || "All impact agents are verified professionals." },
    { icon: FileText, title: n.benefit5Title || "Opportunity Templates", description: n.benefit5Desc || "Use our pre-built templates to quickly post common opportunity types." },
    { icon: MessageSquare, title: n.benefit6Title || "Built-in Communication", description: n.benefit6Desc || "Communicate directly with impact agents through our platform." },
  ]

  const projectTypes = [
    { name: n.projectSocialMedia || "Social Media Strategy", hours: "10-15 hrs", value: "$750-$1,125" },
    { name: n.projectWebDesign || "Website Design", hours: "25-40 hrs", value: "$1,875-$3,000" },
    { name: n.projectGrantWriting || "Grant Writing", hours: "15-20 hrs", value: "$1,125-$1,500" },
    { name: n.projectBranding || "Brand Identity", hours: "20-30 hrs", value: "$1,500-$2,250" },
    { name: "Legal Review", hours: "5-10 hrs", value: "$375-$750" },
    { name: "Financial Planning", hours: "10-15 hrs", value: "$750-$1,125" },
  ]

  const faqs = [
    { question: n.faq1Q || "Is it free for NGOs to join?", answer: n.faq1A || "Yes! Creating an account and posting opportunities is free." },
    { question: n.faq2Q || "How do I find the right impact agent?", answer: n.faq2A || "Post your opportunity with detailed requirements." },
    { question: n.faq3Q || "What types of projects can I post?", answer: n.faq3A || "Anything your organization needs." },
    { question: n.faq4Q || "How long does it take to find help?", answer: n.faq4A || "Most NGOs receive applications within 48 hours." },
    { question: n.faq5Q || "Can I offer paid opportunities too?", answer: n.faq5A || "Absolutely!" },
    { question: n.faq6Q || "How do I know the quality will be good?", answer: n.faq6A || "All impact agents have verified profiles." },
  ]
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 bg-gradient-to-b from-secondary/10 to-background">
          <div className="container mx-auto px-4 md:px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
                  {n.heroTitle || "For NGOs: Build Your Dream Team"}
                </h1>
                <p className="text-xl text-muted-foreground mb-4">
                  {n.heroPara1 || "Get Professionals with specialized skill sets to support your NGO goals."}
                </p>
                <p className="text-lg text-muted-foreground mb-8">
                  {n.heroPara2 || "Access skilled professionals ready to help with marketing, tech, design, finance, and more."}
                </p>
                <div className="flex flex-wrap gap-4">
                  <Button asChild size="lg" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground">
                    <LocaleLink href="/auth/signup">
                      {n.registerNow || "NGO's – Register Now"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </LocaleLink>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="bg-transparent">
                    <LocaleLink href="/projects">{n.seeExamples || "See Example Opportunities"}</LocaleLink>
                  </Button>
                </div>
              </div>
              <div className="relative overflow-hidden">
                <img
                  src="/nonprofit-team-meeting-diverse-professionals.png"
                  alt="NGO team collaborating"
                  className="rounded-2xl shadow-2xl w-full"
                />
                <div className="absolute -bottom-4 right-2 md:-bottom-6 md:-right-6 bg-card p-3 md:p-4 rounded-xl shadow-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                      <Star className="h-6 w-6 text-secondary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{n.valueStat || "$2.4M+ Value"}</p>
                      <p className="text-sm text-muted-foreground">{n.valueStatDesc || "Created for NGOs"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features for NGOs */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">{n.helpTitle || "How We Help NGOs Build Their Dream Team"}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {n.helpSubtitle || "Access the talent you need through multiple pathways"}
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              <Card className="border-2 hover:border-secondary/50 transition-colors">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
                    <Briefcase className="h-6 w-6 text-secondary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{n.customJobTitle || "Custom Job Postings"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {n.customJobDesc || "Post remote roles for specialized job functions."}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-2 hover:border-secondary/50 transition-colors">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
                    <Database className="h-6 w-6 text-secondary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{n.proBonoDbTitle || "Pro Bono & Low Bono Database"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {n.proBonoDbDesc || "Access our vetted directory of Skilled Impact Agents."}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-2 hover:border-secondary/50 transition-colors">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
                    <Target className="h-6 w-6 text-secondary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{n.skillMatchTitle || "Skill-Matched Opportunities"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {n.skillMatchDesc || "Post a specific opportunity and let our matching engine find the perfect specialist."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-12">
          <div className="container mx-auto px-4 md:px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <p className="text-4xl font-bold text-primary mb-2">{impactMetrics.ngosSupported}</p>
                <p className="text-muted-foreground">{n.statNGOs || "NGOs Supported"}</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-secondary mb-2">{impactMetrics.projectsCompleted}</p>
                <p className="text-muted-foreground">{n.statCompleted || "Opportunities Completed"}</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-primary mb-2">{impactMetrics.volunteers.toLocaleString()}</p>
                <p className="text-muted-foreground">{n.statAgents || "Skilled Impact Agents"}</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-secondary mb-2">
                  ${(impactMetrics.valueGenerated / 1000000).toFixed(1)}M
                </p>
                <p className="text-muted-foreground">{n.statValue || "Value Created"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-16">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">{n.whyChooseTitle || "Why NGOs Choose Us"}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {n.whyChooseSubtitle || "Get the professional support you need to grow your impact without stretching your budget"}
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {benefits.map((benefit) => (
                <Card key={benefit.title}>
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
                      <benefit.icon className="h-6 w-6 text-secondary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
                    <p className="text-sm text-muted-foreground">{benefit.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Project Value Calculator */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">{n.valueCalcTitle || "See the Value You Could Receive"}</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                {n.valueCalcSubtitle || "Based on average consultant rates of $75/hour, here's what you could save on common opportunities"}
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {projectTypes.map((project) => (
                <Card key={project.name}>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-foreground mb-2">{project.name}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      <Clock className="h-4 w-4 inline mr-1" />
                      {project.hours}
                    </p>
                    <p className="text-lg font-bold text-primary">{project.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16">
          <div className="container mx-auto px-4 md:px-6 max-w-3xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">{n.faqTitle || "Frequently Asked Questions"}</h2>
            </div>
            <div className="space-y-4">
              {faqs.map((faq, idx) => (
                <Card key={idx}>
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-foreground mb-2">{faq.question}</h3>
                    <p className="text-muted-foreground">{faq.answer}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 md:px-6 text-center">
            <h2 className="text-3xl font-bold mb-4">{n.ctaHeading || "Ready to Find Your Impact Agents?"}</h2>
            <p className="text-xl mb-8 text-primary-foreground/90 max-w-2xl mx-auto">
              {n.ctaPara || "Join hundreds of NGOs already benefiting from skills-based contributions"}
            </p>
            <Button size="lg" variant="secondary" asChild>
              <LocaleLink href="/auth/signup">
                {n.ctaButton || "Get Started - It's Free"}
                <ArrowRight className="ml-2 h-5 w-5" />
              </LocaleLink>
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}
