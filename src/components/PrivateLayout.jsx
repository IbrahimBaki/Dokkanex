import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Navbar from './Navbar'

export default function PrivateLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('dokkanx-sidebar-collapsed') === 'true')
  useEffect(() => { localStorage.setItem('dokkanx-sidebar-collapsed', String(sidebarCollapsed)); document.documentElement.dataset.sidebarCollapsed = String(sidebarCollapsed) }, [sidebarCollapsed])
  return <div className="min-h-screen bg-slate-50"><Navbar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} /><main className={`pb-24 transition-[padding] duration-300 md:pb-8 ${sidebarCollapsed ? 'md:pr-20' : 'md:pr-72'}`}><Outlet /></main></div>
}
