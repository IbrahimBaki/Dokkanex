import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContext'
import { SyncProvider } from './context/SyncContext'
import PrivateLayout from './components/PrivateLayout'
import PublicRoute from './components/PublicRoute'
import OfflineNotice from './components/OfflineNotice'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import LandingPage from './pages/LandingPage'
import ProductsPage from './pages/ProductsPage'
import AddProductPage from './pages/AddProductPage'
import EditProductPage from './pages/EditProductPage'
import CategoriesPage from './pages/CategoriesPage'
import DashboardPage from './pages/DashboardPage'

function RootRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/products" replace />
  return <LandingPage />
}

export default function App() {
  return (
    <HashRouter>
      <OfflineNotice />
      <AuthProvider>
        <SyncProvider>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
            <Route element={<PrivateLayout />}>
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/add" element={<AddProductPage />} />
              <Route path="/edit/:id" element={<EditProductPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="*" element={<Navigate to="/products" replace />} />
            </Route>
          </Routes>
        </SyncProvider>
      </AuthProvider>
    </HashRouter>
  )
}
