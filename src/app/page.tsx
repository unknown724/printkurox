'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { UploadedBatchData } from '@/components/FileUpload';
import { PrintSettingsState } from '@/components/PrintSettings';
import { AdvancedPrintOptions } from '@/components/AdvancedSettings';
import { calculatePricing, PageConfig } from '@/lib/pricing';
import { pagesToRangeString } from '@/lib/pdf-utils';
import { DocumentStudio } from '@/components/studio/DocumentStudio';
import { BorderBeam } from '@/components/ui/BorderBeam';
import { Crown, ChevronRight } from 'lucide-react';
import { PhotoLayoutSettings } from '@/components/studio/PhotoLayoutSelector';
import { EnhanceMode } from '@/lib/image-enhancer';

export default function HomePage() {
  const [uploadedBatch, setUploadedBatch] = useState<UploadedBatchData | null>(null);
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>([]);
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [_printerOnline, setPrinterOnline] = useState(true);

  // Photo & Page Layout Settings (Windows Photo & Adobe Acrobat style)
  const [layoutSettings, setLayoutSettings] = useState<PhotoLayoutSettings>({
    layoutMode: '1-up',
    fitMode: 'fill', // Windows "Fit picture to frame" default: fills A4 page cleanly!
    drawBorder: false,
    orientation: 'auto',
    textOverlay: {
      enabled: false,
    },
  });

  // Document Enhancer Mode (Default: 'none' / Original photo)
  const [enhanceMode, setEnhanceMode] = useState<EnhanceMode>('none');

  const [settings, setSettings] = useState<PrintSettingsState>({
    colorMode: 'bw',
    isDuplex: false,
    copies: 1,
    pageRangeType: 'all',
    customPageRange: 'All',
  });
  const [advancedOptions, setAdvancedOptions] = useState<AdvancedPrintOptions>({
    scaling: 'fit',
    customScale: 100,
    quality: 'standard',
    margins: 'standard',
    collate: true,
    documentSize: 'A4',
    paperType: 'plain',
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
        orientation: orientation === 'auto' ? undefined : orientation,
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
    layoutMode: layoutSettings.layoutMode,
    customCols: layoutSettings.customCols,
    customRows: layoutSettings.customRows,
  });

  const bwCount = pageConfigs.filter((p) => p.included && p.colorMode === 'bw').length;
  const colorCount = pageConfigs.filter((p) => p.included && p.colorMode === 'color').length;

  return (
    <div
      id="kiosk-studio"
      className={`w-full mx-auto px-2.5 sm:px-4 py-2 sm:py-3.5 space-y-2.5 sm:space-y-3 animate-fade-in-up transition-all duration-300 ${
        uploadedBatch ? 'max-w-3xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1240px]' : 'max-w-xl'
      }`}
    >
      {/* Admin Verified Alert (Mobile Responsive) */}
      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 shadow-xs">
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

      {/* Document Studio Card with Qronos Obsidian Glassmorphism & Moving Border Beam */}
      <div className="relative rounded-2xl border border-zinc-200/80 dark:border-white/[0.10] bg-white dark:bg-[#0c0c0e] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.055),transparent_70%),linear-gradient(#0e0e12,#09090c)] backdrop-blur-2xl p-2.5 sm:p-3.5 lg:p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.1)] overflow-hidden">
        {/* Top-Middle Luminous Specular Flare (Permanent Top Center Shining Effect) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 sm:w-72 h-[2.5px] bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_16px_rgba(255,255,255,0.95)] pointer-events-none z-30" />
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 w-64 sm:w-88 h-16 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.25),transparent_75%)] pointer-events-none z-20" />

        {/* Bottom-Middle Luminous Specular Flare (Permanent Bottom Center Shining Effect) */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 sm:w-72 h-[2.5px] bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_16px_rgba(255,255,255,0.95)] pointer-events-none z-30" />
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 w-64 sm:w-88 h-16 bg-[radial-gradient(ellipse_at_bottom,rgba(255,255,255,0.25),transparent_75%)] pointer-events-none z-20" />

        {/* Dynamic Specular Border Beam gliding seamlessly around perimeter */}
        <BorderBeam duration={12} borderWidth={2} borderRadius={16} colorFrom="rgba(255, 255, 255, 1)" />

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
          layoutSettings={layoutSettings}
          onLayoutSettingsChange={setLayoutSettings}
          enhanceMode={enhanceMode}
          onEnhanceModeChange={setEnhanceMode}
          pricing={pricing}
          bwCount={bwCount}
          colorCount={colorCount}
          onRangeChange={handleRangeChange}
        />
      </div>
    </div>
  );
}
