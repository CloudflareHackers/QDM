/**
 * QDM - Preload Script
 * Bridges the Electron main process and the renderer (React UI)
 */

import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // Download operations
  download: {
    add: (request: any) => ipcRenderer.invoke('download:add', request),
    start: (id: string) => ipcRenderer.invoke('download:start', id),
    pause: (id: string) => ipcRenderer.invoke('download:pause', id),
    resume: (id: string) => ipcRenderer.invoke('download:resume', id),
    cancel: (id: string) => ipcRenderer.invoke('download:cancel', id),
    remove: (id: string, deleteFile: boolean) => ipcRenderer.invoke('download:remove', id, deleteFile),
    retry: (id: string) => ipcRenderer.invoke('download:retry', id),
    getAll: () => ipcRenderer.invoke('download:getAll'),
    openFile: (id: string) => ipcRenderer.invoke('download:openFile', id),
    openFolder: (id: string) => ipcRenderer.invoke('download:openFolder', id),
  },

  // Browser Monitor
  browser: {
    getMediaList: () => ipcRenderer.invoke('browser:getMediaList'),
    clearMedia: () => ipcRenderer.invoke('browser:clearMedia'),
    downloadMedia: (mediaId: string) => ipcRenderer.invoke('browser:downloadMedia', mediaId),
    getStatus: () => ipcRenderer.invoke('browser:getStatus'),
    setConfig: (config: any) => ipcRenderer.invoke('browser:setConfig', config),
  },

  // Clipboard
  clipboard: {
    getEnabled: () => ipcRenderer.invoke('clipboard:getEnabled'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('clipboard:setEnabled', enabled),
  },

  // Queue Manager
  queue: {
    getAll: () => ipcRenderer.invoke('queue:getAll'),
    create: (name: string, maxConcurrent: number) => ipcRenderer.invoke('queue:create', name, maxConcurrent),
    update: (id: string, updates: any) => ipcRenderer.invoke('queue:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('queue:delete', id),
    addDownloads: (queueId: string, downloadIds: string[]) => ipcRenderer.invoke('queue:addDownloads', queueId, downloadIds),
    setSchedule: (queueId: string, schedule: any) => ipcRenderer.invoke('queue:setSchedule', queueId, schedule),
  },

  // Update
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    getVersion: () => ipcRenderer.invoke('update:getVersion'),
    openRelease: (version?: string) => ipcRenderer.invoke('update:openRelease', version),
  },

  // Config
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (config: any) => ipcRenderer.invoke('config:set', config),
  },

  // Dialog
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  },

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // Event listeners
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'download:added', 'download:started', 'download:progress',
      'download:paused', 'download:completed', 'download:failed',
      'download:cancelled', 'download:removed',
      'media:added', 'media:updated', 'media:cleared', 'media:download',
      'browser:download', 'browser:batch',
      'browser-monitor:started',
      'clipboard:url',
      'queue:created', 'queue:updated', 'queue:deleted', 'queue:schedule-check',
      'update:available', 'update:current', 'update:error',
      'show-new-download',
    ]
    if (validChannels.includes(channel)) {
      const subscription = (_event: any, ...args: any[]) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => ipcRenderer.removeListener(channel, subscription)
    }
    return () => {}
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
}

contextBridge.exposeInMainWorld('qdmAPI', api)

export type QDMAPI = typeof api
