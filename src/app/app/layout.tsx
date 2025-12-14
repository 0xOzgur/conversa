import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { Sidebar } from "@/components/sidebar"
import Image from "next/image"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Image
            src="/conversa-logo.png"
            alt="Conversa"
            width={120}
            height={32}
            className="h-8 w-auto"
            unoptimized
          />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{session.user.email}</span>
            <a
              href="/api/auth/signout"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sign out
            </a>
          </div>
        </div>
      </nav>
      <div className="flex h-[calc(100vh-64px)]">
        <Sidebar />
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

