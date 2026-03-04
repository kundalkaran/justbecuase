import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Mail, MapPin, Phone } from "lucide-react"
import { getDictionary } from "@/app/[lang]/dictionaries"
import type { Locale } from "@/lib/i18n-config"

export default async function ContactPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const dict = await getDictionary(lang as Locale)
  const c = (dict as any).contact || {}

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 md:px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">{c.title || "Contact Us"}</h1>
            <p className="text-lg text-muted-foreground">
              {c.subtitle || "Have questions? We'd love to hear from you."}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle>{c.sendAMessage || "Send a Message"}</CardTitle>
                <CardDescription>
                  {c.formDesc || "Fill out the form below and our team will get back to you."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="first-name" className="text-sm font-medium">{c.firstName || "First name"}</label>
                      <Input id="first-name" placeholder="John" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="last-name" className="text-sm font-medium">{c.lastName || "Last name"}</label>
                      <Input id="last-name" placeholder="Doe" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">{c.emailLabel || "Email"}</label>
                    <Input id="email" placeholder="john@example.com" type="email" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="message" className="text-sm font-medium">{c.messageLabel || "Message"}</label>
                    <Textarea id="message" placeholder={c.messagePlaceholder || "How can we help you?"} className="min-h-[120px]" />
                  </div>
                  <Button className="w-full">{c.sendButton || "Send Message"}</Button>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardContent className="p-6 flex items-start gap-4">
                  <Mail className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">{c.emailUs || "Email Us"}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {c.emailUsDesc || "For general inquiries and support."}
                    </p>
                    <a href="mailto:hello@justbecausenetwork.com" className="text-primary hover:underline">
                      hello@justbecausenetwork.com
                    </a>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 flex items-start gap-4">
                  <MapPin className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">{c.visitUs || "Visit Us"}</h3>
                    <p className="text-sm text-muted-foreground">
                      123 Impact Way, Tech Park<br />
                      Bangalore, Karnataka 560001<br />
                      India
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 flex items-start gap-4">
                  <Phone className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">{c.callUs || "Call Us"}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {c.callUsHours || "Mon-Fri from 9am to 6pm."}
                    </p>
                    <a href="tel:+919876543210" className="text-primary hover:underline">
                      +91 98765 43210
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
