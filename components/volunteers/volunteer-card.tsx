"use client"

import Image from "next/image"
import LocaleLink from "@/components/locale-link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  MapPin,
  Star,
  Clock,
  Lock,
  CheckCircle,
  Eye,
  DollarSign,
  MessageSquare,
  Briefcase,
} from "lucide-react"
import type { VolunteerProfileView } from "@/lib/types"
import { skillCategories } from "@/lib/skills-data"
import { useDictionary } from "@/components/dictionary-provider"

interface VolunteerCardProps {
  volunteer: VolunteerProfileView
}

export function VolunteerCard({ volunteer }: VolunteerCardProps) {
  const dict = useDictionary()
  const vd = (dict as any).volunteerDetail || {}
  const vl = (dict as any).volunteersListing || {}

  // Get skill names from IDs
  const skillNames = volunteer.skills.slice(0, 3).map((skill) => {
    const category = skillCategories.find((c) => c.id === skill.categoryId)
    const subskill = category?.subskills.find((s) => s.id === skill.subskillId)
    return subskill?.name || skill.subskillId
  })

  const isFreeVolunteer = volunteer.volunteerType === "free"
  const isBothVolunteer = volunteer.volunteerType === "both"
  const isLocked = !volunteer.isUnlocked

  return (
    <Card className="group hover:shadow-lg hover:border-primary/20 transition-all duration-200 overflow-hidden flex flex-col h-full">
      <CardContent className="p-0 flex flex-col flex-1">
        {/* Header with Avatar */}
        <div className="relative p-5 pb-3">
          {/* Volunteer Type Badge */}
          <div className="absolute top-3 right-3 z-10">
            {isFreeVolunteer ? (
              <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800 text-xs font-medium">
                {vl.proBono || "Pro Bono"}
              </Badge>
            ) : isBothVolunteer ? (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800 text-xs font-medium">
                {vd.freeAndPaid || "Free & Paid"}
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center gap-1 text-xs font-medium">
                <DollarSign className="h-3 w-3" />
                {vl.paid || "Paid"}
              </Badge>
            )}
          </div>

          {/* Avatar and Name */}
          <div className="flex items-start gap-3">
            <div className="relative flex-shrink-0">
              {volunteer.avatar && !isLocked ? (
                <Image
                  src={volunteer.avatar}
                  alt={volunteer.name || "Impact Agent"}
                  width={56}
                  height={56}
                  className="w-14 h-14 rounded-full object-cover ring-2 ring-background shadow-sm"
                />
              ) : (
                <div
                  className={`w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-lg font-semibold text-primary ring-2 ring-background shadow-sm ${
                    isLocked ? "blur-sm" : ""
                  }`}
                >
                  {volunteer.name
                    ? volunteer.name.charAt(0).toUpperCase()
                    : "V"}
                </div>
              )}
              {volunteer.isVerified && (
                <CheckCircle className="absolute -bottom-0.5 -right-0.5 h-4 w-4 text-primary bg-background rounded-full" />
              )}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className={`font-semibold text-foreground text-sm truncate ${isLocked ? "blur-sm" : ""}`}>
                {volunteer.name || "Impact Agent Profile"}
              </h3>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 h-4">
                {volunteer.location ? (
                  <>
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{volunteer.location}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground/50 italic">—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats — always rendered with fixed height */}
        <div className="px-5 pb-3 h-7">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-1 text-xs">
              <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
              <span className="font-medium">{volunteer.rating > 0 ? volunteer.rating.toFixed(1) : "—"}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Briefcase className="h-3.5 w-3.5 text-primary/60" />
              <span>{volunteer.completedProjects} {vd.opportunitiesCompleted ? vd.opportunitiesCompleted.replace("{count} ", "").replace("{count}", "") : "completed"}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{volunteer.hoursPerWeek} {dict.common?.hrsWeek || "hrs/week"}</span>
            </div>
          </div>
        </div>

        {/* Skills — fixed height with overflow hidden */}
        <div className="px-5 pb-3 h-[30px] overflow-hidden">
          <div className="flex flex-wrap gap-1">
            {skillNames.map((skill, index) => (
              <Badge key={index} variant="outline" className="text-[11px] px-2 py-0 h-5 font-normal">
                {skill}
              </Badge>
            ))}
            {volunteer.skills.length > 3 && (
              <Badge variant="outline" className="text-[11px] px-2 py-0 h-5 font-normal text-muted-foreground">
                {(vd.plusMore || "+{count} more").replace("{count}", String(volunteer.skills.length - 3))}
              </Badge>
            )}
          </div>
        </div>

        {/* Middle content — grows to fill remaining space */}
        <div className="flex-1 flex flex-col justify-end px-5 pb-3 min-h-[52px]">
          {isLocked ? (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
              <Lock className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{vd.proRequired || "Pro subscription required"}</span>
            </div>
          ) : volunteer.bio ? (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {volunteer.bio}
            </p>
          ) : (
            <div />
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border mx-5 mt-auto" />

        {/* Actions — always pinned to bottom */}
        <div className="px-5 py-3 flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1 h-8 text-xs">
            <LocaleLink href={`/volunteers/${volunteer.id}`}>
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              {vd.viewProfile || "View Profile"}
            </LocaleLink>
          </Button>
          {isLocked ? (
            <Button size="sm" className="flex-1 h-8 text-xs" asChild>
              <LocaleLink href="/pricing">
                {vd.subscribeToView || "Subscribe"}
              </LocaleLink>
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex-1">
                    <Button size="sm" className="w-full h-8 text-xs" disabled={!volunteer.canMessage}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      {vd.message || dict.common?.message || "Message"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!volunteer.canMessage && (
                  <TooltipContent>
                    <p>{vd.proRequired || "Pro subscription required"}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
