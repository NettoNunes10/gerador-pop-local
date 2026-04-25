import { useState, useEffect, useRef } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip
} from 'recharts'
import { Play, Pause, ChevronDown, ChevronRight, BarChart2, Music, Layout, Database, RefreshCw, X, Search, Trash2, Plus, Save, AlertTriangle, FileText, Edit2, Copy, Settings, ClipboardList } from 'lucide-react'
import { API_URL, safeFetch } from './api/client'
import { AppHeader } from './components/AppHeader'
import { BusyBanner } from './components/BusyBanner'
import { FloatingPlayer } from './components/FloatingPlayer'
import { TabNav } from './components/TabNav'
import { COLORS, GROUP_COLORS } from './constants'
import { getVisibleColor } from './utils/colors'
import './index.css'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [systemStatus, setSystemStatus] = useState(null)
  const [editablePaths, setEditablePaths] = useState({})
  const [favoriteArtists, setFavoriteArtists] = useState([])
  const [paidRules, setPaidRules] = useState([])
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
  const [isBackendBusy, setIsBackendBusy] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [rotationGroups, setRotationGroups] = useState([
    { name: 'TOP', min_weight: 3.0, base_weight: 3.0 },
    { name: 'HIT', min_weight: 2.0, base_weight: 2.0 },
    { name: 'STD', min_weight: 1.0, base_weight: 1.0 },
    { name: 'OLD', min_weight: 0.0, base_weight: 0.5 },
  ])
  const [selectedTracks, setSelectedTracks] = useState(new Set())
  const [filterGroups, setFilterGroups] = useState([])

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterVibe, setFilterVibe] = useState('')
  const [sortBy, setSortBy] = useState('artista')
  const [selectedTrackDetails, setSelectedTrackDetails] = useState(null)
  const [editingTrackName, setEditingTrackName] = useState('')
  const [duplicateGroups, setDuplicateGroups] = useState([])
  const [showDuplicates, setShowDuplicates] = useState(false)

  // BLM Manager State
  const [selectedBLM, setSelectedBLM] = useState(null)
  const [blmContent, setBlmContent] = useState(null)
  const [blmStats, setBlmStats] = useState(null)

  // New Model Modal State
  const [showNewModelModal, setShowNewModelModal] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [newModelInterval, setNewModelInterval] = useState('30')
  const [selectedCustomSlots, setSelectedCustomSlots] = useState(new Set())
  const [categories, setCategories] = useState([])
  const [blockClipboard, setBlockClipboard] = useState(null)
  const [draggedItem, setDraggedItem] = useState(null)
  const [expandedBlmBlocks, setExpandedBlmBlocks] = useState(new Set())

  // Player State
  const [currentTrack, setCurrentTrack] = useState(null)
  const [isPlayerLoading, setIsPlayerLoading] = useState(false)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const audioRef = useRef(null)

  // Config & App State
  const [customVars, setCustomVars] = useState([])
  const [customFiles, setCustomFiles] = useState({})
  const [defaultCategory, setDefaultCategory] = useState('SERTANEJO')
  const [defaultVibeMin, setDefaultVibeMin] = useState(0)
  const [defaultVibeMax, setDefaultVibeMax] = useState(100)
  const [typeColors, setTypeColors] = useState({
    MUSICA: '#00f2ff',
    VHT: '#bc13fe',
    RESERVA: '#ffaa00',
    PREFIXO: '#4cd964'
  })
  const [toastMessage, setToastMessage] = useState(null)

  const [selectedDate, setSelectedDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  })
  const [days, setDays] = useState(1)
  const logContainerRef = useRef(null)


  const fetchStatus = async () => {
    try {
      const res = await safeFetch(`${API_URL}/status`)
      const data = await res.json()
      setSystemStatus(data)
      setIsBackendBusy(data.is_busy)
      if (!data.is_busy) setIsBusy(false)
    } catch {
      setIsOffline(true)
    }
  }

  const fetchTemplates = async () => {
    try {
      const res = await safeFetch(`${API_URL}/templates`)
      const data = await res.json()
      setAvailableTemplates(data)
    } catch {
      setAvailableTemplates([])
    }
  }

  const fetchCategories = async () => {
    try {
      const res = await safeFetch(`${API_URL}/categories`)
      const data = await res.json()
      setCategories(data)
    } catch {
      setCategories([])
    }
  }

  const fetchConfig = async () => {
    try {
      const res = await safeFetch(`${API_URL}/config`)
      const data = await res.json()
      setEditablePaths(data.paths || {})
      setFavoriteArtists(data.favorite_artists || [])
      setPaidRules(data.paid_rules || [])
      setDayTemplates(data.day_templates || {})
      setCustomVars((data.custom_vars || []).map(cv => ({ ...cv, color: toHexColor(cv.color || '#333333') })))
      if (data.custom_vars) {
        data.custom_vars.forEach(cv => {
          const path = (cv.path || '').trim()
          if (path && !path.match(/\.(mp3|wav|flac|m4a|aac|mp4|m4v)\s*$/i)) {
            safeFetch(`${API_URL}/list_files?path=${encodeURIComponent(path)}`)
              .then(r => r.json())
              .then(files => {
                setCustomFiles(prev => ({ ...prev, [cv.name]: files }))
              })
              .catch(() => setCustomFiles(prev => ({ ...prev, [cv.name]: [] })))
          }
        })
      }
      if (data.rotation_groups) setRotationGroups(data.rotation_groups)
      if (data.default_category) setDefaultCategory(data.default_category)
      setDefaultVibeMin(Number(data.default_vibe_min ?? 0))
      setDefaultVibeMax(Number(data.default_vibe_max ?? 100))
      if (data.type_colors) {
        setTypeColors(Object.fromEntries(
          Object.entries(data.type_colors).map(([type, color]) => [type, toHexColor(color, typeColors[type] || '#333333')])
        ))
      }
    } catch {
      setIsOffline(true)
    }
  }

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const normalizeGroupFilter = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean)
    if (typeof value === 'string') return value.split(',').map(v => v.trim()).filter(Boolean)
    return []
  }

  const fetchLibrary = async (opts = {}) => {
    setLibLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', opts.page ?? libPage)
      params.set('limit', LIB_LIMIT)
      if (opts.search ?? searchTerm) params.set('search', opts.search ?? searchTerm)
      if (opts.category ?? filterCategory) params.set('category', opts.category ?? filterCategory)
      const groups = normalizeGroupFilter(opts.groups ?? filterGroups)
      if (groups?.length) params.set('group', groups.join(','))
      if (opts.vibe ?? filterVibe) params.set('vibe', opts.vibe ?? filterVibe)
      if (opts.sort ?? sortBy) params.set('sort', opts.sort ?? sortBy)
      const res = await safeFetch(`${API_URL}/library?${params}`)
      const data = await res.json()
      setLibrary(data.items)
      setLibTotal(data.total)
      setLibPage(data.page)
      setLibPages(data.pages)
    } catch {
      setLibrary([])
    }
    finally { setLibLoading(false) }
  }

  const fetchStats = async () => {
    try {
      const res = await safeFetch(`${API_URL}/stats`)
      const data = await res.json()
      setStats(data)
    } catch {
      setStats({ categories: [], top_artists: [] })
    }
  }

  const fetchDuplicates = async () => {
    try {
      const res = await safeFetch(`${API_URL}/library/duplicates`, { timeout: 5000 })
      const data = await res.json()
      setDuplicateGroups(data)
      setShowDuplicates(true)
    } catch {
      setDuplicateGroups([])
      setShowDuplicates(true)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStatus()
    fetchConfig()
    fetchCategories()
    fetchLibrary({ page: 1 })
    fetchStats()
    fetchTemplates()

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
        setIsBackendBusy(data2.is_busy)
        if (!data2.is_busy) setIsBusy(false)

        setIsOffline(false)
        failureCount = 0
      } catch {
        failureCount++
        if (failureCount >= 2) setIsOffline(true)
      }
      if (!cancelled) setTimeout(poll, 4000)
    }
    setTimeout(poll, 4000)
    return () => { cancelled = true }
    // Initial bootstrap intentionally runs once; polling refreshes server state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLibrary({ page: 1, search: searchTerm })
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLibrary({ page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory, filterGroups, filterVibe, sortBy])

  useEffect(() => {
    const saved = localStorage.getItem('popfm_library_filters')
    if (!saved) return
    try {
      const data = JSON.parse(saved)
      setFilterCategory(data.filterCategory || '')
      setFilterGroups(normalizeGroupFilter(data.filterGroups || data.filterGroup))
      setFilterVibe(data.filterVibe || '')
      setSortBy(data.sortBy || 'artista')
      setSearchTerm(data.searchTerm || '')
    } catch {
      localStorage.removeItem('popfm_library_filters')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('popfm_library_filters', JSON.stringify({
      searchTerm,
      filterCategory,
      filterGroups,
      filterVibe,
      sortBy
    }))
  }, [searchTerm, filterCategory, filterGroups, filterVibe, sortBy])

  useEffect(() => {
    const el = logContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay = () => setIsAudioPlaying(true)
    const onPause = () => setIsAudioPlaying(false)
    const onEnded = () => setIsAudioPlaying(false)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [currentTrack])

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

  const handleResetHistory = async () => {
    if (!window.confirm("⚠️ BIG BANG: Isso irá limpar todo o histórico e semear um passado falso proporcional ao peso de cada música. Músicas TOP (Peso ≥2.5) terão descanso curto, normais terão médio e leves terão longo. Deseja continuar?")) return
    setIsBusy(true)
    try {
      const res = await fetch(`${API_URL}/library/reset`, { method: 'POST' })
      if (res.ok) {
        alert("✅ Histórico resetado com sucesso!")
      }
    } catch (e) {
      alert("❌ Erro ao resetar: " + e.message)
    } finally {
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
          rotation_groups: rotationGroups,
          custom_vars: customVars.map(cv => ({ ...cv, path: (cv.path || '').trim() })),
          default_category: defaultCategory,
          default_vibe_min: Number(defaultVibeMin),
          default_vibe_max: Number(defaultVibeMax),
          type_colors: typeColors
        })
      })
      if (res.ok) {
        showToast("✅ Configurações salvas com sucesso!")
        await fetchConfig()
      }
    } catch (e) {
      alert("❌ Erro ao salvar: " + e.message)
    } finally {
      setIsBusy(false)
    }
  }

  const playTrack = (track) => {
    if (currentTrack?.id === track.id && audioRef.current) {
      if (audioRef.current.paused) {
        setIsPlayerLoading(true)
        audioRef.current.play()
          .then(() => {
            setIsAudioPlaying(true)
            setIsPlayerLoading(false)
          })
          .catch(e => {
            console.error("Erro ao dar play:", e)
            setIsPlayerLoading(false)
          })
      } else {
        audioRef.current.pause()
        setIsAudioPlaying(false)
      }
      return
    }

    setCurrentTrack(track)
    setIsAudioPlaying(false)
    setIsPlayerLoading(true)
    setTimeout(() => {
      if (!audioRef.current) return
      audioRef.current.src = `${API_URL}/stream/${track.id}`
      audioRef.current.play()
        .then(() => {
          setIsAudioPlaying(true)
          setIsPlayerLoading(false)
        })
        .catch(e => {
          console.error("Erro ao dar play:", e)
          setIsPlayerLoading(false)
        })
    }, 0)
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

  const handleRenameTrack = async () => {
    if (!selectedTrackDetails) return
    const nextFilename = editingTrackName.trim()
    const currentFilename = `${selectedTrackDetails.artista || ''} - ${selectedTrackDetails.nome || ''}`.trim()
    if (!nextFilename || nextFilename === currentFilename) return
    try {
      const res = await fetch(`${API_URL}/library/${selectedTrackDetails.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: nextFilename })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.detail || 'Erro ao renomear')
      const updated = {
        ...selectedTrackDetails,
        artista: result.artista,
        nome: result.nome,
        caminho_arquivo: result.caminho_arquivo
      }
      setSelectedTrackDetails(updated)
      setEditingTrackName(result.filename || `${updated.artista} - ${updated.nome}`)
      setLibrary(library.map(t => t.id === updated.id ? { ...t, artista: updated.artista, nome: updated.nome, caminho_arquivo: updated.caminho_arquivo } : t))
      showToast('Arquivo renomeado com sucesso!')
    } catch (e) {
      alert('Erro ao renomear: ' + e.message)
    }
  }

  const handleBatchUpdate = async (newGroup, weight = null) => {
    if (selectedTracks.size === 0) return
    const track_ids = [...selectedTracks]
    const body = { track_ids }
    if (newGroup) body.sub_categoria = newGroup
    if (weight !== null) body.weight = weight

    const res = await fetch(`${API_URL}/library/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const result = await res.json()
    setLibrary(library.map(t => track_ids.includes(t.id)
      ? { ...t, sub_categoria: result.new_group || t.sub_categoria, peso: result.new_weight || t.peso }
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

  const handleDeleteTrack = async (track) => {
    if (!window.confirm(`⚠️ TEM CERTEZA? Isso irá deletar permanentemente o arquivo:\n\n${track.artista} - ${track.nome}\n\nO arquivo será apagado do disco (M:/)!`)) return

    try {
      const res = await fetch(`${API_URL}/library/${track.id}`, { method: 'DELETE' })
      if (res.ok) {
        setLibrary(library.filter(t => t.id !== track.id))
        setLibTotal(prev => prev - 1)
      }
    } catch (e) {
      alert("Erro ao deletar: " + e.message)
    }
  }

  const fetchBLMContent = (filename) => {
    setIsBusy(true)
    setSelectedBLM(filename)

    // Pequeno delay para garantir que o spinner apareça ANTES do fetch e do render pesado
    setTimeout(() => {
      safeFetch(`${API_URL}/blm/${filename}`)
        .then(r => r.json())
        .then(data => {
          if (data.filename && data.filename !== filename) {
            setSelectedBLM(data.filename)
            showToast(`Modelo convertido para ${data.filename}`)
            fetchTemplates()
          }
          setBlmContent(data)
          setBlmStats(data.stats || null)
          setExpandedBlmBlocks(new Set())
          setShowEditor(true)
          // Mantém o busy por mais um pouco para o navegador "respirar" após o render
          setTimeout(() => setIsBusy(false), 800)
        })
        .catch(() => {
          setIsBusy(false)
          setShowEditor(false)
          alert("Erro ao carregar o conteúdo do modelo.")
        })
    }, 100)
  }

  const handleSaveBLM = async () => {
    if (!selectedBLM || !blmContent) return
    setIsBusy(true)

    // Converte de volta para lista plana antes de enviar
    const flatLines = []
    if (blmContent.orphan_lines) {
      flatLines.push(...blmContent.orphan_lines)
    }
    blmContent.blocks.forEach(block => {
      // Adiciona o marcador do bloco
      flatLines.push({ resource: block.time, params: { m: '0', t: '0', i: '0', s: '0', f: '0', r: '0', d: '0', o: '0', n: '1', x: '  ', g: '0' } })
      // Adiciona os itens do bloco
      flatLines.push(...block.items)
    })
    const blocks = blmContent.blocks.map(block => ({
      time: block.time,
      vibe_min: Number(block.vibe_min ?? defaultVibeMin),
      vibe_max: Number(block.vibe_max ?? defaultVibeMax),
      items: block.items.map(item => ({
        resource: item.resource,
        mix: String(item.mix ?? item.params?.m ?? '3000')
      }))
    }))

    try {
      const res = await fetch(`${API_URL}/blm/${selectedBLM}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ header: blmContent.header, lines: flatLines, blocks, orphan_lines: blmContent.orphan_lines || [] })
      })
      if (res.ok) {
        showToast("✅ Modelo salvo com sucesso!")
      } else {
        throw new Error("Erro ao salvar no servidor")
      }
    } catch (e) {
      alert("❌ Erro ao salvar: " + e.message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleDeleteBLM = async (e, filename) => {
    e.stopPropagation()
    if (!window.confirm(`Tem certeza que deseja excluir o modelo "${filename}" permanentemente do disco?`)) return

    setIsBusy(true)
    try {
      const res = await safeFetch(`${API_URL}/blm/${filename}`, { method: 'DELETE' })
      if (res.ok) {
        showToast("🗑️ Modelo removido com sucesso!")
        fetchTemplates()
      } else {
        throw new Error("Erro ao excluir arquivo")
      }
    } catch (e) {
      alert("Erro: " + e.message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleDuplicateBLM = async (e, filename) => {
    e.stopPropagation()
    const newName = window.prompt(`Digite o nome para a cópia de "${filename}":`, filename.replace(/\.(blm|blmn)$/i, '_COPIA'))
    if (!newName) return

    const finalName = newName.replace(/\.(blm|blmn)$/i, '') + '.blmn'

    setIsBusy(true)
    try {
      // 1. Busca o conteúdo original
      const res = await safeFetch(`${API_URL}/blm/${filename}`)
      const data = await res.json()

      // 2. Converte para lista plana para salvar como novo
      const flatLines = []
      if (data.orphan_lines) flatLines.push(...data.orphan_lines)
      data.blocks.forEach(block => {
        flatLines.push({ resource: block.time, params: { m: '0', t: '0', i: '0', s: '0', f: '0', r: '0', d: '0', o: '0', n: '1', x: '  ', g: '0' } })
        flatLines.push(...block.items)
      })
      const blocks = data.blocks.map(block => ({
        time: block.time,
        vibe_min: Number(block.vibe_min ?? defaultVibeMin),
        vibe_max: Number(block.vibe_max ?? defaultVibeMax),
        items: (block.items || []).map(item => ({
          resource: item.resource,
          mix: String(item.mix ?? item.params?.m ?? '3000')
        }))
      }))

      // 3. Salva com o novo nome
      const resSave = await safeFetch(`${API_URL}/blm/${finalName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ header: data.header || '', lines: flatLines, blocks, orphan_lines: data.orphan_lines || [] })
      })

      if (resSave.ok) {
        showToast("👯 Modelo duplicado com sucesso!")
        fetchTemplates()
      } else {
        throw new Error("Erro ao criar cópia")
      }
    } catch (e) {
      alert("Erro ao duplicar: " + e.message)
    } finally {
      setIsBusy(false)
    }
  }

  const updateBLMItem = (blockIndex, itemIndex, field, value) => {
    const nextBlocks = [...blmContent.blocks]
    const item = nextBlocks[blockIndex].items[itemIndex]

    if (field === 'mix') {
      item.mix = value
    } else {
      item[field] = value
    }

    setBlmContent({ ...blmContent, blocks: nextBlocks })
  }

  const addBLMItem = (blockIndex, itemIndex) => {
    const nextBlocks = [...blmContent.blocks]
    const newItem = {
      resource: (defaultCategory || 'SERTANEJO') + '.apm',
      mix: '3000'
    }
    // Adiciona ABAIXO (index + 1)
    nextBlocks[blockIndex].items.splice(itemIndex + 1, 0, newItem)
    setBlmContent({ ...blmContent, blocks: nextBlocks })
  }

  const removeBLMItem = (blockIndex, itemIndex) => {
    const nextBlocks = [...blmContent.blocks]
    nextBlocks[blockIndex].items.splice(itemIndex, 1)
    setBlmContent({ ...blmContent, blocks: nextBlocks })
  }

  const copyBlock = (block) => {
    setBlockClipboard(JSON.parse(JSON.stringify(block)))
    showToast("📋 Bloco copiado!")
  }

  const pasteBlock = (index) => {
    if (!blockClipboard) return showToast("Nada para colar!")
    const nextBlocks = [...blmContent.blocks]
    const currentTime = nextBlocks[index].time
    nextBlocks[index] = { ...JSON.parse(JSON.stringify(blockClipboard)), time: currentTime }
    setBlmContent({ ...blmContent, blocks: nextBlocks })
    showToast(`✅ Colado em ${currentTime}`)
  }

  const onDragStart = (blockIdx, itemIdx) => {
    setDraggedItem({ blockIdx, itemIdx })
  }

  const onDragOver = (e) => {
    e.preventDefault()
  }

  const onDrop = (blockIdx, targetIdx) => {
    if (!draggedItem || draggedItem.blockIdx !== blockIdx) return

    const nextBlocks = [...blmContent.blocks]
    const items = [...nextBlocks[blockIdx].items]
    const [movedItem] = items.splice(draggedItem.itemIdx, 1)
    items.splice(targetIdx, 0, movedItem)
    nextBlocks[blockIdx].items = items

    setBlmContent({ ...blmContent, blocks: nextBlocks })
    setDraggedItem(null)
  }

  const getItemType = (resource) => {
    if (!resource) return 'INVALID'
    const resTrim = resource.trim()
    if (resTrim === 'Reserva do beMidia') return 'RESERVA'
    if (resTrim === 'VINHETA.apm' || resTrim === 'VHT - Geração.apm') return 'VHT'
    if (editablePaths['PREFIXO'] && resTrim === (editablePaths['PREFIXO'] || '').trim()) return 'PREFIXO'

    // Verifica variáveis customizadas
    for (const cv of customVars) {
      const cvPath = (cv.path || '').trim()
      if (resTrim === `${cv.name}.apm`) return `OUTRO_${cv.name}`
      if (resTrim === cvPath) return `OUTRO_${cv.name}`
      if (cvPath && !cvPath.match(/\.(mp3|wav|flac|m4a|mp4|m4v)\s*$/i) && resTrim.startsWith(cvPath)) {
        return `OUTRO_${cv.name}`
      }
    }

    if (resource.endsWith('.apm')) return 'MUSICA'

    // Se for um marcador de horário (HH:MM), não é um item de áudio
    if (resource.match(/^\d{2}:\d{2}$/)) return 'MARKER'

    // Se for um arquivo físico que não bateu com nada
    if (resTrim.match(/\.(mp3|wav|flac|m4a|aac|mp4|m4v|blm)\s*$/i)) return 'INVALID'

    return 'CAMINHO'
  }

  const handleTypeChange = (blockIdx, itemIdx, newType) => {
    const nextBlocks = [...blmContent.blocks]
    const item = nextBlocks[blockIdx].items[itemIdx]

    switch (newType) {
      case 'RESERVA':
        item.resource = 'Reserva do beMidia'
        item.mix = '4294967295'
        break
      case 'VHT':
        item.resource = 'VINHETA.apm'
        item.mix = '0'
        break
      case 'PREFIXO':
        item.resource = editablePaths['PREFIXO'] || 'U:\\Materiais\\Eventos Gerais\\Prefixo\\PREFIXO POP FM.mp3'
        item.mix = '1500'
        break
      case 'MUSICA':
        item.resource = (defaultCategory || categories[0] || 'SERTANEJO') + '.apm'
        item.mix = '3000'
        break
      case 'CAMINHO':
        item.resource = ''
        item.mix = '3000'
        break
      default:
        if (newType.startsWith('OUTRO_')) {
          const name = newType.replace('OUTRO_', '')
          const cv = customVars.find(c => c.name === name)
          const path = (cv?.path || '').trim()
          if (path && path.match(/\.(mp3|wav|flac|m4a|aac|mp4|m4v)\s*$/i)) {
            item.resource = path
          } else {
            item.resource = `${name}.apm`
          }
          item.mix = '3000'
        }
    }
    setBlmContent({ ...blmContent, blocks: nextBlocks })
  }

  const updateMusicResource = (bIdx, iIdx, category, currentLetters, toggleLetter) => {
    let newLetters = currentLetters
    if (toggleLetter) {
      if (newLetters.includes(toggleLetter)) {
        newLetters = newLetters.replace(toggleLetter, '')
      } else {
        newLetters += toggleLetter
        // Ordem correta T H S O
        newLetters = ['T', 'H', 'S', 'O'].filter(l => newLetters.includes(l)).join('')
      }
    }

    let suffix = ''
    if (newLetters === '') {
      // Se desmarcou tudo, fallback para salvar a categoria cheia (representando T,H,S,O)
      suffix = ''
    } else if (newLetters !== 'THSO') {
      suffix = '_' + newLetters
    }

    updateBLMItem(bIdx, iIdx, 'resource', category + suffix + '.apm')
  }

  const addBLMBlock = (time) => {
    if (!blmContent) return
    const nextBlocks = [...blmContent.blocks]
    if (nextBlocks.some(b => b.time === time)) return alert("Este horário já existe!")

    const newBlock = {
      time: time,
      vibe_min: Number(defaultVibeMin),
      vibe_max: Number(defaultVibeMax),
      items: [{ resource: 'Reserva do beMidia', mix: '4294967295' }]
    }

    nextBlocks.push(newBlock)
    nextBlocks.sort((a, b) => a.time.localeCompare(b.time))
    setBlmContent({ ...blmContent, blocks: nextBlocks })
  }

  const removeBLMBlock = (index) => {
    if (!window.confirm("Deseja remover este bloco inteiro?")) return
    const nextBlocks = [...blmContent.blocks]
    nextBlocks.splice(index, 1)
    setBlmContent({ ...blmContent, blocks: nextBlocks })
  }

  const updateBlockVibe = (index, field, value) => {
    const nextBlocks = [...blmContent.blocks]
    const numericValue = Math.max(0, Math.min(100, Number(value)))
    nextBlocks[index] = { ...nextBlocks[index], [field]: numericValue }
    if (Number(nextBlocks[index].vibe_min) > Number(nextBlocks[index].vibe_max)) {
      const pairedField = field === 'vibe_min' ? 'vibe_max' : 'vibe_min'
      nextBlocks[index] = { ...nextBlocks[index], [pairedField]: numericValue }
    }
    setBlmContent({ ...blmContent, blocks: nextBlocks })
  }

  const toggleBlmBlock = (blockKey) => {
    setExpandedBlmBlocks(prev => {
      const next = new Set(prev)
      next.has(blockKey) ? next.delete(blockKey) : next.add(blockKey)
      return next
    })
  }

  const handleCreateNewModel = () => {
    if (!newModelName) return alert("Digite um nome para o modelo")

    let finalName = newModelName
    finalName = finalName.replace(/\.(blm|blmn)$/i, '') + '.blmn'

    const times = []
    if (newModelInterval === 'custom') {
      times.push(...Array.from(selectedCustomSlots).sort())
    } else {
      const interval = parseInt(newModelInterval)
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += interval) {
          times.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
        }
      }
    }

    if (times.length === 0) return alert("Selecione pelo menos um horário")

    const newBlocks = times.map(t => ({
      time: t,
      vibe_min: Number(defaultVibeMin),
      vibe_max: Number(defaultVibeMax),
      items: [{ resource: 'Reserva do beMidia', mix: '4294967295' }]
    }))

    setSelectedBLM(finalName)
    setBlmContent({
      header: "",
      blocks: newBlocks,
      orphan_lines: []
    })
    setExpandedBlmBlocks(new Set())
    setBlmStats({
      total_lines: newBlocks.reduce((total, block) => total + block.items.length + 1, 0),
      music_slots: 0,
      sweeper_slots: 0,
      commercial_blocks: newBlocks.length,
      fixed_files: 0,
      markers: newBlocks.length
    })
    setShowEditor(true)
    setShowNewModelModal(false)
    setNewModelName('')
    setSelectedCustomSlots(new Set())
  }

  const toggleCustomSlot = (slot) => {
    setSelectedCustomSlots(prev => {
      const next = new Set(prev)
      next.has(slot) ? next.delete(slot) : next.add(slot)
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

  const formatDuration = (seconds) => {
    const total = Number(seconds || 0)
    if (!total) return '--'
    const minutes = Math.floor(total / 60)
    const rest = Math.floor(total % 60).toString().padStart(2, '0')
    return `${minutes}:${rest}`
  }

  const formatDateTime = (value) => {
    if (!value) return '--'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('pt-BR')
  }

  const getVibeInfo = (value) => {
    const vibe = Number(value || 0)
    if (vibe >= 70) return { label: '70+', color: '#00ffaa' }
    if (vibe >= 60) return { label: '60->70', color: '#ffaa00' }
    return { label: '60-', color: '#ff2d55' }
  }

  const toHexColor = (value, fallback = '#333333') => {
    const raw = String(value || '').trim()
    const hex = raw.match(/^#?([0-9a-f]{6})$/i)
    if (hex) return `#${hex[1].toUpperCase()}`
    const shortHex = raw.match(/^#?([0-9a-f]{3})$/i)
    if (shortHex) {
      return `#${shortHex[1].split('').map(ch => ch + ch).join('').toUpperCase()}`
    }
    const rgb = raw.match(/^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/i)
    if (rgb) {
      return `#${rgb.slice(1, 4).map(n => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('').toUpperCase()}`
    }
    return fallback
  }

  const clearLibraryFilters = () => {
    setSearchTerm('')
    setFilterCategory('')
    setFilterGroups([])
    setFilterVibe('')
    setSortBy('artista')
    setShowDuplicates(false)
  }

  const toggleFilterGroup = (groupName) => {
    setFilterGroups(prevValue => {
      const prev = normalizeGroupFilter(prevValue)
      return prev.includes(groupName)
        ? prev.filter(name => name !== groupName)
        : [...prev, groupName]
    })
  }

  const openTrackDetails = (track) => {
    setSelectedTrackDetails(track)
    setEditingTrackName(`${track.artista || ''} - ${track.nome || ''}`.trim())
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

  const updateDayTemplate = (dayIndex, filename) => {
    setDayTemplates({ ...dayTemplates, [dayIndex]: filename })
  }

  const renderTrackDetailsModal = () => {
    if (!selectedTrackDetails) return null
    const track = selectedTrackDetails
    const vibeInfo = getVibeInfo(track.vibe)
    return (
      <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1900, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="glass card" style={{ width: 'min(720px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <h2 className="card-title" style={{ marginBottom: '0.35rem' }}>{track.nome}</h2>
              <div style={{ fontWeight: 800, opacity: 0.75 }}>{track.artista}</div>
            </div>
            <button onClick={() => setSelectedTrackDetails(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={22} /></button>
          </div>

          <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>Nome completo do arquivo</label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <input
                  type="text"
                  value={editingTrackName}
                  placeholder="ARTISTA - MUSICA"
                  onChange={e => setEditingTrackName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameTrack() }}
                />
                <button className="secondary-btn" onClick={handleRenameTrack} style={{ whiteSpace: 'nowrap' }}>
                  <Save size={16} /> Salvar
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', padding: '0.8rem 1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.04)' }}>
              <audio controls src={`${API_URL}/stream/${track.id}`} style={{ width: '100%', minWidth: 0 }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div><label>Pasta</label><strong>{track.categoria || '--'}</strong></div>
            <div><label>Grupo</label><strong style={{ color: GROUP_COLORS[track.sub_categoria] || '#fff' }}>{track.sub_categoria || 'STD'}</strong></div>
            <div><label>Peso</label><strong>{Number(track.peso || 0).toFixed(1)}</strong></div>
            <div><label>Duração</label><strong>{formatDuration(track.duracao)}</strong></div>
            <div><label>Vibe</label><strong style={{ color: vibeInfo.color }}>{Math.round(track.vibe) || 0}</strong></div>
            <div><label>Energy</label><strong>{Number(track.energy || 0).toFixed(2)}</strong></div>
            <div><label>Valence</label><strong>{Number(track.valence || 0).toFixed(2)}</strong></div>
          </div>

          <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
              <label>Importação</label>
              <div style={{ opacity: 0.8 }}>{formatDateTime(track.data_arquivo)}</div>
            </div>
            <div>
              <label>Última execução</label>
              <div style={{ opacity: 0.8 }}>{formatDateTime(track.data_ultima_execucao)}</div>
            </div>
            <div>
              <label>Caminho do arquivo</label>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', opacity: 0.75, overflowWrap: 'anywhere' }}>{track.caminho_arquivo || '--'}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderDashboard = () => (
    <div className="dashboard-layout">
      <div className="sidebar">
        <section className="card glass">
          <h2 className="card-title"><Layout size={20} /> Gerador de Emissão</h2>
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
          <h2 className="card-title"><Database size={20} /> Motor v3.0</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>SERVIDOR</span>
            <span style={{ color: isOffline ? '#ff4444' : '#00f2ff', fontWeight: 800, fontSize: '0.75rem' }}>
              {isOffline ? 'OFFLINE' : 'ONLINE'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>DB SQLITE</span>
            <span className={`badge ${systemStatus?.database === 'Connected' ? 'badge-online' : 'badge-error'}`}>
              {systemStatus?.database || '---'}
            </span>
          </div>
        </section>
      </div>

      <section className="glass" style={{ padding: '0' }}>
        <div className="log-container" ref={logContainerRef}>
          <div style={{ color: 'var(--accent-color)', fontWeight: 800, marginBottom: '1rem' }}>CONSOLE_SYSTEM_OUTPUT_v3.0</div>
          {logs.map((log, i) => (
            <div key={i} className="log-entry">
              <span style={{ opacity: 0.4 }}>{'>'}</span> {log}
            </div>
          ))}
        </div>
      </section>
    </div>
  )

  const renderStats = () => (
    <div className="dashboard-layout" style={{ gridTemplateColumns: '1fr' }}>
      <div className="charts-grid">
        <div className="card glass chart-card">
          <h2 className="card-title"><BarChart2 size={20} /> Equilíbrio de Categorias</h2>
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
          <h2 className="card-title"><Music size={20} /> Top 5 Artistas na Base</h2>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.top_artists} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" stroke="#a0a0c0" fontSize={12} width={120} />
              <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="value" fill="var(--accent-color)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )

  const renderLibrary = () => (
    <div className="glass card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <h2 className="card-title" style={{ margin: 0 }}><Database size={20} /> Biblioteca ({libTotal.toLocaleString('pt-BR')} músicas)</h2>

        <div style={{ display: 'flex', gap: '0.75rem', flex: '1 1 100%', width: '100%', order: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '0 1 340px', minWidth: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '0.65rem 1rem 0.65rem 2.5rem', fontSize: '0.9rem', width: '100%' }}
            />
          </div>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ padding: '0.6rem', width: '150px', fontSize: '0.85rem' }}
          >
            <option value="">Todas Pastas</option>
            {stats.categories.map(cat => (
              <option key={cat.name} value={cat.name}>{cat.name}</option>
            ))}
          </select>
          <select
            value={filterVibe}
            onChange={e => setFilterVibe(e.target.value)}
            style={{ padding: '0.6rem', width: '130px', fontSize: '0.85rem' }}
          >
            <option value="">Vibe</option>
            <option value="LOW">60-</option>
            <option value="MID">60-&gt;70</option>
            <option value="HIGH">70+</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.65rem', border: '1px solid var(--border-color)', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.3)', minHeight: '42px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 700, marginRight: '0.15rem' }}>Peso</span>
            {rotationGroups.map(g => (
              <label key={g.name} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0, letterSpacing: 0, fontSize: '0.72rem', color: GROUP_COLORS[g.name] || '#fff', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filterGroups.includes(g.name)}
                  onChange={() => toggleFilterGroup(g.name)}
                  style={{ width: '12px', height: '12px', margin: 0 }}
                />
                {g.name}
              </label>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ padding: '0.6rem', width: '165px', fontSize: '0.85rem' }}
          >
            <option value="artista">Artista (A→Z)</option>
            <option value="nome">Música (A→Z)</option>
            <option value="data_desc">Mais Recente</option>
            <option value="data_asc">Mais Antiga</option>
            <option value="peso_desc">Maior Peso</option>
            <option value="peso_asc">Menor Peso</option>
            <option value="vibe_desc">Maior Vibe</option>
            <option value="duracao_desc">Mais Longa</option>
          </select>
          <button className="secondary-btn" onClick={clearLibraryFilters} style={{ padding: '0.55rem 0.8rem', fontSize: '0.78rem', marginLeft: 'auto' }}>Limpar filtros</button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', order: 1 }}>
          <button
            onClick={handleSync}
            className={`primary ${isBusy ? 'pulse' : ''}`}
            style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', width: 'auto' }}
            disabled={isBusy}
          >
            {isBusy ? '...' : 'SINCRONIZAR'}
          </button>
          <button onClick={fetchLibrary} className="secondary-btn" style={{ padding: '0.6rem 1rem' }}><RefreshCw size={16} /></button>
        </div>
      </div>

      {/* Barra de Ações em Lote */}
      <div style={{ display: 'none' }}>
        <button className="secondary-btn" onClick={() => applyLibraryPreset('recent')} style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem' }}>Recém adicionadas</button>
        <button className="secondary-btn" onClick={() => applyLibraryPreset('priority')} style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem' }}>Candidatas TOP/HIT</button>
        <button className="secondary-btn" onClick={() => applyLibraryPreset('old')} style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem' }}>Rebaixadas OLD</button>
        <button className="secondary-btn" onClick={() => applyLibraryPreset('duplicates')} style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem' }}>Possíveis repetidas</button>
        <button className="secondary-btn" onClick={clearLibraryFilters} style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem', marginLeft: 'auto' }}>Limpar filtros</button>
      </div>

      {showDuplicates && (
        <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,170,0,0.35)', background: 'rgba(255,170,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: duplicateGroups.length ? '0.8rem' : 0 }}>
            <strong style={{ color: '#ffaa00', fontSize: '0.9rem' }}>Possíveis repetidas</strong>
            <button onClick={() => setShowDuplicates(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.7 }}><X size={16} /></button>
          </div>
          {duplicateGroups.length === 0 ? (
            <div style={{ fontSize: '0.85rem', opacity: 0.65 }}>Nenhuma duplicada exata encontrada por artista + nome.</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.45rem', maxHeight: '180px', overflowY: 'auto' }}>
              {duplicateGroups.map(group => (
                <div key={`${group.artista}-${group.nome}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.85rem', padding: '0.45rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span><strong>{group.artista}</strong> - {group.nome}</span>
                  <span style={{ color: '#ffaa00', fontWeight: 800 }}>{group.total}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedTracks.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem 1.2rem', marginBottom: '1rem', background: 'rgba(188,19,254,0.15)', borderRadius: '10px', border: '1px solid rgba(188,19,254,0.4)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#bc13fe' }}>{selectedTracks.size} selecionadas</span>
          <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>Mover para:</span>
          {rotationGroups.map(g => (
            <button key={g.name} onClick={() => handleBatchUpdate(g.name)}
              style={{ padding: '0.3rem 0.8rem', fontSize: '0.78rem', fontWeight: 700, borderRadius: '6px', border: `1px solid ${GROUP_COLORS[g.name] || '#666'}`, background: 'transparent', color: GROUP_COLORS[g.name] || '#666', cursor: 'pointer' }}>
              {g.name}
            </button>
          ))}

          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }}></div>

          <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>Peso:</span>
          {[0.5, 1.0, 1.5, 2.0, 2.5].map(w => (
            <button key={w} onClick={() => handleBatchUpdate(null, w)}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', fontWeight: 700, borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer' }}>
              {w.toFixed(1)}
            </button>
          ))}

          <button onClick={() => setSelectedTracks(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}><X size={16} /></button>
        </div>
      )}

      <div style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: '600px' }}>
        <table className="lib-table" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: 'none' }}>
              <th style={{ width: '105px', textAlign: 'center', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" onChange={toggleSelectAll} checked={selectedTracks.size === library.length && library.length > 0} style={{ width: '14px', height: '14px', flex: '0 0 auto' }} />
                  <span>PLAY</span>
                </div>
              </th>
              <th style={{ width: '300px', textAlign: 'left', padding: '1rem' }}>ARTISTA</th>
              <th style={{ textAlign: 'left', padding: '1rem' }}>MÚSICA</th>
              <th style={{ width: '90px', textAlign: 'left', padding: '1rem' }}>PASTA</th>
              <th style={{ width: '82px', textAlign: 'center', padding: '1rem' }}>TEMPO</th>
              <th style={{ width: '105px', textAlign: 'left', padding: '1rem' }}>GRUPO</th>
              <th style={{ width: '75px', textAlign: 'left', padding: '1rem' }}>PESO</th>
              <th style={{ width: '78px', textAlign: 'left', padding: '1rem' }}>VIBE</th>
            </tr>
          </thead>
          <tbody>
            {library.map((track) => {
              const vibeInfo = getVibeInfo(track.vibe)
              const groupColor = GROUP_COLORS[track.sub_categoria] || '#666'
              return (
              <tr
                key={track.id}
                style={{
                  background: selectedTracks.has(track.id) ? 'rgba(188,19,254,0.08)' : undefined,
                  borderLeft: `4px solid ${groupColor}`
                }}
              >
                <td style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={selectedTracks.has(track.id)} onChange={() => toggleTrackSelection(track.id)} style={{ width: '14px', height: '14px' }} />
                  <button className="play-btn" onClick={() => playTrack(track)} disabled={isPlayerLoading}>
                    {isPlayerLoading && currentTrack?.id === track.id
                      ? <RefreshCw size={14} className="pulse" />
                      : currentTrack?.id === track.id && isAudioPlaying
                        ? <Pause size={14} fill="currentColor" />
                        : <Play size={14} fill="currentColor" />}
                  </button>
                </td>
                <td onClick={() => openTrackDetails(track)} style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} title={track.artista}>{track.artista}</td>
                <td onClick={() => openTrackDetails(track)} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }} title={track.nome}>{track.nome}</td>
                <td style={{ fontSize: '0.75rem', opacity: 0.7 }}>{track.categoria}</td>
                <td style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.8, textAlign: 'center' }}>{formatDuration(track.duracao)}</td>
                <td>
                  <select
                    value={track.sub_categoria || 'STD'}
                    onChange={e => handleUpdateMetadata(track.id, 'sub_categoria', e.target.value)}
                    style={{ padding: '0.3rem', width: '90px', fontSize: '0.75rem', textAlign: 'center', background: 'rgba(0,0,0,0.3)', color: GROUP_COLORS[track.sub_categoria] || '#fff', fontWeight: 700, border: `1px solid ${GROUP_COLORS[track.sub_categoria] || '#444'}`, borderRadius: '6px' }}
                  >
                    {rotationGroups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    key={`${track.id}-${track.peso}`}
                    defaultValue={Number(track.peso || 1.0).toFixed(1)}
                    onBlur={e => handleUpdateMetadata(track.id, 'weight', e.target.value)}
                    style={{ padding: '0.3rem', width: '55px', fontSize: '0.75rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)' }}
                  />
                </td>
                <td>
                  <span style={{ color: vibeInfo.color, border: `1px solid ${vibeInfo.color}`, borderRadius: '999px', padding: '0.2rem 0.45rem', fontSize: '0.72rem', fontWeight: 800 }}>
                    {Math.round(track.vibe) || 0}
                  </span>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
        {library.length === 0 && !libLoading && (
          <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
            Nenhuma música encontrada com os filtros atuais.
          </div>
        )}
        {libLoading && (
          <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
            <RefreshCw size={20} className="pulse" /> Carregando...
          </div>
        )}
      </div>

      {/* Controles de Paginação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>
          Página {libPage} de {libPages} · {libTotal.toLocaleString('pt-BR')} músicas no total
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => { const p = Math.max(1, libPage - 1); setLibPage(p); fetchLibrary({ page: p }) }}
            disabled={libPage <= 1}
            style={{ padding: '0.4rem 0.9rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: libPage <= 1 ? 'not-allowed' : 'pointer', opacity: libPage <= 1 ? 0.4 : 1 }}
          >← Anterior</button>
          {Array.from({ length: Math.min(5, libPages) }, (_, i) => {
            const start = Math.max(1, Math.min(libPage - 2, libPages - 4))
            const p = start + i
            return (
              <button key={p} onClick={() => { setLibPage(p); fetchLibrary({ page: p }) }}
                style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: `1px solid ${p === libPage ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}`, background: p === libPage ? 'rgba(0,242,255,0.1)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', fontWeight: p === libPage ? 700 : 400, color: p === libPage ? 'var(--accent-color)' : 'inherit' }}>
                {p}
              </button>
            )
          })}
          <button
            onClick={() => { const p = Math.min(libPages, libPage + 1); setLibPage(p); fetchLibrary({ page: p }) }}
            disabled={libPage >= libPages}
            style={{ padding: '0.4rem 0.9rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: libPage >= libPages ? 'not-allowed' : 'pointer', opacity: libPage >= libPages ? 0.4 : 1 }}
          >Próxima →</button>
        </div>
      </div>
    </div>
  )

  const renderSettings = () => (
    <div className="config-section glass card">
      <h2 className="card-title"><Settings size={20} /> Configurações Avançadas</h2>

      <section style={{ marginBottom: '3rem' }}>
        <h3>Vibe Padrão dos Blocos</h3>
        <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: '1rem' }}>Define a faixa de vibe usada ao criar novos blocos e novos modelos .blmn.</p>
        <div className="config-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', maxWidth: '520px' }}>
          <div className="input-group">
            <label>Vibe mínima</label>
            <input type="number" min="0" max="100" value={defaultVibeMin} onChange={e => setDefaultVibeMin(Math.max(0, Math.min(100, Number(e.target.value))))} />
          </div>
          <div className="input-group">
            <label>Vibe máxima</label>
            <input type="number" min="0" max="100" value={defaultVibeMax} onChange={e => setDefaultVibeMax(Math.max(0, Math.min(100, Number(e.target.value))))} />
          </div>
        </div>
      </section>

      <section style={{ marginBottom: '3rem' }}>
        <h3>🎚️ Grupos de Rotação</h3>
        <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: '1rem' }}>Define os thresholds de peso de cada grupo. Novos arquivos entram como STD.</p>
        <table className="config-table">
          <thead><tr><th>Grupo</th><th>Peso Mínimo (para entrar)</th><th>Peso Base (ao mudar pro grupo)</th></tr></thead>
          <tbody>
            {rotationGroups.map((g, i) => (
              <tr key={i}>
                <td><span style={{ fontWeight: 800, color: GROUP_COLORS[g.name] || '#fff' }}>{g.name}</span></td>
                <td><input type="number" step="0.1" value={g.min_weight} onChange={e => { const next = [...rotationGroups]; next[i] = { ...g, min_weight: parseFloat(e.target.value) }; setRotationGroups(next) }} /></td>
                <td><input type="number" step="0.1" value={g.base_weight} onChange={e => { const next = [...rotationGroups]; next[i] = { ...g, base_weight: parseFloat(e.target.value) }; setRotationGroups(next) }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: '3rem' }}>
        <h3>📅 Modelos por Dia da Semana (.blmn)</h3>
        <div className="config-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
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

      <section style={{ marginBottom: '3rem' }}>
        <h3>🌟 Artistas Favoritos</h3>
        <div className="tag-list">
          {favoriteArtists.map(artist => (
            <div key={artist} className="tag">
              {artist}
              <button onClick={() => removeArtist(artist)}><X size={12} /></button>
            </div>
          ))}
        </div>
        <button className="secondary-btn" onClick={addArtist} style={{ marginTop: '1rem' }}>+ Adicionar Artista</button>
      </section>

      <section style={{ marginBottom: '3rem' }}>
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
                <td><button className="remove-row-btn" onClick={() => removePaidRule(i)}><X size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="add-row-btn" onClick={addPaidRule}>+ Nova Regra</button>
      </section>

      <section style={{ marginBottom: '3rem' }}>
        <h3>🎵 Categoria Padrão</h3>
        <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: '1rem' }}>Selecione qual categoria de música deve vir como padrão ao adicionar um novo item no Gerenciador BLM.</p>
        <div className="input-group" style={{ maxWidth: '300px' }}>
          <select value={defaultCategory} onChange={e => setDefaultCategory(e.target.value)}>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
      </section>

      <section style={{ marginBottom: '3rem' }}>
        <h3>🎨 Cores de Identificação</h3>
        <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: '1rem' }}>As cores abaixo serão usadas como fundo das linhas no Gerenciador BLM.</p>
        <div className="config-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          {Object.entries(typeColors).map(([type, color]) => (
            <div key={type} className="input-group">
              <label>{type}</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" value={toHexColor(color, '#333333')} onChange={e => setTypeColors({ ...typeColors, [type]: e.target.value.toUpperCase() })} style={{ width: '40px', height: '40px', padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }} />
                <input
                  type="text"
                  value={color}
                  placeholder="#00F2FF"
                  onChange={e => setTypeColors({ ...typeColors, [type]: e.target.value.toUpperCase() })}
                  onBlur={e => setTypeColors({ ...typeColors, [type]: toHexColor(e.target.value, color) })}
                  style={{ flex: 1, textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace' }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: '3rem' }}>
        <h3>📂 Caminhos Globais</h3>
        <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: '1rem' }}>Pastas centrais usadas para importar biblioteca e processar roteiro.</p>
        <div className="config-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          {['MUSIC_ROOT', 'PREFIXO', 'VINHETA', 'MODELOS', 'ROTEIROS'].map((key) => (
            <div key={key} className="input-group">
              <label>{key}</label>
              <input type="text" value={editablePaths[key] || ''} onChange={e => setEditablePaths({ ...editablePaths, [key]: e.target.value })} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>🧩 Variáveis Personalizadas (Outros)</h3>
        <p style={{ opacity: 0.6, fontSize: '0.85rem', marginBottom: '1rem' }}>Crie novos mapeamentos de pastas para aparecerem no Gerenciador BLM.</p>
        <table className="config-table">
          <thead>
            <tr>
              <th style={{ width: '25%' }}>Nome (Ex: Chamadas)</th>
              <th>Caminho do Diretório / Arquivo</th>
              <th style={{ width: '170px' }}>Cor HEX</th>
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {customVars.map((cv, i) => (
              <tr key={i}>
                <td><input type="text" value={cv.name} onChange={e => { const next = [...customVars]; next[i].name = e.target.value.toUpperCase(); setCustomVars(next) }} placeholder="EX: PROGRAMETES" /></td>
                <td><input type="text" value={cv.path} onChange={e => { const next = [...customVars]; next[i].path = e.target.value; setCustomVars(next) }} placeholder="U:\Materiais\..." /></td>
                <td>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input type="color" value={toHexColor(cv.color || '#333333')} onChange={e => { const next = [...customVars]; next[i].color = e.target.value.toUpperCase(); setCustomVars(next) }} style={{ width: '38px', height: '34px', padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }} />
                    <input
                      type="text"
                      value={cv.color || '#333333'}
                      placeholder="#333333"
                      onChange={e => { const next = [...customVars]; next[i].color = e.target.value.toUpperCase(); setCustomVars(next) }}
                      onBlur={e => { const next = [...customVars]; next[i].color = toHexColor(e.target.value, '#333333'); setCustomVars(next) }}
                      style={{ fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase' }}
                    />
                  </div>
                </td>
                <td><button className="remove-row-btn" onClick={() => setCustomVars(customVars.filter((_, idx) => idx !== i))}><X size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="add-row-btn" onClick={() => setCustomVars([...customVars, { name: '', path: '', color: '#333333' }])}>+ Nova Variável</button>
      </section>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
        <button className="primary" onClick={handleSaveConfig} disabled={isBusy}>
          {isBusy ? "SALVANDO..." : "SALVAR TUDO"}
        </button>
        <button className="secondary-btn" onClick={handleResetHistory} style={{ background: 'rgba(255,45,85,0.1)', color: '#ff2d55', borderColor: 'rgba(255,45,85,0.3)', padding: '0 1.5rem' }}>
          🔄 BIG BANG (Semear Histórico)
        </button>
      </div>
    </div>
  )

  const renderBLMList = () => (
    <div className="blm-list-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ClipboardList size={28} color="var(--accent-color)" /> Bibliotecas de Programação
          </h2>
          <p style={{ opacity: 0.6, fontSize: '0.95rem', marginTop: '6px' }}>Gerencie seus modelos de grade horária (.blmn)</p>
        </div>
        <button className="primary-btn" onClick={() => setShowNewModelModal(true)} style={{ padding: '0.8rem 1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={20} /> NOVO MODELO
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {availableTemplates.map(t => (
          <div key={t} className="glass card hover-scale" onClick={() => fetchBLMContent(t)} style={{
            cursor: 'pointer',
            padding: '1.5rem',
            border: '1px solid rgba(255,255,255,0.05)',
            transition: 'all 0.3s ease',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--accent-color)' }}></div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(0,242,255,0.1)', padding: '10px', borderRadius: '10px' }}>
                  <FileText size={24} color="var(--accent-color)" />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</div>
              </div>

              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={(e) => handleDuplicateBLM(e, t)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', padding: '6px', borderRadius: '6px', cursor: 'pointer', opacity: 0.6 }}
                  title="Duplicar"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={(e) => handleDeleteBLM(e, t)}
                  style={{ background: 'rgba(255,68,68,0.1)', border: 'none', color: '#ff4444', padding: '6px', borderRadius: '6px', cursor: 'pointer', opacity: 0.6 }}
                  title="Excluir"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
              <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{t.toLowerCase().endsWith('.blmn') ? 'MODELO BLMN' : 'MODELO BEAUDIO'}</span>
              <button className="secondary-btn" style={{ padding: '4px 12px', fontSize: '0.7rem' }}>EDITAR ROTEIRO</button>
            </div>
          </div>
        ))}
      </div>

      {availableTemplates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem', opacity: 0.4 }}>
          <ClipboardList size={48} style={{ marginBottom: '1rem' }} />
          <p>Nenhum modelo .blmn encontrado na pasta de roteiros.</p>
        </div>
      )}
    </div>
  )

  const renderBLMEditor = () => {
    if (!blmContent) return null
    return (
      <div className="blm-editor">
        {blmStats && (
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div className="blm-stats-bar" style={{ display: 'flex', gap: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.85rem', flex: 1 }}>
              <div><span style={{ opacity: 0.6 }}>Músicas:</span> <strong style={{ color: 'var(--accent-color)' }}>{blmStats.music_slots}</strong></div>
              <div><span style={{ opacity: 0.6 }}>Vinhetas:</span> <strong style={{ color: '#bc13fe' }}>{blmStats.sweeper_slots}</strong></div>
              <div><span style={{ opacity: 0.6 }}>Comerciais:</span> <strong style={{ color: '#ffaa00' }}>{blmStats.commercial_blocks}</strong></div>
              <div><span style={{ opacity: 0.6 }}>Horários:</span> <strong>{blmContent.blocks.length}</strong></div>
            </div>
            <button className="secondary-btn" onClick={() => {
              const time = prompt("Digite o horário (HH:MM):", "00:00")
              if (time && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
                addBLMBlock(time)
              } else if (time) {
                alert("Formato inválido! Use HH:MM")
              }
            }}>+ ADICIONAR BLOCO</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxHeight: '75vh', overflowY: 'auto', paddingRight: '1rem' }}>
          {blmContent.blocks.map((block, bIdx) => {
            const blockKey = `${block.time}-${bIdx}`
            const isExpanded = expandedBlmBlocks.has(blockKey)
            return (
            <div key={block.time} className="blm-block-card glass" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button
                    onClick={() => toggleBlmBlock(blockKey)}
                    className="secondary-btn"
                    style={{ padding: '4px', minWidth: '28px', justifyContent: 'center' }}
                    title={isExpanded ? 'Recolher bloco' : 'Expandir bloco'}
                  >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <h3 style={{ color: 'var(--accent-color)', margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>🕒 Bloco das {block.time}</h3>
                  <button onClick={() => copyBlock(block)} className="secondary-btn" style={{ padding: '4px 8px', fontSize: '0.7rem' }} title="Copiar Estrutura">COPIAR</button>
                  <button onClick={() => pasteBlock(bIdx)} className="secondary-btn" style={{ padding: '4px 8px', fontSize: '0.7rem' }} title="Colar aqui">COLAR</button>
                  <button
                    onClick={() => removeBLMBlock(bIdx)}
                    style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', opacity: 0.5, display: 'flex', alignItems: 'center' }}
                    title="Excluir Bloco"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <label style={{ fontSize: '0.72rem', opacity: 0.65 }}>Vibe</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={block.vibe_min ?? defaultVibeMin}
                    onChange={e => updateBlockVibe(bIdx, 'vibe_min', e.target.value)}
                    style={{ width: '64px', padding: '0.35rem', fontSize: '0.75rem', textAlign: 'center' }}
                  />
                  <span style={{ opacity: 0.5 }}>até</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={block.vibe_max ?? defaultVibeMax}
                    onChange={e => updateBlockVibe(bIdx, 'vibe_max', e.target.value)}
                    style={{ width: '64px', padding: '0.35rem', fontSize: '0.75rem', textAlign: 'center' }}
                  />
                  <button className="secondary-btn" onClick={() => addBLMItem(bIdx, -1)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>+ ADICIONAR ITEM</button>
                </div>
              </div>

              {isExpanded ? (
              <table className="lib-table" style={{ tableLayout: 'fixed', marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: '30px' }}></th>
                    <th style={{ width: '40px' }}>#</th>
                    <th style={{ width: '180px' }}>TIPO</th>
                    <th style={{ textAlign: 'left' }}>RECURSO / MODELO</th>
                    <th style={{ width: '90px' }}>MIX (ms)</th>
                    <th style={{ width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {block.items.map((item, iIdx) => {
                    const type = getItemType(item.resource)
                    const isInvalid = type === 'INVALID'

                    let typeColor = 'rgba(255,255,255,0.05)'
                    if (isInvalid) typeColor = '#ff4444'
                    else if (type === 'MUSICA') typeColor = typeColors.MUSICA
                    else if (type === 'VHT') typeColor = typeColors.VHT
                    else if (type === 'RESERVA') typeColor = typeColors.RESERVA
                    else if (type === 'PREFIXO') typeColor = typeColors.PREFIXO
                    else if (type.startsWith('OUTRO_')) {
                      const cvName = type.replace('OUTRO_', '')
                      const cv = customVars.find(c => c.name === cvName)
                      if (cv && cv.color) typeColor = cv.color
                    }

                    const textColor = isInvalid ? '#ff4444' : getVisibleColor(typeColor)
                    // Base de vidro mais "leitosa" para garantir que apareça em qualquer cor
                    const rowBg = isInvalid ? 'rgba(255,0,0,0.15)' : `linear-gradient(90deg, ${typeColor}30 0%, rgba(255,255,255,0.07) 100%)`

                    return (
                      <tr
                        key={iIdx}
                        draggable={!isInvalid}
                        onDragStart={() => onDragStart(bIdx, iIdx)}
                        onDragOver={onDragOver}
                        onDrop={() => onDrop(bIdx, iIdx)}
                        style={{
                          background: rowBg,
                          color: textColor,
                          cursor: isInvalid ? 'not-allowed' : 'move',
                          borderLeft: `4px solid ${typeColor}`,
                          backdropFilter: 'blur(10px)',
                          borderBottom: '1px solid rgba(255,255,255,0.05)'
                        }}
                      >
                        <td style={{ opacity: 0.5 }}>
                          {isInvalid ? <AlertTriangle size={14} color="#ff4444" /> : <Layout size={12} />}
                        </td>
                        <td style={{ fontSize: '0.7rem', opacity: 0.6 }}>{iIdx + 1}</td>
                        <td>
                          <select
                            value={isInvalid ? 'INVALID' : type}
                            onChange={e => handleTypeChange(bIdx, iIdx, e.target.value)}
                            style={{
                              width: '100%',
                              background: 'rgba(0,0,0,0.2)',
                              border: 'none',
                              fontSize: '0.75rem',
                              padding: '4px',
                              borderRadius: '4px',
                              color: textColor,
                              opacity: 1
                            }}
                          >
                            {isInvalid && <option value="INVALID">⚠️ DESCONHECIDO</option>}
                            <option value="MUSICA">MÚSICA / GRUPO</option>
                            <option value="VHT">VINHETA</option>
                            <option value="RESERVA">RESERVA BEMÍDIA</option>
                            <option value="PREFIXO">PREFIXO FIXO</option>
                            {customVars.length > 0 && (
                              <optgroup label="VARIÁVEIS PERSONALIZADAS">
                                {customVars.map(cv => <option key={cv.name} value={`OUTRO_${cv.name}`}>{cv.name}</option>)}
                              </optgroup>
                            )}
                          </select>
                        </td>
                        <td>
                          {isInvalid ? (
                            <div style={{ fontSize: '0.8rem', opacity: 0.8, fontStyle: 'italic' }}>
                              {item.resource} (Não mapeado)
                            </div>
                          ) : type === 'MUSICA' ? (() => {
                            const resStr = item.resource.replace('.apm', '')
                            const hasUnderscore = resStr.includes('_')
                            const catName = hasUnderscore ? resStr.split('_')[0] : resStr
                            const letters = hasUnderscore ? resStr.split('_')[1] : 'THSO'
                            const checks = {
                              T: letters.includes('T'),
                              H: letters.includes('H'),
                              S: letters.includes('S'),
                              O: letters.includes('O')
                            }
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <select
                                  value={catName}
                                  onChange={e => updateMusicResource(bIdx, iIdx, e.target.value, letters, null)}
                                  style={{ flex: 1, background: 'none', border: 'none', fontSize: '1rem', color: textColor, fontWeight: 800, textTransform: 'uppercase' }}
                                >
                                  {categories.map(cat => <option key={cat} value={cat} style={{ color: '#fff', background: '#111' }}>{cat}</option>)}
                                </select>
                                <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px 4px', borderRadius: '4px' }}>
                                  {['T', 'H', 'S', 'O'].map(l => (
                                    <label key={l} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.65rem', cursor: 'pointer', opacity: checks[l] ? 1 : 0.2 }}>
                                      <input type="checkbox" checked={checks[l]} onChange={() => updateMusicResource(bIdx, iIdx, catName, letters, l)} style={{ margin: 0, width: '10px', height: '10px' }} /> {l}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )
                          })() : type.startsWith('OUTRO_') ? (() => {
                            const cvName = type.replace('OUTRO_', '')
                            const cv = customVars.find(c => c.name === cvName)
                            const path = (cv?.path || '').trim()
                            const isFile = path && path.match(/\.(mp3|wav|flac|m4a|aac|mp4|m4v)\s*$/i)

                            if (isFile) {
                              return <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{item.resource}</span>
                            }

                            const files = customFiles[cvName] || []
                            const currentFile = item.resource === `${cvName}.apm` ? 'RANDOM' : item.resource.replace(/.*[/\\]/, '')

                            const handleOutroChange = (e) => {
                              const val = e.target.value
                              if (val === 'RANDOM') {
                                updateBLMItem(bIdx, iIdx, 'resource', `${cvName}.apm`)
                              } else {
                                const cvPath = cv ? cv.path.replace(/[/\\]$/, '') : ''
                                updateBLMItem(bIdx, iIdx, 'resource', `${cvPath}\\${val}`)
                              }
                            }

                            return (
                              <select
                                value={currentFile}
                                onChange={handleOutroChange}
                                style={{
                                  width: '100%',
                                  background: 'rgba(0,0,0,0.2)',
                                  border: 'none',
                                  fontSize: '0.85rem',
                                  padding: '4px',
                                  borderRadius: '4px',
                                  color: textColor,
                                  fontWeight: 800
                                }}
                              >
                                <option value="RANDOM" style={{ color: '#fff', background: '#111' }}>Aleatório (Pasta Inteira)</option>
                                {files.map(f => <option key={f} value={f} style={{ color: '#fff', background: '#111' }}>{f}</option>)}
                              </select>
                            )
                          })() : type === 'CAMINHO' ? (
                            <input
                              type="text"
                              value={item.resource}
                              onChange={e => updateBLMItem(bIdx, iIdx, 'resource', e.target.value)}
                              style={{ width: '100%', background: 'none', border: 'none', fontSize: '0.9rem', color: textColor }}
                            />
                          ) : (
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                              {item.resource}
                            </span>
                          )}
                        </td>
                        <td>
                          <input
                            type="text"
                            value={item.mix ?? item.params?.m ?? '3000'}
                            onChange={e => updateBLMItem(bIdx, iIdx, 'mix', e.target.value)}
                            style={{
                              width: '100%',
                              background: 'rgba(0,0,0,0.2)',
                              border: 'none',
                              textAlign: 'center',
                              fontSize: '0.8rem',
                              padding: '4px',
                              borderRadius: '4px',
                              color: textColor,
                              opacity: 1
                            }}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            {!isInvalid && (
                              <button
                                className="secondary-btn"
                                style={{ padding: '2px', minWidth: '24px', background: 'rgba(0,0,0,0.2)', border: 'none', color: textColor }}
                                title="Adicionar Abaixo"
                                onClick={() => addBLMItem(bIdx, iIdx)}
                              >
                                <Plus size={12} />
                              </button>
                            )}
                            <button
                              className="secondary-btn"
                              style={{ padding: '2px', minWidth: '24px', background: 'rgba(0,0,0,0.2)', border: 'none', color: isInvalid ? '#ff4444' : textColor }}
                              onClick={() => removeBLMItem(bIdx, iIdx)}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              ) : (
                <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Bloco recolhido · {block.items.length} itens
                </div>
              )}
            </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderNewModelModal = () => {
    if (!showNewModelModal) return null
    return (
      <div className="modal-overlay glass" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)' }}>
        <div className="modal-content glass card" style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
            <h2 className="card-title" style={{ margin: 0 }}><Plus size={20} /> Criar Novo Modelo</h2>
            <button onClick={() => setShowNewModelModal(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={24} /></button>
          </div>
          <div className="input-group">
            <label>Nome do Modelo (sem .blmn)</label>
            <input type="text" value={newModelName} onChange={e => setNewModelName(e.target.value)} placeholder="Ex: MANHA_SERTANEJA" />
          </div>
          <div className="input-group">
            <label>Intervalo de Blocos</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {['10', '20', '30', 'custom'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setNewModelInterval(opt)}
                  className={`secondary-btn ${newModelInterval === opt ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', background: newModelInterval === opt ? 'var(--accent-color)' : undefined, color: newModelInterval === opt ? '#000' : undefined }}
                >
                  {opt === 'custom' ? 'PERSONALIZADO' : `${opt} MIN`}
                </button>
              ))}
            </div>
          </div>
          {newModelInterval === 'custom' && (
            <div style={{ marginTop: '2rem' }}>
              <label>Selecione os Horários na Grade</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px' }}>
                {Array.from({ length: 24 }, (_, h) => (
                  Array.from({ length: 6 }, (_, m) => {
                    const time = `${h.toString().padStart(2, '0')}:${(m * 10).toString().padStart(2, '0')}`
                    const isSelected = selectedCustomSlots.has(time)
                    return (
                      <button
                        key={time}
                        onClick={() => toggleCustomSlot(time)}
                        style={{
                          padding: '0.4rem',
                          fontSize: '0.75rem',
                          borderRadius: '4px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: isSelected ? 'var(--accent-color)' : 'rgba(0,0,0,0.2)',
                          color: isSelected ? '#000' : '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        {time}
                      </button>
                    )
                  })
                ))}
              </div>
            </div>
          )}
          <button className="primary" onClick={handleCreateNewModel} style={{ marginTop: '2rem' }}>
            CRIAR E EDITAR MODELO
          </button>
        </div>
      </div>
    )
  }

  const renderBLMEditorModal = () => {
    if (!showEditor || !blmContent) return null

    return (
      <div className="modal-overlay" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(15px)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.3s ease-out'
      }}>
        {/* Header do Modal */}
        <div style={{
          padding: '1.5rem 2rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.03)'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#00f2ff', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ClipboardList size={24} /> EDITOR DE MODELO: {selectedBLM}
            </h2>
            <p style={{ margin: '4px 0 0 36px', opacity: 0.6, fontSize: '0.85rem' }}>Gerencie blocos, músicas e vinhetas com precisão beAudio.</p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="secondary-btn" onClick={() => { setShowEditor(false); setBlmContent(null); }} style={{ padding: '0.8rem 1.5rem' }}>
              CANCELAR
            </button>
            <button className="primary-btn" onClick={handleSaveBLM} style={{ padding: '0.8rem 2rem', background: 'linear-gradient(135deg, #00f2ff 0%, #00d1dc 100%)', color: '#000', fontWeight: 800 }}>
              SALVAR MODELO
            </button>
          </div>
        </div>

        {/* Área de Conteúdo */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '2rem'
        }}>
          {renderBLMEditor()}
        </div>

        {/* Loading de Bloqueio Interno */}
        {isBusy && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 3000,
            backdropFilter: 'blur(5px)'
          }}>
            <RefreshCw className="spin" size={48} color="#00f2ff" />
            <p style={{ marginTop: '1rem', fontWeight: 600, color: '#00f2ff' }}>PROCESSANDO MODELO...</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app-container">
      {renderBLMEditorModal()}
      {renderNewModelModal()}
      {renderTrackDetailsModal()}

      <BusyBanner visible={isBackendBusy && !showEditor} />
      <AppHeader />
      <TabNav activeTab={activeTab} onChange={setActiveTab} />

      <main>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'stats' && renderStats()}
        {activeTab === 'library' && renderLibrary()}
        {activeTab === 'blm_manager' && renderBLMList()}
        {activeTab === 'settings' && renderSettings()}
      </main>

      <FloatingPlayer currentTrack={currentTrack} audioRef={audioRef} onClose={() => { audioRef.current?.pause(); setIsAudioPlaying(false); setCurrentTrack(null) }} />

      {toastMessage && (
        <div className="toast">
          {toastMessage}
        </div>
      )}
    </div>
  )
}

export default App
