import React from 'react'
import { 
  Plus, Play, Pause, Trash2, Search, 
  CheckSquare, RefreshCw, StopCircle
} from 'lucide-react'
import { useDownloadStore } from '../store/useDownloadStore'

const isElectron = typeof window !== 'undefined' && window.qdmAPI !== undefined

export function Toolbar() {
  const { 
    selectedIds, downloads, searchQuery, setSearchQuery, 
    setShowNewDownload, clearSelection, removeDownloadFromList
  } = useDownloadStore()

  const selectedDownloads = downloads.filter(d => selectedIds.has(d.id))
  const hasSelection = selectedIds.size > 0
  const hasActiveSelected = selectedDownloads.some(d => d.status === 'downloading')
  const hasPausedSelected = selectedDownloads.some(d => d.status === 'paused' || d.status === 'failed')

  const handleResumeAll = async () => {
    for (const d of selectedDownloads) {
      if (d.status === 'paused' || d.status === 'failed') {
        if (isElectron) await window.qdmAPI.download.resume(d.id)
      }
    }
  }

  const handlePauseAll = async () => {
    for (const d of selectedDownloads) {
      if (d.status === 'downloading') {
        if (isElectron) await window.qdmAPI.download.pause(d.id)
      }
    }
  }

  const handleDeleteSelected = async () => {
    for (const d of selectedDownloads) {
      if (isElectron) {
        await window.qdmAPI.download.remove(d.id, false)
      }
      removeDownloadFromList(d.id)
    }
    clearSelection()
  }

  return (
    <div className="h-14 bg-qdm-surface/30 border-b border-qdm-border flex items-center px-4 gap-2 shrink-0">
      {/* New Download Button */}
      <button
        onClick={() => setShowNewDownload(true)}
        className="btn-primary flex items-center gap-2 shadow-lg shadow-qdm-accent/20"
      >
        <Plus size={16} />
        <span>New Download</span>
      </button>

      <div className="w-px h-6 bg-qdm-border mx-1" />

      {/* Selection Actions */}
      <button
        onClick={handleResumeAll}
        disabled={!hasSelection || !hasPausedSelected}
        className="btn-ghost flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Resume Selected"
      >
        <Play size={14} />
        <span className="hidden lg:inline">Resume</span>
      </button>

      <button
        onClick={handlePauseAll}
        disabled={!hasSelection || !hasActiveSelected}
        className="btn-ghost flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Pause Selected"
      >
        <Pause size={14} />
        <span className="hidden lg:inline">Pause</span>
      </button>

      <button
        onClick={handleDeleteSelected}
        disabled={!hasSelection}
        className="btn-ghost flex items-center gap-1.5 text-qdm-danger/70 hover:text-qdm-danger disabled:opacity-30 disabled:cursor-not-allowed"
        title="Delete Selected"
      >
        <Trash2 size={14} />
        <span className="hidden lg:inline">Delete</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Selection count */}
      {hasSelection && (
        <span className="text-xs text-qdm-textMuted mr-2">
          {selectedIds.size} selected
        </span>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-qdm-textMuted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search downloads..."
          className="input-qdm pl-8 w-52 text-xs h-8"
        />
      </div>
    </div>
  )
}
