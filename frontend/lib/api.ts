import axios from "axios"
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./auth"
import { useAuthStore } from "./store"

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
})

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const redirectToLogin = () => {
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login")
  }
}

const expireSession = () => {
  useAuthStore.getState().logout()
  clearTokens()
  redirectToLogin()
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      try {
        const refreshToken = getRefreshToken()
        if (!refreshToken) throw new Error("No refresh token available")

        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`,
          { refresh_token: refreshToken }
        )
        const nextRefreshToken = data.refresh_token || refreshToken
        setTokens(data.access_token, nextRefreshToken)
        useAuthStore.getState().setTokens(data.access_token, nextRefreshToken)
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        expireSession()
      }
    }
    return Promise.reject(error)
  }
)

export default api
