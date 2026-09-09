'use client';

import React from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (val: T) => void;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth = true,
  disabled = false,
}: SegmentedControlProps<T>) {
  const sizeClasses = {
    sm: 'p-0.5 text-xs',
    md: 'p-1 text-xs sm:text-sm',
    lg: 'p-1 text-sm',
  };

  const itemPadding = {
    sm: 'py-1 px-2',
    md: 'py-1.5 px-2.5',
    lg: 'py-2 px-3',
  };

  return (
    <div
      role="radiogroup"
      className={`relative inline-flex items-center rounded-xl bg-zinc-100 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c] ${
        sizeClasses[size]
      } ${fullWidth ? 'w-full' : ''}`}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`relative flex flex-col items-center justify-center min-w-0 rounded-lg transition-all duration-150 select-none ${
              option.sublabel ? 'py-1.5 px-2' : itemPadding[size]
            } ${fullWidth ? 'flex-1' : ''} ${
              isSelected
                ? 'bg-white dark:bg-[#282a2c] text-zinc-950 dark:text-white shadow-2xs font-semibold'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* Primary Row: Icon + Label + Badge */}
            <div className="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
              {option.icon && (
                <span className={`shrink-0 ${isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}`}>
                  {option.icon}
                </span>
              )}
              <span className="truncate text-xs sm:text-sm">{option.label}</span>
              {option.badge && (
                <span
                  className={`text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.2 rounded-full shrink-0 ${
                    isSelected
                      ? 'bg-zinc-100 dark:bg-[#1e1f20] text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700'
                      : 'bg-zinc-200/60 dark:bg-[#131314] text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {option.badge}
                </span>
              )}
            </div>

            {/* Secondary Row: Sublabel (stacked cleanly so mobile screens never squish or wrap) */}
            {option.sublabel && (
              <span className="text-[10px] sm:text-[11px] font-normal text-zinc-500 dark:text-zinc-400 truncate max-w-full mt-0.5">
                {option.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
