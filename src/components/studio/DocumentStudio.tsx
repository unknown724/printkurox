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
  FileText,
  Layers,
  Minimize2,
  X,
} from 'lucide-react';
import { PhotoLayoutSettings } from './PhotoLayoutSelector';
import { AdobePageHandling, AdobePagesToPrint } from './AdobePageSizing';
import { EnhanceMode } from '@/lib/image-enhancer';

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
}: DocumentStudioProps) {
  const [currentStep, setCurrentStep] = useState<StudioStep>(1);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

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
                PDF, Word (.docx), or Images. Automatic A4 layout.
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

          {/* File Upload Zone */}
          <FileUpload
            uploadedBatch={uploadedBatch}
            onBatchUploaded={(data) => {
              onBatchUploaded(data);
            }}
          />

          {/* If file is staged, show sleek Continue button */}
          {/* If file is staged, show sleek Continue button with Glassmorphism */}
          {uploadedBatch && (
            <div className="relative p-3.5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/90 backdrop-blur-xl flex items-center justify-between gap-3 animate-scale-in shadow-xs overflow-hidden">
              {/* Specular Shining Flare on middle bottom */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-36 sm:w-56 h-[1.5px] bg-gradient-to-r from-transparent via-white/85 to-transparent shadow-[0_0_12px_rgba(255,255,255,0.8)] pointer-events-none z-10" />
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 w-48 sm:w-64 h-10 bg-[radial-gradient(ellipse_at_bottom,rgba(255,255,255,0.18),transparent_70%)] pointer-events-none z-0" />

              <div className="flex items-center gap-2.5 min-w-0 relative z-10">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 dark:bg-white/10 border border-blue-500/20 dark:border-white/15 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="truncate min-w-0">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[200px] sm:max-w-[360px] md:max-w-[500px] lg:max-w-[650px]" title={uploadedBatch.fileName}>
                    {uploadedBatch.fileName}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                    {uploadedBatch.totalPages} pages ready
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => goToStep(2)}
                className="relative overflow-hidden group h-9 px-4 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-[0_2px_12px_rgba(255,255,255,0.18)] transition-all active:scale-[0.98] cursor-pointer z-10"
              >
                <span>Customize Pages</span>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-950 stroke-[2.2] group-hover:translate-x-0.5 transition-transform" />
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
                <span className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-white/[0.04] text-zinc-800 dark:text-zinc-200 font-mono text-[11px] font-medium border border-zinc-200 dark:border-white/10">
                  {bwCount} B&amp;W
                </span>
                {colorCount > 0 ? (
                  <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-300 font-mono text-[11px] font-semibold border border-blue-500/30">
                    {colorCount} Color
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-white/[0.04] text-zinc-500 dark:text-zinc-400 font-mono text-[11px] border border-zinc-200 dark:border-white/10">
                    0 Color
                  </span>
                )}
              </div>

              {/* Direct Top Checkout CTA Button - Desktop only (Mobile uses bottom checkout button) */}
              <button
                type="button"
                onClick={() => goToStep(3)}
                className="hidden lg:flex h-8 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs items-center gap-1.5 shadow-md shadow-blue-500/20 hover:shadow-blue-500/35 transition-all cursor-pointer shrink-0"
              >
                <span>Continue to Checkout</span>
                <ArrowRight className="w-3.5 h-3.5" />
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
                  scaling={advancedOptions.scaling}
                  onScalingChange={(scaling, newCustomScale) =>
                    onAdvancedOptionsChange({
                      ...advancedOptions,
                      scaling,
                      ...(newCustomScale !== undefined ? { customScale: newCustomScale } : {}),
                    })
                  }
                  customScale={advancedOptions.customScale || 100}
                  onCustomScaleChange={(customScale) =>
                    onAdvancedOptionsChange({
                      ...advancedOptions,
                      scaling: 'custom',
                      customScale,
                    })
                  }
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
                scaling={advancedOptions.scaling}
                customScale={advancedOptions.customScale || 100}
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

          {/* Bottom Actions - Preserved for Mobile thumbs, hidden on Desktop since controls moved above */}
          <div className="flex lg:hidden items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <button
              type="button"
              onClick={() => goToStep(3)}
              className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/25 transition-all"
            >
              Continue to Checkout
              <ArrowRight className="w-3.5 h-3.5" />
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
              {/* Print Preferences (Sides & Copies) */}
              <PrintSettings
                totalPages={uploadedBatch.totalPages}
                settings={settings}
                onChange={onSettingsChange}
                bwCount={bwCount}
                colorCount={colorCount}
                pageConfigs={pageConfigs}
                onPageConfigsChange={onPageConfigsChange}
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
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold">
                      Base Rate
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">B&amp;W</p>
                    <p className="text-zinc-500">Single: <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono">₹{TIER_RATES.standard.bw.single}</span>/sheet</p>
                    <p className="text-zinc-500">Double: <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono">₹{TIER_RATES.standard.bw.duplex}</span>/sheet</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
                    <p className="font-semibold text-pink-600 dark:text-pink-400">Full Color</p>
                    <p className="text-zinc-500">Single: <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono">₹{TIER_RATES.standard.color.single}</span>/sheet</p>
                    <p className="text-zinc-500">Double: <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono">₹{TIER_RATES.standard.color.duplex}</span>/sheet</p>
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
                      Save 25%
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-blue-200/60 dark:border-blue-900/30 space-y-0.5">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">B&amp;W</p>
                    <p className="text-zinc-500">Single: <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">₹{TIER_RATES.assignment.bw.single}</span>/sheet</p>
                    <p className="text-zinc-500">Double: <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">₹{TIER_RATES.assignment.bw.duplex}</span>/sheet</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-blue-200/60 dark:border-blue-900/30 space-y-0.5">
                    <p className="font-semibold text-pink-600 dark:text-pink-400">Full Color</p>
                    <p className="text-zinc-500">Single: <span className="font-bold text-pink-600 dark:text-pink-400 font-mono">₹{TIER_RATES.assignment.color.single}</span>/sheet</p>
                    <p className="text-zinc-500">Double: <span className="font-bold text-pink-600 dark:text-pink-400 font-mono">₹{TIER_RATES.assignment.color.duplex}</span>/sheet</p>
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
                      Save 37.5% · ₹2/pg
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-emerald-200/60 dark:border-emerald-900/30 space-y-0.5">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">B&amp;W</p>
                    <p className="text-zinc-500">Single: <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">₹{TIER_RATES.mega.bw.single.toFixed(2)}</span>/sheet</p>
                    <p className="text-zinc-500">Double: <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">₹{TIER_RATES.mega.bw.duplex}</span>/sheet</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-zinc-950 border border-emerald-200/60 dark:border-emerald-900/30 space-y-0.5">
                    <p className="font-semibold text-pink-600 dark:text-pink-400">Full Color</p>
                    <p className="text-zinc-500">Single: <span className="font-bold text-pink-600 dark:text-pink-400 font-mono">₹{TIER_RATES.mega.color.single}</span>/sheet</p>
                    <p className="text-zinc-500">Double: <span className="font-bold text-pink-600 dark:text-pink-400 font-mono">₹{TIER_RATES.mega.color.duplex}</span>/sheet</p>
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
                  Kiosk Rate Schedule &amp; Volume Discounts
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
                  Discounts calculate automatically at checkout as your document sheet count climbs. Duplex (2-sided) printing drops your effective rate to as low as <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">₹2.00 per page side</strong>.
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
                    <th className="py-3 px-3 sm:px-4 w-[18%]">B&amp;W (1-Sided)</th>
                    <th className="py-3 px-3 sm:px-4 w-[18%]">B&amp;W (Duplex)</th>
                    <th className="py-3 px-3 sm:px-4 w-[18%]">Color (1-Sided)</th>
                    <th className="py-3 px-3 sm:px-4 w-[18%]">Color (Duplex)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/70 text-xs sm:text-sm">
                  {/* Tier 1: Standard */}
                  <tr className="hover:bg-zinc-100/60 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-4 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-900 dark:text-white">Standard</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold">
                          Base Rate
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">1 – 9 sheets</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-zinc-900 dark:text-white">₹{TIER_RATES.standard.bw.single}</div>
                      <div className="text-[10px] text-zinc-500">per sheet</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-zinc-900 dark:text-white">₹{TIER_RATES.standard.bw.duplex}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">(₹3.00 / side)</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-pink-600 dark:text-pink-400">₹{TIER_RATES.standard.color.single}</div>
                      <div className="text-[10px] text-zinc-500">per sheet</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-pink-600 dark:text-pink-400">₹{TIER_RATES.standard.color.duplex}</div>
                      <div className="text-[10px] text-pink-600/90 dark:text-pink-400/90 font-mono">(₹5.00 / side)</div>
                    </td>
                  </tr>

                  {/* Tier 2: Assignment Saver */}
                  <tr className="bg-sky-50/40 dark:bg-sky-950/20 hover:bg-sky-50/70 dark:hover:bg-sky-950/30 transition-colors">
                    <td className="py-3 px-4 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-sky-950 dark:text-sky-200">Assignment Saver</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-700 dark:text-sky-300 font-mono font-bold text-[10px] border border-sky-500/40">
                          Save 25%
                        </span>
                      </div>
                      <div className="text-xs text-sky-700 dark:text-sky-300/90 font-mono font-semibold mt-0.5">10 – 29 sheets</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-sky-700 dark:text-sky-300">₹{TIER_RATES.assignment.bw.single}</div>
                      <div className="text-[10px] text-sky-600 dark:text-sky-400 font-mono">25% Off Base</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-sky-700 dark:text-sky-300">₹{TIER_RATES.assignment.bw.duplex}</div>
                      <div className="text-[10px] text-sky-700 dark:text-sky-200 font-mono font-bold">(₹2.50 / side)</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-pink-600 dark:text-pink-400">₹{TIER_RATES.assignment.color.single}</div>
                      <div className="text-[10px] text-zinc-500">Save ₹1 / sheet</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-pink-600 dark:text-pink-400">₹{TIER_RATES.assignment.color.duplex}</div>
                      <div className="text-[10px] text-pink-600/90 dark:text-pink-400/90 font-mono font-medium">(₹4.00 / side)</div>
                    </td>
                  </tr>

                  {/* Tier 3: Mega Bulk Saver */}
                  <tr className="bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 transition-colors">
                    <td className="py-3 px-4 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-emerald-950 dark:text-emerald-200">Mega Bulk Saver</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-[10px] border border-emerald-500/40">
                          Save 37.5%
                        </span>
                      </div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-300/90 font-mono font-semibold mt-0.5">30+ sheets</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-emerald-700 dark:text-emerald-300">₹{TIER_RATES.mega.bw.single.toFixed(2)}</div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">37.5% Off Base</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-emerald-700 dark:text-emerald-300">₹{TIER_RATES.mega.bw.duplex}</div>
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-200 font-mono font-bold">(₹2.00 / side!)</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-pink-600 dark:text-pink-400">₹{TIER_RATES.mega.color.single}</div>
                      <div className="text-[10px] text-zinc-500">Save ₹2 / sheet</div>
                    </td>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-lg font-mono text-pink-600 dark:text-pink-400">₹{TIER_RATES.mega.color.duplex}</div>
                      <div className="text-[10px] text-pink-600/90 dark:text-pink-400/90 font-mono font-medium">(₹3.50 / side)</div>
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
    </div>
  );
}
