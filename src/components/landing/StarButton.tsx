'use client';

import React, { useRef, useEffect } from 'react';

interface StarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  duration?: number;
  lightWidth?: number;
  lightColor?: string;
  borderWidth?: number;
  size?: 'sm' | 'md' | 'lg';
}

export function StarButton({
  children,
  duration = 3,
  lightWidth = 110,
  lightColor = '#FAFAFA',
  borderWidth = 2,
  size = 'md',
  className = '',
  ...props
}: StarButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (buttonRef.current) {
      const el = buttonRef.current;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      el.style.setProperty('--path', `path('M 0 0 H ${w} V ${h} H 0 V 0')`);
    }
  }, []);

  const sizeClasses =
    size === 'sm'
      ? 'h-8 px-4 text-xs'
      : size === 'lg'
      ? 'h-12 px-7 text-sm font-bold'
      : 'h-10 px-5 text-xs font-semibold';

  return (
    <button
      ref={buttonRef}
      style={
        {
          '--duration': duration,
          '--light-width': `${lightWidth}px`,
          '--light-color': lightColor,
          '--border-width': `${borderWidth}px`,
          isolation: 'isolate',
        } as React.CSSProperties
      }
      className={`relative z-[3] overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full transition-all group/star-button border border-white/25 active:scale-[0.98] ${sizeClasses} ${className}`}
      {...props}
    >
      {/* Orbiting star comet beam along border path */}
      <div
        className="absolute aspect-square inset-0 animate-star-btn bg-[radial-gradient(ellipse_at_center,var(--light-color),transparent,transparent)] pointer-events-none"
        style={{
          offsetPath: 'var(--path)',
          offsetDistance: '0%',
          width: 'var(--light-width)',
        }}
      />

      {/* Button Interior Fill */}
      <div
        className="absolute inset-[2px] z-[4] overflow-hidden rounded-[inherit] bg-black dark:bg-[#09090b] pointer-events-none transition-colors group-hover/star-button:bg-zinc-950"
        style={{ borderWidth: 'var(--border-width)' }}
      />

      {/* Button Label & Icon */}
      <span className="relative z-10 inline-flex items-center gap-1.5 text-white tracking-wide">
        {children}
      </span>
    </button>
  );
}
