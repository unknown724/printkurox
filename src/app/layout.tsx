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
  themeColor: "#08080a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="overflow-x-hidden max-w-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Anti-flash theme script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{const t=localStorage.getItem('printkurox-theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}else{document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="antialiased bg-[#f9f9fa] text-zinc-900 dark:bg-[#08080a] dark:text-[#e3e3e3] flex flex-col min-h-screen selection:bg-white/20 selection:text-white transition-colors duration-200 overflow-x-hidden w-full max-w-full">
        {/* Qronos-Accurate Deep Obsidian Atmosphere matching Image 1 */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {/* Subtle top radial glow identical to Qronos about-card */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[480px] bg-[radial-gradient(circle_at_50%_0%,rgba(94,73,86,0.18),transparent_70%)] pointer-events-none" />
        </div>

        {/* Top Header */}
        <KioskHeader />

        {/* Main Content */}
        <main className="relative z-10 flex-1 w-full max-w-full overflow-x-hidden flex flex-col">
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
