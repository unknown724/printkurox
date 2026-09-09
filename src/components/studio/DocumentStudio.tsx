'use client';

import React, { useState } from 'react';
import { StudioStepper, StudioStep } from './StudioStepper';
import { BulkDiscountBanner } from './BulkDiscountBanner';
import { FileUpload, UploadedBatchData } from '@/components/FileUpload';
import { PrintSettings, PrintSettingsState } from '@/components/PrintSettings';
import { PageRangeSelector } from '@/components/PageRangeSelector';
import { CostSummary } from '@/components/CostSummary';
import { PageVisualizer } from '@/components/PageVisualizer';
import { AdvancedSettings, AdvancedPrintOptions } from '@/components/AdvancedSettings';
import { PricingResult, PageConfig } from '@/lib/pricing';
import {
  Sparkles,
  HelpCircle,
  Zap,
  Shield,
  ArrowRight,
  ArrowLeft,
  FileText,
  CheckCircle2,
  Layers,
  RotateCcw,
} from 'lucide-react';

interface DocumentStudioProps {
  uploadedBatch: UploadedBatchData | null;
  onBatchUploaded: (data: UploadedBatchData | null) => void;
  pageConfigs: PageConfig[];
  onPageConfigsChange: (updated: PageConfig[]) => void;
  orientation: 'portrait' | 'landscape';
  onOrientationChange: (orient: 'portrait' | 'landscape') => void;
  settings: PrintSettingsState;
  onSettingsChange: (settings: PrintSettingsState) => void;
  advancedOptions: AdvancedPrintOptions;
  onAdvancedOptionsChange: (opts: AdvancedPrintOptions) => void;
  pricing: PricingResult;
  bwCount: number;
  colorCount: number;
  onRangeChange: (type: 'all' | 'custom', rangeStr: string) => void;
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
  pricing,
  bwCount,
  colorCount,
  onRangeChange,
}: DocumentStudioProps) {
  const [currentStep, setCurrentStep] = useState<StudioStep>(1);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [showRatesModal, setShowRatesModal] = useState(false);

  const maxAccessibleStep: StudioStep = uploadedBatch ? 3 : 1;

  const goToStep = (step: StudioStep) => {
    setDirection(step > currentStep ? 'forward' : 'backward');
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const animClass = direction === 'forward' ? 'animate-slide-right' : 'animate-slide-left';

  return (
    <div className="space-y-4">
      {/* Studio Progress Stepper (Always visible at top) */}
      <StudioStepper
        currentStep={currentStep}
        onStepClick={goToStep}
        maxAccessibleStep={maxAccessibleStep}
        totalPages={uploadedBatch?.totalPages}
        fileName={uploadedBatch?.fileName}
      />

      {/* =========================================================
          STAGE 1: DOCUMENT UPLOAD & VALIDATION
          ========================================================= */}
      {currentStep === 1 && (
        <div className={`space-y-4 ${animClass}`}>
          {/* Hero Header */}
          <div className="text-center pt-2 pb-1">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-300 text-[11px] font-bold mb-2 shadow-xs">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              <span className="uppercase tracking-widest">Self-Service Campus Kiosk</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              Upload Your <span className="gradient-text-primary">Document</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              PDF, Word (.docx), PowerPoint (.pptx), or Images. Automatic A4 layout &amp; page detection.
            </p>
          </div>

          {/* Bulk Discount Announcement Banner */}
          <BulkDiscountBanner
            pricing={pricing}
            onLearnMore={() => setShowRatesModal(true)}
          />

          {/* File Upload Box */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                1. Select or Drop File
              </span>
              <button
                type="button"
                onClick={() => setShowRatesModal(true)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Rate Card</span>
              </button>
            </div>

            <FileUpload
              uploadedBatch={uploadedBatch}
              onBatchUploaded={(data) => {
                onBatchUploaded(data);
                if (data) {
                  // Promptly enable advancement
                  setDirection('forward');
                }
              }}
            />
          </div>

          {/* If document is already staged, show prominent Continue Action */}
          {uploadedBatch && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/70 via-slate-900 to-indigo-950/80 border-2 border-indigo-500/50 shadow-xl shadow-indigo-500/15 flex flex-col sm:flex-row items-center justify-between gap-3 animate-scale-in">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="w-11 h-11 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-bold text-white truncate max-w-[240px]">
                    {uploadedBatch.fileName}
                  </p>
                  <p className="text-[11px] text-slate-300">
                    <strong className="text-indigo-300 font-bold">{uploadedBatch.totalPages} pages</strong> ready to customize
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => goToStep(2)}
                className="w-full sm:w-auto py-3 px-6 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98] shrink-0"
              >
                <span>Customize Pages &amp; Colors</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Feature Teasers */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="glass-bento rounded-2xl p-3.5 flex items-start space-x-2.5 cursor-default">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Hybrid Color</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  B&amp;W rate for text, Color only for photo pages.
                </p>
              </div>
            </div>

            <div className="glass-bento rounded-2xl p-3.5 flex items-start space-x-2.5 cursor-default">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">15-Min Purge</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Automated security. Zero persistent storage.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          STAGE 2: VISUAL PAGE STUDIO (CANVAS & RANGE COMBINED)
          ========================================================= */}
      {currentStep === 2 && uploadedBatch && (
        <div className={`space-y-4 ${animClass}`}>
          {/* Header with quick stats */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-slate-900/60 border border-white/8">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-white">Interactive Page Studio</h3>
                <p className="text-[10px] text-slate-400">
                  Tap any thumbnail to toggle Color (₹7/6) vs B&amp;W (₹4/3)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                {bwCount} B&amp;W
              </span>
              <span className="px-2 py-0.5 rounded-md bg-pink-950/60 text-pink-300 border border-pink-500/20 font-mono">
                {colorCount} Color
              </span>
            </div>
          </div>

          {/* Page Inspector Canvas */}
          <PageVisualizer
            totalPages={uploadedBatch.totalPages}
            downloadUrl={uploadedBatch.downloadUrl}
            fileKey={uploadedBatch.fileKey}
            rawFiles={uploadedBatch.rawFiles}
            pageConfigs={pageConfigs}
            onChange={onPageConfigsChange}
            orientation={orientation}
            onOrientationChange={onOrientationChange}
          />

          {/* Page Range Selector */}
          <PageRangeSelector
            totalPages={uploadedBatch.totalPages}
            pageConfigs={pageConfigs}
            onPageConfigsChange={onPageConfigsChange}
            pageRangeType={settings.pageRangeType}
            customPageRange={settings.customPageRange}
            onRangeChange={onRangeChange}
          />

          {/* Navigation Bar */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Change File</span>
            </button>

            <button
              type="button"
              onClick={() => goToStep(3)}
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all active:scale-[0.98]"
            >
              <span>Next: Print &amp; Pay (₹{pricing.totalPrice})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          STAGE 3: PRINT PREFERENCES & CHECKOUT
          ========================================================= */}
      {currentStep === 3 && uploadedBatch && (
        <div className={`space-y-4 ${animClass}`}>
          {/* Top Bar with Back action */}
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={() => goToStep(2)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Page Customizer</span>
            </button>
            <span className="text-[11px] text-slate-400 font-mono">
              {uploadedBatch.fileName}
            </span>
          </div>

          {/* Print Preferences (Duplex & Copies) */}
          <PrintSettings
            totalPages={uploadedBatch.totalPages}
            settings={settings}
            onChange={onSettingsChange}
            bwCount={bwCount}
            colorCount={colorCount}
            pageConfigs={pageConfigs}
            onPageConfigsChange={onPageConfigsChange}
          />

          {/* Advanced Settings Drawer */}
          <AdvancedSettings
            options={advancedOptions}
            onChange={onAdvancedOptionsChange}
            copies={settings.copies}
          />

          {/* Bulk Discount Card */}
          <BulkDiscountBanner
            pricing={pricing}
            onLearnMore={() => setShowRatesModal(true)}
          />

          {/* Final Cost Summary & Razorpay Web Checkout */}
          <CostSummary
            pricing={pricing}
            fileKey={uploadedBatch.fileKey}
            fileName={uploadedBatch.fileName}
            totalPages={uploadedBatch.totalPages}
            pageRange={settings.pageRangeType === 'all' ? 'All' : settings.customPageRange}
            pageConfigs={pageConfigs}
          />
        </div>
      )}

      {/* Official Kiosk Rate Card Modal */}
      {showRatesModal && (
        <div
          onClick={() => setShowRatesModal(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in-up"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card max-w-sm w-full rounded-3xl p-5 border border-indigo-500/30 text-xs space-y-3 animate-scale-in"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10 font-bold text-white">
              <span>Official Kiosk Rate Card</span>
              <button
                type="button"
                onClick={() => setShowRatesModal(false)}
                className="text-slate-400 hover:text-white w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/5"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-[11px]">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5">
                <p className="font-bold text-white mb-1">Standard Rate (1–9 pages)</p>
                <p className="text-slate-300">• B&amp;W Single: <strong className="text-emerald-400">₹4/pg</strong></p>
                <p className="text-slate-300">• B&amp;W Double: <strong className="text-emerald-400">₹6/sheet</strong> (₹3/pg)</p>
                <p className="text-slate-300">• Color Single: <strong className="text-pink-400">₹7/pg</strong></p>
                <p className="text-slate-300">• Color Double: <strong className="text-pink-400">₹10/sheet</strong> (₹5/pg)</p>
              </div>

              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
                <p className="font-bold text-emerald-300 mb-1 flex items-center gap-1">
                  <span>🎒 Assignment Saver (10–29 pages)</span>
                  <span className="text-[9px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-400">Save 25%</span>
                </p>
                <p className="text-slate-300">• B&amp;W Single: <strong className="text-emerald-300">₹3/pg</strong></p>
                <p className="text-slate-300">• B&amp;W Double: <strong className="text-emerald-300">₹5/sheet</strong></p>
                <p className="text-slate-300">• Color Single: <strong className="text-pink-300">₹6/pg</strong></p>
                <p className="text-slate-300">• Color Double: <strong className="text-pink-300">₹8/sheet</strong></p>
              </div>

              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30">
                <p className="font-bold text-indigo-300 mb-1 flex items-center gap-1">
                  <span>👑 Mega Bulk Saver (30+ pages)</span>
                  <span className="text-[9px] bg-indigo-500/20 px-1.5 py-0.5 rounded text-indigo-400">Save 38%</span>
                </p>
                <p className="text-slate-300">• B&amp;W Single: <strong className="text-indigo-300">₹2.50/pg</strong></p>
                <p className="text-slate-300">• B&amp;W Double: <strong className="text-indigo-300">₹4/sheet</strong> (₹2/pg!)</p>
                <p className="text-slate-300">• Color Single: <strong className="text-pink-300">₹5/pg</strong></p>
                <p className="text-slate-300">• Color Double: <strong className="text-pink-300">₹7/sheet</strong></p>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 text-center">
              * Rates apply automatically based on total sheet volume.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
