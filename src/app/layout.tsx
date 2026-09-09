import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { FooterLegal } from "@/components/FooterLegal";
import { KioskHeader } from "@/components/KioskHeader";
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

        {/* Contextual Header (renders on non-landing pages) */}
        <KioskHeader />

        {/* Main Content */}
        <main className="relative z-10 flex-1 w-full flex flex-col">
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
