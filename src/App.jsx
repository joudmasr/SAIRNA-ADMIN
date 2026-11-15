
import React, { useState } from 'react'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './components/AdminDashboard'

export default function App() {
  const [admin, setAdmin] = useState(() => {
    try {
      const savedAdmin = localStorage.getItem('sairna-admin')
      const token = localStorage.getItem('sairna-admin-token')

      if (!savedAdmin || !token) return null

      return {
        ...JSON.parse(savedAdmin),
        token,
      }
    } catch {
      return null
    }
  })

  const handleLogin = (adminData) => {
    setAdmin(adminData)
  }

  const handleLogout = () => {
    localStorage.removeItem('sairna-admin')
    localStorage.removeItem('sairna-admin-token')
    setAdmin(null)
  }

  return (
    <>
      {admin ? (
        <AdminDashboard
          admin={admin}
          onLogout={handleLogout}
        />
      ) : (
        <AdminLogin onLogin={handleLogin} />
      )}
    </>
  )
}
