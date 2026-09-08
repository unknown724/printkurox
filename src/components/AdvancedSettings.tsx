'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  Sliders,
  Sparkles,
  Maximize2,
  FileSpreadsheet,
  Layers,
  HelpCircle,
} from 'lucide-react';

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

  const update = (patch: Partial<AdvancedPrintOptions>) => {
    onChange({ ...options, ...patch });
  };

  return (
    <div className="glass-card rounded-2xl border-white/5 overflow-hidden transition-all">
      {/* Header Accordion Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              Advanced Print Settings
              <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
            </span>
            <p className="text-[11px] text-slate-400">
              Scaling, photo DPI, margins & collation
            </p>
          </div>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-indigo-400' : ''
          }`}
        />
      </button>

      {/* Expandable Panel */}
      {isOpen && (
        <div className="p-4 pt-2 border-t border-white/5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
          {/* Page Scaling */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-semibold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Page Scaling / Fit</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'fit', label: 'Fit to Printable Area', sub: 'Recommended' },
                { id: 'actual', label: 'Actual Size (100%)', sub: 'No scaling' },
                { id: 'fill', label: 'Fill Entire Page', sub: 'Crop margins' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => update({ scaling: item.id as AdvancedPrintOptions['scaling'] })}
                  className={`p-2 rounded-xl text-left border transition-all ${
                    options.scaling === item.id
                      ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-sm'
                      : 'border-white/5 bg-slate-900/60 text-slate-400 hover:border-white/10'
                  }`}
                >
                  <p className="font-bold text-[11px] text-white truncate">{item.label}</p>
                  <p className="text-[10px] text-slate-400">{item.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Margins & Quality Grid */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Margins */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
                <span>Paper Margins</span>
              </label>
              <select
                value={options.margins}
                onChange={(e) => update({ margins: e.target.value as AdvancedPrintOptions['margins'] })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="standard">Standard (0.5 in)</option>
                <option value="narrow">Narrow (0.2 in)</option>
                <option value="borderless">Borderless (Photos)</option>
              </select>
            </div>

            {/* Print Quality */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Print Quality</span>
              </label>
              <select
                value={options.quality}
                onChange={(e) => update({ quality: e.target.value as AdvancedPrintOptions['quality'] })}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="standard">Standard Crisp (Clean Text)</option>
                <option value="high_dpi">High-DPI Vivid (Photos / Charts)</option>
              </select>
            </div>
          </div>

          {/* Collation (Visible when multiple copies) */}
          {copies > 1 && (
            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <div>
                  <span className="text-white font-medium text-xs">Collate Copies</span>
                  <p className="text-[10px] text-slate-400">Sort as [1,2,3], [1,2,3] instead of [1,1], [2,2]</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => update({ collate: !options.collate })}
                className={`w-10 h-6 rounded-full transition-colors relative ${
                  options.collate ? 'bg-indigo-600' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
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
