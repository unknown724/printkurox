'use client';

import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Thermometer,
  HardDrive,
  BatteryCharging,
  Wifi,
  Clock,
  ShieldCheck,
  Ban,
  Infinity as InfinityIcon,
  Plus,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import type { DossierAccessLists, PiSystemTelemetry } from '@/lib/settings';

interface PiHealthAndDossierCardProps {
  piTelemetry?: PiSystemTelemetry | null;
  dossierAccess: DossierAccessLists;
  onDossierAccessChange: (next: DossierAccessLists) => void;
  onRefreshStats?: () => void;
}

function formatUptime(sec?: number | null): string {
  if (!sec || sec < 0) return '—';
  const days = Math.floor(sec / 86400);
  const hrs = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function PiHealthAndDossierCard({
  piTelemetry,
  dossierAccess,
  onDossierAccessChange,
  onRefreshStats,
}: PiHealthAndDossierCardProps) {
  const [phoneInput, setPhoneInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(id);
  }, [piTelemetry?.updated_at]);

  const runDossierAction = async (
    action: 'add_unlimited' | 'remove_unlimited' | 'ban_phone' | 'unban_phone',
    targetPhone?: string
  ) => {
    const raw = targetPhone ?? phoneInput;
    const digits = raw.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setFeedback({ type: 'err', text: 'Enter a valid 10-digit WhatsApp mobile number.' });
      return;
    }

    setBusyAction(`${action}:${digits}`);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          phone: digits,
          note: noteInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ type: 'err', text: data.error || 'Failed to update WhatsApp access.' });
      } else {
        onDossierAccessChange(data.dossierAccess);
        if (!targetPhone) {
          setPhoneInput('');
          setNoteInput('');
        }
        const label =
          action === 'add_unlimited'
            ? `Unlocked permanent ∞ dossier for +91 ${digits}`
            : action === 'ban_phone'
            ? `Banned +91 ${digits} from dossier access`
            : `Updated +91 ${digits}`;
        setFeedback({ type: 'ok', text: label });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Network error updating dossier list.' });
    } finally {
      setBusyAction(null);
    }
  };

  const tempC = piTelemetry?.cpu_temp_c;
  const tempBadgeClass =
    tempC == null
      ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
      : tempC >= 75
      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
      : tempC >= 65
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30'
      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';

  const piLastSync = piTelemetry?.updated_at
    ? Math.max(0, Math.round((nowMs - new Date(piTelemetry.updated_at).getTime()) / 1000))
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. RASPBERRY PI 3B+ LIVE HEALTH CARD */}
      <div className="rounded-2xl p-5 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] space-y-4 shadow-2xs">
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-[#282a2c]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Cpu className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider truncate">
                Raspberry Pi / Host Health
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {piTelemetry?.device_model || 'Waiting for Linux/Pi daemon heartbeat…'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {piLastSync !== null && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold ${
                  piLastSync <= 90
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                }`}
              >
                {piLastSync <= 90 ? `Live (${piLastSync}s)` : `${Math.round(piLastSync / 60)}m ago`}
              </span>
            )}
            {onRefreshStats && (
              <button
                type="button"
                onClick={onRefreshStats}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 cursor-pointer"
                title="Refresh Pi Health"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {!piTelemetry ? (
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-dashed border-zinc-200 dark:border-[#282a2c] text-xs text-zinc-500 dark:text-zinc-400">
            No Raspberry Pi telemetry yet. Once <code className="font-mono">printer_daemon_linux.py</code> starts on your Pi 3B+, CPU temperature, power/battery health, USB free space, RAM, Wi-Fi dBm, and uptime appear here automatically with zero extra Worker requests.
          </div>
        ) : (
          <div className="space-y-3">
            {piTelemetry.undervoltage_now && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Undervoltage detected (&lt;4.63V) — check Pi 5V/2.5A power adapter or cable!</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c]">
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-zinc-400">
                  <Thermometer className="w-3 h-3 text-amber-500" />
                  <span>CPU Temp</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-base font-extrabold font-mono text-zinc-900 dark:text-white">
                    {tempC != null ? `${tempC}°C` : 'N/A'}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tempBadgeClass}`}>
                    {tempC == null ? '—' : tempC >= 75 ? 'Hot' : tempC >= 65 ? 'Warm' : 'Cool'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c]">
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-zinc-400">
                  <BatteryCharging className="w-3 h-3 text-emerald-500" />
                  <span>Power / Battery</span>
                </div>
                <div className="mt-1 text-xs font-bold font-mono text-zinc-900 dark:text-white truncate" title={piTelemetry.power_source}>
                  {piTelemetry.battery_pct != null
                    ? `${piTelemetry.battery_pct}%`
                    : piTelemetry.power_source || '5V Adapter'}
                </div>
                <div className="text-[10px] text-zinc-400 truncate">
                  {piTelemetry.throttled_now ? 'Throttled' : 'Voltage OK'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c]">
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-zinc-400">
                  <Clock className="w-3 h-3 text-blue-500" />
                  <span>Uptime &amp; Load</span>
                </div>
                <div className="mt-1 text-sm font-extrabold font-mono text-zinc-900 dark:text-white">
                  {formatUptime(piTelemetry.uptime_sec)}
                </div>
                <div className="text-[10px] text-zinc-400">
                  Load: {piTelemetry.cpu_load_1m ?? '—'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c]">
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-zinc-400">
                  <HardDrive className="w-3 h-3 text-indigo-500" />
                  <span>USB Storage</span>
                </div>
                <div className="mt-1 text-sm font-extrabold font-mono text-zinc-900 dark:text-white">
                  {piTelemetry.disk_free_gb != null ? `${piTelemetry.disk_free_gb} GB free` : '—'}
                </div>
                <div className="text-[10px] text-zinc-400">
                  {piTelemetry.disk_used_gb ?? '—'} / {piTelemetry.disk_total_gb ?? '—'} GB ({piTelemetry.disk_used_pct ?? 0}%)
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c]">
                <div className="text-[10px] uppercase font-bold text-zinc-400">RAM &amp; Swap</div>
                <div className="mt-1 text-sm font-extrabold font-mono text-zinc-900 dark:text-white">
                  {piTelemetry.ram_used_mb != null ? `${piTelemetry.ram_used_mb}/${piTelemetry.ram_total_mb}M` : '—'}
                </div>
                <div className="text-[10px] text-zinc-400">
                  Swap: {piTelemetry.swap_used_mb ?? 0}/{piTelemetry.swap_total_mb ?? 0} MB
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c]">
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-zinc-400">
                  <Wifi className="w-3 h-3 text-sky-500" />
                  <span>Wi-Fi Signal</span>
                </div>
                <div className="mt-1 text-xs font-extrabold font-mono text-zinc-900 dark:text-white truncate">
                  {piTelemetry.wifi_ssid || 'Ethernet / LAN'}
                </div>
                <div className="text-[10px] text-zinc-400">
                  {piTelemetry.wifi_signal_dbm != null ? `${piTelemetry.wifi_signal_dbm} dBm` : 'Connected'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. WHATSAPP DOSSIER PERMANENT UNLOCK & BAN MANAGER */}
      <div className="rounded-2xl p-5 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] space-y-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-[#282a2c]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
              <InfinityIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                WhatsApp Dossier Unlimited &amp; Ban Control
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Permanent full-dossier unlock (∞) or instant ban per WhatsApp number · Direct D1 synced
              </p>
            </div>
          </div>
        </div>

        {/* Add Number Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="10-digit WhatsApp (e.g. 9863013886)"
            className="sm:col-span-5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-zinc-50 dark:bg-[#131314] text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <input
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Name / Note (optional)"
            className="sm:col-span-3 px-3 py-2 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-zinc-50 dark:bg-[#131314] text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => runDossierAction('add_unlimited')}
            className="sm:col-span-2 px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Unlock ∞</span>
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => runDossierAction('ban_phone')}
            className="sm:col-span-2 px-2.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Ban</span>
          </button>
        </div>

        {feedback && (
          <p className={`text-[11px] font-medium ${feedback.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            {feedback.text}
          </p>
        )}

        {/* Active Unlimited & Banned Lists */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c] space-y-2 max-h-44 overflow-y-auto">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Permanent Unlimited ({dossierAccess.unlimited.length})
              </span>
            </div>
            {dossierAccess.unlimited.length === 0 ? (
              <p className="text-[11px] text-zinc-400">No extra VIP numbers added yet.</p>
            ) : (
              dossierAccess.unlimited.map((u) => (
                <div key={u.phone} className="flex items-center justify-between gap-2 py-1 border-b border-zinc-200/60 dark:border-white/5 last:border-none">
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100">+91 {u.phone}</div>
                    {u.note && <div className="text-[10px] text-zinc-500 truncate">{u.note}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => runDossierAction('ban_phone', u.phone)}
                      className="p-1 rounded hover:bg-rose-500/15 text-rose-500 cursor-pointer"
                      title="Ban this number"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => runDossierAction('remove_unlimited', u.phone)}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 cursor-pointer"
                      title="Remove unlimited unlock"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c] space-y-2 max-h-44 overflow-y-auto">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-rose-500">
              <span className="flex items-center gap-1">
                <Ban className="w-3 h-3" /> Banned Numbers ({dossierAccess.banned.length})
              </span>
            </div>
            {dossierAccess.banned.length === 0 ? (
              <p className="text-[11px] text-zinc-400">No numbers banned.</p>
            ) : (
              dossierAccess.banned.map((b) => (
                <div key={b.phone} className="flex items-center justify-between gap-2 py-1 border-b border-zinc-200/60 dark:border-white/5 last:border-none">
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-rose-600 dark:text-rose-400">+91 {b.phone}</div>
                    {b.note && <div className="text-[10px] text-zinc-500 truncate">{b.note}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => runDossierAction('unban_phone', b.phone)}
                    className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold cursor-pointer shrink-0"
                  >
                    Unban
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
