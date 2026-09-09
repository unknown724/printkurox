'use client';

import React, { useState } from 'react';
import {
  Printer,
  ChevronUp,
  ChevronDown,
  Zap,
  Loader2,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  WifiOff,
  Sparkles,
  Info,
} from 'lucide-react';
import { PricingBreakdown } from '@/lib/pricing';

interface FloatingCheckoutDockProps {
  pricing: PricingBreakdown;
  printerOnline: boolean;
  isAdmin: boolean;
  isProcessing: boolean;
  errorMessage: string | null;
  onPayAndPrint: () => void;
  onAdminBypass: () => void;
  pickupCodeHint?: string;
}

export function FloatingCheckoutDock({
  pricing,
  printerOnline,
  isAdmin,
  isProcessing,
  errorMessage,
  onPayAndPrint,
  onAdminBypass,
}: FloatingCheckoutDockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* Expandable Breakdown Drawer Sheet (Backdrop) */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* Expanded Breakdown Content */}
      <div
        className={`fixed left-0 right-0 z-50 transition-all duration-300 ease-out max-w-xl mx-auto px-4 ${
          isExpanded
            ? 'bottom-24 translate-y-0 opacity-100 pointer-events-auto'
            : 'bottom-0 translate-y-8 opacity-0 pointer-events-none'
        }`}
      >
        <div className="glass-card rounded-2xl p-4.5 border border-indigo-500/30 shadow-2xl space-y-3 bg-white/95 dark:bg-slate-900/95">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              Itemized Cost Breakdown
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              Close ✕
            </button>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>Total Billable Pages:</span>
              <span className="font-bold text-slate-900 dark:text-white">{pricing.totalPages} pages</span>
            </div>

            {pricing.colorPagesCount > 0 ? (
              <>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Color Pages:</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {pricing.colorPagesCount} pages (₹7/pg)
                  </span>
                </div>
                {pricing.bwPagesCount > 0 && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>B&amp;W Pages:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {pricing.bwPagesCount} pages (₹4/pg)
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Color Mode:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Standard Black &amp; White (₹4/pg)
                </span>
              </div>
            )}

            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>Layout / Sheets:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {pricing.isDuplex
                  ? `${pricing.totalSheets} double-sided sheets`
                  : `${pricing.totalSheets} single-sided sheets`}
              </span>
            </div>

            {pricing.copies > 1 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Copies:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">× {pricing.copies}</span>
              </div>
            )}

            <div className="border-t border-slate-200 dark:border-white/10 pt-2 flex justify-between items-baseline font-black">
              <span className="text-sm text-slate-900 dark:text-white">Total Amount:</span>
              <span className="text-lg text-emerald-600 dark:text-emerald-400 tabular-nums">
                ₹{pricing.totalPrice}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Persistent Floating Glass Dock */}
      <div className="fixed bottom-3 left-0 right-0 z-50 max-w-xl mx-auto px-3 pointer-events-auto">
        <div className="glass-dock rounded-2xl p-2.5 sm:p-3 space-y-2">
          {/* Error Banner if any */}
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-300 animate-scale-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1">{errorMessage}</span>
            </div>
          )}

          {/* Offline Warning if printer is offline */}
          {!printerOnline && (
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300">
              <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span>Printer currently queued. Your job will print automatically when ready.</span>
            </div>
          )}

          {/* Dock Controls */}
          <div className="flex items-center justify-between gap-3">
            {/* Left: Price and Details Drawer Toggle */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex flex-col items-start text-left group hover:opacity-90 transition-opacity pl-1 select-none"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight">
                  ₹{pricing.totalPrice}
                </span>
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate max-w-[130px] sm:max-w-[180px]">
                {pricing.totalSheets} {pricing.totalSheets === 1 ? 'sheet' : 'sheets'}
                {pricing.copies > 1 ? ` (${pricing.copies}x)` : ''} • {pricing.isDuplex ? 'Duplex' : 'Single'}
              </span>
            </button>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={onAdminBypass}
                  disabled={isProcessing}
                  title="Staff Free Print Bypass"
                  className="p-3.5 rounded-xl bg-amber-500 text-black font-extrabold hover:bg-amber-400 active:scale-95 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  <Zap className="w-4 h-4 fill-black" />
                </button>
              )}

              <button
                type="button"
                onClick={onPayAndPrint}
                disabled={isProcessing}
                className="btn-primary py-3.5 px-5 sm:px-6 rounded-xl text-white font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    <span>{printerOnline ? 'Pay & Print' : 'Pay & Queue'}</span>
                    <ArrowRight className="w-3.5 h-3.5 opacity-80" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
