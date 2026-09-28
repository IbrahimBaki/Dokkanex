import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import logoMark from '/files/logo-mark.svg'

function translateError(error, t) {
  if (!error) return ''
  const msg = error.message?.toLowerCase() ?? ''
  if (msg.includes('user already registered'))        return t('auth.register.errors.alreadyRegistered')
  if (msg.includes('invalid email'))                  return t('auth.register.errors.invalidEmail')
  if (msg.includes('password should be at least'))    return t('auth.register.errors.passwordLength')
  if (msg.includes('too many requests'))              return t('auth.register.errors.tooManyRequests')
  return t('auth.register.errors.generic')
}

export default function RegisterPage() {
  const { t, i18n } = useTranslation()
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleLang() {
    i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError(t('auth.register.errors.passwordMismatch'))
    if (password.length < 6)  return setError(t('auth.register.errors.passwordTooShort'))
    setLoading(true)
    const { error } = await signUp(email, password)
    setLoading(false)
    if (error) {
      setError(translateError(error, t))
    } else {
      navigate('/')
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#14103A] p-4">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/35 blur-3xl" /><div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-lime-400/15 blur-3xl" /><div className="relative z-10 w-full max-w-md">

        <div className="flex justify-end mb-2">
          <button
            onClick={toggleLang}
            className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white/85 transition hover:bg-white/20"
          >
            {t('nav.lang')}
          </button>
        </div>

        <div className="mb-7 text-center">
          <img src={logoMark} alt="DokkanX" className="mx-auto mb-4 h-20 w-20 rounded-3xl bg-white/10 p-2 shadow-2xl ring-1 ring-white/20" />
          <p className="text-sm font-bold tracking-wide text-lime-200">دكان إكس · DokkanX</p><h1 className="mt-2 text-2xl font-black text-white">ابدأ مساحة عمل متجرك</h1><p className="mt-2 text-sm text-indigo-100">أنشئ حسابك خلال دقيقة وابدأ العمل بثقة.</p>

        </div>

        <div className="rounded-3xl border border-white/70 bg-white/95 p-6 shadow-2xl shadow-slate-950/25 backdrop-blur sm:p-8">
          <h2 className="mb-6 text-center text-xl font-black text-slate-900">{t('auth.register.title')}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">{t('auth.register.email')}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="input-field"
                required
                disabled={loading}
                autoComplete="email"
                dir="ltr"
              />
            </div>

            <div>
              <label className="form-label">{t('auth.register.password')}</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
                required
                disabled={loading}
                autoComplete="new-password"
                dir="ltr"
              />
            </div>

            <div>
              <label className="form-label">{t('auth.register.confirmPassword')}</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="input-field"
                required
                disabled={loading}
                autoComplete="new-password"
                dir="ltr"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex w-full items-center justify-center gap-2 py-3"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {loading ? t('auth.register.submitting') : t('auth.register.submit')}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            {t('auth.register.hasAccount')}{' '}
            <Link to="/login" className="text-indigo-600 font-medium hover:underline">
              {t('auth.register.login')}
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}
