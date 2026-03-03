"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { CheckCircle, Zap } from "lucide-react"
import { applyToProject } from "@/lib/actions"
import { AICoverLetterButton } from "@/components/ai/cover-letter-button"
import LocaleLink from "@/components/locale-link"

interface ApplyButtonProps {
  projectId: string
  projectTitle: string
  hasApplied?: boolean
  projectDescription?: string
  projectSkills?: string[]
  volunteerName?: string
  volunteerSkills?: string[]
  volunteerBio?: string
  deadline?: Date | string
}

export function ApplyButton({ 
  projectId, 
  projectTitle, 
  hasApplied = false,
  projectDescription = "",
  projectSkills = [],
  volunteerName = "",
  volunteerSkills = [],
  volunteerBio = "",
  deadline,
}: ApplyButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(hasApplied)
  const [error, setError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState(false)

  // Check if deadline has passed
  const isDeadlinePassed = deadline ? new Date(deadline) < new Date() : false
  const isDisabled = hasApplied || isDeadlinePassed

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)
    setError(null)
    setLimitReached(false)

    try {
      // Build cover message from form fields
      const coverMessage = [
        `Interest: ${formData.get("interest") || ""}`,
        `Experience: ${formData.get("experience") || ""}`,
        `Portfolio: ${formData.get("portfolio") || ""}`,
        `Availability: ${formData.get("availability") || ""}`,
      ].filter(s => !s.endsWith(": ")).join("\n\n")

      const result = await applyToProject(projectId, coverMessage)

      if (result.success) {
        setSubmitted(true)
        setTimeout(() => {
          setIsOpen(false)
          setSubmitted(false)
          router.refresh()
        }, 2000)
      } else {
        // Check if limit reached
        if (result.data === "LIMIT_REACHED") {
          setLimitReached(true)
        }
        setError(result.error || "Failed to submit application")
      }
    } catch (err) {
      setError("An error occurred. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          className="w-full bg-primary hover:bg-primary/90" 
          size="lg"
          disabled={isDisabled}
        >
          {hasApplied ? "Applied" : isDeadlinePassed ? "Deadline Passed" : "Apply Now"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-background">
        <DialogHeader>
          <DialogTitle>Apply for this Opportunity</DialogTitle>
          <DialogDescription>
            Tell the organization why you&apos;re interested and how you can help.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Application Submitted!</h3>
            <p className="text-muted-foreground">
              The organization will review your application and get back to you soon.
            </p>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            {error && (
              <div className={`p-3 rounded-lg text-sm ${limitReached ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200 text-red-600"}`}>
                {limitReached ? (
                  <div className="space-y-3">
                    <p className="text-amber-800 font-medium">Monthly limit reached!</p>
                    <p className="text-amber-700">You've used all 3 free applications this month.</p>
                    <Button asChild size="sm" className="w-full">
                      <LocaleLink href="/pricing">
                        <Zap className="h-4 w-4 mr-2" />
                        Upgrade to Pro for unlimited applications
                      </LocaleLink>
                    </Button>
                  </div>
                ) : (
                  error
                )}
              </div>
            )}

            {/* AI Cover Letter Generator */}
            {volunteerName && (
              <AICoverLetterButton
                projectTitle={projectTitle}
                projectDescription={projectDescription}
                projectSkills={projectSkills}
                volunteerName={volunteerName}
                volunteerSkills={volunteerSkills}
                volunteerBio={volunteerBio}
                onGenerated={(letter) => {
                  // Auto-fill the interest field with the generated letter
                  const interestField = document.getElementById("interest") as HTMLTextAreaElement
                  if (interestField) interestField.value = letter
                }}
              />
            )}

            <div>
              <Label htmlFor="interest">Why are you interested in this opportunity?</Label>
              <Textarea
                id="interest"
                name="interest"
                placeholder="Share what excites you about this opportunity..."
                className="mt-2"
                rows={3}
                required
              />
            </div>
            <div>
              <Label htmlFor="experience">Relevant experience</Label>
              <Textarea
                id="experience"
                name="experience"
                placeholder="Describe your relevant skills and past experience..."
                className="mt-2"
                rows={3}
                required
              />
            </div>
            <div>
              <Label htmlFor="portfolio">Portfolio or LinkedIn URL (optional)</Label>
              <Input id="portfolio" name="portfolio" type="url" placeholder="https://" className="mt-2" />
            </div>
            <div>
              <Label htmlFor="availability">Your availability</Label>
              <Input
                id="availability"
                name="availability"
                placeholder="e.g., Weekday evenings, 10 hours/week"
                className="mt-2"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit Application"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
