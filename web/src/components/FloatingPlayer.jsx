import { X } from 'lucide-react'

export function FloatingPlayer({ currentTrack, audioRef, onClose }) {
  if (!currentTrack) return null

  return (
    <div className="floating-player glass">
      <div className="player-info">
        <div className="player-title">{currentTrack.nome}</div>
        <div className="player-artist">{currentTrack.artista}</div>
      </div>
      <audio ref={audioRef} controls autoPlay style={{ filter: 'invert(1)' }} />
      <button className="play-btn" style={{ background: 'var(--error)' }} onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  )
}
