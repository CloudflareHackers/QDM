/// <reference types="vite/client" />

interface Window {
  qdmAPI: {
    window: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
    }
    download: {
      add: (request: any) => Promise<any>
      start: (id: string) => Promise<any>
      pause: (id: string) => Promise<any>
      resume: (id: string) => Promise<any>
      cancel: (id: string) => Promise<boolean>
      remove: (id: string, deleteFile: boolean) => Promise<boolean>
      retry: (id: string) => Promise<any>
      getAll: () => Promise<any[]>
      openFile: (id: string) => Promise<boolean>
      openFolder: (id: string) => Promise<boolean>
    }
    browser: {
      getMediaList: () => Promise<any[]>
      clearMedia: () => Promise<boolean>
      downloadMedia: (mediaId: string) => Promise<any>
      getStatus: () => Promise<{ running: boolean; port: number; config: any; mediaCount: number }>
      setConfig: (config: any) => Promise<any>
    }
    clipboard: {
      getEnabled: () => Promise<boolean>
      setEnabled: (enabled: boolean) => Promise<boolean>
    }
    queue: {
      getAll: () => Promise<any[]>
      create: (name: string, maxConcurrent: number) => Promise<any>
      update: (id: string, updates: any) => Promise<any>
      delete: (id: string) => Promise<boolean>
      addDownloads: (queueId: string, downloadIds: string[]) => Promise<boolean>
      setSchedule: (queueId: string, schedule: any) => Promise<boolean>
    }
    config: {
      get: () => Promise<any>
      set: (config: any) => Promise<any>
    }
    dialog: {
      selectFolder: () => Promise<string | null>
    }
    shell: {
      openExternal: (url: string) => Promise<void>
    }
    on: (channel: string, callback: (...args: any[]) => void) => () => void
    removeAllListeners: (channel: string) => void
  }
}
