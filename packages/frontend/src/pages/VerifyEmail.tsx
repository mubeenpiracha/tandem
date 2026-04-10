import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { VerifyEmailBody } from '@tandem/shared'
import api from '../lib/api'

type Status = 'loading' | 'success' | 'error'

export function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    const verify = async () => {
      try {
        const body: VerifyEmailBody = { token }
        await api.post('/api/auth/verify-email', body)
        setStatus('success')
      } catch {
        setStatus('error')
      }
    }

    verify()
  }, [token])

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center px-4">
      <div className="bg-[#222244] rounded-2xl p-8 w-full max-w-md text-center">
        {status === 'loading' && (
          <>
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/60">Verifying your email…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-white text-xl font-semibold mb-2">Email verified</h1>
            <p className="text-white/60 text-sm mb-6">Your email has been successfully verified.</p>
            <Link to="/login" className="text-indigo-400 hover:underline text-sm">Sign in to your account</Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-white text-xl font-semibold mb-2">Verification failed</h1>
            <p className="text-white/60 text-sm mb-6">This link is invalid or has expired.</p>
            <Link to="/login" className="text-indigo-400 hover:underline text-sm">Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  )
}
