import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './app/layout/AppShell'
import RequireAuth from './app/RequireAuth'
import RequireAdmin from './app/RequireAdmin'
import LoginPage from './features/auth/LoginPage'

const DashboardPage  = lazy(() => import('./features/dashboard/DashboardPage'))
const ProductsPage   = lazy(() => import('./features/products/ProductsPage'))
const SalesPage      = lazy(() => import('./features/sales/SalesPage'))
const CustomersPage  = lazy(() => import('./features/customers/CustomersPage'))
const SuppliersPage  = lazy(() => import('./features/suppliers/SuppliersPage'))
const PurchasesPage  = lazy(() => import('./features/purchases/PurchasesPage'))
const ReportsPage    = lazy(() => import('./features/reports/ReportsPage'))
const SettingsPage   = lazy(() => import('./features/settings/SettingsPage'))
const UsersPage      = lazy(() => import('./features/auth/UsersPage'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* All app routes require a valid session */}
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/sales" replace />} />

            {/* Routes accessible to all authenticated users */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/sales"     element={<SalesPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/reports"   element={<ReportsPage />} />

            {/* Admin-only routes — employees are redirected to /dashboard */}
            <Route element={<RequireAdmin />}>
              <Route path="/products"  element={<ProductsPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/purchases" element={<PurchasesPage />} />
              <Route path="/settings"  element={<SettingsPage />} />
              <Route path="/users"     element={<UsersPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
