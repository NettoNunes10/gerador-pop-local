import { useState, useEffect, useRef } from 'react'
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip 
} from 'recharts'
import { Play, Pause, BarChart2, Music, Settings, BookOpen, Layout, Database, RefreshCw, X, Search } from 'lucide-react'
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
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [bpmEnergy, setBpmEnergy] = useState('')
  
  // Player State
  const [currentTrack, setCurrentTrack] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [isPlayerLoading, setIsPlayerLoading] = useState(false)
  const audioRef = useRef(null)

  const [selectedDate, setSelectedDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  })
  const [days, setDays] = useState(1)
  const logEndRef = useRef(null)

  const API_URL = `http://${window.location.hostname}:8000`

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
      setEditablePaths(data.paths || {})
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

  const handleSync = async () => {
    setIsBusy(true)
    try {
      const res = await fetch(`${API_URL}/sync`, { method: 'POST' })
      if (!res.ok) throw new Error("Sistema já está processando.")
      alert("Sincronização iniciada! Acompanhe o progresso no Painel.")
    } catch (e) {
      alert(e.message)
      setIsBusy(false)
    }
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
    setIsBusy(true)
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
        alert("✅ Configurações salvas com sucesso!")
        await fetchConfig()
      }
    } catch (e) {
      alert("❌ Erro ao salvar: " + e.message)
    } finally {
      setIsBusy(false)
    }
  }

  const playTrack = async (track) => {
    setCurrentTrack(track)
    setIsPlayerLoading(true)
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    
    try {
      const res = await fetch(`${API_URL}/stream/${track.id}`)
      if (!res.ok) throw new Error("Falha no acesso ao arquivo de rede")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      if (audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play()
      }
    } catch (e) {
      console.error("Erro no player:", e)
      alert("Erro ao carregar áudio. Verifique se a rede está acessível.")
    } finally {
      setIsPlayerLoading(false)
    }
  }

  const handleUpdateMetadata = async (trackId, field, value) => {
    try {
      await fetch(`${API_URL}/library/${trackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: field === 'weight' ? parseFloat(value) : value })
      })
      setLibrary(library.map(t => t.id === trackId ? {...t, [field === 'weight' ? 'peso' : 'sub_categoria']: value} : t))
    } catch (e) { console.error(e) }
  }

  // Filter Logic
  const filteredLibrary = library.filter(track => {
    const matchesSearch = (track.artista || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (track.nome || "").toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = filterCategory === '' || track.categoria === filterCategory
    
    let matchesBpm = true
    if (bpmEnergy === 'L') matchesBpm = track.bpm < 80
    if (bpmEnergy === 'M') matchesBpm = track.bpm >= 80 && track.bpm <= 120
    if (bpmEnergy === 'H') matchesBpm = track.bpm > 120
    
    return matchesSearch && matchesCategory && matchesBpm
  })

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
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap'}}>
        <h2 className="card-title" style={{margin: 0}}><Database size={20}/> Biblioteca ({filteredLibrary.length})</h2>
        
        <div style={{display: 'flex', gap: '1rem', flex: 1, minWidth: '400px'}}>
          <div style={{position: 'relative', flex: 1}}>
            <Search size={16} style={{position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5}}/>
            <input 
              type="text" 
              placeholder="Buscar..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{padding: '0.6rem 1rem 0.6rem 2.5rem', fontSize: '0.85rem', width: '100%'}}
            />
          </div>
          <select 
            value={filterCategory} 
            onChange={e => setFilterCategory(e.target.value)}
            style={{padding: '0.6rem', width: '150px', fontSize: '0.85rem'}}
          >
            <option value="">Todas Pastas</option>
            {[...new Set(library.map(t => t.categoria))].map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select 
            value={bpmEnergy} 
            onChange={e => setBpmEnergy(e.target.value)}
            style={{padding: '0.6rem', width: '130px', fontSize: '0.85rem'}}
          >
            <option value="">Energia (BPM)</option>
            <option value="L">Baixa (L)</option>
            <option value="M">Média (M)</option>
            <option value="H">Alta (H)</option>
          </select>
        </div>

        <div style={{display: 'flex', gap: '1rem'}}>
          <button 
            onClick={handleSync} 
            className={`primary ${isBusy ? 'pulse' : ''}`} 
            style={{padding: '0.6rem 1.2rem', fontSize: '0.85rem', width: 'auto'}}
            disabled={isBusy}
          >
            {isBusy ? '...' : 'SINCRONIZAR'}
          </button>
          <button onClick={fetchLibrary} className="secondary-btn" style={{padding: '0.6rem 1rem'}}><RefreshCw size={16}/></button>
        </div>
      </div>

      <div style={{overflowY: 'auto', overflowX: 'hidden', maxHeight: '600px'}}>
        <table className="lib-table" style={{tableLayout: 'fixed'}}>
          <thead>
            <tr style={{background: 'none'}}>
              <th style={{width: '60px', textAlign: 'left', padding: '1rem'}}>PLAY</th>
              <th style={{width: '180px', textAlign: 'left', padding: '1rem'}}>ARTISTA</th>
              <th style={{textAlign: 'left', padding: '1rem'}}>MÚSICA</th>
              <th style={{width: '120px', textAlign: 'left', padding: '1rem'}}>PASTA</th>
              <th style={{width: '120px', textAlign: 'left', padding: '1rem'}}>SUB (TAG)</th>
              <th style={{width: '80px', textAlign: 'left', padding: '1rem'}}>BPM</th>
              <th style={{width: '80px', textAlign: 'left', padding: '1rem'}}>PESO</th>
            </tr>
          </thead>
          <tbody>
            {filteredLibrary.map((track) => (
              <tr key={track.id}>
                <td>
                  <button className="play-btn" onClick={() => playTrack(track)} disabled={isPlayerLoading}>
                    {isPlayerLoading && currentTrack?.id === track.id ? <RefreshCw size={14} className="pulse"/> : <Play size={14} fill="currentColor"/>}
                  </button>
                </td>
                <td style={{fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}} title={track.artista}>{track.artista}</td>
                <td style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}} title={track.nome}>{track.nome}</td>
                <td style={{fontSize: '0.75rem', opacity: 0.7}}>{track.categoria}</td>
                <td>
                  <input 
                    type="text" 
                    placeholder="Ex: TOP"
                    defaultValue={track.sub_categoria || ''} 
                    onBlur={e => handleUpdateMetadata(track.id, 'sub_categoria', e.target.value.toUpperCase())}
                    style={{padding: '0.3rem', width: '90px', fontSize: '0.75rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)'}}
                  />
                </td>
                <td style={{color: track.bpm > 120 ? 'var(--error)' : track.bpm < 80 ? 'var(--accent-color)' : 'var(--success)'}}>
                  {Math.round(track.bpm)}
                </td>
                <td>
                  <input 
                    type="number" 
                    step="0.1" 
                    defaultValue={track.peso || 1.0} 
                    onBlur={e => handleUpdateMetadata(track.id, 'weight', e.target.value)}
                    style={{padding: '0.3rem', width: '50px', fontSize: '0.75rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)'}}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredLibrary.length === 0 && (
          <div style={{textAlign: 'center', padding: '3rem', opacity: 0.5}}>
            Nenhuma música encontrada com os filtros atuais.
          </div>
        )}
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
                <td><input type="text" placeholder="Ex: SERTANEJO TOP" value={rule.target} onChange={e => updateSurpriseRule(i, 'target', e.target.value)} /></td>
                <td><input type="text" placeholder="Ex: SERTANEJO OLD" value={rule.surprise} onChange={e => updateSurpriseRule(i, 'surprise', e.target.value)} /></td>
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

      <button className="primary" onClick={handleSaveConfig} style={{marginTop: '2rem'}} disabled={isBusy}>
        {isBusy ? "SALVANDO..." : "SALVAR TUDO"}
      </button>
    </div>
  )

  const renderGuide = () => (
    <div className="guide-content glass card">
      <h2 className="card-title"><BookOpen size={20}/> Manual Técnico v3.4</h2>
      <div style={{padding: '1rem'}}>
        <h3>1. Subcategorias (Tags)</h3>
        <p>Use para segmentar pastas grandes. Ex: pasta <strong>SERTANEJO</strong> com tag <strong>TOP</strong>.</p>
        <p>No seu arquivo .blm, chame como: <code>SERTANEJO TOP.apm</code></p>
        
        <h3 style={{marginTop: '2rem'}}>2. Lógica de Scoring</h3>
        <p>Score = Descanso * Peso * Mult_Artista * Dayparting</p>
      </div>
    </div>
  )

  return (
    <div className="app-container">
      <header style={{textAlign: 'center', marginBottom: '2rem'}}>
        <h1>GERADOR POP FM</h1>
        <p className="subtitle">OS_SYSTEM_AUTOMATION_v3.4.0</p>
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
          <audio ref={audioRef} controls autoPlay style={{filter: 'invert(1)'}} />
          <button className="play-btn" style={{background: 'var(--error)'}} onClick={() => setCurrentTrack(null)}><X size={16}/></button>
        </div>
      )}
    </div>
  )
}

export default App
