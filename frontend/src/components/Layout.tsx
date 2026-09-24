import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from './ThemeToggle'

export default function Layout() {
  const { employee, logout } = useAuth()

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <strong>Porto Baía Verde</strong>
          <span>Check-in na guarita</span>
        </div>
        <nav className="app-nav">
          <NavLink to="/" end>Capturar placa</NavLink>
          <NavLink to="/checkins">Check-ins recentes</NavLink>
          <NavLink to="/logs">Logs</NavLink>
          {employee?.is_admin && <NavLink to="/funcionarios">Funcionários</NavLink>}
        </nav>
        <div className="session">
          <ThemeToggle />
          <span>{employee?.full_name}</span>
          <button type="button" onClick={logout}>
            Sair
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
