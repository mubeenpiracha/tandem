import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { ResetPasswordBody } from '@tandem/shared'
import api from '../lib/api'

export function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setIsSubmitting(true)

    try {
      const body: ResetPasswordBody = { token, password }
      await api.post('/api/auth/reset-password', body)
      navigate('/login?reset=true')
    } catch {
      setError('This link is invalid or has expired.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center px-4">
        <div className="bg-[#222244] rounded-2xl p-8 w-full max-w-md text-center">
          <p className="text-red-400 text-sm mb-4">Invalid reset link.</p>
          <Link to="/forgot-password" className="text-indigo-400 hover:underline text-sm">Request a new one</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center px-4">
      <div className="bg-[#222244] rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-white text-2xl font-semibold mb-2">Choose new password</h1>
        <p className="text-white/60 text-sm mb-6">Enter your new password below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/60 text-sm mb-1.5" htmlFor="password">New password</label>
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

          <div>
            <label className="block text-white/60 text-sm mb-1.5" htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
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
            {isSubmitting ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  )
}
