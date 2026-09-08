'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileUpload, UploadedBatchData } from '@/components/FileUpload';
import { PrintSettings, PrintSettingsState } from '@/components/PrintSettings';
import { PageRangeSelector } from '@/components/PageRangeSelector';
import { CostSummary } from '@/components/CostSummary';
import { PageVisualizer } from '@/components/PageVisualizer';
import { AdvancedSettings, AdvancedPrintOptions } from '@/components/AdvancedSettings';
import { calculatePricing, PageConfig } from '@/lib/pricing';
import { pagesToRangeString } from '@/lib/pdf-utils';
import {
  SlidersHorizontal,
  Sparkles,
  MapPin,
  HelpCircle,
  Zap,
  Shield,
  Crown,
  ChevronRight,
} from 'lucide-react';

// Step indicator used throughout the page
function StepBadge({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider px-1">
      <span className="step-badge w-5 h-5 rounded-full text-white flex items-center justify-center text-[11px] font-black shadow-md shrink-0">
        {n}
      </span>
      <span>{label}</span>
    </div>
  );
}

export default function HomePage() {
  const [uploadedBatch, setUploadedBatch] = useState<UploadedBatchData | null>(null);
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>([]);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [settings, setSettings] = useState<PrintSettingsState>({
    colorMode: 'bw',
    isDuplex: false,
    copies: 1,
    pageRangeType: 'all',
    customPageRange: 'All',
  });
  const [advancedOptions, setAdvancedOptions] = useState<AdvancedPrintOptions>({
    scaling: 'fit',
    quality: 'standard',
    margins: 'standard',
    collate: true,
  });
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/auth')
      .then((r) => r.json())
      .then((d) => {
        if (d.isAdmin) {
          setIsAdmin(true);
          const name = d.deviceName || d.device?.device_name;
          if (name) setDeviceName(name);
        }
      })
      .catch(() => {});
  }, []);

  const handleBatchUploaded = (data: UploadedBatchData | null) => {
    setUploadedBatch(data);
    if (data) {
      const initial: PageConfig[] = Array.from({ length: data.totalPages }, (_, i) => ({
        pageNumber: i + 1,
        colorMode: settings.colorMode === 'color' ? 'color' : 'bw',
        included: true,
        orientation,
      }));
      setPageConfigs(initial);
    } else {
      setPageConfigs([]);
    }
  };

  const handlePageConfigsChange = (updated: PageConfig[]) => {
    setPageConfigs(updated);
    const included = updated.filter((p) => p.included);
    if (included.length > 0) {
      const allColor = included.every((p) => p.colorMode === 'color');
      const allBw = included.every((p) => p.colorMode === 'bw');
      const isAll = included.length === updated.length;
      const includedNumbers = included.map((p) => p.pageNumber);
      const rangeStr = isAll ? 'All' : pagesToRangeString(includedNumbers);
      setSettings((prev) => ({
        ...prev,
        colorMode: allColor ? 'color' : allBw ? 'bw' : 'custom',
        pageRangeType: isAll ? 'all' : 'custom',
        customPageRange: rangeStr,
      }));
    }
  };

  const handleSettingsChange = (newSettings: PrintSettingsState) => {
    if (newSettings.colorMode !== settings.colorMode && newSettings.colorMode !== 'custom') {
      const updated = pageConfigs.map((p) => ({ ...p, colorMode: newSettings.colorMode as 'bw' | 'color' }));
      setPageConfigs(updated);
    }
    setSettings(newSettings);
  };

  const handleRangeChange = (type: 'all' | 'custom', rangeStr: string) => {
    setSettings((prev) => ({
      ...prev,
      pageRangeType: type,
      customPageRange: rangeStr,
    }));
  };

  const pricing = calculatePricing({
    totalPages: uploadedBatch?.totalPages || 1,
    colorMode: settings.colorMode,
    isDuplex: settings.isDuplex,
    copies: settings.copies,
    pageConfigs: pageConfigs.length > 0 ? pageConfigs : undefined,
  });

  const bwCount = pageConfigs.filter((p) => p.included && p.colorMode === 'bw').length;
  const colorCount = pageConfigs.filter((p) => p.included && p.colorMode === 'color').length;

  return (
    <div className="space-y-5 pb-12">
      {/* Pickup Banner */}
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-indigo-50/90 border border-indigo-200/80 text-xs text-indigo-700 dark:bg-indigo-500/8 dark:border-indigo-500/18 dark:text-indigo-300 animate-fade-in-up">
        <div className="flex items-center space-x-2">
          <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>
            Pickup:{' '}
            <strong className="text-slate-900 dark:text-white font-semibold">Block B, Room 29</strong>
          </span>
        </div>
        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-500/20">
          Kiosk Active
        </span>
      </div>

      {/* Admin Banner */}
      {isAdmin && (
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/12 via-orange-500/8 to-amber-500/12 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200 shadow-md shadow-amber-500/5 animate-scale-in">
          <div className="flex items-center space-x-2">
            <Crown className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
            <span>
              <strong className="text-slate-900 dark:text-white">Admin Verified:</strong>{' '}
              {deviceName || 'Authorized Device'} · Free Print Active
            </span>
          </div>
          <Link
            href="/adminkurox"
            className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider bg-amber-100 dark:bg-amber-500/15 hover:bg-amber-200 dark:hover:bg-amber-500/25 px-2 py-0.5 rounded-lg border border-amber-300 dark:border-amber-500/30 transition-colors"
          >
            Console <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Hero Section */}
      <div className="text-center pt-1 pb-2 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 dark:bg-indigo-500/8 dark:border-indigo-500/18 dark:text-indigo-300 text-[11px] font-bold mb-3 shadow-sm">
          <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
          <span className="uppercase tracking-widest">Smart Self-Service Printing</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
          Upload, Customize{' '}
          <span className="gradient-text-primary">&amp; Print</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
          Preview pages · Pick B&amp;W or Color per page · Pay via UPI · Pickup at Block B Room 29
        </p>

        {/* Pricing Pills */}
        <div className="mt-4 flex justify-center gap-2.5">
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-white/8 shadow-sm dark:shadow-md">
            <span className="w-3 h-3 rounded-full bg-slate-400 dark:bg-slate-300 ring-2 ring-slate-300 dark:ring-slate-400/30 shrink-0" />
            <div className="text-left">
              <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Black &amp; White</div>
              <div className="text-[10px] text-slate-500">₹4/pg · ₹6 double-sided</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-pink-50 to-purple-50/60 dark:from-pink-950/50 dark:to-slate-900/80 border border-pink-200 dark:border-pink-500/25 shadow-sm dark:shadow-md">
            <span className="w-3 h-3 rounded-full bg-gradient-to-tr from-pink-500 to-violet-500 ring-2 ring-pink-400/30 shrink-0" />
            <div className="text-left">
              <div className="text-[11px] font-bold text-pink-900 dark:text-pink-200">Full Color</div>
              <div className="text-[10px] text-pink-700/80 dark:text-pink-300/70">₹7/pg · ₹10 double-sided</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 1: Upload ── */}
      <section
        className="space-y-2.5 animate-fade-in-up"
        style={{ animationDelay: '100ms' }}
      >
        <div className="flex items-center justify-between px-1">
          <StepBadge n={1} label="Upload Document(s)" />
          <button
            onClick={() => setShowRatesModal(!showRatesModal)}
            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 font-bold transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Rate Card</span>
          </button>
        </div>

        <FileUpload uploadedBatch={uploadedBatch} onBatchUploaded={handleBatchUploaded} />

        {showRatesModal && (
          <div className="card-premium rounded-2xl p-4 border border-indigo-500/25 text-xs space-y-2 animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/5 font-bold text-slate-900 dark:text-white">
              <span>Official Kiosk Rate Card</span>
              <button
                onClick={() => setShowRatesModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200 dark:border-white/5">
                <p className="font-bold text-slate-800 dark:text-slate-200 mb-1.5">Black &amp; White</p>
                <p className="text-slate-600 dark:text-slate-400">• Single-Sided: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">₹4 / sheet</span></p>
                <p className="text-slate-600 dark:text-slate-400">• Double-Sided: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">₹6 / sheet</span></p>
              </div>
              <div className="p-3 rounded-xl bg-pink-50/70 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-500/15">
                <p className="font-bold text-pink-900 dark:text-pink-200 mb-1.5">Color</p>
                <p className="text-slate-600 dark:text-slate-400">• Single-Sided: <span className="text-pink-600 dark:text-pink-400 font-semibold">₹7 / sheet</span></p>
                <p className="text-slate-600 dark:text-slate-400">• Double-Sided: <span className="text-pink-600 dark:text-pink-400 font-semibold">₹10 / sheet</span></p>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 text-center">
              * Hybrid mix: pay B&amp;W rate for text pages, Color only for photo pages.
            </p>
          </div>
        )}
      </section>

      {/* ── POST-UPLOAD SECTIONS ── */}
      {uploadedBatch && (
        <>
          {/* ── STEP 2: Page Inspector ── */}
          <section className="space-y-2.5 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            <div className="px-1">
              <StepBadge n={2} label="Live Page Inspector" />
            </div>

            <PageVisualizer
              totalPages={uploadedBatch.totalPages}
              downloadUrl={uploadedBatch.downloadUrl}
              fileKey={uploadedBatch.fileKey}
              rawFiles={uploadedBatch.rawFiles}
              pageConfigs={pageConfigs}
              onChange={handlePageConfigsChange}
              orientation={orientation}
              onOrientationChange={(orient) => setOrientation(orient)}
            />
          </section>

          {/* ── STEP 3: Pages to Print (directly below inspector) ── */}
          <section className="space-y-2.5 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <div className="px-1">
              <StepBadge n={3} label="Select Pages to Print" />
            </div>

            <PageRangeSelector
              totalPages={uploadedBatch.totalPages}
              pageConfigs={pageConfigs}
              onPageConfigsChange={handlePageConfigsChange}
              pageRangeType={settings.pageRangeType}
              customPageRange={settings.customPageRange}
              onRangeChange={handleRangeChange}
            />
          </section>

          {/* ── STEP 4: Print Preferences ── */}
          <section className="space-y-2.5 animate-fade-in-up" style={{ animationDelay: '250ms' }}>
            <div className="flex items-center gap-2 px-1 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Print Preferences</span>
            </div>

            <PrintSettings
              totalPages={uploadedBatch.totalPages}
              settings={settings}
              onChange={handleSettingsChange}
              bwCount={bwCount}
              colorCount={colorCount}
              pageConfigs={pageConfigs}
              onPageConfigsChange={handlePageConfigsChange}
            />

            <AdvancedSettings
              options={advancedOptions}
              onChange={(opts) => setAdvancedOptions(opts)}
              copies={settings.copies}
            />
          </section>

          {/* ── STEP 5: Checkout ── */}
          <section className="space-y-2.5 pt-1 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <div className="flex items-center gap-2 px-1">
              <StepBadge n={5} label="Checkout &amp; Pay" />
            </div>

            <CostSummary
              pricing={pricing}
              fileKey={uploadedBatch.fileKey}
              fileName={uploadedBatch.fileName}
              totalPages={uploadedBatch.totalPages}
              pageRange={settings.pageRangeType === 'all' ? 'All' : settings.customPageRange}
              pageConfigs={pageConfigs}
            />
          </section>
        </>
      )}

      {/* ── Empty State Feature Teasers ── */}
      {!uploadedBatch && (
        <div className="grid grid-cols-2 gap-3 pt-2 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
          <div className="card-premium rounded-2xl p-4 flex items-start space-x-3 border border-slate-200/80 dark:border-white/6 glass-card-hover cursor-default">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
              <Zap className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">Hybrid Color</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Pay B&amp;W rate for text, Color only for photo pages.
              </p>
            </div>
          </div>

          <div className="card-premium rounded-2xl p-4 flex items-start space-x-3 border border-slate-200/80 dark:border-white/6 glass-card-hover cursor-default">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
              <Shield className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">Auto 15-Min Purge</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Zero data retention. Completely private.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
