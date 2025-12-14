import { redirect } from "next/navigation"
import { auth } from "@/auth"

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
          <h1 className="text-xl font-semibold">Unified Inbox</h1>
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
      {children}
    </div>
  )
}

