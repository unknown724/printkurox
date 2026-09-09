'use client';

import React from 'react';
import {
  ShieldCheck,
  Smartphone,
  CreditCard,
  Zap,
  Printer,
  Cloud,
  CheckCircle2,
} from 'lucide-react';

interface MarqueeItem {
  id: string;
  name: string;
  category: string;
  icon: React.ReactNode;
}

const MARQUEE_ITEMS: MarqueeItem[] = [
  {
    id: 'razorpay',
    name: 'Razorpay Secure',
    category: 'Instant Checkout',
    icon: <ShieldCheck className="w-4 h-4 text-white" />,
  },
  {
    id: 'upi',
    name: 'UPI Instant QR',
    category: 'Zero Delay',
    icon: <Smartphone className="w-4 h-4 text-white" />,
  },
  {
    id: 'gpay',
    name: 'Google Pay',
    category: 'Fast Pay',
    icon: <Zap className="w-4 h-4 text-white" />,
  },
  {
    id: 'phonepe',
    name: 'PhonePe',
    category: 'Verified UPI',
    icon: <CreditCard className="w-4 h-4 text-white" />,
  },
  {
    id: 'paytm',
    name: 'Paytm UPI',
    category: 'Wallet & QR',
    icon: <Smartphone className="w-4 h-4 text-white" />,
  },
  {
    id: 'bhim',
    name: 'BHIM UPI',
    category: 'Direct NPCI',
    icon: <CheckCircle2 className="w-4 h-4 text-white" />,
  },
  {
    id: 'epson',
    name: 'Epson L3210 Precision',
    category: 'Heat-Free Print Engine',
    icon: <Printer className="w-4 h-4 text-white" />,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Edge',
    category: 'D1 & R2 Storage',
    icon: <Cloud className="w-4 h-4 text-white" />,
  },
];

export function PaymentMarquee() {
  // Double the items to make the marquee seamless
  const duplicated = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  return (
    <div className="w-full relative overflow-hidden py-4 border-y border-white/[0.08] bg-black/40 backdrop-blur-xs">
      {/* Side gradient masks for smooth fade in/out */}
      <div className="absolute left-0 inset-y-0 w-16 sm:w-28 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 inset-y-0 w-16 sm:w-28 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

      {/* Marquee continuous track */}
      <div className="flex w-max animate-marquee space-x-8 items-center select-none">
        {duplicated.map((item, idx) => (
          <div
            key={`${item.id}-${idx}`}
            className="flex items-center space-x-3 px-4 py-2 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-white/20 transition-all hover:bg-white/[0.05] shrink-0 group"
          >
            <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              {item.icon}
            </div>
            <div>
              <p className="text-xs font-bold text-white tracking-wide font-sans">
                {item.name}
              </p>
              <p className="text-[10px] text-zinc-400 font-mono">
                {item.category}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
