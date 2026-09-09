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
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
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
          {uploadedBatch && (
            <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between gap-3 animate-scale-in">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300 shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {uploadedBatch.fileName}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {uploadedBatch.totalPages} pages ready
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => goToStep(2)}
                className="h-9 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-medium text-xs flex items-center gap-1.5 shrink-0 shadow-xs transition-colors"
              >
                <span>Customize Pages</span>
                <ArrowRight className="w-3.5 h-3.5" />
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
          {/* Top Info Bar */}
          <div className="flex items-center justify-between px-0.5 pt-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Page Inspector
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Tap any page to toggle B&amp;W or Color
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[11px] border border-zinc-200 dark:border-zinc-700">
                {bwCount} B&amp;W
              </span>
              <span className="px-2 py-0.5 rounded-md bg-pink-500/10 text-pink-600 dark:text-pink-400 font-mono text-[11px] border border-pink-500/20">
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

          {/* Bottom Actions */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={() => goToStep(3)}
              className="h-9 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-medium flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <span>Continue to Checkout (₹{pricing.totalPrice})</span>
              <ArrowRight className="w-3.5 h-3.5" />
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
