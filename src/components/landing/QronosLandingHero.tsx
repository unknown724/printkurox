'use client';

import React from 'react';
import Link from 'next/link';
import { VortexCanvas } from './VortexCanvas';
import { StarButton } from './StarButton';
import { PaymentMarquee } from './PaymentMarquee';

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
    <div className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-black text-white font-sans selection:bg-white/20">
      {/* 3D Wireframe Funnel Vortex Background Canvas */}
      <div className="absolute inset-0 z-0">
        <VortexCanvas />
      </div>

      {/* Outer Grid Guidelines with Corner Crosshairs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-1/2 z-20 w-full max-w-[1344px] -translate-x-1/2"
      >
        <span className="absolute inset-y-0 left-4 sm:left-8 w-px bg-white/[0.08] mix-blend-difference" />
        <span className="absolute inset-y-0 right-4 sm:right-8 w-px bg-white/[0.08] mix-blend-difference" />
      </div>

      {/* Header Bar - Exactly matching Qronos */}
      <header className="relative z-30 w-full max-w-[1344px] mx-auto px-4 sm:px-8 pt-5 sm:pt-6">
        <div className="relative border-b border-white/[0.08] pb-5 flex items-center justify-between">
          {/* Corner Crosshairs */}
          <span className="absolute -top-1.5 -left-1 text-white/30 text-xs select-none font-mono">+</span>
          <span className="absolute -top-1.5 -right-1 text-white/30 text-xs select-none font-mono">+</span>
          <span className="absolute -bottom-2 -left-1 text-white/30 text-xs select-none font-mono">+</span>
          <span className="absolute -bottom-2 -right-1 text-white/30 text-xs select-none font-mono">+</span>

          {/* Left: Brand Logo + Name */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={onGetStarted}>
            <div className="w-6 h-6 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-white">
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-base font-bold tracking-widest font-mono uppercase text-white">
              PRINTKUROX
            </span>
          </div>

          {/* Center: Clean Nav Links (No card pill) */}
          <nav className="hidden md:flex items-center space-x-8 text-sm font-normal text-neutral-400">
            <button
              onClick={onGetStarted}
              className="hover:text-white transition-colors cursor-pointer"
            >
              About
            </button>
            <button
              onClick={onGetStarted}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={onOpenRates}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Pricing
            </button>
            <button
              onClick={onOpenRates}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Discounts
            </button>
            <Link
              href="/adminkurox"
              className="hover:text-neutral-200 transition-colors"
            >
              Admin
            </Link>
          </nav>

          {/* Right: Get Started Star Button */}
          <div className="flex items-center space-x-3">
            <StarButton onClick={onGetStarted} size="sm">
              <span>GET STARTED</span>
              <span className="ml-1 tracking-tighter text-xs">»</span>
            </StarButton>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-20 flex-1 flex flex-col justify-center items-center text-center px-4 sm:px-6 py-16 sm:py-24 max-w-5xl mx-auto w-full">
        {/* Big Bold Headline matching Qronos */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-light sm:font-normal tracking-tight text-white leading-[1.05] max-w-4xl">
          <span>The autonomous cloud printing</span>
          <span className="block bg-gradient-to-r from-neutral-200 via-neutral-400 to-neutral-600 bg-clip-text text-transparent">
            system for campus & business
          </span>
        </h1>

        {/* 2-line Subtitle matching Qronos */}
        <p className="text-neutral-400 text-sm sm:text-base md:text-lg mt-6 max-w-xl mx-auto leading-relaxed font-normal">
          Coordinate print jobs directly from your phone or laptop.
          <span className="block text-neutral-400">
            Zero wait time. Smart duplex, color inspection, and instant QR pickup.
          </span>
        </p>

        {/* Side-by-side Action Buttons matching Qronos */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mt-8 sm:mt-10">
          <StarButton onClick={onGetStarted} size="lg" className="w-full sm:w-auto h-11 px-6">
            <span>GET STARTED</span>
            <span className="ml-1 tracking-tighter text-sm">»</span>
          </StarButton>

          <button
            type="button"
            onClick={onOpenRates}
            className="w-full sm:w-auto h-11 px-7 rounded-full bg-white hover:bg-neutral-200 text-black text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center justify-center active:scale-[0.98] cursor-pointer"
          >
            <span>RATES & DISCOUNTS</span>
          </button>
        </div>
      </main>

      {/* Bottom Flat Logo Marquee directly over the flared vortex canvas */}
      <div className="relative z-20 w-full pb-3">
        <PaymentMarquee />
      </div>
    </div>
  );
}
