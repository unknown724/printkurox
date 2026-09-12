'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminBadge } from '@/components/AdminBadge';
import { PrinterStatusPill } from '@/components/PrinterStatusPill';
import { getStationConfig } from '@/lib/stations';

function HeaderContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isRomenPath = pathname?.startsWith('/romen');
  const stationParam = searchParams.get('station') || searchParams.get('station_id');
  const isRomenStation = stationParam === 'romen' || stationParam === 'romen_xerox' || isRomenPath;

  const station = isRomenStation ? getStationConfig('romen_xerox') : getStationConfig('main');
  const isRomen = station.id === 'romen_xerox';

  return (
    <header className="relative z-30 border-b border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-[#000000]/80 backdrop-blur-xl sticky top-0 transition-colors duration-200">
      {/* Subtle top hairline highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

      <div className="max-w-xl mx-auto px-3.5 sm:px-4 h-14 flex items-center justify-between">
        {/* Brand Mark - Printer Logo */}
        <Link href={isRomen ? '/?station=romen' : '/'} className="flex items-center space-x-2.5 group shrink-0">
          <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
            <svg
              className="w-4.5 h-4.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="kiosk-gemini-logo" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4285F4" />
                  <stop offset="50%" stopColor="#9B72CF" />
                  <stop offset="100%" stopColor="#D96570" />
                </linearGradient>
              </defs>
              <path
                d="M7 2.5H17V7.5H7V2.5Z"
                fill="url(#kiosk-gemini-logo)"
                opacity="0.85"
              />
              <rect
                x="3"
                y="7"
                width="18"
                height="10"
                rx="2.5"
                fill="url(#kiosk-gemini-logo)"
              />
              <path
                d="M6 14H18V19.5C18 20.0523 17.5523 20.5 17 20.5H7C6.44772 20.5 6 20.0523 6 19.5V14Z"
                fill="#ffffff"
              />
              <path d="M8.5 17H15.5" stroke="#131314" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="17.5" cy="10" r="0.9" fill="#ffffff" />
              <path
                d="M20 1C20 2.2 18.8 3.2 17.5 3.2C18.8 3.2 20 4.2 20 5.4C20 4.2 21.2 3.2 22.5 3.2C21.2 3.2 20 2.2 20 1Z"
                fill="url(#kiosk-gemini-logo)"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-[#f4f4f5] flex items-center gap-1.5">
              {isRomen ? 'Romen Xerox' : 'PrintKurox'}
              <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full border ${
                isRomen
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-200/80 dark:bg-white/10 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-white/15'
              }`}>
                {isRomen ? 'Station' : 'Kiosk'}
              </span>
            </h1>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-normal -mt-0.5">
              {isRomen ? 'Near Main Gate · Self-Service' : 'Block B · Room 29'}
            </p>
          </div>
        </Link>

        {/* Right controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <AdminBadge />
          <PrinterStatusPill />
        </div>
      </div>
    </header>
  );
}

export function KioskHeader() {
  return (
    <Suspense fallback={<header className="h-14 border-b border-zinc-200 dark:border-white/10" />}>
      <HeaderContent />
    </Suspense>
  );
}
