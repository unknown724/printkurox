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
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            <div className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
              <Palette className="w-3.5 h-3.5" />
            </div>
            <span>Color Mode</span>
          </div>
          <span className="text-[11px] text-zinc-500 font-medium">
            {settings.colorMode === 'custom'
              ? `${bwCount ?? 0} B&W + ${colorCount ?? 0} Color`
              : settings.colorMode === 'bw'
              ? '₹4 / sheet'
              : '₹7 / sheet'}
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
              icon: <span className="w-2 h-2 rounded-full bg-zinc-400 shrink-0" />,
            },
            {
              value: 'color',
              label: 'Full Color',
              badge: '₹7/pg',
              icon: <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />,
            },
          ]}
        />

        {settings.colorMode === 'custom' && (
          <div className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-between text-xs">
            <span className="text-zinc-800 dark:text-zinc-200 font-medium text-[11px]">Mixed Mode Configured</span>
            <span className="text-zinc-500 text-[10px]">
              Tap above to apply across all pages
            </span>
          </div>
        )}
      </div>

      {/* 2. Sides */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            <div className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <span>Print Sides</span>
          </div>
          <span className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 font-medium">
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
              badge: 'Eco',
              sublabel: '2 pgs/sheet',
            },
          ]}
        />
      </div>

      {/* 3. Copies */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          <div className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
            <Copy className="w-3.5 h-3.5" />
          </div>
          <span>Copies</span>
        </div>

        <div className="flex items-center space-x-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-1">
          <button
            type="button"
            onClick={() => update({ copies: Math.max(1, settings.copies - 1) })}
            disabled={settings.copies <= 1}
            className="w-7 h-7 rounded-md bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-zinc-700 dark:text-zinc-200 transition-colors shadow-xs"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-mono px-3 tabular-nums min-w-[2.5rem] text-center">
            {settings.copies}
          </span>

          <button
            type="button"
            onClick={() => update({ copies: Math.min(50, settings.copies + 1) })}
            disabled={settings.copies >= 50}
            className="w-7 h-7 rounded-md bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-zinc-700 dark:text-zinc-200 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
