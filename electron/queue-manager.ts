/**
 * QDM - Download Queue & Scheduler
 * 
 * Inspired by XDM's QueueManager and Scheduler.
 * Manages download queues with scheduling, concurrency limits,
 * and automatic queue processing.
 */

import * as fs from 'fs'
import * as path from 'path'

export interface DownloadQueue {
  id: string
  name: string
  downloadIds: string[]
  maxConcurrent: number
  enabled: boolean
  schedule: QueueSchedule | null
}

export interface QueueSchedule {
  enabled: boolean
  startTime: string   // HH:mm format
  endTime: string     // HH:mm format
  days: number[]      // 0=Sun, 1=Mon, ..., 6=Sat
}

type EventCallback = (event: string, data: any) => void

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

export class QueueManager {
  private queues: Map<string, DownloadQueue> = new Map()
  private emit: EventCallback
  private dbPath: string
  private schedulerInterval: ReturnType<typeof setInterval> | null = null

  constructor(dbPath: string, emit: EventCallback) {
    this.emit = emit
    this.dbPath = dbPath
    this.loadQueues()
    
    // Create default queue if none exist
    if (this.queues.size === 0) {
      const defaultQueue: DownloadQueue = {
        id: generateId(),
        name: 'Default Queue',
        downloadIds: [],
        maxConcurrent: 3,
        enabled: true,
        schedule: null,
      }
      this.queues.set(defaultQueue.id, defaultQueue)
      this.saveQueues()
    }
  }

  startScheduler() {
    if (this.schedulerInterval) return
    
    this.schedulerInterval = setInterval(() => {
      this.checkSchedules()
    }, 60000) // Check every minute
  }

  stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval)
      this.schedulerInterval = null
    }
  }

  getQueues(): DownloadQueue[] {
    return Array.from(this.queues.values())
  }

  getQueue(id: string): DownloadQueue | undefined {
    return this.queues.get(id)
  }

  getDefaultQueue(): DownloadQueue {
    return this.queues.values().next().value!
  }

  createQueue(name: string, maxConcurrent: number = 3): DownloadQueue {
    const queue: DownloadQueue = {
      id: generateId(),
      name,
      downloadIds: [],
      maxConcurrent,
      enabled: true,
      schedule: null,
    }
    this.queues.set(queue.id, queue)
    this.saveQueues()
    this.emit('queue:created', queue)
    return queue
  }

  updateQueue(id: string, updates: Partial<DownloadQueue>): DownloadQueue | null {
    const queue = this.queues.get(id)
    if (!queue) return null
    Object.assign(queue, updates)
    this.saveQueues()
    this.emit('queue:updated', queue)
    return queue
  }

  deleteQueue(id: string): boolean {
    if (this.queues.size <= 1) return false // Can't delete last queue
    const deleted = this.queues.delete(id)
    if (deleted) {
      this.saveQueues()
      this.emit('queue:deleted', { id })
    }
    return deleted
  }

  addToQueue(queueId: string, downloadIds: string[]): boolean {
    const queue = this.queues.get(queueId)
    if (!queue) return false

    // Remove from other queues first
    const idSet = new Set(downloadIds)
    for (const [, q] of this.queues) {
      q.downloadIds = q.downloadIds.filter(id => !idSet.has(id))
    }

    // Add to target queue
    for (const id of downloadIds) {
      if (!queue.downloadIds.includes(id)) {
        queue.downloadIds.push(id)
      }
    }

    this.saveQueues()
    this.emit('queue:updated', queue)
    return true
  }

  removeFromQueue(queueId: string, downloadId: string): boolean {
    const queue = this.queues.get(queueId)
    if (!queue) return false
    queue.downloadIds = queue.downloadIds.filter(id => id !== downloadId)
    this.saveQueues()
    return true
  }

  removeFinishedDownload(downloadId: string) {
    for (const [, queue] of this.queues) {
      queue.downloadIds = queue.downloadIds.filter(id => id !== downloadId)
    }
    this.saveQueues()
  }

  setSchedule(queueId: string, schedule: QueueSchedule | null): boolean {
    const queue = this.queues.get(queueId)
    if (!queue) return false
    queue.schedule = schedule
    this.saveQueues()
    this.emit('queue:updated', queue)
    return true
  }

  getNextDownloadIds(queueId: string, currentActiveCount: number): string[] {
    const queue = this.queues.get(queueId)
    if (!queue || !queue.enabled) return []
    
    const slotsAvailable = Math.max(0, queue.maxConcurrent - currentActiveCount)
    if (slotsAvailable === 0) return []

    // Check schedule
    if (queue.schedule?.enabled && !this.isWithinSchedule(queue.schedule)) {
      return []
    }

    return queue.downloadIds.slice(0, slotsAvailable)
  }

  private checkSchedules() {
    for (const [, queue] of this.queues) {
      if (queue.schedule?.enabled) {
        const withinSchedule = this.isWithinSchedule(queue.schedule)
        this.emit('queue:schedule-check', { 
          queueId: queue.id, 
          active: withinSchedule,
          queueName: queue.name,
        })
      }
    }
  }

  private isWithinSchedule(schedule: QueueSchedule): boolean {
    const now = new Date()
    const currentDay = now.getDay()
    
    if (!schedule.days.includes(currentDay)) return false
    
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const [startH, startM] = schedule.startTime.split(':').map(Number)
    const [endH, endM] = schedule.endTime.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM
    
    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes
    } else {
      // Wraps around midnight
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes
    }
  }

  private loadQueues() {
    try {
      const file = path.join(this.dbPath, 'queues.json')
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
        for (const q of data) {
          this.queues.set(q.id, q)
        }
      }
    } catch (err) {
      console.error('Failed to load queues:', err)
    }
  }

  private saveQueues() {
    try {
      const file = path.join(this.dbPath, 'queues.json')
      const data = Array.from(this.queues.values())
      fs.writeFileSync(file, JSON.stringify(data, null, 2))
    } catch (err) {
      console.error('Failed to save queues:', err)
    }
  }
}
