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
  HelpCircle,
  Printer,
  Download,
  X,
  UploadCloud,
  AlertCircle,
  Sparkles,
  Minus,
  Plus,
  Palette,
  Eye,
  EyeOff,
  Layers,
  ShieldCheck,
  ListFilter,
  RotateCw,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import Link from 'next/link';
import { parsePageRange, pagesToRangeString, getRelativeOddEvenPages } from '@/lib/pdf-utils';

function formatJobTimestamp(raw?: string | null): string {
  if (!raw) return 'Recent';
  try {
    let s = String(raw).trim();
    if (!s) return 'Recent';

    // If numeric epoch timestamp string
    if (/^\d+$/.test(s)) {
      const num = Number(s);
      const d = new Date(num > 1e11 ? num : num * 1000);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    // Direct Date constructor parse
    let parsed = new Date(s);
    if (isNaN(parsed.getTime())) {
      // Normalize space to T for SQLite timestamps (e.g. "2026-09-29 18:30:00")
      if (s.includes(' ') && !s.includes('T')) {
        s = s.replace(' ', 'T');
      }
      // If no timezone suffix, treat as UTC
      if (!s.endsWith('Z') && !s.includes('+') && !s.slice(10).includes('-')) {
        s = s + 'Z';
      }
      parsed = new Date(s);
    }

    if (isNaN(parsed.getTime())) {
      return 'Recent';
    }

    const today = new Date();
    const isToday =
      today.getDate() === parsed.getDate() &&
      today.getMonth() === parsed.getMonth() &&
      today.getFullYear() === parsed.getFullYear();

    const timeStr = parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `Today, ${timeStr}`;
    }
    const dateStr = parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${dateStr}, ${timeStr}`;
  } catch {
    return 'Recent';
  }
}

interface Job {
  id: string;
  status: string;
  total_price: number;
  total_pages: number;
  created_at: string;
  isSettled?: boolean;
  isFreePrint?: boolean;
  payment_id?: string | null;
  pickupCode?: string;
  fileName?: string;
  fileKey?: string;
  color_mode?: string;
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

interface CashOrder {
  id: string;
  pickupCode: string;
  fileName: string;
  fileKey?: string;
  pages: number;
  copies: number;
  totalPrice: number;
  colorMode: string;
  isDuplex: boolean;
  createdAt: string;
}

interface DashboardData {
  success: boolean;
  stationName: string;
  stationType: string;
  stationToken?: string;
  ownerPrintEnabled?: boolean;
  upiId?: string | null;
  monthlyFreeQuota?: number;
  freeQuotaUsedThisMonth?: number;
  freeQuotaRemaining?: number;
  pendingCashOrders?: CashOrder[];
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

  // Door Standee Modal state
  const [showDoorPoster, setShowDoorPoster] = useState(false);

  // Owner Personal Print Modal state (Single-Sided Only)
  const [showFreePrintModal, setShowFreePrintModal] = useState(false);
  const [freeFile, setFreeFile] = useState<File | null>(null);
  const [freeDocPages, setFreeDocPages] = useState<number>(1);
  const [freeCopies, setFreeCopies] = useState<number>(1);
  const [freePageRange, setFreePageRange] = useState<string>('All');
  const [freePageRangeType, setFreePageRangeType] = useState<'all' | 'odd' | 'even' | 'custom'>('all');
  const [freeShowPreview, setFreeShowPreview] = useState<boolean>(false);
  const [freeColorMode, setFreeColorMode] = useState<'bw' | 'color'>('bw');
  const [freeUploading, setFreeUploading] = useState<boolean>(false);
  const [freeSuccessJobId, setFreeSuccessJobId] = useState<string | null>(null);
  const [freePickupCode, setFreePickupCode] = useState<string | null>(null);
  const [freeError, setFreeError] = useState<string | null>(null);

  // Document Live Preview Modal state (for pending cash orders & live queue)
  const [documentPreviewTarget, setDocumentPreviewTarget] = useState<{
    id: string;
    title: string;
    fileName: string;
    fileKey?: string;
    pickupCode?: string;
    totalPrice?: number;
    isCashOrder?: boolean;
  } | null>(null);

  // Real rendered page previews for Owner Personal Print
  const [freeThumbnails, setFreeThumbnails] = useState<string[]>([]);
  const [generatingThumbnails, setGeneratingThumbnails] = useState<boolean>(false);
  const [showOwnerFullPreview, setShowOwnerFullPreview] = useState<boolean>(false);
  const [ownerEnlargedPage, setOwnerEnlargedPage] = useState<number | null>(null);

  // Queue refresh state
  const [refreshingQueue, setRefreshingQueue] = useState(false);

  const handleRefreshQueue = async () => {
    setRefreshingQueue(true);
    try {
      const pin = sessionStorage.getItem(`station_pass_${stationId}`) || password;
      const token = localStorage.getItem(`station_token_${stationId}`) || undefined;
      if (token) await fetchDashboard({ token, silent: true });
      else if (pin) await fetchDashboard({ pin, silent: true });
      else await fetchDashboard({ isMasterAdmin: true, silent: true });
    } finally {
      setTimeout(() => setRefreshingQueue(false), 500);
    }
  };

  // In-Person Cash Order State
  const [verifyingCashJobId, setVerifyingCashJobId] = useState<string | null>(null);
  const [cashSuccessMsg, setCashSuccessMsg] = useState<string | null>(null);
  const [cashErrorMsg, setCashErrorMsg] = useState<string | null>(null);

  const handleVerifyCash = async (jobId: string) => {
    setVerifyingCashJobId(jobId);
    setCashSuccessMsg(null);
    setCashErrorMsg(null);
    try {
      const pin = sessionStorage.getItem(`station_pass_${stationId}`) || password;
      const token = localStorage.getItem(`station_token_${stationId}`) || undefined;
      const res = await fetch('/api/admin-bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'VERIFY_CASH',
          targetJobId: jobId,
          station_id: stationId,
          pin,
          token,
        }),
      });
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to verify cash payment');
      }
      setCashSuccessMsg('Cash collected! Print job dispatched to printer.');
      if (token) fetchDashboard({ token });
      else if (pin) fetchDashboard({ pin });
      setTimeout(() => setCashSuccessMsg(null), 4000);
    } catch (err: any) {
      setCashErrorMsg(err.message);
      setTimeout(() => setCashErrorMsg(null), 4000);
    } finally {
      setVerifyingCashJobId(null);
    }
  };

  const handleFreeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFreeFile(file);
    setFreeError(null);
    setFreeSuccessJobId(null);
    setFreePageRange('All');
    setFreePageRangeType('all');
    setFreeThumbnails([]);

    const lower = file.name.toLowerCase();
    const isImage = lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp');
    const isDocx = lower.endsWith('.docx') || lower.endsWith('.doc');

    if (isImage) {
      setFreeDocPages(1);
      const url = URL.createObjectURL(file);
      setFreeThumbnails([url]);
      return;
    }

    setGeneratingThumbnails(true);

    try {
      let activeFile = file;

      // Handle DOCX / DOC conversion to PDF for authentic page rendering
      if (isDocx) {
        let converted: File | null = null;
        // Priority 0: Station PC Daemon (Port 7250) if running on local kiosk
        try {
          const stationRes = await fetch('http://127.0.0.1:7250/convert-docx', {
            method: 'POST',
            body: file,
            signal: AbortSignal.timeout(3500),
          });
          if (stationRes.ok) {
            const pdfBlob = await stationRes.blob();
            if (pdfBlob && pdfBlob.size > 500) {
              converted = new File([pdfBlob], file.name.replace(/\.(docx|doc)$/i, '.pdf'), { type: 'application/pdf' });
            }
          }
        } catch {}

        // Priority 1: Next.js API route /api/convert-docx
        if (!converted) {
          try {
            const formData = new FormData();
            formData.append('file', file);
            const convRes = await fetch('/api/convert-docx', {
              method: 'POST',
              body: formData,
              signal: AbortSignal.timeout(4000),
            });
            if (convRes.ok) {
              const pdfBlob = await convRes.blob();
              if (pdfBlob && pdfBlob.size > 500) {
                converted = new File([pdfBlob], file.name.replace(/\.(docx|doc)$/i, '.pdf'), { type: 'application/pdf' });
              }
            }
          } catch {}
        }

        // Priority 2: Client-side docx converter
        if (!converted) {
          try {
            const { convertDocxToPdfClient } = await import('@/lib/client-docx-converter');
            const clientPdf = await convertDocxToPdfClient(file);
            if (clientPdf && clientPdf.size > 1000) {
              converted = clientPdf;
            }
          } catch {}
        }

        if (converted) {
          activeFile = converted;
          setFreeFile(converted);
        }
      }

      if (activeFile.name.toLowerCase().endsWith('.pdf')) {
        const { PDFDocument } = await import('pdf-lib');
        const buffer = await activeFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const count = Math.max(1, pdfDoc.getPageCount());
        setFreeDocPages(count);

        // Generate authentic visual page canvas thumbnails using pdfjs-dist
        try {
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
          const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
          const thumbs: string[] = [];
          const maxRender = Math.min(count, 16);
          for (let p = 1; p <= maxRender; p++) {
            const page = await pdf.getPage(p);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({ canvasContext: ctx, viewport }).promise;
              thumbs.push(canvas.toDataURL('image/jpeg', 0.92));
            }
          }
          setFreeThumbnails(thumbs);
        } catch (thumbErr) {
          console.warn('PDF.js thumbnail render error:', thumbErr);
        }
      } else {
        setFreeDocPages(1);
      }
    } catch (err) {
      console.warn('Error preparing document for owner print:', err);
      setFreeDocPages(1);
    } finally {
      setGeneratingThumbnails(false);
    }
  };

  const applyFreePresetAll = () => {
    setFreePageRangeType('all');
    setFreePageRange('All');
  };

  const applyFreePresetOdd = () => {
    setFreePageRangeType('odd');
    const allP = Array.from({ length: freeDocPages }, (_, i) => i + 1);
    const oddP = getRelativeOddEvenPages(allP, 'odd');
    setFreePageRange(pagesToRangeString(oddP));
  };

  const applyFreePresetEven = () => {
    setFreePageRangeType('even');
    const allP = Array.from({ length: freeDocPages }, (_, i) => i + 1);
    const evenP = getRelativeOddEvenPages(allP, 'even');
    setFreePageRange(pagesToRangeString(evenP));
  };

  const toggleFreePage = (pageNumber: number) => {
    const current = parsePageRange(freePageRange, freeDocPages);
    let next: number[];
    if (current.includes(pageNumber)) {
      next = current.filter((p) => p !== pageNumber);
    } else {
      next = [...current, pageNumber].sort((a, b) => a - b);
    }
    if (next.length === 0) next = [pageNumber];
    if (next.length === freeDocPages) {
      setFreePageRangeType('all');
      setFreePageRange('All');
    } else {
      setFreePageRangeType('custom');
      setFreePageRange(pagesToRangeString(next));
    }
  };

  const handleDispatchFreePrint = async () => {
    if (!freeFile) {
      setFreeError('Please choose a document to print.');
      return;
    }

    setFreeUploading(true);
    setFreeError(null);

    try {
      const formData = new FormData();
      formData.append('file', freeFile);
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const upErr = await uploadRes.json().catch(() => ({}));
        throw new Error(upErr.error || 'Failed to upload document to print spooler.');
      }

      const upData = await uploadRes.json();
      const fileKey = upData.fileKey;
      const detectedPages = upData.totalPages || freeDocPages;

      const savedToken = typeof window !== 'undefined' ? localStorage.getItem(`station_token_${stationId}`) : '';
      const savedPass = typeof window !== 'undefined' ? sessionStorage.getItem(`station_pass_${stationId}`) : '';

      const bypassRes = await fetch('/api/admin-bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileKey: fileKey,
          fileName: freeFile.name,
          docPages: detectedPages,
          pageRange: freePageRange && freePageRange.trim() ? freePageRange.trim() : 'All',
          colorMode: freeColorMode,
          isDuplex: false, // Single-Sided Only (No duplex)
          copies: freeCopies,
          station_id: stationId,
          pin: savedPass || savedToken || password,
        }),
      });

      if (!bypassRes.ok) {
        const byErr = await bypassRes.json().catch(() => ({}));
        throw new Error(byErr.error || 'Could not send free print job to printer.');
      }

      const byData = await bypassRes.json();
      setFreeSuccessJobId(byData.jobId);
      setFreePickupCode(byData.pickupCode || 'PRINTING');

      // Refresh dashboard to reflect updated quota and recent jobs
      if (savedToken) fetchDashboard({ token: savedToken });
      else if (savedPass) fetchDashboard({ pin: savedPass });
    } catch (err: any) {
      setFreeError(err.message || 'Failed to dispatch free print job.');
    } finally {
      setFreeUploading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDoorPoster(false);
        setShowFreePrintModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // 1. Check for token/pin/master in URL query parameter (from Master Admin or Magic Link)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      const urlPin = urlParams.get('pin');
      const isMaster = urlParams.get('master') === 'true' || urlParams.get('admin') === 'true';
      const savedToken = localStorage.getItem(`station_token_${stationId}`);
      const savedPass = sessionStorage.getItem(`station_pass_${stationId}`);

      if (urlToken) {
        localStorage.setItem(`station_token_${stationId}`, urlToken);
        fetchDashboard({ token: urlToken });
        return;
      }

      if (urlPin) {
        sessionStorage.setItem(`station_pass_${stationId}`, urlPin);
        setPassword(urlPin);
        fetchDashboard({ pin: urlPin });
        return;
      }

      if (isMaster) {
        fetchDashboard({ isMasterAdmin: true });
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

      // Check if logged-in master admin cookie allows direct seamless entry
      fetchDashboard({ isMasterAdmin: true, silent: true });
    }
  }, [stationId]);

  const fetchDashboard = async (credentials: { pin?: string; token?: string; isMasterAdmin?: boolean; silent?: boolean }) => {
    if (!credentials.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/station/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, ...credentials }),
      });
      const result = await res.json();
      
      if (!res.ok || !result.success) {
        if (credentials.silent) {
          // If silent master check fails, just let them see the PIN form
          return;
        }
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
          
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowDoorPoster(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Door Standee / Poster</span>
            </button>

            {data.ownerPrintEnabled && (
              <button
                onClick={() => {
                  setFreeError(null);
                  setFreeSuccessJobId(null);
                  setFreeFile(null);
                  setShowFreePrintModal(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Gift className="w-3.5 h-3.5 text-purple-400" />
                <span>Print My Notes</span>
              </button>
            )}

            <button
              onClick={() => {
                sessionStorage.removeItem(`station_pass_${stationId}`);
                localStorage.removeItem(`station_token_${stationId}`);
                window.location.reload();
              }}
              className="px-4 py-2 rounded-xl border border-white/10 text-xs font-semibold hover:bg-white/5 transition-colors cursor-pointer"
            >
              Lock Dashboard
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${data.ownerPrintEnabled ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
          {/* 1. Today's Earnings */}
          <div className="bg-[#1e1f20] border border-white/10 p-5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <IndianRupee className="w-24 h-24" />
            </div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Today's Earnings (Razorpay)</p>
            <h2 className="text-3xl font-bold text-white">₹{data.metrics.todayEarned}</h2>
            <p className="text-[10px] text-zinc-500 mt-2">{data.metrics.todayPages} pages printed today via Razorpay</p>
          </div>
          
          {/* 2. Pending Payout Owed (Unsettled) */}
          <div className="bg-[#1e1f20] border border-blue-500/30 p-5 rounded-2xl relative overflow-hidden bg-gradient-to-br from-[#1e1f20] to-blue-950/20">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Wallet className="w-24 h-24 text-blue-400" />
            </div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Pending Sunday Payout (Razorpay)</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">UNSETTLED</span>
            </div>
            <h2 className="text-3xl font-bold text-white">₹{data.metrics.totalEarned}</h2>
            <p className="text-[10px] text-zinc-400 mt-2">Transferred every Sunday to UPI</p>
          </div>

          {/* 3. Lifetime Settled */}
          <div className="bg-[#1e1f20] border border-white/10 p-5 rounded-2xl">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Lifetime Settled & Paid (Razorpay)</p>
            <h2 className="text-3xl font-bold text-white">₹{data.metrics.totalSettled || 0}</h2>
            <p className="text-[10px] text-zinc-500 mt-2">
              {data.metrics.settlementsCount ? `${data.metrics.settlementsCount} past Sunday payouts` : 'No settlements yet'}
            </p>
          </div>
          
          {/* 4. Owner Personal Printing (Visible ONLY when enabled by Master Admin) */}
          {data.ownerPrintEnabled && (
            <div className="bg-[#1e1f20] border border-purple-500/30 p-5 rounded-2xl flex flex-col justify-between bg-gradient-to-br from-[#1e1f20] to-purple-950/20">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Owner Personal Print</p>
                  <Printer className="w-4 h-4 text-purple-400" />
                </div>
                <h2 className="text-3xl font-bold text-white">
                  {data.freeQuotaUsedThisMonth || 0} <span className="text-base text-zinc-500 font-normal">pages</span>
                </h2>
                <p className="text-[10px] text-zinc-400 mt-1">
                  Personal notes printed this month
                </p>
              </div>
              <button
                onClick={() => {
                  setFreeError(null);
                  setFreeSuccessJobId(null);
                  setFreeFile(null);
                  setShowFreePrintModal(true);
                }}
                className="mt-3 w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-600/30 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-purple-200" />
                <span>Print My Notes</span>
              </button>
            </div>
          )}
        </div>

        {/* Printable Door Standee / QR Poster Quick Action */}
        <div className="bg-[#1e1f20] border border-blue-500/30 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-blue-950/20 via-[#1e1f20] to-indigo-950/20">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Printable Door Standee / QR Poster
                <span className="text-[10px] bg-blue-500/20 text-blue-300 font-semibold px-2 py-0.5 rounded-full border border-blue-500/30">
                  Ready to Print (A4)
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Generate an A4 poster with your station's live QR code (<span className="text-blue-300 font-semibold">Scan to Print - {data.stationName}</span>) to stick outside your hostel room door.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowDoorPoster(true)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Generate Door Poster (A4)</span>
          </button>
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
              Your payout earnings will be transferred automatically to this UPI ID every Sunday:
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
                const settledDate = formatJobTimestamp(s.settled_at);
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
                        {s.total_jobs} prints ({s.total_pages} pages)
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

        {/* In-Person Cash Orders (Placed directly above Live Print Queue in Chronological Order) */}
        {data.pendingCashOrders && data.pendingCashOrders.length > 0 && (
          <div className="bg-[#1e1f20] border border-amber-500/30 rounded-2xl p-5 space-y-4 bg-gradient-to-br from-[#1e1f20] to-amber-950/20 shadow-lg">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <IndianRupee className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    In-Person Cash Orders
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                      {data.pendingCashOrders.length} Waiting Verification
                    </span>
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Students waiting at this room to pay cash. Click Verify & Print to dispatch directly to printer.
                  </p>
                </div>
              </div>
            </div>

            {cashSuccessMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{cashSuccessMsg}</span>
              </div>
            )}

            {cashErrorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cashErrorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.pendingCashOrders.map((order) => (
                <div
                  key={order.id}
                  className="p-3.5 rounded-xl bg-[#131314] border border-white/10 flex items-center justify-between gap-3 hover:border-amber-500/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                        #{order.pickupCode || order.id.slice(0, 8)}
                      </span>
                      <span className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        {formatJobTimestamp(order.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{order.fileName}</span>
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-1">
                      <span className="font-mono text-zinc-300 font-semibold">{order.pages} page{order.pages > 1 ? 's' : ''}</span>
                      <span>•</span>
                      <span className="uppercase text-zinc-400">{order.colorMode === 'color' ? 'Color' : 'B&W'}</span>
                      <span>•</span>
                      <span className="text-amber-400 font-bold font-mono">Collect ₹{order.totalPrice}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {order.fileKey && (
                      <button
                        type="button"
                        onClick={() =>
                          setDocumentPreviewTarget({
                            id: order.id,
                            title: `Cash Order #${order.pickupCode || order.id.slice(0, 8)}`,
                            fileName: order.fileName,
                            fileKey: order.fileKey,
                            pickupCode: order.pickupCode,
                            totalPrice: order.totalPrice,
                            isCashOrder: true,
                          })
                        }
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Preview student document before printing"
                      >
                        <Eye className="w-3.5 h-3.5 text-purple-400" />
                        <span className="hidden sm:inline">Preview</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleVerifyCash(order.id)}
                      disabled={verifyingCashJobId === order.id}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                    >
                      {verifyingCashJobId === order.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Printer className="w-3.5 h-3.5" />
                      )}
                      <span>Verify & Print</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Print Queue & Orders (Read-Only Immutable Audit Log) */}
        <div className="bg-[#1e1f20] border border-white/10 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="font-bold flex items-center gap-2 text-sm text-white">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  Live Print Queue & Orders
                </h3>
                <span className="text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Read-Only Audit Log
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Live feed of all confirmed print jobs. Tamper-proof audit record to prevent discrepancies.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-xs text-zinc-500 font-mono hidden sm:inline">Live last 30 jobs</span>
              <button
                type="button"
                onClick={handleRefreshQueue}
                disabled={refreshingQueue}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                title="Refresh Print Queue and Live Orders"
              >
                <RotateCw className={`w-3.5 h-3.5 text-emerald-400 ${refreshingQueue ? 'animate-spin' : ''}`} />
                <span>{refreshingQueue ? 'Refreshing…' : 'Refresh Queue'}</span>
              </button>
            </div>
          </div>
          
          {data.recentJobs.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No recent print jobs found.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {data.recentJobs.map((job) => {
                const timeString = formatJobTimestamp(job.created_at);
                
                return (
                  <div key={job.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-zinc-200 uppercase font-mono">
                            {job.pickupCode ? `#${job.pickupCode}` : `#${job.id.slice(0, 8)}`}
                          </p>
                          {job.isFreePrint ? (
                            <span className="text-[9px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                              Owner Free Print
                            </span>
                          ) : job.isSettled ? (
                            <span className="text-[9px] px-2 py-0.5 rounded bg-zinc-500/20 text-zinc-300 font-semibold border border-white/10">
                              Settled & Paid
                            </span>
                          ) : (
                            <span className="text-[9px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                              Pending Sunday
                            </span>
                          )}
                          <span className="text-[9px] px-1.5 py-0.5 rounded text-zinc-400 bg-white/5 uppercase font-mono">
                            {job.status}
                          </span>
                        </div>

                        {/* File Name Display in Live Queue */}
                        <p className="text-xs font-bold text-white truncate max-w-[220px] sm:max-w-md mt-1 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="truncate">{job.fileName || 'Document.pdf'}</span>
                        </p>

                        <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5 font-medium">
                          <Clock className="w-3 h-3 text-zinc-500" /> {timeString} • {job.total_pages} {job.total_pages === 1 ? 'Page' : 'Pages'} • {job.color_mode === 'color' ? 'Full Color' : 'B&W'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {job.fileKey && (
                        <button
                          type="button"
                          onClick={() =>
                            setDocumentPreviewTarget({
                              id: job.id,
                              title: `Live Order #${job.id.slice(0, 8)}`,
                              fileName: job.fileName || `Print_${job.id.slice(0, 8)}.pdf`,
                              fileKey: job.fileKey,
                              pickupCode: job.pickupCode,
                              totalPrice: job.total_price,
                              isCashOrder: false,
                            })
                          }
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5 transition-colors cursor-pointer"
                          title="Preview document"
                        >
                          <Eye className="w-3.5 h-3.5 text-purple-400" />
                        </button>
                      )}
                      <div className="text-right">
                        {job.isFreePrint ? (
                          <div>
                            <p className="text-sm font-bold text-purple-400 font-mono">₹0</p>
                            <p className="text-[10px] font-semibold text-purple-300/80">Owner Free Print</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm font-bold text-emerald-400 font-mono">₹{job.total_price}</p>
                            <p className="text-[10px] font-semibold text-emerald-400/90">
                              {job.payment_id?.startsWith('CASH_') ? 'Cash Payment' : 'Razorpay Payment'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer info */}
        <div className="text-center p-4 text-[11px] text-zinc-500 space-y-1">
          <p className="font-semibold text-zinc-400">PrintKurox Partner Network</p>
          <p className="text-zinc-600">Weekly payouts are transferred every Sunday directly to your registered UPI ID.</p>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 1. PRINTABLE DOOR STANDEE / QR POSTER MODAL                               */}
      {/* ========================================================================= */}
      {showDoorPoster && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDoorPoster(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
        >
          {/* Floating High-Visibility Close Button (Stays on screen always) */}
          <button
            onClick={() => setShowDoorPoster(false)}
            className="fixed top-5 right-5 z-[100] px-4 py-2 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-white font-bold text-xs flex items-center gap-2 shadow-2xl border border-white/20 cursor-pointer no-print backdrop-blur-md transition-all hover:scale-105"
            title="Close Poster (Esc)"
          >
            <X className="w-4 h-4 text-rose-400" />
            <span>Close (✕)</span>
          </button>

          {/* Print Isolation Styles */}
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #door-standee-printable, #door-standee-printable * {
                visibility: visible !important;
              }
              #door-standee-printable {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                margin: 0 !important;
                padding: 10mm 15mm !important;
                background: white !important;
                color: black !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                z-index: 999999 !important;
                box-sizing: border-box !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>

          <div className="bg-[#1e1f20] border border-white/10 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative my-8">
            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#18191a] no-print">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm text-white">Door Standee & QR Poster</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print (A4)</span>
                </button>
                <button
                  onClick={() => setShowDoorPoster(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-white/10"
                  title="Close Poster (Esc)"
                >
                  <X className="w-3.5 h-3.5 text-rose-400" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Poster Sheet (Ready for physical A4 print or phone viewing) */}
            <div 
              id="door-standee-printable"
              className="p-6 sm:p-8 bg-white text-zinc-900 flex flex-col items-center text-center space-y-5"
            >
              {/* Brand Banner */}
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-black tracking-widest uppercase border border-blue-200">
                  ⚡ Autonomous Campus Kiosk
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-black tracking-tight mt-2">
                  PRINTKUROX
                </h1>
                <p className="text-xs font-semibold text-zinc-500 tracking-wider uppercase">
                  Self-Service Document Printing
                </p>
              </div>

              {/* Station Identity Badge */}
              <div className="w-full bg-gradient-to-r from-blue-700 to-indigo-700 text-white py-3.5 px-4 rounded-2xl shadow-md">
                <p className="text-[11px] font-black uppercase tracking-widest text-blue-200">Hostel Print Station</p>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
                  Scan to Print — {data.stationName}
                </h2>
              </div>

              {/* High-Resolution QR Code */}
              <div className="bg-white p-4 rounded-2xl border-4 border-dashed border-blue-500/40 shadow-sm flex flex-col items-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=450x450&margin=10&data=${encodeURIComponent(
                    typeof window !== 'undefined' ? `${window.location.origin}/?station=${stationId}` : `https://printkurox.vercel.app/?station=${stationId}`
                  )}`}
                  alt="Station QR Code"
                  className="w-60 h-60 sm:w-72 sm:h-72 object-contain rounded-lg"
                />
                <p className="text-xs font-black text-blue-700 tracking-wider uppercase mt-2.5">
                  📲 Scan with Phone Camera to Print Directly
                </p>
              </div>

              {/* 3 Steps */}
              <div className="grid grid-cols-3 gap-2 w-full text-left pt-2 border-t border-zinc-200">
                <div className="p-2 bg-zinc-50 rounded-lg border border-zinc-200">
                  <span className="text-[10px] font-black text-blue-600 block">STEP 1</span>
                  <p className="text-[11px] font-bold text-zinc-900">Scan QR Code</p>
                  <p className="text-[9px] text-zinc-500 mt-0.5">Use camera or browser (no app needed)</p>
                </div>
                <div className="p-2 bg-zinc-50 rounded-lg border border-zinc-200">
                  <span className="text-[10px] font-black text-blue-600 block">STEP 2</span>
                  <p className="text-[11px] font-bold text-zinc-900">Upload Notes</p>
                  <p className="text-[9px] text-zinc-500 mt-0.5">PDF, Word, or Photos</p>
                </div>
                <div className="p-2 bg-zinc-50 rounded-lg border border-zinc-200">
                  <span className="text-[10px] font-black text-blue-600 block">STEP 3</span>
                  <p className="text-[11px] font-bold text-zinc-900">Instant Pickup</p>
                  <p className="text-[9px] text-zinc-500 mt-0.5">Collect prints immediately</p>
                </div>
              </div>

              {/* Pricing & Guarantee */}
              <div className="w-full flex items-center justify-between bg-zinc-100 p-3 rounded-xl border border-zinc-200 text-xs">
                <div>
                  <span className="text-zinc-500 text-[10px] block font-semibold">STATION RATES</span>
                  <span className="font-bold text-zinc-900">B&W: ₹{bwPrice}/page • Color: ₹{colorPrice}/page</span>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                    100% Private & Laser Sharp
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Bottom Bar */}
            <div className="p-4 bg-[#18191a] border-t border-white/10 flex items-center justify-between no-print gap-3">
              <p className="text-xs text-zinc-400">
                Tape this flyer outside your room door so hostel students can scan & print.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowDoorPoster(false)}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-blue-600/30"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Poster (A4)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. OWNER FREE PRINT QUOTA MODAL                                          */}
      {/* ========================================================================= */}
      {showFreePrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#1e1f20] border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative max-h-[92vh] overflow-y-auto my-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Gift className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Owner Personal Print</h3>
                  <p className="text-[11px] text-purple-300 font-medium">
                    Print personal notes directly to your station printer
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFreePrintModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Success State */}
            {freeSuccessJobId ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">Print Job Dispatched!</h4>
                  <p className="text-xs text-zinc-400 mt-1">
                    Your notes are printing directly on your connected printer now.
                  </p>
                  <p className="text-xs font-mono text-emerald-400 font-semibold mt-2">
                    Pickup Code: {freePickupCode}
                  </p>
                </div>
                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => {
                      setFreeFile(null);
                      setFreeSuccessJobId(null);
                      setFreeError(null);
                    }}
                    className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Print Another Note
                  </button>
                  <button
                    onClick={() => setShowFreePrintModal(false)}
                    className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Upload & Print Form */
              <div className="space-y-4">
                {freeError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{freeError}</span>
                  </div>
                )}

                {/* File Dropzone */}
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase block mb-1.5">
                    Select Study Notes / Document
                  </label>
                  <div className="relative border-2 border-dashed border-white/15 hover:border-purple-500/50 rounded-xl p-5 text-center transition-colors bg-[#131314] cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
                      onChange={handleFreeFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <UploadCloud className="w-8 h-8 text-purple-400 mx-auto mb-2 opacity-80" />
                    {freeFile ? (
                      <div>
                        <p className="text-xs font-bold text-white truncate max-w-[280px] mx-auto">{freeFile.name}</p>
                        <p className="text-[10px] text-emerald-400 mt-0.5">
                          Detected {freeDocPages} page{freeDocPages > 1 ? 's' : ''} • {(freeFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-semibold text-zinc-300">Click or drop notes here</p>
                        <p className="text-[10px] text-zinc-500 mt-1">Supports PDF, Word (.docx), or Images</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Print Options (Single-Sided Only) */}
                {freeFile && (() => {
                  const effectiveSelectedPages = (() => {
                    if (!freePageRange || freePageRange.trim() === '' || freePageRange.toLowerCase() === 'all') {
                      return Array.from({ length: freeDocPages }, (_, i) => i + 1);
                    }
                    const parsed = parsePageRange(freePageRange, freeDocPages);
                    return parsed.length > 0 ? parsed : Array.from({ length: freeDocPages }, (_, i) => i + 1);
                  })();
                  const totalSheetsToPrint = effectiveSelectedPages.length * freeCopies;

                  return (
                    <div className="space-y-4 pt-3 border-t border-white/10">
                      {/* Print Mode (Locked Single-Sided) */}
                      <div className="flex items-center justify-between text-xs bg-[#131314] px-3.5 py-2.5 rounded-xl border border-white/10">
                        <span className="text-zinc-400 font-medium">Print Mode:</span>
                        <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-emerald-400" />
                          Single-Sided Only (Standard A4)
                        </span>
                      </div>

                      {/* Color Mode Selection (Segmented Control) */}
                      <div>
                        <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-purple-400" />
                          Color Mode
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFreeColorMode('bw')}
                            className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              freeColorMode === 'bw'
                                ? 'bg-purple-600/20 border-purple-500 text-white shadow-sm shadow-purple-500/20'
                                : 'bg-[#131314] border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
                            }`}
                          >
                            <span className="w-3 h-3 rounded-full bg-zinc-400 inline-block" />
                            <span>Black & White</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFreeColorMode('color')}
                            className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              freeColorMode === 'color'
                                ? 'bg-gradient-to-r from-pink-600/30 to-purple-600/30 border-pink-500 text-white shadow-sm shadow-pink-500/20'
                                : 'bg-[#131314] border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                            <span>Full Color</span>
                          </button>
                        </div>
                      </div>

                      {/* Document Number Selection (Page Range & Quick Presets) */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                            <ListFilter className="w-3.5 h-3.5 text-purple-400" />
                            Document Page Selection
                          </label>
                          <span className="text-[11px] font-mono text-purple-300 font-semibold">
                            {effectiveSelectedPages.length} of {freeDocPages} pgs selected
                          </span>
                        </div>

                        {/* Presets: All, Odd, Even, Custom */}
                        <div className="grid grid-cols-4 gap-1.5">
                          <button
                            type="button"
                            onClick={applyFreePresetAll}
                            className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                              freePageRangeType === 'all'
                                ? 'bg-purple-600 text-white border-purple-500'
                                : 'bg-[#131314] border-white/10 text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            All ({freeDocPages})
                          </button>
                          <button
                            type="button"
                            onClick={applyFreePresetOdd}
                            className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                              freePageRangeType === 'odd'
                                ? 'bg-purple-600 text-white border-purple-500'
                                : 'bg-[#131314] border-white/10 text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            Odd Pages
                          </button>
                          <button
                            type="button"
                            onClick={applyFreePresetEven}
                            className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                              freePageRangeType === 'even'
                                ? 'bg-purple-600 text-white border-purple-500'
                                : 'bg-[#131314] border-white/10 text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            Even Pages
                          </button>
                          <button
                            type="button"
                            onClick={() => setFreePageRangeType('custom')}
                            className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                              freePageRangeType === 'custom'
                                ? 'bg-purple-600 text-white border-purple-500'
                                : 'bg-[#131314] border-white/10 text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            Custom
                          </button>
                        </div>

                        {/* Interactive Page Chips (Clickable numbers) */}
                        {freeDocPages > 1 && (
                          <div className="p-2.5 rounded-xl bg-[#131314] border border-white/10 space-y-1.5">
                            <p className="text-[10px] text-zinc-400 font-medium">Click page numbers to toggle:</p>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                              {Array.from({ length: Math.min(freeDocPages, 40) }, (_, i) => i + 1).map((pg) => {
                                const isIncluded = effectiveSelectedPages.includes(pg);
                                return (
                                  <button
                                    key={pg}
                                    type="button"
                                    onClick={() => toggleFreePage(pg)}
                                    className={`w-7 h-7 text-xs font-mono font-semibold rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                                      isIncluded
                                        ? 'bg-purple-600 border-purple-400 text-white shadow-xs'
                                        : 'bg-white/5 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                                    }`}
                                  >
                                    {pg}
                                  </button>
                                );
                              })}
                              {freeDocPages > 40 && (
                                <span className="text-[10px] text-zinc-500 self-center pl-1 font-mono">
                                  +{freeDocPages - 40} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Custom Input Field */}
                        <div className="relative">
                          <input
                            type="text"
                            value={freePageRange}
                            onChange={(e) => {
                              setFreePageRange(e.target.value);
                              setFreePageRangeType('custom');
                            }}
                            placeholder="All (or e.g. 1-3, 5)"
                            className="w-full px-3 py-2 rounded-xl bg-[#131314] border border-white/10 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                          />
                        </div>
                      </div>

                      {/* Multiple Copies (Sets) with Stepper */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-purple-400" />
                            Multiple Copies (Sets)
                          </label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 5].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setFreeCopies(preset)}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer ${
                                  freeCopies === preset
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-white/5 text-zinc-400 hover:text-white'
                                }`}
                              >
                                {preset}x
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setFreeCopies((c) => Math.max(1, c - 1))}
                            className="w-10 h-10 rounded-xl bg-[#131314] border border-white/10 hover:border-white/20 text-white flex items-center justify-center font-bold transition-colors cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={freeCopies}
                            onChange={(e) => setFreeCopies(Math.max(1, parseInt(e.target.value) || 1))}
                            className="flex-1 h-10 px-3 text-center rounded-xl bg-[#131314] border border-white/10 text-sm text-white font-mono font-bold focus:outline-none focus:border-purple-500"
                          />
                          <button
                            type="button"
                            onClick={() => setFreeCopies((c) => Math.min(50, c + 1))}
                            className="w-10 h-10 rounded-xl bg-[#131314] border border-white/10 hover:border-white/20 text-white flex items-center justify-center font-bold transition-colors cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Preview Option Toggle */}
                      <div className="pt-1 space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowOwnerFullPreview(true)}
                          disabled={freeThumbnails.length === 0}
                          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-blue-600/20 hover:from-blue-600/30 hover:to-purple-600/30 border border-blue-500/30 text-xs font-semibold text-white flex items-center justify-between transition-all cursor-pointer shadow-md disabled:opacity-40"
                        >
                          <span className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-blue-400" />
                            <span className="font-bold">Open Full Document Print Preview</span>
                          </span>
                          <span className="text-[10px] text-blue-300 font-mono bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-500/30">
                            {freeDocPages} {freeDocPages === 1 ? 'page' : 'pages'} • Full View
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFreeShowPreview(!freeShowPreview)}
                          className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            {freeShowPreview ? <EyeOff className="w-3.5 h-3.5 text-purple-400" /> : <Layers className="w-3.5 h-3.5 text-purple-400" />}
                            <span>{freeShowPreview ? 'Hide Page Selection Grid' : 'Show Page Selection Grid'}</span>
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {effectiveSelectedPages.length} pgs • {totalSheetsToPrint} sheets
                          </span>
                        </button>

                        {freeShowPreview && (
                          <div className="mt-2 p-3 rounded-xl bg-[#131314] border border-white/10 space-y-3 text-xs">
                            <div className="flex items-center justify-between text-zinc-400">
                              <span>Document Name:</span>
                              <span className="font-semibold text-white truncate max-w-[200px]">{freeFile.name}</span>
                            </div>
                            <div className="flex items-center justify-between text-zinc-400">
                              <span>Pages to Print:</span>
                              <span className="font-mono font-semibold text-purple-300">
                                {pagesToRangeString(effectiveSelectedPages)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-zinc-400">
                              <span>Color Mode:</span>
                              <span className="font-semibold text-white uppercase">{freeColorMode === 'bw' ? 'Black & White' : 'Full Color'}</span>
                            </div>
                            <div className="flex items-center justify-between text-zinc-400">
                              <span>Print Mode:</span>
                              <span className="font-semibold text-emerald-400">Single-Sided (Standard A4)</span>
                            </div>

                            {/* Authentic Visual Document Pages Grid */}
                            <div className="pt-2 border-t border-white/10">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                                  <span>Visual Page Selector</span>
                                </span>
                                <span className="text-[10px] text-zinc-500">
                                  Click any page to toggle
                                </span>
                              </div>

                              {generatingThumbnails ? (
                                <div className="py-6 flex flex-col items-center justify-center gap-2 text-zinc-400">
                                  <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                                  <span className="text-[11px]">Rendering document page previews...</span>
                                </div>
                              ) : freeThumbnails.length > 0 ? (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                                  {freeThumbnails.map((thumbUrl, idx) => {
                                    const pageNum = idx + 1;
                                    const isIncluded = effectiveSelectedPages.includes(pageNum);
                                    return (
                                      <div
                                        key={pageNum}
                                        onClick={() => toggleFreePage(pageNum)}
                                        className={`group relative rounded-lg overflow-hidden border cursor-pointer transition-all duration-150 flex flex-col ${
                                          isIncluded
                                            ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-950/20'
                                            : 'border-white/10 opacity-40 hover:opacity-75 bg-zinc-900/60'
                                        }`}
                                      >
                                        {/* Page number badge */}
                                        <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[9px] font-mono font-bold text-white">
                                          P{pageNum}
                                        </div>
                                        {/* Selection check */}
                                        <div className={`absolute top-1 right-1 z-10 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                                          isIncluded ? 'bg-purple-600 text-white' : 'bg-black/60 text-zinc-400'
                                        }`}>
                                          {isIncluded ? '✓' : '✕'}
                                        </div>
                                        {/* Thumbnail image with grayscale filter if bw */}
                                        <div className="aspect-[1/1.414] bg-white flex items-center justify-center overflow-hidden">
                                          <img
                                            src={thumbUrl}
                                            alt={`Page ${pageNum}`}
                                            className={`w-full h-full object-contain ${
                                              freeColorMode === 'bw' ? 'grayscale contrast-110' : ''
                                            }`}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="py-4 text-center text-xs text-zinc-500 bg-white/5 rounded-lg border border-white/5">
                                  Document preview available for PDF and image files.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Print Summary Card */}
                      <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 flex items-center justify-between text-xs">
                        <div>
                          <p className="text-[11px] text-purple-300 font-semibold">Total Sheets to Print:</p>
                          <p className="text-white font-mono font-bold text-sm mt-0.5">
                            {totalSheetsToPrint} {totalSheetsToPrint === 1 ? 'sheet' : 'sheets'} ({effectiveSelectedPages.length} pgs × {freeCopies} {freeCopies === 1 ? 'copy' : 'copies'})
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-purple-400 font-mono">₹0</p>
                          <p className="text-[10px] font-semibold text-purple-300/80">Owner Free Print</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Submit Button */}
                {freeUploading ? (
                  <div className="w-full p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 space-y-2">
                    <div className="flex items-center justify-between text-xs text-purple-300">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                        <span>Sending document to printer spooler…</span>
                      </span>
                      <span className="text-[10px] font-mono text-purple-400">Dispatching</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                      <div className="animate-shimmer-bar h-1.5 w-full rounded-full" />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleDispatchFreePrint}
                    disabled={!freeFile}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg shadow-purple-600/30"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Dispatch Print to Printer</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document Live Preview Modal for Cash Orders & Live Print Queue */}
      {documentPreviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#18181b] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3 bg-[#131314]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-purple-950/60 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-purple-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">
                    {documentPreviewTarget.title || documentPreviewTarget.fileName}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                    {documentPreviewTarget.pickupCode && (
                      <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-zinc-300">
                        Code: {documentPreviewTarget.pickupCode}
                      </span>
                    )}
                    {documentPreviewTarget.totalPrice !== undefined && (
                      <span className="font-mono font-bold text-emerald-400">
                        ₹{documentPreviewTarget.totalPrice}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {documentPreviewTarget.fileKey && (
                  <a
                    href={`/api/view-file?key=${encodeURIComponent(documentPreviewTarget.fileKey)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1.5 px-2.5"
                    title="Open Fullscreen in New Tab"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Open Full</span>
                  </a>
                )}
                <button
                  onClick={() => setDocumentPreviewTarget(null)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Document Viewer Stream Body */}
            <div className="flex-1 min-h-[380px] bg-zinc-950 relative flex items-center justify-center p-2">
              {documentPreviewTarget.fileKey ? (
                <iframe
                  src={`/api/view-file?key=${encodeURIComponent(documentPreviewTarget.fileKey)}#toolbar=0&navpanes=0`}
                  className="w-full h-full min-h-[380px] rounded-lg border border-white/5 bg-zinc-900"
                  title="Document Preview"
                />
              ) : (
                <div className="text-center p-8 text-zinc-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 text-zinc-600" />
                  <p className="text-sm font-medium text-white">{documentPreviewTarget.fileName}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Direct visual preview link is not available for this legacy record.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 border-t border-white/10 bg-[#131314] flex items-center justify-between gap-3">
              <span className="text-[11px] text-zinc-500">
                Station Document Inspector
              </span>
              <div className="flex items-center gap-2">
                {documentPreviewTarget.isCashOrder && (
                  <button
                    onClick={() => {
                      const id = documentPreviewTarget.id;
                      setDocumentPreviewTarget(null);
                      handleVerifyCash(id);
                    }}
                    disabled={verifyingCashJobId === documentPreviewTarget.id}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-emerald-600/30"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Verify Cash & Print (₹{documentPreviewTarget.totalPrice})</span>
                  </button>
                )}
                <button
                  onClick={() => setDocumentPreviewTarget(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Document Print Preview Modal (matching Image 5 / website studio) */}
      {showOwnerFullPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#18181b] border border-white/10 rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between gap-3 bg-[#131314]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Print Preview
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {freeDocPages} {freeDocPages === 1 ? 'page' : 'pages'} • {freeColorMode === 'bw' ? 'Black & White' : 'Full Color'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowOwnerFullPreview(false);
                  setOwnerEnlargedPage(null);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close Preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Continuous Vertical Scrolling Canvas Feed */}
            <div className="flex-1 overflow-y-auto max-h-[70vh] p-3 sm:p-5 space-y-6 scrollbar-thin bg-zinc-100/75 dark:bg-[#0c0d10] rounded-2xl border border-zinc-200/80 dark:border-zinc-800 m-2">
              {freeThumbnails.map((thumbUrl, idx) => {
                const pageNum = idx + 1;
                const isEnlarged = ownerEnlargedPage === pageNum;

                return (
                  <div key={pageNum} className="flex flex-col items-center gap-2 transition-all">
                    {/* Page Paper Card */}
                    <div
                      className="relative w-full max-w-[440px] bg-white rounded-lg shadow-md shadow-black/15 border border-zinc-300 dark:border-zinc-700/80 transition-all duration-200 overflow-hidden aspect-[210/297]"
                    >
                      {/* Safe Print Margin guide */}
                      <div className="absolute inset-2 sm:inset-3 border border-dashed border-zinc-200/90 pointer-events-none z-10" />

                      {/* Floating Zoom toggle */}
                      <button
                        type="button"
                        onClick={() => setOwnerEnlargedPage(isEnlarged ? null : pageNum)}
                        className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full bg-zinc-900/80 hover:bg-zinc-900 text-white backdrop-blur-sm flex items-center justify-center shadow-md transition-all active:scale-95 cursor-pointer"
                        title={isEnlarged ? 'Reset zoom' : 'Enlarge page to read text'}
                      >
                        {isEnlarged ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                      </button>

                      {/* Content Area */}
                      <div className="w-full h-full p-2.5 sm:p-3.5 flex items-center justify-center overflow-hidden">
                        <div
                          className="w-full h-full flex items-center justify-center transition-transform duration-200"
                          style={{
                            transform: `scale(${isEnlarged ? 1.65 : 1.0})`,
                            transformOrigin: 'center center',
                          }}
                        >
                          <img
                            src={thumbUrl}
                            alt={`Page ${pageNum}`}
                            style={{
                              imageRendering: '-webkit-optimize-contrast',
                              filter: freeColorMode === 'bw' ? 'grayscale(100%) contrast(125%) brightness(96%)' : 'none',
                            }}
                            className="object-contain max-h-full max-w-full select-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Page Caption matching DoPrint & Image 5 */}
                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                      <span>Page {pageNum} of {freeDocPages}</span>
                      <span>·</span>
                      <span className={freeColorMode === 'color' ? 'text-amber-500 font-semibold' : ''}>
                        {freeColorMode === 'color' ? 'Color' : 'B&W'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer: Full-Width Blue Close Button matching Image 5 */}
            <div className="p-4 border-t border-white/10 bg-[#131314] shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowOwnerFullPreview(false);
                  setOwnerEnlargedPage(null);
                }}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl text-sm shadow-md shadow-blue-600/25 transition-all cursor-pointer flex items-center justify-center"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
