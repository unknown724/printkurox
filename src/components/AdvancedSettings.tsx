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
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
      {/* Accordion Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
      >
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              Advanced Print Settings
              <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
                Optional
              </span>
            </span>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Scaling · DPI · Margins · Collation
            </p>
          </div>
        </div>

        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 ${
            isOpen
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              : 'text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
          }`}
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expandable Panel */}
      {isOpen && (
        <div className="px-4 pb-4 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-4 animate-fade-in-up text-xs">
          {/* Page Scaling */}
          <div className="space-y-2">
            <label className="text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1.5 text-[11px]">
              <Maximize2 className="w-3.5 h-3.5 text-zinc-500" />
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
                  className={`p-2 rounded-lg text-left border transition-all ${
                    options.scaling === item.id
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                      : 'border-zinc-200 bg-zinc-50/70 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-100'
                  }`}
                >
                  <p className="font-semibold text-[11px] truncate">{item.label}</p>
                  <p className="text-[10px] opacity-75 mt-0.5">{item.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Margins & Quality */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1.5 text-[11px]">
                <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-500" />
                <span>Margins</span>
              </label>
              <select
                value={options.margins}
                onChange={(e) =>
                  update({ margins: e.target.value as AdvancedPrintOptions['margins'] })
                }
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-300 transition-colors"
              >
                <option value="standard">Standard (0.5in)</option>
                <option value="narrow">Narrow (0.2in)</option>
                <option value="borderless">Borderless</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1.5 text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
                <span>Print Quality</span>
              </label>
              <select
                value={options.quality}
                onChange={(e) =>
                  update({ quality: e.target.value as AdvancedPrintOptions['quality'] })
                }
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-300 transition-colors"
              >
                <option value="standard">Standard (300 DPI)</option>
                <option value="high_dpi">High Quality (600 DPI)</option>
              </select>
            </div>
          </div>

          {/* Collation (multi-copy only) */}
          {copies > 1 && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-zinc-500" />
                <div>
                  <span className="text-zinc-900 dark:text-zinc-100 font-medium text-xs">Collate Copies</span>
                  <p className="text-[10px] text-zinc-500">
                    [1,2,3] [1,2,3] instead of [1,1] [2,2]
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => update({ collate: !options.collate })}
                className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${
                  options.collate ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-200 dark:bg-zinc-800'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-zinc-900 transition-transform duration-200 shadow-xs ${
                    options.collate ? 'translate-x-4 bg-white dark:bg-zinc-900' : 'bg-white dark:bg-zinc-400'
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
