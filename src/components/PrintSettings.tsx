'use client';

import React from 'react';
import { Minus, Plus, Layers, Palette, Copy } from 'lucide-react';
import { PageConfig } from '@/lib/pricing';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

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
      <div className="card-premium rounded-2xl p-4 border border-slate-200/80 dark:border-white/8 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Palette className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span>Color Mode</span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            {settings.colorMode === 'custom'
              ? `${bwCount ?? 0} B&W + ${colorCount ?? 0} Color`
              : settings.colorMode === 'bw'
              ? '₹4 / ₹6 per sheet'
              : '₹7 / ₹10 per sheet'}
          </span>
        </div>

        <SegmentedControl
          value={settings.colorMode === 'custom' ? 'bw' : settings.colorMode}
          onChange={(val) => update({ colorMode: val as 'bw' | 'color' })}
          options={[
            {
              value: 'bw',
              label: 'Black & White',
              badge: '₹4/pg',
              icon: <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0" />,
            },
            {
              value: 'color',
              label: 'Full Color',
              badge: '₹7/pg',
              icon: <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-pink-500 to-violet-500 shadow-sm shadow-pink-500/50 shrink-0" />,
            },
          ]}
        />

        {settings.colorMode === 'custom' && (
          <div className="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/8 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-between text-xs">
            <span className="text-indigo-700 dark:text-indigo-300 font-semibold">⚡ Hybrid Mixed Mode</span>
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Tap above to apply across all pages
            </span>
          </div>
        )}
      </div>

      {/* 2. Sides */}
      <div className="card-premium rounded-2xl p-4 border border-slate-200/80 dark:border-white/8 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span>Print Sides</span>
          </div>
          <span className="text-[11px] text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-500/20">
            {settings.isDuplex ? 'Front & Back' : 'Single Side'}
          </span>
        </div>

        <SegmentedControl
          value={settings.isDuplex ? 'duplex' : 'single'}
          onChange={(val) => update({ isDuplex: val === 'duplex' })}
          options={[
            {
              value: 'single',
              label: 'Single-Sided',
              sublabel: '1 pg/sheet',
            },
            {
              value: 'duplex',
              label: 'Double-Sided',
              badge: 'Save ₹',
              sublabel: '2 pgs/sheet',
            },
          ]}
        />
      </div>

      {/* 3. Copies */}
      <div className="card-premium rounded-2xl p-4 flex items-center justify-between border border-slate-200/80 dark:border-white/8">
        <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <Copy className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span>Copies</span>
        </div>

        <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-white/10 rounded-xl p-1">
          <button
            type="button"
            onClick={() => update({ copies: Math.max(1, settings.copies - 1) })}
            disabled={settings.copies <= 1}
            className="w-8 h-8 rounded-lg bg-white dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-indigo-600/30 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 dark:text-white transition-colors shadow-xs"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <span className="text-base font-bold text-slate-900 dark:text-white font-mono px-3 tabular-nums min-w-[2.5rem] text-center">
            {settings.copies}
          </span>

          <button
            type="button"
            onClick={() => update({ copies: Math.min(50, settings.copies + 1) })}
            disabled={settings.copies >= 50}
            className="w-8 h-8 rounded-lg bg-white dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-indigo-600/30 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 dark:text-white transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
