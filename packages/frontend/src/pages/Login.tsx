import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { LoginBody } from '@tandem/shared'
import api from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { AuthUser } from '@tandem/shared'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const wasReset = searchParams.get('reset') === 'true'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const body: LoginBody = { email, password }
      const { data } = await api.post<{ accessToken: string; user: AuthUser }>('/api/auth/login', body)
      login(data.accessToken, data.user)
      navigate('/dashboard')
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status
      if (status === 401) {
        setError('Invalid email or password')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center px-4">
      <div className="bg-[#222244] rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-white text-2xl font-semibold mb-2">Welcome back</h1>
        <p className="text-white/60 text-sm mb-6">Sign in to your Tandem account</p>

        {wasReset && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg px-4 py-3 mb-6">
            Password reset successfully. Sign in with your new password.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/60 text-sm mb-1.5" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-[#1a1a2e] border border-white/10 text-white rounded-lg px-4 py-2.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-white/60 text-sm mb-1.5" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-[#1a1a2e] border border-white/10 text-white rounded-lg px-4 py-2.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 w-full transition"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <p className="text-white/60 text-sm">
            <Link to="/forgot-password" className="text-indigo-400 hover:underline">Forgot password?</Link>
          </p>
          <p className="text-white/60 text-sm">
            Don't have an account?{' '}
            <Link to="/register" className="text-indigo-400 hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
