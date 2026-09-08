import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { FooterLegal } from "@/components/FooterLegal";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrintKurox — Self-Service Smart Printing Kiosk",
  description: "Upload, configure and print your documents instantly via UPI & Cards. Powered by PrintKurox.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#090d16",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://checkout.razorpay.com" />
      </head>
      <body className="antialiased bg-[#090d16] text-slate-100 flex flex-col min-h-screen selection:bg-indigo-500 selection:text-white">
        {/* Ambient background glow */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-indigo-600/15 blur-[120px] rounded-full" />
          <div className="absolute top-1/2 -right-40 w-[400px] h-[400px] bg-violet-600/10 blur-[130px] rounded-full" />
          <div className="absolute bottom-0 -left-40 w-[400px] h-[400px] bg-emerald-600/10 blur-[130px] rounded-full" />
        </div>

        {/* Top Kiosk Bar */}
        <header className="relative z-10 border-b border-white/5 bg-[#0d1322]/60 backdrop-blur-md sticky top-0">
          <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                  PrintKurox <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Kiosk</span>
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Printer Online</span>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <main className="relative z-10 flex-1 max-w-xl w-full mx-auto px-4 py-5 flex flex-col">
          {children}
        </main>

        {/* Compliant Footer with Legal Modals */}
        <FooterLegal />

        {/* Razorpay Standard Checkout Script */}
        <Script
          id="razorpay-checkout"
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
