export const getAccessToken = (): string | null => localStorage.getItem("access_token")
export const getRefreshToken = (): string | null => localStorage.getItem("refresh_token")

export const setTokens = (a: string, r: string): void => {
  localStorage.setItem("access_token", a)
  localStorage.setItem("refresh_token", r)
}

export const clearTokens = (): void => {
  localStorage.removeItem("access_token")
  localStorage.removeItem("refresh_token")
}

export const isLoggedIn = (): boolean => Boolean(getAccessToken())

export const getCurrentUser = (): any => {
  try {
    const token = getAccessToken()
    if (!token) return null
    return JSON.parse(atob(token.split(".")[1]))
  } catch {
    return null
  }
}
