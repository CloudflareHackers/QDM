/**
 * QDM Auto-Updater
 * 
 * Checks for new versions by fetching package.json from the main branch.
 * Downloads updates from GitHub Releases.
 */

import * as https from 'https'
import { app, shell, Notification } from 'electron'
import { URL } from 'url'

const VERSION_URL = 'https://raw.githubusercontent.com/CloudflareHackers/QDM/refs/heads/main/package.json'
const RELEASES_URL = 'https://github.com/CloudflareHackers/QDM/releases/latest'

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  releaseUrl: string
}

type EventCallback = (event: string, data: any) => void

export class AutoUpdater {
  private currentVersion: string
  private emit: EventCallback
  private checkInterval: ReturnType<typeof setInterval> | null = null

  constructor(emit: EventCallback) {
    this.currentVersion = app.getVersion() || '1.0.0'
    this.emit = emit
  }

  /**
   * Get current app version
   */
  getCurrentVersion(): string {
    return this.currentVersion
  }

  /**
   * Start periodic update checks (every 6 hours)
   */
  startPeriodicCheck(intervalMs: number = 6 * 60 * 60 * 1000) {
    // Check immediately on startup (after 10 second delay)
    setTimeout(() => this.checkForUpdates(), 10000)
    
    // Then check periodically
    this.checkInterval = setInterval(() => {
      this.checkForUpdates()
    }, intervalMs)
  }

  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  /**
   * Fetch latest version from GitHub and compare
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    const info: UpdateInfo = {
      currentVersion: this.currentVersion,
      latestVersion: this.currentVersion,
      updateAvailable: false,
      releaseUrl: RELEASES_URL,
    }

    try {
      const remotePackage = await this.fetchJson(VERSION_URL)
      if (remotePackage && remotePackage.version) {
        info.latestVersion = remotePackage.version
        info.updateAvailable = this.isNewerVersion(remotePackage.version, this.currentVersion)
        
        if (info.updateAvailable) {
          info.releaseUrl = `https://github.com/CloudflareHackers/QDM/releases/tag/v${remotePackage.version}`
          
          this.emit('update:available', info)
          
          // Show system notification
          if (Notification.isSupported()) {
            const notification = new Notification({
              title: 'QDM Update Available',
              body: `Version ${remotePackage.version} is available. You have ${this.currentVersion}.`,
            })
            notification.on('click', () => {
              shell.openExternal(info.releaseUrl)
            })
            notification.show()
          }
        } else {
          this.emit('update:current', info)
        }
      }
    } catch (err) {
      console.warn('[QDM] Update check failed:', err)
      this.emit('update:error', { error: (err as Error).message })
    }

    return info
  }

  /**
   * Open the releases page in the browser for manual download
   */
  async openReleasePage(version?: string) {
    const url = version 
      ? `https://github.com/CloudflareHackers/QDM/releases/tag/v${version}`
      : RELEASES_URL
    await shell.openExternal(url)
  }

  /**
   * Compare semantic versions: returns true if remote > local
   */
  private isNewerVersion(remote: string, local: string): boolean {
    const r = remote.split('.').map(Number)
    const l = local.split('.').map(Number)
    
    for (let i = 0; i < 3; i++) {
      const rv = r[i] || 0
      const lv = l[i] || 0
      if (rv > lv) return true
      if (rv < lv) return false
    }
    return false
  }

  /**
   * Fetch JSON from a URL
   */
  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url)
      
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': `QDM/${this.currentVersion}`,
          'Accept': 'application/json',
        },
        timeout: 10000,
      }

      const req = https.request(options, (res) => {
        // Handle redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.fetchJson(res.headers.location).then(resolve).catch(reject)
          return
        }

        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new Error('Invalid JSON response'))
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })
      req.end()
    })
  }
}
