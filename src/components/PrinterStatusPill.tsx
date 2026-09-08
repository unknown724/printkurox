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
      <div className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 shadow-sm">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/60" />
        <span className="text-[11px] font-semibold">Printer Online</span>
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
