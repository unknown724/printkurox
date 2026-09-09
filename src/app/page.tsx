'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { UploadedBatchData } from '@/components/FileUpload';
import { PrintSettingsState } from '@/components/PrintSettings';
import { AdvancedPrintOptions } from '@/components/AdvancedSettings';
import { calculatePricing, PageConfig } from '@/lib/pricing';
import { pagesToRangeString } from '@/lib/pdf-utils';
import { DocumentStudio } from '@/components/studio/DocumentStudio';
import { Crown, ChevronRight } from 'lucide-react';

export default function HomePage() {
  const [uploadedBatch, setUploadedBatch] = useState<UploadedBatchData | null>(null);
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>([]);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
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

  return (
    <div id="kiosk-studio" className="w-full max-w-xl mx-auto px-3.5 sm:px-4 py-3 sm:py-6 space-y-3.5 animate-fade-in-up">
      {/* Admin Verified Alert (Mobile Responsive) */}
      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 shadow-xs">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <Crown className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="truncate">
              <strong>Admin Verified:</strong> {deviceName || 'Authorized Device'} · Free Print Active
            </span>
          </div>
          <Link
            href="/adminkurox"
            className="flex items-center gap-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:underline shrink-0"
          >
            Console <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Document Studio Card with Image 1 Qronos Glassmorphism */}
      <div className="relative rounded-[22px] border border-zinc-300 dark:border-[#37333b] bg-white dark:bg-[linear-gradient(145deg,rgba(19,19,21,0.98),rgba(7,7,8,0.98))] p-[5px] shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.7)]">
        <div className="relative overflow-hidden rounded-[16px] border border-zinc-200 dark:border-[#37333b] bg-zinc-50/50 dark:bg-[linear-gradient(145deg,rgba(19,19,21,0.98),rgba(7,7,8,0.98))] p-3.5 sm:p-5 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          {/* Top hairline shimmer sheen matching Image 1 */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[1.125rem] top-0 h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-slate-300/0 via-slate-200/90 to-slate-300/0"
          />
          {/* Bottom subtle glow accent matching Image 1 */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-0 h-px w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          />

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
    </div>
  );
}
