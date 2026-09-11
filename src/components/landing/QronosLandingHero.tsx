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
  printerOnline: _printerOnline = true,
}: QronosLandingHeroProps) {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-black text-white font-sans selection:bg-white/20">
      {/* Outer Grid Guidelines with Corner Crosshairs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-1/2 z-[51] w-full max-w-[1400px] -translate-x-1/2"
      >
        <span className="absolute inset-y-0 left-0 w-px bg-white/15 mix-blend-difference lg:left-5" />
        <span className="absolute inset-y-0 right-0 w-px bg-white/15 mix-blend-difference lg:right-5" />
        <span className="absolute inset-y-0 left-px w-px bg-white/15 mix-blend-difference lg:left-7" />
        <span className="absolute inset-y-0 right-px w-px bg-white/15 mix-blend-difference lg:right-7" />
      </div>

      {/* Header Bar - Exactly matching Qronos source */}
      <header className="fixed top-3 left-0 right-0 z-50 transition-all duration-500">
        <nav className="relative mx-auto w-full max-w-[1344px] before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-px before:bg-white/10 after:absolute after:inset-x-0 after:bottom-0 after:z-10 after:h-px after:bg-white/10 lg:w-[calc(100%-3.5rem)] bg-transparent">
          <div className="flex h-12 items-center justify-between px-5 transition-all duration-500">
            {/* Logo */}
            <div
              onClick={onGetStarted}
              className="flex items-center gap-2.5 cursor-pointer group"
              aria-label="PRINTKUROX home"
            >
              <div className="w-7 h-7 flex items-center justify-center">
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

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-12">
              <button
                onClick={onGetStarted}
                className="text-sm transition-colors duration-300 relative group text-white/70 hover:text-white cursor-pointer"
              >
                About
                <span className="absolute -bottom-1 left-0 w-0 h-px transition-all duration-300 group-hover:w-full bg-white" />
              </button>
              <button
                onClick={onGetStarted}
                className="text-sm transition-colors duration-300 relative group text-white/70 hover:text-white cursor-pointer"
              >
                Features
              </button>
              <button
                onClick={onOpenRates}
                className="text-sm transition-colors duration-300 relative group text-white/70 hover:text-white cursor-pointer"
              >
                Pricing
              </button>
              <button
                onClick={onOpenRates}
                className="text-sm transition-colors duration-300 relative group text-white/70 hover:text-white cursor-pointer"
              >
                Discounts
              </button>
              <Link
                href="/adminkurox"
                className="text-sm transition-colors duration-300 relative group text-white/70 hover:text-white"
              >
                Admin
              </Link>
            </div>

            {/* Right: GET STARTED button */}
            <div className="hidden md:flex items-center">
              <StarButton onClick={onGetStarted} size="sm">
                <span>GET STARTED</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  color="currentColor"
                  strokeWidth="1.8"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M12.5 18C12.5 18 18.5 13.5811 18.5 12C18.5 10.4188 12.5 6 12.5 6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M5.50005 18C5.50005 18 11.5 13.5811 11.5 12C11.5 10.4188 5.5 6 5.5 6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </StarButton>
            </div>
          </div>

          {/* Corner tick marks */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-20 size-3 -translate-x-1/2 -translate-y-1/2 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-[linear-gradient(to_bottom,transparent,rgba(226,232,240,0.65)_50%,transparent)] after:absolute after:left-0 after:top-1/2 after:h-px after:w-full after:-translate-y-1/2 after:bg-[linear-gradient(to_right,transparent,rgba(226,232,240,0.65)_50%,transparent)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 z-20 size-3 translate-x-1/2 -translate-y-1/2 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-[linear-gradient(to_bottom,transparent,rgba(226,232,240,0.65)_50%,transparent)] after:absolute after:left-0 after:top-1/2 after:h-px after:w-full after:-translate-y-1/2 after:bg-[linear-gradient(to_right,transparent,rgba(226,232,240,0.65)_50%,transparent)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 z-20 size-3 -translate-x-1/2 translate-y-1/2 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-[linear-gradient(to_bottom,transparent,rgba(226,232,240,0.65)_50%,transparent)] after:absolute after:left-0 after:top-1/2 after:h-px after:w-full after:-translate-y-1/2 after:bg-[linear-gradient(to_right,transparent,rgba(226,232,240,0.65)_50%,transparent)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 z-20 size-3 translate-x-1/2 translate-y-1/2 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-[linear-gradient(to_bottom,transparent,rgba(226,232,240,0.65)_50%,transparent)] after:absolute after:left-0 after:top-1/2 after:h-px after:w-full after:-translate-y-1/2 after:bg-[linear-gradient(to_right,transparent,rgba(226,232,240,0.65)_50%,transparent)]"
          />
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col justify-center items-start overflow-hidden bg-black">
        {/* Vortex Canvas Background */}
        <div className="absolute inset-y-0 left-1/2 z-0 w-full max-w-[1344px] -translate-x-1/2 overflow-hidden sm:w-[calc(100%-2rem)] lg:w-[calc(100%-3.5rem)]">
          <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000000', overflow: 'hidden' }}>
            <VortexCanvas />
          </div>
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/20 via-transparent to-black/60" />
        </div>

        {/* Hero Center Text Content */}
        <div className="relative z-10 w-full max-w-[1400px] mx-auto px-4 py-28 sm:px-8 sm:py-32 lg:px-14 lg:py-40">
          <div className="mx-auto flex max-w-full flex-col items-center text-center">
            {/* Display Headline with sm:whitespace-nowrap to prevent awkward 4-line wrapping */}
            <div className="mb-6">
              <h1 className="relative z-10 max-w-[22rem] text-balance text-center text-[clamp(2rem,9vw,2.5rem)] font-display leading-[0.96] tracking-tight text-white transition-all duration-1000 sm:max-w-none sm:text-[clamp(2rem,4.6vw,4.5rem)] sm:leading-[0.92]">
                <span className="block sm:whitespace-nowrap">
                  The autonomous cloud printing
                </span>
                <span className="block bg-gradient-to-b from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent sm:whitespace-nowrap">
                  system for campus & business
                </span>
              </h1>
            </div>

            {/* 2-line Subtitle matching Qronos */}
            <p className="relative z-0 mb-8 max-w-[22rem] text-center text-sm leading-relaxed text-white sm:mb-10 sm:max-w-none sm:text-base lg:text-lg transition-all duration-700 delay-150">
              <span className="block sm:whitespace-nowrap">
                Coordinate print jobs directly from your phone or laptop.
              </span>
              <span className="block sm:whitespace-nowrap">
                Zero wait time. Smart duplex, color inspection, and instant QR pickup.
              </span>
            </p>

            {/* Action Buttons matching Qronos */}
            <div className="flex w-full flex-col items-center justify-center gap-3 min-[390px]:flex-row transition-all duration-700 delay-200">
              <StarButton onClick={onGetStarted} size="md" className="h-10 px-5 text-sm font-medium">
                <span>GET STARTED</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  color="currentColor"
                  strokeWidth="1.8"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M12.5 18C12.5 18 18.5 13.5811 18.5 12C18.5 10.4188 12.5 6 12.5 6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M5.50005 18C5.50005 18 11.5 13.5811 11.5 12C11.5 10.4188 5.5 6 5.5 6"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </StarButton>

              <button
                type="button"
                onClick={onOpenRates}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all py-2 relative isolate h-10 overflow-hidden rounded-full border border-white/30 bg-white px-5 text-black hover:bg-white hover:text-black cursor-pointer shadow-xs active:scale-[0.98]"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-[1.125rem] top-0 h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-neutral-950/0 via-neutral-500 to-neutral-950/0"
                />
                <span className="relative z-10">RATES & DISCOUNTS</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Marquee Container matching Qronos layout */}
        <div className="absolute bottom-12 left-0 right-0 transition-all duration-700 delay-500">
          <div className="mx-auto overflow-hidden mask-[linear-gradient(to_right,transparent,black_25%,black_75%,transparent)] w-[calc(100%-2rem)] max-w-[1344px] py-0 lg:w-[calc(100%-3.5rem)]">
            <PaymentMarquee />
          </div>
        </div>
      </section>
    </main>
  );
}
