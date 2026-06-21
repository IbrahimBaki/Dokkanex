import { Outlet } from 'react-router-dom'
import AdminNavbar from './AdminNavbar'

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNavbar />
      <main className="pb-16">
        <Outlet />
      </main>
    </div>
  )
}
