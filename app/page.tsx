import { redirect } from "next/navigation"
import { i18n } from "@/lib/i18n-config"

export default function RootPage() {
  redirect(`/${i18n.defaultLocale}`)

// Handle missing or invalid language prefixes for other routes
if (!i18n.locales.includes(i18n.defaultLocale)) {
  redirect(`/${i18n.defaultLocale}`);
}
}
