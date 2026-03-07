"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useTransition } from "react"
import { useLocale, localePath } from "@/hooks/use-locale"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Button } from "@/components/ui/button"
import { Filter, X, Loader2 } from "lucide-react"
import { skillCategories, causes } from "@/lib/skills-data"

export function VolunteersFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const locale = useLocale()

  // Read current filters from URL
  const selectedSkills = searchParams.get("skills")?.split(",").filter(Boolean) || []
  const selectedCauses = searchParams.get("causes")?.split(",").filter(Boolean) || []
  const volunteerType = searchParams.get("type") || "all"
  const workMode = searchParams.get("workMode") || "all"

  // Update URL with new filters
  const updateFilters = useCallback((updates: Record<string, string | null>) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "" || value === "all") {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      })
      
      router.push(localePath(`/volunteers?${params.toString()}`, locale))
    })
  }, [router, searchParams])

  const handleSkillToggle = (skillId: string) => {
    const newSkills = selectedSkills.includes(skillId)
      ? selectedSkills.filter((s) => s !== skillId)
      : [...selectedSkills, skillId]
    updateFilters({ skills: newSkills.length > 0 ? newSkills.join(",") : null })
  }

  const handleCauseToggle = (causeId: string) => {
    const newCauses = selectedCauses.includes(causeId)
      ? selectedCauses.filter((c) => c !== causeId)
      : [...selectedCauses, causeId]
    updateFilters({ causes: newCauses.length > 0 ? newCauses.join(",") : null })
  }

  const clearFilters = () => {
    router.push(localePath("/volunteers", locale))
  }

  const hasFilters =
    selectedSkills.length > 0 ||
    selectedCauses.length > 0 ||
    volunteerType !== "all" ||
    workMode !== "all"

  return (
    <Card className="sticky top-24">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4" />
            Filters
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          </CardTitle>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Volunteer Type */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Impact Agent Type</Label>
          <RadioGroup 
            value={volunteerType} 
            onValueChange={(value) => updateFilters({ type: value })}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="type-all" />
              <Label htmlFor="type-all" className="text-sm font-normal cursor-pointer">
                All Impact Agents
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="free" id="type-free" />
              <Label htmlFor="type-free" className="text-sm font-normal cursor-pointer">
                Free Impact Agents
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="paid" id="type-paid" />
              <Label htmlFor="type-paid" className="text-sm font-normal cursor-pointer">
                Paid Impact Agents
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="both" id="type-both" />
              <Label htmlFor="type-both" className="text-sm font-normal cursor-pointer">
                Open to Both
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Work Mode */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Work Mode</Label>
          <RadioGroup 
            value={workMode} 
            onValueChange={(value) => updateFilters({ workMode: value })}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="mode-all" />
              <Label htmlFor="mode-all" className="text-sm font-normal cursor-pointer">
                Any
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="remote" id="mode-remote" />
              <Label htmlFor="mode-remote" className="text-sm font-normal cursor-pointer">
                Remote
              </Label>
            </div>
            {/*
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="hybrid" id="mode-hybrid" />
              <Label htmlFor="mode-hybrid" className="text-sm font-normal cursor-pointer">
                Hybrid
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="onsite" id="mode-onsite" />
              <Label htmlFor="mode-onsite" className="text-sm font-normal cursor-pointer">
                On-site
              </Label>
            </div>
            */}
          </RadioGroup>
        </div>

        {/* Skills */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Skills</Label>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
            {skillCategories.map((category) => (
              <div key={category.id} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{category.name}</p>
                {category.subskills.slice(0, 4).map((skill) => (
                  <div key={skill.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={skill.id}
                      checked={selectedSkills.includes(skill.id)}
                      onCheckedChange={() => handleSkillToggle(skill.id)}
                    />
                    <Label
                      htmlFor={skill.id}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {skill.name}
                    </Label>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Causes */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Causes</Label>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
            {causes.map((cause) => (
              <div key={cause.id} className="flex items-center space-x-2">
                <Checkbox
                  id={cause.id}
                  checked={selectedCauses.includes(cause.id)}
                  onCheckedChange={() => handleCauseToggle(cause.id)}
                />
                <Label
                  htmlFor={cause.id}
                  className="text-sm font-normal cursor-pointer flex items-center gap-1"
                >
                  <span>{cause.icon}</span>
                  {cause.name}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
