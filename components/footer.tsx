"use client"

import Link from "next/link"
import { Linkedin, Twitter, Instagram, Facebook } from "lucide-react"
import Image from "next/image"
import { NewsletterSubscribe } from "./newsletter-subscribe"
import { usePlatformSettingsStore } from "@/lib/store"
import LocaleLink from "@/components/locale-link"
import { useDictionary } from "@/components/dictionary-provider"

export function Footer() {
  const dict = useDictionary()
  const footer = dict.footer || {}
  // Get platform settings for branding and social links
  const platformSettings = usePlatformSettingsStore((state) => state.settings)
  const platformName = platformSettings?.platformName || "JustBeCause Network"
  const socialLinks = platformSettings?.socialLinks

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <LocaleLink href="/" className="flex items-center gap-2 mb-4">
              <Image src="/logo-main.png" alt="JBC Logo" width={200} height={98} className="h-16 w-auto" />
            </LocaleLink>
            <p className="text-muted-foreground mb-6 max-w-sm">
              {platformSettings?.platformDescription || "Connecting Skills with Purpose. Turn your expertise into lasting impact."}
            </p>
            <div className="flex items-center gap-4">
              {(socialLinks?.linkedin || !socialLinks) && (
                <a href={socialLinks?.linkedin || "https://www.linkedin.com/in/just-because-network-07599a3a9/"} className="text-muted-foreground hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer">
                  <Linkedin className="h-5 w-5" />
                  <span className="sr-only">LinkedIn</span>
                </a>
              )}
              {(socialLinks?.twitter || !socialLinks) && (
                <a href={socialLinks?.twitter || "https://twitter.com/justbecausenet"} className="text-muted-foreground hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer">
                  <Twitter className="h-5 w-5" />
                  <span className="sr-only">Twitter</span>
                </a>
              )}
              {(socialLinks?.instagram || !socialLinks) && (
                <a href={socialLinks?.instagram || "https://www.instagram.com/justbecausenet/"} className="text-muted-foreground hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer">
                  <Instagram className="h-5 w-5" />
                  <span className="sr-only">Instagram</span>
                </a>
              )}
              {(socialLinks?.facebook || !socialLinks) && (
                <a href={socialLinks?.facebook || "https://www.facebook.com/people/Justbecausenetwork/61587223264929/"} className="text-muted-foreground hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer">
                  <Facebook className="h-5 w-5" />
                  <span className="sr-only">Facebook</span>
                </a>
              )}
            </div>
          </div>

          {/* For Volunteers */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">{footer.forImpactAgents || "For Impact Agents"}</h4>
            <ul className="space-y-3">
              <li>
                <LocaleLink href="/projects" className="text-muted-foreground hover:text-foreground transition-colors">
                  {footer.browseOpportunities || "Browse Opportunities"}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink href="/for-volunteers" className="text-muted-foreground hover:text-foreground transition-colors">
                  {footer.howItWorks || "How It Works"}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink href="/auth/signup" className="text-muted-foreground hover:text-foreground transition-colors">
                  {footer.createProfile || "Create Profile"}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink
                  href="/volunteer/dashboard"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {footer.dashboard || "Dashboard"}
                </LocaleLink>
              </li>
            </ul>
          </div>

          {/* For NGOs */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">{footer.forNGOs || "For NGOs"}</h4>
            <ul className="space-y-3">
              <li>
                <LocaleLink href="/for-ngos" className="text-muted-foreground hover:text-foreground transition-colors">
                  {footer.whyPartner || "Why Partner"}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink
                  href="/ngo/post-project"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {footer.postOpportunity || "Post an Opportunity"}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink href="/ngo/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
                  {footer.dashboard || "Dashboard"}
                </LocaleLink>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">{footer.company || "Company"}</h4>
            <ul className="space-y-3">
              <li>
                <LocaleLink href="/about" className="text-muted-foreground hover:text-foreground transition-colors">
                  {footer.aboutUs || "About Us"}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink href="/blog" className="text-muted-foreground hover:text-foreground transition-colors">
                  {footer.blog || "Blogs"}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink href="/changelog" className="text-muted-foreground hover:text-foreground transition-colors">
                  {footer.changelog || "Changelog"}
                </LocaleLink>
              </li>
              <li>
                <LocaleLink href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">
                  {footer.contactUs || "Contact"}
                </LocaleLink>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-12 pt-8">
          {/* Newsletter */}
          <div className="max-w-md mx-auto mb-8">
            <h4 className="font-semibold text-foreground mb-2 text-center">{footer.stayUpdated || "Stay Updated"}</h4>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              {footer.newsletterDesc || "Get the latest opportunities and impact stories delivered to your inbox."}
            </p>
            <NewsletterSubscribe />
          </div>

          {/* Bottom Bar */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {platformName}. {footer.rights || "All rights reserved."}
            </p>
            <div className="flex items-center gap-6">
              <LocaleLink href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {footer.privacyPolicy || "Privacy Policy"}
              </LocaleLink>
              <LocaleLink href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {footer.termsOfService || "Terms of Service"}
              </LocaleLink>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
