'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Printer,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  ExternalLink,
  QrCode,
  FileText,
  Copy,
  Check,
  RotateCcw,
  LogOut,
  Layers,
  AlertCircle,
  Trash2,
  Lock,
  CheckCircle2,
  Clock,
  Search,
  Sparkles,
  Building2,
  ShieldCheck,
  ChevronRight,
  IndianRupee,
  Settings,
  Save,
} from 'lucide-react';
import { BorderBeam } from '@/components/ui/BorderBeam';
import { PrinterStatusPill } from '@/components/PrinterStatusPill';
import { STATIONS, StationConfig, getStationConfig } from '@/lib/stations';

interface JobItem {
  id: string;
  pickup_code: string;
  file_name: string;
  file_key: string;
  total_pages: number;
  color_mode: string;
  is_duplex: boolean | number;
  copies: number;
  total_price: number;
  status: 'PENDING_PAYMENT' | 'PAID' | 'PRINTING_ODD' | 'AWAITING_FLIP' | 'PRINTING_EVEN' | 'COMPLETED' | 'FAILED';
  payment_id?: string;
  created_at: string;
  expires_at?: string;
  is_purged?: boolean;
  station_id?: string;
}

export default function StationOperatorPortal() {
  const params = useParams();
  const router = useRouter();
  const rawStationId = (params?.stationId as string) || 'block_b';
  const station: StationConfig = getStationConfig(rawStationId);

  const [pin, setPin] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`station_pin_${station.id}`) || '';
    }
    return '';
  });
  const [showPin, setShowPin] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'printing' | 'completed'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [clearHistoryLoading, setClearHistoryLoading] = useState(false);

  // Station Pricing & Payout State
  const [pricingBw, setPricingBw] = useState<number>(4.0);
  const [pricingColor, setPricingColor] = useState<number>(7.0);
  const [pricingBwBulk, setPricingBwBulk] = useState<number>(3.0);
  const [pricingColorBulk, setPricingColorBulk] = useState<number>(5.5);
  const [razorpayAccountId, setRazorpayAccountId] = useState<string>('');
  const [commissionPercent, setCommissionPercent] = useState<number>(10);
  const [pricingLoading, setPricingLoading] = useState<boolean>(false);
  const [pricingSaving, setPricingSaving] = useState<boolean>(false);
  const [pricingSuccess, setPricingSuccess] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [showPricingCard, setShowPricingCard] = useState<boolean>(true);

  // Check auth session
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch(`/api/station/auth?station_id=${encodeURIComponent(station.id)}`);
      const data = await res.json();
      setIsAuthenticated(Boolean(data.isStationAdmin || data.isMasterAdmin));
      setIsMasterAdmin(Boolean(data.isMasterAdmin));
    } catch {
      setIsAuthenticated(false);
    }
  }, [station.id]);

  const fetchPricing = useCallback(async () => {
    setPricingLoading(true);
    try {
      const res = await fetch(`/api/station-pricing?station_id=${encodeURIComponent(station.id)}`);
      const data = await res.json();
      if (data.success && data.config) {
        setPricingBw(Number(data.config.bwSingle) || 4.0);
        setPricingColor(Number(data.config.colorSingle) || 7.0);
        setPricingBwBulk(Number(data.config.bwBulk) || 3.0);
        setPricingColorBulk(Number(data.config.colorBulk) || 5.5);
        setRazorpayAccountId(data.config.razorpayAccountId || '');
        setCommissionPercent(Number(data.config.commissionPercent) ?? 10);
      }
    } catch (err) {
      console.warn('Failed fetching station pricing:', err);
    } finally {
      setPricingLoading(false);
    }
  }, [station.id]);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Fetch jobs for this station
  const fetchJobs = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingJobs(true);
    try {
      const res = await fetch(`/api/admin/jobs?station_id=${encodeURIComponent(station.id)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoadingJobs(false);
    }
  }, [isAuthenticated, station.id]);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/station/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: station.id,
          pin,
          rememberDevice,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Incorrect passcode');
      }

      if (typeof window !== 'undefined') {
        if (rememberDevice) {
          localStorage.setItem(`station_pin_${station.id}`, pin.trim());
        } else {
          localStorage.removeItem(`station_pin_${station.id}`);
        }
      }

      setIsAuthenticated(true);
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Invalid password');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/station/auth', { method: 'DELETE' });
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`station_pin_${station.id}`);
      }
      setIsAuthenticated(false);
      setPin('');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleJobAction = async (
    jobId: string,
    action: 'approve' | 'reprint' | 'cancel' | 'complete' | 'delete' | 'purge_file'
  ) => {
    setActionLoadingId(jobId);
    try {
      const res = await fetch('/api/admin/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          action,
          station_id: station.id,
        }),
      });
      if (res.ok) {
        await fetchJobs();
      }
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleClearHistory = async () => {
    if (
      !confirm(
        `Clear completed and cancelled jobs for ${station.name}? Associated cloud storage files will be wiped to free space while preserving order records.`
      )
    )
      return;
    setClearHistoryLoading(true);
    try {
      const res = await fetch('/api/admin/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_history',
          station_id: station.id,
        }),
      });
      if (res.ok) {
        await fetchJobs();
      }
    } catch (err) {
      console.error('Clear history error:', err);
    } finally {
      setClearHistoryLoading(false);
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setPricingSaving(true);
    setPricingSuccess(null);
    setPricingError(null);
    try {
      const res = await fetch('/api/station-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: station.id,
          bwSingle: Number(pricingBw),
          colorSingle: Number(pricingColor),
          bwBulk: Number(pricingBwBulk),
          colorBulk: Number(pricingColorBulk),
          pin: pin || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update rates');
      }
      setPricingSuccess(`Updated rates for ${station.shortName}!`);
      await fetchPricing();
      setTimeout(() => setPricingSuccess(null), 3500);
    } catch (err: unknown) {
      setPricingError(err instanceof Error ? err.message : 'Failed to update rates');
      setTimeout(() => setPricingError(null), 5000);
    } finally {
      setPricingSaving(false);
    }
  };

  const studentPortalUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?station=${station.id}`
      : `https://printnerist.shop/?station=${station.id}`;

  const copyStudentLink = () => {
    navigator.clipboard.writeText(studentPortalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Filtered jobs
  const filteredJobs = jobs.filter((job) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = job.pickup_code.toLowerCase().includes(q);
      const matchFile = job.file_name.toLowerCase().includes(q);
      if (!matchCode && !matchFile) return false;
    }
    if (activeTab === 'pending') {
      return job.status === 'PENDING_PAYMENT';
    }
    if (activeTab === 'printing') {
      return ['PAID', 'PRINTING_ODD', 'AWAITING_FLIP', 'PRINTING_EVEN'].includes(job.status);
    }
    if (activeTab === 'completed') {
      return ['COMPLETED', 'FAILED'].includes(job.status);
    }
    return true;
  });

  const todayJobsCount = jobs.filter((j) => {
    const jobDate = new Date(j.created_at).toDateString();
    return jobDate === new Date().toDateString();
  }).length;

  const todaySheetsCount = jobs
    .filter((j) => {
      const jobDate = new Date(j.created_at).toDateString();
      return jobDate === new Date().toDateString() && j.status === 'COMPLETED';
    })
    .reduce((acc, j) => acc + (j.total_pages || 0) * (j.copies || 1), 0);

  // Authentication loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 p-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm font-medium">Verifying station credentials...</p>
      </div>
    );
  }

  // Login View for Co-Admin
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-3 shadow-lg shadow-indigo-500/10">
              <Printer className="w-8 h-8" />
            </div>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 mb-2">
              {station.riverName || station.blockCode} Station
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{station.name}</h1>
            <p className="text-sm text-slate-400 mt-1">{station.tagline || 'Hostel Print Station Portal'}</p>
          </div>

          <div className="relative rounded-2xl bg-slate-900/90 border border-slate-800/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
            <BorderBeam size={200} duration={8} colorFrom="#6366f1" colorTo="#a855f7" />

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
                  Station Custodian Passcode
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder={`Enter PIN for ${station.shortName}`}
                    className="w-full pl-10 pr-10 py-3 bg-slate-950/80 border border-slate-700/70 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span>Remember this laptop</span>
                </label>
                <span className="text-slate-500">{station.operatorName}</span>
              </div>

              {loginError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading || !pin.trim()}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 active:scale-[0.99] text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Unlock Station Console
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
              <Link href="/" className="hover:text-indigo-400 transition-colors flex items-center gap-1">
                ← Student Upload Portal
              </Link>
              <span className="text-slate-600">PrintNERIST Campus Network</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Console View
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500/30">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-sm">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white tracking-tight text-sm sm:text-base">{station.name}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {station.riverName || station.blockCode}
                </span>
                {isMasterAdmin && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Master Admin
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-none">{station.address}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowQrModal(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
              title="Station QR Code & Student Link"
            >
              <QrCode className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Station QR</span>
            </button>

            <button
              onClick={fetchJobs}
              disabled={loadingJobs}
              className="p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-300 rounded-lg text-xs transition-all shadow-sm"
              title="Refresh Queue"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingJobs ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all"
              title="Log Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Today&apos;s Jobs</p>
              <p className="text-xl font-bold text-white">{todayJobsCount}</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Pages Printed Today</p>
              <p className="text-xl font-bold text-emerald-400">{todaySheetsCount}</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/20">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Hardware Status</p>
              <PrinterStatusPill />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Hostel Custodian</p>
              <p className="text-sm font-bold text-slate-200 truncate">{station.operatorName}</p>
            </div>
          </div>
        </div>

        {/* STATION PRICING & REVENUE SPLIT SETTINGS */}
        <div className="rounded-2xl p-5 border border-slate-800 bg-slate-900/60 backdrop-blur-xs space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                <IndianRupee className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-tight">Hostel Print Rates & Revenue Split</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Live Dynamic Rates
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Set prices for {station.shortName}. Changes apply instantly to students selecting this hostel.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              {razorpayAccountId ? (
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Auto-Split: {100 - commissionPercent}% Bank Direct ({razorpayAccountId.slice(0, 10)}...)
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/25 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Direct Payout: Pending Admin Linking
                </span>
              )}
            </div>
          </div>

          {pricingSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{pricingSuccess}</span>
            </div>
          )}

          {pricingError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs flex items-center gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{pricingError}</span>
            </div>
          )}

          <form onSubmit={handleSavePricing} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* B&W Single */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-200 border border-slate-400" />
                    B&W Single Page
                  </label>
                  <span className="text-xs font-mono font-bold text-indigo-400">₹{pricingBw.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.5"
                    min="2.0"
                    max="10.0"
                    value={pricingBw}
                    onChange={(e) => setPricingBw(parseFloat(e.target.value) || 2.0)}
                    required
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Standard: ₹4.00 (Guardrail: ₹2–₹10)</p>
              </div>

              {/* Color Single */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                    Color Single Page
                  </label>
                  <span className="text-xs font-mono font-bold text-pink-400">₹{pricingColor.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.5"
                    min="4.0"
                    max="20.0"
                    value={pricingColor}
                    onChange={(e) => setPricingColor(parseFloat(e.target.value) || 4.0)}
                    required
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Standard: ₹7.00 (Guardrail: ₹4–₹20)</p>
              </div>

              {/* B&W Bulk */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    B&amp;W Bulk (10+ pgs)
                  </label>
                  <span className="text-xs font-mono font-bold text-indigo-400">₹{pricingBwBulk.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.5"
                    min="1.5"
                    max="8.0"
                    value={pricingBwBulk}
                    onChange={(e) => setPricingBwBulk(parseFloat(e.target.value) || 2.0)}
                    required
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Standard: ₹3.00 (Guardrail: ₹1.50–₹8.00)</p>
              </div>

              {/* Color Bulk */}
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                    Color Bulk (10+ pgs)
                  </label>
                  <span className="text-xs font-mono font-bold text-pink-300">₹{pricingColorBulk.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.5"
                    min="3.0"
                    max="15.0"
                    value={pricingColorBulk}
                    onChange={(e) => setPricingColorBulk(parseFloat(e.target.value) || 3.0)}
                    required
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500">Standard: ₹5.50 (Guardrail: ₹3.00–₹15.00)</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500">
                Bulk discounts (Assignment Saver & Mega Saver) scale automatically based on these base rates.
              </span>
              <button
                type="submit"
                disabled={pricingSaving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
              >
                {pricingSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Station Rates</span>
              </button>
            </div>
          </form>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({jobs.length})
            </button>
            <button
              onClick={() => setActiveTab('printing')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'printing'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Queue / Printing
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'completed'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Completed ({jobs.filter((j) => j.status === 'COMPLETED').length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search pickup code or file..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleClearHistory}
              disabled={clearHistoryLoading}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 rounded-xl text-xs flex items-center gap-1.5 transition-colors"
              title="Purge finished cloud documents to save storage"
            >
              {clearHistoryLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">Purge Finished</span>
            </button>
          </div>
        </div>

        {/* Jobs List */}
        <div className="space-y-3">
          {filteredJobs.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 text-slate-500">
              <Printer className="w-10 h-10 mx-auto mb-3 opacity-30 text-indigo-400" />
              <p className="text-sm font-medium text-slate-400">No print jobs in this category</p>
              <p className="text-xs text-slate-600 mt-1">
                Documents sent to {station.shortName} will appear here in real-time.
              </p>
            </div>
          ) : (
            filteredJobs.map((job) => {
              const isPaid = job.status === 'PAID';
              const isPrinting = ['PRINTING_ODD', 'AWAITING_FLIP', 'PRINTING_EVEN'].includes(job.status);
              const isCompleted = job.status === 'COMPLETED';
              const isFailed = job.status === 'FAILED';

              return (
                <div
                  key={job.id}
                  className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/70 flex flex-col items-center justify-center font-mono font-bold shrink-0">
                      <span className="text-indigo-400 text-sm leading-none">{job.pickup_code}</span>
                      <span className="text-[9px] text-slate-500 mt-0.5">CODE</span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate max-w-[240px] sm:max-w-md">
                          {job.file_name}
                        </p>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            isCompleted
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : isPrinting
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20 animate-pulse'
                              : isPaid
                              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                              : isFailed
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-slate-700/30 text-slate-400'
                          }`}
                        >
                          {job.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap font-mono">
                        <span>{job.total_pages} pgs</span>
                        <span>•</span>
                        <span className="capitalize">{job.color_mode === 'color' ? '🎨 Color' : '⬛ B&W'}</span>
                        <span>•</span>
                        <span>{job.is_duplex ? 'Duplex (2-sided)' : 'Single-sided'}</span>
                        <span>•</span>
                        <span>{job.copies}x copy</span>
                        <span>•</span>
                        <span className="text-slate-500">
                          {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions for this job */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* Reprint Button */}
                    <button
                      onClick={() => handleJobAction(job.id, 'reprint')}
                      disabled={actionLoadingId === job.id}
                      className="px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/20 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50"
                      title="Send job to printer again (works even from local PC archive)"
                    >
                      {actionLoadingId === job.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      <span>Reprint</span>
                    </button>

                    {/* Mark Complete */}
                    {!isCompleted && (
                      <button
                        onClick={() => handleJobAction(job.id, 'complete')}
                        disabled={actionLoadingId === job.id}
                        className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs transition-all disabled:opacity-50"
                        title="Mark as completed"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete Job */}
                    <button
                      onClick={() => {
                        if (confirm(`Delete job ${job.pickup_code} from history?`)) {
                          handleJobAction(job.id, 'delete');
                        }
                      }}
                      disabled={actionLoadingId === job.id}
                      className="p-1.5 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg text-xs transition-all disabled:opacity-50"
                      title="Delete job record"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Station QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto mb-2 border border-indigo-500/20">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">{station.name}</h3>
              <p className="text-xs text-slate-400">Scan to print directly at this hostel station</p>
            </div>

            {/* QR Code display */}
            <div className="bg-white p-4 rounded-xl flex items-center justify-center shadow-inner">
              {/* Using standard reliable QR image API */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  studentPortalUrl
                )}`}
                alt={`${station.name} QR Code`}
                className="w-48 h-48 rounded"
              />
            </div>

            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 break-all text-center">
              {studentPortalUrl}
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyStudentLink}
                className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied Link!' : 'Copy Direct Link'}</span>
              </button>
              <button
                onClick={() => setShowQrModal(false)}
                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
