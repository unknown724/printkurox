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
  themeColor: "#000000",
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
      <body className="antialiased bg-[#f9f9fa] text-zinc-900 dark:bg-[#000000] dark:text-[#f4f4f5] flex flex-col min-h-screen selection:bg-white/20 selection:text-white transition-colors duration-200 overflow-x-hidden w-full max-w-full">
        {/* Hardware-Accelerated Responsive Ambient Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 select-none [contain:strict]">
          {/* Subtle top specular radial glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[500px] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.035),transparent_70%)] pointer-events-none" />
          {/* Ultra-smooth GPU studio dot grid (crisp, elegant, high-definition blueprint feel) */}
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.20)_1.25px,transparent_1.25px)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.32)_1.25px,transparent_1.25px)] bg-[size:24px_24px] pointer-events-none"
            style={{
              maskImage: 'radial-gradient(ellipse 95% 85% at 50% 35%, black 60%, transparent 98%)',
              WebkitMaskImage: 'radial-gradient(ellipse 95% 85% at 50% 35%, black 60%, transparent 98%)',
              transform: 'translateZ(0)',
            }}
          />
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
