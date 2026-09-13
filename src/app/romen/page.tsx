'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  XCircle,
  LogOut,
  Layers,
  AlertCircle,
  Trash2,
  Lock,
} from 'lucide-react';
import { BorderBeam } from '@/components/ui/BorderBeam';
import { PrinterStatusPill } from '@/components/PrinterStatusPill';

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
  status: 'PENDING_PAYMENT' | 'PAID' | 'PRINTING' | 'COMPLETED' | 'FAILED';
  payment_id?: string;
  created_at: string;
  expires_at?: string;
  is_purged?: boolean;
  station_id?: string;
}

export default function RomenStationPortal() {
  const [pin, setPin] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('romen_saved_pin') || '';
    }
    return '';
  });
  const [showPin, setShowPin] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'active' | 'completed'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [clearHistoryLoading, setClearHistoryLoading] = useState(false);

  // Check auth session
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/station/auth?station_id=romen_xerox');
      const data = await res.json();
      setIsAuthenticated(Boolean(data.isStationAdmin || data.isMasterAdmin));
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Fetch jobs for Romen Xerox
  const fetchJobs = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingJobs(true);
    try {
      const res = await fetch('/api/admin/jobs?station_id=romen_xerox');
      const data = await res.json();
      if (data.success && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoadingJobs(false);
    }
  }, [isAuthenticated]);

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
          station_id: 'romen_xerox',
          pin,
          remember_device: rememberDevice,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Incorrect passcode');
      }

      if (typeof window !== 'undefined') {
        if (rememberDevice) {
          localStorage.setItem('romen_saved_pin', pin.trim());
        } else {
          localStorage.removeItem('romen_saved_pin');
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
        localStorage.removeItem('romen_saved_pin');
      }
      setIsAuthenticated(false);
      setPin('');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleJobAction = async (jobId: string, action: 'approve' | 'reprint' | 'cancel' | 'complete' | 'delete' | 'purge_file') => {
    setActionLoadingId(jobId);
    try {
      const res = await fetch('/api/admin/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          action,
          station_id: 'romen_xerox',
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
    if (!confirm(`Are you sure you want to permanently clear all completed and cancelled jobs from history? All associated cloud files will be permanently wiped.`)) return;
    setClearHistoryLoading(true);
    try {
      const res = await fetch('/api/admin/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_history',
          station_id: 'romen_xerox',
        }),
      });
      if (res.ok) {
        await fetchJobs();
      }
    } catch (err) {
      console.error('Clear history failed:', err);
    } finally {
      setClearHistoryLoading(false);
    }
  };

  const getStationKioskUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/?station=romen`;
    }
    return 'https://printkurox.vercel.app/?station=romen';
  };

  const copyCounterLink = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(getStationKioskUrl());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Filter jobs
  const pendingJobs = jobs.filter((j) => j.status === 'PENDING_PAYMENT');
  const activeJobs = jobs.filter((j) => j.status === 'PAID' || j.status === 'PRINTING');
  const completedJobs = jobs.filter((j) => j.status === 'COMPLETED' || j.status === 'FAILED');

  const displayedJobs =
    activeTab === 'pending'
      ? pendingJobs
      : activeTab === 'active'
      ? activeJobs
      : activeTab === 'completed'
      ? completedJobs
      : jobs;

  // Stats
  const totalRevenue = jobs
    .filter((j) => j.status === 'PAID' || j.status === 'PRINTING' || j.status === 'COMPLETED')
    .reduce((acc, j) => acc + (j.total_price || 0), 0);
  const pendingRevenue = pendingJobs.reduce((acc, j) => acc + (j.total_price || 0), 0);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  // LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="max-w-sm w-full rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121216] p-6 shadow-2xl space-y-5 text-center relative overflow-hidden">
          <BorderBeam duration={10} borderWidth={1.5} borderRadius={16} colorFrom="rgba(16, 185, 129, 0.9)" />

          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-xs">
            <Printer className="w-7 h-7 stroke-[2.2]" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              Romen Xerox
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Station Portal &amp; Print Dispatch Desk
            </p>
          </div>

          {loginError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3.5">
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter Romen Passcode"
                required
                autoFocus
                className="w-full h-11 px-3.5 pr-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 text-xs text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono tracking-wider"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Remember Device Option */}
            <label className="flex items-center justify-center gap-2 cursor-pointer select-none text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-700 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Remember this device (Stay logged in for 1 year)</span>
            </label>

            <button
              type="submit"
              disabled={loginLoading || !pin}
              className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99] cursor-pointer"
            >
              {loginLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Access Station Desk</span>
                </>
              )}
            </button>
          </form>

          <p className="text-[11px] text-zinc-400">
            Authorized store staff only • Protected portal
          </p>
        </div>
      </div>
    );
  }

  // DASHBOARD
  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      {/* Header Bar */}
      <div className="p-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121216] shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
            <Printer className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Romen Xerox
              </h1>
              <PrinterStatusPill stationId="romen_xerox" />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Operator: Romen · Contact: +91 69092 28847
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <Link
            href="/?station=romen"
            target="_blank"
            className="px-3 py-1.5 rounded-xl bg-zinc-900 dark:bg-white text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <span>+ New Print (Kiosk)</span>
            <ExternalLink className="w-3 h-3" />
          </Link>

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Counter QR Code</span>
          </button>

          <button
            type="button"
            onClick={fetchJobs}
            disabled={loadingJobs}
            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs transition-colors cursor-pointer"
            title="Refresh Jobs"
          >
            <RefreshCw className={`w-4 h-4 ${loadingJobs ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-rose-500/20 hover:text-rose-500 text-zinc-500 text-xs transition-colors cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#14141a] space-y-1">
          <span className="text-[11px] text-zinc-500 font-medium">Pending Approvals</span>
          <div className="text-2xl font-black text-amber-500 font-mono">
            {pendingJobs.length}
          </div>
          <span className="text-[10px] text-zinc-400">₹{pendingRevenue} awaiting cash</span>
        </div>

        <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#14141a] space-y-1">
          <span className="text-[11px] text-zinc-500 font-medium">Active In-Queue</span>
          <div className="text-2xl font-black text-sky-500 font-mono">
            {activeJobs.length}
          </div>
          <span className="text-[10px] text-zinc-400">Queued for printing</span>
        </div>

        <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#14141a] space-y-1">
          <span className="text-[11px] text-zinc-500 font-medium">Completed Jobs</span>
          <div className="text-2xl font-black text-emerald-500 font-mono">
            {completedJobs.length}
          </div>
          <span className="text-[10px] text-zinc-400">Printed successfully</span>
        </div>

        <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#14141a] space-y-1">
          <span className="text-[11px] text-zinc-500 font-medium">Total Revenue</span>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            ₹{totalRevenue}
          </div>
          <span className="text-[10px] text-zinc-400">Today&apos;s collections</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-800 pb-2 overflow-x-auto text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-zinc-900 dark:bg-white text-zinc-50 dark:text-zinc-900 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          All Jobs ({jobs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-amber-500 text-zinc-950 shadow-xs font-bold'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <span>Pending Cash Approval</span>
          {pendingJobs.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-950 text-amber-300 text-[10px] font-mono">
              {pendingJobs.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === 'active'
              ? 'bg-sky-600 text-white shadow-xs font-bold'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          Queued / Printing ({activeJobs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
            activeTab === 'completed'
              ? 'bg-zinc-800 text-zinc-100 shadow-xs'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          History ({completedJobs.length})
        </button>

        {completedJobs.length > 0 && (
          <button
            type="button"
            onClick={handleClearHistory}
            disabled={clearHistoryLoading}
            className="ml-auto px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 border border-rose-500/20"
            title="Delete all completed/cancelled jobs from history and purge files from storage"
          >
            {clearHistoryLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* Jobs List */}
      {displayedJobs.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 text-zinc-400 space-y-2">
          <Layers className="w-8 h-8 mx-auto stroke-1 text-zinc-500" />
          <p className="text-sm font-semibold">No jobs in this category</p>
          <p className="text-xs text-zinc-500">
            Customers submitting orders via your counter QR code will appear here instantly.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayedJobs.map((job) => {
            const isLoading = actionLoadingId === job.id;
            const isPending = job.status === 'PENDING_PAYMENT';
            const isPaid = job.status === 'PAID';
            const isPrinting = job.status === 'PRINTING';
            const isCompleted = job.status === 'COMPLETED';

            return (
              <div
                key={job.id}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isPending
                    ? 'border-amber-500/40 bg-amber-500/[0.04]'
                    : isPaid || isPrinting
                    ? 'border-sky-500/40 bg-sky-500/[0.03]'
                    : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121216]'
                } flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs`}
              >
                {/* Left details */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="text-center p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shrink-0 min-w-[72px]">
                    <span className="text-[10px] font-semibold text-zinc-400 block">CODE</span>
                    <span className="text-lg font-black text-amber-500 font-mono tracking-wider">
                      {job.pickup_code}
                    </span>
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-xs sm:max-w-md">
                        {job.file_name}
                      </span>
                      {isPending && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-[10px] uppercase tracking-wider animate-pulse">
                          Awaiting Payment
                        </span>
                      )}
                      {isPaid && (
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-500 font-bold text-[10px] uppercase tracking-wider">
                          Queued to Print
                        </span>
                      )}
                      {isPrinting && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-400 font-bold text-[10px] uppercase tracking-wider animate-pulse">
                          Printing...
                        </span>
                      )}
                      {isCompleted && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-500 font-bold text-[10px] uppercase tracking-wider">
                          Completed
                        </span>
                      )}
                      {job.status === 'FAILED' && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 font-bold text-[10px] uppercase tracking-wider">
                          Cancelled / Removed
                        </span>
                      )}
                      {(isCompleted || job.status === 'FAILED') && (
                        job.is_purged ? (
                          <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700/40 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1" title="Document permanently wiped from cloud storage (Zero-Retention Policy)">
                            <Lock className="w-2.5 h-2.5 text-zinc-500" />
                            <span>Cloud Purged</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-400 border border-sky-500/30 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1" title="Document actively stored in cloud">
                            <FileText className="w-2.5 h-2.5" />
                            <span>Storage Active</span>
                          </span>
                        )
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap">
                      <span>{job.total_pages} Pages</span>
                      <span>•</span>
                      <span className="font-semibold uppercase">{job.color_mode}</span>
                      <span>•</span>
                      <span>{Boolean(job.is_duplex) ? 'Double-Sided' : 'Single-Sided'}</span>
                      <span>•</span>
                      <span>{job.copies} Set{job.copies > 1 ? 's' : ''}</span>
                      <span>•</span>
                      <span>{new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-2.5 shrink-0 justify-between md:justify-end pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100 dark:border-zinc-800">
                  <div className="text-right mr-2">
                    <span className="text-base font-black text-emerald-500 font-mono">
                      ₹{job.total_price}
                    </span>
                  </div>

                  {/* View document / Purged indicator */}
                  {job.file_key && !job.is_purged ? (
                    <a
                      href={`/api/view-file?key=${encodeURIComponent(job.file_key)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 cursor-pointer shadow-2xs"
                      title="Inspect Document (Opens in new tab)"
                    >
                      <Eye className="w-3.5 h-3.5 text-emerald-500" />
                      <span>View</span>
                    </a>
                  ) : (
                    <span
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-zinc-800/30 text-zinc-500 border border-zinc-800/60 cursor-not-allowed select-none"
                      title="Document permanently wiped from cloud storage (Zero-Retention Policy)"
                    >
                      <Lock className="w-3.5 h-3.5 text-zinc-600" />
                      <span>Purged</span>
                    </span>
                  )}

                  {/* Approve and Print (if pending) */}
                  {isPending && (
                    <button
                      type="button"
                      onClick={() => handleJobAction(job.id, 'approve')}
                      disabled={isLoading}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve &amp; Print</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Reprint */}
                  {!isPending && (
                    <button
                      type="button"
                      onClick={() => handleJobAction(job.id, 'reprint')}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Send job to printer again"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reprint</span>
                    </button>
                  )}

                  {/* Cancel / Remove from Queue (Only for active or pending jobs) */}
                  {job.status !== 'COMPLETED' && job.status !== 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Remove job ${job.pickup_code} from queue? It will not be printed.`)) {
                          handleJobAction(job.id, 'cancel');
                        }
                      }}
                      disabled={isLoading}
                      className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-rose-500/50 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Cancel / Remove from Print Queue"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{isPending ? 'Decline' : 'Cancel Queue'}</span>
                    </button>
                  )}

                  {/* Purge file button if still stored in cloud */}
                  {(job.status === 'COMPLETED' || job.status === 'FAILED') && !job.is_purged && job.file_key && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Wipe document for ${job.pickup_code} from cloud storage now? Order will remain in history.`)) {
                          handleJobAction(job.id, 'purge_file');
                        }
                      }}
                      disabled={isLoading}
                      className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 hover:bg-amber-500/10 text-zinc-400 hover:text-amber-400 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Wipe file from cloud storage immediately"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Purge File</span>
                    </button>
                  )}

                  {/* Delete / Purge single job from history */}
                  {(job.status === 'COMPLETED' || job.status === 'FAILED') && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete job ${job.pickup_code} from history and permanently wipe document from cloud storage?`)) {
                          handleJobAction(job.id, 'delete');
                        }
                      }}
                      disabled={isLoading}
                      className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-rose-500/50 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-500 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Permanently Delete and Purge Document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Counter QR Code Modal */}
      {showQrModal && (
        <div
          onClick={() => setShowQrModal(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in-up"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-sm w-full rounded-2xl border border-emerald-500/30 bg-zinc-950 p-6 shadow-2xl space-y-4 text-center animate-scale-in"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Store Counter QR Code
              </span>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-white mx-auto inline-block shadow-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                  getStationKioskUrl()
                )}`}
                alt="Romen Xerox Counter QR"
                className="w-56 h-56 mx-auto rounded-lg"
              />
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-white text-sm">
                Scan to Print at Romen Xerox
              </h3>
              <p className="text-[11px] text-zinc-400">
                Customers scan this to upload &amp; configure prints directly from their mobile phones.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={copyCounterLink}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Kiosk Link'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Print Standee
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
