'use client';

import React, { useState } from 'react';
import {
  SlidersHorizontal,
  ChevronDown,
  Sparkles,
  Maximize2,
  Scissors,
  Check,
} from 'lucide-react';
import { EnhanceMode } from '@/lib/image-enhancer';
import { PhotoLayoutSettings, LayoutMode } from './PhotoLayoutSelector';

interface PhotoDocumentToolsProps {
  enhanceMode: EnhanceMode;
  onEnhanceModeChange: (mode: EnhanceMode) => void;
  layoutSettings: PhotoLayoutSettings;
  onLayoutSettingsChange: (settings: PhotoLayoutSettings) => void;
  isImageDoc?: boolean;
}

export function PhotoDocumentTools({
  enhanceMode,
  onEnhanceModeChange,
  layoutSettings,
  onLayoutSettingsChange,
  isImageDoc = false,
}: PhotoDocumentToolsProps) {
  // Auto-expand only if the user specifically uploaded photo(s), otherwise keep closed to prevent clutter
  const [isOpen, setIsOpen] = useState(isImageDoc);

  const updateLayout = (patch: Partial<PhotoLayoutSettings>) => {
    onLayoutSettingsChange({ ...layoutSettings, ...patch });
  };

  const getEnhanceLabel = () => {
    switch (enhanceMode) {
      case 'magic_bw':
        return '✨ Magic B&W';
      case 'grayscale':
        return 'Grayscale Boost';
      case 'color_boost':
        return 'Vivid Color';
      default:
        return 'Original';
    }
  };

  const getLayoutLabel = () => {
    switch (layoutSettings.layoutMode) {
      case 'id-card':
        return '2-in-1 ID Card';
      case '2-up':
        return '2-Up Notes';
      case '4-up':
        return '4-Up Grid';
      default:
        return '1 per Sheet';
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/90 shadow-xs overflow-hidden">
      {/* Accordion Toggle Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors group cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Photo Tools &amp; Layout
              </span>
              <span className="text-[10px] text-zinc-500 bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.2 rounded border border-zinc-200 dark:border-white/10">
                Optional
              </span>
              {enhanceMode !== 'none' && (
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-300 dark:border-amber-800">
                  {getEnhanceLabel()} Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {getLayoutLabel()} · {getEnhanceLabel()} · {layoutSettings.fitMode === 'fill' ? 'Fill Page' : 'Fit Margins'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
        </div>
      </button>

      {/* Expandable Clean Settings Panel */}
      {isOpen && (
        <div className="px-3.5 pb-4 pt-1 sm:px-4 border-t border-zinc-100 dark:border-white/10 space-y-4 animate-fade-in-up text-xs">
          {/* 1. Document Enhancer Segmented Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-zinc-700 dark:text-zinc-300 font-semibold flex items-center gap-1.5 text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Fix Camera Shadows (Photo Enhancer)</span>
              </label>
              <span className="text-[10px] text-zinc-400">CamScanner Mode</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'none' as EnhanceMode, label: 'Original', sub: 'No filter' },
                { id: 'magic_bw' as EnhanceMode, label: '✨ Magic B&W', sub: 'Erase shadows' },
                { id: 'grayscale' as EnhanceMode, label: 'Grayscale', sub: 'Preserve photos' },
                { id: 'color_boost' as EnhanceMode, label: 'Vivid Color', sub: 'Color stamps' },
              ].map((m) => {
                const isSelected = enhanceMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onEnhanceModeChange(m.id)}
                    className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/10 text-amber-900 dark:text-amber-200 ring-1 ring-amber-500/40 font-semibold'
                        : 'border-zinc-200 bg-zinc-50/60 text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300'
                    }`}
                  >
                    <p className="text-xs truncate flex items-center justify-between">
                      <span>{m.label}</span>
                      {isSelected && <Check className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{m.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Page & Photo Layout */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-zinc-700 dark:text-zinc-300 font-semibold flex items-center gap-1.5 text-[11px]">
                <Maximize2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Page Layout (Windows &amp; Adobe Presets)</span>
              </label>
              {layoutSettings.layoutMode !== '1-up' && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  Paper Saver Active
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: '1-up' as LayoutMode, label: '1 per Sheet', sub: 'Full page' },
                { id: 'id-card' as LayoutMode, label: '💳 2-in-1 ID', sub: 'Front & Back' },
                { id: '2-up' as LayoutMode, label: '2-Up Notes', sub: 'Save 50% paper' },
                { id: '4-up' as LayoutMode, label: '4-Up Grid', sub: 'Handouts' },
              ].map((l) => {
                const isSelected = layoutSettings.layoutMode === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => updateLayout({ layoutMode: l.id })}
                    className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 text-blue-900 dark:text-blue-200 ring-1 ring-blue-500/40 font-semibold'
                        : 'border-zinc-200 bg-zinc-50/60 text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300'
                    }`}
                  >
                    <p className="text-xs truncate flex items-center justify-between">
                      <span>{l.label}</span>
                      {isSelected && <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{l.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Toggles: Fit Picture to Frame & Cutting Border */}
          <div className="pt-2 border-t border-zinc-100 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-center gap-2 p-2 rounded-xl border border-zinc-200/80 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/[0.03] cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={layoutSettings.fitMode === 'fill'}
                onChange={(e) => updateLayout({ fitMode: e.target.checked ? 'fill' : 'fit' })}
                className="h-3.5 w-3.5 rounded text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-white/20 dark:bg-zinc-900"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Fit picture to frame
                </p>
                <p className="text-[10px] text-zinc-500">Expands photo to fill A4 without small box</p>
              </div>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-xl border border-zinc-200/80 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/[0.03] cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={layoutSettings.drawBorder}
                onChange={(e) => updateLayout({ drawBorder: e.target.checked })}
                className="h-3.5 w-3.5 rounded text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-white/20 dark:bg-zinc-900"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                  <Scissors className="w-3 h-3 text-zinc-400" />
                  Print cut borders
                </p>
                <p className="text-[10px] text-zinc-500">Dotted line for scissors trimming</p>
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
