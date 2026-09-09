import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { FooterLegal } from "@/components/FooterLegal";
import { AdminBadge } from "@/components/AdminBadge";
import { PrinterStatusPill } from "@/components/PrinterStatusPill";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrintKurox — Smart Self-Service Printing Kiosk",
  description:
    "Upload, configure and print your documents instantly via UPI & Cards. Powered by PrintKurox Kiosk.",
  keywords: ["printing", "kiosk", "self-service", "UPI", "documents"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#131314",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Anti-flash theme script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{const t=localStorage.getItem('printkurox-theme');if(t==='light'||(!t&&window.matchMedia('(prefers-color-scheme: light)').matches)){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}else{document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="antialiased bg-white text-zinc-900 dark:bg-[#131314] dark:text-[#e3e3e3] flex flex-col min-h-screen selection:bg-blue-500/30 selection:text-white transition-colors duration-200">
        {/* Subtle Gemini living ambient gradient */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[360px] bg-gradient-to-b from-blue-500/[0.06] via-purple-500/[0.04] to-transparent dark:from-blue-500/[0.09] dark:via-purple-500/[0.05] dark:to-transparent blur-3xl opacity-75 animate-living-glow" />
        </div>

        {/* ── Google Gemini-styled Minimal Header ── */}
        <header className="relative z-20 border-b border-zinc-200/80 dark:border-[#282a2c] bg-white/90 dark:bg-[#131314]/90 backdrop-blur-xl sticky top-0 transition-colors duration-200">
          <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
            {/* Brand Mark - Printer Logo with Google Gemini Gradient Colors */}
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-[#1e1f20] border border-zinc-200/80 dark:border-[#282a2c] flex items-center justify-center shrink-0 shadow-xs">
                <svg
                  className="w-4.5 h-4.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="gemini-printer-logo" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4285F4" />
                      <stop offset="50%" stopColor="#9B72CF" />
                      <stop offset="100%" stopColor="#D96570" />
                    </linearGradient>
                  </defs>
                  {/* Top Paper Infeed */}
                  <path
                    d="M7 2.5H17V7.5H7V2.5Z"
                    fill="url(#gemini-printer-logo)"
                    opacity="0.85"
                  />
                  {/* Printer Main Chassis */}
                  <rect
                    x="3"
                    y="7"
                    width="18"
                    height="10"
                    rx="2.5"
                    fill="url(#gemini-printer-logo)"
                  />
                  {/* Paper Output Sheet */}
                  <path
                    d="M6 14H18V19.5C18 20.0523 17.5523 20.5 17 20.5H7C6.44772 20.5 6 20.0523 6 19.5V14Z"
                    fill="#ffffff"
                  />
                  {/* Paper print line */}
                  <path d="M8.5 17H15.5" stroke="#131314" strokeWidth="1.2" strokeLinecap="round" />
                  {/* Power status indicator */}
                  <circle cx="17.5" cy="10" r="0.9" fill="#ffffff" />
                  {/* Mini Gemini sparkle star accent at top right */}
                  <path
                    d="M20 1C20 2.2 18.8 3.2 17.5 3.2C18.8 3.2 20 4.2 20 5.4C20 4.2 21.2 3.2 22.5 3.2C21.2 3.2 20 2.2 20 1Z"
                    fill="url(#gemini-printer-logo)"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-[#e3e3e3] flex items-center gap-1.5">
                  PrintKurox
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-[#282a2c] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    Kiosk
                  </span>
                </h1>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-normal -mt-0.5">
                  Block B · Room 29
                </p>
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <AdminBadge />
              {/* Live Printer Status Pill (client component) */}
              <PrinterStatusPill />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="relative z-10 flex-1 max-w-xl w-full mx-auto px-4 py-5 flex flex-col">
          {children}
        </main>

        {/* Compliant Footer */}
        <FooterLegal />

        {/* Razorpay Script */}
        <Script
          id="razorpay-checkout"
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
