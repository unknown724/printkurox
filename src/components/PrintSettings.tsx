'use client';

import React, { useState } from 'react';
import { Minus, Plus, Layers, Palette, Copy, FileSpreadsheet } from 'lucide-react';
import { parsePageRange } from '@/lib/pdf-utils';

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
}

export function PrintSettings({ totalPages, settings, onChange, bwCount, colorCount }: PrintSettingsProps) {
  const [rangeInput, setRangeInput] = useState(settings.customPageRange);

  const update = (partial: Partial<PrintSettingsState>) => {
    onChange({ ...settings, ...partial });
  };

  const selectedPagesCount = settings.pageRangeType === 'all'
    ? totalPages
    : parsePageRange(settings.customPageRange, totalPages).length;

  return (
    <div className="space-y-4">
      {/* 1. Color Mode Option */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <Palette className="w-4 h-4 text-indigo-400" />
            <span>Color Mode</span>
          </div>
          <span className="text-[11px] text-slate-400">
            {settings.colorMode === 'custom'
              ? `${bwCount || 0} B&W (₹4) + ${colorCount || 0} Color (₹7)`
              : settings.colorMode === 'bw'
              ? '₹4 / ₹6 per sheet'
              : '₹7 / ₹10 per sheet'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update({ colorMode: 'bw' })}
            className={`flex items-center justify-center space-x-2 py-3 px-3 rounded-xl border text-sm font-medium transition-all ${
              settings.colorMode === 'bw'
                ? 'border-indigo-500 bg-indigo-600/20 text-white shadow-sm shadow-indigo-500/20'
                : 'border-white/5 bg-slate-900/40 text-slate-400 hover:text-white hover:border-white/10'
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-full bg-slate-400 border border-white/40" />
            <span>Black & White</span>
          </button>

          <button
            type="button"
            onClick={() => update({ colorMode: 'color' })}
            className={`flex items-center justify-center space-x-2 py-3 px-3 rounded-xl border text-sm font-medium transition-all ${
              settings.colorMode === 'color'
                ? 'border-pink-500 bg-pink-600/20 text-white shadow-sm shadow-pink-500/20'
                : 'border-white/5 bg-slate-900/40 text-slate-400 hover:text-white hover:border-white/10'
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-pink-500 via-purple-500 to-amber-400" />
            <span>Color Print</span>
          </button>
        </div>

        {/* Custom Mixed Indicator if user has mixed pages */}
        {settings.colorMode === 'custom' && (
          <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between text-xs">
            <span className="text-indigo-300 font-medium">⚡ Mixed Custom Mode Active</span>
            <span className="text-slate-400 text-[11px]">
              Tap above to force all B&W or all Color
            </span>
          </div>
        )}
      </div>


      {/* 2. Print Sides (Single vs Duplex) */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Sides</span>
          </div>
          <span className="text-[11px] text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
            {settings.isDuplex ? 'Manual Duplex Supported' : 'Standard 1-Sided'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update({ isDuplex: false })}
            className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all ${
              !settings.isDuplex
                ? 'border-indigo-500 bg-indigo-600/20 text-white shadow-sm shadow-indigo-500/20'
                : 'border-white/5 bg-slate-900/40 text-slate-400 hover:text-white hover:border-white/10'
            }`}
          >
            <span className="text-sm font-medium">Single-Sided</span>
            <span className="text-[11px] opacity-70 mt-0.5">1 page per sheet</span>
          </button>

          <button
            type="button"
            onClick={() => update({ isDuplex: true })}
            className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all ${
              settings.isDuplex
                ? 'border-indigo-500 bg-indigo-600/20 text-white shadow-sm shadow-indigo-500/20'
                : 'border-white/5 bg-slate-900/40 text-slate-400 hover:text-white hover:border-white/10'
            }`}
          >
            <span className="text-sm font-medium">Double-Sided (Duplex)</span>
            <span className="text-[11px] opacity-70 mt-0.5">Front & Back (Save Paper)</span>
          </button>
        </div>
      </div>

      {/* 3. Number of Copies & Page Range Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Copies Stepper */}
        <div className="glass-card rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            <Copy className="w-4 h-4 text-indigo-400" />
            <span>Copies</span>
          </div>

          <div className="flex items-center justify-between bg-slate-900/70 border border-white/10 rounded-xl p-1.5">
            <button
              type="button"
              onClick={() => update({ copies: Math.max(1, settings.copies - 1) })}
              disabled={settings.copies <= 1}
              className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>

            <span className="text-lg font-bold text-white font-mono">
              {settings.copies}
            </span>

            <button
              type="button"
              onClick={() => update({ copies: Math.min(50, settings.copies + 1) })}
              disabled={settings.copies >= 50}
              className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Page Range Selection */}
        <div className="glass-card rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
              <span>Pages</span>
            </div>
            <span className="text-[11px] text-emerald-400 font-medium">
              {selectedPagesCount} Selected
            </span>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => update({ pageRangeType: 'all', customPageRange: 'All' })}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${
                  settings.pageRangeType === 'all'
                    ? 'border-indigo-500 bg-indigo-600/30 text-white'
                    : 'border-white/5 bg-slate-900/40 text-slate-400 hover:text-white'
                }`}
              >
                All ({totalPages})
              </button>

              <button
                type="button"
                onClick={() => update({ pageRangeType: 'custom' })}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${
                  settings.pageRangeType === 'custom'
                    ? 'border-indigo-500 bg-indigo-600/30 text-white'
                    : 'border-white/5 bg-slate-900/40 text-slate-400 hover:text-white'
                }`}
              >
                Custom
              </button>
            </div>

            {settings.pageRangeType === 'custom' && (
              <input
                type="text"
                placeholder="e.g. 1-3, 5"
                value={rangeInput}
                onChange={(e) => {
                  setRangeInput(e.target.value);
                  update({ customPageRange: e.target.value });
                }}
                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
