import { Routes, Route, NavLink } from 'react-router-dom'
import Chat from './pages/Chat.jsx'
import Flow from './pages/Flow.jsx'
import Presentation from './pages/Presentation.jsx'
import Admin from './pages/Admin.jsx'

function Shell({ children }) {
  const link = ({isActive}) =>
    isActive ? 'text-brand-600 font-medium' : 'text-ink-500 hover:text-ink-900'
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-ink-300/60 px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink-900">
          Supply Chain Risk Intelligence Assistant
        </h1>
        <nav className="flex gap-4 text-sm">
          <NavLink to="/" end className={link}>Chat</NavLink>
          <NavLink to="/flow" className={link}>Flow</NavLink>
          <NavLink to="/admin" className={link}>Admin</NavLink>
          <NavLink to="/present" className={link}>Present</NavLink>
        </nav>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
      <footer className="text-xs text-ink-500 py-2 text-center border-t border-ink-300/60 bg-white">
        AI Powered
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Shell><Chat /></Shell>} />
      <Route path="/flow" element={<Shell><Flow /></Shell>} />
      <Route path="/admin" element={<Shell><Admin /></Shell>} />
      {/* Presentation uses its own fullscreen layout */}
      <Route path="/present" element={<Presentation />} />
    </Routes>
  )
}
