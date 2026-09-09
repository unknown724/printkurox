'use client';

import React from 'react';

interface BentoCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}

export function BentoCard({
  title,
  subtitle,
  icon,
  badge,
  action,
  children,
  className = '',
  glow = false,
}: BentoCardProps) {
  return (
    <div
      className={`glass-bento rounded-2xl p-4 sm:p-5 relative overflow-hidden transition-all duration-200 ${
        glow ? 'border-glow-indigo' : ''
      } ${className}`}
    >
      {(title || icon || badge || action) && (
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/60 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                {icon}
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white tracking-wide">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {badge}
            {action}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
