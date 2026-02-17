import React, { useState, useRef, useEffect } from 'react'
import { X, Link, FolderOpen, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { useDownloadStore } from '../store/useDownloadStore'

const isElectron = typeof window !== 'undefined' && window.qdmAPI !== undefined

export function NewDownloadDialog() {
  const { setShowNewDownload, config } = useDownloadStore()
  const [url, setUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [savePath, setSavePath] = useState(config?.downloadDir || '')
  const [maxSegments, setMaxSegments] = useState(config?.maxSegmentsPerDownload || 8)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    // Try to read clipboard
    navigator.clipboard?.readText().then(text => {
      if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('ftp://'))) {
        setUrl(text)
      }
    }).catch(() => {})
  }, [])

  const handleSelectFolder = async () => {
    if (!isElectron) return
    const folder = await window.qdmAPI.dialog.selectFolder()
    if (folder) setSavePath(folder)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setIsLoading(true)
    try {
      if (isElectron) {
        await window.qdmAPI.download.add({
          url: url.trim(),
          fileName: fileName.trim() || undefined,
          savePath: savePath || undefined,
          maxSegments,
          autoStart: true,
        })
      } else {
        // Mock for web dev mode
        const { addDownload } = useDownloadStore.getState()
        addDownload({
          id: Date.now().toString(),
          url: url.trim(),
          fileName: fileName.trim() || url.split('/').pop() || 'download',
          fileSize: -1,
          downloaded: 0,
          progress: 0,
          speed: 0,
          eta: 0,
          status: 'queued',
          category: 'other',
          dateAdded: new Date().toISOString(),
          savePath: savePath || 'C:\\Users\\User\\Downloads',
          resumable: false,
          segments: [],
          maxSegments,
        })
      }
      setShowNewDownload(false)
    } catch (err) {
      console.error('Failed to add download:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setShowNewDownload(false)
  }

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={() => setShowNewDownload(false)}
      onKeyDown={handleKeyDown}
    >
      <div 
        className="bg-qdm-surface border border-qdm-border rounded-xl w-[540px] shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-qdm-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-qdm-accent/20 flex items-center justify-center">
              <Zap size={14} className="text-qdm-accent" />
            </div>
            <h2 className="text-sm font-semibold text-qdm-text">New Download</h2>
          </div>
          <button
            onClick={() => setShowNewDownload(false)}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={16} className="text-qdm-textSecondary" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* URL */}
          <div>
            <label className="block text-xs font-medium text-qdm-textSecondary mb-1.5">
              Download URL
            </label>
            <div className="relative">
              <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-qdm-textMuted" />
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/file.zip"
                className="input-qdm pl-9"
                required
              />
            </div>
          </div>

          {/* File Name */}
          <div>
            <label className="block text-xs font-medium text-qdm-textSecondary mb-1.5">
              File Name <span className="text-qdm-textMuted">(optional, auto-detected)</span>
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Auto-detect from URL"
              className="input-qdm"
            />
          </div>

          {/* Save Path */}
          <div>
            <label className="block text-xs font-medium text-qdm-textSecondary mb-1.5">
              Save To
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={savePath}
                onChange={(e) => setSavePath(e.target.value)}
                placeholder="Default download directory"
                className="input-qdm flex-1"
              />
              <button
                type="button"
                onClick={handleSelectFolder}
                className="btn-secondary flex items-center gap-1.5 shrink-0"
              >
                <FolderOpen size={14} />
                Browse
              </button>
            </div>
          </div>

          {/* Advanced Options */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-qdm-textSecondary hover:text-qdm-text transition-colors"
            >
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Advanced Options
            </button>
            
            {showAdvanced && (
              <div className="mt-3 space-y-3 animate-slide-down">
                <div>
                  <label className="block text-xs font-medium text-qdm-textSecondary mb-1.5">
                    Max Segments (Connections)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="32"
                      value={maxSegments}
                      onChange={(e) => setMaxSegments(parseInt(e.target.value))}
                      className="flex-1 accent-qdm-accent"
                    />
                    <span className="text-sm font-mono text-qdm-accent w-8 text-center">
                      {maxSegments}
                    </span>
                  </div>
                  <p className="text-[10px] text-qdm-textMuted mt-1">
                    More segments = faster download (if server supports it)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewDownload(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim() || isLoading}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Zap size={14} />
              )}
              {isLoading ? 'Starting...' : 'Download Now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
