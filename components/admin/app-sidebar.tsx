"use client"

import LocaleLink from "@/components/locale-link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useLocale, localePath } from "@/hooks/use-locale"
import {
  LayoutDashboard,
  Users,
  Building2,
  FolderKanban,
  CreditCard,
  Settings,
  BarChart3,
  Shield,
  Heart,
  UsersRound,
  Ban,
  Bell,
  Tag,
  Database,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const navGroups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Users", href: "/admin/users", icon: Users },
      { title: "Impact Agents", href: "/admin/volunteers", icon: Heart },
      { title: "NGOs", href: "/admin/ngos", icon: Building2 },
      { title: "Opportunities", href: "/admin/projects", icon: FolderKanban },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Payments", href: "/admin/payments", icon: CreditCard },
      { title: "Coupons", href: "/admin/coupons", icon: Tag },
    ],
  },
  {
    label: "Communication",
    items: [
      { title: "Notifications", href: "/admin/notifications", icon: Bell },
    ],
  },
  {
    label: "Analytics",
    items: [
      { title: "Reports", href: "/admin/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Team", href: "/admin/team", icon: UsersRound },
      { title: "Ban History", href: "/admin/bans", icon: Ban },
      { title: "Admin Accounts", href: "/admin/admins", icon: Shield },
      { title: "Search Index", href: "/admin/search", icon: Database },
      { title: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
]

export function AdminAppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const locale = useLocale()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <LocaleLink href="/admin/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Shield className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Admin Panel</span>
                  <span className="truncate text-xs text-muted-foreground">JustBeCause</span>
                </div>
              </LocaleLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname === localePath(item.href, locale)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <LocaleLink href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </LocaleLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
