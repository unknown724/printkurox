'use client';

import React, { useState } from 'react';
import { ChevronDown, Sliders, Sparkles, FileSpreadsheet, Layers, FileText } from 'lucide-react';

import { EnhanceMode } from '@/lib/image-enhancer';

export interface AdvancedPrintOptions {
  scaling: 'fit' | 'actual' | 'fill' | 'custom';
  customScale?: number;
  quality: 'standard' | 'high_dpi';
  margins: 'standard' | 'narrow' | 'borderless';
  collate: boolean;
  documentSize?: 'A4' | 'Letter' | 'Legal' | 'A5' | 'B5' | 'Executive';
  paperType?: 'plain' | 'inkjet' | 'matte' | 'ultra_glossy' | 'premium_glossy' | 'photo_glossy' | 'envelope';
}

interface AdvancedSettingsProps {
  options: AdvancedPrintOptions;
  onChange: (opts: AdvancedPrintOptions) => void;
  copies: number;
  enhanceMode?: EnhanceMode;
  onEnhanceModeChange?: (mode: EnhanceMode) => void;
}

export function AdvancedSettings({
  options,
  onChange,
  copies,
  enhanceMode = 'none',
  onEnhanceModeChange,
}: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEnhanceOpen, setIsEnhanceOpen] = useState(false);

  const update = (patch: Partial<AdvancedPrintOptions>) =>
    onChange({ ...options, ...patch });

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/90 shadow-xs overflow-hidden">
      {/* Accordion Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 sm:p-3.5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors group"
      >
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              Advanced Print Settings
              <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 dark:bg-white/[0.04] px-1.5 py-0.5 rounded border border-zinc-200 dark:border-white/10">
                Optional
              </span>
            </span>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Paper Type · Document Size · Margins · DPI
            </p>
          </div>
        </div>

        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 ${
            isOpen
              ? 'bg-zinc-100 dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-100'
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
        <div className="px-4 pb-4 pt-2 border-t border-zinc-100 dark:border-white/10 space-y-4 animate-fade-in-up text-xs">
          {/* Document Size & Paper Type (Epson & Windows Properties Standard) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1.5 text-[11px]">
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span>Document Size</span>
              </label>
              <select
                value={options.documentSize || 'A4'}
                onChange={(e) =>
                  update({ documentSize: e.target.value as AdvancedPrintOptions['documentSize'] })
                }
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-[#050507] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-400 transition-colors font-medium cursor-pointer"
              >
                <option value="A4">A4 210 x 297 mm</option>
                <option value="Letter">Letter 8.5 x 11 in</option>
                <option value="Legal">Legal 8.5 x 14 in</option>
                <option value="A5">A5 148 x 210 mm</option>
                <option value="B5">B5 (JIS) 182 x 257 mm</option>
                <option value="Executive">Executive 7.25 x 10.5 in</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1.5 text-[11px]">
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span>Paper Type</span>
              </label>
              <select
                value={options.paperType || 'plain'}
                onChange={(e) =>
                  update({ paperType: e.target.value as AdvancedPrintOptions['paperType'] })
                }
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-[#050507] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-400 transition-colors font-medium cursor-pointer"
              >
                <option value="plain">Plain paper</option>
                <option value="inkjet">Epson Photo Quality Ink Jet</option>
                <option value="matte">Epson Matte</option>
                <option value="ultra_glossy">Epson Ultra Glossy</option>
                <option value="premium_glossy">Epson Premium Glossy</option>
                <option value="photo_glossy">Photo Paper Glossy</option>
                <option value="envelope">Envelope</option>
              </select>
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
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-[#050507] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-400 transition-colors"
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
                className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-[#050507] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-400 transition-colors"
              >
                <option value="standard">Standard (300 DPI)</option>
                <option value="high_dpi">High Quality (600 DPI)</option>
              </select>
            </div>
          </div>

          {/* Photo Document Enhancer (Shadow Eraser) - Click to expand / show options */}
          <div className="space-y-1.5 pt-2.5 border-t border-zinc-100 dark:border-white/10">
            <div className="flex items-center justify-between">
              <label className="text-zinc-800 dark:text-zinc-200 font-semibold flex items-center gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Photo Document Enhancer</span>
              </label>
              <span className="text-[10px] text-zinc-400 font-mono">Shadow Eraser</span>
            </div>

            {/* Click-to-reveal Trigger Button */}
            <button
              type="button"
              onClick={() => setIsEnhanceOpen(!isEnhanceOpen)}
              className="w-full h-8 px-3 rounded-lg bg-zinc-50 dark:bg-[#050507] border border-zinc-200 dark:border-white/10 flex items-center justify-between text-xs text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer"
            >
              <span className="font-medium flex items-center gap-2 truncate">
                <span>
                  {enhanceMode === 'magic_bw'
                    ? '✨ Magic B&W'
                    : enhanceMode === 'grayscale'
                    ? 'Grayscale'
                    : enhanceMode === 'color_boost'
                    ? 'Vivid Color'
                    : 'Original'}
                </span>
                <span className="text-[11px] text-zinc-400 font-normal truncate">
                  {enhanceMode === 'magic_bw'
                    ? '(Pure white paper, deep text)'
                    : enhanceMode === 'grayscale'
                    ? '(Crisp scan, photo halftones)'
                    : enhanceMode === 'color_boost'
                    ? '(Boost stamps & signatures)'
                    : '(No filter applied)'}
                </span>
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-150 ${
                  isEnhanceOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Options list shown ONLY when clicked */}
            {isEnhanceOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 animate-fade-in-up">
                {[
                  { id: 'none' as EnhanceMode, title: 'Original', desc: 'No filter applied' },
                  { id: 'magic_bw' as EnhanceMode, title: '✨ Magic B&W', desc: 'Pure white paper, deep text' },
                  { id: 'grayscale' as EnhanceMode, title: 'Grayscale', desc: 'Crisp scan, photo halftones' },
                  { id: 'color_boost' as EnhanceMode, title: 'Vivid Color', desc: 'Boost stamps & signatures' },
                ].map((m) => {
                  const isSelected = (enhanceMode || 'none') === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onEnhanceModeChange?.(m.id);
                        setIsEnhanceOpen(false);
                      }}
                      className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10 text-blue-900 dark:text-blue-100 font-semibold shadow-2xs'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <span className="text-xs font-semibold">{m.title}</span>
                      <span className="text-[10px] text-zinc-400 mt-0.5">{m.desc}</span>
                    </button>
                  );
                })}
              </div>
            )}
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
