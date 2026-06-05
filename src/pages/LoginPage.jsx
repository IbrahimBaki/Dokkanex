import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logoMark from '/files/logo-mark.svg'

function translateError(error) {
  if (!error) return ''
  const msg = error.message?.toLowerCase() ?? ''
  if (msg.includes('invalid login credentials')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
  if (msg.includes('email not confirmed')) return 'يرجى تأكيد البريد الإلكتروني أولاً'
  if (msg.includes('too many requests')) return 'محاولات كثيرة، يرجى الانتظار قليلاً'
  return 'حدث خطأ، يرجى المحاولة مرة أخرى'
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError(translateError(error))
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <img src={logoMark} alt="Dokanex" className="w-16 h-16 mx-auto mb-3 object-contain" />
          <h1 className="text-2xl font-bold text-slate-800">دكان <span className="text-amber-500">إكس</span></h1>
          <p className="text-slate-500 text-sm mt-1">نظام إدارة المتجر والمنتجات</p>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-5 text-center">تسجيل الدخول</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">البريد الإلكتروني</label>
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
              <label className="form-label">كلمة المرور</label>
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
              {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            ليس لديك حساب؟{' '}
            <Link to="/register" className="text-indigo-600 font-medium hover:underline">
              إنشاء حساب جديد
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}
