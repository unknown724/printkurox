'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { UploadedBatchData } from '@/components/FileUpload';
import { PrintSettingsState } from '@/components/PrintSettings';
import { AdvancedPrintOptions } from '@/components/AdvancedSettings';
import { calculatePricing, PageConfig } from '@/lib/pricing';
import { pagesToRangeString } from '@/lib/pdf-utils';
import { DocumentStudio } from '@/components/studio/DocumentStudio';
import { QronosLandingHero } from '@/components/landing/QronosLandingHero';
import { Crown, ChevronRight, ArrowLeft, X, Sparkles } from 'lucide-react';

export default function HomePage() {
  const [uploadedBatch, setUploadedBatch] = useState<UploadedBatchData | null>(null);
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>([]);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [showKiosk, setShowKiosk] = useState(false);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [printerOnline, setPrinterOnline] = useState(true);

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  // Check admin session & printer status
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

    fetch('/api/printer-status')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.online === 'boolean') {
          setPrinterOnline(d.online);
        }
      })
      .catch(() => {});
  }, []);

  const handleBatchUploaded = (data: UploadedBatchData | null) => {
    setUploadedBatch(data);
    if (data) {
      setShowKiosk(true);
      const initial: PageConfig[] = Array.from({ length: data.totalPages }, (_, i) => ({
        pageNumber: i + 1,
        colorMode: settings.colorMode === 'color' ? 'color' : 'bw',
        included: true,
        orientation,
        copies: 1,
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

  // If on first landing and no file is loaded, show the full Qronos Landing Hero
  if (!uploadedBatch && !showKiosk) {
    return (
      <div className="-mt-14 -mx-4">
        <QronosLandingHero
          onGetStarted={() => {
            setShowKiosk(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenRates={() => setShowRatesModal(true)}
          printerOnline={printerOnline}
        />

        {/* Rate Card Modal from Hero */}
        {showRatesModal && (
          <div
            onClick={() => setShowRatesModal(false)}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-scale-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#131314] p-6 shadow-2xl text-xs space-y-4 text-white relative"
            >
              <span className="crosshair-tl" />
              <span className="crosshair-tr" />
              <span className="crosshair-bl" />
              <span className="crosshair-br" />

              <div className="flex items-center justify-between pb-3 border-b border-white/10 font-bold">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-sm">Official Kiosk Rates & Tiers</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRatesModal(false)}
                  className="text-zinc-400 hover:text-white w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <p className="font-semibold text-white">Black &amp; White (Monochrome)</p>
                  <p className="text-zinc-400">• Single-Sided: <span className="font-semibold text-white">₹4.00 / sheet</span></p>
                  <p className="text-zinc-400">• Double-Sided: <span className="font-semibold text-white">₹6.00 / sheet</span> (₹3.00/side)</p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <p className="font-semibold text-white">Full Color High Definition</p>
                  <p className="text-zinc-400">• Single-Sided: <span className="font-semibold text-white">₹7.00 / sheet</span></p>
                  <p className="text-zinc-400">• Double-Sided: <span className="font-semibold text-white">₹10.00 / sheet</span> (₹5.00/side)</p>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                  <p className="font-semibold text-emerald-400">Volume Discounts (Auto Applied)</p>
                  <p className="text-zinc-300">• 10+ sheets: <span className="font-semibold text-white">₹3.00/sheet</span> (Assignment Saver)</p>
                  <p className="text-zinc-300">• 30+ sheets: <span className="font-semibold text-white">₹2.50/sheet</span> (Mega Bulk Saver)</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowRatesModal(false);
                  setShowKiosk(true);
                }}
                className="w-full py-2.5 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-zinc-200 transition-colors"
              >
                Start Printing Now
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="kiosk-studio" className="space-y-4 pb-8 sm:pb-12 max-w-xl mx-auto animate-fade-in-up">
      {/* Top Bar with Return to Landing & Admin indicator */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => {
            setUploadedBatch(null);
            setShowKiosk(false);
          }}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Welcome</span>
        </button>

        {isAdmin && (
          <Link
            href="/adminkurox"
            className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold"
          >
            <Crown className="w-3.5 h-3.5 text-amber-500" />
            <span>Admin Active</span>
          </Link>
        )}
      </div>

      {/* Admin Verified Alert */}
      {isAdmin && (
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl border border-amber-500/25 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center space-x-2 min-w-0">
            <Crown className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="truncate">
              <strong>Admin Verified:</strong> {deviceName || 'Authorized Device'} · Free Print Active
            </span>
          </div>
          <Link
            href="/adminkurox"
            className="flex items-center gap-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline shrink-0 ml-2"
          >
            Console <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Document Studio 3-Step Wizard with Glassmorphism & Corner Crosshairs */}
      <div className="relative rounded-2xl border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-[#131314]/80 backdrop-blur-md p-3 sm:p-4 shadow-sm">
        <span className="crosshair-tl" />
        <span className="crosshair-tr" />
        <span className="crosshair-bl" />
        <span className="crosshair-br" />

        <DocumentStudio
          uploadedBatch={uploadedBatch}
          onBatchUploaded={handleBatchUploaded}
          pageConfigs={pageConfigs}
          onPageConfigsChange={handlePageConfigsChange}
          orientation={orientation}
          onOrientationChange={(orient) => setOrientation(orient)}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          advancedOptions={advancedOptions}
          onAdvancedOptionsChange={(opts) => setAdvancedOptions(opts)}
          pricing={pricing}
          bwCount={bwCount}
          colorCount={colorCount}
          onRangeChange={handleRangeChange}
        />
      </div>
    </div>
  );
}
