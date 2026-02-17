import React, { useState, useEffect } from 'react'
import { X, Settings, FolderOpen, Gauge, Monitor, Bell } from 'lucide-react'
import { useDownloadStore } from '../store/useDownloadStore'

const isElectron = typeof window !== 'undefined' && window.qdmAPI !== undefined

export function SettingsDialog() {
  const { setShowSettings, config, setConfig } = useDownloadStore()
  const [downloadDir, setDownloadDir] = useState(config?.downloadDir || '')
  const [maxConcurrent, setMaxConcurrent] = useState(config?.maxConcurrentDownloads || 3)
  const [maxSegments, setMaxSegments] = useState(config?.maxSegmentsPerDownload || 8)
  const [speedLimit, setSpeedLimit] = useState(config?.speedLimit || 0)
  const [notifications, setNotifications] = useState(config?.showNotifications ?? true)
  const [minimizeToTray, setMinimizeToTray] = useState(config?.minimizeToTray ?? true)

  useEffect(() => {
    if (isElectron && !config) {
      window.qdmAPI.config.get().then(c => {
        setConfig(c)
        setDownloadDir(c.downloadDir)
        setMaxConcurrent(c.maxConcurrentDownloads)
        setMaxSegments(c.maxSegmentsPerDownload)
        setSpeedLimit(c.speedLimit)
        setNotifications(c.showNotifications)
        setMinimizeToTray(c.minimizeToTray)
      })
    }
  }, [])

  const handleSelectFolder = async () => {
    if (!isElectron) return
    const folder = await window.qdmAPI.dialog.selectFolder()
    if (folder) setDownloadDir(folder)
  }

  const handleSave = async () => {
    const newConfig = {
      downloadDir,
      maxConcurrentDownloads: maxConcurrent,
      maxSegmentsPerDownload: maxSegments,
      speedLimit,
      showNotifications: notifications,
      minimizeToTray,
    }
    if (isElectron) {
      const updated = await window.qdmAPI.config.set(newConfig)
      setConfig(updated)
    }
    setShowSettings(false)
  }

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={() => setShowSettings(false)}
    >
      <div 
        className="bg-qdm-surface border border-qdm-border rounded-xl w-[500px] shadow-2xl animate-slide-up max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-qdm-border sticky top-0 bg-qdm-surface z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-qdm-accent/20 flex items-center justify-center">
              <Settings size={14} className="text-qdm-accent" />
            </div>
            <h2 className="text-sm font-semibold text-qdm-text">Settings</h2>
          </div>
          <button
            onClick={() => setShowSettings(false)}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={16} className="text-qdm-textSecondary" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Download Directory */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen size={14} className="text-qdm-accent" />
              <span className="text-xs font-semibold text-qdm-text uppercase tracking-wider">Storage</span>
            </div>
            <label className="block text-xs text-qdm-textSecondary mb-1.5">Default Download Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={downloadDir}
                onChange={(e) => setDownloadDir(e.target.value)}
                className="input-qdm flex-1"
              />
              <button
                onClick={handleSelectFolder}
                className="btn-secondary shrink-0"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Performance */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Gauge size={14} className="text-qdm-accent" />
              <span className="text-xs font-semibold text-qdm-text uppercase tracking-wider">Performance</span>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-qdm-textSecondary mb-1.5">
                  Max Concurrent Downloads
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={maxConcurrent}
                    onChange={(e) => setMaxConcurrent(parseInt(e.target.value))}
                    className="flex-1 accent-qdm-accent"
                  />
                  <span className="text-sm font-mono text-qdm-accent w-6 text-center">{maxConcurrent}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-qdm-textSecondary mb-1.5">
                  Max Segments Per Download
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
                  <span className="text-sm font-mono text-qdm-accent w-6 text-center">{maxSegments}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-qdm-textSecondary mb-1.5">
                  Speed Limit (KB/s) — 0 = Unlimited
                </label>
                <input
                  type="number"
                  min="0"
                  value={speedLimit}
                  onChange={(e) => setSpeedLimit(parseInt(e.target.value) || 0)}
                  className="input-qdm w-32"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* General */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Monitor size={14} className="text-qdm-accent" />
              <span className="text-xs font-semibold text-qdm-text uppercase tracking-wider">General</span>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifications}
                  onChange={(e) => setNotifications(e.target.checked)}
                  className="accent-qdm-accent w-4 h-4 rounded"
                />
                <div>
                  <span className="text-sm text-qdm-text">Show notifications</span>
                  <p className="text-[10px] text-qdm-textMuted">Notify when downloads complete</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={minimizeToTray}
                  onChange={(e) => setMinimizeToTray(e.target.checked)}
                  className="accent-qdm-accent w-4 h-4 rounded"
                />
                <div>
                  <span className="text-sm text-qdm-text">Minimize to system tray</span>
                  <p className="text-[10px] text-qdm-textMuted">Keep running in background when closed</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-qdm-border">
          <button onClick={() => setShowSettings(false)} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
