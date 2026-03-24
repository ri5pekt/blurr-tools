import axios from 'axios'
import { useAuthStore } from '../stores/auth.js'

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

// ─── Inject access token ──────────────────────────────────────────────────────

apiClient.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  return config
})

// ─── 401 handler: queue concurrent requests → refresh once → retry all ────────

let isRefreshing = false
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)))
  failedQueue = []
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const isAuthRoute = original?.url?.includes('/auth/')

    if (error.response?.status === 401 && !original?._retry && !isAuthRoute) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`
          return apiClient(original)
        })
      }

      original._retry = true
      isRefreshing = true

      try {
        const auth = useAuthStore()
        const token = await auth.refreshToken()
        processQueue(null, token)
        original.headers.Authorization = `Bearer ${token}`
        return apiClient(original)
      } catch (err) {
        processQueue(err, null)
        const auth = useAuthStore()
        auth.clearAuth()
        window.location.href = '/login'
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)
