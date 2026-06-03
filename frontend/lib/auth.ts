const ACCESS_TOKEN_KEY = "access_token"
const REFRESH_TOKEN_KEY = "refresh_token"
const AUTH_STORAGE_KEY = "auth-storage"
const ACCESS_COOKIE_NAME = "access_token"
const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

const canUseBrowserStorage = () => typeof window !== "undefined"

const setAccessCookie = (token: string): void => {
  if (typeof document === "undefined") return
  const secure = window.location.protocol === "https:" ? "; secure" : ""
  document.cookie = `${ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${ACCESS_COOKIE_MAX_AGE}; samesite=lax${secure}`
}

const clearAccessCookie = (): void => {
  if (typeof document === "undefined") return
  document.cookie = `${ACCESS_COOKIE_NAME}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`
}

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=")
  return atob(padded)
}

export const getAccessToken = (): string | null =>
  canUseBrowserStorage() ? localStorage.getItem(ACCESS_TOKEN_KEY) : null

export const getRefreshToken = (): string | null =>
  canUseBrowserStorage() ? localStorage.getItem(REFRESH_TOKEN_KEY) : null

export const setTokens = (a: string, r: string): void => {
  if (canUseBrowserStorage()) {
    localStorage.setItem(ACCESS_TOKEN_KEY, a)
    localStorage.setItem(REFRESH_TOKEN_KEY, r)
  }
  setAccessCookie(a)
}

export const clearTokens = (): void => {
  if (canUseBrowserStorage()) {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }
  clearAccessCookie()
}

export const isLoggedIn = (): boolean => Boolean(getAccessToken())

export const getTokenExpiryMs = (token: string | null): number | null => {
  try {
    if (!token) return null
    const payload = JSON.parse(decodeBase64Url(token.split(".")[1]))
    return typeof payload.exp === "number" ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export const getCurrentUser = (): any => {
  try {
    const token = getAccessToken()
    if (!token) return null
    return JSON.parse(decodeBase64Url(token.split(".")[1]))
  } catch {
    return null
  }
}
