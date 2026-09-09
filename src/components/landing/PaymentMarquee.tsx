'use client';

import React from 'react';

interface PartnerLogo {
  id: string;
  name: string;
  renderLogo: () => React.ReactNode;
}

const PARTNER_LOGOS: PartnerLogo[] = [
  {
    id: 'razorpay',
    name: 'Razorpay',
    renderLogo: () => (
      <div className="flex items-center gap-1.5 font-bold tracking-tight text-white/80 group-hover:text-white">
        <svg className="w-4 h-4 fill-current text-white/90" viewBox="0 0 24 24">
          <path d="M12.001 2.002L2.5 7.502v9l9.501 5.5 9.499-5.5v-9l-9.499-5.5zm-.001 2.31l6.999 4.05-3.5 2.025-6.999-4.05 3.5-2.025zm-8 4.788l7 4.05v7.512l-7-4.05V9.1zm9 11.562v-7.512l7-4.05v7.512l-7 4.05z" />
        </svg>
        <span className="text-sm font-semibold tracking-wide">Razorpay</span>
      </div>
    ),
  },
  {
    id: 'upi',
    name: 'UPI',
    renderLogo: () => (
      <div className="flex items-center gap-1.5 font-black tracking-wider text-white/80 group-hover:text-white">
        <span className="inline-block w-2.5 h-2.5 rotate-45 bg-white/90" />
        <span className="text-sm font-black tracking-widest font-mono">UPI</span>
      </div>
    ),
  },
  {
    id: 'gpay',
    name: 'Google Pay',
    renderLogo: () => (
      <div className="flex items-center gap-1.5 text-white/80 group-hover:text-white">
        <span className="font-bold text-sm">G</span>
        <span className="text-sm font-medium tracking-tight">Pay</span>
      </div>
    ),
  },
  {
    id: 'phonepe',
    name: 'PhonePe',
    renderLogo: () => (
      <div className="flex items-center gap-1.5 font-bold text-white/80 group-hover:text-white">
        <div className="w-4 h-4 rounded-full border border-white/80 flex items-center justify-center text-[10px] font-bold">
          पे
        </div>
        <span className="text-sm font-semibold tracking-tight">PhonePe</span>
      </div>
    ),
  },
  {
    id: 'paytm',
    name: 'Paytm',
    renderLogo: () => (
      <div className="flex items-center gap-1 text-white/80 group-hover:text-white">
        <span className="text-sm font-black tracking-tighter">paytm</span>
      </div>
    ),
  },
  {
    id: 'bhim',
    name: 'BHIM UPI',
    renderLogo: () => (
      <div className="flex items-center gap-1.5 font-bold text-white/80 group-hover:text-white">
        <span className="text-xs font-black px-1.5 py-0.5 rounded-xs border border-white/60 text-white font-mono">
          BHIM
        </span>
      </div>
    ),
  },
  {
    id: 'epson',
    name: 'Epson',
    renderLogo: () => (
      <div className="flex items-center gap-1 text-white/80 group-hover:text-white">
        <span className="text-sm font-black tracking-widest font-mono">EPSON</span>
      </div>
    ),
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    renderLogo: () => (
      <div className="flex items-center gap-1.5 text-white/80 group-hover:text-white">
        <svg className="w-4 h-4 fill-current text-white/80" viewBox="0 0 24 24">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
        </svg>
        <span className="text-xs font-bold tracking-wider font-mono">CLOUDFLARE</span>
      </div>
    ),
  },
  {
    id: 'aws',
    name: 'AWS S3',
    renderLogo: () => (
      <div className="flex items-center gap-1 text-white/80 group-hover:text-white">
        <span className="text-xs font-bold tracking-wider font-mono">aws</span>
        <span className="text-white/40 text-xs">|</span>
        <span className="text-xs font-semibold text-white/80">S3</span>
      </div>
    ),
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    renderLogo: () => (
      <div className="flex items-center gap-1.5 text-white/80 group-hover:text-white">
        <span className="text-[11px] font-bold">▲</span>
        <span className="text-xs font-bold font-mono tracking-tight">Next.js</span>
      </div>
    ),
  },
  {
    id: 'vercel',
    name: 'Vercel',
    renderLogo: () => (
      <div className="flex items-center gap-1.5 text-white/80 group-hover:text-white">
        <span className="text-[11px] font-bold">▲</span>
        <span className="text-xs font-bold tracking-wider">Vercel</span>
      </div>
    ),
  },
];

export function PaymentMarquee() {
  const duplicated = [...PARTNER_LOGOS, ...PARTNER_LOGOS, ...PARTNER_LOGOS];

  return (
    <div className="w-full relative overflow-hidden py-5 bg-transparent select-none">
      {/* Side gradient masks for smooth fade in/out */}
      <div className="absolute left-0 inset-y-0 w-20 sm:w-36 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 inset-y-0 w-20 sm:w-36 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

      {/* Seamless Marquee Track */}
      <div className="flex w-max animate-marquee space-x-12 sm:space-x-16 items-center">
        {duplicated.map((item, idx) => (
          <div
            key={`${item.id}-${idx}`}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity duration-300 flex items-center group cursor-default"
          >
            {item.renderLogo()}
          </div>
        ))}
      </div>
    </div>
  );
}
