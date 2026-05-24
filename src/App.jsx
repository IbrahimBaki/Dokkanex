import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProductsPage from './pages/ProductsPage'
import AddProductPage from './pages/AddProductPage'
import EditProductPage from './pages/EditProductPage'
import CategoriesPage from './pages/CategoriesPage'

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="pb-24">
          <Routes>
            <Route path="/" element={<ProductsPage />} />
            <Route path="/add" element={<AddProductPage />} />
            <Route path="/edit/:id" element={<EditProductPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
