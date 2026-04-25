import { BarChart2, BookOpen, ClipboardList, Layout, Music, Settings } from 'lucide-react'

const TABS = [
  { id: 'dashboard', label: 'PAINEL', Icon: Layout },
  { id: 'stats', label: 'RELATÓRIOS', Icon: BarChart2 },
  { id: 'library', label: 'BIBLIOTECA', Icon: Music },
  { id: 'blm_manager', label: 'MODELOS BLM', Icon: ClipboardList },
  { id: 'settings', label: 'CONFIG', Icon: Settings },
  { id: 'guide', label: 'GUIA', Icon: BookOpen },
]

export function TabNav({ activeTab, onChange }) {
  return (
    <nav className="nav-tabs">
      {TABS.map(({ id, label, Icon }) => {
        const TabIcon = Icon
        return (
          <button
            key={id}
            className={`tab-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => onChange(id)}
          >
            <TabIcon size={18} /> {label}
          </button>
        )
      })}
    </nav>
  )
}
