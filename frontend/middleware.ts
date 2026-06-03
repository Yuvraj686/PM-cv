import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PROTECTED = ["/dashboard", "/projects", "/settings", "/onboarding"]
const PUBLIC = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password", "/auth/callback"]
const AUTH_COOKIE = "access_token"

type TokenState = "missing" | "valid" | "expired" | "invalid"

function parseJwtPayload(token: string): { exp?: number } | null {
  try {
    const payload = token.split(".")[1]
    if (!payload) return null

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=")
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function getTokenState(token?: string): TokenState {
  if (!token) return "missing"

  const payload = parseJwtPayload(token)
  if (!payload || typeof payload.exp !== "number") return "invalid"

  return payload.exp * 1000 <= Date.now() ? "expired" : "valid"
}

function clearAuthCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, "", {
    path: "/",
    maxAge: 0,
  })
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const tokenState = getTokenState(request.cookies.get(AUTH_COOKIE)?.value)

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p))

  // Redirect unauthenticated users away from protected pages
  if (isProtected && (tokenState === "missing" || tokenState === "invalid")) {
    const response = NextResponse.redirect(new URL("/login", request.url))
    clearAuthCookie(response)
    return response
  }

  // Redirect authenticated users away from public auth pages,
  // but allow /onboarding (onboarding flow) and /auth/callback
  // (OAuth re-login — tokens haven't been stored in the cookie yet).
  if (
    isPublic &&
    tokenState === "valid" &&
    !pathname.startsWith("/onboarding") &&
    !pathname.startsWith("/auth/callback")
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  const response = NextResponse.next()
  if (isPublic && (tokenState === "expired" || tokenState === "invalid")) {
    clearAuthCookie(response)
  }
  return response
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
