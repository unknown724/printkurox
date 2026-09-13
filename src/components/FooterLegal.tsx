'use client';

import React, { useState } from 'react';
import { ShieldCheck, FileText, RefreshCw, Mail, X } from 'lucide-react';

type LegalTab = 'terms' | 'privacy' | 'refund' | 'contact' | null;

function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export function FooterLegal() {
  const [activeTab, setActiveTab] = useState<LegalTab>(null);

  return (
    <>
      <footer className="relative z-10 border-t border-slate-200/80 dark:border-white/5 py-6 px-4 text-center text-xs text-slate-500 dark:text-slate-400 space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-slate-600 dark:text-slate-400">
          <button
            onClick={() => setActiveTab('terms')}
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors underline-offset-2 hover:underline"
          >
            Terms & Conditions
          </button>
          <span>•</span>
          <button
            onClick={() => setActiveTab('privacy')}
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors underline-offset-2 hover:underline"
          >
            Privacy Policy
          </button>
          <span>•</span>
          <button
            onClick={() => setActiveTab('refund')}
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors underline-offset-2 hover:underline"
          >
            Cancellation & Refund Policy
          </button>
          <span>•</span>
          <button
            onClick={() => setActiveTab('contact')}
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors underline-offset-2 hover:underline"
          >
            Contact Us
          </button>
          <span>•</span>
          <a
            href="https://wa.me/919863013886?text=Hi%20PrintKurox%20Developer,%20I%20need%20assistance"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 shadow-xs hover:shadow-emerald-500/15 transition-all active:scale-95 group"
            title="Chat with Developer on WhatsApp (+91 98630 13886)"
          >
            <span className="w-3.5 h-3.5 rounded-full bg-[#25D366] flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform shadow-xs">
              <WhatsAppIcon className="w-2.5 h-2.5 fill-white" />
            </span>
            <span>Contact Developer</span>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
          </a>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          🔒 <strong className="text-slate-700 dark:text-slate-300">15-Minute Zero-Retention Policy:</strong> All uploaded files and cached buffers are permanently purged 15 minutes after upload.
        </p>

        <p className="text-[10px] text-slate-400 dark:text-slate-600">
          © {new Date().getFullYear()} PrintKurox Self-Service Kiosk. Secured by Razorpay.
        </p>
      </footer>

      {/* Legal Modal Popup */}
      {activeTab && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          onClick={() => setActiveTab(null)}
        >
          <div
            className="glass-card bg-white dark:bg-[#0e1424] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between bg-slate-100/90 dark:bg-slate-900/60">
              <div className="flex items-center space-x-2">
                {activeTab === 'terms' && <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                {activeTab === 'privacy' && <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                {activeTab === 'refund' && <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                {activeTab === 'contact' && <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                <h3 className="text-sm font-bold text-slate-900 dark:text-white capitalize">
                  {activeTab === 'terms' && 'Terms and Conditions'}
                  {activeTab === 'privacy' && 'Privacy Policy'}
                  {activeTab === 'refund' && 'Cancellation & Refund Policy'}
                  {activeTab === 'contact' && 'Contact & Support'}
                </h3>
              </div>
              <button
                onClick={() => setActiveTab(null)}
                className="w-7 h-7 rounded-lg bg-slate-200/70 hover:bg-slate-300 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {activeTab === 'terms' && (
                <>
                  <p className="font-semibold text-slate-900 dark:text-white">1. Service Description</p>
                  <p>
                    PrintKurox provides on-demand self-service document and image printing services. By using our web application and kiosk hardware, you agree to these Terms.
                  </p>
                  <p className="font-semibold text-slate-900 dark:text-white">2. User Responsibilities & Content Rights</p>
                  <p>
                    You are solely responsible for ensuring that any file uploaded for printing does not violate applicable intellectual property laws, copyrights, or contain unlawful material.
                  </p>
                  <p className="font-semibold text-slate-900 dark:text-white">3. Pricing & Billing</p>
                  <p>
                    Print fees are calculated transparently prior to checkout based on sheet count, color mode (Black & White vs Color), and single or duplex configuration. Payment is executed via RBI-regulated payment gateways (Razorpay).
                  </p>
                  <p className="font-semibold text-slate-900 dark:text-white">4. Pickup Codes</p>
                  <p>
                    Each print job generates a distinct Pickup Code (e.g., #A12). Printout collection at the kiosk counter is authenticated via this code.
                  </p>
                </>
              )}

              {activeTab === 'privacy' && (
                <>
                  <p className="font-semibold text-slate-900 dark:text-white">1. Strict 15-Minute Ephemeral Storage</p>
                  <p>
                    We prioritize user privacy. Uploaded documents are temporarily staged in encrypted Cloudflare R2 object storage solely for the purpose of rasterization and physical spooling to the kiosk printer.
                  </p>
                  <p className="font-semibold text-slate-900 dark:text-white">2. Zero Content Logging</p>
                  <p>
                    We do not scan, read, archive, or train AI models on user documents. All stored files are permanently and automatically deleted 15 minutes after upload via automated lifecycle purges.
                  </p>
                  <p className="font-semibold text-slate-900 dark:text-white">3. Payment Information</p>
                  <p>
                    All payment processing (UPI QR, debit/credit cards, netbanking) is handled directly by Razorpay under PCI-DSS Level 1 compliance. PrintKurox never stores or accesses your banking credentials, UPI PINs, or card numbers.
                  </p>
                </>
              )}

              {activeTab === 'refund' && (
                <>
                  <p className="font-semibold text-slate-900 dark:text-white">1. Cancellation Policy</p>
                  <p>
                    Due to the instantaneous and automated nature of physical printing, jobs cannot be cancelled once payment has been verified and physical printing has commenced.
                  </p>
                  <p className="font-semibold text-slate-900 dark:text-white">2. Refund Eligibility & Printer Malfunctions</p>
                  <p>
                    You are 100% entitled to a refund or immediate free reprint if:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                    <li>The printer experiences a paper jam or hardware malfunction.</li>
                    <li>The printer runs out of ink or paper during your job.</li>
                    <li>Network disconnection prevents the physical printout from executing after successful payment deduction.</li>
                  </ul>
                  <p className="font-semibold text-slate-900 dark:text-white">3. Refund Processing Time</p>
                  <p>
                    For automatic payment reversals, refunds are initiated within 24 hours back to the source bank account/UPI ID, typically reflecting within 2–5 business days as per banking standards. Immediate reprints can also be authorized directly at the kiosk counter.
                  </p>
                </>
              )}

              {activeTab === 'contact' && (
                <>
                  {/* Dedicated Developer WhatsApp Support Card */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-teal-500/5 to-transparent border border-emerald-500/30 dark:border-emerald-500/25 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center shadow-md shadow-emerald-500/20 text-white shrink-0">
                          <WhatsAppIcon className="w-5 h-5 fill-white" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>Developer Support Desk</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                              Live
                            </span>
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            Direct technical assistance &amp; kiosk inquiries
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-500/20">
                      <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>+91 98630 13886</span>
                      </div>
                      <a
                        href="https://wa.me/919863013886?text=Hi%20PrintKurox%20Developer,%20I%20need%20technical%20assistance"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all hover:scale-[1.02] active:scale-95"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                        <span>Chat on WhatsApp</span>
                      </a>
                    </div>
                  </div>

                  {/* General Merchant & Support Information */}
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900 dark:text-white">Customer Support &amp; Merchant Inquiries</p>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                      For questions regarding orders, billing, or kiosk operation:
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-white/5 space-y-1.5 text-slate-700 dark:text-slate-300">
                    <p><strong className="text-slate-900 dark:text-white">Business Name:</strong> PrintKurox Smart Printing Kiosk</p>
                    <p><strong className="text-slate-900 dark:text-white">Operating Hours:</strong> 8:00 AM – 10:00 PM IST (Daily)</p>
                    <p><strong className="text-slate-900 dark:text-white">Support Email:</strong> <a href="mailto:support@printkurox.com" className="text-indigo-600 dark:text-indigo-400 hover:underline">support@printkurox.com</a></p>
                    <p><strong className="text-slate-900 dark:text-white">Website:</strong> <a href="https://printkurox.vercel.app" target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">https://printkurox.vercel.app</a></p>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    If you are standing at the kiosk and have an active issue with an ongoing print job, please notify the shop counter assistant immediately with your 3-character Pickup Code.
                  </p>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-100/90 dark:bg-slate-900/40 border-t border-slate-200/80 dark:border-white/5 flex justify-end">
              <button
                onClick={() => setActiveTab(null)}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
