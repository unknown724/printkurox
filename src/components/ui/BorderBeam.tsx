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
 * BorderBeam provides a continuous, seamless, rotating specular luminous shine along
 * the perimeter of the glassmorphism card that never stops, pops, or vanishes.
 */
export function BorderBeam({
  className = '',
  duration = 10,
  borderWidth = 2,
  colorFrom = 'rgba(255, 255, 255, 1)',
  borderRadius = 16,
}: BorderBeamProps) {
  return (
    <div
      style={
        {
          '--duration': `${duration}s`,
          '--border-width': `${borderWidth}px`,
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
          className="absolute -inset-[150%] m-auto aspect-square will-change-transform animate-border-spin pointer-events-none"
          style={{
            background: `conic-gradient(from 0deg at 50% 50%, transparent 0deg, transparent 270deg, rgba(255, 255, 255, 0.25) 305deg, ${colorFrom} 345deg, rgba(255, 255, 255, 0.45) 358deg, transparent 360deg)`,
            animationDuration: `${duration}s`,
            transform: 'translateZ(0)',
          }}
        />
      </div>
    </div>
  );
}
