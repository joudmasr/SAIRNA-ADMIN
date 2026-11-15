
import React, { useState } from 'react'

const API_URL = 'https://sairna.abdulrahman-hares.com/api/v1/dashboard'

export default function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          result.message ||
          result.error ||
          'بيانات الدخول غير صحيحة.'
        )
      }

      const data = result.data || result
      const token =
        data.accessToken ||
        data.access_token ||
        data.token

      if (!token) {
        throw new Error('السيرفر لم يرجع رمز الدخول. تأكدي من استجابة تسجيل الدخول.')
      }

      const admin = {
        ...data,
        email: data.email || email.trim(),
        token,
      }

      localStorage.setItem('sairna-admin', JSON.stringify(admin))
      localStorage.setItem('sairna-admin-token', token)

      onLogin?.(admin)
    } catch (err) {
      setError(
        err.message === 'Failed to fetch'
          ? 'تعذر الاتصال بالسيرفر. تحققي من الاتصال وحاولي مجدداً.'
          : err.message || 'حدث خطأ أثناء تسجيل الدخول.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-gray-100 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 w-full max-w-md text-right">
        <div className="text-center mb-6">
          <span className="w-12 h-12 bg-teal-600 text-white font-bold text-xl rounded-xl inline-flex items-center justify-center mb-3">
            س
          </span>

          <h1 className="text-xl font-bold text-gray-800">
            تسجيل دخول الإدارة
          </h1>

          <p className="text-xs text-gray-500 mt-1">
            نظام سيرنا لحجز الرحلات
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg text-center font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              البريد الإلكتروني
            </label>

            <input
              type="email"
              required
              autoComplete="username"
              placeholder="البريد الإلكتروني"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              كلمة المرور
            </label>

            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-lg text-sm transition disabled:opacity-50"
          >
            {loading ? 'جاري تسجيل الدخول...' : 'دخول للوحة التحكم'}
          </button>
        </form>
      </div>
    </div>
  )
}
