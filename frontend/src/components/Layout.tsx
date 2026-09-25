import { Camera, ClipboardList, FileClock, NotebookPen, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from './ThemeToggle'

const MOBILE_NAV_QUERY = '(max-width: 640px)'

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Capturar placa', shortLabel: 'Capturar', icon: Camera },
  { to: '/checkins', end: false, label: 'Check-ins recentes', shortLabel: 'Check-ins', icon: ClipboardList },
  { to: '/logs', end: false, label: 'Logs', shortLabel: 'Logs', icon: FileClock },
  { to: '/agendamentos', end: false, label: 'Agendamentos', shortLabel: 'Agenda', icon: NotebookPen },
]

function useIsMobileNav(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_NAV_QUERY).matches)

  useEffect(() => {
    const mediaQueryList = window.matchMedia(MOBILE_NAV_QUERY)
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    mediaQueryList.addEventListener('change', handleChange)
    return () => mediaQueryList.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}

export default function Layout() {
  const { employee, logout } = useAuth()
  const isMobileNav = useIsMobileNav()

  const items = employee?.is_admin
    ? [...NAV_ITEMS, { to: '/funcionarios', end: false, label: 'Funcionários', shortLabel: 'Equipe', icon: Users }]
    : NAV_ITEMS

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <strong>Porto Baía Verde</strong>
          <span>Check-in na guarita</span>
        </div>
        {!isMobileNav && (
          <nav className="app-nav">
            {items.map(({ to, end, label }) => (
              <NavLink key={to} to={to} end={end}>
                {label}
              </NavLink>
            ))}
          </nav>
        )}
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
      {isMobileNav && (
        <nav className="tab-bar" aria-label="Navegação principal">
          <ul className="tab-bar-list">
            {items.map(({ to, end, shortLabel, icon: Icon }) => (
              <li className="tab-bar-item" key={to}>
                <NavLink to={to} end={end} className="tab-bar-link">
                  <Icon aria-hidden="true" />
                  <span>{shortLabel}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
