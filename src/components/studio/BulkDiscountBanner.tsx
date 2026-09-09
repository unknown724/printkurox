'use client';

import React from 'react';
import { Sparkles, TrendingDown, Tag, ArrowRight } from 'lucide-react';
import { PricingResult } from '@/lib/pricing';

interface BulkDiscountBannerProps {
  pricing?: PricingResult;
  onLearnMore?: () => void;
}

export function BulkDiscountBanner({ pricing, onLearnMore }: BulkDiscountBannerProps) {
  const isMega = pricing?.tierName === 'Mega Bulk Saver';
  const isAssignment = pricing?.tierName === 'Assignment Saver';
  const hasSavings = (pricing?.savings || 0) > 0;

  return (
    <div className="w-full">
      {/* Active discount announcement / tier unlock */}
      {hasSavings ? (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/60 border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/10 flex items-center justify-between gap-3 animate-scale-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <TrendingDown className="w-4 h-4 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {isMega ? '👑 Mega Saver Rate (₹2.50/pg)' : '🎒 Assignment Rate (₹3/pg)'}
                </span>
                <span className="text-xs font-bold text-emerald-400">
                  Direct Price Cut Active!
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Original rate was <span className="line-through text-slate-500">₹{pricing?.originalPrice}</span>. You pay <strong className="text-white font-black">₹{pricing?.totalPrice}</strong> (Saved ₹{pricing?.savings}).
              </p>
            </div>
          </div>

          {pricing?.nextTierSheetsNeeded && pricing.nextTierSheetsNeeded > 0 ? (
            <div className="hidden sm:flex items-center text-[10px] text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-1 rounded-xl shrink-0">
              <span>+{pricing.nextTierSheetsNeeded} sheets for ₹2.50/pg</span>
            </div>
          ) : null}
        </div>
      ) : (
        /* Regular promo pills informing about the bulk cut */
        <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/8 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Tag className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white flex items-center gap-1">
                <span>Direct Bulk Price Cuts:</span>
                <span className="text-emerald-400 font-extrabold">₹3/pg</span> (10+ pgs) · <span className="text-cyan-400 font-extrabold">₹2.50/pg</span> (30+ pgs)
              </span>
              {pricing?.nextTierSheetsNeeded ? (
                <p className="text-[11px] text-indigo-300/90">
                  💡 Print {pricing.nextTierSheetsNeeded} more page{pricing.nextTierSheetsNeeded > 1 ? 's' : ''} to drop to <strong className="text-emerald-300">₹3/page</strong>!
                </p>
              ) : (
                <p className="text-[10px] text-slate-400">
                  Save up to 37.5% automatically on assignments, lab manuals, and notes.
                </p>
              )}
            </div>
          </div>

          {onLearnMore && (
            <button
              type="button"
              onClick={onLearnMore}
              className="text-[11px] font-bold text-indigo-400 hover:text-white transition-colors flex items-center gap-0.5 ml-auto"
            >
              <span>Rates</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
