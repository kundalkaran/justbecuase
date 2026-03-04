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
import { Bell, User, Settings, LogOut } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { UnifiedSearchBar } from "@/components/unified-search-bar"
import { useNotificationStore } from "@/lib/store"
import { StreamMessageBadge } from "@/components/stream/stream-message-badge"
import { signOut } from "@/lib/auth-client"
import { useDictionary } from "@/components/dictionary-provider"

interface DashboardContentHeaderProps {
  userType: "volunteer" | "ngo"
  userName: string
  userAvatar?: string
}

export function DashboardContentHeader({ userType, userName, userAvatar }: DashboardContentHeaderProps) {
  const unreadCount = useNotificationStore((state) => state.unreadCount)
  const dict = useDictionary()
  const d = dict.dashboard || {} as any

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      {/* Left side */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <LocaleLink href="/" className="flex items-center">
          <Image src="/logo-main.png" alt="JBC Logo" width={200} height={98} className="h-10 sm:h-14 w-auto" />
        </LocaleLink>
      </div>

      {/* Search - Desktop */}
      <div className="hidden md:flex flex-1 max-w-md mx-4 lg:mx-8">
        <UnifiedSearchBar
          variant="compact"
          placeholder={userType === "volunteer"
            ? d.searchVolunteerPlaceholder || "Search opportunities or NGOs..."
            : d.searchNgoPlaceholder || "Search impact agents, skills, or projects..."}
          allowedTypes={userType === "volunteer"
            ? ["opportunity", "ngo"]
            : ["volunteer", "opportunity"]}
          className="w-full"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Message Notifications - Real-time via GetStream */}
        <StreamMessageBadge />

        {/* Bell Notifications */}
        <LocaleLink href={userType === "volunteer" ? "/volunteer/notifications" : "/ngo/notifications"}>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        </LocaleLink>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <img
                src={userAvatar || `/placeholder.svg?height=32&width=32&query=professional person avatar`}
                alt={userName}
                className="h-8 w-8 rounded-full object-cover"
              />
              <span className="hidden sm:inline font-medium">{userName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{d.myAccount || "My Account"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <LocaleLink href={userType === "volunteer" ? "/volunteer/profile" : "/ngo/profile"}>
                <User className="mr-2 h-4 w-4" />
                {d.profile || "Profile"}
              </LocaleLink>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <LocaleLink href={userType === "volunteer" ? "/volunteer/settings" : "/ngo/settings"}>
                <Settings className="mr-2 h-4 w-4" />
                {d.settings || "Settings"}
              </LocaleLink>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await signOut()
                window.location.href = "/auth/signin"
              }}
              className="text-destructive cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {d.signOut || "Sign Out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
