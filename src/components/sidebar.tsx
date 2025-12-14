"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navigation = [
  { name: "Inbox", href: "/app/inbox", icon: "💬" },
  { name: "Channels", href: "/app/settings/channels", icon: "🔌" },
  { name: "Profile", href: "/app/settings/profile", icon: "👤" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 border-r bg-background h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">Menu</h2>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  isActive && "bg-accent"
                )}
              >
                <span className="mr-2">{item.icon}</span>
                {item.name}
              </Button>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

