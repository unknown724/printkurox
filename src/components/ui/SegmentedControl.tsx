'use client';

import React from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeClassName?: string;
  icon?: React.ReactNode;
  activeClassName?: string;
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
      className={`relative inline-flex items-center rounded-xl bg-zinc-100/80 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/10 backdrop-blur-md ${
        sizeClasses[size]
      } ${fullWidth ? 'w-full' : ''}`}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        const defaultActive =
          'bg-white dark:bg-white/[0.1] text-zinc-950 dark:text-white shadow-xs border border-zinc-200/60 dark:border-white/20 font-semibold';
        const activeClass = option.activeClassName || defaultActive;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`relative flex flex-col items-center justify-center min-w-0 rounded-lg transition-all duration-200 select-none ${
              option.sublabel ? 'py-1.5 px-2' : itemPadding[size]
            } ${fullWidth ? 'flex-1' : ''} ${
              isSelected
                ? activeClass
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* Primary Row: Icon + Label + Badge */}
            <div className="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
              {option.icon && (
                <span className={`shrink-0 ${isSelected ? 'opacity-100' : 'opacity-60'}`}>
                  {option.icon}
                </span>
              )}

              <span className="truncate">{option.label}</span>

              {option.badge && (
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full border shrink-0 transition-colors ${
                    option.badgeClassName
                      ? option.badgeClassName
                      : isSelected
                      ? 'bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-white/20'
                      : 'bg-zinc-200/60 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border-transparent'
                  }`}
                >
                  {option.badge}
                </span>
              )}
            </div>

            {/* Sublabel */}
            {option.sublabel && (
              <span
                className={`text-[10px] truncate max-w-full mt-0.5 ${
                  isSelected ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {option.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
