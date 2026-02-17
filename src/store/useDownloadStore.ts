/**
 * QDM Download Store - Zustand state management
 */

import { create } from 'zustand'
import type { DownloadItem, DownloadCategory, DownloadProgress, AppConfig } from '../types/download'

// Mock API for web dev mode (when not running in Electron)
const isElectron = typeof window !== 'undefined' && window.qdmAPI !== undefined

const mockDownloads: DownloadItem[] = [
  {
    id: '1',
    url: 'https://example.com/project-release-v2.4.1.zip',
    fileName: 'project-release-v2.4.1.zip',
    fileSize: 256 * 1024 * 1024,
    downloaded: 256 * 1024 * 1024,
    progress: 100,
    speed: 0,
    eta: 0,
    status: 'completed',
    category: 'compressed',
    dateAdded: new Date(Date.now() - 3600000).toISOString(),
    dateCompleted: new Date(Date.now() - 1800000).toISOString(),
    savePath: 'C:\\Users\\User\\Downloads',
    resumable: true,
    segments: [],
    maxSegments: 8,
  },
  {
    id: '2',
    url: 'https://example.com/ubuntu-24.04-desktop-amd64.iso',
    fileName: 'ubuntu-24.04-desktop-amd64.iso',
    fileSize: 4.7 * 1024 * 1024 * 1024,
    downloaded: 2.1 * 1024 * 1024 * 1024,
    progress: 45,
    speed: 12.5 * 1024 * 1024,
    eta: 213,
    status: 'downloading',
    category: 'programs',
    dateAdded: new Date(Date.now() - 600000).toISOString(),
    savePath: 'C:\\Users\\User\\Downloads',
    resumable: true,
    segments: [
      { id: 's1', offset: 0, length: 600 * 1024 * 1024, downloaded: 600 * 1024 * 1024, state: 2, speed: 0 },
      { id: 's2', offset: 600 * 1024 * 1024, length: 600 * 1024 * 1024, downloaded: 450 * 1024 * 1024, state: 1, speed: 3.2 * 1024 * 1024 },
      { id: 's3', offset: 1200 * 1024 * 1024, length: 600 * 1024 * 1024, downloaded: 380 * 1024 * 1024, state: 1, speed: 2.8 * 1024 * 1024 },
      { id: 's4', offset: 1800 * 1024 * 1024, length: 600 * 1024 * 1024, downloaded: 290 * 1024 * 1024, state: 1, speed: 3.5 * 1024 * 1024 },
      { id: 's5', offset: 2400 * 1024 * 1024, length: 600 * 1024 * 1024, downloaded: 180 * 1024 * 1024, state: 1, speed: 2.1 * 1024 * 1024 },
      { id: 's6', offset: 3000 * 1024 * 1024, length: 600 * 1024 * 1024, downloaded: 120 * 1024 * 1024, state: 1, speed: 1.9 * 1024 * 1024 },
      { id: 's7', offset: 3600 * 1024 * 1024, length: 600 * 1024 * 1024, downloaded: 80 * 1024 * 1024, state: 1, speed: 2.5 * 1024 * 1024 },
      { id: 's8', offset: 4200 * 1024 * 1024, length: 547 * 1024 * 1024, downloaded: 0, state: 0, speed: 0 },
    ],
    maxSegments: 8,
  },
  {
    id: '3',
    url: 'https://example.com/song-collection.mp3',
    fileName: 'Awesome_Song_HQ.mp3',
    fileSize: 8.5 * 1024 * 1024,
    downloaded: 3.2 * 1024 * 1024,
    progress: 38,
    speed: 0,
    eta: 0,
    status: 'paused',
    category: 'music',
    dateAdded: new Date(Date.now() - 7200000).toISOString(),
    savePath: 'C:\\Users\\User\\Downloads',
    resumable: true,
    segments: [
      { id: 's1', offset: 0, length: 4.25 * 1024 * 1024, downloaded: 3.2 * 1024 * 1024, state: 1, speed: 0 },
      { id: 's2', offset: 4.25 * 1024 * 1024, length: 4.25 * 1024 * 1024, downloaded: 0, state: 0, speed: 0 },
    ],
    maxSegments: 8,
  },
  {
    id: '4',
    url: 'https://example.com/documentary-4k.mp4',
    fileName: 'Planet_Earth_4K_Documentary.mp4',
    fileSize: 1.2 * 1024 * 1024 * 1024,
    downloaded: 0,
    progress: 0,
    speed: 0,
    eta: 0,
    status: 'failed',
    category: 'videos',
    dateAdded: new Date(Date.now() - 86400000).toISOString(),
    savePath: 'C:\\Users\\User\\Downloads',
    resumable: true,
    segments: [],
    maxSegments: 8,
    error: 'Connection reset by server',
  },
  {
    id: '5',
    url: 'https://example.com/manual.pdf',
    fileName: 'User_Manual_v3.pdf',
    fileSize: 15 * 1024 * 1024,
    downloaded: 15 * 1024 * 1024,
    progress: 100,
    speed: 0,
    eta: 0,
    status: 'completed',
    category: 'documents',
    dateAdded: new Date(Date.now() - 172800000).toISOString(),
    dateCompleted: new Date(Date.now() - 172000000).toISOString(),
    savePath: 'C:\\Users\\User\\Downloads',
    resumable: true,
    segments: [],
    maxSegments: 8,
  },
  {
    id: '6',
    url: 'https://example.com/vscode-setup.exe',
    fileName: 'VSCode-Setup-x64-1.85.exe',
    fileSize: 95 * 1024 * 1024,
    downloaded: 72 * 1024 * 1024,
    progress: 76,
    speed: 5.2 * 1024 * 1024,
    eta: 4,
    status: 'downloading',
    category: 'programs',
    dateAdded: new Date(Date.now() - 120000).toISOString(),
    savePath: 'C:\\Users\\User\\Downloads',
    resumable: true,
    segments: [
      { id: 's1', offset: 0, length: 24 * 1024 * 1024, downloaded: 24 * 1024 * 1024, state: 2, speed: 0 },
      { id: 's2', offset: 24 * 1024 * 1024, length: 24 * 1024 * 1024, downloaded: 22 * 1024 * 1024, state: 1, speed: 1.8 * 1024 * 1024 },
      { id: 's3', offset: 48 * 1024 * 1024, length: 24 * 1024 * 1024, downloaded: 18 * 1024 * 1024, state: 1, speed: 2.1 * 1024 * 1024 },
      { id: 's4', offset: 72 * 1024 * 1024, length: 23 * 1024 * 1024, downloaded: 8 * 1024 * 1024, state: 1, speed: 1.3 * 1024 * 1024 },
    ],
    maxSegments: 8,
  },
]

interface DownloadStore {
  // State
  downloads: DownloadItem[]
  selectedIds: Set<string>
  activeCategory: DownloadCategory
  activeView: 'downloads' | 'video-grabber'
  searchQuery: string
  showNewDownload: boolean
  showSettings: boolean
  showAbout: boolean
  config: AppConfig | null

  // Actions  
  setActiveView: (view: 'downloads' | 'video-grabber') => void
  setDownloads: (downloads: DownloadItem[]) => void
  updateDownload: (id: string, updates: Partial<DownloadItem>) => void
  updateProgress: (progress: DownloadProgress) => void
  addDownload: (item: DownloadItem) => void
  removeDownloadFromList: (id: string) => void
  setSelectedIds: (ids: Set<string>) => void
  toggleSelect: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  setActiveCategory: (category: DownloadCategory) => void
  setSearchQuery: (query: string) => void
  setShowNewDownload: (show: boolean) => void
  setShowSettings: (show: boolean) => void
  setShowAbout: (show: boolean) => void
  setConfig: (config: AppConfig) => void
  loadDownloads: () => Promise<void>
  filteredDownloads: () => DownloadItem[]
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  downloads: isElectron ? [] : mockDownloads,
  selectedIds: new Set<string>(),
  activeCategory: 'all',
  activeView: 'downloads',
  searchQuery: '',
  showNewDownload: false,
  showSettings: false,
  showAbout: false,
  config: null,

  setActiveView: (view) => set({ activeView: view }),
  setDownloads: (downloads) => set({ downloads }),
  
  updateDownload: (id, updates) => set((state) => ({
    downloads: state.downloads.map(d => 
      d.id === id ? { ...d, ...updates } : d
    )
  })),

  updateProgress: (progress) => set((state) => ({
    downloads: state.downloads.map(d => 
      d.id === progress.id ? {
        ...d,
        downloaded: progress.downloaded,
        progress: progress.progress,
        speed: progress.speed,
        eta: progress.eta,
        segments: progress.segments,
        status: progress.status,
      } : d
    )
  })),

  addDownload: (item) => set((state) => ({
    downloads: [item, ...state.downloads]
  })),

  removeDownloadFromList: (id) => set((state) => ({
    downloads: state.downloads.filter(d => d.id !== id),
    selectedIds: new Set([...state.selectedIds].filter(sid => sid !== id))
  })),

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  
  toggleSelect: (id) => set((state) => {
    const newSet = new Set(state.selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    return { selectedIds: newSet }
  }),

  selectAll: () => set((state) => ({
    selectedIds: new Set(get().filteredDownloads().map(d => d.id))
  })),

  clearSelection: () => set({ selectedIds: new Set() }),

  setActiveCategory: (category) => set({ activeCategory: category, activeView: 'downloads', selectedIds: new Set() }),
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  setShowNewDownload: (show) => set({ showNewDownload: show }),
  
  setShowSettings: (show) => set({ showSettings: show }),
  
  setShowAbout: (show) => set({ showAbout: show }),

  setConfig: (config) => set({ config }),

  loadDownloads: async () => {
    if (isElectron) {
      try {
        const downloads = await window.qdmAPI.download.getAll()
        set({ downloads })
      } catch (err) {
        console.error('Failed to load downloads:', err)
      }
    }
  },

  filteredDownloads: () => {
    const { downloads, activeCategory, searchQuery } = get()
    let filtered = downloads

    if (activeCategory !== 'all') {
      if (activeCategory === 'compressed' || activeCategory === 'documents' || 
          activeCategory === 'music' || activeCategory === 'videos' || 
          activeCategory === 'programs' || activeCategory === 'other') {
        filtered = filtered.filter(d => d.category === activeCategory)
      }
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(d => 
        d.fileName.toLowerCase().includes(q) ||
        d.url.toLowerCase().includes(q)
      )
    }

    return filtered
  },
}))
