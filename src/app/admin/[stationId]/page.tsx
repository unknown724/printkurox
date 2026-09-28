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
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';

interface Job {
  id: string;
  status: string;
  total_price: number;
  total_pages: number;
  created_at: string;
}

interface DashboardData {
  success: boolean;
  stationName: string;
  stationType: string;
  stationToken?: string;
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
    totalEarned: number;
    todayEarned: number;
    totalPages: number;
    todayPages: number;
  };
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

    const savedPass = sessionStorage.getItem(`station_pass_${stationId}`);
    const savedToken = localStorage.getItem(`station_token_${stationId}`);

    try {
      const res = await fetch('/api/station/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          pin: savedPass,
          token: savedToken,
          action: 'UPDATE_PRICING',
          pricingUpdates: {
            bwSingle: Number(bwPrice),
            colorSingle: Number(colorPrice),
          }
        }),
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || 'Failed to update rates');
      }

      setPriceSuccess(true);
      setTimeout(() => setPriceSuccess(false), 4000);
    } catch (err: any) {
      setPriceError(err.message);
    } finally {
      setSavingPrice(false);
    }
  };

  const mobileMagicLink = typeof window !== 'undefined' && data?.stationToken
    ? `${window.location.origin}/admin/${stationId}?token=${data.stationToken}`
    : `https://printkurox.vercel.app/admin/${stationId}`;

  const copyMobileLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(mobileMagicLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#0f0f13] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-xs text-zinc-400 font-medium">Verifying station access...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0f0f13] flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#1e1f20] border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
          
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4 text-blue-400">
            <Lock className="w-6 h-6" />
          </div>
          
          <h2 className="text-xl font-bold text-white text-center mb-1">Partner Portal</h2>
          <p className="text-sm text-zinc-400 text-center mb-6">
            Enter your secret passcode to view earnings for <span className="font-bold text-white uppercase">{stationId}</span>
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Station Password or PIN"
                className="w-full bg-[#131314] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading || password.length < 3}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Access Dashboard
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
                {isOnline ? 'Connector Online' : 'Connector Offline'}
              </span>
            </div>
          </div>
          
          <button
            onClick={() => {
              sessionStorage.removeItem(`station_pass_${stationId}`);
              localStorage.removeItem(`station_token_${stationId}`);
              window.location.reload();
            }}
            className="px-4 py-2 rounded-xl border border-white/10 text-xs font-semibold hover:bg-white/5 transition-colors self-start sm:self-auto"
          >
            Lock Dashboard
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#1e1f20] border border-white/10 p-5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <IndianRupee className="w-24 h-24" />
            </div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Today's Earnings</p>
            <h2 className="text-3xl font-bold text-white">₹{data.metrics.todayEarned}</h2>
            <p className="text-[10px] text-zinc-500 mt-2">After 10% Platform Fee</p>
          </div>
          
          <div className="bg-[#1e1f20] border border-white/10 p-5 rounded-2xl">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Today's Prints</p>
            <h2 className="text-3xl font-bold text-white">{data.metrics.todayPages}</h2>
            <p className="text-[10px] text-zinc-500 mt-2">Total pages printed today</p>
          </div>

          <div className="bg-[#1e1f20] border border-white/10 p-5 rounded-2xl">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Total Payout Owed</p>
            <h2 className="text-3xl font-bold text-white">₹{data.metrics.totalEarned}</h2>
            <p className="text-[10px] text-zinc-500 mt-2">To be settled this Sunday</p>
          </div>
          
          <div className="bg-[#1e1f20] border border-white/10 p-5 rounded-2xl">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">All-Time Prints</p>
            <h2 className="text-3xl font-bold text-white">{data.metrics.totalPages}</h2>
            <p className="text-[10px] text-zinc-500 mt-2">Total pages since installation</p>
          </div>
        </div>

        {/* Dynamic Controls: Pricing Editor & Mobile Phone Pairing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 1. Price Control Card */}
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
                    min="4"
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
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {savingPrice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save New Pricing
            </button>
          </div>

          {/* 2. Mobile Companion Card */}
          <div className="bg-[#1e1f20] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                Mobile Companion (Phone Access)
              </h3>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                1-Click Pair
              </span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Open your private earnings dashboard right on your mobile phone without entering passwords:
            </p>

            <div className="bg-[#131314] p-3 rounded-xl border border-white/5 flex items-center justify-between gap-3">
              <input
                type="text"
                readOnly
                value={mobileMagicLink}
                className="bg-transparent text-[11px] text-zinc-400 w-full truncate focus:outline-none"
              />
              <button
                onClick={copyMobileLink}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-2.5">
              <QrCode className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-zinc-300">
                <p className="font-semibold text-white">Bookmark on your phone:</p>
                <p className="text-zinc-400 mt-0.5">Send this link to your phone via WhatsApp or bookmark it. You can check live prints anywhere anytime!</p>
              </div>
            </div>
          </div>

        </div>

        {/* Recent Jobs */}
        <div className="bg-[#1e1f20] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-400" />
              Recent Paid Orders
            </h3>
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
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-200 uppercase">#{job.id.slice(0, 8)}</p>
                        <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {timeString} • {job.total_pages} Pages
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">+₹{ownerCut}</p>
                      <p className="text-[10px] text-zinc-500">Student Paid: ₹{job.total_price}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer info */}
        <div className="text-center p-4 text-[10px] text-zinc-600">
          <p>PrintKurox Partner Network • Payouts are settled automatically every Sunday</p>
        </div>

      </div>
    </div>
  );
}

