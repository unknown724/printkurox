'use client';

import React, { useState } from 'react';
import { IndianRupee, Printer, ArrowRight, Loader2, ShieldCheck, Lock, Check } from 'lucide-react';
import { PricingResult } from '@/lib/pricing';
import { useRouter } from 'next/navigation';

// Declare Razorpay on window
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
}

export function CostSummary({
  pricing,
  fileKey,
  fileName,
  totalPages,
  pageRange,
}: CostSummaryProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePayAndPrint = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // 1. Create order on server
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
        }),
      });

      if (!orderRes.ok) {
        const errData = await orderRes.json();
        throw new Error(errData.error || 'Failed to create order.');
      }

      const orderData = await orderRes.json();
      const { jobId, orderId, amount, currency, keyId, pickupCode } = orderData;

      // 2. Open Razorpay Checkout modal
      if (typeof window !== 'undefined' && window.Razorpay) {
        const options = {
          key: keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: amount,
          currency: currency || 'INR',
          name: process.env.NEXT_PUBLIC_SHOP_NAME || 'PrintKurox',
          description: `Order ${pickupCode} • ${pricing.totalPages} pgs (${pricing.copies}x copy)`,
          order_id: orderId && !orderId.startsWith('dummy_') && !orderId.startsWith('test_') ? orderId : undefined,
          handler: async function (response: {
            razorpay_payment_id?: string;
            razorpay_order_id?: string;
            razorpay_signature?: string;
          }) {
            // Verify payment on server
            try {
              const verifyRes = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jobId,
                  razorpay_order_id: response.razorpay_order_id || orderId,
                  razorpay_payment_id: response.razorpay_payment_id || 'pay_' + Date.now(),
                  razorpay_signature: response.razorpay_signature || 'sig_' + Date.now(),
                }),
              });

              if (verifyRes.ok) {
                router.push(`/status/${jobId}`);
              } else {
                router.push(`/status/${jobId}`);
              }
            } catch (vErr) {
              console.error(vErr);
              router.push(`/status/${jobId}`);
            }
          },
          prefill: {
            name: 'Kiosk Customer',
            email: 'customer@printkurox.com',
            contact: '9999999999',
          },
          theme: {
            color: '#6366f1', // Indigo accent
            backdrop_color: 'rgba(9, 13, 22, 0.85)',
          },
          modal: {
            confirm_close: true,
            ondismiss: function () {
              setIsProcessing(false);
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response: { error?: { description?: string } }) {
          setErrorMessage(response.error?.description || 'Payment was cancelled or failed.');
          setIsProcessing(false);
        });
        rzp.open();
      } else {
        throw new Error('Payment gateway is loading. Please check your internet connection and retry.');
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error initiating payment.';
      setErrorMessage(msg);
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Itemized Calculation Box */}
      <div className="glass-card rounded-2xl p-4.5 border-indigo-500/25 bg-gradient-to-b from-indigo-950/30 via-slate-900/60 to-slate-900/90 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <span className="text-xs text-slate-300 font-medium">Pages to Print</span>
          <span className="text-xs font-semibold text-white flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${pricing.colorMode === 'bw' ? 'bg-slate-400' : 'bg-pink-500'}`} />
            {pricing.totalPages} Page{pricing.totalPages > 1 ? 's' : ''} ({pricing.colorMode === 'bw' ? 'B&W' : 'Color'})
          </span>
        </div>

        <div className="flex items-center justify-between py-2.5 border-b border-white/5">
          <span className="text-xs text-slate-300 font-medium">Sheet Breakdown</span>
          <span className="text-xs font-semibold text-indigo-300 text-right">
            {pricing.breakdown}
          </span>
        </div>

        {pricing.copies > 1 && (
          <div className="flex items-center justify-between py-2.5 border-b border-white/5">
            <span className="text-xs text-slate-300 font-medium">Copies Multiplier</span>
            <span className="text-xs font-semibold text-white">
              {pricing.copies} × ₹{pricing.unitPrice}
            </span>
          </div>
        )}

        <div className="flex items-baseline justify-between pt-3.5">
          <div>
            <span className="text-xs font-semibold text-slate-300">Total Payable</span>
            <p className="text-[10px] text-slate-500 mt-0.5">Includes paper, ink & taxes</p>
          </div>
          <div className="flex items-baseline space-x-1 text-emerald-400 font-black">
            <span className="text-base font-bold">₹</span>
            <span className="text-3xl tracking-tight font-extrabold">{pricing.totalPrice}</span>
          </div>
        </div>
      </div>

      {/* Prominent Checkout Action Button */}
      <button
        type="button"
        onClick={handlePayAndPrint}
        disabled={isProcessing}
        className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold shadow-lg shadow-indigo-500/30 flex items-center justify-center space-x-3 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed group"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-white" />
            <span className="text-sm font-semibold tracking-wide">Opening Razorpay Secure Gateway...</span>
          </>
        ) : (
          <>
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <Printer className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-base tracking-wide">Pay ₹{pricing.totalPrice} & Print</span>
            <ArrowRight className="w-4 h-4 text-indigo-200 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </button>

      {/* Payment methods badges */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>100% Encrypted & RBI Compliant</span>
          </span>
          <span className="text-slate-500">Instant Verification</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-0.5 text-[10px] font-semibold text-slate-300">
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-white/5">UPI</span>
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-white/5">Google Pay</span>
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-white/5">PhonePe</span>
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-white/5">Paytm</span>
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-white/5">Debit / Credit Cards</span>
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-white/5">NetBanking</span>
        </div>
      </div>

      {errorMessage && (
        <div className="text-xs text-center text-rose-300 bg-rose-950/40 border border-rose-800/40 py-2.5 px-3 rounded-xl">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
