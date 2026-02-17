/**
 * Utility functions for formatting values
 */

export function formatBytes(bytes: number): string {
  if (bytes < 0) return 'Unknown'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '—'
  return formatBytes(bytesPerSec) + '/s'
}

export function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return '—'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

export function truncateFileName(name: string, maxLength: number = 40): string {
  if (name.length <= maxLength) return name
  const ext = name.lastIndexOf('.')
  if (ext > 0) {
    const extension = name.substring(ext)
    const base = name.substring(0, maxLength - extension.length - 3)
    return base + '...' + extension
  }
  return name.substring(0, maxLength - 3) + '...'
}

export function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const icons: Record<string, string> = {
    // Archives
    zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
    // Documents
    pdf: '📄', doc: '📄', docx: '📄', txt: '📝', csv: '📊',
    xls: '📊', xlsx: '📊', ppt: '📊', pptx: '📊',
    // Media
    mp3: '🎵', flac: '🎵', wav: '🎵', ogg: '🎵', m4a: '🎵',
    mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬', webm: '🎬',
    // Images
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
    // Programs
    exe: '⚙️', msi: '⚙️', dmg: '⚙️', deb: '⚙️', apk: '📱',
    // Code
    js: '💻', ts: '💻', py: '💻', java: '💻', cpp: '💻',
  }
  return icons[ext] || '📎'
}
