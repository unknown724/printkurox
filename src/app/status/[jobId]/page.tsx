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
  MessageCircle,
  PackageCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BorderBeam } from '@/components/ui/BorderBeam';

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
  const hasCelebratedRef = React.useRef(false);
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

        // Stop polling when job reaches terminal state
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          if (intervalId) clearInterval(intervalId);
        }

        // Trigger celebratory confetti once on completion or initial paid
        if (!hasCelebratedRef.current && (data.status === 'PAID' || data.status === 'COMPLETED')) {
          hasCelebratedRef.current = true;
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.6 },
            colors: ['#ffffff', '#e2e8f0', '#94a3b8', '#10b981'],
          });
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

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId]);

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

  const handleWhatsAppShare = () => {
    if (!job) return;
    const text = `🖨️ *PrintKurox Boarding Pass #${job.pickupCode}*\n📄 *File:* ${job.fileName}\n💰 *Paid:* ₹${job.totalPrice}\n📍 *Pickup:* Block B, Room 29 (Tray Code: *${job.pickupCode}*)\n🔗 *Live Track:* ${typeof window !== 'undefined' ? window.location.href : ''}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
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
          color: 'text-zinc-200 border-white/20 bg-white/5',
          step: 1,
        };
      case 'PRINTING_ODD':
        return {
          title: job.isDuplex ? 'Printing Pass 1 (Front Sides)' : 'Printing Document...',
          description: job.isDuplex
            ? 'Printing front pages on EPSON L3210. Please stand by...'
            : 'Printing your document on EPSON L3210. Please stand by...',
          color: 'text-zinc-200 border-white/20 bg-white/5',
          step: 2,
        };
      case 'AWAITING_FLIP':
        return {
          title: 'Double-Sided in Progress',
          description: 'Operator is flipping the paper stack for reverse side.',
          color: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
          step: 2,
        };
      case 'PRINTING_EVEN':
        return {
          title: 'Printing Pass 2 (Even Pages)',
          description: 'Printing reverse pages...',
          color: 'text-zinc-200 border-white/20 bg-white/5',
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
          color: 'text-zinc-400 border-white/10 bg-white/5',
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
    <div className="w-full max-w-xl mx-auto px-3.5 sm:px-4 py-4 sm:py-6 space-y-4 print:p-0 print:space-y-3">
      {/* Top Header Link (Hidden during print) */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/"
          className="inline-flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Print New Document</span>
        </Link>
        <span className="text-[11px] text-emerald-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live Realtime Status
        </span>
      </div>

      {/* Apple Wallet / Boarding Pass Digital Ticket with Moving Border Beam */}
      <div className="relative rounded-3xl p-6 sm:p-7 text-center border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/95 backdrop-blur-2xl shadow-2xl dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.95)] overflow-hidden print:border-black print:bg-white print:text-black">
        {/* Living Specular Border Beam gliding slowly & smoothly around perimeter */}
        <BorderBeam duration={14} borderWidth={1.5} borderRadius={24} colorFrom="rgba(255, 255, 255, 0.95)" />

        {/* Ambient Top Glow */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-20 bg-white/[0.04] rounded-full blur-xl pointer-events-none print:hidden" />

        <div className="flex items-center justify-between pb-3 border-b border-zinc-200/60 dark:border-white/10 text-xs relative z-10">
          <span className="font-extrabold tracking-widest text-zinc-700 dark:text-zinc-300 uppercase text-[10px]">
            PrintKurox Boarding Pass
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            Confirmed #{job.id.slice(0, 8)}
          </span>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-4 mb-1 relative z-10">
          Your Output Tray Pickup Code
        </p>

        {/* Large High-Contrast Pickup Code with Specular Border */}
        <div className="relative z-10 inline-block my-2.5 py-4 px-10 rounded-2xl bg-zinc-100 dark:bg-[#040405] border border-zinc-300 dark:border-white/20 shadow-md dark:shadow-[0_0_30px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.15)] print:bg-slate-100 print:border-black">
          <span className="text-5xl sm:text-6xl font-black tracking-widest text-zinc-950 dark:text-white font-mono-code print:text-black select-all">
            {job.pickupCode}
          </span>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-2 max-w-sm mx-auto leading-relaxed relative z-10">
          Show this code to collect your prints directly from the output tray.
        </p>

        {/* Ticket Perforation Tear Effect */}
        <div className="relative my-5 z-10">
          <div className="absolute -left-9 -top-3 w-6 h-6 rounded-full bg-zinc-200 dark:bg-[#000000] border-r border-zinc-300 dark:border-white/10" />
          <div className="border-t-2 border-dashed border-zinc-300 dark:border-white/15" />
          <div className="absolute -right-9 -top-3 w-6 h-6 rounded-full bg-zinc-200 dark:bg-[#000000] border-l border-zinc-300 dark:border-white/10" />
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-1 relative z-10">
          <div className="text-left">
            <span className="text-[10px] uppercase font-bold text-zinc-400">Document</span>
            <p className="font-semibold text-zinc-900 dark:text-zinc-200 truncate max-w-[150px]">{job.fileName}</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-zinc-400">Paid Total</span>
            <p className="font-black text-emerald-600 dark:text-emerald-400 text-base">₹{job.totalPrice}</p>
          </div>
        </div>
      </div>

      {/* Prominent Collection Point Banner */}
      <div className="rounded-2xl p-4 sm:p-5 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/90 backdrop-blur-xl relative overflow-hidden shadow-xs print:border-black print:bg-slate-50 print:text-black">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner print:text-black print:border-black">
            <MapPin className="w-6 h-6 animate-pulse text-emerald-400 print:text-black" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 print:bg-black print:text-white">
                Collection Point
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1 print:text-slate-600">
                <Building2 className="w-3 h-3" /> Campus Kiosk
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white tracking-wide print:text-black">
              Collect from Block B, Room 29
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed print:text-slate-700">
              Your prints will be placed directly in the output tray labeled with code <strong className="text-emerald-600 dark:text-emerald-300 font-mono font-bold print:text-black">{job.pickupCode}</strong> at <strong className="text-zinc-900 dark:text-white font-semibold print:text-black">Block B, Room 29</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Realtime Status Indicator Card (Hidden in printed receipt) */}
      <div className="rounded-2xl p-5 space-y-4 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/90 backdrop-blur-xl print:hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
            Live Printing Progress
          </span>
          <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.color} flex items-center gap-1.5`}>
            {job.status === 'COMPLETED' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Printer className="w-3.5 h-3.5 animate-pulse text-zinc-300" />
            )}
            <span>{statusInfo.title}</span>
          </div>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
          {statusInfo.description}
        </p>

        {/* 3-Milestone Visual Stepper */}
        <div className="pt-2">
          <div className="grid grid-cols-3 gap-2">
            {/* Milestone 1: Payment */}
            <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center space-y-1 transition-all ${
              statusInfo.step >= 1 
                ? 'border-white/20 bg-white/10 text-white font-medium' 
                : 'border-white/5 bg-white/[0.02] text-zinc-600'
            }`}>
              <ShieldCheck className={`w-4 h-4 ${statusInfo.step >= 1 ? 'text-white' : 'text-zinc-600'}`} />
              <span className="text-[10px] font-bold">1. Confirmed</span>
            </div>

            {/* Milestone 2: Printing */}
            <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center space-y-1 transition-all ${
              statusInfo.step === 2 
                ? 'border-white/30 bg-white/15 text-white font-medium' 
                : statusInfo.step > 2 
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' 
                : 'border-white/5 bg-white/[0.02] text-zinc-600'
            }`}>
              <Printer className={`w-4 h-4 ${statusInfo.step === 2 ? 'animate-pulse text-white' : statusInfo.step > 2 ? 'text-emerald-400' : 'text-zinc-600'}`} />
              <span className="text-[10px] font-bold">2. Printing</span>
            </div>

            {/* Milestone 3: Ready */}
            <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center space-y-1 transition-all ${
              statusInfo.step >= 3 
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 font-bold shadow-xs' 
                : 'border-white/5 bg-white/[0.02] text-zinc-600'
            }`}>
              <PackageCheck className={`w-4 h-4 ${statusInfo.step >= 3 ? 'text-emerald-400 animate-bounce' : 'text-zinc-600'}`} />
              <span className="text-[10px] font-bold">3. In Tray</span>
            </div>
          </div>
        </div>
      </div>

      {/* 15-Minute Privacy Policy & Retention Countdown */}
      <div className="rounded-2xl p-4 flex items-center justify-between border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/90 backdrop-blur-xl print:hidden">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-900 dark:text-white">15-Minute Auto-Purge</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {job.isExpired ? (
                <span className="text-rose-400 font-medium">Expired & Purged</span>
              ) : (
                <>Deleted securely in <span className="font-mono text-amber-400 font-bold">{timeFormatted}</span></>
              )}
            </p>
          </div>
        </div>

        {/* Quick Reprint Action */}
        {!job.isExpired && (
          <Link
            href="/"
            className="text-xs text-zinc-800 dark:text-zinc-200 hover:text-white bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 border border-zinc-300 dark:border-white/10 px-3 py-2 rounded-xl transition-all flex items-center space-x-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Print Another</span>
          </Link>
        )}
      </div>

      {/* Itemized Digital Receipt Card */}
      <div className="rounded-2xl p-5 space-y-4 border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/90 backdrop-blur-xl print:border-black print:bg-white print:text-black">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-white/10 print:border-slate-300">
          <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
            <FileText className="w-4 h-4 text-zinc-400 dark:text-zinc-300 print:text-black" />
            <span>Digital Payment Receipt</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full print:border-black print:text-black">
              <ShieldCheck className="w-3 h-3" /> Paid
            </span>
          </div>
        </div>

        {/* Receipt Key-Value Rows */}
        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between text-zinc-500 dark:text-zinc-400 print:text-slate-600">
            <span>Order Reference</span>
            <span className="text-zinc-900 dark:text-white font-mono text-[11px] print:text-black">{job.id.slice(0, 16)}...</span>
          </div>
          <div className="flex justify-between text-zinc-500 dark:text-zinc-400 print:text-slate-600">
            <span>Date & Time</span>
            <span className="text-zinc-900 dark:text-white font-medium print:text-black">{formattedDate}</span>
          </div>
          <div className="flex justify-between text-zinc-500 dark:text-zinc-400 print:text-slate-600">
            <span>Document</span>
            <span className="text-zinc-900 dark:text-white font-medium truncate max-w-[200px] print:text-black">{job.fileName}</span>
          </div>
          <div className="flex justify-between text-zinc-500 dark:text-zinc-400 print:text-slate-600">
            <span>Pages & Color</span>
            <span className="text-zinc-900 dark:text-white font-medium print:text-black">
              {job.totalPages} page{job.totalPages > 1 ? 's' : ''} ({job.colorMode === 'custom' ? 'Custom B&W / Color' : job.colorMode.toUpperCase()})
            </span>
          </div>
          <div className="flex justify-between text-zinc-500 dark:text-zinc-400 print:text-slate-600">
            <span>Sheet Layout</span>
            <span className="text-zinc-900 dark:text-white font-medium print:text-black">
              {job.isDuplex ? 'Double-Sided' : 'Single-Sided'}
            </span>
          </div>
          <div className="flex justify-between text-zinc-500 dark:text-zinc-400 print:text-slate-600">
            <span>Copies</span>
            <span className="text-zinc-900 dark:text-white font-medium print:text-black">{job.copies}</span>
          </div>
          <div className="flex justify-between text-zinc-500 dark:text-zinc-400 print:text-slate-600">
            <span>Pickup Point</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold print:text-black">Block B, Room 29</span>
          </div>

          <div className="flex justify-between items-center text-zinc-700 dark:text-zinc-300 pt-3 border-t border-zinc-100 dark:border-white/10 print:border-slate-300">
            <div>
              <span className="font-bold text-zinc-900 dark:text-white text-sm print:text-black">Total Paid</span>
              <p className="text-[10px] text-zinc-500 print:text-slate-500">Incl. GST & paper</p>
            </div>
            <span className="text-emerald-600 dark:text-emerald-400 font-black text-xl print:text-black">₹{job.totalPrice}</span>
          </div>
        </div>

        {/* Action Buttons for Receipt (Hidden during print) */}
        <div className="grid grid-cols-3 gap-2 pt-2 print:hidden">
          <button
            onClick={handlePrintReceipt}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 border border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-white text-xs font-semibold transition-all hover:border-zinc-400 dark:hover:border-white/20 active:scale-[0.98]"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span className="truncate">Print Receipt</span>
          </button>
          <button
            onClick={handleWhatsAppShare}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-600 dark:text-emerald-300 hover:text-white text-xs font-semibold transition-all active:scale-[0.98]"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate">WhatsApp</span>
          </button>
          <button
            onClick={handleShareOrCopy}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-zinc-900 dark:bg-white/10 hover:bg-zinc-800 dark:hover:bg-white/20 border border-zinc-800 dark:border-white/20 text-white text-xs font-semibold transition-all active:scale-[0.98]"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="truncate">{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
