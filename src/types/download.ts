/**
 * QDM - Quantum Download Manager
 * Download type definitions
 * 
 * Download engine architecture inspired by XDM (Xtreme Download Manager)
 * by subhra74 - https://github.com/subhra74/xdm
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
  state: SegmentState;
  speed: number;
}

export enum SegmentState {
  NotStarted = 0,
  Downloading = 1,
  Finished = 2,
  Failed = 3,
}

export interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;       // total bytes (-1 if unknown)
  downloaded: number;     // bytes downloaded so far
  progress: number;       // 0-100
  speed: number;          // bytes/sec
  eta: number;            // seconds remaining
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
  speedLimit: number;        // 0 = unlimited
  showNotifications: boolean;
  minimizeToTray: boolean;
  startWithWindows: boolean;
  theme: 'dark' | 'light';
}

export interface QueueConfig {
  id: string;
  name: string;
  downloadIds: string[];
  maxConcurrent: number;
  scheduleEnabled: boolean;
  scheduleStart?: string;
  scheduleEnd?: string;
}
