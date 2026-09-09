'use client';

import React, { useState } from 'react';
import Script from 'next/script';
import { ShieldCheck, CheckCircle2, XCircle, AlertCircle, Loader2, CreditCard, RefreshCw } from 'lucide-react';

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface VerificationResult {
  success: boolean;
  message?: string;
  order_id?: string;
  payment_id?: string;
  error?: string;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

export default function CheckoutTestPage() {
  const [amountRupees, setAmountRupees] = useState<number>(5);
  const [currency] = useState<string>('INR');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [createdOrder, setCreatedOrder] = useState<{ order_id: string; amount: number; currency: string } | null>(null);
  const [paymentSuccessData, setPaymentSuccessData] = useState<RazorpayResponse | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const addLog = (msg: string) => {
    setStatusLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleStartCheckout = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setVerificationResult(null);
    setPaymentSuccessData(null);
    setStatusLog([]);

    try {
      const amountPaise = Math.round(amountRupees * 100);
      if (amountPaise < 100) {
        throw new Error('Minimum order amount is ₹1.00 (100 paise)');
      }

      addLog(`Step 1: Calling POST /api/create-order for ₹${amountRupees} (${amountPaise} paise)...`);

      // 1. Create order on backend
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountPaise,
          currency,
          receipt: `test_rcpt_${Date.now()}`,
          notes: { test_source: 'checkout_test_page' },
        }),
      });

      const orderData = await res.json();
      if (!res.ok) {
        throw new Error(orderData.error || `Failed to create order (${res.status})`);
      }

      const orderId = orderData.order_id || orderData.orderId;
      addLog(`Step 1 Success: Order created with ID: ${orderId}`);
      setCreatedOrder({ order_id: orderId, amount: amountPaise, currency });

      // 2. Open Razorpay Standard Checkout
      if (typeof window === 'undefined' || !window.Razorpay) {
        throw new Error('Razorpay SDK script not loaded yet. Please wait a moment and try again.');
      }

      addLog('Step 2: Launching Razorpay Standard Checkout modal...');

      const keyId = orderData.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      const options = {
        key: keyId,
        amount: amountPaise,
        currency,
        name: 'PrintKurox Razorpay Test',
        description: `Test Checkout ₹${amountRupees}`,
        order_id: orderId,
        handler: async function (response: RazorpayResponse) {
          addLog(`Step 2 Success: Payment successful! Payment ID: ${response.razorpay_payment_id}`);
          setPaymentSuccessData(response);

          // 3. Verify signature on backend
          addLog('Step 3: Sending payment signature to POST /api/verify-payment...');
          try {
            const verifyRes = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                order_id: response.razorpay_order_id || orderId,
                payment_id: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });

            const verifyData: VerificationResult = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) {
              addLog(`Step 3 Failed: Signature verification error: ${verifyData.error || 'Verification failed'}`);
              setVerificationResult({ success: false, error: verifyData.error || 'Verification failed' });
            } else {
              addLog('Step 3 Success: Cryptographic HMAC-SHA256 signature verified successfully! Status: PAID');
              setVerificationResult(verifyData);
            }
          } catch (vErr) {
            const msg = vErr instanceof Error ? vErr.message : 'Network error verifying signature';
            addLog(`Step 3 Error: ${msg}`);
            setVerificationResult({ success: false, error: msg });
          } finally {
            setIsProcessing(false);
          }
        },
        modal: {
          confirm_close: true,
          ondismiss: function () {
            addLog('Modal Dismissed: Checkout cancelled by user.');
            setErrorMessage('Payment was cancelled by the user.');
            setIsProcessing(false);
          },
        },
        prefill: {
          name: 'Test Customer',
          email: 'test@example.com',
          contact: '9999999999',
        },
        theme: {
          color: '#6366f1',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp: { error?: { description?: string; reason?: string } }) {
        const desc = resp.error?.description || resp.error?.reason || 'Payment failed';
        addLog(`Payment Failed event: ${desc}`);
        setErrorMessage(`Payment failed: ${desc}`);
        setIsProcessing(false);
      });

      rzp.open();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start checkout';
      addLog(`Error: ${msg}`);
      setErrorMessage(msg);
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto py-8 px-4 space-y-6">
      {/* Razorpay SDK Script */}
      <Script
        id="razorpay-checkout-script"
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 text-white">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Razorpay Standard Checkout Test</h1>
            <p className="text-xs text-slate-400">Verify end-to-end Order Creation, Modal, & HMAC Signature</p>
          </div>
        </div>

        {/* Input Parameters */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Test Amount (INR ₹)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                step="1"
                value={amountRupees}
                onChange={(e) => setAmountRupees(Math.max(1, Number(e.target.value)))}
                disabled={isProcessing}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 w-32"
              />
              <span className="text-xs text-slate-400">
                = {Math.round(amountRupees * 100)} paise (Min: 100 paise)
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 text-xs text-slate-300 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Environment:</span>
              <span className="font-mono text-indigo-400">Test Mode</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Key ID:</span>
              <span className="font-mono text-emerald-400">
                {process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TZqI0Tl89MtIgF'}
              </span>
            </div>
          </div>

          {/* Checkout Button */}
          <button
            type="button"
            onClick={handleStartCheckout}
            disabled={isProcessing}
            className="w-full py-3.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing Payment…</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Pay ₹{amountRupees} with Razorpay</span>
              </>
            )}
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Verification Success Alert */}
        {verificationResult && verificationResult.success && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-xs text-emerald-300">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Payment Verified & Confirmed!</span>
            </div>
            <p className="text-slate-300">HMAC-SHA256 signature matched server secret key.</p>
            <div className="font-mono text-[11px] bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 space-y-1">
              <div>Order ID: {verificationResult.order_id}</div>
              <div>Payment ID: {verificationResult.payment_id}</div>
              <div>Status: PAID</div>
            </div>
          </div>
        )}

        {/* Verification Failure Alert */}
        {verificationResult && !verificationResult.success && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1 text-xs text-rose-300">
            <div className="flex items-center gap-2 font-bold text-sm text-rose-400">
              <XCircle className="w-5 h-5 text-rose-400" />
              <span>Signature Verification Failed</span>
            </div>
            <p>{verificationResult.error}</p>
          </div>
        )}

        {/* Execution Log */}
        {statusLog.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
              <span>Execution Log:</span>
              <button
                type="button"
                onClick={() => setStatusLog([])}
                className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Clear
              </button>
            </div>
            <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto space-y-1">
              {statusLog.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
