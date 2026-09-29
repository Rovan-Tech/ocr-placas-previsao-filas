import {
  BarChart3,
  Camera,
  ClipboardList,
  FileClock,
  Lock,
  NotebookPen,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { desktopNavItems, mobileNavItems } from '../services/navigation'
import { roleTone } from './RoleBadge'
import ThemeToggle from './ThemeToggle'

const MOBILE_NAV_QUERY = '(max-width: 640px)'

const NAV_ICONS: Record<string, LucideIcon> = {
  capture: Camera,
  checkins: ClipboardList,
  schedules: NotebookPen,
  logs: FileClock,
  reports: BarChart3,
  employees: Users,
  permissions: Settings,
}

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

  const permissions = employee?.permissions

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <strong>Porto Baía Verde</strong>
          <span>Check-in na guarita</span>
        </div>
        {!isMobileNav && (
          <nav className="app-nav">
            {desktopNavItems(permissions).map(({ id, to, end, label, enabled }) => {
              const Icon = NAV_ICONS[id] ?? Camera
              return enabled ? (
                <NavLink key={id} to={to} end={end}>
                  <Icon aria-hidden="true" size={20} />
                  {label}
                </NavLink>
              ) : (
                <span key={id} className="nav-locked" aria-disabled="true">
                  <Icon aria-hidden="true" size={20} />
                  {label}
                  <Lock aria-label="Sem acesso" className="nav-lock-icon" size={16} />
                </span>
              )
            })}
          </nav>
        )}
        <div className="session">
          {employee && (
            <span className={`role-chip role-chip-${roleTone(employee.role)}`}>
              <i aria-hidden="true" />
              {employee.role.name}
            </span>
          )}
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
            {mobileNavItems(permissions).map(({ id, to, end, shortLabel }) => {
              const Icon = NAV_ICONS[id] ?? Camera
              return (
                <li className="tab-bar-item" key={id}>
                  <NavLink to={to} end={end} className="tab-bar-link">
                    <Icon aria-hidden="true" />
                    <span>{shortLabel}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}
