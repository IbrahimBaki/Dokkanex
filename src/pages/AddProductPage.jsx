import { useNavigate } from 'react-router-dom'
import ProductForm from '../components/ProductForm'

export default function AddProductPage() {
  const navigate = useNavigate()

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/products')}
          className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
        >
          <svg className="w-4 h-4 text-slate-600 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-slate-800">إضافة منتج جديد</h1>
      </div>

      <div className="card p-5">
        <ProductForm
          onSuccess={() => navigate('/products')}
          onCancel={() => navigate('/products')}
        />
      </div>
    </div>
  )
}
