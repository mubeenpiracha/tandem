import { createContext, useContext, useEffect, useState } from 'react'
import type { AuthUser } from '@tandem/shared'
import api, { setAuthHeader } from '../lib/api'

interface AuthContextValue {
  accessToken: string | null
  user: AuthUser | null
  isLoading: boolean
  login: (accessToken: string, user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data } = await api.post<{ accessToken: string }>('/api/auth/refresh')
        setAuthHeader(data.accessToken)
        setAccessToken(data.accessToken)
        const { data: me } = await api.get<{ user: AuthUser }>('/api/auth/me')
        setUser(me.user)
      } catch {
        // No valid session — stay logged out
      } finally {
        setIsLoading(false)
      }
    }
    restoreSession()
  }, [])

  const login = (token: string, authUser: AuthUser) => {
    setAuthHeader(token)
    setAccessToken(token)
    setUser(authUser)
  }

  const logout = async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // Proceed regardless
    }
    setAuthHeader(null)
    setAccessToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ accessToken, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
