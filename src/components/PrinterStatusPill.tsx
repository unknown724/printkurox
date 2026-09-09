'use client';

import { usePrinterStatus } from '@/lib/usePrinterStatus';
import { Wifi, WifiOff } from 'lucide-react';

export function PrinterStatusPill() {
  const { online, loading, ageSeconds } = usePrinterStatus(30_000);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-800/60 px-2.5 py-1 rounded-full border border-white/5 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        <span className="text-[11px]">Checking…</span>
      </div>
    );
  }

  if (online) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-[#1e1f20] px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/30 shadow-2xs">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-[11px] font-semibold tracking-tight">Printer Online</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/25 shadow-sm animate-offline">
      <WifiOff className="w-3 h-3 text-amber-400 shrink-0" />
      <span className="text-[11px] font-semibold">
        {ageSeconds !== null && ageSeconds > 300
          ? `Offline ${Math.round(ageSeconds / 60)}m`
          : 'Offline'}
      </span>
    </div>
  );
}
