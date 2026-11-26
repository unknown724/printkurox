'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

const LATEST_ORIGIN = 'https://printkurox.pages.dev';

/**
 * Displays a clear migration banner and automatically redirects visitors
 * who open the deprecated Vercel deployment (*.vercel.app) to Cloudflare Pages.
 */
export function VercelRedirectBanner() {
  const [targetUrl, setTargetUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = window.location.hostname.toLowerCase();
    if (!host.endsWith('.vercel.app')) return;

    const destination = `${LATEST_ORIGIN}${window.location.pathname}${window.location.search}${window.location.hash}`;
    setTargetUrl(destination);

    const timer = setTimeout(() => {
      window.location.replace(destination);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  if (!targetUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-zinc-900 p-6 text-center shadow-2xl space-y-4">
        <div className="mx-auto w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-white">PrintKurox Moved to a Faster Server</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            This old Vercel link is deprecated. Redirecting you automatically to the latest website:
          </p>
          <p className="text-xs font-mono text-amber-300 break-all pt-1">{targetUrl}</p>
        </div>
        <a
          href={targetUrl}
          className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <span>Go to Latest Website</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
