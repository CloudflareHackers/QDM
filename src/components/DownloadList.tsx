import React from 'react'
import { 
  Play, Pause, Trash2, FolderOpen, RotateCcw, FileDown,
  CheckCircle2, AlertCircle, Clock, Loader2, ExternalLink
} from 'lucide-react'
import { useDownloadStore } from '../store/useDownloadStore'
import { formatBytes, formatSpeed, formatEta, formatDate, getFileIcon } from '../utils/format'
import type { DownloadItem, DownloadSegment } from '../types/download'

const isElectron = typeof window !== 'undefined' && window.qdmAPI !== undefined

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    downloading: { 
      icon: <Loader2 size={12} className="animate-spin" />, 
      label: 'Downloading', 
      className: 'bg-qdm-accent/15 text-qdm-accent border-qdm-accent/30' 
    },
    completed: { 
      icon: <CheckCircle2 size={12} />, 
      label: 'Completed', 
      className: 'bg-qdm-success/15 text-qdm-success border-qdm-success/30' 
    },
    paused: { 
      icon: <Pause size={12} />, 
      label: 'Paused', 
      className: 'bg-qdm-warning/15 text-qdm-warning border-qdm-warning/30' 
    },
    failed: { 
      icon: <AlertCircle size={12} />, 
      label: 'Failed', 
      className: 'bg-qdm-danger/15 text-qdm-danger border-qdm-danger/30' 
    },
    queued: { 
      icon: <Clock size={12} />, 
      label: 'Queued', 
      className: 'bg-qdm-textMuted/15 text-qdm-textSecondary border-qdm-textMuted/30' 
    },
    assembling: { 
      icon: <Loader2 size={12} className="animate-spin" />, 
      label: 'Assembling', 
      className: 'bg-qdm-accent/15 text-qdm-accent border-qdm-accent/30' 
    },
    stopped: { 
      icon: <AlertCircle size={12} />, 
      label: 'Stopped', 
      className: 'bg-qdm-textMuted/15 text-qdm-textSecondary border-qdm-textMuted/30' 
    },
  }
  
  const config = configs[status] || configs.stopped
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  )
}

// Segment visualization bar (XDM-style multi-segment progress)
function SegmentBar({ segments, fileSize }: { segments: DownloadSegment[]; fileSize: number }) {
  if (!segments.length || fileSize <= 0) return null

  return (
    <div className="segment-bar mt-1.5">
      {segments.map((seg) => {
        const left = (seg.offset / fileSize) * 100
        const width = (seg.length / fileSize) * 100
        const progress = seg.length > 0 ? (seg.downloaded / seg.length) : 0
        
        const colors: Record<number, string> = {
          0: 'bg-qdm-textMuted/30',    // NotStarted
          1: 'bg-qdm-accent',           // Downloading
          2: 'bg-qdm-success',          // Finished
          3: 'bg-qdm-danger',           // Failed
        }

        return (
          <div
            key={seg.id}
            className={`segment-fill ${colors[seg.state] || 'bg-qdm-textMuted/30'}`}
            style={{
              left: `${left}%`,
              width: `${width * progress}%`,
              opacity: seg.state === 2 ? 0.8 : 1,
            }}
          />
        )
      })}
    </div>
  )
}

// Main progress bar
function ProgressBar({ progress, status }: { progress: number; status: string }) {
  const colorMap: Record<string, string> = {
    downloading: 'bg-qdm-accent',
    completed: 'bg-qdm-success',
    paused: 'bg-qdm-warning',
    failed: 'bg-qdm-danger',
    assembling: 'bg-qdm-accent',
  }
  const color = colorMap[status] || 'bg-qdm-textMuted'

  return (
    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color} ${
          status === 'downloading' ? 'progress-bar-animated' : ''
        }`}
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  )
}

// Individual download row
function DownloadRow({ item }: { item: DownloadItem }) {
  const { selectedIds, toggleSelect } = useDownloadStore()
  const isSelected = selectedIds.has(item.id)
  const isActive = item.status === 'downloading'
  const isCompleted = item.status === 'completed'
  const isPaused = item.status === 'paused'
  const isFailed = item.status === 'failed'

  const handleAction = async (e: React.MouseEvent, action: string) => {
    e.stopPropagation()
    if (!isElectron) return

    switch (action) {
      case 'pause':
        await window.qdmAPI.download.pause(item.id)
        break
      case 'resume':
        await window.qdmAPI.download.resume(item.id)
        break
      case 'retry':
        await window.qdmAPI.download.retry(item.id)
        break
      case 'openFile':
        await window.qdmAPI.download.openFile(item.id)
        break
      case 'openFolder':
        await window.qdmAPI.download.openFolder(item.id)
        break
      case 'delete':
        await window.qdmAPI.download.remove(item.id, false)
        useDownloadStore.getState().removeDownloadFromList(item.id)
        break
    }
  }

  return (
    <div
      onClick={() => toggleSelect(item.id)}
      className={`group px-4 py-3 border-b border-qdm-border/50 cursor-pointer transition-all duration-150
        ${isSelected 
          ? 'bg-qdm-accent/8 border-l-2 border-l-qdm-accent' 
          : 'hover:bg-qdm-surfaceHover/50 border-l-2 border-l-transparent'
        }
        ${isActive ? 'bg-qdm-accent/[0.03]' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className="text-2xl mt-0.5 select-none shrink-0">
          {getFileIcon(item.fileName)}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* File name & status */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-qdm-text truncate max-w-md" title={item.fileName}>
              {item.fileName}
            </span>
            <StatusBadge status={item.status} />
          </div>

          {/* Progress bar */}
          {!isCompleted && item.progress > 0 && (
            <ProgressBar progress={item.progress} status={item.status} />
          )}

          {/* Segment visualization */}
          {isActive && item.segments.length > 1 && (
            <SegmentBar segments={item.segments} fileSize={item.fileSize} />
          )}

          {/* Stats line */}
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-qdm-textMuted">
            {/* Size info */}
            <span>
              {item.fileSize > 0 
                ? `${formatBytes(item.downloaded)} / ${formatBytes(item.fileSize)}`
                : formatBytes(item.downloaded)
              }
            </span>

            {/* Speed */}
            {isActive && item.speed > 0 && (
              <>
                <span className="text-qdm-border">•</span>
                <span className="text-qdm-accent font-mono font-medium">
                  {formatSpeed(item.speed)}
                </span>
              </>
            )}

            {/* ETA */}
            {isActive && item.eta > 0 && (
              <>
                <span className="text-qdm-border">•</span>
                <span>{formatEta(item.eta)} left</span>
              </>
            )}

            {/* Segments count */}
            {isActive && item.segments.length > 1 && (
              <>
                <span className="text-qdm-border">•</span>
                <span>{item.segments.filter(s => s.state === 1).length}/{item.segments.length} segments</span>
              </>
            )}

            {/* Progress */}
            {!isCompleted && item.progress > 0 && (
              <>
                <span className="text-qdm-border">•</span>
                <span className="font-mono">{item.progress}%</span>
              </>
            )}

            {/* Date */}
            <span className="text-qdm-border">•</span>
            <span>{formatDate(isCompleted ? (item.dateCompleted || item.dateAdded) : item.dateAdded)}</span>

            {/* Error */}
            {isFailed && item.error && (
              <>
                <span className="text-qdm-border">•</span>
                <span className="text-qdm-danger">{item.error}</span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {isActive && (
            <button
              onClick={(e) => handleAction(e, 'pause')}
              className="p-1.5 rounded-lg hover:bg-qdm-warning/20 text-qdm-warning transition-colors"
              title="Pause"
            >
              <Pause size={14} />
            </button>
          )}
          
          {(isPaused || isFailed) && (
            <button
              onClick={(e) => handleAction(e, isFailed ? 'retry' : 'resume')}
              className="p-1.5 rounded-lg hover:bg-qdm-accent/20 text-qdm-accent transition-colors"
              title={isFailed ? 'Retry' : 'Resume'}
            >
              {isFailed ? <RotateCcw size={14} /> : <Play size={14} />}
            </button>
          )}

          {isCompleted && (
            <button
              onClick={(e) => handleAction(e, 'openFile')}
              className="p-1.5 rounded-lg hover:bg-qdm-accent/20 text-qdm-accent transition-colors"
              title="Open File"
            >
              <ExternalLink size={14} />
            </button>
          )}

          <button
            onClick={(e) => handleAction(e, 'openFolder')}
            className="p-1.5 rounded-lg hover:bg-white/10 text-qdm-textSecondary transition-colors"
            title="Open Folder"
          >
            <FolderOpen size={14} />
          </button>

          <button
            onClick={(e) => handleAction(e, 'delete')}
            className="p-1.5 rounded-lg hover:bg-qdm-danger/20 text-qdm-danger/70 hover:text-qdm-danger transition-colors"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// Empty state
function EmptyState() {
  const { setShowNewDownload, activeCategory } = useDownloadStore()
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-fade-in">
      <div className="w-20 h-20 rounded-2xl bg-qdm-surface flex items-center justify-center mb-4">
        <FileDown size={32} className="text-qdm-textMuted" />
      </div>
      <h3 className="text-lg font-semibold text-qdm-text mb-1">
        {activeCategory === 'all' ? 'No downloads yet' : 'No downloads in this category'}
      </h3>
      <p className="text-sm text-qdm-textMuted mb-4 max-w-sm">
        Click the "New Download" button to add your first download. 
        QDM uses multi-segment downloading for blazing fast speeds.
      </p>
      <button 
        onClick={() => setShowNewDownload(true)}
        className="btn-primary flex items-center gap-2"
      >
        <Plus size={16} />
        Add Download
      </button>
    </div>
  )
}

// Import Plus here since it's used in EmptyState
import { Plus } from 'lucide-react'

export function DownloadList() {
  const { filteredDownloads } = useDownloadStore()
  const downloads = filteredDownloads()

  if (downloads.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {downloads.map((item) => (
        <DownloadRow key={item.id} item={item} />
      ))}
    </div>
  )
}
