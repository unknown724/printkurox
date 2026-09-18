'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MapPin,
  Check,
  Building2,
  Clock,
  Sparkles,
  ChevronRight,
  X,
  AlertCircle,
  HelpCircle,
  Lock,
} from 'lucide-react';
import { getCampusStations, StationConfig } from '@/lib/stations';

interface StationLiveStatus {
  stationId: string;
  name: string;
  shortName: string;
  blockCode: string;
  riverName: string;
  online: boolean;
  status: 'active' | 'standby' | 'expansion_planned';
  lastSeen: string | null;
  ageSeconds: number | null;
}

interface HostelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStationId?: string;
  onStationSelect?: (stationId: string) => void;
}

function getCleanRoomLocation(st: StationConfig): string {
  if (st.id === 'block_b' || st.id === 'main') return 'Room 29 (1st Fl)';
  if (st.id === 'block_c') return 'Ground Floor';
  if (st.id === 'girls_hostel') return 'Girls Complex';
  if (st.id === 'romen' || st.id === 'romen_xerox') return 'Near Main Gate';
  return 'Common Area';
}

// Lock flag: Set to false to allow interactive station selection when enabled by admin
export const IS_FEATURE_LOCKED = false;

export function HostelSelectorModal({
  isOpen,
  onClose,
  currentStationId,
  onStationSelect,
}: HostelSelectorModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = currentStationId || searchParams.get('station') || 'block_b';

  const [mounted, setMounted] = useState(false);
  const [liveStatuses, setLiveStatuses] = useState<Record<string, StationLiveStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const campusStations = getCampusStations();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch real-time status for all campus stations
  const fetchAllStatuses = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/printer-status?all=true', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.stations && Array.isArray(data.stations)) {
          const map: Record<string, StationLiveStatus> = {};
          data.stations.forEach((st: StationLiveStatus) => {
            map[st.stationId] = st;
          });
          setLiveStatuses(map);
        }
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAllStatuses();
      const interval = setInterval(fetchAllStatuses, 20_000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Handle body scroll lock & Escape key
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const handleSelectStation = (station: StationConfig) => {
    if (station.status === 'expansion_planned') {
      setNotice(
        `Station Not Added Yet: ${station.name} is planned for expansion. Please print via Hostel Block B (Pare, Room 29) for immediate printing!`
      );
      setTimeout(() => setNotice(null), 5000);
      return;
    }

    if (station.status === 'standby') {
      setNotice(
        `Station Setup In Progress: ${station.name} hardware pairing is underway. Please print via Hostel Block B (Pare, Room 29) for instant pickup!`
      );
      setTimeout(() => setNotice(null), 5000);
      return;
    }

    // Active station selection
    if (onStationSelect) {
      onStationSelect(station.id);
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.set('station', station.id);
      router.push(`/?${params.toString()}`);
    }

    try {
      localStorage.setItem('nerist_selected_station', station.id);
    } catch {}

    onClose();
  };

  // Locked mode: Displays "Features to be updated soon" dialog and conceals upcoming multi-station configurations
  if (IS_FEATURE_LOCKED) {
    const lockedModalContent = (
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="locked-modal-title"
      >
        <div
          className="relative w-full max-w-sm sm:max-w-md rounded-3xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-[#0f0f13] shadow-2xl p-6 sm:p-7 overflow-hidden text-center animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Subtle Top Hairline Highlight */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-300 dark:via-white/20 to-transparent" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 p-1.5 rounded-xl border border-zinc-200/80 dark:border-white/10 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Lock Icon - Frosted Stealth Glass */}
          <div className="w-13 h-13 rounded-2xl bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-700 dark:text-zinc-200 mx-auto mt-2 mb-4 shadow-xs">
            <Lock className="w-6 h-6 stroke-[2.2]" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/10 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-2.5">
            <Sparkles className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>Campus Network Expansion</span>
          </div>

          <h3 id="locked-modal-title" className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Features to be updated soon
          </h3>

          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
            Multi-hostel station switching is currently under setup across campus. Printing is active and ready at{' '}
            <span className="font-semibold text-zinc-900 dark:text-zinc-200">Hostel Block B (Pare, Room 29)</span>.
          </p>

          {/* Active Station Card - Clean Frosted Glass */}
          <div className="mt-5 p-3.5 rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50/70 dark:bg-white/[0.03] text-left flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">Hostel Block B (Pare)</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Room 29, 1st Floor · Ready to Print</p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
              ONLINE
            </span>
          </div>

          {/* Dismiss Button - Theme High-Contrast (Obsidian / Crisp White) */}
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full py-2.5 sm:py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 font-bold text-xs sm:text-sm transition-all shadow-md shadow-black/10 dark:shadow-white/5 cursor-pointer active:scale-98"
          >
            Got it
          </button>
        </div>
      </div>
    );

    return createPortal(lockedModalContent, document.body);
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hostel-modal-title"
    >
      <div
        className="relative w-full max-w-xl sm:max-w-2xl rounded-2xl sm:rounded-3xl border border-zinc-200/90 dark:border-white/10 bg-white dark:bg-[#0f0f13] shadow-2xl overflow-hidden flex flex-col my-auto max-h-[86vh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Decorative Gradient Line */}
        <div className="h-1 w-full shrink-0 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500" />

        {/* Modal Header (Always visible, shrink-0) */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-zinc-100 dark:border-white/[0.08] flex items-start justify-between bg-white dark:bg-[#0f0f13]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                NERIST Campus Print Network · Arunachal Pradesh
              </span>
            </div>
            <h2 id="hostel-modal-title" className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-500 shrink-0" />
              Hostel Print Stations
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Select your hostel block. Real-time availability updates live every 20s.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Notice Banner */}
        {notice && (
          <div className="shrink-0 mx-4 mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="flex-1 text-[11px] leading-relaxed">{notice}</p>
          </div>
        )}

        {/* Station Grid (2 Cards per row for fast, professional selection) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 scrollbar-thin">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              Choose Hostel Block ({campusStations.length})
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              2 per row · tap to select
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {campusStations.map((st) => {
              const live = liveStatuses[st.id];
              const isOnline = live ? live.online : st.status === 'active';
              const isSelected = activeId === st.id || (activeId === 'main' && st.id === 'block_b');

              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => handleSelectStation(st)}
                  className={`group text-left p-3 sm:p-3.5 rounded-2xl border transition-all relative flex flex-col justify-between overflow-hidden cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-500 shadow-md ring-2 ring-blue-500/30 dark:ring-blue-500/40'
                      : st.status === 'active'
                      ? 'bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-500/50 hover:shadow-md'
                      : 'bg-zinc-50/50 dark:bg-white/[0.02] border-zinc-200/60 dark:border-white/5 opacity-75 hover:opacity-100 hover:border-zinc-300 dark:hover:border-white/15'
                  }`}
                >
                  {/* Selected Indicator Glow */}
                  {isSelected && (
                    <div className="absolute top-0 right-0 w-12 h-12 bg-blue-500/10 dark:bg-blue-400/15 rounded-bl-full pointer-events-none" />
                  )}

                  {/* Header: Hostel Block Badge + Checkmark or Slot */}
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className={`text-[10px] sm:text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-white/10'
                      }`}>
                        {st.blockCode}
                      </span>

                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono text-zinc-400">
                          #{st.slot}
                        </span>
                      )}
                    </div>

                    {/* River Name & Room */}
                    <div className="mt-1">
                      <div className="font-bold text-sm sm:text-base text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug truncate">
                        {st.riverName}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span className="truncate">{getCleanRoomLocation(st)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer: Printer Availability Status */}
                  <div className="pt-2 mt-2.5 border-t border-zinc-100 dark:border-white/[0.08] flex items-center justify-between">
                    {st.status === 'active' ? (
                      <span
                        className={`inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold ${
                          isOnline
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                          }`}
                        />
                        <span>{isOnline ? 'Printer Ready' : 'Standby'}</span>
                      </span>
                    ) : st.status === 'standby' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                        <Clock className="w-2.5 h-2.5 shrink-0" />
                        <span>In Setup</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                        Expansion Planned
                      </span>
                    )}

                    {isSelected && (
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                        Active
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Footer / Host a Station in your Block (Always visible, shrink-0) */}
        <div className="shrink-0 p-3.5 sm:p-4 bg-zinc-50 dark:bg-white/[0.02] border-t border-zinc-100 dark:border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>
              Want a print station in your hostel block? Quick turnkey setup available for block custodians.
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 font-medium text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
            <a
              href="https://wa.me/919863013886?text=Hi%20Devananda%2C%20I%20want%20to%20host%20a%20PrintKurox%20station%20in%20my%20NERIST%20Hostel%20Block!"
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-center text-xs transition-colors shadow-xs cursor-pointer"
            >
              Host a Station
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
