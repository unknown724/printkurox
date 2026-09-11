'use client';

import React from 'react';
import {
  Maximize2,
  CreditCard,
  FileText,
  Grid,
  Columns,
  Scissors,
  Compass,
} from 'lucide-react';

export type LayoutMode = '1-up' | '2-up' | 'id-card' | '4-up' | '6-up' | '8-up' | '9-up' | '16-up' | 'custom' | 'booklet' | 'poster';
export type FitMode = 'fit' | 'fill' | 'actual' | 'custom';

export type TextPosition = 'header' | 'middle' | 'footer' | 'cover_title' | 'watermark' | 'custom';
export type TextFontFamily = 'sans' | 'serif' | 'mono' | 'display' | 'handwriting' | 'geometric';

export interface TextOverlayItem {
  id: string;
  text: string;
  position: TextPosition;
  customX?: number; // 0 to 100% horizontal coordinate on sheet
  customY?: number; // 0 to 100% vertical coordinate on sheet
  fontFamily: TextFontFamily;
  fontSize: 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  customFontSize?: number; // Exact point size, e.g. 8 to 200+
  color?: string;
  opacity?: number;
  applyTo?: 'first_page' | 'all_pages' | 'last_page';
}

export interface TextOverlayConfig {
  enabled: boolean;
  text?: string;
  subtitle?: string;
  position?: TextPosition;
  customX?: number; // 0 to 100% horizontal coordinate on sheet
  customY?: number; // 0 to 100% vertical coordinate on sheet
  fontFamily?: TextFontFamily;
  fontSize?: 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  customFontSize?: number; // Exact point size, e.g. 8 to 200+
  color?: string;
  opacity?: number;
  applyTo?: 'first_page' | 'all_pages' | 'last_page';
  // Multi-text support
  items?: TextOverlayItem[];
  activeItemId?: string;
}

export function getTextOverlayItems(config?: TextOverlayConfig): TextOverlayItem[] {
  if (!config) return [];
  if (config.items && config.items.length > 0) {
    return config.items;
  }
  if (config.text && config.text.trim()) {
    return [
      {
        id: 'item-1',
        text: config.text,
        position: config.position || 'custom',
        customX: config.customX ?? 50,
        customY: config.customY ?? 50,
        fontFamily: config.fontFamily || 'sans',
        fontSize: config.fontSize || 'md',
        customFontSize: config.customFontSize || 28,
        color: config.color || '#111827',
        opacity: config.opacity ?? 1.0,
        applyTo: config.applyTo || 'all_pages',
      },
    ];
  }
  return [];
}

export interface PhotoLayoutSettings {
  layoutMode: LayoutMode;
  fitMode: FitMode;
  drawBorder: boolean;
  orientation: 'portrait' | 'landscape' | 'auto';
  pagesPerSheet?: number;
  customCols?: number;
  customRows?: number;
  autoRotate?: boolean;
  pageOrder?: 'horizontal' | 'vertical';
  bookletSubset?: 'both' | 'front' | 'back';
  bookletBinding?: 'left' | 'right';
  textOverlay?: TextOverlayConfig;
}

interface PhotoLayoutSelectorProps {
  settings: PhotoLayoutSettings;
  onChange: (updated: PhotoLayoutSettings) => void;
  fileCount?: number;
}

export function PhotoLayoutSelector({
  settings,
  onChange,
  fileCount = 1,
}: PhotoLayoutSelectorProps) {
  const update = (patch: Partial<PhotoLayoutSettings>) => {
    onChange({ ...settings, ...patch });
  };

  const layoutOptions: Array<{
    id: LayoutMode;
    label: string;
    sub: string;
    icon: React.ReactNode;
    badge?: string;
  }> = [
    {
      id: '1-up',
      label: 'Full Page Photo',
      sub: '1 picture per sheet',
      icon: <FileText className="w-4 h-4 text-blue-500" />,
      badge: 'Standard',
    },
    {
      id: 'id-card',
      label: '2-in-1 ID Card',
      sub: 'Front & Back on 1 A4',
      icon: <CreditCard className="w-4 h-4 text-amber-500" />,
      badge: fileCount === 2 ? 'Recommended' : undefined,
    },
    {
      id: '2-up',
      label: '2 Pages / Sheet',
      sub: 'Side-by-side notes',
      icon: <Columns className="w-4 h-4 text-emerald-500" />,
      badge: 'Save 50%',
    },
    {
      id: '4-up',
      label: '4-in-1 Grid',
      sub: 'Slides & handouts',
      icon: <Grid className="w-4 h-4 text-purple-500" />,
    },
  ];

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/90 p-3.5 sm:p-4 space-y-4 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-500/10 dark:bg-white/10 border border-blue-500/20 dark:border-white/15 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Maximize2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              Photo & Page Layout
              <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.2 rounded border border-blue-200 dark:border-blue-900/50">
                Print Menu
              </span>
            </h3>
            <p className="text-[11px] text-zinc-500">
              Windows Photo & Adobe Acrobat layout presets
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Layout Modes (Windows & Adobe style) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {layoutOptions.map((opt) => {
          const isSelected = settings.layoutMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => update({ layoutMode: opt.id })}
              className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden ${
                isSelected
                  ? 'border-blue-500 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-500/10 shadow-xs ring-1 ring-blue-500/30'
                  : 'border-zinc-200 bg-zinc-50/60 hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20'
              }`}
            >
              {opt.badge && (
                <span
                  className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    isSelected
                      ? 'bg-blue-500 text-white dark:bg-blue-500'
                      : 'bg-zinc-200 text-zinc-700 dark:bg-white/10 dark:text-zinc-300'
                  }`}
                >
                  {opt.badge}
                </span>
              )}
              <div className="mb-2">{opt.icon}</div>
              <div>
                <p
                  className={`text-xs font-semibold ${
                    isSelected
                      ? 'text-blue-900 dark:text-blue-300'
                      : 'text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">
                  {opt.sub}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Windows Legacy "Fit Picture to Frame" & Adobe Acrobat Cut Border Toggles */}
      <div className="pt-2 border-t border-zinc-100 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Fit picture to frame */}
        <label
          className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
            settings.fitMode === 'fill'
              ? 'border-zinc-900 bg-zinc-50 dark:border-white/30 dark:bg-white/[0.06]'
              : 'border-zinc-200/80 bg-transparent dark:border-white/10'
          }`}
        >
          <input
            type="checkbox"
            checked={settings.fitMode === 'fill'}
            onChange={(e) => update({ fitMode: e.target.checked ? 'fill' : 'fit' })}
            className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-white/20 dark:bg-zinc-900"
          />
          <div className="text-xs">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
              Fit picture to frame
              <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                (Full A4 Fill)
              </span>
            </span>
            <p className="text-[11px] text-zinc-500 mt-0.5 leading-normal">
              Expands photo across page edges so it doesn&apos;t print small in the center.
            </p>
          </div>
        </label>

        {/* Print cutting guide border (Adobe Acrobat style) */}
        <label
          className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
            settings.drawBorder
              ? 'border-zinc-900 bg-zinc-50 dark:border-white/30 dark:bg-white/[0.06]'
              : 'border-zinc-200/80 bg-transparent dark:border-white/10'
          }`}
        >
          <input
            type="checkbox"
            checked={settings.drawBorder}
            onChange={(e) => update({ drawBorder: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-zinc-300 dark:border-white/20 dark:bg-zinc-900"
          />
          <div className="text-xs">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
              <Scissors className="w-3.5 h-3.5 text-zinc-500" />
              Print cutting borders
            </span>
            <p className="text-[11px] text-zinc-500 mt-0.5 leading-normal">
              Draws faint dashed guide line around cards or photos for clean scissors cutting.
            </p>
          </div>
        </label>
      </div>

      {/* Orientation selector */}
      <div className="pt-2 border-t border-zinc-100 dark:border-white/10 flex items-center justify-between text-xs">
        <span className="text-zinc-600 dark:text-zinc-400 font-medium flex items-center gap-1.5 text-[11px]">
          <Compass className="w-3.5 h-3.5 text-zinc-500" />
          Page Orientation
        </span>
        <div className="inline-flex rounded-lg p-0.5 bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10">
          {(['auto', 'portrait', 'landscape'] as const).map((orient) => (
            <button
              key={orient}
              type="button"
              onClick={() => update({ orientation: orient })}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md capitalize transition-all cursor-pointer ${
                settings.orientation === orient
                  ? 'bg-white text-zinc-950 shadow-xs dark:bg-white dark:text-zinc-950 font-bold'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              {orient === 'auto' ? 'Auto Rotate' : orient}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
