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
      {/* 1. Color Mode - Image 1 Glassmorphic Card with Hairline Top Glow */}
      <div className="relative rounded-2xl border border-zinc-200 dark:border-[#37333b] bg-white dark:bg-[#121215]/90 backdrop-blur-xl p-4 shadow-xs space-y-3 overflow-hidden">
        {/* Luminous top edge sheen */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-0 h-px w-[calc(100%-2rem)] bg-gradient-to-r from-slate-300/0 via-slate-200/30 to-slate-300/0"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-[#1a1920] border border-zinc-200 dark:border-[#37333b] flex items-center justify-center text-zinc-600 dark:text-zinc-300 shadow-2xs">
              <Palette className="w-3.5 h-3.5" />
            </div>
            <span>Color Mode</span>
          </div>

          <span
            className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-full border ${
              settings.colorMode === 'color'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                : 'bg-zinc-100 dark:bg-[#1a1920] text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-[#37333b]'
            }`}
          >
            {settings.colorMode === 'custom'
              ? `${bwCount ?? 0} B&W + ${colorCount ?? 0} Color`
              : settings.colorMode === 'bw'
              ? '₹4 / sheet'
              : '₹7 / sheet'}
          </span>
        </div>

        {/* Highlighted Color Mode Options */}
        <SegmentedControl
          value={settings.colorMode === 'custom' ? 'bw' : settings.colorMode}
          onChange={(val) => update({ colorMode: val as 'bw' | 'color' })}
          options={[
            {
              value: 'bw',
              label: 'Black & White',
              badge: '₹4/pg',
              icon: <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-400 shrink-0 shadow-2xs" />,
              activeClassName:
                'bg-white text-zinc-950 dark:bg-[#201f26] dark:text-white border border-zinc-300/80 dark:border-[#423d48] shadow-[0_0_12px_rgba(255,255,255,0.08)] font-bold',
              badgeClassName:
                'bg-zinc-100 dark:bg-[#2c2a34] text-zinc-800 dark:text-zinc-100 border border-zinc-300 dark:border-[#37333b]',
            },
            {
              value: 'color',
              label: 'Full Color',
              badge: '₹7/pg',
              icon: (
                <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500 shrink-0 shadow-xs" />
              ),
              activeClassName:
                'bg-gradient-to-r from-blue-500/15 via-purple-500/15 to-pink-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/40 dark:border-blue-400/50 shadow-[0_0_16px_rgba(66,133,244,0.25)] font-bold',
              badgeClassName:
                'bg-gradient-to-r from-blue-500 to-purple-600 text-white border-transparent shadow-2xs',
            },
          ]}
        />

        {settings.colorMode === 'custom' && (
          <div className="px-3 py-1.5 rounded-xl bg-zinc-100/80 dark:bg-[#16161a] border border-zinc-200 dark:border-[#37333b] flex items-center justify-between text-xs">
            <span className="text-zinc-800 dark:text-zinc-200 font-medium text-[11px]">Mixed Mode Configured</span>
            <span className="text-zinc-500 dark:text-zinc-400 text-[10px]">
              Tap above to apply across all pages
            </span>
          </div>
        )}
      </div>

      {/* 2. Sides - Highlighted Single vs Double Sided Eco */}
      <div className="relative rounded-2xl border border-zinc-200 dark:border-[#37333b] bg-white dark:bg-[#121215]/90 backdrop-blur-xl p-4 shadow-xs space-y-3 overflow-hidden">
        {/* Luminous top edge sheen */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-0 h-px w-[calc(100%-2rem)] bg-gradient-to-r from-emerald-500/0 via-emerald-400/30 to-emerald-500/0"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-[#1a1920] border border-zinc-200 dark:border-[#37333b] flex items-center justify-center text-zinc-600 dark:text-zinc-300 shadow-2xs">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <span>Print Sides</span>
          </div>

          <span
            className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${
              settings.isDuplex
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-zinc-100/80 dark:bg-[#1a1920] text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-[#37333b]'
            }`}
          >
            {settings.isDuplex ? 'Front & Back (Eco)' : 'Single Side'}
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
              activeClassName:
                'bg-white text-zinc-950 dark:bg-[#201f26] dark:text-white border border-zinc-300/80 dark:border-[#423d48] shadow-[0_0_12px_rgba(255,255,255,0.08)] font-bold',
            },
            {
              value: 'duplex',
              label: 'Double-Sided',
              badge: 'Eco Saver',
              sublabel: '2 pgs/sheet',
              activeClassName:
                'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 dark:border-emerald-400/50 shadow-[0_0_16px_rgba(16,185,129,0.25)] font-bold',
              badgeClassName: 'bg-emerald-500 text-white border-none shadow-2xs',
            },
          ]}
        />
      </div>

      {/* 3. Copies */}
      <div className="relative rounded-2xl border border-zinc-200 dark:border-[#37333b] bg-white dark:bg-[#121215]/90 backdrop-blur-xl p-4 shadow-xs flex items-center justify-between overflow-hidden">
        <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-[#1a1920] border border-zinc-200 dark:border-[#37333b] flex items-center justify-center text-zinc-600 dark:text-zinc-300 shadow-2xs">
            <Copy className="w-3.5 h-3.5" />
          </div>
          <span>Total Set Copies</span>
        </div>

        <div className="flex items-center space-x-1 bg-zinc-100/80 dark:bg-[#18171e] border border-zinc-200 dark:border-[#37333b] rounded-full p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => update({ copies: Math.max(1, settings.copies - 1) })}
            disabled={settings.copies <= 1}
            className="w-7 h-7 rounded-full bg-white dark:bg-[#24232c] border border-zinc-200 dark:border-[#37333b] hover:bg-zinc-50 dark:hover:bg-[#2d2b36] disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-zinc-700 dark:text-zinc-200 transition-colors shadow-2xs cursor-pointer"
            title="Decrease copies"
            aria-label="Decrease copies"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono px-3 tabular-nums min-w-[2.5rem] text-center">
            {settings.copies}
          </span>

          <button
            type="button"
            onClick={() => update({ copies: Math.min(50, settings.copies + 1) })}
            disabled={settings.copies >= 50}
            className="w-7 h-7 rounded-full bg-white dark:bg-[#24232c] border border-zinc-200 dark:border-[#37333b] hover:bg-zinc-50 dark:hover:bg-[#2d2b36] disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-zinc-700 dark:text-zinc-200 transition-colors shadow-2xs cursor-pointer"
            title="Increase copies"
            aria-label="Increase copies"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
