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
  Eye,
  EyeOff,
  CheckCircle2,
  IndianRupee,
  Droplet,
  Layers,
  Calendar,
  Download,
  TrendingUp,
  AlertCircle,
  Plus,
  Settings,
  Sparkles,
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

interface SuppliesData {
  id: number;
  black_pages_remaining: number;
  color_pages_remaining: number;
  black_capacity: number;
  color_capacity: number;
  paper_sheets_remaining: number;
  paper_capacity: number;
  blackPercent: number;
  colorPercent: number;
  paperPercent: number;
  last_black_refill: string | null;
  last_color_refill: string | null;
  last_paper_refill: string | null;
  updated_at: string;
}

interface TelemetryData {
  id: number;
  printer_name: string;
  is_online: number;
  status_code: number;
  status_text: string;
  spooler_jobs: number;
  updated_at: string;
}

interface MetricSummary {
  total_jobs: number;
  total_pages: number;
  bw_pages: number;
  color_pages: number;
  total_sheets: number;
  duplex_sheets: number;
  single_sheets: number;
  gross_revenue: number;
  consumableCost: number;
  netProfit: number;
}

interface PeriodBreakdown {
  period: string;
  jobs: number;
  total_pages: number;
  bw_pages: number;
  color_pages: number;
  sheets: number;
  revenue: number;
}

interface AdminStatsResponse {
  supplies: SuppliesData;
  telemetry: TelemetryData;
  allTime: MetricSummary;
  period: MetricSummary & { selected: string };
  history: {
    monthly: PeriodBreakdown[];
    daily: PeriodBreakdown[];
  };
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

  // Stats & Supplies State
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [period, setPeriod] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('all');
  const [historyTab, setHistoryTab] = useState<'monthly' | 'daily'>('monthly');
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [refilling, setRefilling] = useState(false);

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
        fetchStats('all');
      } else {
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (selectedPeriod = period) => {
    try {
      setLoadingStats(true);
      const res = await fetch(`/api/admin/stats?period=${selectedPeriod}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch admin stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handlePeriodChange = (newPeriod: 'all' | 'today' | 'week' | 'month' | 'year') => {
    setPeriod(newPeriod);
    fetchStats(newPeriod);
  };

  const handleRefillAction = async (action: 'refill_black' | 'refill_color' | 'refill_paper') => {
    try {
      setRefilling(true);
      const res = await fetch('/api/admin/supplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchStats(period);
        setShowRefillModal(false);
      }
    } catch (err) {
      console.error('Failed to refill supplies:', err);
    } finally {
      setRefilling(false);
    }
  };

  const handleExportCSV = () => {
    if (!stats) return;
    const records = historyTab === 'monthly' ? stats.history.monthly : stats.history.daily;
    const header = ['Period', 'Completed Jobs', 'B&W Pages', 'Color Pages', 'Total Sheets', 'Gross Revenue (INR)', 'Est. Net Profit (INR)'];
    const rows = records.map((r) => [
      r.period,
      r.jobs,
      r.bw_pages,
      r.color_pages,
      r.sheets,
      r.revenue,
      Math.max(0, Math.round((r.revenue - (r.bw_pages * 0.15 + r.color_pages * 0.35 + r.sheets * 0.65)) * 100) / 100),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [header.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `printkurox_analytics_${historyTab}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

      setIsAdmin(true);
      if (data.devices) setDevices(data.devices);
      if (data.maxDevices) setMaxDevices(data.maxDevices);
      if (data.currentDeviceId) setCurrentDeviceId(data.currentDeviceId);
      setPin('');

      fetchRecentJobs();
      fetchStats('all');
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

  const activeMetrics = stats ? (period === 'all' ? stats.allTime : stats.period) : null;

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 pb-16 px-3 sm:px-4">
      {/* Header Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center space-x-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Kiosk</span>
        </Link>
        <div className="flex items-center gap-2">
          {stats?.telemetry && (
            <span
              className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-bold ${
                stats.telemetry.is_online
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${stats.telemetry.is_online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {stats.telemetry.printer_name} • {stats.telemetry.status_text}
            </span>
          )}
          <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30 flex items-center gap-1.5 font-bold">
            ADMIN PORTAL
          </span>
        </div>
      </div>

      {!isAdmin ? (
        /* Login Card */
        <div className="max-w-md mx-auto rounded-2xl p-6 sm:p-8 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] space-y-5 text-center relative overflow-hidden shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] flex items-center justify-center text-zinc-700 dark:text-zinc-300 mx-auto">
            <Lock className="w-5 h-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">PrintKurox Master Authorization</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
              Authorize this device to access kiosk telemetry, ink capacity metrics, and free admin prints.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3.5 max-w-sm mx-auto">
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

            <button
              type="submit"
              disabled={submitting || !pin}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submitting ? 'Authenticating...' : 'Unlock Admin Portal'}</span>
            </button>
          </form>
        </div>
      ) : (
        /* Authenticated Admin Dashboard */
        <div className="space-y-6">
          {/* SECTION 1: INK QUANTITY & PRINTER CAPACITY COMMAND CENTER */}
          <div className="rounded-2xl p-5 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-100 dark:border-[#282a2c] gap-2">
              <div>
                <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Droplet className="w-4 h-4 text-blue-500" />
                  <span>Printer Supplies & Capacity Telemetry</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    Live EcoTank Model
                  </span>
                </span>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Calculates exact remaining printable page capacity based on Epson 003 bottle yields and real completed jobs.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRefillModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Refill Supplies</span>
                </button>
                <button
                  onClick={() => fetchStats(period)}
                  className="p-1.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-100 dark:hover:bg-[#131314] text-zinc-600 dark:text-zinc-300 transition-colors"
                  title="Refresh Telemetry"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Ink & Paper Gauges Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Black & White Ink Gauge */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-zinc-50/70 dark:bg-[#131314]/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-900 dark:bg-white border border-zinc-700" />
                    Black Ink Capacity
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      (stats?.supplies.blackPercent || 100) < 15
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {stats?.supplies.blackPercent || 100}% Left
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-zinc-900 dark:text-white font-mono">
                      {(stats?.supplies.black_pages_remaining ?? 4500).toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold text-zinc-500">pages remaining</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Of {(stats?.supplies.black_capacity ?? 4500).toLocaleString()} max pages (Epson 003 Black 65ml)
                  </p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (stats?.supplies.blackPercent || 100) < 15 ? 'bg-rose-500' : 'bg-zinc-900 dark:bg-white'
                    }`}
                    style={{ width: `${stats?.supplies.blackPercent || 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-zinc-500">
                    Last Refill: {stats?.supplies.last_black_refill ? new Date(stats.supplies.last_black_refill).toLocaleDateString() : 'Initial'}
                  </span>
                  <button
                    onClick={() => handleRefillAction('refill_black')}
                    disabled={refilling}
                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Reset Bottle
                  </button>
                </div>
              </div>

              {/* Full Color Inks Gauge */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-zinc-50/70 dark:bg-[#131314]/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                    <span className="flex items-center -space-x-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    </span>
                    Color Inks Capacity
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      (stats?.supplies.colorPercent || 100) < 15
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : 'bg-pink-500/15 text-pink-600 dark:text-pink-400'
                    }`}
                  >
                    {stats?.supplies.colorPercent || 100}% Left
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-pink-600 dark:text-pink-400 font-mono">
                      {(stats?.supplies.color_pages_remaining ?? 7500).toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold text-zinc-500">pages remaining</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Of {(stats?.supplies.color_capacity ?? 7500).toLocaleString()} max pages (Epson 003 C/M/Y Set)
                  </p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 bg-gradient-to-r from-cyan-400 via-pink-500 to-amber-400"
                    style={{ width: `${stats?.supplies.colorPercent || 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-zinc-500">
                    Last Refill: {stats?.supplies.last_color_refill ? new Date(stats.supplies.last_color_refill).toLocaleDateString() : 'Initial'}
                  </span>
                  <button
                    onClick={() => handleRefillAction('refill_color')}
                    disabled={refilling}
                    className="text-[10px] font-bold text-pink-600 dark:text-pink-400 hover:underline"
                  >
                    Reset Colors
                  </button>
                </div>
              </div>

              {/* Paper Inventory Gauge */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-zinc-50/70 dark:bg-[#131314]/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-500" />
                    Paper Ream / Tray
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      (stats?.supplies.paperPercent || 100) < 15
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {stats?.supplies.paperPercent || 100}% Left
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                      {(stats?.supplies.paper_sheets_remaining ?? 500).toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold text-zinc-500">sheets in tray</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Of {(stats?.supplies.paper_capacity ?? 500).toLocaleString()} sheets (75 GSM Standard A4)
                  </p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (stats?.supplies.paperPercent || 100) < 15 ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${stats?.supplies.paperPercent || 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-zinc-500">
                    Last Load: {stats?.supplies.last_paper_refill ? new Date(stats.supplies.last_paper_refill).toLocaleDateString() : 'Initial'}
                  </span>
                  <button
                    onClick={() => handleRefillAction('refill_paper')}
                    disabled={refilling}
                    className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    +500 Ream
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: TIME-BASED CLASSIFICATION & METRICS */}
          <div className="space-y-4">
            {/* Time Filter Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-[#1e1f20] border border-zinc-200 dark:border-[#282a2c] overflow-x-auto">
                {(
                  [
                    { key: 'all', label: 'All Time' },
                    { key: 'today', label: 'Today' },
                    { key: 'week', label: 'This Week' },
                    { key: 'month', label: 'This Month' },
                    { key: 'year', label: 'This Year' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => handlePeriodChange(t.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      period === t.key
                        ? 'bg-white dark:bg-[#131314] text-zinc-900 dark:text-white shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                <span>Showing: <strong className="text-zinc-700 dark:text-zinc-300 capitalize">{period === 'all' ? 'All-Time Totals' : period}</strong></span>
              </span>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Card 1: Total Pages Printed */}
              <div className="rounded-2xl p-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Total Pages Printed</span>
                  <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <span className="text-2xl font-bold text-zinc-900 dark:text-white font-mono">
                    {activeMetrics?.total_pages.toLocaleString() || 0}
                  </span>
                  <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold">
                    <span className="text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                      {activeMetrics?.bw_pages || 0} B&W
                    </span>
                    <span className="text-pink-600 dark:text-pink-400 bg-pink-500/10 px-1.5 py-0.5 rounded">
                      {activeMetrics?.color_pages || 0} Color
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Physical Sheets & Duplex Efficiency */}
              <div className="rounded-2xl p-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Paper Consumed</span>
                  <div className="w-7 h-7 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <span className="text-2xl font-bold text-zinc-900 dark:text-white font-mono">
                    {activeMetrics?.total_sheets.toLocaleString() || 0}
                  </span>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {activeMetrics?.duplex_sheets || 0} Duplex ({Math.round(((activeMetrics?.duplex_sheets || 0) / Math.max(1, activeMetrics?.total_sheets || 1)) * 100)}% 2-sided)
                  </p>
                </div>
              </div>

              {/* Card 3: Gross Revenue */}
              <div className="rounded-2xl p-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Gross Revenue</span>
                  <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                    <IndianRupee className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
                    ₹{(activeMetrics?.gross_revenue || 0).toLocaleString()}
                  </span>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {activeMetrics?.total_jobs || 0} completed orders
                  </p>
                </div>
              </div>

              {/* Card 4: Estimated Net Profit */}
              <div className="rounded-2xl p-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Est. Net Profit</span>
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    ₹{(activeMetrics?.netProfit || 0).toLocaleString()}
                  </span>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                    ~{Math.round(((activeMetrics?.netProfit || 0) / Math.max(1, activeMetrics?.gross_revenue || 1)) * 100)}% Net Margin
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: HISTORICAL BREAKDOWN TABLE & CSV EXPORT */}
          <div className="rounded-2xl p-5 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-100 dark:border-[#282a2c] gap-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-purple-500" />
                  Historical Analytics & Audit
                </span>
                <div className="flex items-center bg-zinc-100 dark:bg-[#131314] p-0.5 rounded-lg border border-zinc-200 dark:border-[#282a2c]">
                  <button
                    onClick={() => setHistoryTab('monthly')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                      historyTab === 'monthly'
                        ? 'bg-white dark:bg-[#1e1f20] text-zinc-900 dark:text-white shadow-2xs'
                        : 'text-zinc-500'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setHistoryTab('daily')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                      historyTab === 'daily'
                        ? 'bg-white dark:bg-[#1e1f20] text-zinc-900 dark:text-white shadow-2xs'
                        : 'text-zinc-500'
                    }`}
                  >
                    Daily (This Month)
                  </button>
                </div>
              </div>

              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-50 dark:hover:bg-[#131314] text-zinc-700 dark:text-zinc-300 text-[11px] font-bold transition-all flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV Report</span>
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-[#282a2c] text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-2.5 px-3">Period</th>
                    <th className="py-2.5 px-3">Orders</th>
                    <th className="py-2.5 px-3">B&W Pgs</th>
                    <th className="py-2.5 px-3">Color Pgs</th>
                    <th className="py-2.5 px-3">Total Sheets</th>
                    <th className="py-2.5 px-3">Revenue</th>
                    <th className="py-2.5 px-3">Est. Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-[#282a2c]">
                  {(!stats || (historyTab === 'monthly' ? stats.history.monthly.length === 0 : stats.history.daily.length === 0)) ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-xs text-zinc-500">
                        No historical print jobs in this range.
                      </td>
                    </tr>
                  ) : (
                    (historyTab === 'monthly' ? stats.history.monthly : stats.history.daily).map((row) => {
                      const estProfit = Math.max(
                        0,
                        Math.round((row.revenue - (row.bw_pages * 0.15 + row.color_pages * 0.35 + row.sheets * 0.65)) * 100) / 100
                      );
                      return (
                        <tr key={row.period} className="hover:bg-zinc-50/50 dark:hover:bg-[#131314]/50 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-900 dark:text-white">{row.period}</td>
                          <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300 font-mono">{row.jobs}</td>
                          <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300 font-mono">{row.bw_pages}</td>
                          <td className="py-2.5 px-3 text-pink-600 dark:text-pink-400 font-mono">{row.color_pages}</td>
                          <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-300 font-mono">{row.sheets}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-amber-600 dark:text-amber-400">₹{row.revenue}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">₹{estProfit}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 4: AUTHORIZED ADMIN DEVICES */}
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
              {devices.map((d) => {
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
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate max-w-[120px]">
                            {d.device_name}
                          </p>
                          <span className="text-[10px] text-zinc-500 block font-mono">{d.ip_address}</span>
                        </div>
                      </div>
                      {isCurrent && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                          This Device
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-zinc-200/50 dark:border-[#282a2c] text-[10px] text-zinc-400 space-y-0.5">
                      <p>Last active: {new Date(d.last_active).toLocaleDateString()}</p>
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

          {/* SECTION 5: RECENT PRINT QUEUE */}
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
                <span>Refresh Queue</span>
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

      {/* REFILL SUPPLIES MODAL */}
      {showRefillModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-[#282a2c] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-[#282a2c]">
              <div className="flex items-center gap-2">
                <Droplet className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">Refill Ink & Paper Supplies</h3>
              </div>
              <button
                onClick={() => setShowRefillModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Select what you just refilled in the physical Epson L3210 printer to reset and calibrate the digital capacity counters:
            </p>

            <div className="space-y-2.5 pt-1">
              <button
                onClick={() => handleRefillAction('refill_black')}
                disabled={refilling}
                className="w-full p-3 rounded-xl border border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-50 dark:hover:bg-[#131314] flex items-center justify-between text-left transition-all"
              >
                <div>
                  <p className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-900 dark:bg-white" />
                    Poured Black Ink Bottle (003)
                  </p>
                  <p className="text-[11px] text-zinc-500">Resets capacity to +4,500 standard B&W pages</p>
                </div>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Refill</span>
              </button>

              <button
                onClick={() => handleRefillAction('refill_color')}
                disabled={refilling}
                className="w-full p-3 rounded-xl border border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-50 dark:hover:bg-[#131314] flex items-center justify-between text-left transition-all"
              >
                <div>
                  <p className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <span className="flex items-center -space-x-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span className="w-2 h-2 rounded-full bg-pink-500" />
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                    </span>
                    Poured Color Ink Bottles (C/M/Y)
                  </p>
                  <p className="text-[11px] text-zinc-500">Resets capacity to +7,500 color pages</p>
                </div>
                <span className="text-xs font-bold text-pink-600 dark:text-pink-400">Refill</span>
              </button>

              <button
                onClick={() => handleRefillAction('refill_paper')}
                disabled={refilling}
                className="w-full p-3 rounded-xl border border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-50 dark:hover:bg-[#131314] flex items-center justify-between text-left transition-all"
              >
                <div>
                  <p className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-500" />
                    Loaded New Paper Ream (500 Sheets)
                  </p>
                  <p className="text-[11px] text-zinc-500">Resets paper tray counter to +500 sheets</p>
                </div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Load</span>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowRefillModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
