'use client';

import React from 'react';
import { Minus, Plus, Layers, Palette, Copy } from 'lucide-react';
import { PageConfig } from '@/lib/pricing';

export interface PrintSettingsState {
  colorMode: 'bw' | 'color' | 'custom';
  isDuplex: boolean;
  copies: number;
  pageRangeType: 'all' | 'custom';
  customPageRange: string;
}

interface PrintSettingsProps {
  totalPages: number;
  settings: PrintSettingsState;
  onChange: (newSettings: PrintSettingsState) => void;
  bwCount?: number;
  colorCount?: number;
  pageConfigs?: PageConfig[];
  onPageConfigsChange?: (configs: PageConfig[]) => void;
}

export function PrintSettings({
  settings,
  onChange,
  bwCount,
  colorCount,
}: PrintSettingsProps) {
  const update = (partial: Partial<PrintSettingsState>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <div className="space-y-3">
      {/* 1. Color Mode */}
      <div className="card-premium rounded-2xl p-4 border border-white/8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Palette className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <span>Color Mode</span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            {settings.colorMode === 'custom'
              ? `${bwCount ?? 0} B&W + ${colorCount ?? 0} Color`
              : settings.colorMode === 'bw'
              ? '₹4 / ₹6 per sheet'
              : '₹7 / ₹10 per sheet'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update({ colorMode: 'bw' })}
            className={`relative flex items-center justify-center gap-2.5 py-3.5 px-3 rounded-xl border text-sm font-semibold transition-all duration-200 overflow-hidden ${
              settings.colorMode === 'bw'
                ? 'border-slate-400/60 bg-slate-700/40 text-white shadow-sm shadow-slate-400/10'
                : 'border-white/6 bg-slate-900/40 text-slate-400 hover:text-white hover:border-white/15 hover:bg-white/3'
            }`}
          >
            {settings.colorMode === 'bw' && (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-700/20 to-slate-800/20 pointer-events-none" />
            )}
            <span className="w-4 h-4 rounded-full bg-gradient-to-br from-slate-200 to-slate-500 border-2 border-slate-300/50 shrink-0" />
            <span>Black & White</span>
          </button>

          <button
            type="button"
            onClick={() => update({ colorMode: 'color' })}
            className={`relative flex items-center justify-center gap-2.5 py-3.5 px-3 rounded-xl border text-sm font-semibold transition-all duration-200 overflow-hidden ${
              settings.colorMode === 'color'
                ? 'border-pink-500/60 bg-pink-600/15 text-white shadow-sm shadow-pink-500/15'
                : 'border-white/6 bg-slate-900/40 text-slate-400 hover:text-white hover:border-white/15 hover:bg-white/3'
            }`}
          >
            {settings.colorMode === 'color' && (
              <div className="absolute inset-0 bg-gradient-to-br from-pink-600/10 to-violet-600/10 pointer-events-none" />
            )}
            <span className="w-4 h-4 rounded-full bg-gradient-to-br from-pink-500 via-violet-500 to-amber-400 shadow-sm shadow-pink-500/40 shrink-0" />
            <span>Full Color</span>
          </button>
        </div>

        {settings.colorMode === 'custom' && (
          <div className="mt-2.5 px-3 py-2 rounded-xl bg-indigo-500/8 border border-indigo-500/20 flex items-center justify-between text-xs">
            <span className="text-indigo-300 font-semibold">⚡ Hybrid Mixed Mode</span>
            <span className="text-slate-400 text-[11px]">
              Select above to force all pages one mode
            </span>
          </div>
        )}
      </div>

      {/* 2. Sides */}
      <div className="card-premium rounded-2xl p-4 border border-white/8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <span>Print Sides</span>
          </div>
          <span className="text-[11px] text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20">
            {settings.isDuplex ? 'Front & Back' : 'Single Side'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update({ isDuplex: false })}
            className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-xl border transition-all duration-200 ${
              !settings.isDuplex
                ? 'border-indigo-500/60 bg-indigo-600/15 text-white shadow-sm shadow-indigo-500/15'
                : 'border-white/6 bg-slate-900/40 text-slate-400 hover:text-white hover:border-white/15'
            }`}
          >
            <span className="text-sm font-semibold">Single-Sided</span>
            <span className="text-[11px] opacity-60 mt-0.5">1 page per sheet</span>
          </button>

          <button
            type="button"
            onClick={() => update({ isDuplex: true })}
            className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-xl border transition-all duration-200 ${
              settings.isDuplex
                ? 'border-indigo-500/60 bg-indigo-600/15 text-white shadow-sm shadow-indigo-500/15'
                : 'border-white/6 bg-slate-900/40 text-slate-400 hover:text-white hover:border-white/15'
            }`}
          >
            <span className="text-sm font-semibold">Double-Sided</span>
            <span className="text-[11px] opacity-60 mt-0.5">Front & Back (Save Paper)</span>
          </button>
        </div>
      </div>

      {/* 3. Copies */}
      <div className="card-premium rounded-2xl p-4 flex items-center justify-between border border-white/8">
        <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <Copy className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <span>Copies</span>
        </div>

        <div className="flex items-center space-x-1 bg-slate-950/80 border border-white/10 rounded-xl p-1">
          <button
            type="button"
            onClick={() => update({ copies: Math.max(1, settings.copies - 1) })}
            disabled={settings.copies <= 1}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-indigo-600/30 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <span className="text-base font-bold text-white font-mono px-3 tabular-nums min-w-[2.5rem] text-center">
            {settings.copies}
          </span>

          <button
            type="button"
            onClick={() => update({ copies: Math.min(50, settings.copies + 1) })}
            disabled={settings.copies >= 50}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-indigo-600/30 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
