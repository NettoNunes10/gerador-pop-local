import { useState, useEffect, useRef } from 'react'
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip 
} from 'recharts'
import { Play, Pause, BarChart2, Music, Settings, BookOpen, Layout, Database, RefreshCw, X } from 'lucide-react'
import './index.css'

const COLORS = ['#00f2ff', '#bc13fe', '#00ffaa', '#ff2d55', '#ffaa00'];

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [systemStatus, setSystemStatus] = useState(null)
  const [editablePaths, setEditablePaths] = useState({})
  const [favoriteArtists, setFavoriteArtists] = useState([])
  const [paidRules, setPaidRules] = useState([])
  const [surpriseRules, setSurpriseRules] = useState([])
  const [dayTemplates, setDayTemplates] = useState({})
  const [availableTemplates, setAvailableTemplates] = useState([])
  const [library, setLibrary] = useState([])
  const [stats, setStats] = useState({ categories: [], top_artists: [] })
  const [logs, setLogs] = useState([])
  const [isBusy, setIsBusy] = useState(false)
  
  // Player State
  const [currentTrack, setCurrentTrack] = useState(null)
  const audioRef = useRef(null)

  const [selectedDate, setSelectedDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  })
  const [days, setDays] = useState(1)
  const logEndRef = useRef(null)

  const API_URL = 'http://localhost:8000'

  useEffect(() => {
    fetchStatus()
    fetchConfig()
    fetchLibrary()
    fetchStats()
    fetchTemplates()
    const interval = setInterval(() => {
      fetchLogs()
      fetchStatus()
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/status`)
      const data = await res.json()
      setSystemStatus(data)
      setIsBusy(data.is_busy)
    } catch (e) { }
  }

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/templates`)
      const data = await res.json()
      setAvailableTemplates(data)
    } catch (e) { }
  }

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/config`)
      const data = await res.json()
      setEditablePaths(data.paths)
      setFavoriteArtists(data.favorite_artists || [])
      setPaidRules(data.paid_rules || [])
      setDayTemplates(data.day_templates || {})
      setSurpriseRules(data.surprise_rules || [])
    } catch (e) { }
  }

  const fetchLibrary = async () => {
    try {
      const res = await fetch(`${API_URL}/library`)
      const data = await res.json()
      setLibrary(data)
    } catch (e) { }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/stats`)
      const data = await res.json()
      setStats(data)
    } catch (e) { }
  }

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/logs`)
      const data = await res.json()
      setLogs(data.logs)
    } catch (e) { }
  }

  const handleGenerate = async () => {
    setIsBusy(true)
    const backendDate = selectedDate.replace(/-/g, '')
    try {
      const res = await fetch(`${API_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: backendDate, days: parseInt(days) })
      })
      if (!res.ok) throw new Error("O sistema já está ocupado.")
    } catch (e) {
      alert(e.message)
      setIsBusy(false)
    }
  }

  const handleSaveConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          paths: editablePaths,
          favorite_artists: favoriteArtists,
          paid_rules: paidRules,
          day_templates: dayTemplates,
          surprise_rules: surpriseRules
        })
      })
      if (res.ok) {
        alert("Configurações salvas com sucesso!")
        fetchConfig()
      }
    } catch (e) {
      alert("Erro ao salvar: " + e.message)
    }
  }

  const playTrack = (track) => {
    setCurrentTrack(track)
    if (audioRef.current) {
      audioRef.current.src = `${API_URL}/stream/${track.id}`
      audioRef.current.play()
    }
  }

  const addArtist = () => {
    const artist = prompt("Nome do Artista:")
    if (artist && !favoriteArtists.includes(artist.toUpperCase())) {
      setFavoriteArtists([...favoriteArtists, artist.toUpperCase()])
    }
  }

  const removeArtist = (name) => {
    setFavoriteArtists(favoriteArtists.filter(a => a !== name))
  }

  const addPaidRule = () => {
    setPaidRules([...paidRules, { filename: '', start: '08:00', end: '18:00' }])
  }

  const updatePaidRule = (index, field, value) => {
    const next = [...paidRules]
    next[index][field] = value
    setPaidRules(next)
  }

  const removePaidRule = (index) => {
    setPaidRules(paidRules.filter((_, i) => i !== index))
  }

  const addSurpriseRule = () => {
    setSurpriseRules([...surpriseRules, { target: '', surprise: '', chance: 0.01 }])
  }

  const updateSurpriseRule = (index, field, value) => {
    const next = [...surpriseRules]
    next[index][field] = field === 'chance' ? parseFloat(value) : value
    setSurpriseRules(next)
  }

  const removeSurpriseRule = (index) => {
    setSurpriseRules(surpriseRules.filter((_, i) => i !== index))
  }

  const updateDayTemplate = (dayIndex, filename) => {
    setDayTemplates({...dayTemplates, [dayIndex]: filename})
  }

  const renderDashboard = () => (
    <div className="dashboard-layout">
      <div className="sidebar">
        <section className="card glass">
          <h2 className="card-title"><Layout size={20}/> Gerador de Emissão</h2>
          <div className="input-group">
            <label>Calendário</label>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)} 
              onClick={(e) => e.target.showPicker?.()}
            />
          </div>
          <div className="input-group">
            <label>Quantidade de Dias</label>
            <input type="number" value={days} onChange={e => setDays(e.target.value)} min="1" />
          </div>
          <button className={`primary ${isBusy ? "pulse" : ""}`} onClick={handleGenerate} disabled={isBusy}>
            {isBusy ? "PROCESSANDO..." : "GERAR ROTEIROS"}
          </button>
        </section>

        <section className="card glass">
          <h2 className="card-title"><Database size={20}/> Motor v3.0</h2>
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem'}}>
            <span style={{fontSize: '0.8rem', opacity: 0.7}}>SERVIDOR</span>
            <span className={`badge ${systemStatus?.status === 'online' ? 'badge-online' : 'badge-error'}`}>
              {systemStatus?.status || 'OFFLINE'}
            </span>
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between'}}>
            <span style={{fontSize: '0.8rem', opacity: 0.7}}>DB SQLITE</span>
            <span className={`badge ${systemStatus?.database === 'Connected' ? 'badge-online' : 'badge-error'}`}>
              {systemStatus?.database || '---'}
            </span>
          </div>
        </section>
      </div>

      <section className="glass" style={{padding: '0'}}>
        <div className="log-container">
          <div style={{color: 'var(--accent-color)', fontWeight: 800, marginBottom: '1rem'}}>CONSOLE_SYSTEM_OUTPUT_v3.0</div>
          {logs.map((log, i) => (
            <div key={i} className="log-entry">
              <span style={{opacity: 0.4}}>{">"}</span> {log}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </section>
    </div>
  )

  const renderStats = () => (
    <div className="dashboard-layout" style={{gridTemplateColumns: '1fr'}}>
      <div className="charts-grid">
        <div className="card glass chart-card">
          <h2 className="card-title"><BarChart2 size={20}/> Equilíbrio de Categorias</h2>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.categories}
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {stats.categories.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card glass chart-card">
          <h2 className="card-title"><Music size={20}/> Top 5 Artistas na Base</h2>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.top_artists} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" stroke="#a0a0c0" fontSize={12} width={120} />
              <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} />
              <Bar dataKey="value" fill="var(--accent-color)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )

  const renderLibrary = () => (
    <div className="glass card">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
        <h2 className="card-title" style={{margin: 0}}><Database size={20}/> Biblioteca Musical ({library.length} faixas)</h2>
        <button onClick={fetchLibrary} className="secondary-btn" style={{padding: '0.5rem 1rem'}}><RefreshCw size={16}/></button>
      </div>
      <div style={{overflowY: 'auto', maxHeight: '600px'}}>
        <table className="lib-table">
          <thead>
            <tr style={{background: 'none'}}>
              <th style={{textAlign: 'left', padding: '1rem'}}>PLAY</th>
              <th style={{textAlign: 'left', padding: '1rem'}}>ARTISTA</th>
              <th style={{textAlign: 'left', padding: '1rem'}}>MÚSICA</th>
              <th style={{textAlign: 'left', padding: '1rem'}}>CATEGORIA</th>
              <th style={{textAlign: 'left', padding: '1rem'}}>BPM</th>
            </tr>
          </thead>
          <tbody>
            {library.map((track) => (
              <tr key={track.id}>
                <td>
                  <button className="play-btn" onClick={() => playTrack(track)}>
                    <Play size={14} fill="currentColor"/>
                  </button>
                </td>
                <td style={{fontWeight: 700}}>{track.artista}</td>
                <td>{track.nome}</td>
                <td><span className="badge" style={{background: 'rgba(255,255,255,0.05)'}}>{track.categoria}</span></td>
                <td style={{color: track.bpm > 120 ? 'var(--error)' : track.bpm < 80 ? 'var(--accent-color)' : 'var(--success)'}}>
                  {Math.round(track.bpm)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderSettings = () => (
    <div className="config-section glass card">
      <h2 className="card-title"><Settings size={20}/> Configurações Avançadas</h2>
      
      <section style={{marginBottom: '3rem'}}>
        <h3>📅 Modelos por Dia da Semana (.blm)</h3>
        <div className="config-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem'}}>
          {['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map((day, i) => (
            <div key={day} className="input-group">
              <label>{day}</label>
              <select value={dayTemplates[i] || ''} onChange={e => updateDayTemplate(i, e.target.value)}>
                <option value="">Selecione um arquivo...</option>
                {availableTemplates.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section style={{marginBottom: '3rem'}}>
        <h3>🎲 Regras de Surpresa (Wildcards)</h3>
        <table className="config-table">
          <thead>
            <tr>
              <th>Pasta Alvo</th>
              <th>Pasta Surpresa</th>
              <th>Chance (0.01 = 1%)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {surpriseRules.map((rule, i) => (
              <tr key={i}>
                <td><input type="text" placeholder="Ex: SERTANEJO B" value={rule.target} onChange={e => updateSurpriseRule(i, 'target', e.target.value)} /></td>
                <td><input type="text" placeholder="Ex: SERTANEJO C" value={rule.surprise} onChange={e => updateSurpriseRule(i, 'surprise', e.target.value)} /></td>
                <td><input type="number" step="0.01" min="0" max="1" value={rule.chance} onChange={e => updateSurpriseRule(i, 'chance', e.target.value)} /></td>
                <td><button className="remove-row-btn" onClick={() => removeSurpriseRule(i)}><X size={12}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="add-row-btn" onClick={addSurpriseRule}>+ Nova Regra de Surpresa</button>
      </section>

      <section style={{marginBottom: '3rem'}}>
        <h3>🌟 Artistas Favoritos</h3>
        <div className="tag-list">
          {favoriteArtists.map(artist => (
            <div key={artist} className="tag">
              {artist}
              <button onClick={() => removeArtist(artist)}><X size={12}/></button>
            </div>
          ))}
        </div>
        <button className="secondary-btn" onClick={addArtist} style={{marginTop: '1rem'}}>+ Adicionar Artista</button>
      </section>

      <section style={{marginBottom: '3rem'}}>
        <h3>💰 Regras Pagas</h3>
        <table className="config-table">
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Início</th>
              <th>Fim</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paidRules.map((rule, i) => (
              <tr key={i}>
                <td><input type="text" value={rule.filename} onChange={e => updatePaidRule(i, 'filename', e.target.value)} /></td>
                <td><input type="time" value={rule.start} onChange={e => updatePaidRule(i, 'start', e.target.value)} onClick={(e) => e.target.showPicker?.()} /></td>
                <td><input type="time" value={rule.end} onChange={e => updatePaidRule(i, 'end', e.target.value)} onClick={(e) => e.target.showPicker?.()} /></td>
                <td><button className="remove-row-btn" onClick={() => removePaidRule(i)}><X size={12}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="add-row-btn" onClick={addPaidRule}>+ Nova Regra</button>
      </section>

      <section>
        <h3>📂 Caminhos</h3>
        <div className="config-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem'}}>
          {Object.entries(editablePaths).map(([key, value]) => (
            <div key={key} className="input-group">
              <label>{key}</label>
              <input type="text" value={value} onChange={e => setEditablePaths({...editablePaths, [key]: e.target.value})} />
            </div>
          ))}
        </div>
      </section>

      <button className="primary" onClick={handleSaveConfig} style={{marginTop: '2rem'}}>SALVAR TUDO</button>
    </div>
  )

  const renderGuide = () => (
    <div className="guide-content glass card">
      <h2 className="card-title"><BookOpen size={20}/> Manual Técnico v3.1</h2>
      <div style={{padding: '1rem'}}>
        <h3>1. Lógica de Scoring</h3>
        <p>O score prioriza músicas com maior tempo de descanso e artistas favoritos.</p>
        <div className="code-block">Score = Descanso * Peso * Mult_Artista * Dayparting</div>
        
        <h3 style={{marginTop: '2rem'}}>2. Wildcards (Surpresas)</h3>
        <p>Permite que uma categoria substitua outra aleatoriamente (ex: B vira C). A música substituta também respeita o Scoring.</p>
        
        <h3 style={{marginTop: '2rem'}}>3. BPM e Energia</h3>
        <p>O motor evita a sucessão de músicas lentas (&lt; 80 BPM) para manter a energia da rádio.</p>
      </div>
    </div>
  )

  return (
    <div className="app-container">
      <header style={{textAlign: 'center', marginBottom: '2rem'}}>
        <h1>GERADOR POP FM</h1>
        <p className="subtitle">OS_SYSTEM_AUTOMATION_v3.1</p>
      </header>

      <nav className="nav-tabs">
        <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><Layout size={18}/> PAINEL</button>
        <button className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}><BarChart2 size={18}/> RELATÓRIOS</button>
        <button className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}><Music size={18}/> BIBLIOTECA</button>
        <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><Settings size={18}/> CONFIG</button>
        <button className={`tab-btn ${activeTab === 'guide' ? 'active' : ''}`} onClick={() => setActiveTab('guide')}><BookOpen size={18}/> GUIA</button>
      </nav>

      <main>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'stats' && renderStats()}
        {activeTab === 'library' && renderLibrary()}
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'guide' && renderGuide()}
      </main>

      {currentTrack && (
        <div className="floating-player glass">
          <div className="player-info">
            <div className="player-title">{currentTrack.nome}</div>
            <div className="player-artist">{currentTrack.artista}</div>
          </div>
          <audio ref={audioRef} controls autoPlay />
          <button className="play-btn" style={{background: 'var(--error)'}} onClick={() => setCurrentTrack(null)}><X size={16}/></button>
        </div>
      )}
    </div>
  )
}

export default App
