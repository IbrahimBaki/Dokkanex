import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useSync } from '../context/SyncContext'
import logoNavbar from '/files/logo-navbar.svg'
import logoMark from '/files/logo-mark.svg'
import NavIcon from './NavIcon'

function MenuButton({ label, onClick, children, className = '' }) {
  return <button aria-label={label} title={label} onClick={onClick} className={`rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-700 ${className}`}>{children}</button>
}

export default function Navbar({ collapsed, onCollapsedChange }) {
  const { t, i18n } = useTranslation()
  const { user, signOut } = useAuth()
  const { syncing, pendingCount, lastSync, isOnline, handleSync } = useSync()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const items = [
    ['products', '/products', t('nav.products')],
    ['sales', '/sales', t('nav.sales')],
    ['inventory', '/inventory', t('nav.inventory')],
    ['analytics', '/dashboard', t('nav.analytics')],
    ['settings', '/settings', t('nav.settings')],
    ['categories', '/categories', t('nav.categories'), true],
  ]
  const syncTitle = lastSync ? t('nav.lastSync', { time: new Date(lastSync).toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-US') }) : t('nav.neverSynced')
  const logout = async () => { await signOut(); navigate('/login') }
  const toggleLang = () => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')
  const Sync = ({ compact = false }) => <button onClick={handleSync} disabled={syncing || !isOnline} title={syncTitle} className={`relative flex items-center justify-center rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 ${compact ? 'h-11 w-11' : 'w-full gap-2 px-3 py-2.5 text-sm font-bold'}`}><span className={syncing ? 'animate-spin' : ''}>↻</span>{!compact && <span>{syncing ? t('nav.syncing') : t('nav.sync')}</span>}{pendingCount > 0 && !syncing && <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">{pendingCount > 9 ? '9+' : pendingCount}</span>}</button>
  const Links = ({ compact = false, close }) => <nav className="space-y-1" aria-label="التنقل الرئيسي">{items.map(([key, to, label, secondary]) => <NavLink key={to} to={to} onClick={close} title={compact ? label : undefined} className={({ isActive }) => `flex items-center rounded-xl text-sm font-bold transition-all ${compact ? 'h-11 w-11 justify-center' : 'gap-3 px-3 py-3'} ${secondary && !isActive ? 'mt-4 border-t border-slate-100 pt-5 text-slate-500' : ''} ${isActive ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-700'}`}><NavIcon name={key} className="h-5 w-5 shrink-0" />{!compact && <span>{label}</span>}</NavLink>)}</nav>

  return <>
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-sm md:hidden"><MenuButton label={t('nav.openMenu')} onClick={() => setMenuOpen(true)}>☰</MenuButton><img src={logoNavbar} alt="DokkanX" className="h-8" /><div className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} /><Sync compact /><button onClick={toggleLang} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-600">{t('nav.lang')}</button></div></header>

    <aside className={`fixed bottom-0 right-0 top-0 z-40 hidden flex-col border-l border-slate-200 bg-white shadow-[0_0_24px_rgba(15,23,42,.05)] transition-[width] duration-300 md:flex ${collapsed ? 'w-20' : 'w-72'}`}>
      <div className={collapsed ? 'relative flex h-20 items-center justify-center border-b border-slate-100' : 'relative flex h-20 items-center justify-between border-b border-slate-100 px-5'}>{collapsed ? <img src={logoMark} alt="DokkanX" className="h-11 w-11" /> : <img src={logoNavbar} alt="DokkanX" className="h-9" />}<MenuButton label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')} onClick={() => onCollapsedChange(!collapsed)} className={collapsed ? 'absolute -left-3 top-6 border border-slate-200 bg-white shadow-sm' : ''}>{collapsed ? '‹' : '›'}</MenuButton></div>
      <div className={`flex-1 py-5 ${collapsed ? 'px-4' : 'px-3'}`}><Links compact={collapsed} /></div>
      <div className={`border-t border-slate-100 py-4 ${collapsed ? 'px-4' : 'px-3'}`}><div className={`mb-3 flex items-center ${collapsed ? 'justify-center' : 'gap-3 rounded-xl bg-slate-50 px-3 py-2.5'}`} title={user?.email}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{user?.email?.[0]?.toUpperCase() || 'D'}</span>{!collapsed && <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-700">{user?.email}</p><p className="mt-0.5 text-[11px] text-slate-500">{isOnline ? t('nav.online') : t('nav.offline')}</p></div>}</div><div className={`flex ${collapsed ? 'flex-col items-center gap-2' : 'gap-2'}`}><Sync compact={collapsed} /><button onClick={toggleLang} title={t('nav.lang')} className={`${collapsed ? 'h-11 w-11' : 'flex-1'} rounded-xl border border-slate-200 px-2 py-2.5 text-xs font-bold text-slate-600`}>{t('nav.lang')}</button><button onClick={logout} title={t('nav.logout')} className={`${collapsed ? 'h-11 w-11 text-xl' : 'px-3'} rounded-xl bg-red-50 py-2.5 text-red-600 hover:bg-red-100`}>⇥</button></div></div>
    </aside>

    {menuOpen && <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true"><button aria-label={t('nav.closeMenu')} onClick={() => setMenuOpen(false)} className="absolute inset-0 w-full bg-slate-950/45" /><aside className="absolute right-0 top-0 z-10 flex h-full w-72 max-w-[86vw] flex-col bg-white p-4 shadow-2xl" dir="rtl"><div className="mb-6 flex items-center justify-between"><img src={logoNavbar} alt="DokkanX" className="h-9" /><MenuButton label={t('nav.closeMenu')} onClick={() => setMenuOpen(false)}>×</MenuButton></div><Links close={() => setMenuOpen(false)} /><div className="mt-auto border-t border-slate-100 pt-4"><p className="mb-3 truncate text-xs text-slate-500">{user?.email}</p><button onClick={logout} className="w-full rounded-xl bg-red-50 px-3 py-3 text-sm font-bold text-red-600">{t('nav.logout')}</button></div></aside></div>}
  </>
}
