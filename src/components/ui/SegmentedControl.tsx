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
      className={`relative inline-flex items-center rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-1 ${
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
            className={`relative flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 select-none ${
              itemPadding[size]
            } ${fullWidth ? 'flex-1' : ''} ${
              isSelected
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {option.icon && (
              <span className={`shrink-0 ${isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500'}`}>
                {option.icon}
              </span>
            )}
            <span className="truncate">{option.label}</span>
            {option.badge && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                  isSelected
                    ? 'bg-zinc-100 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
                    : 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
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
