/**
 * QDM - Browser Monitor Server
 * 
 * Inspired by XDM's BrowserMonitor / IpcHttpMessageProcessor
 * Runs a local HTTP server on port 8597 that receives messages from
 * browser extensions (Chrome, Firefox, Edge, Opera, Brave, Vivaldi).
 * 
 * The extension intercepts downloads and media URLs, sends them here,
 * and QDM takes over the download with multi-segment acceleration.
 * 
 * Protocol endpoints (matching XDM for extension compatibility):
 *   POST /download  — Intercepted file download
 *   POST /media     — Detected media/video stream  
 *   POST /vid       — User clicked download on a detected video
 *   POST /tab-update — Tab title changed (updates video names)
 *   POST /clear     — Clear video list
 *   POST /link      — Batch link collection
 *   GET  /sync      — Extension polls for config & video list
 */

import * as http from 'http'
import { URL } from 'url'

export interface BrowserMessage {
  url: string
  file?: string
  method?: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  cookie?: string
  tabUrl?: string
  tabTitle?: string
  tabId?: string
  vid?: string
  contentType?: string
  contentLength?: number
  quality?: string
}

export interface MediaItem {
  id: string
  name: string
  description: string
  tabUrl: string
  tabId: string
  dateAdded: string
  url: string
  audioUrl?: string
  type: 'video' | 'audio' | 'hls' | 'dash' | 'youtube'
  size: number
  contentType: string
  headers?: Record<string, string>
  cookies?: string
}

export interface BrowserMonitorConfig {
  enabled: boolean
  fileExtensions: string[]
  videoExtensions: string[]
  blockedHosts: string[]
  mediaTypes: string[]
  tabsWatcher: string[]
  matchingHosts: string[]
}

type EventCallback = (event: string, data: any) => void

const DEFAULT_CONFIG: BrowserMonitorConfig = {
  enabled: true,
  fileExtensions: [
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
    '.exe', '.msi', '.dmg', '.deb', '.rpm', '.appimage', '.apk',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.mp3', '.flac', '.wav', '.aac', '.ogg', '.wma', '.m4a', '.opus',
    '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v',
    '.iso', '.img', '.bin', '.torrent',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
    '.epub', '.mobi', '.azw3',
  ],
  videoExtensions: [
    '.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.m4v',
    '.ts', '.m3u8', '.mpd', '.f4m',
    '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.wav',
  ],
  blockedHosts: [
    'update.googleapis.com', 'safebrowsing.googleapis.com',
    'clients2.google.com', 'clients1.google.com',
    'translate.googleapis.com',
  ],
  mediaTypes: ['audio/', 'video/'],
  tabsWatcher: ['.youtube.', '/watch?v='],
  matchingHosts: ['googlevideo'],
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

export class BrowserMonitor {
  private server: http.Server | null = null
  private port: number = 8597
  private config: BrowserMonitorConfig
  private mediaList: Map<string, MediaItem> = new Map()
  private emit: EventCallback

  constructor(emit: EventCallback) {
    this.config = { ...DEFAULT_CONFIG }
    this.emit = emit
  }

  start() {
    if (this.server) return

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res)
    })

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[QDM] Browser monitor listening on http://127.0.0.1:${this.port}`)
      this.emit('browser-monitor:started', { port: this.port })
    })

    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[QDM] Port ${this.port} in use, trying ${this.port + 1}`)
        this.port++
        this.server?.close()
        this.server = null
        this.start()
      } else {
        console.error('[QDM] Browser monitor error:', err)
      }
    })
  }

  stop() {
    this.server?.close()
    this.server = null
  }

  getConfig(): BrowserMonitorConfig {
    return this.config
  }

  setConfig(config: Partial<BrowserMonitorConfig>) {
    Object.assign(this.config, config)
  }

  getMediaList(): MediaItem[] {
    return Array.from(this.mediaList.values()).sort(
      (a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
    )
  }

  clearMediaList() {
    this.mediaList.clear()
    this.emit('media:cleared', {})
  }

  getPort(): number {
    return this.port
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // CORS headers for browser extension
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Cache-Control', 'max-age=0, no-cache, must-revalidate')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const path = req.url || '/'
        
        switch (path) {
          case '/sync':
            // Extension polling for config
            break
          case '/download':
            this.onDownloadMessage(body)
            break
          case '/media':
            this.onMediaMessage(body)
            break
          case '/vid':
            this.onVideoDownloadMessage(body)
            break
          case '/tab-update':
            this.onTabUpdateMessage(body)
            break
          case '/clear':
            this.clearMediaList()
            break
          case '/link':
            this.onBatchMessage(body)
            break
          default:
            break
        }

        // Always respond with sync config
        this.sendSyncResponse(res)
      } catch (err) {
        console.error('[QDM] Browser monitor error:', err)
        res.writeHead(500)
        res.end('Internal Server Error')
      }
    })
  }

  private onDownloadMessage(body: string) {
    try {
      const msg: BrowserMessage = JSON.parse(body)
      if (!msg.url) return

      // Check if URL should be blocked
      if (this.isBlockedUrl(msg.url)) return

      // Check file extension
      const shouldIntercept = this.shouldInterceptUrl(msg.url, msg.contentType)
      if (!shouldIntercept) return

      this.emit('browser:download', {
        url: msg.url,
        fileName: msg.file,
        headers: this.cleanHeaders(msg.requestHeaders),
        cookies: msg.cookie,
        referer: msg.tabUrl,
        tabUrl: msg.tabUrl,
      })
    } catch (err) {
      console.error('[QDM] Error parsing download message:', err)
    }
  }

  private onMediaMessage(body: string) {
    try {
      const msg: BrowserMessage = JSON.parse(body)
      if (!msg.url) return

      const contentType = msg.contentType || 
        msg.responseHeaders?.['content-type'] || 
        msg.responseHeaders?.['Content-Type'] || ''
      const contentLength = msg.contentLength || 0

      // STRICT FILTER: only accept real media, not web junk
      const ct = contentType.toLowerCase()
      if (ct.startsWith('text/') || ct.includes('javascript') || ct.includes('json') || 
          ct.includes('xml') || ct.startsWith('font/') || ct.startsWith('image/svg')) {
        return // Skip web resources
      }

      const isYouTubeStream = this.isYouTube(msg.url, msg.tabUrl)

      // Skip tiny files (< 500KB) — UNLESS it's YouTube (which uses chunked ranges)
      if (!isYouTubeStream && contentLength > 0 && contentLength < 500 * 1024) return

      // Detect media type
      let type: MediaItem['type'] = 'video'
      if (this.isHLS(contentType, msg.url)) {
        type = 'hls'
      } else if (this.isDASH(contentType, msg.url)) {
        type = 'dash'
      } else if (this.isYouTube(msg.url, msg.tabUrl)) {
        type = 'youtube'
      } else if (ct.startsWith('audio/')) {
        type = 'audio'
      }

      // Use tab title as name for YouTube, otherwise extract from URL
      let name = ''
      if (type === 'youtube' && msg.file && !msg.file.includes('/')) {
        name = msg.file.replace(/ - YouTube$/, '') + '.mp4'
      } else {
        name = this.getFileNameFromUrl(msg.url)
      }

      const id = generateId()
      const media: MediaItem = {
        id,
        name,
        description: this.getMediaDescription(msg, type),
        tabUrl: msg.tabUrl || '',
        tabId: msg.tabId || '',
        dateAdded: new Date().toISOString(),
        url: msg.url,
        type,
        size: contentLength,
        contentType,
        headers: this.cleanHeaders(msg.requestHeaders),
        cookies: msg.cookie,
      }

      // For YouTube: strip range params to get base URL, deduplicate by that
      let dedupeUrl = msg.url
      if (isYouTubeStream) {
        dedupeUrl = this.getYouTubeBaseUrl(msg.url)
        // Use quality from extension (itag), or extract ourselves
        const quality = msg.quality || this.getYouTubeQuality(msg.url)
        if (quality) {
          media.description += ` • ${quality}`
        }
        // Use the base URL (without range) for downloading
        media.url = dedupeUrl
      }

      // Deduplicate: don't add if we already have this base URL
      for (const [, existing] of this.mediaList) {
        const existingBase = this.isYouTube(existing.url, '') ? this.getYouTubeBaseUrl(existing.url) : existing.url
        if (existingBase === dedupeUrl) return
      }

      this.mediaList.set(id, media)
      this.emit('media:added', media)
    } catch (err) {
      console.error('[QDM] Error parsing media message:', err)
    }
  }

  private onVideoDownloadMessage(body: string) {
    try {
      const msg: BrowserMessage = JSON.parse(body)
      if (!msg.vid) return

      const media = this.mediaList.get(msg.vid)
      if (media) {
        this.emit('media:download', media)
      }
    } catch (err) {
      console.error('[QDM] Error parsing video download message:', err)
    }
  }

  private onTabUpdateMessage(body: string) {
    try {
      const msg: BrowserMessage = JSON.parse(body)
      if (!msg.tabUrl || !msg.tabTitle) return

      // Update media names based on tab title
      for (const [id, media] of this.mediaList) {
        if (media.tabUrl === msg.tabUrl) {
          const ext = media.name.includes('.') ? '.' + media.name.split('.').pop() : ''
          media.name = this.sanitizeFileName(msg.tabTitle) + ext
          this.emit('media:updated', media)
        }
      }
    } catch (err) {
      console.error('[QDM] Error parsing tab update:', err)
    }
  }

  private onBatchMessage(body: string) {
    try {
      const messages: BrowserMessage[] = JSON.parse(body)
      if (!Array.isArray(messages)) return

      const links = messages
        .filter(msg => msg.url)
        .map(msg => ({
          url: msg.url,
          fileName: msg.file,
          headers: this.cleanHeaders(msg.requestHeaders),
        }))

      if (links.length > 0) {
        this.emit('browser:batch', links)
      }
    } catch (err) {
      console.error('[QDM] Error parsing batch message:', err)
    }
  }

  private sendSyncResponse(res: http.ServerResponse) {
    const videoList = this.getMediaList().map(m => ({
      id: m.id,
      text: m.name,
      info: m.description,
      tabId: m.tabId,
      size: m.size,
      type: m.type,
    }))

    const config = {
      enabled: this.config.enabled,
      fileExts: this.config.fileExtensions,
      blockedHosts: this.config.blockedHosts,
      requestFileExts: this.config.videoExtensions,
      mediaTypes: this.config.mediaTypes,
      tabsWatcher: this.config.tabsWatcher,
      videoList,
      matchingHosts: this.config.matchingHosts,
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(config))
  }

  private isBlockedUrl(url: string): boolean {
    try {
      const urlObj = new URL(url)
      return this.config.blockedHosts.some(host => urlObj.hostname.includes(host))
    } catch {
      return false
    }
  }

  private shouldInterceptUrl(url: string, contentType?: string): boolean {
    const urlLower = url.toLowerCase()
    
    // Check file extensions
    if (this.config.fileExtensions.some(ext => urlLower.includes(ext))) {
      return true
    }

    // Check content type
    if (contentType) {
      const ct = contentType.toLowerCase()
      if (ct.includes('application/octet-stream') ||
          ct.includes('application/zip') ||
          ct.includes('application/x-rar') ||
          ct.includes('application/pdf') ||
          ct.includes('application/x-msdownload') ||
          ct.includes('application/x-iso')) {
        return true
      }
    }

    return false
  }

  private isHLS(contentType: string, url: string): boolean {
    return contentType.includes('mpegurl') || 
           contentType.includes('x-mpegurl') ||
           url.toLowerCase().includes('.m3u8')
  }

  private isDASH(contentType: string, url: string): boolean {
    return contentType.includes('dash+xml') || 
           contentType.includes('dash') ||
           url.toLowerCase().includes('.mpd')
  }

  private isYouTube(url: string, tabUrl?: string): boolean {
    return (url.includes('googlevideo.com') || url.includes('youtube.com')) ||
           (tabUrl?.includes('youtube.com/watch') ?? false)
  }

  /**
   * Strip range parameter from YouTube URL to get the full video URL
   * YouTube uses &range=0-12345 for chunked requests
   */
  private getYouTubeBaseUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      urlObj.searchParams.delete('range')
      urlObj.searchParams.delete('rn')    // request number
      urlObj.searchParams.delete('rbuf')  // buffer size
      return urlObj.toString()
    } catch {
      return url.replace(/&range=[^&]+/, '').replace(/&rn=[^&]+/, '')
    }
  }

  /**
   * Extract video quality from YouTube itag parameter
   * Reference: https://gist.github.com/sidneys/7095afe4da4ae58694d128b1034e01e2
   */
  private getYouTubeQuality(url: string): string {
    try {
      const urlObj = new URL(url)
      const itag = urlObj.searchParams.get('itag')
      const mime = urlObj.searchParams.get('mime') || ''
      
      if (!itag) return ''
      
      // Common YouTube itag to quality mapping
      const itagMap: Record<string, string> = {
        // Video + Audio (legacy)
        '18': '360p MP4', '22': '720p MP4',
        // Video only (DASH)
        '133': '240p', '134': '360p', '135': '480p',
        '136': '720p', '137': '1080p', '138': '4K',
        '160': '144p', '264': '1440p', '266': '2160p',
        '298': '720p60', '299': '1080p60', '302': '720p60',
        '303': '1080p60', '308': '1440p60', '315': '2160p60',
        // VP9
        '242': '240p VP9', '243': '360p VP9', '244': '480p VP9',
        '247': '720p VP9', '248': '1080p VP9', '271': '1440p VP9',
        '313': '2160p VP9', '302': '720p60 VP9', '303': '1080p60 VP9',
        // Audio only
        '139': 'Audio 48k', '140': 'Audio 128k', '141': 'Audio 256k',
        '171': 'Audio Vorbis', '249': 'Audio Opus 50k',
        '250': 'Audio Opus 70k', '251': 'Audio Opus 160k',
      }
      
      const quality = itagMap[itag]
      if (quality) return quality
      
      // Fallback: use mime type
      if (mime.includes('video')) return `Video (itag ${itag})`
      if (mime.includes('audio')) return `Audio (itag ${itag})`
      return `itag ${itag}`
    } catch {
      return ''
    }
  }

  private getFileNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      const name = urlObj.pathname.split('/').pop() || ''
      return decodeURIComponent(name) || 'media'
    } catch {
      return 'media'
    }
  }

  private getMediaDescription(msg: BrowserMessage, type: string): string {
    const parts: string[] = []
    if (type === 'youtube') parts.push('YouTube')
    else if (type === 'hls') parts.push('HLS Stream')
    else if (type === 'dash') parts.push('DASH Stream')
    else if (type === 'audio') parts.push('Audio')
    else parts.push('Video')
    
    if (msg.contentLength && msg.contentLength > 0) {
      parts.push(this.formatSize(msg.contentLength))
    }
    
    // Include quality if provided by extension
    if (msg.quality) {
      parts.push(msg.quality)
    }
    
    return parts.join(' • ')
  }

  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_').trim()
  }

  private cleanHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {}
    const blocked = new Set([
      'accept', 'if-none-match', 'if-modified-since', 'authorization', 
      'proxy-authorization', 'connection', 'expect', 'te', 'upgrade',
      'range', 'transfer-encoding', 'content-type', 'content-length', 'content-encoding',
    ])
    const cleaned: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      if (!blocked.has(key.toLowerCase())) {
        cleaned[key] = value
      }
    }
    return cleaned
  }
}
