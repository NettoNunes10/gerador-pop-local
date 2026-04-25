import { RefreshCw } from 'lucide-react'

export function BusyBanner({ visible }) {
  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      top: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(10px)',
      border: '1px solid var(--accent-color)',
      padding: '10px 24px',
      borderRadius: '100px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      zIndex: 9999,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px rgba(0, 242, 255, 0.2)',
      animation: 'slideInTop 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)'
    }}>
      <RefreshCw className="spin" size={18} color="var(--accent-color)" />
      <span style={{
        fontSize: '0.8rem',
        fontWeight: 800,
        color: '#fff',
        letterSpacing: '1px',
        whiteSpace: 'nowrap'
      }}>
        MOTOR EM PROCESSAMENTO...
      </span>
    </div>
  )
}
