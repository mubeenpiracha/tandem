import { useAuth } from '../context/AuthContext'

export function Dashboard() {
  const { logout } = useAuth()

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col items-center justify-center gap-6">
      <h1 className="text-white text-3xl font-semibold">Dashboard</h1>
      <button
        onClick={logout}
        className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition"
      >
        Sign out
      </button>
    </div>
  )
}
