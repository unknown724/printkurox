'use client';

import React from 'react';
import Link from 'next/link';
import { VortexCanvas } from './VortexCanvas';
import { StarButton } from './StarButton';
import { PaymentMarquee } from './PaymentMarquee';
import {
  ChevronRight,
  Printer,
  Sparkles,
  Zap,
  ShieldCheck,
  FileCheck,
  Percent,
} from 'lucide-react';

interface QronosLandingHeroProps {
  onGetStarted: () => void;
  onOpenRates: () => void;
  printerOnline?: boolean;
}

export function QronosLandingHero({
  onGetStarted,
  onOpenRates,
  printerOnline = true,
}: QronosLandingHeroProps) {
  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-black text-white font-sans">
      {/* 3D Wireframe Funnel Vortex Background Canvas */}
      <div className="absolute inset-0 z-0">
        <VortexCanvas />
      </div>

      {/* Decorative Corner Guidelines & Crosshairs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-1/2 z-20 w-full max-w-[1344px] -translate-x-1/2"
      >
        <span className="absolute inset-y-0 left-3 w-px bg-white/10 mix-blend-difference hidden sm:block" />
        <span className="absolute inset-y-0 right-3 w-px bg-white/10 mix-blend-difference hidden sm:block" />
      </div>

      {/* Header Bar */}
      <header className="relative z-30 w-full max-w-[1344px] mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between">
          {/* Corner Crosshairs */}
          <span className="crosshair-tl" />
          <span className="crosshair-tr" />
          <span className="crosshair-bl" />
          <span className="crosshair-br" />

          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="relative w-8 h-8 rounded-xl bg-zinc-900 border border-white/15 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id="qronos-gemini-logo" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4285F4" />
                    <stop offset="50%" stopColor="#9B72CF" />
                    <stop offset="100%" stopColor="#D96570" />
                  </linearGradient>
                </defs>
                <path
                  d="M6 9V3H18V9"
                  stroke="url(#qronos-gemini-logo)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 18H4C2.89543 18 2 17.1046 2 16V11C2 9.89543 2.89543 9 4 9H20C21.1046 9 22 9.89543 22 11V16C22 17.1046 21.1046 18 20 18H18"
                  stroke="url(#qronos-gemini-logo)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="6"
                  y="14"
                  width="12"
                  height="8"
                  rx="1"
                  fill="url(#qronos-gemini-logo)"
                />
                <circle cx="18" cy="12" r="1" fill="#ffffff" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider font-mono uppercase text-white">
                PRINTKUROX
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <span>{printerOnline ? 'EPSON ONLINE' : 'READY'}</span>
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-8 text-xs font-medium text-zinc-400">
            <button
              onClick={onGetStarted}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Upload Document
            </button>
            <button
              onClick={onOpenRates}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Pricing & Tiers
            </button>
            <a href="#features" className="hover:text-white transition-colors">
              How It Works
            </a>
            <Link
              href="/adminkurox"
              className="hover:text-amber-400 transition-colors"
            >
              Admin Portal
            </Link>
          </nav>

          {/* Top Right Star Button */}
          <div className="flex items-center space-x-2">
            <StarButton onClick={onGetStarted} size="sm">
              <span>GET STARTED</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </StarButton>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-20 flex-1 flex flex-col justify-center items-center text-center px-4 sm:px-6 py-12 sm:py-20 max-w-4xl mx-auto w-full">
        {/* Subtle pill tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-md text-[11px] font-mono text-zinc-300 mb-6 animate-scale-in">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>Next-Gen Autonomous Cloud Printing Kiosk</span>
        </div>

        {/* Big Bold Display Headline matching screenshot */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.08] max-w-3xl">
          <span>The autonomous cloud printing</span>{' '}
          <span className="block bg-gradient-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
            system for campus & business
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-zinc-400 text-sm sm:text-base md:text-lg mt-5 max-w-xl leading-relaxed font-normal">
          Coordinate print jobs directly from your phone or laptop.
          Zero wait time. Smart duplex, color inspection, and instant QR pickup.
        </p>

        {/* Action Buttons Matching Screenshot */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mt-8 sm:mt-10 w-full max-w-md">
          <StarButton onClick={onGetStarted} size="lg" className="w-full sm:w-auto">
            <span>GET STARTED</span>
            <ChevronRight className="w-4 h-4" />
          </StarButton>

          <button
            type="button"
            onClick={onOpenRates}
            className="w-full sm:w-auto h-12 px-7 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-bold uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <span>RATES & DISCOUNTS</span>
          </button>
        </div>

        {/* Quick Spec Tags */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-8 text-xs text-zinc-400 font-mono">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>₹4.00 B&W • ₹7.00 Color</span>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-emerald-400" />
            <span>Up to ₹2.50/pg Bulk Discount</span>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Razorpay & UPI Protected</span>
          </span>
        </div>
      </main>

      {/* Bottom Payment Marquee */}
      <div className="relative z-20 w-full mt-auto">
        <PaymentMarquee />
      </div>
    </div>
  );
}
