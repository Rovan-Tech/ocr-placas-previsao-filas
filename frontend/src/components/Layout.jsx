import { NavLink, Outlet } from 'react-router-dom'

export default function Layout() {
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
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
