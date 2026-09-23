import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import CapturePage from './pages/CapturePage'
import CheckinsPage from './pages/CheckinsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CapturePage />} />
        <Route path="checkins" element={<CheckinsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
