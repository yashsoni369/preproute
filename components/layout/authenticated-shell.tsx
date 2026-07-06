"use client"

import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
  Archive,
  Bell,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  DollarSign,
  FileText,
  Gauge,
  Info,
  LogOut,
  Menu,
  MessageCircle,
  PenLine,
  Settings,
  Trophy,
  UserCog,
  Users,
  X,
} from "lucide-react"

import { clearAuthSession, getAuthUser } from "@/lib/auth"
import {
  invalidateDashboardTestsCache,
  readDashboardTestsCache,
} from "@/lib/dashboard-cache"
import { prefetchDashboardTests } from "@/lib/dashboard-tests-client"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

type AuthenticatedShellProps = {
  children: React.ReactNode
  actions?: React.ReactNode
}

type HeaderProfile = {
  name: string
  role: string
}

type NavItem = {
  label: string
  icon: typeof Gauge
  href: string | null
  matchPaths?: string[]
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: Gauge, href: "/dashboard" },
  {
    label: "Test Creation",
    icon: PenLine,
    href: "/test-creation",
    matchPaths: ["/test-creation", "/question-creation", "/publish-confirmation"],
  },
  { label: "Test Tracking", icon: ClipboardCheck, href: "/test-tracking" },
  { label: "Approvals", icon: Info, href: null },
  { label: "Resources", icon: FileText, href: null },
  { label: "User Management", icon: Users, href: null },
  { label: "Admin Management", icon: Building2, href: null },
  { label: "Role Management", icon: UserCog, href: null },
  { label: "Subscriptions", icon: Archive, href: null },
  { label: "Payments", icon: DollarSign, href: null },
  { label: "Badges", icon: Trophy, href: null },
  { label: "Customer Support", icon: MessageCircle, href: null },
  { label: "Notifications", icon: Bell, href: null },
  { label: "Settings", icon: Settings, href: null },
]

const flowStorageKeys = ["preproute_current_test", "preproute_created_questions"]

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function getProfileFromStoredUser(): HeaderProfile {
  const user = getAuthUser()
  const nameValue =
    typeof user?.name === "string" && user.name.trim()
      ? user.name
      : typeof user?.userId === "string"
        ? user.userId
        : "Vedant Boss"
  const roleValue =
    typeof user?.role === "string" && user.role.trim() ? user.role : "admin"

  return {
    name: toTitleCase(nameValue),
    role: toTitleCase(roleValue),
  }
}

export function AuthenticatedShell({
  actions,
  children,
}: AuthenticatedShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const mobileNavRef = useRef<HTMLDivElement>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [profile, setProfile] = useState<HeaderProfile>({
    name: "Vedant Boss",
    role: "Admin",
  })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProfile(getProfileFromStoredUser())
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.prefetch("/dashboard")
      router.prefetch("/test-tracking")

      if (
        pathname !== "/dashboard" &&
        pathname !== "/test-tracking" &&
        !readDashboardTestsCache()?.isFresh
      ) {
        void prefetchDashboardTests()
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [pathname, router])

  useEffect(() => {
    if (!isProfileMenuOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isProfileMenuOpen])

  useEffect(() => {
    if (!isMobileNavOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (
        mobileNavRef.current &&
        !mobileNavRef.current.contains(event.target as Node)
      ) {
        setIsMobileNavOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMobileNavOpen])

  function handleLogout() {
    clearAuthSession()
    invalidateDashboardTestsCache()
    flowStorageKeys.forEach((key) => window.localStorage.removeItem(key))
    setIsProfileMenuOpen(false)
    toast.success("Logged out", { description: "You have been signed out." })
    router.replace("/")
  }

  function warmNavItem(item: NavItem) {
    if (!item.href) {
      return
    }

    router.prefetch(item.href)

    if (item.href === "/dashboard" || item.href === "/test-tracking") {
      void prefetchDashboardTests()
    }
  }

  function handleNavItemClick(item: NavItem) {
    if (item.href) {
      warmNavItem(item)
      router.push(item.href)
    } else {
      toast.info(`${item.label} coming soon`)
    }
    setIsMobileNavOpen(false)
  }

  return (
    <main className="h-dvh overflow-hidden bg-white text-[#30384b]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-[#e0e6ef] bg-white transition-[width] duration-200 lg:flex",
          isSidebarCollapsed ? "w-[88px]" : "w-[240px]"
        )}
      >
        <div className="flex h-16 shrink-0 items-center overflow-visible px-5">
          <Image
            src="/assets/preproute-sidebar-logo.png"
            alt="Preproute"
            width={230}
            height={72}
            priority
            className="h-auto w-[174px] max-w-none shrink-0 object-contain"
          />
        </div>
        <nav
          data-slot="sidebar-nav-scroll"
          className="mt-6 min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-4"
        >
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = Boolean(
              item.href &&
                (item.matchPaths ?? [item.href]).some(
                  (path) => pathname === path || pathname?.startsWith(`${path}/`)
                )
            )

            return (
              <button
                key={item.label}
                type="button"
                className={cn(
                  "relative flex h-[44px] w-full items-center gap-3 rounded-[6px] text-left text-[15px] font-medium text-[#697083] transition hover:bg-[#f7f8ff] hover:text-[#2448dd] focus-visible:ring-2 focus-visible:ring-[#8aa4ef] focus-visible:outline-none",
                  isSidebarCollapsed ? "mx-auto w-11 justify-center px-0" : "px-5",
                  isActive &&
                    "bg-[#f3f5ff] text-[#2448dd] before:absolute before:left-0 before:top-0 before:h-full before:w-[5px] before:rounded-r-full before:bg-[#3151e8]"
                )}
                title={item.label}
                onFocus={() => warmNavItem(item)}
                onMouseEnter={() => warmNavItem(item)}
                onClick={() => handleNavItemClick(item)}
              >
                <Icon className="size-5 shrink-0" strokeWidth={1.8} />
                {!isSidebarCollapsed ? <span>{item.label}</span> : null}
              </button>
            )
          })}
        </nav>
        <button
          type="button"
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "absolute right-[-18px] top-[96px] z-30 flex size-9 items-center justify-center rounded-full border border-[#d8deea] bg-white text-[#697083] shadow-sm transition hover:bg-[#f7f8ff] hover:text-[#2448dd]"
          )}
          onClick={() => setIsSidebarCollapsed((current) => !current)}
        >
          {isSidebarCollapsed ? (
            <ChevronsRight className="size-4" />
          ) : (
            <ChevronsLeft className="size-4" />
          )}
        </button>
      </aside>

      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          <div
            ref={mobileNavRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="relative flex h-full w-[260px] flex-col border-r border-[#e0e6ef] bg-white shadow-[0_16px_40px_rgba(17,24,61,0.14)]"
          >
            <div className="flex h-16 shrink-0 items-center justify-between overflow-visible pl-5 pr-3">
              <Image
                src="/assets/preproute-sidebar-logo.png"
                alt="Preproute"
                width={230}
                height={72}
                className="h-auto w-[150px] max-w-none shrink-0 object-contain"
              />
              <button
                type="button"
                aria-label="Close navigation menu"
                className="flex size-9 items-center justify-center rounded-full text-[#697083] transition hover:bg-[#f7f8ff] hover:text-[#2448dd] focus-visible:ring-2 focus-visible:ring-[#8aa4ef] focus-visible:outline-none"
                onClick={() => setIsMobileNavOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-4">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = Boolean(
                  item.href &&
                    (item.matchPaths ?? [item.href]).some(
                      (path) => pathname === path || pathname?.startsWith(`${path}/`)
                    )
                )

                return (
                  <button
                    key={item.label}
                    type="button"
                    className={cn(
                      "relative flex h-[44px] w-full items-center gap-3 rounded-[6px] px-5 text-left text-[15px] font-medium text-[#697083] transition hover:bg-[#f7f8ff] hover:text-[#2448dd] focus-visible:ring-2 focus-visible:ring-[#8aa4ef] focus-visible:outline-none",
                      isActive &&
                        "bg-[#f3f5ff] text-[#2448dd] before:absolute before:left-0 before:top-0 before:h-full before:w-[5px] before:rounded-r-full before:bg-[#3151e8]"
                    )}
                    onFocus={() => warmNavItem(item)}
                    onMouseEnter={() => warmNavItem(item)}
                    onClick={() => handleNavItemClick(item)}
                  >
                    <Icon className="size-5 shrink-0" strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        </div>
      ) : null}

      <section
        className={cn(
          "flex h-dvh min-h-0 flex-col overflow-hidden transition-[padding-left] duration-200",
          isSidebarCollapsed ? "lg:pl-[88px]" : "lg:pl-[240px]"
        )}
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#e4e8f0] bg-white px-4 sm:px-6 lg:justify-end">
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full border border-[#d1d8e5] text-[#1f2937] transition hover:border-[#9fb1ff] hover:bg-[#f6f8ff] hover:text-[#2448dd] hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[#8aa4ef] focus-visible:outline-none lg:hidden"
            aria-label="Open navigation menu"
            aria-haspopup="menu"
            aria-expanded={isMobileNavOpen}
            onClick={() => setIsMobileNavOpen(true)}
          >
            <Menu className="size-5" strokeWidth={1.9} />
          </button>
          <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
            {actions ? (
              <div className="hidden shrink-0 items-center gap-3 sm:flex">
                {actions}
              </div>
            ) : null}
            <button
              type="button"
              className="relative flex size-10 items-center justify-center rounded-full border border-[#d1d8e5] text-[#1f2937] transition hover:border-[#9fb1ff] hover:bg-[#f6f8ff] hover:text-[#2448dd] hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[#8aa4ef] focus-visible:outline-none"
              aria-label="Notifications"
            >
              <Bell className="size-[18px]" strokeWidth={1.9} />
              <span className="absolute right-[10px] top-[9px] size-2 rounded-full bg-[#19a974] ring-2 ring-white" />
            </button>
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                className="flex items-center gap-3 rounded-[8px] px-2 py-1.5 text-left transition hover:bg-[#f6f8ff] hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[#8aa4ef] focus-visible:outline-none"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                onClick={() => setIsProfileMenuOpen((current) => !current)}
              >
                <Image
                  src="/assets/admin-avatar.png"
                  alt={profile.name}
                  width={40}
                  height={40}
                  className="size-10 rounded-full"
                />
                <span className="hidden min-w-[126px] sm:block">
                  <span className="flex items-center gap-2">
                    <span className="text-[17px] font-semibold leading-5 text-[#30384b]">
                      {profile.name}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 text-[#111827] transition-transform",
                        isProfileMenuOpen && "rotate-180"
                      )}
                    />
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-[#30384b]">
                    {profile.role}
                  </span>
                </span>
              </button>

              {isProfileMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+10px)] z-50 w-[220px] rounded-[8px] border border-[#dce2ec] bg-white p-2 shadow-[0_16px_40px_rgba(17,24,61,0.14)]"
                >
                  <div className="border-b border-[#edf1f7] px-3 py-2">
                    <p className="truncate text-[14px] font-semibold text-[#11183d]">
                      {profile.name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#697083]">
                      {profile.role}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="mt-2 flex h-10 w-full items-center gap-2 rounded-[6px] px-3 text-left text-[14px] font-medium text-[#ff5f67] transition hover:bg-[#fff4f4] focus-visible:ring-2 focus-visible:ring-[#ffb4b8] focus-visible:outline-none"
                    onClick={handleLogout}
                  >
                    <LogOut className="size-4" />
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div
          data-slot="main-content-scroll"
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        >
          {children}
        </div>
      </section>
    </main>
  )
}
