'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AdminBadge } from '@/components/AdminBadge';
import { PrinterStatusPill } from '@/components/PrinterStatusPill';
import { PwaInstallButton } from '@/components/PwaInstallButton';
import { HostelSelectorModal } from '@/components/HostelSelectorModal';
import { getStationConfig, OFFICIAL_WHATSAPP_BOT_LINK, OFFICIAL_WHATSAPP_BOT_NUMBER } from '@/lib/stations';
import { ChevronDown, Building2, Lock, MessageCircle } from 'lucide-react';
import { useHostelChangeSetting } from '@/lib/useHostelChangeSetting';

function HeaderContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hostelChangeEnabled } = useHostelChangeSetting();

  const isRomenPath = pathname?.startsWith('/romen');
  const stationParam = searchParams.get('station') || searchParams.get('station_id');
  const isRomenStation = stationParam === 'romen' || stationParam === 'romen_xerox' || isRomenPath;

  const station = isRomenStation ? getStationConfig('romen_xerox') : getStationConfig(stationParam || 'block_b');
  const isRomen = station.id === 'romen_xerox';

  const [showHostelModal, setShowHostelModal] = useState(false);

  return (
    <header className="relative z-30 border-b border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-[#000000]/80 backdrop-blur-xl sticky top-0 transition-colors duration-200">
      {/* Subtle top hairline highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

      <div className="w-full max-w-xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1240px] mx-auto px-3.5 sm:px-4 h-14 flex items-center justify-between transition-all duration-300">
        {/* Brand Mark - Printer Logo & Campus Station Selector */}
        <div className="flex items-center space-x-2 sm:space-x-2.5">
          <Link href={isRomen ? '/?station=romen' : '/'} className="flex items-center space-x-2 group shrink-0">
            <div className="w-8 h-8 rounded-xl bg-black border border-red-500/40 flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/whatsapp_official_dp.jpg"
                alt="PrintKurox"
                className="w-full h-full object-cover"
              />
            </div>
          </Link>

          {/* Hostel Station Trigger / Static Badge */}
          {hostelChangeEnabled && !isRomen ? (
            <button
              type="button"
              onClick={() => setShowHostelModal(true)}
              className="text-left group/station flex items-center gap-1.5 p-1 -ml-1 rounded-xl transition-all hover:bg-zinc-100 dark:hover:bg-white/[0.06] cursor-pointer"
              title="Click to view & select NERIST hostel stations"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-[#f4f4f5] flex items-center gap-1">
                    PrintKurox
                  </span>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full border bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25">
                    {station.blockCode || 'Hostel'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-zinc-400 group-hover/station:text-red-500 transition-colors" />
                </div>
                <span className="block text-[10px] text-zinc-500 dark:text-zinc-400 font-normal -mt-0.5 truncate max-w-[170px] sm:max-w-[210px]">
                  {`${station.shortName || 'Block B · Pare'} (Room 29)`}
                </span>
              </div>
            </button>
          ) : (
            <div className="text-left flex items-center gap-1.5 p-1 -ml-1 select-none">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-[#f4f4f5] flex items-center gap-1">
                    {isRomen ? 'Romen Xerox' : 'PrintKurox'}
                  </span>
                  <span
                    className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full border ${
                      isRomen
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25'
                    }`}
                  >
                    {isRomen ? 'External' : station.blockCode || 'Hostel'}
                  </span>
                </div>
                <span className="block text-[10px] text-zinc-500 dark:text-zinc-400 font-normal -mt-0.5 truncate max-w-[170px] sm:max-w-[210px]">
                  {isRomen
                    ? 'Near Main Gate · Self-Service'
                    : `${station.shortName || 'Block B · Pare'} (Room 29)`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Official WhatsApp Bot Action Pill */}
          <a
            href={OFFICIAL_WHATSAPP_BOT_LINK}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-semibold shadow-xs transition-all hover:scale-[1.02] active:scale-95 group"
            title={`Chat with Official WhatsApp Print Bot (${OFFICIAL_WHATSAPP_BOT_NUMBER})`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <MessageCircle className="w-3.5 h-3.5 fill-current" />
            <span className="truncate">WA Bot</span>
          </a>
          <PwaInstallButton />
          <ThemeToggle />
          <AdminBadge />
          <PrinterStatusPill stationId={station.id} />
        </div>
      </div>

      {/* Campus Hostel Selector Modal (Rendered only when hostel change is enabled) */}
      {hostelChangeEnabled && (
        <HostelSelectorModal
          isOpen={showHostelModal}
          onClose={() => setShowHostelModal(false)}
          currentStationId={station.id}
        />
      )}
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
