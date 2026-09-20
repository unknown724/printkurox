'use client';

import React from 'react';
import { Minus, Plus, Palette, Copy, CheckCircle2, Info, Building2, MapPin, ChevronRight } from 'lucide-react';
import { PageConfig, TIER_RATES } from '@/lib/pricing';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { getStationConfig } from '@/lib/stations';
import { usePrinterStatus } from '@/lib/usePrinterStatus';

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
  stationId?: string;
  onOpenStationModal?: () => void;
}

export function PrintSettings({
  settings,
  onChange,
  bwCount,
  colorCount,
  stationId,
  onOpenStationModal,
}: PrintSettingsProps) {
  const currentStation = getStationConfig(stationId || 'block_b');
  const { online: printerOnline } = usePrinterStatus(30_000, currentStation.id);

  const update = (partial: Partial<PrintSettingsState>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <div className="space-y-3">
      {/* 0. Target Printer Station & Hostel Pickup Destination (Compact & Professional) */}
      <div className="rounded-2xl border border-blue-500/20 dark:border-blue-500/15 bg-white dark:bg-[#16161c]/90 backdrop-blur-xl p-2.5 sm:p-3 shadow-xs flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate">
                {currentStation.name}
              </span>
              <span className="inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                <span className={`w-1 h-1 rounded-full ${printerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {printerOnline ? 'Online' : 'Standby'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1">
              <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
              <span className="truncate">{currentStation.address}</span>
            </p>
          </div>
        </div>

        {onOpenStationModal && (
          <button
            type="button"
            onClick={onOpenStationModal}
            className="h-7.5 sm:h-8 px-2.5 sm:px-3 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 hover:bg-zinc-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-zinc-800 dark:text-zinc-200 font-semibold text-xs flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
          >
            <span>Change</span>
            <ChevronRight className="w-3 h-3 opacity-60" />
          </button>
        )}
      </div>
      {/* 1. Color Mode - Glassmorphic Card with Campus Discount Rates */}
      <div className="relative rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/90 backdrop-blur-xl p-4 shadow-xs space-y-3 overflow-hidden">
        {/* Luminous top edge sheen */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-0 h-px w-[calc(100%-2rem)] bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shadow-2xs">
              <Palette className="w-3.5 h-3.5" />
            </div>
            <span>Color Mode</span>
          </div>

          <span
            className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-full border ${
              settings.colorMode === 'color'
                ? 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/25'
                : 'bg-zinc-100 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/10'
            }`}
          >
            {settings.colorMode === 'custom'
              ? `${bwCount ?? 0} B&W + ${colorCount ?? 0} Color`
              : settings.colorMode === 'bw'
              ? `₹${TIER_RATES.standard.bw.single} / sheet`
              : `₹${TIER_RATES.standard.color.single} / sheet`}
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
              badge: `₹${TIER_RATES.standard.bw.single}/pg`,
              sublabel: 'Standard Notes & Labs',
              icon: <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 dark:bg-zinc-400 shrink-0 shadow-2xs" />,
              activeClassName:
                'bg-white text-zinc-950 dark:bg-white/[0.12] dark:text-white border border-zinc-300/80 dark:border-white/25 shadow-xs font-bold',
              badgeClassName:
                'bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-zinc-100 border border-zinc-300 dark:border-white/15',
            },
            {
              value: 'color',
              label: 'Full Color',
              badge: `₹${TIER_RATES.standard.color.single}/pg`,
              sublabel: 'Diagrams & Certificates',
              icon: (
                <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-blue-400 via-purple-400 to-pink-400 shrink-0 shadow-xs" />
              ),
              activeClassName:
                'bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-blue-500/20 text-pink-600 dark:text-pink-300 border-2 border-pink-500 shadow-[0_0_18px_rgba(236,72,153,0.35)] font-bold ring-1 ring-pink-500/40',
              badgeClassName:
                'bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 text-white font-bold border-transparent shadow-xs',
            },
          ]}
        />

        {settings.colorMode === 'custom' && (
          <div className="px-3 py-1.5 rounded-xl bg-zinc-100/80 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 flex items-center justify-between text-xs">
            <span className="text-zinc-800 dark:text-zinc-200 font-medium text-[11px]">Mixed Mode Configured</span>
            <span className="text-zinc-500 dark:text-zinc-400 text-[10px]">
              Tap above to apply across all pages
            </span>
          </div>
        )}
      </div>

      {/* 3. Copies */}
      <div className="relative rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#08080a]/90 backdrop-blur-xl p-2.5 sm:p-3 shadow-xs flex items-center justify-between overflow-hidden">
        <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shadow-2xs">
            <Copy className="w-3.5 h-3.5" />
          </div>
          <span>Total Set Copies</span>
        </div>

        <div className="flex items-center space-x-1.5 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => update({ copies: Math.max(1, settings.copies - 1) })}
            disabled={settings.copies <= 1}
            className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200/80 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600/80 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-zinc-800 dark:text-zinc-100 transition-all shadow-2xs active:scale-95 cursor-pointer"
            title="Decrease copies"
            aria-label="Decrease copies"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono px-2.5 tabular-nums min-w-[2.25rem] text-center select-none">
            {settings.copies}
          </span>

          <button
            type="button"
            onClick={() => update({ copies: Math.min(50, settings.copies + 1) })}
            disabled={settings.copies >= 50}
            className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200/80 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600/80 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center text-zinc-800 dark:text-zinc-100 transition-all shadow-2xs active:scale-95 cursor-pointer"
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
