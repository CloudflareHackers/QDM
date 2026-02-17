/**
 * QDM - Quantum Download Manager
 * Segmented Download Engine
 * 
 * This download engine implements multi-segment/multi-connection downloading,
 * inspired by XDM (Xtreme Download Manager) by subhra74.
 * https://github.com/subhra74/xdm
 * 
 * Key concepts from XDM's architecture:
 * - File is divided into segments (pieces) that download in parallel
 * - Dynamic segment splitting: if one segment finishes, it splits the largest remaining
 * - Resume support via HTTP Range headers
 * - Speed calculation with moving averages
 * - Segment state persistence for crash recovery
 * 
 * IDM (Internet Download Manager) pioneered this approach commercially.
 * We honor their innovation while building an open-source alternative.
 */

import { net, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import * as https from 'https'
import { URL } from 'url'
import type { 
  DownloadItem, DownloadSegment, NewDownloadRequest, 
  AppConfig, DownloadStatus, DownloadCategory, DownloadProgress 
} from './types'

type EventEmitter = (event: string, data: any) => void

// File extension to category mapping
const CATEGORY_MAP: Record<string, DownloadCategory> = {
  // Compressed
  '.zip': 'compressed', '.rar': 'compressed', '.7z': 'compressed', '.tar': 'compressed',
  '.gz': 'compressed', '.bz2': 'compressed', '.xz': 'compressed', '.zst': 'compressed',
  // Documents
  '.pdf': 'documents', '.doc': 'documents', '.docx': 'documents', '.xls': 'documents',
  '.xlsx': 'documents', '.ppt': 'documents', '.pptx': 'documents', '.txt': 'documents',
  '.rtf': 'documents', '.csv': 'documents', '.epub': 'documents',
  // Music
  '.mp3': 'music', '.flac': 'music', '.wav': 'music', '.aac': 'music',
  '.ogg': 'music', '.wma': 'music', '.m4a': 'music', '.opus': 'music',
  // Videos
  '.mp4': 'videos', '.mkv': 'videos', '.avi': 'videos', '.mov': 'videos',
  '.wmv': 'videos', '.flv': 'videos', '.webm': 'videos', '.m4v': 'videos',
  '.ts': 'videos', '.m3u8': 'videos',
  // Programs
  '.exe': 'programs', '.msi': 'programs', '.dmg': 'programs', '.deb': 'programs',
  '.rpm': 'programs', '.appimage': 'programs', '.apk': 'programs', '.app': 'programs',
}

function getCategory(fileName: string): DownloadCategory {
  const ext = path.extname(fileName).toLowerCase()
  return CATEGORY_MAP[ext] || 'other'
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function getFileNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const name = path.basename(pathname)
    if (name && name !== '/' && name.includes('.')) {
      return decodeURIComponent(name)
    }
  } catch {}
  return 'download_' + Date.now()
}

function getFileNameFromHeaders(headers: Record<string, string | string[]>, url: string): string {
  const contentDisposition = headers['content-disposition']
  if (contentDisposition) {
    const cdStr = Array.isArray(contentDisposition) ? contentDisposition[0] : contentDisposition
    // Try filename*= first (RFC 5987)
    const match2 = cdStr.match(/filename\*=(?:UTF-8''|utf-8'')(.+)/i)
    if (match2) return decodeURIComponent(match2[1].replace(/['"]/g, ''))
    
    // Try filename=
    const match = cdStr.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
    if (match) return match[1].replace(/['"]/g, '').trim()
  }
  return getFileNameFromUrl(url)
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

interface ActiveDownload {
  item: DownloadItem
  abortControllers: Map<string, AbortController>
  startTime: number
  bytesAtStart: number
  lastSpeedCalcTime: number
  lastSpeedCalcBytes: number
  progressInterval?: ReturnType<typeof setInterval>
}

export class DownloadEngine {
  private downloads: Map<string, DownloadItem> = new Map()
  private activeDownloads: Map<string, ActiveDownload> = new Map()
  private config: AppConfig
  private emit: EventEmitter
  private dbPath: string

  constructor(config: AppConfig, emit: EventEmitter) {
    this.config = config
    this.emit = emit
    this.dbPath = path.join(config.downloadDir, '.qdm_data')
    this.ensureDir(this.dbPath)
    this.loadState()
  }

  private ensureDir(dirPath: string) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
    } catch (err) {
      console.error('Failed to create directory:', dirPath, err)
    }
  }

  private loadState() {
    try {
      const stateFile = path.join(this.dbPath, 'downloads.json')
      if (fs.existsSync(stateFile)) {
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
        for (const item of data) {
          // Reset any downloading items to paused on load
          if (item.status === 'downloading' || item.status === 'assembling') {
            item.status = 'paused'
            item.speed = 0
            item.eta = 0
          }
          this.downloads.set(item.id, item)
        }
      }
    } catch (err) {
      console.error('Failed to load state:', err)
    }
  }

  private saveState() {
    try {
      const stateFile = path.join(this.dbPath, 'downloads.json')
      const data = Array.from(this.downloads.values())
      fs.writeFileSync(stateFile, JSON.stringify(data, null, 2))
    } catch (err) {
      console.error('Failed to save state:', err)
    }
  }

  /**
   * Probe a URL to get file info (size, resumability, filename)
   */
  private probeUrl(url: string, headers?: Record<string, string>): Promise<{
    fileSize: number
    resumable: boolean
    fileName: string
    finalUrl: string
  }> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url)
      const client = urlObj.protocol === 'https:' ? https : http
      
      const options: http.RequestOptions = {
        method: 'HEAD',
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'User-Agent': 'QDM/1.0 (Quantum Download Manager)',
          ...(headers || {})
        },
        timeout: 15000,
      }

      const req = client.request(options, (res) => {
        // Handle redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).toString()
          this.probeUrl(redirectUrl, headers).then(resolve).catch(reject)
          return
        }

        const fileSize = parseInt(res.headers['content-length'] || '-1', 10)
        const acceptRanges = res.headers['accept-ranges']
        const resumable = acceptRanges === 'bytes' || fileSize > 0
        const hdrs = res.headers as Record<string, string | string[]>
        const fileName = getFileNameFromHeaders(hdrs, url)
        
        resolve({
          fileSize,
          resumable,
          fileName,
          finalUrl: url,
        })
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Connection timeout'))
      })
      req.end()
    })
  }

  /**
   * Add a new download
   */
  async addDownload(request: NewDownloadRequest): Promise<DownloadItem> {
    let fileSize = -1
    let resumable = false
    let fileName = request.fileName || getFileNameFromUrl(request.url)

    // Probe the URL
    try {
      const probe = await this.probeUrl(request.url, request.headers)
      fileSize = probe.fileSize
      resumable = probe.resumable
      if (!request.fileName) {
        fileName = probe.fileName
      }
    } catch (err) {
      console.warn('Probe failed, will attempt download anyway:', err)
    }

    const savePath = request.savePath || this.config.downloadDir
    this.ensureDir(savePath)

    const item: DownloadItem = {
      id: generateId(),
      url: request.url,
      fileName,
      fileSize,
      downloaded: 0,
      progress: 0,
      speed: 0,
      eta: 0,
      status: 'queued',
      category: getCategory(fileName),
      dateAdded: new Date().toISOString(),
      savePath,
      resumable,
      segments: [],
      maxSegments: request.maxSegments || this.config.maxSegmentsPerDownload,
      headers: request.headers,
    }

    this.downloads.set(item.id, item)
    this.saveState()
    this.emit('download:added', item)

    if (request.autoStart !== false) {
      await this.startDownload(item.id)
    }

    return item
  }

  /**
   * Initialize segments for a download (XDM-style piece splitting)
   */
  private initializeSegments(item: DownloadItem): DownloadSegment[] {
    const segments: DownloadSegment[] = []
    
    if (item.fileSize <= 0 || !item.resumable) {
      // Unknown size or not resumable: single segment
      segments.push({
        id: generateId(),
        offset: 0,
        length: item.fileSize > 0 ? item.fileSize : -1,
        downloaded: 0,
        state: 0, // NotStarted
        speed: 0,
      })
    } else {
      // Split into segments (like XDM's piece system)
      const segmentCount = Math.min(item.maxSegments, Math.max(1, Math.floor(item.fileSize / (256 * 1024))))
      const segmentSize = Math.floor(item.fileSize / segmentCount)
      
      for (let i = 0; i < segmentCount; i++) {
        const offset = i * segmentSize
        const length = (i === segmentCount - 1) 
          ? (item.fileSize - offset) 
          : segmentSize
        
        segments.push({
          id: generateId(),
          offset,
          length,
          downloaded: 0,
          state: 0, // NotStarted
          speed: 0,
        })
      }
    }

    return segments
  }

  /**
   * Download a single segment using HTTP Range requests
   */
  private downloadSegment(
    active: ActiveDownload,
    segment: DownloadSegment,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const item = active.item
      const urlObj = new URL(item.url)
      const client = urlObj.protocol === 'https:' ? https : http
      const abortController = new AbortController()
      active.abortControllers.set(segment.id, abortController)

      const headers: Record<string, string> = {
        'User-Agent': 'QDM/1.0 (Quantum Download Manager)',
        ...(item.headers || {}),
      }

      // Set Range header for resumable downloads
      if (item.resumable && segment.length > 0) {
        const start = segment.offset + segment.downloaded
        const end = segment.offset + segment.length - 1
        headers['Range'] = `bytes=${start}-${end}`
      }

      const options: http.RequestOptions = {
        method: 'GET',
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        headers,
        timeout: 30000,
      }

      // Create temp file for this segment
      const tempDir = path.join(this.dbPath, item.id)
      this.ensureDir(tempDir)
      const segmentFile = path.join(tempDir, segment.id + '.part')
      const writeStream = fs.createWriteStream(segmentFile, { flags: 'a' })

      const req = client.request(options, (res) => {
        // Handle redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          writeStream.close()
          item.url = new URL(res.headers.location, item.url).toString()
          this.downloadSegment(active, segment).then(resolve).catch(reject)
          return
        }

        if (res.statusCode && res.statusCode >= 400) {
          writeStream.close()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        segment.state = 1 // Downloading

        res.on('data', (chunk: Buffer) => {
          if (abortController.signal.aborted) {
            res.destroy()
            return
          }
          
          writeStream.write(chunk)
          segment.downloaded += chunk.length
          segment.speed = chunk.length
          item.downloaded += chunk.length
        })

        res.on('end', () => {
          writeStream.close()
          segment.state = 2 // Finished
          active.abortControllers.delete(segment.id)
          resolve()
        })

        res.on('error', (err) => {
          writeStream.close()
          segment.state = 3 // Failed
          active.abortControllers.delete(segment.id)
          reject(err)
        })
      })

      req.on('error', (err) => {
        writeStream.close()
        segment.state = 3
        active.abortControllers.delete(segment.id)
        reject(err)
      })

      req.on('timeout', () => {
        req.destroy()
        writeStream.close()
        segment.state = 3
        reject(new Error('Segment timeout'))
      })

      // Handle abort
      abortController.signal.addEventListener('abort', () => {
        req.destroy()
        writeStream.close()
      })

      req.end()
    })
  }

  /**
   * Assemble all segments into the final file (XDM-style piece assembly)
   */
  private async assembleFile(item: DownloadItem): Promise<void> {
    item.status = 'assembling'
    this.emitProgress(item)

    const finalPath = path.join(item.savePath, item.fileName)
    const tempDir = path.join(this.dbPath, item.id)
    
    // Sort segments by offset
    const sortedSegments = [...item.segments].sort((a, b) => a.offset - b.offset)
    
    const writeStream = fs.createWriteStream(finalPath)
    
    for (const segment of sortedSegments) {
      const segmentFile = path.join(tempDir, segment.id + '.part')
      if (fs.existsSync(segmentFile)) {
        const data = fs.readFileSync(segmentFile)
        writeStream.write(data)
      }
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
      writeStream.end()
    })

    // Clean up temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  }

  /**
   * Start or resume a download with parallel segments
   */
  async startDownload(id: string): Promise<DownloadItem | null> {
    const item = this.downloads.get(id)
    if (!item) return null

    if (item.status === 'downloading') return item

    // Initialize segments if not already done
    if (item.segments.length === 0) {
      item.segments = this.initializeSegments(item)
    }

    item.status = 'downloading'
    item.error = undefined

    const active: ActiveDownload = {
      item,
      abortControllers: new Map(),
      startTime: Date.now(),
      bytesAtStart: item.downloaded,
      lastSpeedCalcTime: Date.now(),
      lastSpeedCalcBytes: item.downloaded,
    }

    this.activeDownloads.set(id, active)

    // Progress reporting interval
    active.progressInterval = setInterval(() => {
      this.calculateSpeed(active)
      this.emitProgress(item)
      this.saveState()
    }, 500)

    this.emit('download:started', item)

    // Download all segments in parallel
    const pendingSegments = item.segments.filter(s => s.state !== 2) // Not finished
    
    try {
      await Promise.all(
        pendingSegments.map(segment => 
          this.downloadSegment(active, segment).catch(err => {
            console.error(`Segment ${segment.id} failed:`, err.message)
            segment.state = 3 // Failed
          })
        )
      )

      // Check if all segments completed
      const allDone = item.segments.every(s => s.state === 2)
      
      if (allDone) {
        // Assemble the file
        if (item.segments.length > 1) {
          await this.assembleFile(item)
        } else {
          // Single segment - just move the file
          const tempDir = path.join(this.dbPath, item.id)
          const segmentFile = path.join(tempDir, item.segments[0].id + '.part')
          const finalPath = path.join(item.savePath, item.fileName)
          
          if (fs.existsSync(segmentFile)) {
            fs.copyFileSync(segmentFile, finalPath)
            try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
          }
        }

        item.status = 'completed'
        item.progress = 100
        item.speed = 0
        item.eta = 0
        item.dateCompleted = new Date().toISOString()
        this.emit('download:completed', item)
      } else {
        // Some segments failed
        const anyAborted = item.status === 'paused' || item.status === 'stopped'
        if (!anyAborted) {
          item.status = 'failed'
          item.error = 'Some segments failed to download'
          this.emit('download:failed', { id: item.id, error: item.error })
        }
      }
    } catch (err: any) {
      if (item.status !== 'paused' && item.status !== 'stopped') {
        item.status = 'failed'
        item.error = err.message || 'Download failed'
        this.emit('download:failed', { id: item.id, error: item.error })
      }
    } finally {
      if (active.progressInterval) {
        clearInterval(active.progressInterval)
      }
      this.activeDownloads.delete(id)
      item.speed = 0
      this.saveState()
      this.emitProgress(item)
    }

    return item
  }

  /**
   * Calculate download speed using moving average (inspired by XDM's approach)
   */
  private calculateSpeed(active: ActiveDownload) {
    const now = Date.now()
    const elapsed = (now - active.lastSpeedCalcTime) / 1000
    
    if (elapsed > 0) {
      const bytesDownloaded = active.item.downloaded - active.lastSpeedCalcBytes
      const instantSpeed = bytesDownloaded / elapsed
      active.item.speed = Math.max(0, instantSpeed)
      
      if (active.item.fileSize > 0 && active.item.speed > 0) {
        const remaining = active.item.fileSize - active.item.downloaded
        active.item.eta = Math.ceil(remaining / active.item.speed)
        active.item.progress = Math.min(100, Math.floor(
          (active.item.downloaded / active.item.fileSize) * 100
        ))
      }

      active.lastSpeedCalcTime = now
      active.lastSpeedCalcBytes = active.item.downloaded
    }
  }

  private emitProgress(item: DownloadItem) {
    const progress: DownloadProgress = {
      id: item.id,
      downloaded: item.downloaded,
      progress: item.progress,
      speed: item.speed,
      eta: item.eta,
      segments: item.segments,
      status: item.status,
    }
    this.emit('download:progress', progress)
  }

  /**
   * Pause a download - cancels all active segment connections
   */
  async pauseDownload(id: string): Promise<DownloadItem | null> {
    const item = this.downloads.get(id)
    if (!item) return null

    const active = this.activeDownloads.get(id)
    if (active) {
      item.status = 'paused'
      // Abort all segment connections
      for (const [, controller] of active.abortControllers) {
        controller.abort()
      }
      if (active.progressInterval) {
        clearInterval(active.progressInterval)
      }
    } else {
      item.status = 'paused'
    }

    item.speed = 0
    item.eta = 0
    this.saveState()
    this.emit('download:paused', item)
    this.emitProgress(item)
    return item
  }

  /**
   * Resume a paused download
   */
  async resumeDownload(id: string): Promise<DownloadItem | null> {
    const item = this.downloads.get(id)
    if (!item) return null
    if (item.status !== 'paused' && item.status !== 'failed') return item

    // Reset failed segments to not-started
    for (const segment of item.segments) {
      if (segment.state === 3) { // Failed
        segment.state = 0 // NotStarted
      }
    }

    return this.startDownload(id)
  }

  /**
   * Cancel and remove a download
   */
  async cancelDownload(id: string): Promise<boolean> {
    const item = this.downloads.get(id)
    if (!item) return false

    const active = this.activeDownloads.get(id)
    if (active) {
      item.status = 'stopped'
      for (const [, controller] of active.abortControllers) {
        controller.abort()
      }
      if (active.progressInterval) {
        clearInterval(active.progressInterval)
      }
    }

    item.status = 'stopped'
    item.speed = 0

    // Clean up temp files
    const tempDir = path.join(this.dbPath, item.id)
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}

    this.saveState()
    this.emit('download:cancelled', { id })
    return true
  }

  /**
   * Remove a download from the list
   */
  async removeDownload(id: string, deleteFile: boolean): Promise<boolean> {
    await this.cancelDownload(id)
    const item = this.downloads.get(id)
    
    if (item && deleteFile) {
      const filePath = path.join(item.savePath, item.fileName)
      try { fs.unlinkSync(filePath) } catch {}
    }

    this.downloads.delete(id)
    this.activeDownloads.delete(id)
    this.saveState()
    this.emit('download:removed', { id })
    return true
  }

  /**
   * Retry a failed download
   */
  async retryDownload(id: string): Promise<DownloadItem | null> {
    const item = this.downloads.get(id)
    if (!item) return null

    // Reset all segments
    for (const segment of item.segments) {
      if (segment.state !== 2) { // Not finished
        segment.state = 0
        segment.downloaded = 0
      }
    }

    // Recalculate downloaded
    item.downloaded = item.segments.reduce((sum, s) => sum + s.downloaded, 0)
    item.error = undefined

    return this.startDownload(id)
  }

  /**
   * Get all downloads
   */
  getAllDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values()).sort(
      (a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
    )
  }

  /**
   * Open downloaded file
   */
  async openFile(id: string): Promise<boolean> {
    const item = this.downloads.get(id)
    if (!item || item.status !== 'completed') return false
    
    const filePath = path.join(item.savePath, item.fileName)
    try {
      await shell.openPath(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Open containing folder
   */
  async openFolder(id: string): Promise<boolean> {
    const item = this.downloads.get(id)
    if (!item) return false
    
    const filePath = path.join(item.savePath, item.fileName)
    try {
      shell.showItemInFolder(filePath)
      return true
    } catch {
      return false
    }
  }
}
