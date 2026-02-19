import React, { useState, useRef, useEffect, useCallback } from 'react'
import { X, Link, FolderOpen, Zap, ChevronDown, ChevronUp, Loader2, FileDown, HardDrive } from 'lucide-react'
import { useDownloadStore } from '../store/useDownloadStore'
import { formatBytes } from '../utils/format'

const isElectron = typeof window !== 'undefined' && window.qdmAPI !== undefined

// Simple debounce
function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

interface FileInfo {
  fileName: string
  fileSize: number
  resumable: boolean
}

export function NewDownloadDialog() {
  const { setShowNewDownload, config } = useDownloadStore()
  const [url, setUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileNameManual, setFileNameManual] = useState(false) // true if user manually edited
  const [savePath, setSavePath] = useState(config?.downloadDir || '')
  const [maxSegments, setMaxSegments] = useState(config?.maxSegmentsPerDownload || 8)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [fetchError, setFetchError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const fetchController = useRef<AbortController | null>(null)

  const debouncedUrl = useDebounce(url, 800)

  useEffect(() => {
    inputRef.current?.focus()
    // Try to read clipboard for URL
    navigator.clipboard?.readText().then(text => {
      if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('ftp://'))) {
        setUrl(text)
      }
    }).catch(() => {})
  }, [])

  // Auto-fetch file info when URL changes
  useEffect(() => {
    if (!debouncedUrl || !isValidUrl(debouncedUrl)) {
      setFileInfo(null)
      setFetchError('')
      return
    }

    fetchFileInfo(debouncedUrl)
  }, [debouncedUrl])

  function isValidUrl(str: string): boolean {
    try {
      const u = new URL(str)
      return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ftp:'
    } catch {
      return false
    }
  }

  async function fetchFileInfo(targetUrl: string) {
    // Cancel any existing fetch
    if (fetchController.current) {
      fetchController.current.abort()
    }

    setIsFetching(true)
    setFetchError('')
    fetchController.current = new AbortController()

    try {
      // Use a HEAD request via the main process if in Electron
      // For web mode, we can't make HEAD requests due to CORS, so fake it
      if (isElectron) {
        // We'll probe via the download engine by adding with autoStart=false
        // But for now, just extract from URL
      }

      // Extract filename from URL as immediate feedback
      const urlName = extractFileNameFromUrl(targetUrl)
      if (!fileNameManual && urlName) {
        setFileName(urlName)
      }

      // Try a HEAD request (will work for same-origin or CORS-enabled URLs)
      const controller = fetchController.current
      const response = await fetch(targetUrl, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'no-cors', // This won't give us headers, but won't error
      }).catch(() => null)

      if (controller.signal.aborted) return

      // In no-cors mode we can't read headers, so for web dev mode use URL info
      // In Electron, the download engine's probeUrl handles this properly
      const info: FileInfo = {
        fileName: urlName || 'download',
        fileSize: -1,
        resumable: false,
      }

      // Try to read Content-Length and Content-Disposition if available
      if (response && response.headers) {
        const contentLength = response.headers.get('content-length')
        if (contentLength) {
          info.fileSize = parseInt(contentLength, 10)
        }

        const contentDisposition = response.headers.get('content-disposition')
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
          if (match) {
            info.fileName = match[1].replace(/['"]/g, '').trim()
          }
        }

        const acceptRanges = response.headers.get('accept-ranges')
        info.resumable = acceptRanges === 'bytes'
      }

      if (!fileNameManual) {
        setFileName(info.fileName)
      }
      setFileInfo(info)
      setFetchError('')
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      // Not a real error for the user — just means we couldn't probe
      // The download engine will handle it properly when starting
      const urlName = extractFileNameFromUrl(targetUrl)
      if (!fileNameManual && urlName) {
        setFileName(urlName)
      }
      setFileInfo({
        fileName: urlName || 'download',
        fileSize: -1,
        resumable: false,
      })
    } finally {
      setIsFetching(false)
    }
  }

  function extractFileNameFromUrl(urlStr: string): string {
    try {
      const urlObj = new URL(urlStr)
      let pathname = urlObj.pathname
      if (pathname.endsWith('/')) pathname = pathname.slice(0, -1)
      const name = pathname.split('/').pop() || ''
      const decoded = decodeURIComponent(name)
      if (decoded && decoded.includes('.')) return decoded
      // Check query params
      const fileParam = urlObj.searchParams.get('filename') || 
                         urlObj.searchParams.get('file') || 
                         urlObj.searchParams.get('name')
      if (fileParam) return decodeURIComponent(fileParam)
      return decoded || ''
    } catch {
      return ''
    }
  }

  const handleSelectFolder = async () => {
    if (!isElectron) return
    const folder = await window.qdmAPI.dialog.selectFolder()
    if (folder) setSavePath(folder)
  }

  const handleFileNameChange = (value: string) => {
    setFileName(value)
    setFileNameManual(value.length > 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    // Close dialog IMMEDIATELY — don't wait for download to start
    setShowNewDownload(false)

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
          fileName: fileName.trim() || extractFileNameFromUrl(url) || 'download',
          fileSize: fileInfo?.fileSize || -1,
          downloaded: 0,
          progress: 0,
          speed: 0,
          eta: 0,
          status: 'downloading',
          category: 'other',
          dateAdded: new Date().toISOString(),
          savePath: savePath || 'C:\\Users\\User\\Downloads',
          resumable: fileInfo?.resumable || false,
          segments: [],
          maxSegments,
        })
      }
    } catch (err) {
      console.error('Failed to add download:', err)
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
                className="input-qdm pl-9 pr-10"
                required
              />
              {isFetching && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-qdm-accent animate-spin" />
              )}
            </div>
          </div>

          {/* File Info Bar — shows when we have info */}
          {fileInfo && url && (
            <div className="flex items-center gap-3 p-2.5 bg-qdm-bg/80 rounded-lg border border-qdm-border/50 animate-fade-in">
              <FileDown size={16} className="text-qdm-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-qdm-text truncate">{fileInfo.fileName || 'Unknown'}</div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-qdm-textMuted shrink-0">
                {fileInfo.fileSize > 0 && (
                  <span className="flex items-center gap-1">
                    <HardDrive size={10} />
                    {formatBytes(fileInfo.fileSize)}
                  </span>
                )}
                {fileInfo.resumable && (
                  <span className="px-1.5 py-0.5 bg-qdm-success/15 text-qdm-success rounded text-[9px]">
                    Resumable
                  </span>
                )}
              </div>
            </div>
          )}

          {fetchError && (
            <p className="text-[11px] text-qdm-warning">{fetchError}</p>
          )}

          {/* File Name */}
          <div>
            <label className="block text-xs font-medium text-qdm-textSecondary mb-1.5">
              File Name <span className="text-qdm-textMuted">(auto-detected from URL)</span>
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => handleFileNameChange(e.target.value)}
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
              disabled={!url.trim() || !isValidUrl(url.trim())}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              <Zap size={14} />
              Download Now
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
