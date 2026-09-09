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
    <div className="space-y-4 pb-8 sm:pb-12">
      {/* Admin Verified Banner (Compact shadcn Alert) */}
      {isAdmin && (
        <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-amber-500/25 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200">
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

      {/* 21st.dev Model 1 Studio Wizard Workflow */}
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
  );
}
