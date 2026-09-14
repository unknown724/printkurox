'use client';

import React, { useState, useEffect } from 'react';
import { Smartphone, X, Check, Share2, Download, ArrowUpRight } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | 'desktop'>('desktop');

  useEffect(() => {
    // Detect if already installed (standalone PWA)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
    }

    // Detect user platform for targeted instructions
    const ua = navigator.userAgent.toLowerCase();
    if (/android/i.test(ua)) {
      setPlatform('android');
    } else if (/iphone|ipad|ipod/i.test(ua)) {
      setPlatform('ios');
    } else {
      setPlatform('desktop');
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
        }
      } catch {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  // If already installed as PWA, render a discreet confirmed state or return null
  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="h-8 px-2.5 sm:px-3 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] border border-zinc-200/80 dark:border-white/10 text-zinc-700 dark:text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-all shadow-2xs hover:scale-102 active:scale-98 cursor-pointer"
        title="Install PrintKurox as an app for 1-tap WhatsApp sharing"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
        </span>
        <Smartphone className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
        <span className="hidden xs:inline sm:inline">Install App</span>
      </button>

      {/* Professional Install Instructions Modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="relative w-full max-w-sm rounded-3xl bg-zinc-950 border border-zinc-800 p-6 text-zinc-100 shadow-2xl space-y-4">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header with App Badge */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shrink-0">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Install PrintKurox</h3>
                <p className="text-xs text-zinc-400">1-Tap WhatsApp Sharing App</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Installing PrintKurox adds it directly to your system <b>Share sheet</b> so you can send documents straight from WhatsApp to print!
            </p>

            {/* Platform-Specific Step-by-Step Guide */}
            <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-2 text-xs">
              {platform === 'android' ? (
                <>
                  <div className="font-semibold text-indigo-400 flex items-center gap-1.5">
                    <span>Android (Google Chrome):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
                    <li>
                      Tap the <b>3 dots menu (⋮)</b> in the top-right corner of Chrome.
                    </li>
                    <li>
                      Select <b>&ldquo;Install app&rdquo;</b> (or <b>&ldquo;Add to Home screen&rdquo;</b>).
                    </li>
                    <li>
                      Open WhatsApp &rarr; tap your document &rarr; tap <b>Share &rarr; PrintKurox</b>!
                    </li>
                  </ol>
                </>
              ) : platform === 'ios' ? (
                <>
                  <div className="font-semibold text-indigo-400 flex items-center gap-1.5">
                    <span>iPhone / iPad (Safari):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
                    <li>
                      Tap the <b>Share icon</b> (square with arrow pointing up) at the bottom.
                    </li>
                    <li>
                      Scroll down and tap <b>&ldquo;Add to Home Screen&rdquo;</b>.
                    </li>
                    <li>Tap <b>Add</b> in the top-right corner.</li>
                  </ol>
                </>
              ) : (
                <>
                  <div className="font-semibold text-indigo-400 flex items-center gap-1.5">
                    <span>Desktop (Chrome / Edge):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-zinc-300">
                    <li>Look at your browser&apos;s address bar on the right side.</li>
                    <li>
                      Click the <b>Install app icon (⊕ or computer with arrow)</b>.
                    </li>
                    <li>Click <b>Install</b> to launch as a standalone desktop app.</li>
                  </ol>
                </>
              )}
            </div>

            {deferredPrompt && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>Install Now</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="w-full py-2 text-center text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
