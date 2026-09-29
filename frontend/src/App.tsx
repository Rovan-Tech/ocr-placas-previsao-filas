import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'
import { homePathFor } from './services/navigation'
import { hasAccess, type Screen } from './services/roles'
import CapturePage from './pages/CapturePage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import CheckinsPage from './pages/CheckinsPage'
import CreateEmployeePage from './pages/CreateEmployeePage'
import CreateSchedulePage from './pages/CreateSchedulePage'
import DemoPage from './pages/DemoPage'
import LoginPage from './pages/LoginPage'
import LogsPage from './pages/LogsPage'
import PermissionsPage from './pages/PermissionsPage'
import ReportsPage from './pages/ReportsPage'

function RequireAuth() {
  const { employee, mustChangePassword } = useAuth()

  if (!employee) return <LoginPage />
  if (mustChangePassword) return <ChangePasswordPage />
  return <Outlet />
}

function RequireScreen({ screen }: { screen: Screen }) {
  const { employee } = useAuth()

  if (!hasAccess(employee?.permissions, screen)) {
    return <Navigate to={homePathFor(employee?.permissions)} replace />
  }
  return <Outlet />
}

function HomeRedirect() {
  const { employee } = useAuth()
  return <Navigate to={homePathFor(employee?.permissions)} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/demo" element={<DemoPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route element={<RequireScreen screen="capture" />}>
            <Route index element={<CapturePage />} />
          </Route>
          <Route element={<RequireScreen screen="checkins" />}>
            <Route path="checkins" element={<CheckinsPage />} />
          </Route>
          <Route element={<RequireScreen screen="logs" />}>
            <Route path="logs" element={<LogsPage />} />
          </Route>
          <Route element={<RequireScreen screen="schedules" />}>
            <Route path="agendamentos" element={<CreateSchedulePage />} />
          </Route>
          <Route element={<RequireScreen screen="reports" />}>
            <Route path="relatorios" element={<ReportsPage />} />
          </Route>
          <Route element={<RequireScreen screen="employees" />}>
            <Route path="funcionarios" element={<CreateEmployeePage />} />
            <Route path="permissoes" element={<PermissionsPage />} />
          </Route>
          <Route path="*" element={<HomeRedirect />} />
        </Route>
      </Route>
    </Routes>
  )
}
