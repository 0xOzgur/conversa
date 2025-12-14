import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Public routes
  if (pathname === "/login" || pathname.startsWith("/api/auth") || pathname.startsWith("/api/webhooks")) {
    if (isLoggedIn && pathname === "/login") {
      return NextResponse.redirect(new URL("/app/inbox", req.url))
    }
    return NextResponse.next()
  }

  // Protected routes
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect root to inbox
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/app/inbox", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}

