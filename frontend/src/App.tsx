import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'
import CapturePage from './pages/CapturePage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import CheckinsPage from './pages/CheckinsPage'
import CreateEmployeePage from './pages/CreateEmployeePage'
import CreateSchedulePage from './pages/CreateSchedulePage'
import LoginPage from './pages/LoginPage'
import LogsPage from './pages/LogsPage'

export default function App() {
  const { employee, mustChangePassword } = useAuth()

  if (!employee) return <LoginPage />
  if (mustChangePassword) return <ChangePasswordPage />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CapturePage />} />
        <Route path="checkins" element={<CheckinsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="agendamentos" element={<CreateSchedulePage />} />
        {employee.is_admin && <Route path="funcionarios" element={<CreateEmployeePage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
