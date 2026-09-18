'use client';

import React, { useState, useEffect } from 'react';
import { StudioStepper, StudioStep } from './StudioStepper';
import { FileUpload, UploadedBatchData } from '@/components/FileUpload';
import { PrintSettings, PrintSettingsState } from '@/components/PrintSettings';
import { CostSummary } from '@/components/CostSummary';
import { PageVisualizer } from '@/components/PageVisualizer';
import { AdvancedSettings, AdvancedPrintOptions } from '@/components/AdvancedSettings';
import { PricingResult, PageConfig, TIER_RATES } from '@/lib/pricing';
import {
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  FileText,
  Layers,
  Minimize2,
  X,
  Building2,
  MapPin,
  ChevronDown,
  Sparkles,
  Lock,
} from 'lucide-react';
import { PhotoLayoutSettings } from './PhotoLayoutSelector';
import { AdobePageHandling, AdobePagesToPrint } from './AdobePageSizing';
import { EnhanceMode } from '@/lib/image-enhancer';
import { HostelSelectorModal } from '@/components/HostelSelectorModal';
import { getStationConfig } from '@/lib/stations';

interface DocumentStudioProps {
  uploadedBatch: UploadedBatchData | null;
  onBatchUploaded: (data: UploadedBatchData | null) => void;
  pageConfigs: PageConfig[];
  onPageConfigsChange: (updated: PageConfig[]) => void;
  orientation: 'auto' | 'portrait' | 'landscape';
  onOrientationChange: (orient: 'auto' | 'portrait' | 'landscape') => void;
  settings: PrintSettingsState;
  onSettingsChange: (settings: PrintSettingsState) => void;
  advancedOptions: AdvancedPrintOptions;
  onAdvancedOptionsChange: (opts: AdvancedPrintOptions) => void;
  layoutSettings: PhotoLayoutSettings;
  onLayoutSettingsChange: (layout: PhotoLayoutSettings) => void;
  enhanceMode: EnhanceMode;
  onEnhanceModeChange: (mode: EnhanceMode) => void;
  pricing: PricingResult;
  bwCount: number;
  colorCount: number;
  onRangeChange: (type: 'all' | 'custom', rangeStr: string) => void;
  stationId?: string;
  onStationSelect?: (stationId: string) => void;
}

export function DocumentStudio({
  uploadedBatch,
  onBatchUploaded,
  pageConfigs,
  onPageConfigsChange,
  orientation,
  onOrientationChange,
  settings,
  onSettingsChange,
  advancedOptions,
  onAdvancedOptionsChange,
  layoutSettings,
  onLayoutSettingsChange,
  enhanceMode,
  onEnhanceModeChange,
  pricing,
  bwCount,
  colorCount,
  onRangeChange,
  stationId,
  onStationSelect,
}: DocumentStudioProps) {
  const [currentStep, setCurrentStep] = useState<StudioStep>(1);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [showStationModal, setShowStationModal] = useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  const currentStation = getStationConfig(stationId || 'block_b');

  // Close Rate Card modal on Escape key press
  useEffect(() => {
    if (!showRatesModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowRatesModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showRatesModal]);

  // Preload Razorpay checkout gateway in background so payment opens with 0 latency
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.Razorpay) {
      const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, []);

  const maxAccessibleStep: StudioStep = uploadedBatch ? 3 : 1;

  const goToStep = (step: StudioStep) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-4">
      {/* shadcn/ui Stepper Navigation */}
      <StudioStepper
        currentStep={currentStep}
        onStepClick={goToStep}
        maxAccessibleStep={maxAccessibleStep}
        totalPages={uploadedBatch?.totalPages}
      />

      {/* =========================================================
          STAGE 1: DOCUMENT UPLOAD
          ========================================================= */}
      {currentStep === 1 && (
        <div className="space-y-3 animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between px-0.5 pt-1">
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                Upload Document
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                PDF or Images (PNG, JPG, WEBP). Automatic A4 layout.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowRatesModal((prev) => !prev)}
              aria-label="View or close kiosk rate card"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white px-2.5 py-1.5 rounded-lg border border-zinc-200/80 dark:border-white/10 bg-zinc-100/70 dark:bg-white/[0.04] hover:dark:bg-white/[0.08] hover:dark:border-white/20 transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-400" />
              <span>Rate Card</span>
            </button>
          </div>

          {/* Target Hostel Print Station Card */}
          <div className="p-3 sm:p-3.5 rounded-2xl border border-blue-500/25 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-transparent dark:from-blue-950/25 dark:via-[#13141c]/60 dark:to-transparent backdrop-blur-md flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Hostel Station:
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate">
                    {currentStation.name}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/25">
                    🟢 Ready
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                  <span>{currentStation.address}</span>
                  <span className="text-zinc-300 dark:text-zinc-600">•</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">₹3 B&W / ₹5 Color</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowStationModal(true)}
              className="h-8 px-2.5 sm:px-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white hover:bg-zinc-100 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] text-zinc-900 dark:text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs cursor-pointer"
              title="Station switching in setup · Feature to be updated soon"
            >
              <Lock className="w-3 h-3 text-zinc-400" />
              <span>Change</span>
            </button>
          </div>

          {/* File Upload Zone */}
          <FileUpload
            uploadedBatch={uploadedBatch}
            onBatchUploaded={(data) => {
              onBatchUploaded(data);
            }}
            onProceed={() => goToStep(2)}
          />

          {/* Primary Next Action Banner - Instinctive, Pulsing, Impossible to Miss */}
          {uploadedBatch && (
            <div className="relative p-4 sm:p-5 rounded-2xl border-2 border-blue-500/50 bg-gradient-to-br from-blue-950/40 via-[#16161c] to-indigo-950/40 backdrop-blur-xl shadow-[0_4px_30px_rgba(37,99,235,0.25)] space-y-3.5 animate-scale-in overflow-hidden">
              {/* Luminous perimeter flare */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400 animate-pulse" />

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                    <FileText className="w-4.5 h-4.5" />
                  </div>
                  <div className="truncate min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate" title={uploadedBatch.fileName}>
                        {uploadedBatch.fileName}
                      </p>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                        {uploadedBatch.totalPages} Pages Ready
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Ready to print · Tap below to review page layout, color modes &amp; print
                    </p>
                  </div>
                </div>
              </div>

              {/* Big, Pulsing Primary Button */}
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="relative overflow-hidden group w-full h-12 sm:h-13 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-[0_4px_24px_rgba(37,99,235,0.45)] hover:shadow-[0_4px_32px_rgba(37,99,235,0.65)] border border-blue-400/50 transition-all duration-300 active:scale-[0.99] cursor-pointer ring-2 ring-blue-400/40"
              >
                <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer-sheen pointer-events-none" />
                <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                <span>Customize Pages &amp; Proceed ({uploadedBatch.totalPages} Pgs)</span>
                <ArrowRight className="w-4.5 h-4.5 text-white stroke-[2.5] group-hover:translate-x-1.5 transition-transform" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          STAGE 2: VISUAL PAGE STUDIO
          ========================================================= */}
      {currentStep === 2 && uploadedBatch && (
        <div className="space-y-4 animate-fade-in-up">
          {/* Top Info Bar with Quick Checkout & Status */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-0.5 pt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Desktop Back Button (Moved above on desktop to save frame height) */}
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="hidden lg:inline-flex h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] text-xs font-medium items-center gap-1 transition-colors cursor-pointer shrink-0"
                title="Back to Upload"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-700 dark:text-zinc-300 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-[#e3e3e3] truncate">
                  Page Inspector
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  Tap any page to toggle B&amp;W or Color
                </p>
              </div>
            </div>

            {/* Stage 2 Status & Direct Checkout Button */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="px-2 sm:px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-white/[0.04] text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-medium border border-zinc-200 dark:border-white/10">
                  {bwCount} B&amp;W
                </span>
                {colorCount > 0 ? (
                  <span className="px-2 sm:px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-300 font-mono text-[11px] font-semibold border border-blue-500/30">
                    {colorCount} Color
                  </span>
                ) : (
                  <span className="px-2 sm:px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-white/[0.04] text-zinc-500 dark:text-zinc-400 font-mono text-[11px] border border-zinc-200 dark:border-white/10">
                    0 Color
                  </span>
                )}
              </div>

              {/* Top Jump/Scroll Down Button - Directly scrolls down to Checkout at the bottom */}
              <button
                type="button"
                onClick={() => {
                  const target = document.getElementById('stage2-bottom-checkout');
                  if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'end' });
                  } else {
                    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
                  }
                }}
                className="flex h-8 sm:h-8.5 px-3 sm:px-3.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/25 font-bold text-xs items-center gap-1.5 shadow-2xs hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shrink-0"
                title="Scroll down directly to checkout"
              >
                <span className="hidden sm:inline">To </span>
                <span>Checkout</span>
                <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
              </button>
            </div>
          </div>

          {/* Professional Adobe Acrobat Print Studio Layout (Mobile optimized & Desktop 2-column) */}
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-2.5 sm:gap-3 lg:gap-3.5 items-start">
            {/* Left Column on Desktop (Col 1-5) holding all settings without artificial gap */}
            <div className="contents lg:block lg:col-span-5 xl:col-span-5 space-y-2 sm:space-y-2.5">
              {/* Box 1 & 2: Sizing & Orientation */}
              <div className="order-1 lg:order-none space-y-2">
                <AdobePageHandling
                  settings={layoutSettings}
                  onChange={onLayoutSettingsChange}
                  orientation={orientation}
                  onOrientationChange={onOrientationChange}
                  scaling={layoutSettings.fitMode === 'custom' || advancedOptions.scaling === 'custom' ? 'custom' : advancedOptions.scaling}
                  onScalingChange={(scaling, newCustomScale) => {
                    const nextScale = newCustomScale !== undefined ? newCustomScale : (advancedOptions.customScale || 100);
                    onAdvancedOptionsChange({
                      ...advancedOptions,
                      scaling,
                      customScale: nextScale,
                    });
                    onLayoutSettingsChange({
                      ...layoutSettings,
                      fitMode: scaling === 'fill' ? 'fill' : scaling === 'actual' ? 'actual' : scaling === 'custom' ? 'custom' : 'fit',
                      customScale: nextScale,
                    });
                  }}
                  customScale={layoutSettings.customScale || advancedOptions.customScale || 100}
                  onCustomScaleChange={(customScale) => {
                    onAdvancedOptionsChange({
                      ...advancedOptions,
                      scaling: 'custom',
                      customScale,
                    });
                    onLayoutSettingsChange({
                      ...layoutSettings,
                      fitMode: 'custom',
                      customScale,
                    });
                  }}
                  fileCount={uploadedBatch.fileCount || uploadedBatch.totalPages}
                  pageConfigs={pageConfigs}
                  onPageConfigsChange={onPageConfigsChange}
                  totalPages={uploadedBatch.totalPages}
                  activePageNumber={activeSheetIndex + 1}
                />
              </div>

              {/* Box 3: Pages to Print (appears 3rd on mobile, immediately under Box 2 on desktop) */}
              <div className="order-3 lg:order-none space-y-2 lg:mt-2 sm:lg:mt-2.5">
                <AdobePagesToPrint
                  totalPages={uploadedBatch.totalPages}
                  pageConfigs={pageConfigs}
                  onPageConfigsChange={onPageConfigsChange}
                  pageRangeType={settings.pageRangeType}
                  customPageRange={settings.customPageRange}
                  onRangeChange={onRangeChange}
                  activePageNumber={activeSheetIndex + 1}
                />
              </div>
            </div>

            {/* Right Column on Desktop (Col 6-12) / Middle on Mobile (order-2) */}
            <div className="order-2 lg:order-none lg:col-span-7 xl:col-span-7 w-full lg:sticky lg:top-2">
              <PageVisualizer
                totalPages={uploadedBatch.totalPages}
                downloadUrl={uploadedBatch.downloadUrl}
                fileKey={uploadedBatch.fileKey}
                rawFiles={uploadedBatch.rawFiles}
                pageConfigs={pageConfigs}
                onChange={onPageConfigsChange}
                orientation={orientation}
                onOrientationChange={onOrientationChange}
                enhanceMode={enhanceMode}
                fitMode={layoutSettings.fitMode}
                scaling={layoutSettings.fitMode === 'custom' || advancedOptions.scaling === 'custom' ? 'custom' : advancedOptions.scaling}
                customScale={layoutSettings.customScale || advancedOptions.customScale || 100}
                layoutMode={layoutSettings.layoutMode}
                drawBorder={layoutSettings.drawBorder}
                autoRotate={layoutSettings.autoRotate}
                pageOrder={layoutSettings.pageOrder}
                customCols={layoutSettings.customCols}
                customRows={layoutSettings.customRows}
                activeSheetIndex={activeSheetIndex}
                onSheetChange={setActiveSheetIndex}
                textOverlay={layoutSettings.textOverlay}
                onTextOverlayChange={(updated) =>
                  onLayoutSettingsChange({ ...layoutSettings, textOverlay: updated })
                }
              />
            </div>
          </div>

          {/* Bottom Actions - Sticky docked bar so it's always seeable & reachable without scrolling */}
          <div
            id="stage2-bottom-checkout"
            className="sticky bottom-0 z-40 bg-white/95 dark:bg-[#121316]/95 backdrop-blur-md border-t border-zinc-200/80 dark:border-white/10 p-2.5 sm:p-3 shadow-2xl rounded-t-2xl sm:rounded-xl -mx-3 -mb-3 sm:mx-0 sm:mb-0 flex items-center justify-between gap-3 mt-4"
          >
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="h-9 sm:h-10 px-3.5 sm:px-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={() => goToStep(3)}
              className="h-9 sm:h-10 px-5 sm:px-6 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-blue-500/35 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              <span>Continue to Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          STAGE 3: PRINT PREFERENCES & CHECKOUT
          ========================================================= */}
      {currentStep === 3 && uploadedBatch && (
        <div className="space-y-3 animate-fade-in-up">
          <div className="flex items-center justify-between pb-1 border-b border-zinc-100 dark:border-zinc-800/60">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-[#e3e3e3] tracking-tight">
                Order Review &amp; Payment
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Review your order details and proceed to secure checkout
              </p>
            </div>
            <button
              type="button"
              onClick={() => goToStep(2)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
            >
              <ArrowLeft className="w-3 h-3" /> Edit Studio Layout
            </button>
          </div>

          {/* 2-Column Desktop Grid for Compact 1-Frame View */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-3.5 items-start">
            {/* Left Column (Cols 1-6): Print Preferences & Advanced Settings */}
            <div className="lg:col-span-6 space-y-2.5">
              {/* Print Preferences with Destination Printer Station */}
              <PrintSettings
                totalPages={uploadedBatch.totalPages}
                settings={settings}
                onChange={onSettingsChange}
                bwCount={bwCount}
                colorCount={colorCount}
                pageConfigs={pageConfigs}
                onPageConfigsChange={onPageConfigsChange}
                stationId={stationId}
                onOpenStationModal={() => setShowStationModal(true)}
              />

              {/* Advanced Settings (Collapsible) */}
              <AdvancedSettings
                options={advancedOptions}
                onChange={onAdvancedOptionsChange}
                copies={settings.copies}
                enhanceMode={enhanceMode}
                onEnhanceModeChange={onEnhanceModeChange}
              />
            </div>

            {/* Right Column (Cols 7-12): Order Summary & Razorpay Payment */}
            <div className="lg:col-span-6 lg:sticky lg:top-2 space-y-2">
              <CostSummary
                pricing={pricing}
                fileKey={uploadedBatch.fileKey}
                fileName={uploadedBatch.fileName}
                totalPages={uploadedBatch.totalPages}
                pageRange={settings.pageRangeType === 'all' ? 'All' : settings.customPageRange}
                pageConfigs={pageConfigs}
                layoutMode={layoutSettings.layoutMode}
                customCols={layoutSettings.customCols}
                customRows={layoutSettings.customRows}
                textOverlay={layoutSettings.textOverlay}
                orientation={orientation}
                stationId={stationId}
                customScale={layoutSettings.customScale || advancedOptions.customScale || 100}
                fitMode={layoutSettings.fitMode || advancedOptions.scaling || 'fit'}
                drawBorder={layoutSettings.drawBorder}
                onOpenStationModal={() => setShowStationModal(true)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Rate Card Modal: Original clean stack on Mobile, Professional Executive-grade on Desktop */}
      {/* Rate Card Modal: Original clean stack on Mobile, Professional Executive-grade on Desktop */}
      {showRatesModal && (
        <div
          onClick={() => setShowRatesModal(false)}
          className="fixed inset-0 z-50 bg-black/80 dark:bg-black/90 backdrop-blur-md overflow-y-auto p-3 sm:p-6 flex flex-col items-center justify-start py-6 sm:py-10 animate-fade-in-up"
        >
          {/* ======================= MOBILE VIEW (KEPT EXACTLY AS IT WAS) ======================= */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="md:hidden w-full max-w-md my-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 sm:p-5 shadow-2xl text-xs space-y-3.5 animate-scale-in"
          >
            {/* Mobile Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-200 dark:border-zinc-800 font-bold text-zinc-900 dark:text-zinc-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-bold">Official Kiosk Rate Card</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRatesModal(false)}
                aria-label="Close Rate Card"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Mobile Cards Stack */}
            <div className="space-y-2.5">
              {/* Standard Tier */}
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 space-y-2 flex flex-col justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                      Standard (1 – 9 sheets)
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                      Save 40% vs Offline
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">B&amp;W (Single)</p>
                    <p className="text-zinc-500">Web App: <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono">₹{TIER_RATES.standard.bw.single}</span>/sheet</p>
                    <p className="text-[10px] text-zinc-400 font-mono">(Offline shop: ₹5)</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
                    <p className="font-semibold text-pink-600 dark:text-pink-400">Full Color</p>
                    <p className="text-zinc-500">Web App: <span className="font-bold text-pink-600 dark:text-pink-400 font-mono">₹{TIER_RATES.standard.color.single}</span>/sheet</p>
                    <p className="text-[10px] text-zinc-400 font-mono">(Offline shop: ₹10)</p>
                  </div>
                </div>
              </div>

              {/* Assignment Saver Tier */}
              <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-900/40 space-y-2 flex flex-col justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-950 dark:text-blue-200 text-xs">
                      Assignment Saver (10 – 29 sheets)
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold">
                      ₹2.50 / pg
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-blue-200/60 dark:border-blue-900/30 space-y-0.5">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">B&amp;W</p>
                    <p className="text-zinc-500">Web: <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">₹{TIER_RATES.assignment.bw.single.toFixed(2)}</span>/sheet</p>
                    <p className="text-[10px] text-emerald-600 font-mono">Save 50% vs shop</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-blue-200/60 dark:border-blue-900/30 space-y-0.5">
                    <p className="font-semibold text-pink-600 dark:text-pink-400">Full Color</p>
                    <p className="text-zinc-500">Web: <span className="font-bold text-pink-600 dark:text-pink-400 font-mono">₹{TIER_RATES.assignment.color.single.toFixed(2)}</span>/sheet</p>
                    <p className="text-[10px] text-emerald-600 font-mono">Save ₹5.50/sheet</p>
                  </div>
                </div>
              </div>

              {/* Mega Bulk Saver Tier */}
              <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 space-y-2 flex flex-col justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950 dark:text-emerald-200 text-xs">
                      Mega Bulk Saver (30+ sheets)
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold">
                      ₹2.00 / pg!
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-emerald-200/60 dark:border-emerald-900/30 space-y-0.5">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">B&amp;W</p>
                    <p className="text-zinc-500">Web: <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">₹{TIER_RATES.mega.bw.single.toFixed(2)}</span>/sheet</p>
                    <p className="text-[10px] text-emerald-600 font-mono">Save 60% vs shop</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-emerald-200/60 dark:border-emerald-900/30 space-y-0.5">
                    <p className="font-semibold text-pink-600 dark:text-pink-400">Full Color</p>
                    <p className="text-zinc-500">Web: <span className="font-bold text-pink-600 dark:text-pink-400 font-mono">₹{TIER_RATES.mega.color.single.toFixed(2)}</span>/sheet</p>
                    <p className="text-[10px] text-emerald-600 font-mono">Save ₹6.00/sheet</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Footer */}
            <div className="pt-1 flex flex-col items-center justify-between gap-2.5">
              <p className="text-[10px] text-zinc-500 text-center">
                Automatic A4 layout • Hybrid color per page • 15-min auto-purge
              </p>
              <button
                type="button"
                onClick={() => setShowRatesModal(false)}
                className="w-full px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Minimize / Close</span>
              </button>
            </div>
          </div>

          {/* ======================= DESKTOP VIEW (EXECUTIVE MASTER RATE TABLE) ======================= */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="hidden md:block w-full max-w-4xl xl:max-w-5xl my-auto relative rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] p-6 sm:p-7 shadow-2xl backdrop-blur-2xl text-zinc-900 dark:text-zinc-100 animate-scale-in space-y-4 sm:space-y-5 overflow-hidden"
          >
            {/* Top-Middle Luminous Specular Flare */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 sm:w-96 h-[2.5px] bg-gradient-to-r from-transparent via-white/80 to-transparent shadow-[0_0_20px_rgba(255,255,255,0.9)] pointer-events-none" />

            {/* Desktop Header */}
            <div className="flex items-start justify-between border-b border-zinc-200 dark:border-zinc-800/80 pb-3.5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-mono font-bold tracking-wider text-emerald-600 dark:text-emerald-400 uppercase">
                    Official Station Tariff · Live Dynamic Pricing
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
                  NERIST Campus Rate Schedule &amp; Volume Discounts
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
                  Web-exclusive student pricing: <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">₹3.00 B&amp;W</strong> and <strong className="text-pink-600 dark:text-pink-400 font-semibold">₹5.00 Color</strong> (save up to 40%–50% vs offline shop rates). Online jobs print single-sided for 100% paper-feed reliability.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowRatesModal(false)}
                className="group flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-all cursor-pointer text-xs font-semibold shadow-xs shrink-0"
                title="Close (Esc)"
              >
                <X className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
                <span>Close</span>
                <kbd className="text-[10px] font-mono bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded font-semibold">
                  Esc
                </kbd>
              </button>
            </div>

            {/* Master Pricing Table with Horizontal Scroll Protection */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-950/90 text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                    <th className="py-3 px-4 sm:px-5 w-[28%]">Tier &amp; Volume</th>
                    <th className="py-3 px-3 sm:px-4 w-[20%]">B&amp;W (Web App)</th>
                    <th className="py-3 px-3 sm:px-4 w-[20%]">Color (Web App)</th>
                    <th className="py-3 px-3 sm:px-4 w-[18%]">Offline Market Rate</th>
                    <th className="py-3 px-3 sm:px-4 w-[14%]">Savings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/70 text-xs sm:text-sm">
                  {/* Tier 1: Standard */}
                  <tr className="hover:bg-zinc-100/60 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-4 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-900 dark:text-white">Standard</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
                          Web Special
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">1 – 9 sheets</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-zinc-900 dark:text-white">₹{TIER_RATES.standard.bw.single}</div>
                      <div className="text-[10px] text-zinc-500">per sheet</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-pink-600 dark:text-pink-400">₹{TIER_RATES.standard.color.single}</div>
                      <div className="text-[10px] text-zinc-500">per sheet</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="text-xs font-mono text-zinc-500">₹5 (B&amp;W) / ₹10 (Color)</div>
                      <div className="text-[10px] text-zinc-400">Campus shops</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        Save 40–50%
                      </span>
                    </td>
                  </tr>

                  {/* Tier 2: Assignment Saver */}
                  <tr className="bg-sky-50/40 dark:bg-sky-950/20 hover:bg-sky-50/70 dark:hover:bg-sky-950/30 transition-colors">
                    <td className="py-3 px-4 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-sky-950 dark:text-sky-200">Assignment Saver</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-700 dark:text-sky-300 font-mono font-bold text-[10px] border border-sky-500/40">
                          Bulk Discount
                        </span>
                      </div>
                      <div className="text-xs text-sky-700 dark:text-sky-300/90 font-mono font-semibold mt-0.5">10 – 29 sheets</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-sky-700 dark:text-sky-300">₹{TIER_RATES.assignment.bw.single.toFixed(2)}</div>
                      <div className="text-[10px] text-sky-600 dark:text-sky-400 font-mono">₹2.50 / pg</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-pink-600 dark:text-pink-400">₹{TIER_RATES.assignment.color.single.toFixed(2)}</div>
                      <div className="text-[10px] text-zinc-500">₹4.50 / pg</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="text-xs font-mono text-zinc-500">₹50 – ₹145</div>
                      <div className="text-[10px] text-zinc-400">Standard offline</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        Save 50%+
                      </span>
                    </td>
                  </tr>

                  {/* Tier 3: Mega Bulk Saver */}
                  <tr className="bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 transition-colors">
                    <td className="py-3 px-4 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-emerald-950 dark:text-emerald-200">Mega Bulk Saver</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-[10px] border border-emerald-500/40">
                          Semester Notes
                        </span>
                      </div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-300/90 font-mono font-semibold mt-0.5">30+ sheets</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-emerald-700 dark:text-emerald-300">₹{TIER_RATES.mega.bw.single.toFixed(2)}</div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">₹2.00 / pg!</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-pink-600 dark:text-pink-400">₹{TIER_RATES.mega.color.single.toFixed(2)}</div>
                      <div className="text-[10px] text-zinc-500">₹4.00 / pg</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="text-xs font-mono text-zinc-500">₹150+</div>
                      <div className="text-[10px] text-zinc-400">Standard offline</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        Save 60%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Highlights Strip */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-xs">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <div className="truncate">
                  <span className="font-semibold text-zinc-900 dark:text-white">Auto Volume Tiers:</span>{' '}
                  <span className="text-zinc-500 dark:text-zinc-400">Discounts unlock automatically</span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-xs">
                <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />
                <div className="truncate">
                  <span className="font-semibold text-zinc-900 dark:text-white">Hybrid Color:</span>{' '}
                  <span className="text-zinc-500 dark:text-zinc-400">B&amp;W pages stay at base rates</span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <div className="truncate">
                  <span className="font-semibold text-zinc-900 dark:text-white">Zero-Retention:</span>{' '}
                  <span className="text-zinc-500 dark:text-zinc-400">Files purged 15m after print</span>
                </div>
              </div>
            </div>

            {/* Desktop Footer */}
            <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-3 text-xs text-zinc-500">
              <div className="flex items-center gap-3 sm:gap-4 text-[11px]">
                <span>✓ 75 GSM Premium Paper</span>
                <span>✓ Calibrated Duplex Alignment</span>
                <span>✓ Instant Counter Pickup</span>
              </div>
              <button
                type="button"
                onClick={() => setShowRatesModal(false)}
                className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Dismiss Rate Card</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Central Hostel Selector Modal accessible across all studio stages */}
      <HostelSelectorModal
        isOpen={showStationModal}
        onClose={() => setShowStationModal(false)}
        currentStationId={stationId}
        onStationSelect={(id) => {
          if (onStationSelect) {
            onStationSelect(id);
          }
          setShowStationModal(false);
        }}
      />
    </div>
  );
}
