'use client';

import React, { useState } from 'react';
import { StudioStepper, StudioStep } from './StudioStepper';
import { FileUpload, UploadedBatchData } from '@/components/FileUpload';
import { PrintSettings, PrintSettingsState } from '@/components/PrintSettings';
import { PageRangeSelector } from '@/components/PageRangeSelector';
import { CostSummary } from '@/components/CostSummary';
import { PageVisualizer } from '@/components/PageVisualizer';
import { AdvancedSettings, AdvancedPrintOptions } from '@/components/AdvancedSettings';
import { PricingResult, PageConfig } from '@/lib/pricing';
import {
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  FileText,
  Layers,
  Minus,
  Plus,
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
  const [showRatesModal, setShowRatesModal] = useState(false);

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
              onClick={() => setShowRatesModal(true)}
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
            <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#16161c]/90 backdrop-blur-xl flex items-center justify-between gap-3 animate-scale-in shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 dark:bg-white/10 border border-blue-500/20 dark:border-white/15 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
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
                className="relative overflow-hidden group h-9 px-4 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-[0_2px_12px_rgba(255,255,255,0.18)] transition-all active:scale-[0.98] cursor-pointer"
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
          {/* Top Info Bar with Copies Stepper */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-0.5 pt-1">
            <div className="flex items-center gap-2 min-w-0">
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

            {/* Stage 2 Controls: Copies Stepper & Counts */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Copies Stepper */}
              <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 rounded-full px-2.5 py-1 shadow-2xs">
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 pl-0.5">Copies</span>
                <button
                  type="button"
                  onClick={() => onSettingsChange({ ...settings, copies: Math.max(1, settings.copies - 1) })}
                  disabled={settings.copies <= 1}
                  className="w-5 h-5 rounded-full bg-white dark:bg-white/[0.08] border border-zinc-200 dark:border-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/15 transition-colors"
                  title="Decrease copies"
                  aria-label="Decrease copies"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-xs font-semibold font-mono tabular-nums px-1 text-zinc-900 dark:text-white min-w-[1.2rem] text-center">
                  {settings.copies}
                </span>
                <button
                  type="button"
                  onClick={() => onSettingsChange({ ...settings, copies: Math.min(50, settings.copies + 1) })}
                  disabled={settings.copies >= 50}
                  className="w-5 h-5 rounded-full bg-white dark:bg-white/[0.08] border border-zinc-200 dark:border-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/15 transition-colors"
                  title="Increase copies"
                  aria-label="Increase copies"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {/* B&W / Color Clean Counts */}
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

          {/* Bottom Actions */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={() => goToStep(3)}
              className="relative overflow-hidden group h-9 px-4 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold flex items-center gap-1.5 shadow-[0_2px_12px_rgba(255,255,255,0.18)] transition-all active:scale-[0.98] cursor-pointer"
            >
              <span>Continue to Checkout (₹{pricing.totalPrice})</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-950 stroke-[2.2] group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          STAGE 3: PRINT PREFERENCES & CHECKOUT
          ========================================================= */}
      {currentStep === 3 && uploadedBatch && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="flex items-center justify-between px-0.5 pt-1">
            <button
              type="button"
              onClick={() => goToStep(2)}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Pages</span>
            </button>
            <span className="text-[11px] text-zinc-500 font-mono truncate max-w-[200px]">
              {uploadedBatch.fileName}
            </span>
          </div>

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

          {/* Advanced Settings */}
          <AdvancedSettings
            options={advancedOptions}
            onChange={onAdvancedOptionsChange}
            copies={settings.copies}
          />

          {/* Checkout Breakdown & Razorpay Payment */}
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

      {/* Rate Card Modal */}
      {showRatesModal && (
        <div
          onClick={() => setShowRatesModal(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in-up"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-xl text-xs space-y-3 animate-scale-in"
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800 font-bold text-zinc-900 dark:text-zinc-100">
              <span>Official Kiosk Rate Card</span>
              <button
                type="button"
                onClick={() => setShowRatesModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 w-6 h-6 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">Black &amp; White</p>
                <p className="text-zinc-600 dark:text-zinc-400">• Single-Sided: <span className="font-semibold text-zinc-900 dark:text-zinc-100">₹4 / sheet</span></p>
                <p className="text-zinc-600 dark:text-zinc-400">• Double-Sided: <span className="font-semibold text-zinc-900 dark:text-zinc-100">₹6 / sheet</span></p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">Full Color</p>
                <p className="text-zinc-600 dark:text-zinc-400">• Single-Sided: <span className="font-semibold text-zinc-900 dark:text-zinc-100">₹7 / sheet</span></p>
                <p className="text-zinc-600 dark:text-zinc-400">• Double-Sided: <span className="font-semibold text-zinc-900 dark:text-zinc-100">₹10 / sheet</span></p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1">
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">Volume Discounts</p>
                <p className="text-zinc-600 dark:text-zinc-400">• 10+ sheets: <span className="font-semibold text-zinc-900 dark:text-zinc-100">₹3/sheet</span></p>
                <p className="text-zinc-600 dark:text-zinc-400">• 30+ sheets: <span className="font-semibold text-zinc-900 dark:text-zinc-100">₹2.50/sheet</span></p>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 text-center">
              Automatic A4 layout • Hybrid color per page • 15-min auto-purge
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
