import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ForgotPasswordBody } from '@tandem/shared'
import api from '../lib/api'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const body: ForgotPasswordBody = { email }
      await api.post('/api/auth/forgot-password', body)
    } catch {
      // Backend always returns 200 — swallow errors
    } finally {
      setIsSubmitting(false)
      setSubmitted(true)
    }
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center px-4">
      <div className="bg-[#222244] rounded-2xl p-8 w-full max-w-md">
        <h1 className="text-white text-2xl font-semibold mb-2">Reset password</h1>
        <p className="text-white/60 text-sm mb-6">
          Enter your email and we'll send you a reset link.
        </p>

        {submitted ? (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg px-4 py-3">
            If that email is registered, check your inbox.
          </div>
        ) : (
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 w-full transition"
            >
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-white/60 text-sm">
          <Link to="/login" className="text-indigo-400 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
