import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateLayout from './components/PrivateLayout'
import PublicRoute from './components/PublicRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProductsPage from './pages/ProductsPage'
import AddProductPage from './pages/AddProductPage'
import EditProductPage from './pages/EditProductPage'
import CategoriesPage from './pages/CategoriesPage'

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route element={<PrivateLayout />}>
            <Route path="/" element={<ProductsPage />} />
            <Route path="/add" element={<AddProductPage />} />
            <Route path="/edit/:id" element={<EditProductPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}
