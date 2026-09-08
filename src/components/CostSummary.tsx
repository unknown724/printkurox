'use client';

import React, { useState, useEffect } from 'react';
import {
  IndianRupee,
  Printer,
  ArrowRight,
  Loader2,
  Lock,
  Check,
  Zap,
  KeyRound,
  X,
  AlertTriangle,
  Eye,
  EyeOff,
  WifiOff,
  Clock,
} from 'lucide-react';
import { PricingResult, PageConfig } from '@/lib/pricing';
import { usePrinterStatus } from '@/lib/usePrinterStatus';
import { useRouter } from 'next/navigation';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

interface CostSummaryProps {
  pricing: PricingResult;
  fileKey: string;
  fileName: string;
  totalPages: number;
  pageRange: string;
  pageConfigs?: PageConfig[];
}

export function CostSummary({
  pricing,
  fileKey,
  fileName,
  totalPages,
  pageRange,
  pageConfigs,
}: CostSummaryProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffPin, setStaffPin] = useState('');
  const [showStaffPin, setShowStaffPin] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Live printer status
  const { online: printerOnline, loading: statusLoading } = usePrinterStatus(30_000);

  useEffect(() => {
    fetch('/api/admin/auth')
      .then((r) => r.json())
      .then((d) => setIsAdmin(Boolean(d.isAdmin)))
      .catch(() => {});
  }, []);

  const getEffectiveOrientation = () => {
    if (!pageConfigs || pageConfigs.length === 0) return 'portrait';
    const hasLandscape = pageConfigs.some(
      (p) => p.included && (p.orientation === 'landscape' || p.rotation === 90 || p.rotation === 270)
    );
    return hasLandscape ? 'landscape' : 'portrait';
  };

  const handleAdminBypass = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin-bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileKey,
          fileName,
          docPages: totalPages,
          pageRange,
          colorMode: pricing.colorMode,
          isDuplex: pricing.isDuplex,
          copies: pricing.copies,
          orientation: getEffectiveOrientation(),
          pageConfigs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Admin bypass failed');
      router.push(`/status/${data.jobId}`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Bypass error');
      setIsProcessing(false);
    }
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError(null);
    setStaffLoading(true);
    try {
      const res = await fetch('/api/admin-bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileKey,
          fileName,
          docPages: totalPages,
          pageRange,
          colorMode: pricing.colorMode,
          isDuplex: pricing.isDuplex,
          copies: pricing.copies,
          orientation: getEffectiveOrientation(),
          pageConfigs,
          pin: staffPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Incorrect staff passcode');
      setShowStaffModal(false);
      router.push(`/status/${data.jobId}`);
    } catch (err: unknown) {
      setStaffError(err instanceof Error ? err.message : 'Invalid Passcode');
    } finally {
      setStaffLoading(false);
    }
  };

  const handlePayAndPrint = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const orderRes = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileKey,
          fileName,
          docPages: totalPages,
          pageRange,
          colorMode: pricing.colorMode,
          isDuplex: pricing.isDuplex,
          copies: pricing.copies,
          orientation: getEffectiveOrientation(),
          pageConfigs,
        }),
      });

      if (!orderRes.ok) {
        const errData = await orderRes.json();
        throw new Error(errData.error || 'Failed to create order.');
      }

      const { jobId, orderId, amount, currency, keyId, pickupCode } = await orderRes.json();

      if (typeof window !== 'undefined') {
        if (!window.Razorpay) {
          await new Promise<void>((resolve, reject) => {
            const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
            if (existingScript) {
              existingScript.addEventListener('load', () => resolve());
              existingScript.addEventListener('error', () => reject(new Error('Failed to load payment gateway.')));
              setTimeout(() => {
                if (window.Razorpay) resolve();
                else reject(new Error('Payment gateway load timed out. Check your internet connection.'));
              }, 4000);
            } else {
              const script = document.createElement('script');
              script.src = 'https://checkout.razorpay.com/v1/checkout.js';
              script.async = true;
              script.onload = () => resolve();
              script.onerror = () => reject(new Error('Failed to load payment gateway.'));
              document.body.appendChild(script);
            }
          });
        }

        if (!window.Razorpay) {
          throw new Error('Payment gateway loading. Check your internet and retry.');
        }

        const options = {
          key: keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount,
          currency: currency || 'INR',
          name: process.env.NEXT_PUBLIC_SHOP_NAME || 'PrintKurox',
          description: `Order ${pickupCode} • ${pricing.totalPages} pgs (${pricing.copies}x)`,
          order_id:
            orderId && !orderId.startsWith('dummy_') && !orderId.startsWith('test_')
              ? orderId
              : undefined,
          handler: async function (response: {
            razorpay_payment_id?: string;
            razorpay_order_id?: string;
            razorpay_signature?: string;
          }) {
            try {
              await fetch('/api/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jobId,
                  razorpay_order_id: response.razorpay_order_id || orderId,
                  razorpay_payment_id: response.razorpay_payment_id || 'pay_' + Date.now(),
                  razorpay_signature: response.razorpay_signature || 'sig_' + Date.now(),
                }),
              });
            } finally {
              router.push(`/status/${jobId}`);
            }
          },
          prefill: { name: 'Kiosk Customer', email: 'customer@printkurox.com', contact: '9999999999' },
          theme: { color: '#6366f1', backdrop_color: 'rgba(7, 11, 20, 0.90)' },
          modal: {
            confirm_close: true,
            ondismiss: () => setIsProcessing(false),
          },
        };
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (r: { error?: { description?: string } }) => {
          setErrorMessage(r.error?.description || 'Payment was cancelled or failed.');
          setIsProcessing(false);
        });
        rzp.open();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error initiating payment.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Itemized Summary Card */}
      <div className="card-premium rounded-2xl border border-indigo-500/20 overflow-hidden">
        {/* Header bar */}
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 via-violet-50/50 to-transparent dark:from-indigo-600/10 dark:via-violet-600/8 border-b border-slate-200/80 dark:border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider">
              Order Summary
            </span>
            <div className="flex items-center gap-1.5 text-[11px] text-indigo-600 dark:text-indigo-300">
              <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
              <span>Verified Secure</span>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="px-4 py-3 space-y-0 divide-y divide-slate-200/70 dark:divide-white/[0.04]">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Pages to Print</span>
            <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  pricing.colorMode === 'bw' ? 'bg-slate-400' : 'bg-pink-500'
                }`}
              />
              {pricing.totalPages} Page{pricing.totalPages > 1 ? 's' : ''} (
              {pricing.colorMode === 'custom'
                ? 'Mixed B&W/Color'
                : pricing.colorMode.toUpperCase()}
              )
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Sheet Breakdown</span>
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 text-right">
              {pricing.breakdown}
            </span>
          </div>

          {pricing.copies > 1 && (
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-slate-500 dark:text-slate-400">Copies</span>
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                {pricing.copies} × ₹{pricing.unitPrice}
              </span>
            </div>
          )}
        </div>

        {/* Total */}
        <div className="px-4 py-4 bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-950/30 border-t border-slate-200/80 dark:border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Total Payable</span>
              <p className="text-[10px] text-slate-500 mt-0.5">Includes paper, ink &amp; taxes</p>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">₹</span>
              <span className="text-4xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums">
                {pricing.totalPrice}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Printer Offline Warning Banner */}
      {!statusLoading && !printerOnline && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/8 border border-amber-200 dark:border-amber-500/25 text-xs animate-scale-in">
          <WifiOff className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              Printer Currently Offline
            </p>
            <p className="text-amber-700/80 dark:text-amber-200/70 mt-0.5 leading-relaxed">
              You can still pay now — your job will be <strong className="text-amber-800 dark:text-amber-300">queued</strong> and printed automatically when the printer comes back online.
            </p>
            <p className="text-amber-600/70 dark:text-amber-200/50 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Typically online within minutes.
            </p>
          </div>
        </div>
      )}

      {/* Admin Bypass Button */}
      {isAdmin && (
        <button
          type="button"
          onClick={handleAdminBypass}
          disabled={isProcessing}
          className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-black font-extrabold shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all hover:shadow-amber-500/35 hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-50"
        >
          <Zap className="w-4 h-4 fill-black" />
          <span>⚡ Admin Free Print</span>
        </button>
      )}

      {/* Main Pay Button */}
      <button
        type="button"
        onClick={handlePayAndPrint}
        disabled={isProcessing}
        className="btn-primary w-full py-4 px-6 rounded-2xl text-white font-bold flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-semibold">Processing…</span>
          </>
        ) : (
          <>
            <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <span className="text-base font-bold tracking-wide">
              {printerOnline ? `Pay ₹${pricing.totalPrice} & Print` : `Pay ₹${pricing.totalPrice} & Queue`}
            </span>
            <ArrowRight className="w-4 h-4 text-indigo-200 group-hover:translate-x-1 transition-transform shrink-0" />
          </>
        )}
      </button>

      {/* Payment methods + Staff trigger */}
      <div className="p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/5 space-y-2.5">
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setShowStaffModal(true)}
            className="flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
            title="Staff passcode access"
          >
            <Lock className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
            <span>100% Encrypted · RBI Compliant</span>
          </button>
          <span className="text-slate-400 dark:text-slate-600">Instant Verification</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-700 dark:text-slate-300">
          {['UPI', 'Google Pay', 'PhonePe', 'Paytm', 'Debit / Credit', 'NetBanking'].map((m) => (
            <span
              key={m}
              className="px-2 py-0.5 rounded bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 shadow-xs"
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="text-xs text-center text-rose-700 bg-rose-50 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800/40 py-2.5 px-3 rounded-xl flex items-center justify-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500 dark:text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Staff Passcode Modal */}
      {showStaffModal && (
        <div
          onClick={() => setShowStaffModal(false)}
          className="fixed inset-0 z-50 bg-black/70 dark:bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in-up"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card-premium max-w-sm w-full rounded-3xl p-6 border border-indigo-500/35 space-y-4 text-center animate-scale-in"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <KeyRound className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                  Staff Print Bypass
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowStaffModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Enter the master staff passcode to print without Razorpay checkout.
            </p>

            {staffError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs flex items-center justify-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{staffError}</span>
              </div>
            )}

            <form onSubmit={handleStaffSubmit} className="space-y-3">
              <div className="relative">
                <input
                  type={showStaffPin ? 'text' : 'password'}
                  value={staffPin}
                  onChange={(e) => setStaffPin(e.target.value)}
                  placeholder="Enter Staff Passcode"
                  required
                  autoFocus
                  className="w-full pl-4 pr-10 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm text-center focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowStaffPin(!showStaffPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                >
                  {showStaffPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={staffLoading || !staffPin}
                className="btn-primary w-full py-3 px-4 rounded-xl text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {staffLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Authorize &amp; Print</span>
                  </>
                )}
              </button>
            </form>

            <a
              href="/adminkurox"
              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline transition-colors"
            >
              Authorize this device permanently at /adminkurox →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
