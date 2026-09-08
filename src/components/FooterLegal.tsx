'use client';

import React, { useState } from 'react';
import { ShieldCheck, FileText, RefreshCw, Mail, X } from 'lucide-react';

type LegalTab = 'terms' | 'privacy' | 'refund' | 'contact' | null;

export function FooterLegal() {
  const [activeTab, setActiveTab] = useState<LegalTab>(null);

  return (
    <>
      <footer className="relative z-10 border-t border-white/5 py-6 px-4 text-center text-xs text-slate-500 space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
          <button
            onClick={() => setActiveTab('terms')}
            className="hover:text-indigo-400 transition-colors underline-offset-2 hover:underline"
          >
            Terms & Conditions
          </button>
          <span>•</span>
          <button
            onClick={() => setActiveTab('privacy')}
            className="hover:text-indigo-400 transition-colors underline-offset-2 hover:underline"
          >
            Privacy Policy
          </button>
          <span>•</span>
          <button
            onClick={() => setActiveTab('refund')}
            className="hover:text-indigo-400 transition-colors underline-offset-2 hover:underline"
          >
            Cancellation & Refund Policy
          </button>
          <span>•</span>
          <button
            onClick={() => setActiveTab('contact')}
            className="hover:text-indigo-400 transition-colors underline-offset-2 hover:underline"
          >
            Contact Us
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          🔒 <strong className="text-slate-400">15-Minute Zero-Retention Policy:</strong> All uploaded files and cached buffers are permanently purged 15 minutes after upload.
        </p>

        <p className="text-[10px] text-slate-600">
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
            className="glass-card bg-[#0e1424] border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center space-x-2">
                {activeTab === 'terms' && <FileText className="w-4 h-4 text-indigo-400" />}
                {activeTab === 'privacy' && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                {activeTab === 'refund' && <RefreshCw className="w-4 h-4 text-amber-400" />}
                {activeTab === 'contact' && <Mail className="w-4 h-4 text-indigo-400" />}
                <h3 className="text-sm font-bold text-white capitalize">
                  {activeTab === 'terms' && 'Terms and Conditions'}
                  {activeTab === 'privacy' && 'Privacy Policy'}
                  {activeTab === 'refund' && 'Cancellation & Refund Policy'}
                  {activeTab === 'contact' && 'Contact & Support'}
                </h3>
              </div>
              <button
                onClick={() => setActiveTab(null)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed">
              {activeTab === 'terms' && (
                <>
                  <p className="font-semibold text-white">1. Service Description</p>
                  <p>
                    PrintKurox provides on-demand self-service document and image printing services. By using our web application and kiosk hardware, you agree to these Terms.
                  </p>
                  <p className="font-semibold text-white">2. User Responsibilities & Content Rights</p>
                  <p>
                    You are solely responsible for ensuring that any file uploaded for printing does not violate applicable intellectual property laws, copyrights, or contain unlawful material.
                  </p>
                  <p className="font-semibold text-white">3. Pricing & Billing</p>
                  <p>
                    Print fees are calculated transparently prior to checkout based on sheet count, color mode (Black & White vs Color), and single or duplex configuration. Payment is executed via RBI-regulated payment gateways (Razorpay).
                  </p>
                  <p className="font-semibold text-white">4. Pickup Codes</p>
                  <p>
                    Each print job generates a distinct Pickup Code (e.g., #A12). Printout collection at the kiosk counter is authenticated via this code.
                  </p>
                </>
              )}

              {activeTab === 'privacy' && (
                <>
                  <p className="font-semibold text-white">1. Strict 15-Minute Ephemeral Storage</p>
                  <p>
                    We prioritize user privacy. Uploaded documents are temporarily staged in encrypted Cloudflare R2 object storage solely for the purpose of rasterization and physical spooling to the kiosk printer.
                  </p>
                  <p className="font-semibold text-white">2. Zero Content Logging</p>
                  <p>
                    We do not scan, read, archive, or train AI models on user documents. All stored files are permanently and automatically deleted 15 minutes after upload via automated lifecycle purges.
                  </p>
                  <p className="font-semibold text-white">3. Payment Information</p>
                  <p>
                    All payment processing (UPI QR, debit/credit cards, netbanking) is handled directly by Razorpay under PCI-DSS Level 1 compliance. PrintKurox never stores or accesses your banking credentials, UPI PINs, or card numbers.
                  </p>
                </>
              )}

              {activeTab === 'refund' && (
                <>
                  <p className="font-semibold text-white">1. Cancellation Policy</p>
                  <p>
                    Due to the instantaneous and automated nature of physical printing, jobs cannot be cancelled once payment has been verified and physical printing has commenced.
                  </p>
                  <p className="font-semibold text-white">2. Refund Eligibility & Printer Malfunctions</p>
                  <p>
                    You are 100% entitled to a refund or immediate free reprint if:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    <li>The printer experiences a paper jam or hardware malfunction.</li>
                    <li>The printer runs out of ink or paper during your job.</li>
                    <li>Network disconnection prevents the physical printout from executing after successful payment deduction.</li>
                  </ul>
                  <p className="font-semibold text-white">3. Refund Processing Time</p>
                  <p>
                    For automatic payment reversals, refunds are initiated within 24 hours back to the source bank account/UPI ID, typically reflecting within 2–5 business days as per banking standards. Immediate reprints can also be authorized directly at the kiosk counter.
                  </p>
                </>
              )}

              {activeTab === 'contact' && (
                <>
                  <p className="font-semibold text-white">Customer Support & Merchant Inquiries</p>
                  <p>
                    For questions regarding orders, billing, or kiosk operation:
                  </p>
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-2 text-slate-300">
                    <p><strong className="text-white">Business Name:</strong> PrintKurox Smart Printing Kiosk</p>
                    <p><strong className="text-white">Operating Hours:</strong> 8:00 AM – 10:00 PM IST (Daily)</p>
                    <p><strong className="text-white">Support Email:</strong> <a href="mailto:support@printkurox.com" className="text-indigo-400 hover:underline">support@printkurox.com</a></p>
                    <p><strong className="text-white">Website:</strong> <a href="https://printkurox.vercel.app" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">https://printkurox.vercel.app</a></p>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    If you are standing at the kiosk and have an active issue with an ongoing print job, please notify the shop counter assistant immediately with your 3-character Pickup Code.
                  </p>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-900/40 border-t border-white/5 flex justify-end">
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
