'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Lock,
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
  IndianRupee,
  Droplet,
  Layers,
  Calendar,
  Download,
  TrendingUp,
  Plus,
  Settings,
  Sparkles,
  Search,
  X,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  Printer,
  Building2,
  Save,
  ExternalLink,
  Sliders,
} from 'lucide-react';
import { getClientDetailedDevice } from '@/lib/device-detection';
import { broadcastHostelChangeSetting } from '@/lib/useHostelChangeSetting';
import { STATIONS } from '@/lib/stations';
import { StationPricingConfig, PRICING_GUARDRAILS } from '@/lib/station-pricing';

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
  file_key?: string;
  total_pages: number;
  color_mode: string;
  is_duplex: number;
  copies: number;
  total_price: number;
  status: string;
  payment_id: string | null;
  created_at: string;
  station_id?: string | null;
  is_purged?: boolean;
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
  // 4-Chamber EcoTank & Hardware EEPROM:
  hardware_total_pages?: number;
  hardware_color_pages?: number;
  hardware_bw_pages?: number;
  hardware_serial?: string;
  hardware_firmware?: string;
  hardware_first_printed?: string;
  hardware_synced_at?: string;
  printer_model?: string;
  bk_pct?: number;
  c_pct?: number;
  m_pct?: number;
  y_pct?: number;
  bk_pages_remaining?: number;
  c_pages_remaining?: number;
  m_pages_remaining?: number;
  y_pages_remaining?: number;
}

interface LifetimeMachineData {
  total_pages: number;
  bw_pages: number;
  color_pages: number;
  hardware_baseline_total: number;
  hardware_baseline_bw: number;
  hardware_baseline_color: number;
  serial: string;
  firmware: string;
  first_printed: string;
  synced_at: string;
  model: string;
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
  lifetimeMachine?: LifetimeMachineData;
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

  // Queue Search, Filtering & Quick Actions
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED'>('ALL');
  const [stationFilter, setStationFilter] = useState<'ALL' | 'main' | 'romen_xerox'>('ALL');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [jobActionLoading, setJobActionLoading] = useState<string | null>(null);

  // Stats & Supplies State
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [period, setPeriod] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('all');
  const [historyTab, setHistoryTab] = useState<'monthly' | 'daily'>('monthly');
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [showCalibrateModal, setShowCalibrateModal] = useState(false);
  const [showInkSlidersModal, setShowInkSlidersModal] = useState(false);
  const [refilling, setRefilling] = useState(false);

  // Hostel Station Switching State
  const [hostelChangeEnabled, setHostelChangeEnabled] = useState<boolean>(false);
  const [togglingHostelChange, setTogglingHostelChange] = useState<boolean>(false);
  const [hostelChangeSuccessMsg, setHostelChangeSuccessMsg] = useState<string | null>(null);

  // Campus Hostel Stations Dynamic Pricing State
  const [stationsPricing, setStationsPricing] = useState<Record<string, StationPricingConfig>>({});
  const [loadingPricing, setLoadingPricing] = useState<boolean>(false);
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StationPricingConfig>>({});
  const [savingStationPricing, setSavingStationPricing] = useState<boolean>(false);
  const [stationPricingSuccess, setStationPricingSuccess] = useState<string | null>(null);
  const [stationPricingError, setStationPricingError] = useState<string | null>(null);

  // Hardware Calibration Inputs
  const [calibTotal, setCalibTotal] = useState<number>(24741);
  const [calibBw, setCalibBw] = useState<number>(13845);
  const [calibColor, setCalibColor] = useState<number>(10828);
  const [calibSerial, setCalibSerial] = useState<string>('X8HY012040');
  const [calibFirmware, setCalibFirmware] = useState<string>('XH19P5');

  // Physical Ink Level Sliders (Order: BK, Y, M, C)
  const [sliderBk, setSliderBk] = useState<number>(18);
  const [sliderY, setSliderY] = useState<number>(18);
  const [sliderM, setSliderM] = useState<number>(38);
  const [sliderC, setSliderC] = useState<number>(55);
  const [prevSupplies, setPrevSupplies] = useState(stats?.supplies);

  // Sync supplies to sliders without cascading renders
  if (stats?.supplies && stats.supplies !== prevSupplies) {
    setPrevSupplies(stats.supplies);
    if (stats.supplies.bk_pct !== undefined) setSliderBk(Number(stats.supplies.bk_pct));
    if (stats.supplies.y_pct !== undefined) setSliderY(Number(stats.supplies.y_pct));
    if (stats.supplies.m_pct !== undefined) setSliderM(Number(stats.supplies.m_pct));
    if (stats.supplies.c_pct !== undefined) setSliderC(Number(stats.supplies.c_pct));
    if (stats.supplies.hardware_total_pages !== undefined) setCalibTotal(Number(stats.supplies.hardware_total_pages));
    if (stats.supplies.hardware_bw_pages !== undefined) setCalibBw(Number(stats.supplies.hardware_bw_pages));
    if (stats.supplies.hardware_color_pages !== undefined) setCalibColor(Number(stats.supplies.hardware_color_pages));
    if (stats.supplies.hardware_serial) setCalibSerial(stats.supplies.hardware_serial);
    if (stats.supplies.hardware_firmware) setCalibFirmware(stats.supplies.hardware_firmware);
  }

  const fetchRecentJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetch('/api/admin/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        setLastUpdated(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const copyPickupCode = (code: string) => {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatJobTime = (isoString?: string): string => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString.replace(' ', 'T') + (isoString.includes('Z') ? '' : 'Z'));
      if (isNaN(d.getTime())) return isoString;

      const now = new Date();
      const isToday = now.toDateString() === d.toDateString();
      const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      const datePart = d.toLocaleDateString([], { day: 'numeric', month: 'short' });
      return isToday ? `Today, ${timePart}` : `${datePart}, ${timePart}`;
    } catch {
      return isoString || '—';
    }
  };

  const handleJobAction = async (jobId: string, action: 'approve' | 'cancel' | 'retry' | 'delete') => {
    try {
      setJobActionLoading(`${jobId}-${action}`);
      const res = await fetch('/api/admin/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, action }),
      });
      if (res.ok) {
        await fetchRecentJobs();
      } else {
        const data = await res.json();
        alert(data.error || 'Action failed');
      }
    } catch (err) {
      console.error('Job action error:', err);
    } finally {
      setJobActionLoading(null);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to permanently clear all completed and failed jobs and delete their files from storage?')) {
      return;
    }
    try {
      setJobActionLoading('clear-history');
      const res = await fetch('/api/admin/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_history' }),
      });
      if (res.ok) {
        await fetchRecentJobs();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to clear history');
      }
    } catch (err) {
      console.error('Clear history error:', err);
    } finally {
      setJobActionLoading(null);
    }
  };

  const fetchStats = useCallback(async (selectedPeriod = period) => {
    try {
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
  }, [period]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setHostelChangeEnabled(Boolean(data.hostelChangeEnabled));
      }
    } catch (err) {
      console.error('Failed to fetch app settings:', err);
    }
  }, []);

  const handleToggleHostelChange = async () => {
    const nextVal = !hostelChangeEnabled;
    setTogglingHostelChange(true);
    setHostelChangeSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostelChangeEnabled: nextVal }),
      });
      if (res.ok) {
        setHostelChangeEnabled(nextVal);
        broadcastHostelChangeSetting(nextVal);
        setHostelChangeSuccessMsg(
          nextVal ? 'Hostel change enabled across campus' : 'Hostel change disabled & hidden from UI'
        );
        setTimeout(() => setHostelChangeSuccessMsg(null), 4000);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update hostel change setting');
      }
    } catch (err) {
      console.error('Failed to toggle hostel change setting:', err);
      alert('Network error updating setting');
    } finally {
      setTogglingHostelChange(false);
    }
  };

  const fetchStationsPricing = useCallback(async () => {
    try {
      setLoadingPricing(true);
      const res = await fetch('/api/station-pricing');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stations) {
          setStationsPricing(data.stations);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stations pricing:', err);
    } finally {
      setLoadingPricing(false);
    }
  }, []);

  const handleSaveStationPricing = async (stationId: string) => {
    setSavingStationPricing(true);
    setStationPricingSuccess(null);
    setStationPricingError(null);
    try {
      const res = await fetch('/api/station-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: stationId,
          ...editForm,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save station rates');
      }
      setStationPricingSuccess(`Saved rates & route settings for ${stationId.toUpperCase()}!`);
      setEditingStationId(null);
      setEditForm({});
      await fetchStationsPricing();
      setTimeout(() => setStationPricingSuccess(null), 3500);
    } catch (err: unknown) {
      setStationPricingError(err instanceof Error ? err.message : 'Failed to save');
      setTimeout(() => setStationPricingError(null), 5000);
    } finally {
      setSavingStationPricing(false);
    }
  };

  const checkAuthAndLoad = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/auth?action=devices');
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(true);
        setDevices(data.devices || []);
        if (data.maxDevices) setMaxDevices(data.maxDevices);
        setCurrentDeviceId(data.currentDeviceId || null);
        fetchRecentJobs();
        fetchStats('all');
        fetchSettings();
        fetchStationsPricing();
      } else {
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, [fetchRecentJobs, fetchStats, fetchSettings, fetchStationsPricing]);

  useEffect(() => {
    let active = true;
    getClientDetailedDevice().then((name) => {
      if (active) setCustomDeviceName(name);
    });

    const init = async () => {
      try {
        const res = await fetch('/api/admin/auth?action=devices');
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(true);
          setDevices(data.devices || []);
          if (data.maxDevices) setMaxDevices(data.maxDevices);
          setCurrentDeviceId(data.currentDeviceId || null);
          fetchRecentJobs();
          fetchStats('all');
          fetchSettings();
          fetchStationsPricing();
        } else {
          setIsAdmin(false);
        }
      } catch {
        if (active) setIsAdmin(false);
      } finally {
        if (active) setLoading(false);
      }
    };

    void init();

    return () => {
      active = false;
    };
  }, [fetchRecentJobs, fetchStats, fetchSettings, fetchStationsPricing]);

  const handlePeriodChange = (newPeriod: 'all' | 'today' | 'week' | 'month' | 'year') => {
    setPeriod(newPeriod);
    setLoadingStats(true);
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

  const handleRefillTank = async (tank: 'bk' | 'c' | 'm' | 'y') => {
    try {
      setRefilling(true);
      const res = await fetch('/api/admin/supplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refill_tank', tank }),
      });
      if (res.ok) {
        await fetchStats(period);
      }
    } catch (err) {
      console.error('Failed to refill tank:', err);
    } finally {
      setRefilling(false);
    }
  };

  const handleSaveCalibration = async () => {
    try {
      setRefilling(true);
      const res = await fetch('/api/admin/supplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'calibrate_baseline',
          totalPages: Number(calibTotal),
          colorPages: Number(calibColor),
          bwPages: Number(calibBw),
          serial: calibSerial,
          firmware: calibFirmware,
        }),
      });
      if (res.ok) {
        await fetchStats(period);
        setShowCalibrateModal(false);
      }
    } catch (err) {
      console.error('Failed to save calibration:', err);
    } finally {
      setRefilling(false);
    }
  };

  const handleSaveInkSliders = async () => {
    try {
      setRefilling(true);
      const res = await fetch('/api/admin/supplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'calibrate_tanks',
          bkPct: Number(sliderBk),
          cPct: Number(sliderC),
          mPct: Number(sliderM),
          yPct: Number(sliderY),
        }),
      });
      if (res.ok) {
        await fetchStats(period);
        setShowInkSlidersModal(false);
      }
    } catch (err) {
      console.error('Failed to save ink sliders:', err);
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
      fetchSettings();
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
          {/* CAMPUS HOSTEL STATION SWITCHING CONTROL */}
          <div className="rounded-2xl p-4 sm:p-5 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border transition-all ${
                    hostelChangeEnabled
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                      : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                  }`}
                >
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                      Hostel Print Station Switching
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${
                        hostelChangeEnabled
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          hostelChangeEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
                        }`}
                      />
                      {hostelChangeEnabled ? 'ENABLED (VISIBLE TO STUDENTS)' : 'DISABLED (HIDDEN FROM UI)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-xl">
                    {hostelChangeEnabled
                      ? 'Students can select and change their target hostel print station in the kiosk header and studio.'
                      : 'All hostel change buttons and station switching options are hidden from the user interface.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                {hostelChangeSuccessMsg && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold animate-fade-in flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{hostelChangeSuccessMsg}</span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleToggleHostelChange}
                  disabled={togglingHostelChange}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 ${
                    hostelChangeEnabled
                      ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                  }`}
                >
                  {togglingHostelChange ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : hostelChangeEnabled ? (
                    <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-white" />
                  )}
                  <span>{hostelChangeEnabled ? 'Disable & Hide Hostel Change' : 'Enable Hostel Change'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* CAMPUS HOSTEL STATIONS, PRICING & RAZORPAY ROUTE SPLIT CONSOLE */}
          <div className="rounded-2xl p-5 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] space-y-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-[#282a2c]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                      Campus Hostel Stations & Razorpay Route Splits
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Multi-Station Marketplace
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Customize print rates per hostel and link Razorpay Sub-Merchant IDs (<code>acc_...</code>) for automated 90/10 bank revenue splits.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href="https://dashboard.razorpay.com/app/partners/client-onboarding"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-[#131314] hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-[#282a2c] text-zinc-700 dark:text-zinc-300 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
                  title="Open Razorpay Partner Dashboard to invite co-hostellers and view their Account IDs"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                  <span>Razorpay Onboarding</span>
                </a>

                <button
                  type="button"
                  onClick={fetchStationsPricing}
                  disabled={loadingPricing}
                  className="p-1.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-100 dark:hover:bg-[#131314] text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
                  title="Refresh Station Pricing"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loadingPricing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {stationPricingSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{stationPricingSuccess}</span>
              </div>
            )}

            {stationPricingError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 animate-fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{stationPricingError}</span>
              </div>
            )}

            {/* Stations Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(() => {
                const uniqueStations = Object.values(STATIONS).filter(
                  (s, idx, arr) => arr.findIndex((x) => x.id === s.id) === idx
                );

                return uniqueStations.map((station) => {
                  const pricing = stationsPricing[station.id] || {
                    bwSingle: 4.0,
                    colorSingle: 7.0,
                    bwBulk: 3.0,
                    colorBulk: 5.5,
                    bwMega: 2.5,
                    colorMega: 4.5,
                    commissionPercent: 10,
                    razorpayAccountId: station.razorpayAccountId || '',
                  };

                  const isEditing = editingStationId === station.id;
                  const isSaving = savingStationPricing && editingStationId === station.id;

                  return (
                    <div
                      key={station.id}
                      className={`p-4 rounded-xl border transition-all space-y-3.5 ${
                        isEditing
                          ? 'border-blue-500/50 bg-blue-500/[0.02] dark:bg-[#131314]'
                          : 'border-zinc-200 dark:border-[#282a2c] bg-zinc-50/40 dark:bg-[#131314]/50'
                      }`}
                    >
                      {/* Station Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-900 dark:text-white">
                              {station.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                station.status === 'active'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                  : station.status === 'standby'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                  : 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                              }`}
                            >
                              {station.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{station.tagline}</p>
                        </div>

                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStationId(station.id);
                              setEditForm({
                                bwSingle: pricing.bwSingle,
                                colorSingle: pricing.colorSingle,
                                bwBulk: pricing.bwBulk ?? 3.0,
                                colorBulk: pricing.colorBulk ?? 5.5,
                                bwMega: pricing.bwMega ?? 2.5,
                                colorMega: pricing.colorMega ?? 4.5,
                                razorpayAccountId: pricing.razorpayAccountId || '',
                                commissionPercent: pricing.commissionPercent ?? 10,
                              });
                            }}
                            className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[10px] font-bold transition-all cursor-pointer"
                          >
                            Edit Station
                          </button>
                        )}
                      </div>

                      {!isEditing ? (
                        /* Readonly Overview */
                        <div className="space-y-2.5">
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
                            <div className="p-2 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-800">
                              <span className="text-[9px] text-zinc-400 uppercase font-bold block">B&W Single</span>
                              <span className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
                                ₹{pricing.bwSingle?.toFixed(2) || '4.00'}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-800">
                              <span className="text-[9px] text-zinc-400 uppercase font-bold block">Color Single</span>
                              <span className="text-xs font-mono font-bold text-pink-600 dark:text-pink-400">
                                ₹{pricing.colorSingle?.toFixed(2) || '7.00'}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-800">
                              <span className="text-[9px] text-zinc-400 uppercase font-bold block">B&W Bulk (10+)</span>
                              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                ₹{(pricing.bwBulk ?? 3.0).toFixed(2)}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-800">
                              <span className="text-[9px] text-zinc-400 uppercase font-bold block">Color Bulk (10+)</span>
                              <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
                                ₹{(pricing.colorBulk ?? 5.5).toFixed(2)}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-800">
                              <span className="text-[9px] text-zinc-400 uppercase font-bold block">B&W Mega (30+)</span>
                              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                ₹{(pricing.bwMega ?? 2.5).toFixed(2)}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-800">
                              <span className="text-[9px] text-zinc-400 uppercase font-bold block">Color Mega (30+)</span>
                              <span className="text-xs font-mono font-bold text-teal-600 dark:text-teal-400">
                                ₹{(pricing.colorMega ?? 4.5).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Route Account Status */}
                          <div className="p-2 rounded-lg bg-zinc-100/50 dark:bg-[#1e1f20] border border-zinc-200/50 dark:border-zinc-800 flex items-center justify-between text-[11px]">
                            <span className="text-zinc-500 font-medium">Razorpay Route Split:</span>
                            {pricing.razorpayAccountId ? (
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                {100 - (pricing.commissionPercent ?? 10)}% Host ({pricing.razorpayAccountId})
                              </span>
                            ) : (
                              <span className="text-zinc-400 italic">No sub-merchant (100% Platform)</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Edit Form */
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSaveStationPricing(station.id);
                          }}
                          className="space-y-3 pt-1"
                        >
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-zinc-500 block">B&W Single (₹)</label>
                              <input
                                type="number"
                                step="0.5"
                                min={PRICING_GUARDRAILS.bwSingle.min}
                                max={PRICING_GUARDRAILS.bwSingle.max}
                                value={editForm.bwSingle ?? 4.0}
                                onChange={(e) =>
                                  setEditForm((prev) => ({ ...prev, bwSingle: parseFloat(e.target.value) || 2.0 }))
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700 text-xs font-mono font-bold text-zinc-900 dark:text-white"
                                required
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-zinc-500 block">Color Single (₹)</label>
                              <input
                                type="number"
                                step="0.5"
                                min={PRICING_GUARDRAILS.colorSingle.min}
                                max={PRICING_GUARDRAILS.colorSingle.max}
                                value={editForm.colorSingle ?? 7.0}
                                onChange={(e) =>
                                  setEditForm((prev) => ({ ...prev, colorSingle: parseFloat(e.target.value) || 4.0 }))
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700 text-xs font-mono font-bold text-zinc-900 dark:text-white"
                                required
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-zinc-500 block">B&W Bulk 10+ (₹)</label>
                              <input
                                type="number"
                                step="0.5"
                                min={PRICING_GUARDRAILS.bwBulk.min}
                                max={PRICING_GUARDRAILS.bwBulk.max}
                                value={editForm.bwBulk ?? 3.0}
                                onChange={(e) =>
                                  setEditForm((prev) => ({ ...prev, bwBulk: parseFloat(e.target.value) || 2.0 }))
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700 text-xs font-mono font-bold text-zinc-900 dark:text-white"
                                required
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-zinc-500 block">Color Bulk 10+ (₹)</label>
                              <input
                                type="number"
                                step="0.5"
                                min={PRICING_GUARDRAILS.colorBulk.min}
                                max={PRICING_GUARDRAILS.colorBulk.max}
                                value={editForm.colorBulk ?? 5.5}
                                onChange={(e) =>
                                  setEditForm((prev) => ({ ...prev, colorBulk: parseFloat(e.target.value) || 3.0 }))
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700 text-xs font-mono font-bold text-zinc-900 dark:text-white"
                                required
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-zinc-500 block">B&W Mega 30+ (₹)</label>
                              <input
                                type="number"
                                step="0.5"
                                min={PRICING_GUARDRAILS.bwMega.min}
                                max={PRICING_GUARDRAILS.bwMega.max}
                                value={editForm.bwMega ?? 2.5}
                                onChange={(e) =>
                                  setEditForm((prev) => ({ ...prev, bwMega: parseFloat(e.target.value) || 1.0 }))
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700 text-xs font-mono font-bold text-zinc-900 dark:text-white"
                                required
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-zinc-500 block">Color Mega 30+ (₹)</label>
                              <input
                                type="number"
                                step="0.5"
                                min={PRICING_GUARDRAILS.colorMega.min}
                                max={PRICING_GUARDRAILS.colorMega.max}
                                value={editForm.colorMega ?? 4.5}
                                onChange={(e) =>
                                  setEditForm((prev) => ({ ...prev, colorMega: parseFloat(e.target.value) || 2.0 }))
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700 text-xs font-mono font-bold text-zinc-900 dark:text-white"
                                required
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-bold text-zinc-500 block">
                                Razorpay Sub-Merchant Account ID
                              </label>
                              <input
                                type="text"
                                placeholder="acc_xxxxxxxxxxxxxx"
                                value={editForm.razorpayAccountId ?? ''}
                                onChange={(e) =>
                                  setEditForm((prev) => ({ ...prev, razorpayAccountId: e.target.value }))
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700 text-xs font-mono text-zinc-900 dark:text-white placeholder-zinc-400"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-zinc-500 block">
                                Platform Commission (%)
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={50}
                                  value={editForm.commissionPercent ?? 10}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      commissionPercent: parseInt(e.target.value) || 0,
                                    }))
                                  }
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-zinc-700 text-xs font-mono font-bold text-zinc-900 dark:text-white"
                                />
                                <span className="text-[10px] text-zinc-400 font-mono whitespace-nowrap">
                                  {100 - (editForm.commissionPercent ?? 10)}% to Host
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStationId(null);
                                setEditForm({});
                              }}
                              className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isSaving}
                              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              <span>Save Station Rates</span>
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* SECTION 1: EPSON ECOTANK L3212 HARDWARE & SUPPLIES TELEMETRY */}
          <div className="rounded-2xl p-5 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] space-y-5 shadow-2xs">
            {/* Header with real hardware identity */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-zinc-100 dark:border-[#282a2c] gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Droplet className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                    Epson EcoTank L3212 Hardware & Supplies
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    Serial: {stats?.supplies.hardware_serial || 'X8HY012040'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    Firmware: {stats?.supplies.hardware_firmware || 'XH19P5'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    In Service Since: {stats?.supplies.hardware_first_printed || '2022/12/13'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  Calibrated against physical printer front windows and motherboard EEPROM counters.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowInkSlidersModal(true)}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-50 dark:hover:bg-[#131314] text-zinc-700 dark:text-zinc-200 text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Calibrate digital levels with physical transparent windows"
                >
                  <Settings className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Calibrate Ink Levels</span>
                </button>
                <button
                  onClick={() => setShowCalibrateModal(true)}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-50 dark:hover:bg-[#131314] text-zinc-700 dark:text-zinc-200 text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Update hardware baseline from printed status sheet"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Audit Nozzle Check</span>
                </button>
                <button
                  onClick={() => setShowRefillModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Refill Bottles</span>
                </button>
                <button
                  onClick={() => fetchStats(period)}
                  className="p-1.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] hover:bg-zinc-100 dark:hover:bg-[#131314] text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
                  title="Refresh Telemetry"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* REAL HARDWARE EEPROM AUDIT BANNER */}
            <div className="p-4 rounded-xl border border-zinc-200/80 dark:border-[#282a2c] bg-zinc-50/50 dark:bg-[#131314]/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Printer Lifetime Total</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xl font-extrabold text-zinc-900 dark:text-white font-mono">
                      {(stats?.lifetimeMachine?.total_pages ?? (24741 + (stats?.allTime.total_pages || 0))).toLocaleString()}
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-500">pages</span>
                  </div>
                  <span className="text-[9px] text-zinc-400">Motherboard EEPROM</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Hardware B&W Total</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xl font-extrabold text-zinc-800 dark:text-zinc-200 font-mono">
                      {(stats?.lifetimeMachine?.bw_pages ?? (13845 + (stats?.allTime.bw_pages || 0))).toLocaleString()}
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-500">pages</span>
                  </div>
                  <span className="text-[9px] text-zinc-400">B&W laser engine</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Hardware Color Total</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xl font-extrabold text-pink-600 dark:text-pink-400 font-mono">
                      {(stats?.lifetimeMachine?.color_pages ?? (10828 + (stats?.allTime.color_pages || 0))).toLocaleString()}
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-500">pages</span>
                  </div>
                  <span className="text-[9px] text-zinc-400">Color nozzles</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">Kiosk Online Orders</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                      {(stats?.allTime.total_pages || 0).toLocaleString()}
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-500">pages</span>
                  </div>
                  <span className="text-[9px] text-zinc-400">{stats?.allTime.total_jobs || 0} cloud print orders</span>
                </div>
              </div>
            </div>

            {/* 4-CHAMBER ECOTANK GAUGES GRID (Order matching physical printer: BK, Y, M, C + Paper Tray) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {/* TANK 1: BK (Black) */}
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-zinc-50/70 dark:bg-[#131314]/70 space-y-2.5 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-zinc-900 dark:bg-zinc-100 border border-zinc-700" />
                    BK • Black
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      (stats?.supplies.bk_pct ?? 18) <= 20
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                        : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {stats?.supplies.bk_pct ?? 18}% Left
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold text-zinc-900 dark:text-white font-mono">
                      {(stats?.supplies.bk_pages_remaining ?? 810).toLocaleString()}
                    </span>
                    <span className="text-[11px] font-semibold text-zinc-500">pages left</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Epson 003 Black 65ml</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (stats?.supplies.bk_pct ?? 18) <= 20 ? 'bg-rose-500' : 'bg-zinc-900 dark:bg-zinc-100'
                    }`}
                    style={{ width: `${stats?.supplies.bk_pct ?? 18}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  {(stats?.supplies.bk_pct ?? 18) <= 20 ? (
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Near Min Line
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500">Tank Normal</span>
                  )}
                  <button
                    onClick={() => handleRefillTank('bk')}
                    disabled={refilling}
                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Refill 100%
                  </button>
                </div>
              </div>

              {/* TANK 2: Y (Yellow) */}
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-zinc-50/70 dark:bg-[#131314]/70 space-y-2.5 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-amber-400 border border-amber-500" />
                    Y • Yellow
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      (stats?.supplies.y_pct ?? 18) <= 20
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {stats?.supplies.y_pct ?? 18}% Left
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
                      {(stats?.supplies.y_pages_remaining ?? 1350).toLocaleString()}
                    </span>
                    <span className="text-[11px] font-semibold text-zinc-500">pages left</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Epson 003 Yellow 65ml</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (stats?.supplies.y_pct ?? 18) <= 20 ? 'bg-rose-500' : 'bg-amber-400'
                    }`}
                    style={{ width: `${stats?.supplies.y_pct ?? 18}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  {(stats?.supplies.y_pct ?? 18) <= 20 ? (
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Near Min Line
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500">Tank Normal</span>
                  )}
                  <button
                    onClick={() => handleRefillTank('y')}
                    disabled={refilling}
                    className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    Refill 100%
                  </button>
                </div>
              </div>

              {/* TANK 3: M (Magenta) */}
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-zinc-50/70 dark:bg-[#131314]/70 space-y-2.5 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-pink-600 dark:text-pink-400 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-pink-500 border border-pink-600" />
                    M • Magenta
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      (stats?.supplies.m_pct ?? 38) <= 20
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                        : 'bg-pink-500/15 text-pink-700 dark:text-pink-300'
                    }`}
                  >
                    {stats?.supplies.m_pct ?? 38}% Left
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold text-pink-600 dark:text-pink-400 font-mono">
                      {(stats?.supplies.m_pages_remaining ?? 2850).toLocaleString()}
                    </span>
                    <span className="text-[11px] font-semibold text-zinc-500">pages left</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Epson 003 Magenta 65ml</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 bg-pink-500"
                    style={{ width: `${stats?.supplies.m_pct ?? 38}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-zinc-500">Tank Normal</span>
                  <button
                    onClick={() => handleRefillTank('m')}
                    disabled={refilling}
                    className="text-[10px] font-bold text-pink-600 dark:text-pink-400 hover:underline cursor-pointer"
                  >
                    Refill 100%
                  </button>
                </div>
              </div>

              {/* TANK 4: C (Cyan) */}
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-zinc-50/70 dark:bg-[#131314]/70 space-y-2.5 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-cyan-400 border border-cyan-500" />
                    C • Cyan
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      (stats?.supplies.c_pct ?? 55) <= 20
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                        : 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                    }`}
                  >
                    {stats?.supplies.c_pct ?? 55}% Left
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold text-cyan-600 dark:text-cyan-400 font-mono">
                      {(stats?.supplies.c_pages_remaining ?? 4125).toLocaleString()}
                    </span>
                    <span className="text-[11px] font-semibold text-zinc-500">pages left</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Epson 003 Cyan 65ml</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 bg-cyan-400"
                    style={{ width: `${stats?.supplies.c_pct ?? 55}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-zinc-500">Tank Normal</span>
                  <button
                    onClick={() => handleRefillTank('c')}
                    disabled={refilling}
                    className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                  >
                    Refill 100%
                  </button>
                </div>
              </div>

              {/* TANK 5: Paper Tray */}
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-zinc-50/70 dark:bg-[#131314]/70 space-y-2.5 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
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
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                      {(stats?.supplies.paper_sheets_remaining ?? 500).toLocaleString()}
                    </span>
                    <span className="text-[11px] font-semibold text-zinc-500">sheets in tray</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Standard A4 (75 GSM)</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      (stats?.supplies.paperPercent || 100) < 15 ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${stats?.supplies.paperPercent || 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-zinc-500">
                    Tray: {stats?.supplies.last_paper_refill ? new Date(stats.supplies.last_paper_refill).toLocaleDateString() : 'Active'}
                  </span>
                  <button
                    onClick={() => handleRefillAction('refill_paper')}
                    disabled={refilling}
                    className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
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
          {(() => {
            const counts = {
              all: jobs.length,
              pending: jobs.filter((j) => j.status === 'PENDING_PAYMENT').length,
              active: jobs.filter((j) => j.status === 'PAID' || j.status.startsWith('PRINTING') || j.status === 'AWAITING_FLIP').length,
              completed: jobs.filter((j) => j.status === 'COMPLETED').length,
              failed: jobs.filter((j) => j.status === 'FAILED').length,
            };

            const hasMultipleStations = jobs.some((j) => (j.station_id || 'main') !== 'main');

            const filteredJobs = jobs.filter((j) => {
              // Status filter
              if (statusFilter === 'PENDING' && j.status !== 'PENDING_PAYMENT') return false;
              if (statusFilter === 'ACTIVE' && !(j.status === 'PAID' || j.status.startsWith('PRINTING') || j.status === 'AWAITING_FLIP')) return false;
              if (statusFilter === 'COMPLETED' && j.status !== 'COMPLETED') return false;
              if (statusFilter === 'FAILED' && j.status !== 'FAILED') return false;

              // Station filter
              if (stationFilter !== 'ALL') {
                const jobStation = j.station_id || 'main';
                if (jobStation !== stationFilter) return false;
              }

              // Search query
              if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim().replace(/^#/, '');
                const code = (j.pickup_code || '').toLowerCase().replace(/^#/, '');
                const name = (j.file_name || '').toLowerCase();
                const payment = (j.payment_id || '').toLowerCase();
                const status = (j.status || '').toLowerCase();
                const station = (j.station_id || 'main').toLowerCase();

                return (
                  code.includes(q) ||
                  name.includes(q) ||
                  payment.includes(q) ||
                  status.includes(q) ||
                  station.includes(q)
                );
              }

              return true;
            });

            return (
              <div className="rounded-2xl p-5 space-y-4 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] shadow-2xs">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-[#282a2c]">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                        Live Print Queue
                      </span>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {jobs.length} total orders recorded{lastUpdated ? ` • Synced at ${lastUpdated}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Refresh */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={fetchRecentJobs}
                      disabled={loadingJobs}
                      className="text-[11px] px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-[#131314] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition-all cursor-pointer font-medium disabled:opacity-50 shadow-2xs"
                      title="Sync latest print queue from cloud"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${loadingJobs ? 'animate-spin text-blue-500' : ''}`} />
                      <span>{loadingJobs ? 'Refreshing...' : 'Refresh Queue'}</span>
                    </button>

                    {(counts.completed > 0 || counts.failed > 0) && (
                      <button
                        type="button"
                        onClick={handleClearHistory}
                        disabled={jobActionLoading === 'clear-history'}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-red-200/40 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-900/40 flex items-center gap-1 transition-all cursor-pointer"
                        title="Purge all completed & failed jobs to free storage"
                      >
                        {jobActionLoading === 'clear-history' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        <span>Clear Finished</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Search Bar & Fast Query */}
                <div className="space-y-2.5">
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by pickup code (e.g. #A363, K874), file name, or payment ID..."
                      className="w-full pl-9 pr-24 py-2 text-xs rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    />
                    <div className="absolute right-2.5 flex items-center gap-1.5">
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                          title="Clear search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-500 font-mono">
                        {filteredJobs.length}/{jobs.length}
                      </span>
                    </div>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setStatusFilter('ALL')}
                        className={`px-2.5 py-1 rounded-lg font-medium text-[11px] transition-all cursor-pointer ${
                          statusFilter === 'ALL'
                            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
                            : 'bg-zinc-100 dark:bg-[#131314] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800'
                        }`}
                      >
                        All ({counts.all})
                      </button>

                      <button
                        type="button"
                        onClick={() => setStatusFilter('PENDING')}
                        className={`px-2.5 py-1 rounded-lg font-medium text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                          statusFilter === 'PENDING'
                            ? 'bg-amber-500 text-white shadow-2xs'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                        }`}
                      >
                        Pending ({counts.pending})
                      </button>

                      <button
                        type="button"
                        onClick={() => setStatusFilter('ACTIVE')}
                        className={`px-2.5 py-1 rounded-lg font-medium text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                          statusFilter === 'ACTIVE'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20'
                        }`}
                      >
                        Printing / Paid ({counts.active})
                      </button>

                      <button
                        type="button"
                        onClick={() => setStatusFilter('COMPLETED')}
                        className={`px-2.5 py-1 rounded-lg font-medium text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                          statusFilter === 'COMPLETED'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        Completed ({counts.completed})
                      </button>

                      {counts.failed > 0 && (
                        <button
                          type="button"
                          onClick={() => setStatusFilter('FAILED')}
                          className={`px-2.5 py-1 rounded-lg font-medium text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                            statusFilter === 'FAILED'
                              ? 'bg-rose-600 text-white shadow-2xs'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                          }`}
                        >
                          Failed ({counts.failed})
                        </button>
                      )}
                    </div>

                    {hasMultipleStations && (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-zinc-400 font-medium">Station:</span>
                        <select
                          value={stationFilter}
                          onChange={(e) => setStationFilter(e.target.value as 'ALL' | 'main' | 'romen_xerox')}
                          aria-label="Filter by station"
                          className="text-[11px] py-0.5 px-2 rounded-lg bg-zinc-100 dark:bg-[#131314] border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
                        >
                          <option value="ALL">All Stations</option>
                          <option value="main">Main Kiosk</option>
                          <option value="romen_xerox">Romen Xerox</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Queue List Content */}
                {loadingJobs ? (
                  <div className="py-12 text-center text-xs text-zinc-500 flex flex-col items-center justify-center gap-2.5">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    <span>Syncing latest print queue...</span>
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <div className="py-10 text-center text-xs text-zinc-500 space-y-1.5">
                    <p className="font-semibold text-zinc-400">No print jobs found.</p>
                    <p className="text-[11px] text-zinc-500">
                      {searchQuery || statusFilter !== 'ALL' || stationFilter !== 'ALL'
                        ? 'Try adjusting your search query or status filter.'
                        : 'New customer orders will appear here automatically.'}
                    </p>
                    {(searchQuery || statusFilter !== 'ALL' || stationFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setStatusFilter('ALL');
                          setStationFilter('ALL');
                        }}
                        className="text-[11px] text-blue-500 hover:underline pt-1 cursor-pointer"
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                    {filteredJobs.map((j) => {
                      const isActionPending = jobActionLoading?.startsWith(j.id);

                      return (
                        <div
                          key={j.id}
                          className="p-3.5 rounded-xl bg-zinc-50/70 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c] hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                        >
                          {/* Left Column: Pickup code, filename, timestamp, and specs */}
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Click-to-copy Pickup Code */}
                              <button
                                type="button"
                                onClick={() => copyPickupCode(j.pickup_code)}
                                className="group font-mono font-bold text-xs px-2.5 py-0.5 rounded-md bg-zinc-200/70 dark:bg-[#282a2c] border border-zinc-300/80 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                title="Click to copy pickup code"
                              >
                                <span>{j.pickup_code}</span>
                                {copiedCode === j.pickup_code ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3 opacity-40 group-hover:opacity-100" />
                                )}
                                {copiedCode === j.pickup_code && (
                                  <span className="text-[10px] text-emerald-500 font-sans font-normal">Copied!</span>
                                )}
                              </button>

                              {/* File name */}
                              <span
                                className="font-semibold text-zinc-900 dark:text-zinc-200 truncate max-w-[260px] sm:max-w-[340px]"
                                title={j.file_name}
                              >
                                {j.file_name}
                              </span>

                              {/* Station Tag */}
                              {j.station_id === 'romen_xerox' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                  <Building2 className="w-2.5 h-2.5" />
                                  Romen Xerox
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                  Main Kiosk
                                </span>
                              )}
                            </div>

                            {/* Timestamp & specs info row */}
                            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 flex-wrap">
                              {/* Formatted Timestamp */}
                              <span className="flex items-center gap-1 text-zinc-700 dark:text-zinc-300 font-medium">
                                <Clock className="w-3 h-3 text-zinc-400" />
                                <span>{formatJobTime(j.created_at)}</span>
                              </span>

                              <span>•</span>
                              <span>{j.total_pages} page{j.total_pages > 1 ? 's' : ''}</span>
                              {j.copies > 1 && <span>({j.copies} copies)</span>}
                              <span>•</span>
                              <span>{j.color_mode?.toUpperCase() || 'B&W'}</span>
                              <span>•</span>
                              <span>{j.is_duplex ? '2-Sided' : '1-Sided'}</span>
                              <span>•</span>
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">₹{j.total_price}</span>
                              <span>•</span>

                              {/* Payment Indicator */}
                              <span>
                                {j.payment_id?.startsWith('ADMIN_') ? (
                                  <span className="text-amber-500 font-medium">👑 Admin Free</span>
                                ) : j.payment_id ? (
                                  <span className="text-emerald-500 font-medium">💳 Razorpay Paid</span>
                                ) : (
                                  <span className="text-amber-400">⏳ Pending Payment</span>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Right Column: Status badge and action buttons */}
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {/* Document Viewer */}
                            {j.file_key && !j.is_purged && j.file_key !== 'ARCHIVED_LOCALLY' ? (
                              <a
                                href={`/api/view-file?key=${encodeURIComponent(j.file_key)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-medium text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                title="Open and view printed document"
                              >
                                <Eye className="w-3 h-3" />
                                <span>View</span>
                              </a>
                            ) : (
                              <a
                                href={`/api/view-file?key=ARCHIVED_LOCALLY&pickup=${encodeURIComponent(j.pickup_code)}&name=${encodeURIComponent(j.file_name)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                title="File saved in local shop PC archive (daemon/printed_archive)"
                              >
                                <Laptop className="w-3 h-3 text-indigo-400" />
                                <span>PC Archive</span>
                              </a>
                            )}

                            {/* Approve Button for Counter / Pending Cash orders */}
                            {j.status === 'PENDING_PAYMENT' && (
                              <button
                                type="button"
                                onClick={() => handleJobAction(j.id, 'approve')}
                                disabled={Boolean(isActionPending)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                                title="Customer paid cash at counter — Approve and send to printer immediately"
                              >
                                {jobActionLoading === `${j.id}-approve` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3 h-3" />
                                )}
                                <span>Approve & Print</span>
                              </button>
                            )}

                            {/* Reprint / Retry Button for Completed/Failed jobs */}
                            {(j.status === 'COMPLETED' || j.status === 'FAILED') && (
                              <button
                                type="button"
                                onClick={() => handleJobAction(j.id, 'retry')}
                                disabled={Boolean(isActionPending)}
                                className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 font-medium text-[11px] flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                title="Send job back to printer queue"
                              >
                                {jobActionLoading === `${j.id}-retry` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Printer className="w-3 h-3" />
                                )}
                                <span>Reprint</span>
                              </button>
                            )}

                            {/* Cancel / Delete Button */}
                            <button
                              type="button"
                              onClick={() =>
                                handleJobAction(
                                  j.id,
                                  j.status === 'PENDING_PAYMENT' ? 'cancel' : 'delete'
                                )
                              }
                              disabled={Boolean(isActionPending)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-50"
                              title={j.status === 'PENDING_PAYMENT' ? 'Cancel job' : 'Purge from queue'}
                            >
                              {jobActionLoading === `${j.id}-cancel` || jobActionLoading === `${j.id}-delete` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Status Badge */}
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                                j.status === 'COMPLETED'
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                  : j.status === 'PAID'
                                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                  : j.status.startsWith('PRINTING') || j.status === 'AWAITING_FLIP'
                                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 animate-pulse'
                                  : j.status === 'FAILED'
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                              }`}
                            >
                              {(j.status.startsWith('PRINTING') || j.status === 'PAID') && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                              )}
                              {j.status === 'COMPLETED' && <Check className="w-2.5 h-2.5" />}
                              <span>{j.status}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
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
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CALIBRATE PHYSICAL INK SLIDERS MODAL */}
      {showInkSlidersModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-[#282a2c] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-[#282a2c]">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">Calibrate Physical EcoTank Ink Levels</h3>
              </div>
              <button
                onClick={() => setShowInkSlidersModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Epson EcoTank printers do not have electronic liquid sensors. Look at the transparent windows on the front of your printer and align the sliders with the physical ink line:
            </p>

            <div className="space-y-4 pt-1">
              {/* BK Slider */}
              <div className="space-y-1.5 p-3 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-900 dark:bg-white" />
                    BK • Black Tank
                  </span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    {sliderBk}% ({Math.round((sliderBk / 100) * 4500).toLocaleString()} pgs)
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sliderBk}
                  onChange={(e) => setSliderBk(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-900 dark:accent-white"
                />
              </div>

              {/* Y Slider */}
              <div className="space-y-1.5 p-3 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    Y • Yellow Tank
                  </span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {sliderY}% ({Math.round((sliderY / 100) * 7500).toLocaleString()} pgs)
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sliderY}
                  onChange={(e) => setSliderY(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              {/* M Slider */}
              <div className="space-y-1.5 p-3 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-pink-600 dark:text-pink-400 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                    M • Magenta Tank
                  </span>
                  <span className="font-mono font-bold text-pink-600 dark:text-pink-400">
                    {sliderM}% ({Math.round((sliderM / 100) * 7500).toLocaleString()} pgs)
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sliderM}
                  onChange={(e) => setSliderM(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              {/* C Slider */}
              <div className="space-y-1.5 p-3 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    C • Cyan Tank
                  </span>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                    {sliderC}% ({Math.round((sliderC / 100) * 7500).toLocaleString()} pgs)
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sliderC}
                  onChange={(e) => setSliderC(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setShowInkSlidersModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveInkSliders}
                disabled={refilling}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {refilling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Tank Levels</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CALIBRATE NOZZLE CHECK HARDWARE BASELINE MODAL */}
      {showCalibrateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-[#282a2c] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-[#282a2c]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">Audit Nozzle Check Hardware Baseline</h3>
              </div>
              <button
                onClick={() => setShowCalibrateModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Whenever you print a Nozzle Check sheet from the printer hardware (hold Stop + Power button for 5 seconds), update the exact EEPROM lifetime values below:
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  Total Pages (Hardware)
                </label>
                <input
                  type="number"
                  value={calibTotal}
                  onChange={(e) => setCalibTotal(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] text-xs font-mono font-bold text-zinc-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  B&W Pages (Hardware)
                </label>
                <input
                  type="number"
                  value={calibBw}
                  onChange={(e) => setCalibBw(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] text-xs font-mono font-bold text-zinc-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  Color Pages (Hardware)
                </label>
                <input
                  type="number"
                  value={calibColor}
                  onChange={(e) => setCalibColor(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] text-xs font-mono font-bold text-zinc-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  Printer Serial Number
                </label>
                <input
                  type="text"
                  value={calibSerial}
                  onChange={(e) => setCalibSerial(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 dark:bg-[#131314] border border-zinc-200 dark:border-[#282a2c] text-xs font-mono font-bold text-zinc-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setShowCalibrateModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCalibration}
                disabled={refilling}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {refilling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Hardware Baseline</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
