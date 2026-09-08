'use client';

import React, { useState } from 'react';
import { FileUpload, UploadedBatchData } from '@/components/FileUpload';
import { PrintSettings, PrintSettingsState } from '@/components/PrintSettings';
import { PageVisualizer } from '@/components/PageVisualizer';
import { CostSummary } from '@/components/CostSummary';
import { calculatePricing, PageConfig } from '@/lib/pricing';
import { parsePageRange } from '@/lib/pdf-utils';
import { Sparkles, Shield, Zap, HelpCircle, SlidersHorizontal, MapPin } from 'lucide-react';

export default function Home() {
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
  const [showRatesModal, setShowRatesModal] = useState(false);

  // Handle new uploaded batch
  const handleBatchUploaded = (data: UploadedBatchData | null) => {
    setUploadedBatch(data);
    if (data) {
      const initialConfigs: PageConfig[] = Array.from({ length: data.totalPages }, (_, i) => ({
        pageNumber: i + 1,
        colorMode: settings.colorMode === 'color' ? 'color' : 'bw',
        included: true,
      }));
      setPageConfigs(initialConfigs);
    } else {
      setPageConfigs([]);
    }
  };

  // Synchronize settings color mode if user changes it at global level
  const handleSettingsChange = (newSettings: PrintSettingsState) => {
    if (newSettings.colorMode !== settings.colorMode) {
      const updated = pageConfigs.map((p) => ({
        ...p,
        colorMode: newSettings.colorMode,
      }));
      setPageConfigs(updated);
    }
    setSettings(newSettings);
  };

  // Real-time hybrid pricing
  const pricing = calculatePricing({
    totalPages: uploadedBatch?.totalPages || 1,
    colorMode: settings.colorMode,
    isDuplex: settings.isDuplex,
    copies: settings.copies,
    pageConfigs: pageConfigs.length > 0 ? pageConfigs : undefined,
  });

  return (
    <div className="space-y-5 pb-10">
      {/* Pickup Location Reminder Banner */}
      <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
        <div className="flex items-center space-x-2">
          <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Pickup Location: <strong className="text-white">Block B, Room 29</strong></span>
        </div>
        <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          Kiosk Active
        </span>
      </div>

      {/* Kiosk Hero Headline */}
      <div className="text-center pt-1 pb-1">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-2 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Smart Self-Service Printing</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Upload, Customize & Print
        </h2>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Preview pages, select custom Color or B&W per page, pay via UPI, and pick up from Block B Room 29.
        </p>
      </div>

      {/* Step 1: Upload Box */}
      <section className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300 uppercase tracking-wider px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold">1</span>
            Upload Document(s)
          </span>
          <button
            onClick={() => setShowRatesModal(!showRatesModal)}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 normal-case"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Rate Card</span>
          </button>
        </div>

        <FileUpload
          uploadedBatch={uploadedBatch}
          onBatchUploaded={handleBatchUploaded}
        />
      </section>

      {/* Rate Card Accordion/Popup */}
      {showRatesModal && (
        <div className="glass-card rounded-2xl p-4 border-indigo-500/30 text-xs space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-1 border-b border-white/5 font-semibold text-white">
            <span>Official Kiosk Rate Card</span>
            <button
              onClick={() => setShowRatesModal(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
              <p className="font-bold text-slate-200 mb-1">Black & White</p>
              <p className="text-slate-400">• Single-Sided: <span className="text-emerald-400 font-semibold">₹4 / sheet</span></p>
              <p className="text-slate-400">• Double-Sided: <span className="text-emerald-400 font-semibold">₹6 / sheet</span></p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
              <p className="font-bold text-slate-200 mb-1">Color</p>
              <p className="text-slate-400">• Single-Sided: <span className="text-emerald-400 font-semibold">₹7 / sheet</span></p>
              <p className="text-slate-400">• Double-Sided: <span className="text-emerald-400 font-semibold">₹10 / sheet</span></p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 text-center">
            *Per-page hybrid mix supported: choose B&W or Color on each individual page!
          </p>
        </div>
      )}

      {/* Step 2: Page Visualizer & Settings (Revealed once files are uploaded) */}
      {uploadedBatch && (
        <>
          {/* Live Interactive Page Inspector */}
          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 uppercase tracking-wider px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold">2</span>
                Live Page Inspector (Select B&W / Color)
              </span>
            </div>

            <PageVisualizer
              totalPages={uploadedBatch.totalPages}
              downloadUrl={uploadedBatch.downloadUrl}
              pageConfigs={pageConfigs}
              onChange={(updated) => setPageConfigs(updated)}
              orientation={orientation}
              onOrientationChange={(orient) => setOrientation(orient)}
            />
          </section>

          {/* Print Preferences (Sides, Copies) */}
          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 uppercase tracking-wider px-1">
              <span className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                Print Preferences
              </span>
            </div>

            <PrintSettings
              totalPages={uploadedBatch.totalPages}
              settings={settings}
              onChange={handleSettingsChange}
            />
          </section>

          {/* Step 3: Checkout Summary */}
          <section className="space-y-2 pt-1">
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider px-1 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold">3</span>
              Checkout & Pay
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

      {/* Features teaser when no file is uploaded yet */}
      {!uploadedBatch && (
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="glass-card rounded-2xl p-3.5 flex items-start space-x-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Hybrid Color Support</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Pay B&W rate for text & Color only for photos.</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-3.5 flex items-start space-x-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Auto 15-Min Purge</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Zero data retention. Completely private.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
