import React from 'react'
import { Minus, Square, X, Zap } from 'lucide-react'

const isElectron = typeof window !== 'undefined' && window.qdmAPI !== undefined

export function TitleBar() {
  return (
    <div className="titlebar-drag h-10 bg-qdm-surface/80 border-b border-qdm-border flex items-center justify-between px-4 shrink-0">
      {/* App Brand */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-gradient-to-br from-qdm-accent to-purple-400 flex items-center justify-center">
          <Zap size={12} className="text-white" />
        </div>
        <span className="text-xs font-semibold text-qdm-textSecondary tracking-wide uppercase">
          QDM
        </span>
        <span className="text-[10px] text-qdm-textMuted font-mono">v1.0.0</span>
      </div>

      {/* Window Controls */}
      <div className="titlebar-no-drag flex items-center gap-0.5">
        <button
          onClick={() => isElectron && window.qdmAPI.window.minimize()}
          className="w-8 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          title="Minimize"
        >
          <Minus size={14} className="text-qdm-textSecondary" />
        </button>
        <button
          onClick={() => isElectron && window.qdmAPI.window.maximize()}
          className="w-8 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          title="Maximize"
        >
          <Square size={11} className="text-qdm-textSecondary" />
        </button>
        <button
          onClick={() => isElectron && window.qdmAPI.window.close()}
          className="w-8 h-7 flex items-center justify-center rounded hover:bg-red-500/80 hover:text-white transition-colors"
          title="Close"
        >
          <X size={14} className="text-qdm-textSecondary hover:text-white" />
        </button>
      </div>
    </div>
  )
}
