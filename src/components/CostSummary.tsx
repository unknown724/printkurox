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
import { BorderBeam } from '@/components/ui/BorderBeam';

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

      const { jobId, orderId, order_id, amount, currency, keyId, pickupCode } = await orderRes.json();
      const activeOrderId = order_id || orderId;

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
          order_id: activeOrderId,
          handler: async function (response: {
            razorpay_payment_id?: string;
            razorpay_order_id?: string;
            razorpay_signature?: string;
          }) {
            try {
              const verifyRes = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jobId,
                  razorpay_order_id: response.razorpay_order_id || activeOrderId,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });

              const verifyData = await verifyRes.json();
              if (!verifyRes.ok || !verifyData.success) {
                throw new Error(verifyData.error || 'Payment signature verification failed.');
              }

              router.push(`/status/${jobId}`);
            } catch (vErr: unknown) {
              setErrorMessage(vErr instanceof Error ? vErr.message : 'Payment verification failed.');
              setIsProcessing(false);
            }
          },
          prefill: { name: 'Kiosk Customer', email: 'customer@printkurox.com', contact: '9999999999' },
          theme: { color: '#6366f1', backdrop_color: 'rgba(7, 11, 20, 0.90)' },
          modal: {
            confirm_close: true,
            ondismiss: () => {
              setIsProcessing(false);
              setErrorMessage('Payment cancelled by user.');
            },
          },
        };
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (r: { error?: { description?: string; reason?: string } }) => {
          setErrorMessage(r.error?.description || r.error?.reason || 'Payment was cancelled or failed.');
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
    <div className="space-y-4">
      {/* Itemized Summary Card (Glassmorphic with Qronos Moving Border Beam) */}
      <div className="relative rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/95 backdrop-blur-xl shadow-xs overflow-hidden group">
        {/* Dynamic Specular Border Beam gliding slowly & smoothly around perimeter */}
        <BorderBeam duration={14} borderWidth={1.5} borderRadius={16} colorFrom="rgba(255, 255, 255, 0.85)" />

        {/* Header bar */}
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/[0.06] flex items-center justify-between relative z-10">
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Order Summary
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>Verified Secure</span>
          </div>
        </div>

        {/* Line items */}
        <div className="px-4 py-2 space-y-0 divide-y divide-zinc-100 dark:divide-white/[0.06] relative z-10">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Document</span>
            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>{pricing.totalPages} Page{pricing.totalPages > 1 ? 's' : ''}</span>
              {pricing.colorMode === 'bw' ? (
                <span className="px-1.5 py-0.5 rounded-md bg-zinc-200 dark:bg-white/10 text-zinc-900 dark:text-white border border-zinc-300 dark:border-white/15 font-bold text-[10px] font-mono">
                  B&amp;W
                </span>
              ) : pricing.colorMode === 'color' ? (
                <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-white border border-white/20 font-bold text-[10px] font-mono">
                  FULL COLOR
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-white border border-white/20 font-bold text-[10px] font-mono">
                  MIXED
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Paper Layout</span>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 text-right">
              {pricing.isDuplex ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <span>Double-Sided (Eco)</span>
                  <span className="text-[10px] font-mono text-zinc-400">({pricing.breakdown})</span>
                </span>
              ) : (
                <span>Single-Sided ({pricing.breakdown})</span>
              )}
            </span>
          </div>

          {pricing.copies > 1 && (
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Copies</span>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                {pricing.copies} Sets × ₹{pricing.unitPrice}
              </span>
            </div>
          )}
        </div>

        {/* Total Row with Golden Highlight */}
        <div className="px-4 py-3.5 bg-gradient-to-r from-amber-500/[0.08] via-amber-500/[0.02] to-transparent border-t border-amber-500/20 dark:border-amber-400/25 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
                Total Payable
              </span>
              {pricing.savings > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-500/30">
                  Save ₹{pricing.savings}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {pricing.savings > 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Bulk discount applied</span>
              ) : (
                'Includes paper, ink & taxes'
              )}
            </p>
          </div>

          <div className="flex items-baseline gap-1">
            {pricing.savings > 0 && (
              <span className="text-xs font-medium line-through text-zinc-400 tabular-nums font-mono mr-1">
                ₹{pricing.originalPrice}
              </span>
            )}
            <span className="text-base font-bold text-amber-500 dark:text-amber-400">₹</span>
            <span className="text-3xl sm:text-4xl font-black text-amber-500 dark:text-amber-300 drop-shadow-[0_0_16px_rgba(245,158,11,0.45)] tracking-tight tabular-nums font-mono">
              {pricing.totalPrice}
            </span>
          </div>
        </div>
      </div>

      {/* Printer Offline Warning */}
      {!statusLoading && !printerOnline && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200">
          <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold flex items-center gap-1.5">
              Printer Offline (Jobs will Queue)
            </p>
            <p className="text-amber-800/80 dark:text-amber-300/80 mt-0.5 leading-relaxed text-[11px]">
              You can still pay now. Your print job will be securely queued and automatically printed once the kiosk reconnects.
            </p>
          </div>
        </div>
      )}

      {/* Admin Bypass Button (if verified) */}
      {isAdmin && (
        <button
          type="button"
          onClick={handleAdminBypass}
          disabled={isProcessing}
          className="relative overflow-hidden w-full h-11 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
        >
          <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer-sheen pointer-events-none" />
          <Zap className="w-4 h-4 fill-zinc-950" />
          <span>Admin Free Print Active (Bypass)</span>
        </button>
      )}

      {/* Primary Pay Button (Golden Radiance Highlighted CTA) */}
      <button
        type="button"
        onClick={handlePayAndPrint}
        disabled={isProcessing}
        className="relative overflow-hidden group w-full h-12 sm:h-13 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-[0_0_24px_rgba(245,158,11,0.38)] hover:shadow-[0_0_36px_rgba(245,158,11,0.58)] border border-amber-200/90 dark:border-amber-300/80 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {/* Moving light sheen */}
        <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/35 to-transparent animate-shimmer-sheen pointer-events-none" />

        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-zinc-950" />
            <span className="tracking-wide">Processing Secure Payment…</span>
          </>
        ) : (
          <>
            <Printer className="w-5 h-5 text-zinc-950 stroke-[2.2]" />
            <span className="tracking-wide font-black">
              {printerOnline ? `Pay ₹${pricing.totalPrice} & Print` : `Pay ₹${pricing.totalPrice} & Queue`}
            </span>
            <ArrowRight className="w-4 h-4 text-zinc-950 stroke-[2.5] opacity-85 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </button>

      {/* Payment methods & Staff trigger */}
      <div className="p-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/50 dark:bg-[#08080a]/80 backdrop-blur-md space-y-2 text-xs">
        <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
          <button
            type="button"
            onClick={() => setShowStaffModal(true)}
            className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
            title="Staff passcode access"
          >
            <Lock className="w-3 h-3 text-emerald-500" />
            <span>RBI Compliant &amp; TLS Encrypted</span>
          </button>
          <span>Instant Verification</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-400">
          {['UPI', 'Google Pay', 'PhonePe', 'Paytm', 'Cards', 'NetBanking'].map((m) => (
            <span
              key={m}
              className="px-2.5 py-0.5 rounded-full bg-white/80 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 font-medium shadow-2xs"
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 text-xs text-rose-800 dark:text-rose-300 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Staff Passcode Modal */}
      {showStaffModal && (
        <div
          onClick={() => setShowStaffModal(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in-up"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-sm w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-lg space-y-3.5 text-center animate-scale-in"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                <KeyRound className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Staff Print Bypass
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowStaffModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 w-6 h-6 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed text-left">
              Enter the staff passcode to print directly without Razorpay checkout.
            </p>

            {staffError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-center gap-1.5">
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
                  className="w-full h-10 px-3 pr-10 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 text-xs text-center focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-300 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowStaffPin(!showStaffPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  {showStaffPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={staffLoading || !staffPin}
                className="w-full h-10 rounded-lg bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs transition-colors"
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
              className="inline-block text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline transition-colors"
            >
              Permanent device authorization at /adminkurox →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
