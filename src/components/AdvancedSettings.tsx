'use client';

import React, { useState } from 'react';
import { ChevronDown, Sliders, Sparkles, Maximize2, FileSpreadsheet, Layers } from 'lucide-react';

export interface AdvancedPrintOptions {
  scaling: 'fit' | 'actual' | 'fill';
  quality: 'standard' | 'high_dpi';
  margins: 'standard' | 'narrow' | 'borderless';
  collate: boolean;
}

interface AdvancedSettingsProps {
  options: AdvancedPrintOptions;
  onChange: (opts: AdvancedPrintOptions) => void;
  copies: number;
}

export function AdvancedSettings({ options, onChange, copies }: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const update = (patch: Partial<AdvancedPrintOptions>) =>
    onChange({ ...options, ...patch });

  return (
    <div className="card-premium rounded-2xl border border-slate-200/80 dark:border-white/6 overflow-hidden">
      {/* Accordion Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-white/[0.025] transition-colors group"
      >
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:border-indigo-500/40 transition-colors">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              Advanced Print Settings
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/5">
                Optional
              </span>
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Scaling · DPI · Margins · Collation
            </p>
          </div>
        </div>

        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 ${
            isOpen
              ? 'bg-indigo-500/15 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400'
              : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
          }`}
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expandable Panel */}
      {isOpen && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-200/80 dark:border-white/5 space-y-4 animate-fade-in-up text-xs">
          {/* Page Scaling */}
          <div className="space-y-2">
            <label className="text-slate-700 dark:text-slate-400 font-semibold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Maximize2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              <span>Page Scaling</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'fit', label: 'Fit to Area', sub: 'Recommended' },
                { id: 'actual', label: 'Actual Size', sub: '100% no scale' },
                { id: 'fill', label: 'Fill Page', sub: 'Crops margins' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => update({ scaling: item.id as AdvancedPrintOptions['scaling'] })}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    options.scaling === item.id
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-500/60 dark:bg-indigo-500/10 dark:text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/5 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:border-white/12 dark:hover:text-white'
                  }`}
                >
                  <p className="font-bold text-[11px] truncate">{item.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{item.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Margins & Quality */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-slate-700 dark:text-slate-400 font-semibold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <FileSpreadsheet className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>Margins</span>
              </label>
              <select
                value={options.margins}
                onChange={(e) =>
                  update({ margins: e.target.value as AdvancedPrintOptions['margins'] })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="standard">Standard (0.5in)</option>
                <option value="narrow">Narrow (0.2in)</option>
                <option value="borderless">Borderless (Photos)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-700 dark:text-slate-400 font-semibold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>Print Quality</span>
              </label>
              <select
                value={options.quality}
                onChange={(e) =>
                  update({ quality: e.target.value as AdvancedPrintOptions['quality'] })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="standard">Standard (Clean Text)</option>
                <option value="high_dpi">High-DPI (Photos/Charts)</option>
              </select>
            </div>
          </div>

          {/* Collation (multi-copy only) */}
          {copies > 1 && (
            <div className="pt-2 border-t border-slate-200/80 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <span className="text-slate-900 dark:text-white font-semibold text-xs">Collate Copies</span>
                  <p className="text-[10px] text-slate-500">
                    [1,2,3] [1,2,3] instead of [1,1] [2,2]
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => update({ collate: !options.collate })}
                className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${
                  options.collate ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    options.collate ? 'translate-x-4' : ''
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
