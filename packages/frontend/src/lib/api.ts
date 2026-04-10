import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  withCredentials: true,
})

let isRefreshing = false

api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry && !isRefreshing) {
      original._retry = true
      isRefreshing = true
      try {
        await api.post('/api/auth/refresh')
        isRefreshing = false
        return api(original)
      } catch {
        isRefreshing = false
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }
    return Promise.reject(error)
  }
)

export function setAuthHeader(token: string | null) {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common['Authorization']
  }
}

export default api
