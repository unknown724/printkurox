'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Lock,
  Printer,
  RotateCcw,
  ArrowLeft,
  KeyRound,
  Loader2,
  FileText,
  AlertTriangle,
  Smartphone,
  Laptop,
  Trash2,
  PlusCircle,
  ExternalLink,
} from 'lucide-react';

interface AdminDevice {
  device_id: string;
  device_name: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active: string;
}

function detectDeviceClient(): string {
  if (typeof window === 'undefined') return 'Web Client';
  const ua = navigator.userAgent;
  let os = 'Device';
  if (/iPhone/i.test(ua)) os = 'Apple iPhone';
  else if (/iPad/i.test(ua)) os = 'Apple iPad';
  else if (/Android/i.test(ua)) os = 'Android Phone';
  else if (/Windows NT 10.0/i.test(ua)) os = 'Windows PC';
  else if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'MacBook';
  else if (/Linux/i.test(ua)) os = 'Linux Device';

  let browser = '';
  if (/Firefox\/([0-9]+)/i.test(ua)) browser = ' (Firefox)';
  else if (/Edg\/([0-9]+)/i.test(ua)) browser = ' (Edge)';
  else if (/Chrome\/([0-9]+)/i.test(ua)) browser = ' (Chrome)';
  else if (/Safari\/([0-9]+)/i.test(ua) && !/Chrome/i.test(ua)) browser = ' (Safari)';

  return `${os}${browser}`;
}

interface Job {
  id: string;
  pickup_code: string;
  file_name: string;
  total_pages: number;
  color_mode: string;
  is_duplex: number;
  copies: number;
  total_price: number;
  status: string;
  payment_id: string | null;
  created_at: string;
}

export default function AdminKuroxPage() {
  const [pin, setPin] = useState('');
  const [customDeviceName, setCustomDeviceName] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  useEffect(() => {
    setCustomDeviceName(detectDeviceClient());
    checkAuthAndLoad();
  }, []);

  const checkAuthAndLoad = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/auth?action=devices');
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(true);
        setDevices(data.devices || []);
        setCurrentDeviceId(data.currentDeviceId || null);
        fetchRecentJobs();
      } else {
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const devName = customDeviceName.trim() || detectDeviceClient();
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, customDeviceName: devName }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Fast transition without waiting for another roundtrip
      setIsAdmin(true);
      if (data.devices) {
        setDevices(data.devices);
      }
      if (data.currentDeviceId) {
        setCurrentDeviceId(data.currentDeviceId);
      }
      setPin('');

      // Background load jobs without blocking UI
      fetchRecentJobs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid Passcode');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    if (!confirm('Disconnect and remove authorization for this device?')) return;
    try {
      const res = await fetch(`/api/admin/auth?deviceId=${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (deviceId === currentDeviceId) {
          setIsAdmin(false);
        } else {
          checkAuthAndLoad();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRecentJobs = async () => {
    try {
      setLoadingJobs(true);
      const res = await fetch('/api/admin/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingJobs(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-xs text-slate-400 font-medium">Verifying admin session...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6 pb-14">
      {/* Header Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go to Kiosk Web App</span>
        </Link>
        <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30 flex items-center gap-1.5 font-bold">
          👑 ADMINKUROX PORTAL
        </span>
      </div>

      {!isAdmin ? (
        /* Login Card */
        <div className="glass-card rounded-3xl p-6 sm:p-8 border-indigo-500/30 space-y-5 text-center relative overflow-hidden">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-indigo-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
            <Lock className="w-7 h-7" />
          </div>

          <div>
            <h2 className="text-xl font-black text-white">PrintKurox Master Authorization</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Authorize this phone or laptop to print for free on the Epson L3210 printer without Razorpay checkout.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3.5 max-w-sm mx-auto">
            {/* Auto-detected Device Indicator */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-left">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Auto-Detected Device</span>
                  <span className="text-xs font-bold text-white">{customDeviceName || 'Detecting device...'}</span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                Recognized
              </span>
            </div>

            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter Passcode"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/90 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1 text-left">
              <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 font-medium">
                <span>Device Label (Auto-detected)</span>
                <span className="text-slate-500">Editable if needed</span>
              </div>
              <input
                type="text"
                value={customDeviceName}
                onChange={(e) => setCustomDeviceName(e.target.value)}
                placeholder="Auto-detected Device"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !pin}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-indigo-600 to-violet-600 hover:from-amber-400 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authorizing...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authorize This Device (Permanent)</span>
                </>
              )}
            </button>
          </form>

          <p className="text-[11px] text-slate-500">
            🔒 Maximum 3 devices. Devices never expire until disconnected.
          </p>
        </div>
      ) : (
        /* Authenticated Dashboard */
        <div className="space-y-6">
          {/* Active Admin Status Banner */}
          <div className="rounded-2xl p-5 border-2 border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-amber-400">
                  👑 Active Admin Device Recognized
                </span>
                <h3 className="text-lg font-black text-white">
                  Admin Free Print Mode Enabled
                </h3>
                <p className="text-xs text-slate-300">
                  This device is registered and authorized with zero expiration.
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black text-xs font-extrabold transition-all shadow-lg shadow-amber-500/25 flex items-center gap-1.5"
            >
              <span>Open Kiosk (Admin Badge)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Connected Devices (Max 3 Devices Management) */}
          <div className="glass-card rounded-2xl p-5 space-y-4 border-slate-700/60">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div>
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-indigo-400" />
                  <span>Authorized Devices</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {devices.length} / 3 Connected
                  </span>
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Permanent device recognition (no expiration). Maximum 3 slots.
                </p>
              </div>

              {devices.length < 3 && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  <PlusCircle className="w-3 h-3" />
                  {3 - devices.length} slot available
                </span>
              )}
            </div>

            {/* Devices List */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {devices.map((d, index) => {
                const isCurrent = d.device_id === currentDeviceId;
                const isPhone = /iPhone|Android|iPad/i.test(d.user_agent);

                return (
                  <div
                    key={d.device_id}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-2 relative transition-all ${
                      isCurrent
                        ? 'border-amber-500/50 bg-gradient-to-b from-amber-950/20 to-slate-900 shadow-md shadow-amber-500/10'
                        : 'border-white/5 bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                          {isPhone ? <Smartphone className="w-3.5 h-3.5" /> : <Laptop className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <p className="font-bold text-white text-xs truncate max-w-[130px]">
                            {d.device_name}
                          </p>
                          <span className="text-[10px] text-slate-400">Slot #{index + 1}</span>
                        </div>
                      </div>

                      {isCurrent && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          This Device
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-[10px] text-slate-400 border-t border-white/5 pt-2">
                      <p>IP: <span className="font-mono text-slate-300">{d.ip_address}</span></p>
                      <p>Active: <span className="text-slate-300">{new Date(d.last_active).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRevokeDevice(d.device_id)}
                      className="w-full py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Disconnect Device</span>
                    </button>
                  </div>
                );
              })}

              {/* Empty slot placeholder */}
              {Array.from({ length: Math.max(0, 3 - devices.length) }).map((_, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center space-y-1 bg-slate-950/30 min-h-[140px]"
                >
                  <PlusCircle className="w-5 h-5 text-slate-600" />
                  <p className="text-xs font-medium text-slate-500">Available Device Slot</p>
                  <p className="text-[10px] text-slate-600">Open /adminkurox on another device to connect</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent D1 Print Queue */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-400" />
                Live Print Queue
              </span>
              <button
                onClick={fetchRecentJobs}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <RotateCcw className={`w-3 h-3 ${loadingJobs ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {loadingJobs ? (
              <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Syncing queue...</span>
              </div>
            ) : jobs.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No print jobs in queue.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {jobs.map((j) => (
                  <div
                    key={j.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {j.pickup_code}
                        </span>
                        <span className="font-medium text-slate-200 truncate max-w-[200px]">
                          {j.file_name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {j.total_pages} pages • {j.color_mode?.toUpperCase() || 'B&W'} • ₹{j.total_price} •{' '}
                        {j.payment_id?.startsWith('ADMIN_')
                          ? '👑 Admin Free'
                          : j.payment_id
                          ? 'Razorpay'
                          : 'Pending'}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        j.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : j.status === 'PAID'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {j.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
