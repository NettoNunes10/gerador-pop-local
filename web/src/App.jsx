import { useState, useEffect, useRef } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip
} from 'recharts'
import { Play, BarChart2, Music, Layout, Database, RefreshCw, X, Search, Trash2, Plus, Save, AlertTriangle, FileText, Edit2, Copy, Settings, ClipboardList, BookOpen } from 'lucide-react'
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
  const [filterGroup, setFilterGroup] = useState('')

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [bpm, setBpm] = useState('')
  const [sortBy, setSortBy] = useState('artista')

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

  // Player State
  const [currentTrack, setCurrentTrack] = useState(null)
  const [isPlayerLoading, setIsPlayerLoading] = useState(false)
  const audioRef = useRef(null)

  // Config & App State
  const [customVars, setCustomVars] = useState([])
  const [customFiles, setCustomFiles] = useState({})
  const [defaultCategory, setDefaultCategory] = useState('SERTANEJO')
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
      setCustomVars(data.custom_vars || [])
      if (data.custom_vars) {
        data.custom_vars.forEach(cv => {
          const path = (cv.path || '').trim()
          if (path && !path.match(/\.(mp3|wav|flac|m4a|mp4|m4v)\s*$/i)) {
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
      if (data.type_colors) setTypeColors(data.type_colors)
    } catch {
      setIsOffline(true)
    }
  }

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const fetchLibrary = async (opts = {}) => {
    setLibLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', opts.page ?? libPage)
      params.set('limit', LIB_LIMIT)
      if (opts.search ?? searchTerm) params.set('search', opts.search ?? searchTerm)
      if (opts.category ?? filterCategory) params.set('category', opts.category ?? filterCategory)
      if (opts.group ?? filterGroup) params.set('group', opts.group ?? filterGroup)
      if (opts.bpm ?? bpm) params.set('bpm', opts.bpm ?? bpm)
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
  }, [filterCategory, filterGroup, bpm, sortBy])

  useEffect(() => {
    const el = logContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

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
          setBlmContent(data)
          setBlmStats(data.stats || null)
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

    try {
      const res = await fetch(`${API_URL}/blm/${selectedBLM}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ header: blmContent.header, lines: flatLines })
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
    const newName = window.prompt(`Digite o nome para a cópia de "${filename}":`, filename.replace('.blm', '_COPIA'))
    if (!newName) return

    const finalName = newName.endsWith('.blm') ? newName : newName + '.blm'

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

      // 3. Salva com o novo nome
      const resSave = await safeFetch(`${API_URL}/blm/${finalName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: flatLines })
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

    if (field.startsWith('param_')) {
      const pKey = field.split('_')[1]
      item.params = { ...item.params, [pKey]: value }
    } else {
      item[field] = value
    }

    setBlmContent({ ...blmContent, blocks: nextBlocks })
  }

  const addBLMItem = (blockIndex, itemIndex) => {
    const nextBlocks = [...blmContent.blocks]
    const newItem = {
      resource: (defaultCategory || 'SERTANEJO') + '.apm',
      params: { m: '3000', t: '0', i: '0', s: '0', f: '0', r: '0', d: '0', o: '2', n: '1', x: '  ', g: '0' }
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
    if (resTrim.match(/\.(mp3|wav|flac|m4a|mp4|m4v|blm)\s*$/i)) return 'INVALID'

    return 'CAMINHO'
  }

  const handleTypeChange = (blockIdx, itemIdx, newType) => {
    const nextBlocks = [...blmContent.blocks]
    const item = nextBlocks[blockIdx].items[itemIdx]

    switch (newType) {
      case 'RESERVA':
        item.resource = 'Reserva do beMidia'
        item.params = { ...item.params, o: '5', m: '4294967295', t: '0', i: '0', s: '0', f: '0', r: '0', d: '0', n: '1', x: '  ', g: '0' }
        break
      case 'VHT':
        item.resource = 'VINHETA.apm'
        item.params = { ...item.params, o: '2', m: '0', t: '0', i: '0', s: '0', f: '0', r: '0', d: '0', n: '1', x: '  ', g: '0' }
        break
      case 'PREFIXO':
        item.resource = editablePaths['PREFIXO'] || 'U:\\Materiais\\Eventos Gerais\\Prefixo\\PREFIXO POP FM.mp3'
        item.params = { ...item.params, o: '0', m: '1500', t: '0', i: '0', s: '0', f: '0', r: '0', d: '0', n: '1', x: '  ', g: '0' }
        break
      case 'MUSICA':
        item.resource = (defaultCategory || categories[0] || 'SERTANEJO') + '.apm'
        item.params = { ...item.params, o: '2', m: '3000', t: '0', i: '0', s: '0', f: '0', r: '0', d: '0', n: '1', x: '  ', g: '0' }
        break
      case 'CAMINHO':
        item.resource = ''
        item.params = { ...item.params, o: '0', m: '3000', t: '0', i: '0', s: '0', f: '0', r: '0', d: '0', n: '1', x: '  ', g: '0' }
        break
      default:
        if (newType.startsWith('OUTRO_')) {
          const name = newType.replace('OUTRO_', '')
          const cv = customVars.find(c => c.name === name)
          const path = (cv?.path || '').trim()
          if (path && path.match(/\.(mp3|wav|flac|m4a|mp4|m4v)\s*$/i)) {
            item.resource = path
          } else {
            item.resource = `${name}.apm`
          }
          item.params = { ...item.params, o: '2', m: '0', t: '0', i: '0', s: '0', f: '0', r: '0', d: '0', n: '1', x: '  ', g: '0' }
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
      items: [{ resource: 'Reserva do beMidia', params: { m: '4294967295', t: '0', i: '0', s: '0', f: '0', r: '0', d: '0', o: '5', n: '1', x: '  ', g: '0' } }]
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

  const handleCreateNewModel = () => {
    if (!newModelName) return alert("Digite um nome para o modelo")

    let finalName = newModelName
    if (!finalName.toLowerCase().endsWith('.blm')) finalName += '.blm'

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
      items: [{ resource: 'Reserva do beMidia', params: { m: '4294967295', t: '0', o: '5', n: '1' } }]
    }))

    setSelectedBLM(finalName)
    setBlmContent({
      header: "# Arquivo de roteiro da beAudio\t1\t550152196",
      blocks: newBlocks,
      orphan_lines: []
    })
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', gap: '1rem', flexWrap: 'wrap' }}>
        <h2 className="card-title" style={{ margin: 0 }}><Database size={20} /> Biblioteca ({libTotal.toLocaleString('pt-BR')} músicas)</h2>

        <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '400px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '0.6rem 1rem 0.6rem 2.5rem', fontSize: '0.85rem', width: '100%' }}
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
            value={bpm}
            onChange={e => setBpm(e.target.value)}
            style={{ padding: '0.6rem', width: '130px', fontSize: '0.85rem' }}
          >
            <option value="">Ritmo (BPM)</option>
            <option value="L">Lento (L)</option>
            <option value="M">Médio (M)</option>
            <option value="H">Rápido (H)</option>
          </select>
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value)}
            style={{ padding: '0.6rem', width: '110px', fontSize: '0.85rem' }}
          >
            <option value="">Grupo</option>
            {rotationGroups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ padding: '0.6rem', width: '155px', fontSize: '0.85rem' }}
          >
            <option value="artista">Artista (A→Z)</option>
            <option value="nome">Música (A→Z)</option>
            <option value="data_desc">Mais Recente</option>
            <option value="data_asc">Mais Antiga</option>
            <option value="peso_desc">Maior Peso</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
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
              <th style={{ width: '40px', padding: '1rem' }}><input type="checkbox" onChange={toggleSelectAll} checked={selectedTracks.size === library.length && library.length > 0} /></th>
              <th style={{ width: '55px', textAlign: 'left', padding: '1rem' }}>PLAY</th>
              <th style={{ width: '300px', textAlign: 'left', padding: '1rem' }}>ARTISTA</th>
              <th style={{ textAlign: 'left', padding: '1rem' }}>MÚSICA</th>
              <th style={{ width: '90px', textAlign: 'left', padding: '1rem' }}>PASTA</th>
              <th style={{ width: '105px', textAlign: 'left', padding: '1rem' }}>GRUPO</th>
              <th style={{ width: '70px', textAlign: 'left', padding: '1rem' }}>BPM</th>
              <th style={{ width: '75px', textAlign: 'left', padding: '1rem' }}>PESO</th>
              <th style={{ width: '45px', textAlign: 'center', padding: '1rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {library.map((track) => (
              <tr key={track.id} style={{ background: selectedTracks.has(track.id) ? 'rgba(188,19,254,0.08)' : undefined }}>
                <td><input type="checkbox" checked={selectedTracks.has(track.id)} onChange={() => toggleTrackSelection(track.id)} /></td>
                <td>
                  <button className="play-btn" onClick={() => playTrack(track)} disabled={isPlayerLoading}>
                    {isPlayerLoading && currentTrack?.id === track.id ? <RefreshCw size={14} className="pulse" /> : <Play size={14} fill="currentColor" />}
                  </button>
                </td>
                <td style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={track.artista}>{track.artista}</td>
                <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={track.nome}>{track.nome}</td>
                <td style={{ fontSize: '0.75rem', opacity: 0.7 }}>{track.categoria}</td>
                <td>
                  <select
                    value={track.sub_categoria || 'STD'}
                    onChange={e => handleUpdateMetadata(track.id, 'sub_categoria', e.target.value)}
                    style={{ padding: '0.3rem', width: '90px', fontSize: '0.75rem', textAlign: 'center', background: 'rgba(0,0,0,0.3)', color: GROUP_COLORS[track.sub_categoria] || '#fff', fontWeight: 700, border: `1px solid ${GROUP_COLORS[track.sub_categoria] || '#444'}`, borderRadius: '6px' }}
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
                    style={{ padding: '0.3rem', width: '55px', fontSize: '0.75rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)' }}
                  />
                </td>
                <td>
                  <button
                    onClick={() => handleDeleteTrack(track)}
                    style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', opacity: 0.5, transition: 'opacity 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
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
        <h3>📅 Modelos por Dia da Semana (.blm)</h3>
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="color" value={color} onChange={e => setTypeColors({ ...typeColors, [type]: e.target.value })} style={{ width: '40px', height: '40px', padding: '2px', background: 'none', border: 'none', cursor: 'pointer' }} />
                <input type="text" value={color} onChange={e => setTypeColors({ ...typeColors, [type]: e.target.value })} style={{ flex: 1, textTransform: 'uppercase' }} />
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
              <th style={{ width: '60px' }}>Cor</th>
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {customVars.map((cv, i) => (
              <tr key={i}>
                <td><input type="text" value={cv.name} onChange={e => { const next = [...customVars]; next[i].name = e.target.value.toUpperCase(); setCustomVars(next) }} placeholder="EX: PROGRAMETES" /></td>
                <td><input type="text" value={cv.path} onChange={e => { const next = [...customVars]; next[i].path = e.target.value; setCustomVars(next) }} placeholder="U:\Materiais\..." /></td>
                <td><input type="color" value={cv.color || '#333333'} onChange={e => { const next = [...customVars]; next[i].color = e.target.value; setCustomVars(next) }} style={{ width: '100%', height: '30px', padding: '0', background: 'none', border: 'none', cursor: 'pointer' }} /></td>
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
          <p style={{ opacity: 0.6, fontSize: '0.95rem', marginTop: '6px' }}>Gerencie seus modelos de grade horária (.blm)</p>
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
              <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>MODELO BEAUDIO</span>
              <button className="secondary-btn" style={{ padding: '4px 12px', fontSize: '0.7rem' }}>EDITAR ROTEIRO</button>
            </div>
          </div>
        ))}
      </div>

      {availableTemplates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem', opacity: 0.4 }}>
          <ClipboardList size={48} style={{ marginBottom: '1rem' }} />
          <p>Nenhum modelo .blm encontrado na pasta de roteiros.</p>
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
            <button className="primary" onClick={handleSaveBLM} disabled={isBusy} style={{ width: 'auto', padding: '0 1.5rem' }}>
              <Save size={16} style={{ marginRight: '8px' }} /> {isBusy ? 'SALVANDO...' : 'SALVAR MODELO'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxHeight: '75vh', overflowY: 'auto', paddingRight: '1rem' }}>
          {blmContent.blocks.map((block, bIdx) => (
            <div key={block.time} className="blm-block-card glass" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
                <button className="secondary-btn" onClick={() => addBLMItem(bIdx, -1)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}>+ ADICIONAR ITEM</button>
              </div>

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
                    const type = getItemType(item.resource, item.params.o)
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
                            const isFile = path && path.match(/\.(mp3|wav|flac|m4a|mp4|m4v)\s*$/i)

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
                            value={item.params.m || '0'}
                            onChange={e => updateBLMItem(bIdx, iIdx, 'param_m', e.target.value)}
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
            </div>
          ))}
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
            <label>Nome do Modelo (sem .blm)</label>
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

  const renderGuide = () => (
    <div className="guide-content glass card">
      <h2 className="card-title"><BookOpen size={20} /> Manual Técnico v3.4</h2>
      <div style={{ padding: '1rem' }}>
        <h3>1. Subcategorias (Tags)</h3>
        <p>Use para segmentar pastas grandes. Ex: pasta <strong>SERTANEJO</strong> com tag <strong>TOP</strong>.</p>
        <p>No seu arquivo .blm, chame como: <code>SERTANEJO TOP.apm</code></p>

        <h3 style={{ marginTop: '2rem' }}>2. Lógica de Scoring</h3>
        <p>Score = Descanso * (Peso²) * Mult_Artista</p>
        <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>O peso é elevado ao quadrado para que sucessos (Peso 3+) dominem a programação rapidamente.</p>
      </div>
    </div>
  )

  return (
    <div className="app-container">
      {renderBLMEditorModal()}
      {renderNewModelModal()}

      <BusyBanner visible={isBackendBusy && !showEditor} />
      <AppHeader />
      <TabNav activeTab={activeTab} onChange={setActiveTab} />

      <main>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'stats' && renderStats()}
        {activeTab === 'library' && renderLibrary()}
        {activeTab === 'blm_manager' && renderBLMList()}
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'guide' && renderGuide()}
      </main>

      <FloatingPlayer currentTrack={currentTrack} audioRef={audioRef} onClose={() => setCurrentTrack(null)} />

      {toastMessage && (
        <div className="toast">
          {toastMessage}
        </div>
      )}
    </div>
  )
}

export default App
