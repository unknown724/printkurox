'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Printer,
  RotateCcw,
  AlertTriangle,
  ArrowLeft,
  FileText,
  Loader2,
  MapPin,
  Download,
  Share2,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface JobStatusData {
  id: string;
  pickupCode: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'PRINTING_ODD' | 'AWAITING_FLIP' | 'PRINTING_EVEN' | 'COMPLETED' | 'FAILED';
  fileName: string;
  totalPages: number;
  pageRange: string;
  colorMode: 'bw' | 'color' | 'custom';
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
  const [copied, setCopied] = useState(false);

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

  const handleShareOrCopy = async () => {
    if (!job) return;
    const text = `PrintKurox Receipt #${job.pickupCode}\nAmount: ₹${job.totalPrice}\nCollect at: Block B, Room 29\nTrack: ${window.location.href}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `PrintKurox Receipt #${job.pickupCode}`,
          text: text,
          url: window.location.href,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrintReceipt = () => {
    window.print();
  };

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
          description: 'Payment confirmed! Sent to laptop printer queue. Printing will begin shortly.',
          color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
          step: 1,
        };
      case 'PRINTING_ODD':
        return {
          title: 'Printing Pass 1 (Odd Pages)',
          description: 'Printing front pages on EPSON L3210. Please stand by...',
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
          description: 'Please inform the shop operator in Room 29 for assistance.',
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
  const formattedDate = new Date(job.createdAt || Date.now()).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-5 pb-8 print:p-0 print:space-y-3">
      {/* Top Header Link (Hidden during print) */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/"
          className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Print New Document</span>
        </Link>
        <span className="text-[11px] text-emerald-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live Realtime Status
        </span>
      </div>

      {/* Hero Pickup Code Card */}
      <div className="glass-card rounded-3xl p-6 text-center border-indigo-500/40 relative overflow-hidden shadow-2xl shadow-indigo-950/40 print:border-black print:bg-white print:text-black">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none print:hidden" />

        <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-1 print:text-slate-600">
          Your Pickup Code
        </p>

        {/* Large Pickup Code Badge */}
        <div className="inline-block my-2 py-3.5 px-8 rounded-2xl bg-gradient-to-tr from-indigo-950/90 to-slate-900 border-2 border-indigo-500/70 shadow-xl shadow-indigo-500/20 print:bg-slate-100 print:border-black">
          <span className="text-5xl sm:text-6xl font-black tracking-wider text-white font-mono-code print:text-black">
            {job.pickupCode}
          </span>
        </div>

        <p className="text-xs text-slate-300 mt-2 max-w-sm mx-auto print:text-slate-700">
          Show this 4-digit code to collect your physical document from the tray.
        </p>
      </div>

      {/* Prominent Collection Point Banner */}
      <div className="rounded-2xl p-4 sm:p-5 border-2 border-emerald-500/50 bg-gradient-to-r from-emerald-950/50 via-slate-900 to-indigo-950/50 relative overflow-hidden shadow-lg shadow-emerald-500/10 print:border-black print:bg-slate-50 print:text-black">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner print:text-black print:border-black">
            <MapPin className="w-6 h-6 animate-pulse text-emerald-400 print:text-black" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 print:bg-black print:text-white">
                Collection Point
              </span>
              <span className="text-[11px] text-slate-400 flex items-center gap-1 print:text-slate-600">
                <Building2 className="w-3 h-3" /> Campus Kiosk
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white tracking-wide print:text-black">
              Collect from Block B, Room 29
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed print:text-slate-700">
              Your prints will be placed directly in the output tray labeled with code <strong className="text-emerald-300 font-mono font-bold print:text-black">{job.pickupCode}</strong> at <strong className="text-white font-semibold print:text-black">Block B, Room 29</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Realtime Status Indicator Card (Hidden in printed receipt) */}
      <div className="glass-card rounded-2xl p-5 space-y-4 print:hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Live Printing Progress
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
      <div className="glass-card rounded-2xl p-4 flex items-center justify-between border-slate-700/50 print:hidden">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-white">15-Minute Auto-Purge</p>
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
            <span>Print Another</span>
          </Link>
        )}
      </div>

      {/* Itemized Digital Receipt Card */}
      <div className="glass-card rounded-2xl p-5 space-y-4 border-slate-700/60 print:border-black print:bg-white print:text-black">
        <div className="flex items-center justify-between pb-3 border-b border-white/5 print:border-slate-300">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200 uppercase tracking-wider">
            <FileText className="w-4 h-4 text-indigo-400 print:text-black" />
            <span>Digital Payment Receipt</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full print:border-black print:text-black">
              <ShieldCheck className="w-3 h-3" /> Paid
            </span>
          </div>
        </div>

        {/* Receipt Key-Value Rows */}
        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between text-slate-400 print:text-slate-600">
            <span>Order Reference</span>
            <span className="text-white font-mono text-[11px] print:text-black">{job.id.slice(0, 16)}...</span>
          </div>
          <div className="flex justify-between text-slate-400 print:text-slate-600">
            <span>Date & Time</span>
            <span className="text-white font-medium print:text-black">{formattedDate}</span>
          </div>
          <div className="flex justify-between text-slate-400 print:text-slate-600">
            <span>Document</span>
            <span className="text-white font-medium truncate max-w-[200px] print:text-black">{job.fileName}</span>
          </div>
          <div className="flex justify-between text-slate-400 print:text-slate-600">
            <span>Pages & Color</span>
            <span className="text-white font-medium print:text-black">
              {job.totalPages} page{job.totalPages > 1 ? 's' : ''} ({job.colorMode === 'custom' ? 'Custom B&W / Color' : job.colorMode.toUpperCase()})
            </span>
          </div>
          <div className="flex justify-between text-slate-400 print:text-slate-600">
            <span>Sheet Layout</span>
            <span className="text-white font-medium print:text-black">
              {job.isDuplex ? 'Double-Sided (Duplex)' : 'Single-Sided (Simplex)'}
            </span>
          </div>
          <div className="flex justify-between text-slate-400 print:text-slate-600">
            <span>Copies</span>
            <span className="text-white font-medium print:text-black">{job.copies}</span>
          </div>
          <div className="flex justify-between text-slate-400 print:text-slate-600">
            <span>Pickup Point</span>
            <span className="text-emerald-400 font-bold print:text-black">Block B, Room 29</span>
          </div>

          <div className="flex justify-between items-center text-slate-300 pt-3 border-t border-white/5 print:border-slate-300">
            <div>
              <span className="font-bold text-white text-sm print:text-black">Total Paid</span>
              <p className="text-[10px] text-slate-400 print:text-slate-500">Incl. GST & paper</p>
            </div>
            <span className="text-emerald-400 font-black text-xl print:text-black">₹{job.totalPrice}</span>
          </div>
        </div>

        {/* Action Buttons for Receipt (Hidden during print) */}
        <div className="grid grid-cols-2 gap-2.5 pt-2 print:hidden">
          <button
            onClick={handlePrintReceipt}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all hover:border-white/20 active:scale-[0.98]"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Print Receipt</span>
          </button>
          <button
            onClick={handleShareOrCopy}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-semibold transition-all active:scale-[0.98]"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{copied ? 'Copied!' : 'Share Slip'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

