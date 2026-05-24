import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ProductForm from '../components/ProductForm'

export default function EditProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchProduct()
  }, [id])

  async function fetchProduct() {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      setError('لم يتم العثور على المنتج')
    } else {
      setProduct(data)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="page-container">
        <div className="card p-8 text-center text-slate-500">
          <p className="font-semibold mb-2">{error || 'منتج غير موجود'}</p>
          <button onClick={() => navigate('/products')} className="btn-primary mt-4 px-6">
            العودة للمنتجات
          </button>
        </div>
      </div>
    )
  }

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
        <h1 className="text-xl font-bold text-slate-800">تعديل المنتج</h1>
      </div>

      <div className="card p-5">
        <ProductForm
          initialData={product}
          onSuccess={() => navigate('/products')}
          onCancel={() => navigate('/products')}
        />
      </div>
    </div>
  )
}
