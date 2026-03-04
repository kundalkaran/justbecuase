"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Users, Building2 } from "lucide-react"
import { useDictionary } from "@/components/dictionary-provider"
import LocaleLink from "@/components/locale-link"
import { usePlatformSettingsStore } from "@/lib/store"

export function HeroSection() {
  const dict = useDictionary()
  const hero = dict.hero || {}
  const platformSettings = usePlatformSettingsStore((state) => state.settings)
  const platformName = platformSettings?.platformName || "JustBeCause Network"

  return (
    <section className="relative overflow-hidden bg-background py-16 md:py-24 lg:py-32">
      {/* Minimal background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-primary/3 blur-3xl" />
      </div>

      <div className="container relative mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-4xl text-center">

          {/* Main Headline - MISSION IMPOSSIBLE */}
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            {hero.missionLine || "MISSION"} <span className="line-through decoration-2 text-muted-foreground/60">{hero.im || "IM"}</span><span className="text-primary">{hero.possible || "POSSIBLE"}</span>
          </h1>

          {/* Tagline */}
          <p className="mx-auto mb-6 max-w-xl text-lg text-foreground font-medium">
            {(hero.tagline || "You've spent years perfecting your {skill}; now, give it a {purpose}.")
              .split(/(\{skill\}|\{purpose\})/g)
              .map((part: string, i: number) => {
                if (part === "{skill}") return <span key={i} className="font-bold">{hero.skill || "skill"}</span>;
                if (part === "{purpose}") return <span key={i} className="font-bold">{hero.purpose || "purpose"}</span>;
                return part;
              })}
          </p>

          {/* Description */}
          <p className="mx-auto mb-12 max-w-2xl text-muted-foreground leading-relaxed">
            {hero.description ? (
              hero.description.split("{platformName}").map((part: string, i: number, arr: string[]) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && <span className="font-semibold text-foreground">{platformName}</span>}
                </span>
              ))
            ) : (
              <>
                Across the globe, visionary NGOs are working tirelessly to change lives, but they shouldn&apos;t have to do it alone. 
                They have the passion, but they need your professional expertise to break through. 
                <span className="font-semibold text-foreground"> {platformName}</span> is the bridge between your talent and their impact. 
                We believe that when your mastery meets their mission, the impossible becomes possible.
              </>
            )}
          </p>

          {/* Registration Options */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
            {/* NGO Registration */}
            <div className="flex flex-col items-center gap-2 p-6 rounded-2xl border border-border bg-card hover:border-primary/50 transition-colors w-full sm:w-auto sm:min-w-[200px]">
              <Building2 className="h-8 w-8 text-primary mb-2" />
              <span className="font-bold text-lg text-foreground">{hero.ngoTitle || "NGO"}</span>
              <span className="text-xs text-muted-foreground text-center">
                {hero.ngoSubtitle || "Register here if you are an NGO looking for talent"}
              </span>
              <Button asChild size="sm" className="mt-3">
                <LocaleLink href="/auth/signup?role=ngo" className="flex items-center gap-2">
                  {hero.ngoButton || "Register"} <ArrowRight className="h-3 w-3" />
                </LocaleLink>
              </Button>
            </div>

            {/* Volunteer Registration */}
            <div className="flex flex-col items-center gap-2 p-6 rounded-2xl border border-border bg-card hover:border-primary/50 transition-colors w-full sm:w-auto sm:min-w-[200px]">
              <Users className="h-8 w-8 text-primary mb-2" />
              <span className="font-bold text-lg text-foreground">{hero.impactAgentTitle || "Impact Agent"}</span>
              <span className="text-xs text-muted-foreground text-center">
                {hero.impactAgentSubtitle || "Register here if you are an individual looking to offer your skill"}
              </span>
              <Button asChild size="sm" className="mt-3">
                <LocaleLink href="/auth/signup?role=volunteer" className="flex items-center gap-2">
                  {hero.impactAgentButton || "Register"} <ArrowRight className="h-3 w-3" />
                </LocaleLink>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
