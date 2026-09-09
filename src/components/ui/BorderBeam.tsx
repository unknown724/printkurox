'use client';

import React from 'react';

interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  borderWidth?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
  borderRadius?: number;
}

/**
 * BorderBeam provides a slow, smooth, traveling specular luminous shine along the perimeter
 * of the glassmorphism box/table without pulsating.
 */
export function BorderBeam({
  className = '',
  size = 360,
  duration = 14,
  borderWidth = 2.5,
  colorFrom = 'rgba(255, 255, 255, 1)',
  colorTo = 'transparent',
  delay = 0,
  borderRadius = 16,
}: BorderBeamProps) {
  return (
    <div
      style={
        {
          '--size': `${size}px`,
          '--duration': `${duration}s`,
          '--border-width': `${borderWidth}px`,
          '--delay': `-${delay}s`,
          '--color-from': colorFrom,
          '--color-to': colorTo,
          '--border-radius': `${borderRadius}px`,
        } as React.CSSProperties
      }
      className={`pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden z-20 ${className}`}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
        style={{
          border: `${borderWidth}px solid transparent`,
          WebkitMask:
            'linear-gradient(transparent, transparent), linear-gradient(white, white)',
          WebkitMaskClip: 'padding-box, border-box',
          WebkitMaskComposite: 'source-out',
          mask: 'linear-gradient(transparent, transparent), linear-gradient(white, white)',
          maskClip: 'padding-box, border-box',
          maskComposite: 'subtract',
        }}
      >
        <div
          className="absolute aspect-square w-[var(--size)] will-change-[offset-distance] animate-border-beam"
          style={{
            animationDuration: `var(--duration)`,
            animationDelay: `var(--delay)`,
            background: `linear-gradient(to left, var(--color-from) 0%, rgba(255, 255, 255, 0.9) 30%, rgba(255, 255, 255, 0.3) 65%, var(--color-to) 100%)`,
            offsetAnchor: '100% 50%',
            offsetPath: `rect(0 auto auto 0 round var(--border-radius))`,
            filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.95)) drop-shadow(0 0 16px rgba(255, 255, 255, 0.6))',
          }}
        />
      </div>
    </div>
  );
}
