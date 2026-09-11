'use client';

import React from 'react';
import { Sparkles, Droplets, SunMedium, Eye, Check } from 'lucide-react';
import { EnhanceMode } from '@/lib/image-enhancer';

interface DocumentEnhancerToolbarProps {
  currentMode: EnhanceMode;
  onModeChange: (mode: EnhanceMode) => void;
  disabled?: boolean;
}

export function DocumentEnhancerToolbar({
  currentMode,
  onModeChange,
  disabled = false,
}: DocumentEnhancerToolbarProps) {
  const modes: Array<{
    id: EnhanceMode;
    label: string;
    description: string;
    badge?: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'magic_bw',
      label: 'Magic B&W',
      description: 'Erases dark shadows, pure white paper + laser black text',
      badge: 'Best for Camera Docs',
      icon: <Sparkles className="w-3.5 h-3.5 text-amber-500" />,
    },
    {
      id: 'grayscale',
      label: 'Grayscale Boost',
      description: 'Whitens background while preserving ID photos & stamps',
      icon: <Droplets className="w-3.5 h-3.5 text-zinc-500" />,
    },
    {
      id: 'color_boost',
      label: 'Vivid Color',
      description: 'Removes dirty lighting while keeping blue ink & colored seals',
      icon: <SunMedium className="w-3.5 h-3.5 text-blue-500" />,
    },
    {
      id: 'none',
      label: 'Original',
      description: 'Natural photo without scan contrast enhancement',
      icon: <Eye className="w-3.5 h-3.5 text-zinc-400" />,
    },
  ];

  return (
    <div className="rounded-2xl border border-amber-500/20 dark:border-amber-400/20 bg-amber-50/40 dark:bg-amber-950/10 p-3.5 sm:p-4 space-y-3 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 dark:border-amber-400/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              Document Enhancer & Shadow Eraser
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.2 rounded border border-amber-300 dark:border-amber-800">
                CamScanner AI
              </span>
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Fixes dark/gray phone camera photos before printing
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {modes.map((m) => {
          const isSelected = currentMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onModeChange(m.id)}
              className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden ${
                isSelected
                  ? 'border-amber-500 bg-white dark:bg-[#1a1815] shadow-xs ring-2 ring-amber-500/30'
                  : 'border-zinc-200/80 bg-white/70 hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20'
              }`}
            >
              {m.badge && (
                <span className="absolute top-1.5 right-1.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white shadow-xs">
                  {m.badge}
                </span>
              )}
              <div className="flex items-center gap-1.5 mb-1.5">
                {m.icon}
                <span
                  className={`text-xs font-bold ${
                    isSelected
                      ? 'text-amber-900 dark:text-amber-300'
                      : 'text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  {m.label}
                </span>
                {isSelected && (
                  <Check className="w-3 h-3 text-amber-600 dark:text-amber-400 ml-auto" />
                )}
              </div>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                {m.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
