/**
 * Shared types for Electron main process
 */

export type DownloadStatus = 
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'assembling'
  | 'stopped';

export type DownloadCategory = 
  | 'all'
  | 'compressed'
  | 'documents'
  | 'music'
  | 'videos'
  | 'programs'
  | 'other';

export interface DownloadSegment {
  id: string;
  offset: number;
  length: number;
  downloaded: number;
  state: number;
  speed: number;
}

export interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  downloaded: number;
  progress: number;
  speed: number;
  eta: number;
  status: DownloadStatus;
  category: DownloadCategory;
  dateAdded: string;
  dateCompleted?: string;
  savePath: string;
  resumable: boolean;
  segments: DownloadSegment[];
  maxSegments: number;
  error?: string;
  headers?: Record<string, string>;
  userAgent?: string;
  referer?: string;
}

export interface NewDownloadRequest {
  url: string;
  fileName?: string;
  savePath?: string;
  headers?: Record<string, string>;
  maxSegments?: number;
  autoStart?: boolean;
}

export interface DownloadProgress {
  id: string;
  downloaded: number;
  progress: number;
  speed: number;
  eta: number;
  segments: DownloadSegment[];
  status: DownloadStatus;
}

export interface AppConfig {
  downloadDir: string;
  maxConcurrentDownloads: number;
  maxSegmentsPerDownload: number;
  speedLimit: number;
  showNotifications: boolean;
  minimizeToTray: boolean;
  startWithWindows: boolean;
  theme: 'dark' | 'light';
}
