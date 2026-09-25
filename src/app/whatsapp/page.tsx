'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  MessageCircle,
  QrCode,
  Download,
  Copy,
  Check,
  ArrowLeft,
  Sparkles,
  Zap,
  ShieldCheck,
  Printer,
  ExternalLink,
  MapPin,
  Clock,
  Layers,
} from 'lucide-react';

const BOT_NUMBER = '+91 93629 80761';
const BOT_RAW = '919362980761';
const WA_DIRECT_URL = `https://wa.me/${BOT_RAW}`;
const WA_PREFILLED_URL = `https://wa.me/${BOT_RAW}?text=Hi%20PrintKurox%2C%20I%20want%20to%20print%20a%20document`;

export default function WhatsAppQrPage() {
  const [copied, setCopied] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'clean' | 'badge' | 'poster' | 'counter'>('clean');

  const handleCopyNumber = () => {
    navigator.clipboard.writeText(BOT_NUMBER);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const assets = {
    clean: {
      title: 'Clean Minimal QR',
      desc: '1200x1200px PNG with embedded WhatsApp logo. Perfect for websites, stickers & documents.',
      src: '/brand/whatsapp_bot_qr_clean.png',
      download: '/brand/whatsapp_bot_qr_clean.png',
      filename: 'PrintKurox_WhatsApp_QR_Clean.png',
      aspect: 'aspect-square',
    },
    badge: {
      title: 'Framed Card / Sticker',
      desc: '1200x1420px Framed badge with clear title, scan instructions, and campus station tags.',
      src: '/brand/whatsapp_bot_qr_badge.png',
      download: '/brand/whatsapp_bot_qr_badge.png',
      filename: 'PrintKurox_WhatsApp_Sticker_Badge.png',
      aspect: 'aspect-[1200/1420]',
    },
    poster: {
      title: 'A4 Wall / Kiosk Poster',
      desc: '1600x2400px High-resolution printable poster for hostel common rooms, shop walls, and notice boards.',
      src: '/brand/whatsapp_bot_poster.jpg',
      download: '/brand/whatsapp_bot_poster.jpg',
      filename: 'PrintKurox_WhatsApp_Kiosk_Poster.jpg',
      aspect: 'aspect-[1600/2400]',
    },
    counter: {
      title: 'Counter / Tabletop Tent Card',
      desc: '1600x900px Landscape card designed for placing directly beside printers and on service counters.',
      src: '/brand/whatsapp_bot_counter_card.png',
      download: '/brand/whatsapp_bot_counter_card.png',
      filename: 'PrintKurox_WhatsApp_Counter_Card.png',
      aspect: 'aspect-[16/9]',
    },
  };

  const activeAsset = assets[selectedFormat];

  return (
    <div className="min-h-screen bg-[#070b0e] text-zinc-100 selection:bg-emerald-500 selection:text-black pb-20">
      {/* Top Ambient Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-96 bg-emerald-500/10 blur-[130px] pointer-events-none rounded-full" />

      {/* Header Navigation */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070b0e]/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Kiosk</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              WhatsApp Bot Active
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 pt-8 sm:pt-12">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
            <MessageCircle className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" />
            <span>Official AutoPrint / PrintKurox Bot</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Scan to Print on WhatsApp
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
            Send documents, college notes, or photos directly to{' '}
            <strong className="text-white font-semibold">{BOT_NUMBER}</strong> on WhatsApp.
            No app download required. Instant automated pickup.
          </p>

          {/* Quick Action CTA Bar */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a
              href={WA_PREFILLED_URL}
              target="_blank"
              rel="noreferrer"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-emerald-950/40 hover:scale-[1.02] active:scale-95 transition-all"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>Open in WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>

            <button
              onClick={handleCopyNumber}
              className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 text-zinc-200 hover:text-white font-medium text-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Number Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-zinc-400" />
                  <span>Copy {BOT_NUMBER}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Interactive Asset Viewer & QR Preview */}
        <div className="mt-10 sm:mt-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Asset Selection & Details */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Choose Professional Template</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Select a layout optimized for printing posters, acrylic tent cards, or stickers.
              </p>
            </div>

            {/* Template Selector Pills */}
            <div className="space-y-2.5">
              {(Object.keys(assets) as (keyof typeof assets)[]).map((key) => {
                const item = assets[key];
                const isSelected = selectedFormat === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedFormat(key)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-950/30'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl mt-0.5 shrink-0 ${
                        isSelected ? 'bg-emerald-500 text-black' : 'bg-white/10 text-zinc-300'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-white">{item.title}</span>
                        {isSelected && (
                          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Asset Actions */}
            <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] space-y-3">
              <a
                href={activeAsset.download}
                download={activeAsset.filename}
                className="w-full py-3 rounded-xl bg-white hover:bg-zinc-100 text-black font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] active:scale-95 transition-all"
              >
                <Download className="w-4 h-4 text-black" />
                <span>Download {activeAsset.title} (High-Res)</span>
              </a>

              <div className="flex items-center justify-between text-xs text-zinc-400 px-1 pt-1">
                <span>300 DPI Print Ready</span>
                <span>Level H Error Correction</span>
              </div>
            </div>

            {/* Campus Station Pickup Points */}
            <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] space-y-3">
              <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                <span>Supported Campus Stations</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03]">
                  <div>
                    <span className="font-medium text-white">Hostel Block B (Pare)</span>
                    <span className="block text-[11px] text-zinc-400">Room 29, 1st Floor</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    24/7
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03]">
                  <div>
                    <span className="font-medium text-white">Hostel Block C (Dibang)</span>
                    <span className="block text-[11px] text-zinc-400">Ground Floor Lobby</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                    24/7
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03]">
                  <div>
                    <span className="font-medium text-white">Romen Xerox</span>
                    <span className="block text-[11px] text-zinc-400">Main Gate / Off-Campus</span>
                  </div>
                  <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md">
                    Cash & UPI
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live High-Resolution Preview Card */}
          <div className="lg:col-span-7 flex flex-col items-center">
            <div className="w-full max-w-md lg:max-w-none bg-zinc-900/60 p-4 sm:p-6 rounded-3xl border border-white/10 shadow-2xl relative group overflow-hidden">
              {/* Corner Watermark */}
              <div className="absolute top-4 right-4 z-10">
                <a
                  href={activeAsset.download}
                  download={activeAsset.filename}
                  className="p-2 rounded-xl bg-black/60 hover:bg-black/90 border border-white/20 text-white backdrop-blur-md flex items-center gap-1.5 text-xs font-semibold transition-all hover:scale-105 active:scale-95 shadow-md"
                  title="Download File"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Save Image</span>
                </a>
              </div>

              {/* Display Image */}
              <div className="w-full flex items-center justify-center bg-black/40 rounded-2xl p-2 sm:p-4 overflow-hidden border border-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeAsset.src}
                  alt={activeAsset.title}
                  className={`w-full max-h-[640px] object-contain rounded-xl shadow-xl transition-all duration-300`}
                />
              </div>

              {/* Scanning Hint Banner */}
              <div className="mt-4 p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">100% Scannable QR Code</div>
                    <div className="text-[11px] text-zinc-400">
                      Compatible with iPhone Camera, Android Lens & WhatsApp Web
                    </div>
                  </div>
                </div>

                <a
                  href={WA_DIRECT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shrink-0 transition-colors"
                >
                  Test Link
                </a>
              </div>
            </div>

            {/* 3 Step Instruction Card */}
            <div className="w-full mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="w-6 h-6 rounded-full bg-emerald-500 text-black font-bold text-xs flex items-center justify-center mb-2">
                  1
                </div>
                <div className="text-xs font-semibold text-white">Scan QR Code</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Point any smartphone camera at the QR code.
                </div>
              </div>

              <div className="p-3.5 rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="w-6 h-6 rounded-full bg-emerald-500 text-black font-bold text-xs flex items-center justify-center mb-2">
                  2
                </div>
                <div className="text-xs font-semibold text-white">Send Documents</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Send PDF, Word files, or photos directly in the chat.
                </div>
              </div>

              <div className="p-3.5 rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="w-6 h-6 rounded-full bg-emerald-500 text-black font-bold text-xs flex items-center justify-center mb-2">
                  3
                </div>
                <div className="text-xs font-semibold text-white">Collect Printout</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Pick up your printed pages right from your kiosk station.
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
