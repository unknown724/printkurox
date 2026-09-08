'use client';

import React, { useState } from 'react';
import { IndianRupee, Printer, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
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
          description: `Print Job ${pickupCode} (${pricing.copies}x copy)`,
          order_id: orderId.startsWith('dummy_') || orderId.startsWith('test_') ? undefined : orderId,
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
                  razorpay_payment_id: response.razorpay_payment_id || 'test_payment_' + Date.now(),
                  razorpay_signature: response.razorpay_signature || 'test_sig',
                }),
              });

              if (verifyRes.ok) {
                router.push(`/status/${jobId}`);
              } else {
                throw new Error('Payment verification failed on server.');
              }
            } catch (vErr) {
              console.error(vErr);
              router.push(`/status/${jobId}`);
            }
          },
          prefill: {
            name: 'Kiosk Customer',
            email: 'customer@autoprint.local',
            contact: '9999999999',
          },
          theme: {
            color: '#6366f1', // Indigo accent
          },
          modal: {
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
        // Fallback simulated payment flow if Razorpay script is not ready
        console.warn('Razorpay checkout script not loaded yet, using direct payment verification');
        const verifyRes = await fetch('/api/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            razorpay_order_id: orderId,
            razorpay_payment_id: 'test_pay_' + Date.now(),
            razorpay_signature: 'test_signature',
          }),
        });

        if (verifyRes.ok) {
          router.push(`/status/${jobId}`);
        } else {
          throw new Error('Simulation failed.');
        }
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error initiating payment.';
      setErrorMessage(msg);
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Itemized Calculation Box */}
      <div className="glass-card rounded-2xl p-4 border-indigo-500/20 bg-indigo-950/20">
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <span className="text-xs text-slate-300 font-medium">Pages to Print</span>
          <span className="text-xs font-semibold text-white">
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
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-xs text-slate-300 font-medium">Copies Multiplier</span>
            <span className="text-xs font-semibold text-white">
              {pricing.copies} × ₹{pricing.unitPrice}
            </span>
          </div>
        )}

        <div className="flex items-baseline justify-between pt-3">
          <div>
            <span className="text-xs font-medium text-slate-400">Total Payable</span>
            <p className="text-[10px] text-slate-500">Includes all taxes</p>
          </div>
          <div className="flex items-baseline space-x-1 text-emerald-400 font-bold">
            <span className="text-sm">₹</span>
            <span className="text-3xl tracking-tight">{pricing.totalPrice}</span>
          </div>
        </div>
      </div>

      {/* Prominent Checkout Action Button */}
      <button
        type="button"
        onClick={handlePayAndPrint}
        disabled={isProcessing}
        className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold shadow-lg shadow-indigo-500/30 flex items-center justify-center space-x-2.5 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Opening Payment Gateway...</span>
          </>
        ) : (
          <>
            <Printer className="w-5 h-5 text-indigo-200" />
            <span className="text-base">Pay ₹{pricing.totalPrice} & Print Now</span>
            <ArrowRight className="w-4 h-4 text-indigo-200 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </button>

      {/* Dev / Kiosk Test Simulation Button */}
      <button
        type="button"
        disabled={isProcessing}
        onClick={async () => {
          setIsProcessing(true);
          try {
            // 1. Create order
            const oRes = await fetch('/api/create-order', {
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
            const oData = await oRes.json();
            
            // 2. Simulate instant payment
            const vRes = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId: oData.jobId,
                razorpay_order_id: oData.orderId,
                razorpay_payment_id: 'simulated_kiosk_pay_' + Date.now(),
                razorpay_signature: 'simulated_valid',
              }),
            });
            if (vRes.ok) {
              router.push(`/status/${oData.jobId}`);
            }
          } catch (e) {
            console.error(e);
            setIsProcessing(false);
          }
        }}
        className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-center space-x-2 transition-all"
      >
        <span>⚡ Test Simulation: Instant Pay & Send to Printer Queue</span>
      </button>

      <div className="flex items-center justify-center space-x-2 text-[11px] text-slate-400 pt-1">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span>Secured by Razorpay • UPI (GPay/PhonePe/Paytm), Cards & NetBanking</span>
      </div>

      {errorMessage && (
        <p className="text-xs text-center text-rose-400 bg-rose-950/30 border border-rose-800/30 py-2 px-3 rounded-xl">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
