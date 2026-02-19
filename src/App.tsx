/**
 * QDM - Quantum Download Manager
 * Main Application Component
 */

import React, { useEffect } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { DownloadList } from './components/DownloadList'
import { VideoGrabber } from './components/VideoGrabber'
import { NewDownloadDialog } from './components/NewDownloadDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { AboutDialog } from './components/AboutDialog'
import { useDownloadStore } from './store/useDownloadStore'

const isElectron = typeof window !== 'undefined' && window.qdmAPI !== undefined

export default function App() {
  const { 
    loadDownloads, updateProgress, addDownload, 
    setShowNewDownload, setShowSettings, setShowAbout,
    showNewDownload, showSettings, showAbout, activeView
  } = useDownloadStore()

  useEffect(() => {
    loadDownloads()

    if (isElectron) {
      const unsubProgress = window.qdmAPI.on('download:progress', (data: any) => {
        updateProgress(data)
      })
      const unsubAdded = window.qdmAPI.on('download:added', (data: any) => {
        addDownload(data)
      })
      const unsubNewDownload = window.qdmAPI.on('show-new-download', () => {
        setShowNewDownload(true)
      })
      const unsubAbout = window.qdmAPI.on('show-about', () => {
        setShowAbout(true)
      })
      const unsubSettings = window.qdmAPI.on('show-settings', () => {
        setShowSettings(true)
      })

      return () => {
        unsubProgress()
        unsubAdded()
        unsubNewDownload()
        unsubAbout()
        unsubSettings()
      }
    }
  }, [])

  return (
    <div className="h-screen w-screen flex flex-col bg-qdm-bg overflow-hidden">
      {/* Custom Title Bar */}
      <TitleBar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeView === 'video-grabber' ? (
            <VideoGrabber />
          ) : (
            <>
              <Toolbar />
              <DownloadList />
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showNewDownload && <NewDownloadDialog />}
      {showSettings && <SettingsDialog />}
      {showAbout && <AboutDialog />}
    </div>
  )
}
