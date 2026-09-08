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
  themeColor: "#070b14",
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
        {/* Note: Razorpay preconnect intentionally removed — it causes aggressive chunk
            preloading on every page load, generating console warnings for unused resources.
            The checkout.js script is loaded lazily via strategy="lazyOnload" below. */}
      </head>
      <body className="antialiased bg-slate-50 text-slate-900 dark:bg-[#070b14] dark:text-slate-100 flex flex-col min-h-screen selection:bg-indigo-500/80 selection:text-white transition-colors duration-200">
        {/* Multi-layered ambient background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {/* Primary top glow */}
          <div className="ambient-orb absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-indigo-500/10 dark:bg-indigo-700/18 opacity-80" />
          {/* Secondary right accent */}
          <div className="ambient-orb absolute top-1/3 -right-48 w-[450px] h-[450px] bg-violet-500/8 dark:bg-violet-700/12" />
          {/* Tertiary bottom-left */}
          <div className="ambient-orb absolute -bottom-20 -left-32 w-[500px] h-[400px] bg-emerald-500/8 dark:bg-emerald-700/10" />
          {/* Fine noise texture overlay */}
          <div
            className="absolute inset-0 opacity-[0.02] dark:opacity-[0.025]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
              backgroundSize: "128px",
            }}
          />
        </div>

        {/* ── Premium Sticky Header ── */}
        <header className="relative z-20 border-b border-slate-200/80 dark:border-white/[0.06] bg-white/85 dark:bg-[#070b14]/70 backdrop-blur-xl sticky top-0 shadow-sm dark:shadow-[0_1px_0_rgba(255,255,255,0.04)] transition-colors duration-200">
          <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
            {/* Brand Mark */}
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 ring-1 ring-black/5 dark:ring-white/10">
                <svg
                  className="w-4 h-4 text-white drop-shadow"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                  PrintKurox
                  <span className="text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 border border-indigo-500/30">
                    Kiosk
                  </span>
                </h1>
                <p className="text-[9px] text-slate-500 dark:text-slate-500 font-medium -mt-0.5">
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
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
