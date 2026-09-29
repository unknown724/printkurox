'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Lock, 
  FileText, 
  ArrowLeft, 
  Loader2, 
  KeyRound, 
  IndianRupee, 
  Clock, 
  CheckCircle2,
  Smartphone,
  QrCode,
  Tag,
  Save,
  Copy,
  Check,
  CheckCircle,
  Wifi,
  ExternalLink,
  Wallet,
  Calendar,
  Gift,
  HelpCircle
} from 'lucide-react';
import Link from 'next/link';

interface Job {
  id: string;
  status: string;
  total_price: number;
  total_pages: number;
  created_at: string;
  isSettled?: boolean;
  isFreePrint?: boolean;
}

interface SettlementRecord {
  id: string;
  gross_amount: number;
  commission_amount: number;
  payout_amount: number;
  total_jobs: number;
  total_pages: number;
  period_start: string;
  period_end: string;
  settled_at: string;
  payment_ref?: string | null;
  notes?: string | null;
}

interface DashboardData {
  success: boolean;
  stationName: string;
  stationType: string;
  stationToken?: string;
  upiId?: string | null;
  monthlyFreeQuota?: number;
  freeQuotaUsedThisMonth?: number;
  freeQuotaRemaining?: number;
  deviceStatus?: {
    status: string;
    lastHeartbeat: string | null;
  };
  pricing?: {
    bwSingle: number;
    colorSingle: number;
    bwBulk: number;
    colorBulk: number;
  };
  metrics: {
    totalEarned: number; // Pending Payout (90%)
    unsettledGross?: number;
    platformFee?: number;
    todayEarned: number;
    totalSettled?: number; // Lifetime Paid
    settlementsCount?: number;
    totalPages: number;
    todayPages: number;
  };
  settlementHistory?: SettlementRecord[];
  recentJobs: Job[];
}

export default function StationAdminPage() {
  const params = useParams();
  const stationId = params.stationId as string;

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  // Pricing edit state
  const [bwPrice, setBwPrice] = useState<number>(4);
  const [colorPrice, setColorPrice] = useState<number>(7);
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceSuccess, setPriceSuccess] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // UPI configuration state
  const [upiInput, setUpiInput] = useState('');
  const [savingUpi, setSavingUpi] = useState(false);
  const [upiSuccess, setUpiSuccess] = useState(false);
  const [upiError, setUpiError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check for token in URL query parameter (Magic Link from setup QR or WhatsApp)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      const savedToken = localStorage.getItem(`station_token_${stationId}`);
      const savedPass = sessionStorage.getItem(`station_pass_${stationId}`);

      if (urlToken) {
        localStorage.setItem(`station_token_${stationId}`, urlToken);
        fetchDashboard({ token: urlToken });
        return;
      }

      if (savedToken) {
        fetchDashboard({ token: savedToken });
        return;
      }

      if (savedPass) {
        setPassword(savedPass);
        fetchDashboard({ pin: savedPass });
        return;
      }
    }
  }, [stationId]);

  const fetchDashboard = async (credentials: { pin?: string; token?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/station/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, ...credentials }),
      });
      const result = await res.json();
      
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Authentication failed');
      }

      setData(result);
      if (result.pricing) {
        setBwPrice(result.pricing.bwSingle || 4);
        setColorPrice(result.pricing.colorSingle || 7);
      }
      if (result.upiId) {
        setUpiInput(result.upiId);
      }
      if (credentials.pin) {
        sessionStorage.setItem(`station_pass_${stationId}`, credentials.pin);
      }
      if (credentials.token) {
        localStorage.setItem(`station_token_${stationId}`, credentials.token);
      }
    } catch (err: any) {
      setError(err.message);
      sessionStorage.removeItem(`station_pass_${stationId}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDashboard({ pin: password });
  };

  const handleSavePricing = async () => {
    setSavingPrice(true);
    setPriceError(null);
    setPriceSuccess(false);

    try {
      const token = localStorage.getItem(`station_token_${stationId}`) || undefined;
      const pin = sessionStorage.getItem(`station_pass_${stationId}`) || password;

      const res = await fetch('/api/station/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          pin,
          token,
          action: 'UPDATE_PRICING',
          pricingUpdates: {
            bwSingle: bwPrice,
            colorSingle: colorPrice,
            bwBulk: Math.max(2, bwPrice - 1),
            colorBulk: Math.max(3.5, colorPrice - 1.5),
          }
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to update rates');
      }

      setPriceSuccess(true);
      setTimeout(() => setPriceSuccess(false), 4000);
    } catch (err: any) {
      setPriceError(err.message);
    } finally {
      setSavingPrice(false);
    }
  };

  const handleSaveUpi = async () => {
    if (!upiInput || !upiInput.includes('@')) {
      setUpiError('Please enter a valid UPI ID (e.g. name@okhdfcbank or 9863013886@paytm)');
      return;
    }

    setSavingUpi(true);
    setUpiError(null);
    setUpiSuccess(false);

    try {
      const token = localStorage.getItem(`station_token_${stationId}`) || undefined;
      const pin = sessionStorage.getItem(`station_pass_${stationId}`) || password;

      const res = await fetch('/api/station/settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          action: 'UPDATE_UPI',
          upiId: upiInput.trim(),
          pin,
          token,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to update UPI ID');
      }

      setUpiSuccess(true);
      if (data) {
        setData({ ...data, upiId: upiInput.trim() });
      }
      setTimeout(() => setUpiSuccess(false), 4000);
    } catch (err: any) {
      setUpiError(err.message);
    } finally {
      setSavingUpi(false);
    }
  };

  const copyMobileLink = () => {
    if (!data?.stationToken) return;
    const url = `${window.location.origin}/admin/${stationId}?token=${data.stationToken}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const mobileMagicLink = typeof window !== 'undefined' && data?.stationToken 
    ? `${window.location.origin}/admin/${stationId}?token=${data.stationToken}` 
    : '';

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0f0f13] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#1e1f20] border border-white/10 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-center mb-1">Station Custodian Login</h2>
          <p className="text-xs text-zinc-400 text-center mb-6">
            Enter your station PIN or use your phone link to access earnings and pricing.
          </p>

          {error && (
            <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-1">Station PIN</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter 4-digit or custom PIN"
                className="w-full px-3 py-2.5 rounded-xl bg-[#131314] border border-white/10 text-sm text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Authenticating...' : 'Access Dashboard'}</span>
            </button>
          </form>

          <Link href="/" className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft className="w-3 h-3" />
            Back to PrintKurox
          </Link>
        </div>
      </div>
    );
  }

  const isOnline = data.deviceStatus?.status === 'online';

  return (
    <div className="min-h-screen bg-[#0f0f13] text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1e1f20] border border-white/10 p-5 rounded-2xl">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {data.stationName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-zinc-400">Live Station Portal</p>
              <span className="text-zinc-600">•</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                {isOnline ? 'Printer Online' : 'Printer Offline'}
              </span>
            </div>
          </div>
          
          <button
            onClick={() => {
              sessionStorage.removeItem(`station_pass_${stationId}`);
              localStorage.removeItem(`station_token_${stationId}`);
              window.location.reload();
            }}
            className="px-4 py-2 rounded-xl border border-white/10 text-xs font-semibold hover:bg-white/5 transition-colors self-start sm:self-auto cursor-pointer"
          >
            Lock Dashboard
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Today's Earnings */}
          <div className="bg-[#1e1f20] border border-white/10 p-5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <IndianRupee className="w-24 h-24" />
            </div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Today's Payout (90%)</p>
            <h2 className="text-3xl font-bold text-white">₹{data.metrics.todayEarned}</h2>
            <p className="text-[10px] text-zinc-500 mt-2">{data.metrics.todayPages} pages printed today</p>
          </div>
          
          {/* 2. Pending Payout Owed (Unsettled) */}
          <div className="bg-[#1e1f20] border border-blue-500/30 p-5 rounded-2xl relative overflow-hidden bg-gradient-to-br from-[#1e1f20] to-blue-950/20">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Wallet className="w-24 h-24 text-blue-400" />
            </div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Pending Sunday Payout</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">UNSETTLED</span>
            </div>
            <h2 className="text-3xl font-bold text-white">₹{data.metrics.totalEarned}</h2>
            <p className="text-[10px] text-zinc-400 mt-2">Transferred every Sunday (Net 90%)</p>
          </div>

          {/* 3. Lifetime Settled */}
          <div className="bg-[#1e1f20] border border-white/10 p-5 rounded-2xl">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Lifetime Settled & Paid</p>
            <h2 className="text-3xl font-bold text-white">₹{data.metrics.totalSettled || 0}</h2>
            <p className="text-[10px] text-zinc-500 mt-2">
              {data.metrics.settlementsCount ? `${data.metrics.settlementsCount} past Sunday payouts` : 'No settlements yet'}
            </p>
          </div>
          
          {/* 4. Owner Free Print Quota */}
          <div className="bg-[#1e1f20] border border-white/10 p-5 rounded-2xl">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Owner Free Quota</p>
              <Gift className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="text-3xl font-bold text-white">
              {data.freeQuotaUsedThisMonth || 0} <span className="text-base text-zinc-500 font-normal">/ {data.monthlyFreeQuota || 50}</span>
            </h2>
            <p className="text-[10px] text-emerald-400 mt-2">
              {data.freeQuotaRemaining ?? (data.monthlyFreeQuota || 50)} free pages left this month
            </p>
          </div>
        </div>

        {/* Payout Destination & Dynamic Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 1. UPI ID Settings for Weekly Payouts */}
          <div className="bg-[#1e1f20] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" />
                Sunday Payout Destination (UPI)
              </h3>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                Direct Bank Transfer
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              Platform fees are 10%. Your 90% share will be transferred automatically to this UPI ID every Sunday:
            </p>

            {upiError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {upiError}
              </div>
            )}

            {upiSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5" />
                UPI ID updated! Sunday payouts will be sent here.
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-zinc-400 uppercase block">
                Your UPI ID (GPay / PhonePe / Paytm / BHIM)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. yourname@okhdfcbank or 9863013886@paytm"
                  value={upiInput}
                  onChange={(e) => setUpiInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#131314] border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleSaveUpi}
                  disabled={savingUpi}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {savingUpi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save UPI</span>
                </button>
              </div>
              <p className="text-[10px] text-zinc-500">
                Current Payout Account: <span className="font-mono text-zinc-300 font-bold">{data.upiId || 'Not configured yet'}</span>
              </p>
            </div>
          </div>

          {/* 2. Price Control Card */}
          <div className="bg-[#1e1f20] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-400" />
                Customize Station Pricing
              </h3>
              <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-medium">
                Live on Website
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              Students selecting your station will be charged these exact rates:
            </p>

            {priceError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {priceError}
              </div>
            )}

            {priceSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5" />
                Rates updated! New prices are live for students.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#131314] p-3 rounded-xl border border-white/5">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase block mb-1">
                  B&W Rate (₹/page)
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-zinc-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.5"
                    min="2"
                    max="10"
                    value={bwPrice}
                    onChange={(e) => setBwPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-lg font-bold text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-[#131314] p-3 rounded-xl border border-white/5">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase block mb-1">
                  Color Rate (₹/page)
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-zinc-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.5"
                    min="3"
                    max="20"
                    value={colorPrice}
                    onChange={(e) => setColorPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-transparent text-lg font-bold text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSavePricing}
              disabled={savingPrice}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {savingPrice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{savingPrice ? 'Publishing Rates...' : 'Publish New Prices to Students'}</span>
            </button>
          </div>

        </div>

        {/* Mobile Phone Bookmark Card */}
        <div className="bg-[#1e1f20] border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-purple-400" />
              Instant Phone Link (No Login Needed)
            </h3>
            <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full font-medium">
              1-Click Auth
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#131314] p-2.5 rounded-xl border border-white/5">
            <input
              type="text"
              readOnly
              value={mobileMagicLink}
              className="bg-transparent text-[11px] text-zinc-400 w-full truncate focus:outline-none"
            />
            <button
              onClick={copyMobileLink}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedLink ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-2.5">
            <QrCode className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-zinc-300">
              <p className="font-semibold text-white">Bookmark on your phone:</p>
              <p className="text-zinc-400 mt-0.5">Send this link to your phone via WhatsApp or bookmark it to check live prints, weekly payouts, and ink status anytime!</p>
            </div>
          </div>
        </div>

        {/* Past Settlements History */}
        {data.settlementHistory && data.settlementHistory.length > 0 && (
          <div className="bg-[#1e1f20] border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-blue-400" />
                Past Sunday Payout Settlements
              </h3>
              <span className="text-xs text-zinc-400 font-mono">
                Total Paid: ₹{data.metrics.totalSettled || 0}
              </span>
            </div>

            <div className="divide-y divide-white/5 text-xs">
              {data.settlementHistory.map((s) => {
                const settledDate = new Date(s.settled_at).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                return (
                  <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">Settlement on {settledDate}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          PAID
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                        {s.total_jobs} prints ({s.total_pages} pages) • Gross: ₹{s.gross_amount} • 10% Fee: ₹{s.commission_amount}
                      </p>
                      {s.payment_ref && (
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Ref: <span className="font-mono text-zinc-300">{s.payment_ref}</span>
                        </p>
                      )}
                    </div>

                    <div className="text-left sm:text-right shrink-0">
                      <span className="text-sm font-bold text-emerald-400 font-mono">+₹{s.payout_amount}</span>
                      <p className="text-[10px] text-zinc-500">Transferred to UPI</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Jobs */}
        <div className="bg-[#1e1f20] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-zinc-400" />
              Recent Completed Orders
            </h3>
            <span className="text-xs text-zinc-500">Last 30 jobs</span>
          </div>
          
          {data.recentJobs.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No recent print jobs found.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {data.recentJobs.map((job) => {
                const date = new Date(job.created_at.replace(' ', 'T') + 'Z');
                const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const ownerCut = Math.floor(job.total_price * 0.90);
                
                return (
                  <div key={job.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-zinc-200 uppercase font-mono">#{job.id.slice(0, 8)}</p>
                          {job.isFreePrint ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-semibold">
                              Owner Free Quota
                            </span>
                          ) : job.isSettled ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-500/20 text-zinc-400 font-semibold">
                              Settled & Paid
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-semibold">
                              Pending Sunday
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {timeString} • {job.total_pages} Pages
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {job.isFreePrint ? (
                        <p className="text-xs font-semibold text-purple-400">Free Print</p>
                      ) : (
                        <>
                          <p className="text-sm font-bold text-emerald-400 font-mono">+₹{ownerCut}</p>
                          <p className="text-[10px] text-zinc-500">Student Paid: ₹{job.total_price}</p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer info */}
        <div className="text-center p-4 text-[11px] text-zinc-500 space-y-1">
          <p className="font-semibold text-zinc-400">PrintKurox Partner Network • 90% Owner Payout / 10% Platform Fee</p>
          <p className="text-zinc-600">Weekly payouts are transferred every Sunday directly to your registered UPI ID.</p>
        </div>

      </div>
    </div>
  );
}
