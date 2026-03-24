import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { apiClient } from '../api/client.js'
import type { AuthUser } from '@blurr-tools/types'

const TOKEN_KEY = 'blurr_access_token'
const USER_KEY  = 'blurr_auth_user'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user        = ref<AuthUser | null>(JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'))

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)

  function setAuth(token: string, u: AuthUser) {
    accessToken.value = token
    user.value = u
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(u))
  }

  function clearAuth() {
    accessToken.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const res = await apiClient.post<{ accessToken: string; user: AuthUser }>('/auth/login', {
      email,
      password,
    })
    setAuth(res.data.accessToken, res.data.user)
    return res.data.user
  }

  async function logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout')
    } finally {
      clearAuth()
    }
  }

  async function fetchMe(): Promise<AuthUser | null> {
    try {
      const res = await apiClient.get<AuthUser>('/auth/me')
      user.value = res.data
      localStorage.setItem(USER_KEY, JSON.stringify(res.data))
      return res.data
    } catch {
      clearAuth()
      return null
    }
  }

  async function refreshToken(): Promise<string> {
    const res = await apiClient.post<{ accessToken: string; user: AuthUser }>('/auth/refresh')
    setAuth(res.data.accessToken, res.data.user)
    return res.data.accessToken
  }

  async function updateProfile(data: {
    name?:        string
    oldPassword?: string
    newPassword?: string
  }): Promise<AuthUser> {
    const res = await apiClient.put<AuthUser>('/auth/profile', data)
    if (user.value) {
      user.value = { ...user.value, ...res.data }
      localStorage.setItem(USER_KEY, JSON.stringify(user.value))
    }
    return res.data
  }

  return {
    user,
    accessToken,
    isAuthenticated,
    setAuth,
    clearAuth,
    login,
    logout,
    fetchMe,
    refreshToken,
    updateProfile,
  }
})
