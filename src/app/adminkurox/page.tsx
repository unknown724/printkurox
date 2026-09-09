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
  Eye,
  EyeOff,
  ShieldAlert,
  Activity,
  CheckCircle2,
  IndianRupee,
} from 'lucide-react';
import { getClientDetailedDevice } from '@/lib/device-detection';

interface AdminDevice {
  device_id: string;
  device_name: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active: string;
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
  const [showPassword, setShowPassword] = useState(false);
  const [customDeviceName, setCustomDeviceName] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [maxDevices, setMaxDevices] = useState<number>(4);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  useEffect(() => {
    getClientDetailedDevice().then((name) => {
      setCustomDeviceName(name);
    });
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
        if (data.maxDevices) setMaxDevices(data.maxDevices);
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
      const devName = customDeviceName.trim() || (await getClientDetailedDevice());
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
      if (data.maxDevices) {
        setMaxDevices(data.maxDevices);
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
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Verifying admin session...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6 pb-14 px-3 sm:px-0">
      {/* Header Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center space-x-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Kiosk</span>
        </Link>
        <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30 flex items-center gap-1.5 font-bold">
          ADMIN PORTAL
        </span>
      </div>

      {!isAdmin ? (
        /* Login Card */
        <div className="rounded-2xl p-6 sm:p-8 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] space-y-5 text-center relative overflow-hidden shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] flex items-center justify-center text-zinc-700 dark:text-zinc-300 mx-auto">
            <Lock className="w-5 h-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">PrintKurox Master Authorization</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
              Authorize this phone or laptop to print for free on the Epson L3210 printer without payment checkout.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3.5 max-w-sm mx-auto">
            {/* Auto-detected Device Indicator */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] text-left">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block">Auto-Detected Device</span>
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{customDeviceName || 'Detecting device...'}</span>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                Recognized
              </span>
            </div>

            <div className="relative">
              <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter Passcode"
                required
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] text-zinc-900 dark:text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                title={showPassword ? 'Hide passcode' : 'Show passcode'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="space-y-1 text-left">
              <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1 font-medium">
                <span>Device Label</span>
                <span className="text-zinc-400">Auto-detected</span>
              </div>
              <input
                type="text"
                value={customDeviceName}
                onChange={(e) => setCustomDeviceName(e.target.value)}
                placeholder="Auto-detected Device"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] text-zinc-900 dark:text-white placeholder-zinc-400 text-xs focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !pin}
              className="relative overflow-hidden w-full py-2.5 px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-white transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/15 dark:via-zinc-900/10 to-transparent animate-shimmer-sheen pointer-events-none" />
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authorizing...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authorize This Device</span>
                </>
              )}
            </button>
          </form>

          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Maximum {maxDevices} devices. Devices never expire until disconnected.
          </p>
        </div>
      ) : (
        /* Authenticated Dashboard */
        <div className="space-y-6">
          {/* Active Admin Status Banner */}
          <div className="rounded-2xl p-4 sm:p-5 border border-amber-500/30 bg-amber-500/[0.04] dark:bg-[#1e1f20] flex flex-wrap items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400">
                  Active Admin Recognized
                </span>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Admin Free Print Mode Enabled
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  This device is authorized to print directly without Razorpay payment.
                </p>
              </div>
            </div>

            <Link
              href="/"
              className="relative overflow-hidden px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 active:scale-[0.98]"
            >
              <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer-sheen pointer-events-none" />
              <span>Open Kiosk</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Bento KPI Telemetry Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Queue Activity */}
            <div className="rounded-2xl p-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] flex flex-col justify-between space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Live Queue</span>
                <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                  <Activity className="w-3.5 h-3.5 animate-pulse" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-bold text-zinc-900 dark:text-white font-mono">
                  {jobs.filter(j => j.status === 'PAID' || j.status.startsWith('PRINTING')).length}
                </span>
                <p className="text-[11px] text-zinc-500">Printing / Queued</p>
              </div>
            </div>

            {/* Card 2: Completed Jobs */}
            <div className="rounded-2xl p-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] flex flex-col justify-between space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Total Printed</span>
                <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {jobs.filter(j => j.status === 'COMPLETED').length}
                </span>
                <p className="text-[11px] text-zinc-500">of {jobs.length} total jobs</p>
              </div>
            </div>

            {/* Card 3: Razorpay Revenue */}
            <div className="rounded-2xl p-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] flex flex-col justify-between space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Gross Revenue</span>
                <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <IndianRupee className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
                  ₹{jobs.reduce((sum, j) => (j.status === 'COMPLETED' || j.status === 'PAID') && !j.payment_id?.startsWith('ADMIN_') ? sum + (j.total_price || 0) : sum, 0)}
                </span>
                <p className="text-[11px] text-zinc-500">Online UPI & Cards</p>
              </div>
            </div>

            {/* Card 4: Admin Slots */}
            <div className="rounded-2xl p-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] flex flex-col justify-between space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Admin Devices</span>
                <div className="w-7 h-7 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500">
                  <Laptop className="w-3.5 h-3.5" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-bold text-purple-600 dark:text-purple-400 font-mono">
                  {devices.length} / {maxDevices}
                </span>
                <p className="text-[11px] text-zinc-500">{Math.max(0, maxDevices - devices.length)} slots left</p>
              </div>
            </div>
          </div>

          {/* Connected Devices (Max 4 Devices Management) */}
          <div className="rounded-2xl p-5 space-y-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] shadow-2xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 dark:border-[#282a2c]">
              <div>
                <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-blue-500" />
                  <span>Authorized Devices</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-[#131314] text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-[#282a2c]">
                    {devices.length} / {maxDevices} Connected
                  </span>
                </span>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Permanent device authorization. Maximum {maxDevices} active devices.
                </p>
              </div>

              {devices.length < maxDevices && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                  <PlusCircle className="w-3 h-3" />
                  {maxDevices - devices.length} slot available
                </span>
              )}
            </div>

            {/* Devices List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {devices.map((d, index) => {
                const isCurrent = d.device_id === currentDeviceId;
                const isPhone = /iPhone|Android|iPad/i.test(d.user_agent);

                return (
                  <div
                    key={d.device_id}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-2 relative transition-all ${
                      isCurrent
                        ? 'border-amber-500/40 bg-amber-500/[0.03] dark:bg-[#131314]'
                        : 'border-zinc-200 dark:border-[#282a2c] bg-zinc-50/50 dark:bg-[#131314]/60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
                          {isPhone ? <Smartphone className="w-3.5 h-3.5" /> : <Laptop className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900 dark:text-white text-xs truncate max-w-[130px]">
                            {d.device_name}
                          </p>
                          <span className="text-[10px] text-zinc-500">Slot #{index + 1}</span>
                        </div>
                      </div>

                      {isCurrent && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          This Device
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-[10px] text-zinc-500 border-t border-zinc-100 dark:border-[#282a2c] pt-2">
                      <p>IP: <span className="font-mono text-zinc-700 dark:text-zinc-300">{d.ip_address}</span></p>
                      <p>Active: <span className="text-zinc-700 dark:text-zinc-300">{new Date(d.last_active).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></p>
                    </div>

                    {isCurrent ? (
                      <button
                        type="button"
                        onClick={() => handleRevokeDevice(d.device_id)}
                        className="w-full py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[11px] font-medium transition-all flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Disconnect</span>
                      </button>
                    ) : (
                      <div className="w-full py-1.5 px-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium flex items-center justify-center gap-1.5 cursor-default">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Admin Device</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Empty slot placeholder */}
              {Array.from({ length: Math.max(0, maxDevices - devices.length) }).map((_, i) => (
                <div
                  key={i}
                  className="p-4 rounded-xl border border-dashed border-zinc-200 dark:border-[#282a2c] flex flex-col items-center justify-center text-center space-y-1 bg-zinc-50/50 dark:bg-[#131314]/30 min-h-[130px]"
                >
                  <PlusCircle className="w-5 h-5 text-zinc-400 dark:text-zinc-600" />
                  <p className="text-xs font-medium text-zinc-500">Available Slot</p>
                  <p className="text-[10px] text-zinc-400">Open portal on another device</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent D1 Print Queue */}
          <div className="rounded-2xl p-5 space-y-3 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] shadow-2xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 dark:border-[#282a2c]">
              <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-500" />
                Live Print Queue
              </span>
              <button
                onClick={fetchRecentJobs}
                className="text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 transition-colors"
              >
                <RotateCcw className={`w-3 h-3 ${loadingJobs ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {loadingJobs ? (
              <div className="py-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span>Syncing queue...</span>
              </div>
            ) : jobs.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-500">No print jobs in queue.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {jobs.map((j) => (
                  <div
                    key={j.id}
                    className="p-3 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c] flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 text-xs px-2 py-0.5 rounded-full bg-zinc-200/60 dark:bg-[#282a2c] border border-zinc-300 dark:border-zinc-700">
                          {j.pickup_code}
                        </span>
                        <span className="font-semibold text-zinc-900 dark:text-zinc-200 truncate max-w-[200px]">
                          {j.file_name}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {j.total_pages} pages • {j.color_mode?.toUpperCase() || 'B&W'} • ₹{j.total_price} •{' '}
                        {j.payment_id?.startsWith('ADMIN_')
                          ? '👑 Admin Free'
                          : j.payment_id
                          ? 'Razorpay'
                          : 'Pending'}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        j.status === 'COMPLETED'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : j.status === 'PAID'
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                          : 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
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
