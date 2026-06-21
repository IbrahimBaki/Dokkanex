import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import logoMark from '/files/logo-mark.svg'

function translateError(error, t) {
  if (!error) return ''
  const msg = error.message?.toLowerCase() ?? ''
  if (msg.includes('invalid login credentials')) return t('auth.login.errors.invalidCredentials')
  if (msg.includes('email not confirmed'))       return t('auth.login.errors.emailNotConfirmed')
  if (msg.includes('too many requests'))         return t('auth.login.errors.tooManyRequests')
  return t('auth.login.errors.generic')
}

export default function LoginPage() {
  const { t, i18n } = useTranslation()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleLang() {
    i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError(translateError(error, t))
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="flex justify-end mb-2">
          <button
            onClick={toggleLang}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-200 hover:text-indigo-600 transition-colors border border-slate-200 bg-white"
          >
            {t('nav.lang')}
          </button>
        </div>

        <div className="text-center mb-8">
          <img src={logoMark} alt="DokkanX" className="w-16 h-16 mx-auto mb-3 object-contain" />
          <h1 className="text-2xl font-bold text-slate-800">دكان <span className="text-amber-500">إكس</span></h1>
          <p className="text-slate-500 text-sm mt-1">{t('auth.brandSub')}</p>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-5 text-center">{t('auth.login.title')}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">{t('auth.login.email')}</label>
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
              <label className="form-label">{t('auth.login.password')}</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
                required
                disabled={loading}
                autoComplete="current-password"
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
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {loading ? t('auth.login.submitting') : t('auth.login.submit')}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            {t('auth.login.noAccount')}{' '}
            <Link to="/register" className="text-indigo-600 font-medium hover:underline">
              {t('auth.login.createAccount')}
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}
