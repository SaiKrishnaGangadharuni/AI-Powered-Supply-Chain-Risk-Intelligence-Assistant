import { Routes, Route, NavLink } from 'react-router-dom'
import { ChatProvider } from './context/ChatContext.jsx'
import Chat from './pages/Chat.jsx'
import Flow from './pages/Flow.jsx'
import Presentation from './pages/Presentation.jsx'
import Admin from './pages/Admin.jsx'
import Analytics from './pages/Analytics.jsx'

function Shell({ children }) {
  const link = ({ isActive }) =>
    isActive
      ? 'px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm font-medium'
      : 'px-3 py-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 text-sm'
  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 bg-clip-text text-transparent leading-tight">
              Supply Chain Risk Intelligence Assistant
            </h1>
            <p className="text-xs text-gray-400 font-medium tracking-wide mt-0.5">#AI-Powered</p>
          </div>
          <nav className="flex gap-1 mt-1">
            <NavLink to="/"          end className={link}>Chat</NavLink>
            <NavLink to="/flow"          className={link}>Flow</NavLink>
            <NavLink to="/analytics"     className={link}>Analytics</NavLink>
            <NavLink to="/admin"         className={link}>Admin</NavLink>
            <NavLink to="/present"       className={link}>Present</NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
      <footer className="text-xs text-gray-400 py-2 text-center border-t border-gray-200 bg-white">
        AI Powered
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <ChatProvider>
      <Routes>
        <Route path="/"          element={<Shell><Chat /></Shell>} />
        <Route path="/flow"      element={<Shell><Flow /></Shell>} />
        <Route path="/analytics" element={<Shell><Analytics /></Shell>} />
        <Route path="/admin"     element={<Shell><Admin /></Shell>} />
        <Route path="/present"   element={<Presentation />} />
      </Routes>
    </ChatProvider>
  )
}
