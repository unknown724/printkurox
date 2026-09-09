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
    sm: 'p-1 text-xs',
    md: 'p-1 text-xs sm:text-sm',
    lg: 'p-1.5 text-sm',
  };

  const itemPadding = {
    sm: 'py-1 px-2.5',
    md: 'py-2 px-3',
    lg: 'py-2.5 px-4',
  };

  return (
    <div
      role="radiogroup"
      className={`relative inline-flex items-center rounded-xl bg-slate-200/80 dark:bg-slate-900/90 border border-slate-300/70 dark:border-white/10 ${
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
            className={`relative flex items-center justify-center gap-1.5 rounded-lg font-bold transition-all duration-200 select-none ${
              itemPadding[size]
            } ${fullWidth ? 'flex-1' : ''} ${
              isSelected
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm shadow-black/10 border border-black/5 dark:border-white/10'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}`}
          >
            {option.icon && (
              <span className={`shrink-0 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {option.icon}
              </span>
            )}
            <span className="truncate">{option.label}</span>
            {option.badge && (
              <span
                className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                  isSelected
                    ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25'
                    : 'bg-slate-300/60 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400'
                }`}
              >
                {option.badge}
              </span>
            )}
            {option.sublabel && (
              <span className="text-[11px] font-medium opacity-75">
                {option.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
