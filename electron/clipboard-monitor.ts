/**
 * QDM - Clipboard Monitor
 * 
 * Inspired by XDM's ClipboardMonitor.
 * Watches the system clipboard for URLs and automatically offers to download them.
 */

import { clipboard } from 'electron'

type EventCallback = (event: string, data: any) => void

const URL_REGEX = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i

export class ClipboardMonitor {
  private interval: ReturnType<typeof setInterval> | null = null
  private lastClipboardText: string = ''
  private enabled: boolean = true
  private emit: EventCallback
  private pollMs: number = 1500

  constructor(emit: EventCallback) {
    this.emit = emit
  }

  start() {
    if (this.interval) return
    this.lastClipboardText = clipboard.readText() || ''
    
    this.interval = setInterval(() => {
      if (!this.enabled) return
      
      try {
        const text = clipboard.readText()?.trim() || ''
        if (text && text !== this.lastClipboardText && URL_REGEX.test(text)) {
          this.lastClipboardText = text
          
          // Check if it looks like a downloadable URL
          if (this.isDownloadableUrl(text)) {
            this.emit('clipboard:url', { url: text })
          }
        } else if (text !== this.lastClipboardText) {
          this.lastClipboardText = text
        }
      } catch (err) {
        // Clipboard access can fail occasionally, ignore
      }
    }, this.pollMs)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  private isDownloadableUrl(url: string): boolean {
    const lower = url.toLowerCase()
    
    // Direct file extensions
    const fileExts = [
      '.zip', '.rar', '.7z', '.tar', '.gz',
      '.exe', '.msi', '.dmg', '.deb', '.rpm', '.apk',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx',
      '.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a',
      '.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v',
      '.iso', '.img', '.torrent',
    ]
    
    if (fileExts.some(ext => lower.includes(ext))) return true
    
    // Known download services
    const downloadHosts = [
      'drive.google.com', 'dropbox.com', 'mega.nz',
      'mediafire.com', 'github.com/releases',
      'sourceforge.net', 'download.',
    ]
    
    if (downloadHosts.some(host => lower.includes(host))) return true
    
    return false
  }
}
