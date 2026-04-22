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
  const [libTotal, setLibTotal] = useState(0)
  const [libPage, setLibPage] = useState(1)
  const [libPages, setLibPages] = useState(1)
  const [libLoading, setLibLoading] = useState(false)
  const LIB_LIMIT = 100
  const [stats, setStats] = useState({ categories: [], top_artists: [] })
  const [logs, setLogs] = useState([])
  const [isBusy, setIsBusy] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [rotationGroups, setRotationGroups] = useState([
    { name: 'TOP', min_weight: 3.0, base_weight: 3.0 },
    { name: 'HIT', min_weight: 2.0, base_weight: 2.0 },
    { name: 'STD', min_weight: 1.0, base_weight: 1.0 },
    { name: 'OLD', min_weight: 0.0, base_weight: 0.5 },
  ])
  const [selectedTracks, setSelectedTracks] = useState(new Set())
  const [filterGroup, setFilterGroup] = useState('')
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [bpm, setBpm] = useState('')
  const [sortBy, setSortBy] = useState('artista')
  
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
  const logContainerRef = useRef(null)

  const API_URL = `http://${window.location.hostname}:8000`

  // Helper: fetch com timeout de 3s para nunca bloquear
  const safeFetch = async (url, options = {}) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)
      return res
    } catch (e) {
      clearTimeout(timeout)
      throw e
    }
  }

  useEffect(() => {
    fetchStatus()
    fetchConfig()
    fetchLibrary({ page: 1 })
    fetchStats()
    fetchTemplates()

    // Polling inteligente: só agenda novo poll APÓS o anterior terminar
    let cancelled = false
    let failureCount = 0
    const poll = async () => {
      if (cancelled) return
      try {
        const res = await safeFetch(`${API_URL}/logs`)
        const data = await res.json()
        setLogs(data.logs)
        
        const res2 = await safeFetch(`${API_URL}/status`)
        const data2 = await res2.json()
        setSystemStatus(data2)
        setIsBusy(data2.is_busy)
        
        setIsOffline(false)
        failureCount = 0
      } catch (e) { 
        failureCount++
        if (failureCount >= 2) setIsOffline(true)
      }
      if (!cancelled) setTimeout(poll, 4000) // Aumentado para 4s
    }
    setTimeout(poll, 4000)
    return () => { cancelled = true }
  }, [])

  // Debounce: busca no backend 400ms após parar de digitar
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLibrary({ page: 1, search: searchTerm })
    }, 400)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Filtros imediatos (dropdowns)
  useEffect(() => {
    fetchLibrary({ page: 1 })
  }, [filterCategory, filterGroup, bpm, sortBy])

  useEffect(() => {
    const el = logContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  const fetchStatus = async () => {
    try {
      const res = await safeFetch(`${API_URL}/status`)
      const data = await res.json()
      setSystemStatus(data)
      setIsBusy(data.is_busy)
    } catch (e) { }
  }

  const fetchTemplates = async () => {
    try {
      const res = await safeFetch(`${API_URL}/templates`)
      const data = await res.json()
      setAvailableTemplates(data)
    } catch (e) { }
  }

  const fetchConfig = async () => {
    try {
      const res = await safeFetch(`${API_URL}/config`)
      const data = await res.json()
      setEditablePaths(data.paths || {})
      setFavoriteArtists(data.favorite_artists || [])
      setPaidRules(data.paid_rules || [])
      setDayTemplates(data.day_templates || {})
      setSurpriseRules(data.surprise_rules || [])
      if (data.rotation_groups) setRotationGroups(data.rotation_groups)
    } catch (e) { }
  }

  const fetchLibrary = async (opts = {}) => {
    setLibLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', opts.page ?? libPage)
      params.set('limit', LIB_LIMIT)
      if (opts.search  ?? searchTerm)  params.set('search',   opts.search  ?? searchTerm)
      if (opts.category ?? filterCategory) params.set('category', opts.category ?? filterCategory)
      if (opts.group    ?? filterGroup)    params.set('group',    opts.group    ?? filterGroup)
      if (opts.bpm      ?? bpm)            params.set('bpm',      opts.bpm      ?? bpm)
      if (opts.sort     ?? sortBy)         params.set('sort',     opts.sort     ?? sortBy)
      const res = await safeFetch(`${API_URL}/library?${params}`)
      const data = await res.json()
      setLibrary(data.items)
      setLibTotal(data.total)
      setLibPage(data.page)
      setLibPages(data.pages)
    } catch (e) { }
    finally { setLibLoading(false) }
  }

  const fetchStats = async () => {
    try {
      const res = await safeFetch(`${API_URL}/stats`)
      const data = await res.json()
      setStats(data)
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
          surprise_rules: surpriseRules,
          rotation_groups: rotationGroups
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

  // Lógica auxiliar de grupo baseada nos thresholds locais
  const getGroupForWeight = (weight) => {
    const sorted = [...rotationGroups].sort((a, b) => b.min_weight - a.min_weight)
    for (const g of sorted) { if (weight >= g.min_weight) return g.name }
    return rotationGroups[rotationGroups.length - 1]?.name || 'STD'
  }

  const getBaseWeightForGroup = (groupName) => {
    return rotationGroups.find(g => g.name === groupName)?.base_weight || 1.0
  }

  const GROUP_COLORS = { TOP: '#bc13fe', HIT: '#ffaa00', STD: '#00f2ff', OLD: '#666' }

  const playTrack = (track) => {
    setCurrentTrack(track)
    setIsPlayerLoading(true)
    
    // Voltamos para o método de carregar o áudio completo antes de tocar
    // É mais lento, mas é o que funcionava de forma estável para você
    fetch(`${API_URL}/stream/${track.id}`)
      .then(response => response.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        if (audioRef.current) {
          audioRef.current.src = url
          audioRef.current.play()
            .then(() => setIsPlayerLoading(false))
            .catch(e => {
              console.error("Erro ao dar play:", e)
              setIsPlayerLoading(false)
            })
        }
      })
      .catch(err => {
        console.error("Erro ao carregar áudio:", err)
        setIsPlayerLoading(false)
      })
  }

  const handleUpdateMetadata = async (trackId, field, value) => {
    try {
      const body = { [field]: field === 'weight' ? parseFloat(value) : value }
      const res = await fetch(`${API_URL}/library/${trackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const result = await res.json()
      // Atualiza estado local com ambos peso e grupo (resposta bidirecional)
      setLibrary(library.map(t => t.id === trackId 
        ? { ...t, peso: result.new_weight ?? t.peso, sub_categoria: result.new_group ?? t.sub_categoria } 
        : t
      ))
    } catch (e) { console.error(e) }
  }

  const handleBatchUpdate = async (newGroup) => {
    if (selectedTracks.size === 0) return
    const track_ids = [...selectedTracks]
    const res = await fetch(`${API_URL}/library/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_ids, sub_categoria: newGroup })
    })
    const result = await res.json()
    setLibrary(library.map(t => track_ids.includes(t.id)
      ? { ...t, sub_categoria: result.new_group, peso: result.new_weight }
      : t
    ))
    setSelectedTracks(new Set())
  }

  const toggleTrackSelection = (id) => {
    setSelectedTracks(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedTracks.size === library.length) {
      setSelectedTracks(new Set())
    } else {
      setSelectedTracks(new Set(library.map(t => t.id)))
    }
  }

  // Dados já filtrados/ordenados pelo backend — library é a página atual

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
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span style={{fontSize: '0.8rem', opacity: 0.6}}>SERVIDOR</span>
            <span style={{color: isOffline ? '#ff4444' : '#00f2ff', fontWeight: 800, fontSize: '0.75rem'}}>
              {isOffline ? 'OFFLINE' : 'ONLINE'}
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
        <div className="log-container" ref={logContainerRef}>
          <div style={{color: 'var(--accent-color)', fontWeight: 800, marginBottom: '1rem'}}>CONSOLE_SYSTEM_OUTPUT_v3.0</div>
          {logs.map((log, i) => (
            <div key={i} className="log-entry">
              <span style={{opacity: 0.4}}>{'>'}</span> {log}
            </div>
          ))}
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
        <h2 className="card-title" style={{margin: 0}}><Database size={20}/> Biblioteca ({libTotal.toLocaleString('pt-BR')} músicas)</h2>
        
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
            value={energyLevel} 
            onChange={e => setEnergyLevel(e.target.value)}
            style={{padding: '0.6rem', width: '130px', fontSize: '0.85rem'}}
          >
            <option value="">Intensidade</option>
            <option value="L">Calma (L)</option>
            <option value="M">Média (M)</option>
            <option value="H">Agitada (H)</option>
          </select>
          <select 
            value={filterGroup} 
            onChange={e => setFilterGroup(e.target.value)}
            style={{padding: '0.6rem', width: '110px', fontSize: '0.85rem'}}
          >
            <option value="">Grupo</option>
            {rotationGroups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{padding: '0.6rem', width: '155px', fontSize: '0.85rem'}}
          >
            <option value="artista">Artista (A→Z)</option>
            <option value="nome">Música (A→Z)</option>
            <option value="data_desc">Mais Recente</option>
            <option value="data_asc">Mais Antiga</option>
            <option value="peso_desc">Maior Peso</option>
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

      {/* Barra de Ações em Lote */}
      {selectedTracks.size > 0 && (
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem 1.2rem', marginBottom: '1rem', background: 'rgba(188,19,254,0.15)', borderRadius: '10px', border: '1px solid rgba(188,19,254,0.4)'}}>
          <span style={{fontSize: '0.85rem', fontWeight: 700, color: '#bc13fe'}}>{selectedTracks.size} selecionadas</span>
          <span style={{opacity: 0.5, fontSize: '0.8rem'}}>Mover para:</span>
          {rotationGroups.map(g => (
            <button key={g.name} onClick={() => handleBatchUpdate(g.name)}
              style={{padding: '0.3rem 0.8rem', fontSize: '0.78rem', fontWeight: 700, borderRadius: '6px', border: `1px solid ${GROUP_COLORS[g.name] || '#666'}`, background: 'transparent', color: GROUP_COLORS[g.name] || '#666', cursor: 'pointer'}}>
              {g.name}
            </button>
          ))}
          <button onClick={() => setSelectedTracks(new Set())} style={{marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6}}><X size={16}/></button>
        </div>
      )}

      <div style={{overflowY: 'auto', overflowX: 'hidden', maxHeight: '600px'}}>
        <table className="lib-table" style={{tableLayout: 'fixed'}}>
          <thead>
            <tr style={{background: 'none'}}>
              <th style={{width: '40px', padding: '1rem'}}><input type="checkbox" onChange={toggleSelectAll} checked={selectedTracks.size === library.length && library.length > 0}/></th>
              <th style={{width: '55px', textAlign: 'left', padding: '1rem'}}>PLAY</th>
              <th style={{width: '170px', textAlign: 'left', padding: '1rem'}}>ARTISTA</th>
              <th style={{textAlign: 'left', padding: '1rem'}}>MÚSICA</th>
              <th style={{width: '110px', textAlign: 'left', padding: '1rem'}}>PASTA</th>
              <th style={{width: '105px', textAlign: 'left', padding: '1rem'}}>GRUPO</th>
              <th style={{width: '70px', textAlign: 'left', padding: '1rem'}}>BPM</th>
              <th style={{width: '75px', textAlign: 'left', padding: '1rem'}}>PESO</th>
            </tr>
          </thead>
          <tbody>
            {library.map((track) => (
              <tr key={track.id} style={{background: selectedTracks.has(track.id) ? 'rgba(188,19,254,0.08)' : undefined}}>
                <td><input type="checkbox" checked={selectedTracks.has(track.id)} onChange={() => toggleTrackSelection(track.id)}/></td>
                <td>
                  <button className="play-btn" onClick={() => playTrack(track)} disabled={isPlayerLoading}>
                    {isPlayerLoading && currentTrack?.id === track.id ? <RefreshCw size={14} className="pulse"/> : <Play size={14} fill="currentColor"/>}
                  </button>
                </td>
                <td style={{fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}} title={track.artista}>{track.artista}</td>
                <td style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}} title={track.nome}>{track.nome}</td>
                <td style={{fontSize: '0.75rem', opacity: 0.7}}>{track.categoria}</td>
                <td>
                  <select
                    value={track.sub_categoria || 'STD'}
                    onChange={e => handleUpdateMetadata(track.id, 'sub_categoria', e.target.value)}
                    style={{padding: '0.3rem', width: '90px', fontSize: '0.75rem', textAlign: 'center', background: 'rgba(0,0,0,0.3)', color: GROUP_COLORS[track.sub_categoria] || '#fff', fontWeight: 700, border: `1px solid ${GROUP_COLORS[track.sub_categoria] || '#444'}`, borderRadius: '6px'}}
                  >
                    {rotationGroups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                  </select>
                </td>
                <td style={{
                  color: track.bpm > 120 ? '#ff2d55' : track.bpm < 80 ? '#00f2ff' : '#00ffaa',
                  fontWeight: 800,
                  fontSize: '0.85rem'
                }}>
                  {Math.round(track.bpm) || '--'}
                </td>
                <td>
                  <input 
                    type="number" 
                    step="0.1"
                    key={`${track.id}-${track.peso}`}
                    defaultValue={Number(track.peso || 1.0).toFixed(1)} 
                    onBlur={e => handleUpdateMetadata(track.id, 'weight', e.target.value)}
                    style={{padding: '0.3rem', width: '55px', fontSize: '0.75rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)'}}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {library.length === 0 && !libLoading && (
          <div style={{textAlign: 'center', padding: '3rem', opacity: 0.5}}>
            Nenhuma música encontrada com os filtros atuais.
          </div>
        )}
        {libLoading && (
          <div style={{textAlign: 'center', padding: '2rem', opacity: 0.5}}>
            <RefreshCw size={20} className="pulse"/> Carregando...
          </div>
        )}
      </div>

      {/* Controles de Paginação */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', flexWrap: 'wrap', gap: '1rem'}}>
        <span style={{fontSize: '0.8rem', opacity: 0.5}}>
          Página {libPage} de {libPages} · {libTotal.toLocaleString('pt-BR')} músicas no total
        </span>
        <div style={{display: 'flex', gap: '0.5rem'}}>
          <button
            onClick={() => { const p = Math.max(1, libPage - 1); setLibPage(p); fetchLibrary({ page: p }) }}
            disabled={libPage <= 1}
            style={{padding: '0.4rem 0.9rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: libPage <= 1 ? 'not-allowed' : 'pointer', opacity: libPage <= 1 ? 0.4 : 1}}
          >← Anterior</button>
          {Array.from({ length: Math.min(5, libPages) }, (_, i) => {
            const start = Math.max(1, Math.min(libPage - 2, libPages - 4))
            const p = start + i
            return (
              <button key={p} onClick={() => { setLibPage(p); fetchLibrary({ page: p }) }}
                style={{padding: '0.4rem 0.8rem', borderRadius: '6px', border: `1px solid ${p === libPage ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}`, background: p === libPage ? 'rgba(0,242,255,0.1)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', fontWeight: p === libPage ? 700 : 400, color: p === libPage ? 'var(--accent-color)' : 'inherit'}}>
                {p}
              </button>
            )
          })}
          <button
            onClick={() => { const p = Math.min(libPages, libPage + 1); setLibPage(p); fetchLibrary({ page: p }) }}
            disabled={libPage >= libPages}
            style={{padding: '0.4rem 0.9rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: libPage >= libPages ? 'not-allowed' : 'pointer', opacity: libPage >= libPages ? 0.4 : 1}}
          >Próxima →</button>
        </div>
      </div>
    </div>
  )

  const renderSettings = () => (
    <div className="config-section glass card">
      <h2 className="card-title"><Settings size={20}/> Configurações Avançadas</h2>

      <section style={{marginBottom: '3rem'}}>
        <h3>🎚️ Grupos de Rotação</h3>
        <p style={{opacity: 0.6, fontSize: '0.85rem', marginBottom: '1rem'}}>Define os thresholds de peso de cada grupo. Novos arquivos entram como STD.</p>
        <table className="config-table">
          <thead><tr><th>Grupo</th><th>Peso Mínimo (para entrar)</th><th>Peso Base (ao mudar pro grupo)</th></tr></thead>
          <tbody>
            {rotationGroups.map((g, i) => (
              <tr key={i}>
                <td><span style={{fontWeight: 800, color: GROUP_COLORS[g.name] || '#fff'}}>{g.name}</span></td>
                <td><input type="number" step="0.1" value={g.min_weight} onChange={e => { const next = [...rotationGroups]; next[i] = {...g, min_weight: parseFloat(e.target.value)}; setRotationGroups(next) }}/></td>
                <td><input type="number" step="0.1" value={g.base_weight} onChange={e => { const next = [...rotationGroups]; next[i] = {...g, base_weight: parseFloat(e.target.value)}; setRotationGroups(next) }}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      
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
