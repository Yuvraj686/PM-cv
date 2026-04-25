import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PROTECTED = ["/dashboard", "/projects", "/settings", "/onboarding"]
const PUBLIC = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password", "/auth/callback"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get("access_token")?.value

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p))

  // Redirect unauthenticated users away from protected pages
  if (isProtected && !token) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Redirect authenticated users away from public auth pages,
  // but allow /onboarding (onboarding flow) and /auth/callback
  // (OAuth re-login — tokens haven't been stored in the cookie yet).
  if (
    isPublic &&
    token &&
    !pathname.startsWith("/onboarding") &&
    !pathname.startsWith("/auth/callback")
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
