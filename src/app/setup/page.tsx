'use client';

import React, { useState } from 'react';
import {
  Printer,
  Sparkles,
  QrCode,
  Download,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Shield,
  Smartphone,
  CreditCard,
  Building2,
  MapPin,
  KeyRound,
  FileText,
  Copy,
  ExternalLink,
  ChevronRight,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

interface SetupResult {
  stationId: string;
  stationToken: string;
  customerUrl: string;
  adminUrl: string;
  stationConfig: Record<string, unknown>;
  message: string;
}

export default function SetupWizardPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [address, setAddress] = useState('');

  // Payment State
  const [paymentMode, setPaymentMode] = useState<'direct_upi' | 'razorpay_byok' | 'counter_cash'>('direct_upi');
  const [upiId, setUpiId] = useState('');
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [allowCounterCash, setAllowCounterCash] = useState(true);

  // Pricing State
  const [bwSingle, setBwSingle] = useState('3.00');
  const [bwDuplex, setBwDuplex] = useState('5.00');
  const [colorSingle, setColorSingle] = useState('5.00');
  const [colorDuplex, setColorDuplex] = useState('8.00');
  const [bwBulk, setBwBulk] = useState('2.50');
  const [colorBulk, setColorBulk] = useState('4.00');
  const [printerName, setPrinterName] = useState('EPSON L3210 Series');

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDownloadConfig = () => {
    if (!setupResult?.stationConfig) return;
    const jsonStr = JSON.stringify(setupResult.stationConfig, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'station_config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (!name.trim()) throw new Error('Please enter a station or shop name.');
      if (!adminPin.trim() || adminPin.trim().length < 4) {
        throw new Error('Admin PIN must be at least 4 digits long.');
      }
      if (paymentMode === 'direct_upi' && !upiId.trim()) {
        throw new Error('Please enter your personal or merchant UPI ID.');
      }

      const res = await fetch('/api/setup-station', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          shortName: shortName.trim() || name.trim().slice(0, 16),
          operatorName: operatorName.trim() || 'Owner',
          whatsappNumber: whatsappNumber.trim(),
          adminPin: adminPin.trim(),
          address: address.trim(),
          paymentMode,
          upiId: upiId.trim(),
          razorpayKeyId: razorpayKeyId.trim(),
          allowCounterCash,
          printerName: printerName.trim(),
          pricing: {
            bwSingle: parseFloat(bwSingle) || 3.0,
            bwDuplex: parseFloat(bwDuplex) || 5.0,
            colorSingle: parseFloat(colorSingle) || 5.0,
            colorDuplex: parseFloat(colorDuplex) || 8.0,
            bwBulk: parseFloat(bwBulk) || 2.5,
            colorBulk: parseFloat(colorBulk) || 4.0,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to setup station');

      setSetupResult(data);
      setStep(4);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error setting up station');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-white selection:bg-amber-500 selection:text-black">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Turnkey Kiosk Provisioning Engine</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
            PrintKurox Station Setup Wizard
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
            Configure a new commercial self-service printing kiosk in under 60 seconds. Auto-generates station tokens, pricing, customer QR posters, and daemon config.
          </p>

          {/* Stepper Progress */}
          {step < 4 && (
            <div className="flex items-center justify-center gap-2 sm:gap-4 pt-4">
              {[
                { num: 1, label: 'Station Info' },
                { num: 2, label: 'Payment Method' },
                { num: 3, label: 'Print Rates' },
              ].map((s) => (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => setStep(s.num as any)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    step === s.num
                      ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20'
                      : step > s.num
                      ? 'bg-white/10 text-white'
                      : 'bg-white/5 text-zinc-500'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-black/20 flex items-center justify-center text-[10px]">
                    {s.num}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Wizard Form Card */}
        {step < 4 ? (
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 rounded-3xl border border-white/10 bg-zinc-900/60 backdrop-blur-xl shadow-2xl space-y-6">
            {/* STEP 1: Station Profile */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="border-b border-white/10 pb-3">
                  <h2 className="text-base font-bold flex items-center gap-2 text-white">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    <span>Step 1: Station & Location Details</span>
                  </h2>
                  <p className="text-xs text-zinc-400">Give your kiosk a recognizable name and address for students.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-300">Station / Shop Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sharma Stationery & Xerox"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">Short Name (for pills & badges)</label>
                    <input
                      type="text"
                      placeholder="e.g. Sharma Xerox"
                      value={shortName}
                      onChange={(e) => setShortName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">Operator / Custodian Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Rohit Sharma"
                      value={operatorName}
                      onChange={(e) => setOperatorName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">WhatsApp / Contact Number *</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-mono text-xs text-zinc-500">+91</span>
                      <input
                        type="tel"
                        required
                        maxLength={10}
                        placeholder="9876543210"
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value.replace(/\D/g, ''))}
                        className="w-full pl-11 pr-3.5 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm font-mono text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300">Admin Security PIN (4–6 digits) *</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">
                        <KeyRound className="w-3.5 h-3.5" />
                      </span>
                      <input
                        type="password"
                        required
                        maxLength={8}
                        placeholder="e.g. 1234"
                        value={adminPin}
                        onChange={(e) => setAdminPin(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm font-mono text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-300">Physical Address / Tray Instructions</label>
                    <input
                      type="text"
                      placeholder="e.g. Shop #4, Near Campus Library Gate"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!name.trim()) {
                        setErrorMessage('Please enter a station name');
                        return;
                      }
                      if (!adminPin.trim() || adminPin.length < 4) {
                        setErrorMessage('PIN must be at least 4 digits');
                        return;
                      }
                      setErrorMessage(null);
                      setStep(2);
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-all cursor-pointer shadow-lg shadow-amber-500/20"
                  >
                    <span>Next: Payment Settings</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Payment Configuration */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="border-b border-white/10 pb-3">
                  <h2 className="text-base font-bold flex items-center gap-2 text-white">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <span>Step 2: Choose Payment & Settlement Method</span>
                  </h2>
                  <p className="text-xs text-zinc-400">Decide how this kiosk receives money from customers with zero commission.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Mode 1: Direct UPI */}
                  <div
                    onClick={() => setPaymentMode('direct_upi')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                      paymentMode === 'direct_upi'
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Smartphone className="w-5 h-5 text-emerald-400" />
                      {paymentMode === 'direct_upi' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <p className="font-bold text-sm text-white">Direct UPI ID</p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      100% money goes directly to your GPay/PhonePe UPI ID. Zero gateway verification or commission fees.
                    </p>
                  </div>

                  {/* Mode 2: Razorpay BYOK */}
                  <div
                    onClick={() => setPaymentMode('razorpay_byok')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                      paymentMode === 'razorpay_byok'
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Zap className="w-5 h-5 text-indigo-400" />
                      {paymentMode === 'razorpay_byok' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <p className="font-bold text-sm text-white">Your Razorpay Keys</p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Enter your own Razorpay Key ID. Supports UPI, Netbanking, Cards with instant auto-verification.
                    </p>
                  </div>

                  {/* Mode 3: Counter Cash */}
                  <div
                    onClick={() => setPaymentMode('counter_cash')}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                      paymentMode === 'counter_cash'
                        ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Building2 className="w-5 h-5 text-amber-400" />
                      {paymentMode === 'counter_cash' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                    </div>
                    <p className="font-bold text-sm text-white">Counter Cash / Handoff</p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Students pay cash at your counter, or WhatsApp the operator to approve print manually.
                    </p>
                  </div>
                </div>

                {/* Sub-inputs based on mode */}
                {paymentMode === 'direct_upi' && (
                  <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                    <label className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                      <span>Enter Your UPI ID (VPA) *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. yourname@oksbi, shop@paytm, 9876543210@ybl"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value.toLowerCase().trim())}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-500/30 bg-black/40 text-sm font-mono text-emerald-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <p className="text-[11px] text-zinc-400">
                      Customers will scan a Dynamic QR locking this exact UPI ID and amount.
                    </p>
                  </div>
                )}

                {paymentMode === 'razorpay_byok' && (
                  <div className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 space-y-2">
                    <label className="text-xs font-semibold text-indigo-300">
                      Your Razorpay Key ID (rzp_live_...)
                    </label>
                    <input
                      type="text"
                      placeholder="rzp_live_xxxxxxxxxxxxxxxx"
                      value={razorpayKeyId}
                      onChange={(e) => setRazorpayKeyId(e.target.value.trim())}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-500/30 bg-black/40 text-sm font-mono text-indigo-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                )}

                <div className="pt-4 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-zinc-300 hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (paymentMode === 'direct_upi' && !upiId.trim()) {
                        setErrorMessage('Please enter your UPI ID');
                        return;
                      }
                      setErrorMessage(null);
                      setStep(3);
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-all cursor-pointer shadow-lg shadow-amber-500/20"
                  >
                    <span>Next: Set Print Rates</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Print Rates & Hardware */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="border-b border-white/10 pb-3">
                  <h2 className="text-base font-bold flex items-center gap-2 text-white">
                    <Printer className="w-4 h-4 text-amber-400" />
                    <span>Step 3: Set Page Rates & Printer Model</span>
                  </h2>
                  <p className="text-xs text-zinc-400">Configure what customers pay per sheet at your kiosk.</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-zinc-300">B&W (Single Sheet)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-zinc-400 font-bold">₹</span>
                      <input
                        type="number"
                        step="0.5"
                        value={bwSingle}
                        onChange={(e) => setBwSingle(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 rounded-xl border border-white/10 bg-black/40 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-zinc-300">B&W (2-Sided Duplex)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-zinc-400 font-bold">₹</span>
                      <input
                        type="number"
                        step="0.5"
                        value={bwDuplex}
                        onChange={(e) => setBwDuplex(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 rounded-xl border border-white/10 bg-black/40 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-zinc-300">B&W Bulk (10+ sheets)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-zinc-400 font-bold">₹</span>
                      <input
                        type="number"
                        step="0.5"
                        value={bwBulk}
                        onChange={(e) => setBwBulk(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 rounded-xl border border-white/10 bg-black/40 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-zinc-300">Color (Single Sheet)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-zinc-400 font-bold">₹</span>
                      <input
                        type="number"
                        step="0.5"
                        value={colorSingle}
                        onChange={(e) => setColorSingle(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 rounded-xl border border-white/10 bg-black/40 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-zinc-300">Color (2-Sided Duplex)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-zinc-400 font-bold">₹</span>
                      <input
                        type="number"
                        step="0.5"
                        value={colorDuplex}
                        onChange={(e) => setColorDuplex(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 rounded-xl border border-white/10 bg-black/40 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-zinc-300">Color Bulk (10+ sheets)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-zinc-400 font-bold">₹</span>
                      <input
                        type="number"
                        step="0.5"
                        value={colorBulk}
                        onChange={(e) => setColorBulk(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 rounded-xl border border-white/10 bg-black/40 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-semibold text-zinc-300">Printer Model Name</label>
                  <input
                    type="text"
                    value={printerName}
                    onChange={(e) => setPrinterName(e.target.value)}
                    placeholder="e.g. EPSON L3210 Series"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-white/10 bg-black/40 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Matches the exact USB printer driver name configured on the hardware daemon.
                  </p>
                </div>

                {errorMessage && (
                  <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="pt-4 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-zinc-300 hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-black text-sm hover:from-amber-400 hover:to-amber-500 transition-all cursor-pointer shadow-xl shadow-amber-500/25 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span>Configuring Kiosk...</span>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Activate &amp; Generate Kiosk Setup</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        ) : (
          /* STEP 4: SUCCESS & PROVISIONING COMPLETE */
          setupResult && (
            <div className="space-y-6">
              <div className="p-6 sm:p-8 rounded-3xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-xl space-y-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    {name} is Officially Activated!
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400">
                    Your commercial hardware node is enrolled in the central fleet with Station ID: <code className="text-emerald-300 font-bold">{setupResult.stationId}</code>
                  </p>
                </div>

                {/* Key Metrics / URLs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  <div className="p-4 rounded-2xl border border-white/10 bg-black/40 space-y-1">
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Customer Print URL</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-amber-400 truncate">{setupResult.customerUrl}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(setupResult.customerUrl, 'url')}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors"
                        title="Copy Customer URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-white/10 bg-black/40 space-y-1">
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Station Secret Token</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-zinc-300 truncate">{setupResult.stationToken.slice(0, 20)}...</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(setupResult.stationToken, 'token')}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors"
                        title="Copy Secret Token"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleDownloadConfig}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download station_config.json</span>
                  </button>

                  <Link
                    href={`/?station=${encodeURIComponent(setupResult.stationId)}`}
                    target="_blank"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-white font-semibold text-xs transition-all"
                  >
                    <span>Test Customer View</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>

                  <Link
                    href={setupResult.adminUrl}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition-all"
                  >
                    <span>Open Station Dashboard</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* Printable Customer QR Poster Card */}
              <div className="p-6 sm:p-8 rounded-3xl border border-white/10 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white space-y-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-4">
                  <div>
                    <h3 className="text-lg font-black tracking-tight">{name}</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Official Self-Service Print Kiosk Poster</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Poster</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-6 justify-center py-4">
                  {/* High-res QR code generated via public SVG API */}
                  <div className="p-3 bg-white rounded-2xl border-2 border-zinc-900 shadow-xl shrink-0">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(setupResult.customerUrl)}`}
                      alt="Customer Print QR Code"
                      width={180}
                      height={180}
                      className="rounded-lg"
                    />
                  </div>

                  <div className="space-y-3 text-center sm:text-left">
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">Fast &amp; Autonomous</span>
                      <h4 className="text-xl font-black">Scan QR to Upload &amp; Print</h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Point your phone camera at the QR code to upload your PDF and pay via UPI.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="p-2 rounded-lg bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
                        <span className="text-[10px] text-zinc-500 uppercase block">Black &amp; White</span>
                        <span className="font-bold text-sm">₹{bwSingle} / pg</span>
                      </div>
                      <div className="p-2 rounded-lg bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
                        <span className="text-[10px] text-zinc-500 uppercase block">Color Print</span>
                        <span className="font-bold text-sm">₹{colorSingle} / pg</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-400 flex items-center justify-center sm:justify-start gap-1">
                      <Shield className="w-3 h-3 text-emerald-500" />
                      <span>RBI Compliant &amp; TLS 256-Bit Encrypted</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
