'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

export function AutoUpdateNotifier() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Current client version embedded at build time
    const clientVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
    if (clientVersion === 'dev') {
      // In local dev mode, Next.js handles fast-refresh (HMR) automatically
      return;
    }

    let intervalId: NodeJS.Timeout;

    const checkForUpdates = async () => {
      try {
        const res = await fetch(`/api/version?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        });

        if (!res.ok) return;

        const data = await res.json();
        if (data.version && data.version !== 'dev' && data.version !== clientVersion) {
          console.log(`[AutoUpdate] New version detected: ${data.version} (current: ${clientVersion})`);
          setUpdateAvailable(true);
        }
      } catch (err) {
        // Silently catch network glitches
      }
    };

    // Check after 5 seconds on load
    const initialTimer = setTimeout(checkForUpdates, 5000);

    // Check every 60 seconds
    intervalId = setInterval(checkForUpdates, 60000);

    // Check when user switches back to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdates();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, []);

  const handleUpdate = () => {
    setIsUpdating(true);
    // Force a fresh reload bypassing any browser memory cache
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('_v', Date.now().toString());
    window.location.href = currentUrl.toString();
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900/95 dark:bg-zinc-900/95 text-white border border-emerald-500/40 rounded-2xl shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-100 truncate">
              New Update Available
            </p>
            <p className="text-[11px] text-zinc-400 truncate">
              New features & fixes are ready
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-semibold text-xs rounded-xl shadow transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            {isUpdating ? 'Updating...' : 'Update'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
