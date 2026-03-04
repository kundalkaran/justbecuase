"use client"

import LocaleLink from "@/components/locale-link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, LogOut, User, Settings, ExternalLink } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { signOut } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { useLocale, localePath } from "@/hooks/use-locale"

interface AdminHeaderProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export function AdminHeader({ user }: AdminHeaderProps) {
  const router = useRouter()
  const locale = useLocale()

  const handleSignOut = async () => {
    await signOut()
    router.push(localePath("/", locale))
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <LocaleLink href="/admin/dashboard" className="flex items-center gap-2">
          <Image src="/logo-main.png" alt="JBC Logo" width={160} height={78} className="h-10 w-auto" />
          <span className="hidden sm:inline text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Admin</span>
        </LocaleLink>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <LocaleLink href="/" target="_blank" className="flex items-center gap-1">
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">View Site</span>
          </LocaleLink>
        </Button>

        <Button variant="ghost" size="icon" asChild>
          <LocaleLink href="/admin/notifications">
            <Bell className="h-5 w-5" />
          </LocaleLink>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                {user.name?.charAt(0) || user.email?.charAt(0) || "A"}
              </div>
              <span className="hidden md:inline-block text-sm font-medium">
                {user.name || "Admin"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{user.name || "Admin"}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <LocaleLink href="/admin/settings" className="flex items-center gap-2 cursor-pointer">
                <Settings className="h-4 w-4" />
                Settings
              </LocaleLink>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
