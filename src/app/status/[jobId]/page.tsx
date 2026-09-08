'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Printer,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  ArrowLeft,
  FileText,
  Loader2,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface JobStatusData {
  id: string;
  pickupCode: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'PRINTING_ODD' | 'AWAITING_FLIP' | 'PRINTING_EVEN' | 'COMPLETED' | 'FAILED';
  fileName: string;
  totalPages: number;
  pageRange: string;
  colorMode: 'bw' | 'color';
  isDuplex: boolean;
  copies: number;
  duplexSheets: number;
  singleSheets: number;
  totalPrice: number;
  createdAt: string;
  expiresAt: string;
  secondsRemaining: number;
  isExpired: boolean;
}

export default function JobStatusPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const [job, setJob] = useState<JobStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasCelebrated, setHasCelebrated] = useState(false);

  // Poll status every 2 seconds
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`);
        if (!res.ok) {
          throw new Error('Failed to load job status');
        }
        const data: JobStatusData = await res.json();
        setJob(data);

        // Trigger celebratory confetti once on completion or initial paid
        if (!hasCelebrated && (data.status === 'PAID' || data.status === 'COMPLETED')) {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.6 },
            colors: ['#6366f1', '#10b981', '#a855f7'],
          });
          setHasCelebrated(true);
        }
      } catch (err: unknown) {
        console.error(err);
        setError('Could not connect to printer queue.');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    intervalId = setInterval(fetchStatus, 2000);

    return () => clearInterval(intervalId);
  }, [jobId, hasCelebrated]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-4 text-center">
        <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
        <p className="text-sm text-slate-300 font-medium">Fetching your print job...</p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 space-y-4 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400" />
        <p className="text-base text-white font-semibold">{error || 'Job not found'}</p>
        <Link
          href="/"
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium"
        >
          Return to Upload
        </Link>
      </div>
    );
  }

  // Format MM:SS for 15-minute countdown
  const minutes = Math.floor(job.secondsRemaining / 60);
  const seconds = job.secondsRemaining % 60;
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Map status to user friendly stage
  const getStatusBadge = () => {
    switch (job.status) {
      case 'PAID':
        return {
          title: 'Queued for Printing',
          description: 'Sent to laptop printer queue. Printing will begin shortly.',
          color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
          step: 1,
        };
      case 'PRINTING_ODD':
        return {
          title: 'Printing Pass 1 (Odd Pages)',
          description: 'Printing front pages. Please stand by...',
          color: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
          step: 2,
        };
      case 'AWAITING_FLIP':
        return {
          title: 'Manual Duplex in Progress',
          description: 'Operator is flipping the paper stack for reverse side.',
          color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
          step: 2,
        };
      case 'PRINTING_EVEN':
        return {
          title: 'Printing Pass 2 (Even Pages)',
          description: 'Printing reverse pages...',
          color: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
          step: 2,
        };
      case 'COMPLETED':
        return {
          title: 'Ready for Pickup! 🎉',
          description: 'Collect your print from the tray matching your pickup code.',
          color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
          step: 3,
        };
      case 'FAILED':
        return {
          title: 'Print Paused / Error',
          description: 'Please inform the shop operator for assistance.',
          color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
          step: 2,
        };
      default:
        return {
          title: 'Awaiting Payment',
          description: 'Payment has not yet completed.',
          color: 'text-slate-400 border-white/10 bg-white/5',
          step: 0,
        };
    }
  };

  const statusInfo = getStatusBadge();

  return (
    <div className="space-y-5 pb-8">
      {/* Top Header Link */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Print New Document</span>
        </Link>
        <span className="text-[11px] text-emerald-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live Realtime Updates
        </span>
      </div>

      {/* Hero Pickup Code Card */}
      <div className="glass-card rounded-3xl p-6 text-center border-indigo-500/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">
          Your Pickup Code
        </p>

        {/* Large Pickup Code Badge */}
        <div className="inline-block my-2 py-3 px-8 rounded-2xl bg-gradient-to-tr from-indigo-950/80 to-slate-900 border-2 border-indigo-500/60 shadow-xl shadow-indigo-500/20">
          <span className="text-5xl sm:text-6xl font-black tracking-wider text-white font-mono-code">
            {job.pickupCode}
          </span>
        </div>

        <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
          Show this code to the counter operator or locate the sheet marked with this code.
        </p>
      </div>

      {/* Realtime Status Indicator Card */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Job Status
          </span>
          <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.color} flex items-center gap-1.5`}>
            {job.status === 'COMPLETED' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Printer className="w-3.5 h-3.5 animate-pulse" />
            )}
            <span>{statusInfo.title}</span>
          </div>
        </div>

        <p className="text-xs text-slate-300">
          {statusInfo.description}
        </p>

        {/* Progress steps */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className={`h-1.5 rounded-full ${statusInfo.step >= 1 ? 'bg-indigo-500' : 'bg-slate-800'}`} />
          <div className={`h-1.5 rounded-full ${statusInfo.step >= 2 ? 'bg-indigo-500' : 'bg-slate-800'}`} />
          <div className={`h-1.5 rounded-full ${statusInfo.step >= 3 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
        </div>
      </div>

      {/* 15-Minute Privacy Policy & Retention Countdown */}
      <div className="glass-card rounded-2xl p-4 flex items-center justify-between border-slate-700/50">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-white">15-Minute File Retention</p>
            <p className="text-[11px] text-slate-400">
              {job.isExpired ? (
                <span className="text-rose-400 font-medium">Expired & Purged</span>
              ) : (
                <>Deleted securely in <span className="font-mono text-amber-300 font-bold">{timeFormatted}</span></>
              )}
            </p>
          </div>
        </div>

        {/* Quick Reprint Action */}
        {!job.isExpired && (
          <Link
            href="/"
            className="text-xs text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-3 py-2 rounded-xl transition-all flex items-center space-x-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Print Again</span>
          </Link>
        )}
      </div>

      {/* Itemized Receipt Details */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300 uppercase tracking-wider pb-2 border-b border-white/5">
          <FileText className="w-4 h-4 text-indigo-400" />
          <span>Receipt Breakdown</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Document</span>
            <span className="text-white font-medium truncate max-w-[180px]">{job.fileName}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Pages</span>
            <span className="text-white font-medium">{job.totalPages} pages ({job.colorMode.toUpperCase()})</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Layout</span>
            <span className="text-white font-medium">{job.isDuplex ? 'Double-Sided (Duplex)' : 'Single-Sided'}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Copies</span>
            <span className="text-white font-medium">{job.copies} copy</span>
          </div>
          <div className="flex justify-between text-slate-400 pt-2 border-t border-white/5">
            <span className="font-semibold text-white">Amount Paid</span>
            <span className="text-emerald-400 font-bold text-sm">₹{job.totalPrice}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
