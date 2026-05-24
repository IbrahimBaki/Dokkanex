import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logoMark from '/icons/logo-mark.png'

function translateError(error) {
  if (!error) return ''
  const msg = error.message?.toLowerCase() ?? ''
  if (msg.includes('user already registered')) return 'هذا البريد الإلكتروني مسجل مسبقاً'
  if (msg.includes('invalid email')) return 'البريد الإلكتروني غير صحيح'
  if (msg.includes('password should be at least')) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
  if (msg.includes('too many requests')) return 'محاولات كثيرة، يرجى الانتظار قليلاً'
  return 'حدث خطأ، يرجى المحاولة مرة أخرى'
}

export default function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError('كلمة المرور وتأكيدها غير متطابقتين')
    if (password.length < 6) return setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
    setLoading(true)
    const { error } = await signUp(email, password)
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
          <h1 className="text-2xl font-bold text-slate-800">دكانيكس</h1>
          <p className="text-slate-500 text-sm mt-1">نظام إدارة المتجر والمنتجات</p>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-5 text-center">إنشاء حساب جديد</h2>

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
                autoComplete="new-password"
                dir="ltr"
              />
            </div>

            <div>
              <label className="form-label">تأكيد كلمة المرور</label>
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
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {loading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            لديك حساب بالفعل؟{' '}
            <Link to="/login" className="text-indigo-600 font-medium hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </div>

      </div>
    </div>
  )
}
