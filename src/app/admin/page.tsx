'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Lock,
  Printer,
  CheckCircle2,
  Clock,
  LogOut,
  ArrowLeft,
  KeyRound,
  RotateCcw,
  Loader2,
  FileText,
  AlertTriangle,
} from 'lucide-react';

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
  payment_id: string;
  created_at: string;
}

export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Check existing session
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/auth');
      const data = await res.json();
      setIsAdmin(Boolean(data.isAdmin));
      if (data.isAdmin) {
        fetchRecentJobs();
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
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setIsAdmin(true);
      setPin('');
      fetchRecentJobs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid Passcode');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    setIsAdmin(false);
    setJobs([]);
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
        <p className="text-xs text-slate-400 font-medium">Verifying authorization...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6 pb-12">
      {/* Header Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Kiosk</span>
        </Link>
        <span className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
          OPERATOR CONTROL PORTAL
        </span>
      </div>

      {!isAdmin ? (
        /* Login Card */
        <div className="glass-card rounded-3xl p-6 sm:p-8 border-indigo-500/30 space-y-5 text-center relative overflow-hidden">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
            <Lock className="w-7 h-7" />
          </div>

          <div>
            <h2 className="text-xl font-black text-white">Shop Admin & Staff Login</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Authorize this phone or laptop to bypass customer checkout and print directly on the Epson printer.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 max-w-sm mx-auto">
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter Admin Master Passcode"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !pin}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authorizing...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Authorize This Device (30 Days)</span>
                </>
              )}
            </button>
          </form>

          <p className="text-[11px] text-slate-500">
            🔒 Uses secure httpOnly token. Only authorized staff members are permitted.
          </p>
        </div>
      ) : (
        /* Authenticated Dashboard */
        <div className="space-y-5">
          {/* Active Status Banner */}
          <div className="rounded-2xl p-5 border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 flex items-center justify-between">
            <div className="flex items-center space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                  Device Authorized
                </span>
                <h3 className="text-base font-extrabold text-white">
                  Admin Free Print Mode Active
                </h3>
                <p className="text-xs text-slate-300">
                  You can now print for free without Razorpay checkout from this device.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
              >
                Go to Kiosk
              </Link>
              <button
                onClick={handleLogout}
                title="Log out of this device"
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/"
              className="glass-card rounded-2xl p-4 flex items-center space-x-3 border-indigo-500/20 hover:border-indigo-500/50 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Start Free Print Job</p>
                <p className="text-[11px] text-slate-400">Print without payment</p>
              </div>
            </Link>

            <button
              onClick={fetchRecentJobs}
              className="glass-card rounded-2xl p-4 flex items-center space-x-3 border-slate-700/40 hover:border-white/20 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center text-slate-300">
                <RotateCcw className={`w-5 h-5 ${loadingJobs ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Refresh Queue</p>
                <p className="text-[11px] text-slate-400">Sync latest D1 jobs</p>
              </div>
            </button>
          </div>

          {/* Recent Queue Table */}
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-400" />
                Recent D1 Print Queue
              </span>
              <span className="text-[11px] text-slate-400">
                {jobs.length} recent record{jobs.length === 1 ? '' : 's'}
              </span>
            </div>

            {loadingJobs ? (
              <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Loading queue...</span>
              </div>
            ) : jobs.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No print jobs found in queue.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {jobs.map((j) => (
                  <div
                    key={j.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-between text-xs hover:border-white/10 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {j.pickup_code}
                        </span>
                        <span className="font-medium text-slate-200 truncate max-w-[180px]">
                          {j.file_name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {j.total_pages} pages • {j.color_mode.toUpperCase()} • {j.is_duplex ? 'Duplex' : 'Simplex'} • ₹{j.total_price}
                      </p>
                    </div>

                    <div className="text-right space-y-0.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          j.status === 'COMPLETED'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : j.status === 'PAID'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {j.status}
                      </span>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {new Date(j.created_at).toLocaleTimeString('en-IN', { timeStyle: 'short' })}
                      </p>
                    </div>
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
