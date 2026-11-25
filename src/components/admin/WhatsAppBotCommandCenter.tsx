'use client';

import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Power,
  Printer,
  GraduationCap,
  Users,
  Bot,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Save,
  Infinity as InfinityIcon,
  ShieldCheck,
  Ban,
  Plus,
  Trash2,
  Terminal,
  Smartphone,
  VolumeX,
  MessageCircleReply,
  Search,
} from 'lucide-react';
import type { DossierAccessLists, WhatsAppBotControlConfig } from '@/lib/settings';
import { DEFAULT_WHATSAPP_BOT_CONFIG } from '@/lib/settings';

interface WhatsAppBotCommandCenterProps {
  config: WhatsAppBotControlConfig;
  onConfigChange: (next: WhatsAppBotControlConfig) => void;
  dossierAccess: DossierAccessLists;
  onDossierAccessChange: (next: DossierAccessLists) => void;
}

type ViewMode = 'minimized' | 'normal' | 'maximized';

export function WhatsAppBotCommandCenter({
  config,
  onConfigChange,
  dossierAccess,
  onDossierAccessChange,
}: WhatsAppBotCommandCenterProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [draftMessages, setDraftMessages] = useState(config.messages);
  const [draftCooldown, setDraftCooldown] = useState<number>(config.replyCooldownSec || 60);
  const [savingConfig, setSavingConfig] = useState(false);
  const [cfgNotice, setCfgNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Dossier VIP & Ban controls
  const [phoneInput, setPhoneInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [busyDossier, setBusyDossier] = useState<string | null>(null);
  const [dossierNotice, setDossierNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setDraftMessages(config.messages);
    setDraftCooldown(config.replyCooldownSec || 60);
  }, [config]);

  useEffect(() => {
    if (viewMode !== 'maximized') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewMode('normal');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode]);

  const persistBotConfig = async (patch: Partial<WhatsAppBotControlConfig>, okMsg = 'Saved to Cloudflare D1') => {
    setSavingConfig(true);
    setCfgNotice(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_whatsapp_config',
          whatsappBotConfig: patch,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCfgNotice({ type: 'err', text: data.error || 'Failed to update WhatsApp config.' });
      } else {
        onConfigChange(data.whatsappBotConfig);
        setCfgNotice({ type: 'ok', text: okMsg });
        setTimeout(() => setCfgNotice(null), 3500);
      }
    } catch {
      setCfgNotice({ type: 'err', text: 'Network error updating WhatsApp bot settings.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const runDossierAction = async (
    action: 'add_unlimited' | 'remove_unlimited' | 'ban_phone' | 'unban_phone',
    targetPhone?: string
  ) => {
    const raw = targetPhone ?? phoneInput;
    const digits = raw.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setDossierNotice({ type: 'err', text: 'Enter a valid 10-digit WhatsApp mobile number.' });
      return;
    }

    setBusyDossier(`${action}:${digits}`);
    setDossierNotice(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          phone: digits,
          note: noteInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDossierNotice({ type: 'err', text: data.error || 'Failed to update dossier list.' });
      } else {
        onDossierAccessChange(data.dossierAccess);
        if (!targetPhone) {
          setPhoneInput('');
          setNoteInput('');
        }
        const label =
          action === 'add_unlimited'
            ? `Unlocked permanent ∞ dossier for +91 ${digits}`
            : action === 'ban_phone'
            ? `Banned +91 ${digits} from dossier access`
            : `Updated +91 ${digits}`;
        setDossierNotice({ type: 'ok', text: label });
        setTimeout(() => setDossierNotice(null), 3500);
      }
    } catch {
      setDossierNotice({ type: 'err', text: 'Network error updating dossier list.' });
    } finally {
      setBusyDossier(null);
    }
  };

  const filterQ = listFilter.trim().toLowerCase();
  const filteredUnlimited = dossierAccess.unlimited.filter(
    (u) => !filterQ || u.phone.includes(filterQ) || (u.note || '').toLowerCase().includes(filterQ)
  );
  const filteredBanned = dossierAccess.banned.filter(
    (b) => !filterQ || b.phone.includes(filterQ) || (b.note || '').toLowerCase().includes(filterQ)
  );

  const applyPreset = (preset: 'all_on' | 'pause_print' | 'full_off') => {
    if (preset === 'all_on') {
      void persistBotConfig(
        {
          botEnabled: true,
          printingEnabled: true,
          studentSearchEnabled: true,
          facultySearchEnabled: true,
          aiChatEnabled: true,
        },
        'All WhatsApp modules enabled'
      );
    } else if (preset === 'pause_print') {
      void persistBotConfig(
        {
          botEnabled: true,
          printingEnabled: false,
          studentSearchEnabled: true,
          facultySearchEnabled: true,
          aiChatEnabled: true,
        },
        'WhatsApp Printing paused (auto-reply active); Search & AI stay ON'
      );
    } else {
      void persistBotConfig(
        {
          botEnabled: false,
        },
        'WhatsApp Bot turned OFF (Print attempts get custom reply; others silent; Admin phone stays ON)'
      );
    }
  };

  const modeTiles = [
    {
      key: 'printingEnabled' as const,
      label: 'WhatsApp Printing',
      subOn: 'PDFs, photos & print queues active',
      subOff: 'Auto-replies with custom offline notice',
      icon: Printer,
      offBadge: 'Auto-Reply',
      enabled: config.printingEnabled && config.botEnabled,
      rawEnabled: config.printingEnabled,
      accent: 'emerald',
    },
    {
      key: 'studentSearchEnabled' as const,
      label: 'Student Search & Dossier',
      subOn: '@student, @dossier & unlocks active',
      subOff: 'Silent — no reply to public queries',
      icon: GraduationCap,
      offBadge: 'Silent',
      enabled: config.studentSearchEnabled && config.botEnabled,
      rawEnabled: config.studentSearchEnabled,
      accent: 'blue',
    },
    {
      key: 'facultySearchEnabled' as const,
      label: 'Faculty Search (@find)',
      subOn: 'DM & Group @find/@faculty active',
      subOff: 'Silent — no reply in DMs or Groups',
      icon: Users,
      offBadge: 'Silent',
      enabled: config.facultySearchEnabled && config.botEnabled,
      rawEnabled: config.facultySearchEnabled,
      accent: 'amber',
    },
    {
      key: 'aiChatEnabled' as const,
      label: 'Agent Kurox AI Chat',
      subOn: 'DM AI & Group @ai assistant active',
      subOff: 'Silent — no AI replies sent',
      icon: Bot,
      offBadge: 'Silent',
      enabled: config.aiChatEnabled && config.botEnabled,
      rawEnabled: config.aiChatEnabled,
      accent: 'purple',
    },
  ];

  const outerClass =
    viewMode === 'maximized'
      ? 'fixed inset-0 z-50 bg-zinc-950/75 backdrop-blur-md p-3 sm:p-6 overflow-y-auto'
      : '';

  const cardClass =
    viewMode === 'maximized'
      ? 'max-w-7xl mx-auto rounded-2xl p-5 sm:p-6 border border-zinc-200 dark:border-[#2e3136] bg-white dark:bg-[#18191b] shadow-2xl space-y-5'
      : 'rounded-2xl p-5 border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] shadow-2xs space-y-4';

  return (
    <div className={outerClass}>
      <div className={cardClass}>
        {/* TOP HEADER BAR WITH MINIMIZE / NORMAL / MAXIMIZE + MASTER BUTTON */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                config.botEnabled
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  WhatsApp Bot Command Center
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    config.botEnabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25'
                  }`}
                >
                  {config.botEnabled ? 'BOT ONLINE' : 'BOT OFF (ADMIN PHONE ONLY)'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                  +91 93629 80761
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Remote kill switch, Printing custom auto-reply, Silent mode for Search/AI, Dossier ∞ VIPs &amp; phone admin controls · Syncs via D1 (0 Worker hits)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Compact Status Pills when Minimized */}
            {viewMode === 'minimized' && (
              <div className="hidden md:flex items-center gap-1.5 mr-1">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    config.botEnabled && config.printingEnabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/25'
                  }`}
                >
                  Print: {config.botEnabled && config.printingEnabled ? 'ON' : 'OFF (Reply)'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    config.botEnabled && config.studentSearchEnabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                  }`}
                >
                  Student: {config.botEnabled && config.studentSearchEnabled ? 'ON' : 'Silent'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    config.botEnabled && config.facultySearchEnabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                  }`}
                >
                  Faculty: {config.botEnabled && config.facultySearchEnabled ? 'ON' : 'Silent'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20">
                  VIP ∞: {dossierAccess.unlimited.length}
                </span>
              </div>
            )}

            {/* Quick Master Power Toggle always reachable even when Minimized */}
            <button
              type="button"
              disabled={savingConfig}
              onClick={() =>
                persistBotConfig(
                  { botEnabled: !config.botEnabled },
                  !config.botEnabled ? 'WhatsApp Bot turned ON' : 'WhatsApp Bot turned OFF (Print auto-reply active; others silent)'
                )
              }
              className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                config.botEnabled
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-xs'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{config.botEnabled ? 'Turn Bot OFF' : 'Turn Bot ON'}</span>
            </button>

            {/* Minimize / Restore */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'minimized' ? 'normal' : 'minimized')}
              className="p-2 rounded-xl border border-zinc-200 dark:border-[#2e3136] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
              title={viewMode === 'minimized' ? 'Expand WhatsApp Workspace' : 'Minimize to status bar'}
            >
              {viewMode === 'minimized' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>

            {/* Maximize / Restore */}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'maximized' ? 'normal' : 'maximized')}
              className="p-2 rounded-xl border border-zinc-200 dark:border-[#2e3136] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 cursor-pointer"
              title={viewMode === 'maximized' ? 'Exit Full Workspace (Esc)' : 'Maximize WhatsApp Workspace'}
            >
              {viewMode === 'maximized' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* EXPANDED BODY (NORMAL OR MAXIMIZED) */}
        {viewMode !== 'minimized' && (
          <div className="space-y-5 pt-3 border-t border-zinc-100 dark:border-[#282a2c]">
            {/* Status Notice + Presets */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Quick Modes:</span>
                <button
                  type="button"
                  disabled={savingConfig}
                  onClick={() => applyPreset('all_on')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 cursor-pointer"
                >
                  All Active
                </button>
                <button
                  type="button"
                  disabled={savingConfig}
                  onClick={() => applyPreset('pause_print')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/25 cursor-pointer"
                >
                  Pause Printing Only (Reply Active)
                </button>
                <button
                  type="button"
                  disabled={savingConfig}
                  onClick={() => applyPreset('full_off')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/25 cursor-pointer"
                >
                  Bot Maintenance OFF
                </button>
              </div>

              {cfgNotice && (
                <span
                  className={`text-xs font-semibold ${
                    cfgNotice.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                  }`}
                >
                  {cfgNotice.text}
                </span>
              )}
            </div>

            {/* 4 GRANULAR MODULE CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {modeTiles.map((tile) => {
                const Icon = tile.icon;
                const isPublicOn = tile.enabled;
                return (
                  <div
                    key={tile.key}
                    className={`p-3.5 rounded-xl border transition ${
                      isPublicOn
                        ? 'bg-zinc-50/80 dark:bg-[#131314] border-zinc-200 dark:border-[#282a2c]'
                        : 'bg-amber-500/5 dark:bg-rose-950/10 border-amber-500/25 dark:border-rose-500/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${isPublicOn ? 'text-emerald-500' : 'text-zinc-400'}`} />
                        <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">{tile.label}</span>
                      </div>
                      <button
                        type="button"
                        disabled={savingConfig}
                        onClick={() =>
                          persistBotConfig(
                            { [tile.key]: !tile.rawEnabled },
                            `${tile.label} turned ${!tile.rawEnabled ? 'ON' : 'OFF'}`
                          )
                        }
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border cursor-pointer shrink-0 transition ${
                          tile.rawEnabled
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                            : 'bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700'
                        }`}
                      >
                        {tile.rawEnabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                      {!config.botEnabled
                        ? tile.key === 'printingEnabled'
                          ? 'Master OFF → replies with Bot OFF message'
                          : 'Master OFF → Silent (admin phone only)'
                        : tile.rawEnabled
                        ? tile.subOn
                        : tile.subOff}
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-zinc-400">
                      {tile.key === 'printingEnabled' ? (
                        <>
                          <MessageCircleReply className="w-3 h-3 text-amber-500" />
                          <span>When OFF: Custom Reply · Admin phone ON</span>
                        </>
                      ) : (
                        <>
                          <VolumeX className="w-3 h-3 text-zinc-400" />
                          <span>When OFF: {tile.offBadge} · Admin phone ON</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* WORKSPACE SPLIT: CUSTOM PRINTING REPLIES + DOSSIER VIP/BAN & PHONE ADMIN */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* LEFT: CUSTOM AUTO-REPLY MESSAGES FOR PRINTING */}
              <div className="lg:col-span-5 rounded-xl p-4 bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircleReply className="w-4 h-4 text-amber-500" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                      Printing Off Custom Auto-Replies
                    </h4>
                  </div>
                  <select
                    value={draftCooldown}
                    onChange={(e) => setDraftCooldown(Number(e.target.value))}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#1e1f20] border border-zinc-200 dark:border-[#2e3136] text-zinc-700 dark:text-zinc-200"
                    title="Cooldown between repeated offline replies to the same user"
                  >
                    <option value={30}>30s cooldown</option>
                    <option value={60}>60s cooldown</option>
                    <option value={120}>2m cooldown</option>
                    <option value={300}>5m cooldown</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">
                    When Master Bot is OFF (sent only on print attempts; others silent):
                  </label>
                  <textarea
                    rows={3}
                    value={draftMessages.botOff}
                    onChange={(e) => setDraftMessages((p) => ({ ...p, botOff: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">
                    When WhatsApp Printing Only is OFF (Search &amp; AI remain active):
                  </label>
                  <textarea
                    rows={3}
                    value={draftMessages.printingOff}
                    onChange={(e) => setDraftMessages((p) => ({ ...p, printingOff: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftMessages(DEFAULT_WHATSAPP_BOT_CONFIG.messages);
                      setDraftCooldown(DEFAULT_WHATSAPP_BOT_CONFIG.replyCooldownSec);
                    }}
                    className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                  >
                    Reset defaults
                  </button>
                  <button
                    type="button"
                    disabled={savingConfig}
                    onClick={() =>
                      persistBotConfig(
                        {
                          replyCooldownSec: draftCooldown,
                          messages: draftMessages,
                        },
                        'Custom auto-reply messages saved to D1'
                      )
                    }
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Auto-Replies</span>
                  </button>
                </div>

                {/* Live WhatsApp Bubble Preview when Maximized or expanded */}
                <div className="p-3 rounded-xl bg-emerald-950/15 dark:bg-[#0b141a] border border-emerald-500/20 text-[11px] text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
                    Preview ({!config.botEnabled ? 'Bot OFF print reply' : 'Printing OFF reply'}):
                  </div>
                  {!config.botEnabled ? draftMessages.botOff : draftMessages.printingOff}
                </div>
              </div>

              {/* RIGHT: DOSSIER UNLIMITED & BAN + OWNER PHONE CONTROLS */}
              <div className="lg:col-span-7 space-y-4">
                {/* Dossier Permanent Unlimited & Ban Control */}
                <div className="rounded-xl p-4 bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <InfinityIcon className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                        Dossier Permanent Unlimited (∞) &amp; Ban Control
                      </h4>
                    </div>
                    <div className="relative">
                      <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={listFilter}
                        onChange={(e) => setListFilter(e.target.value)}
                        placeholder="Filter numbers..."
                        className="pl-7 pr-2.5 py-1 rounded-lg border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] text-[11px] text-zinc-900 dark:text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="10-digit WhatsApp (e.g. 9863013886)"
                      className="sm:col-span-5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Name / Note (optional)"
                      className="sm:col-span-3 px-3 py-2 rounded-xl border border-zinc-200 dark:border-[#282a2c] bg-white dark:bg-[#1e1f20] text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      disabled={busyDossier !== null}
                      onClick={() => runDossierAction('add_unlimited')}
                      className="sm:col-span-2 px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Unlock ∞</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyDossier !== null}
                      onClick={() => runDossierAction('ban_phone')}
                      className="sm:col-span-2 px-2.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Ban</span>
                    </button>
                  </div>

                  {dossierNotice && (
                    <p
                      className={`text-[11px] font-medium ${
                        dossierNotice.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                      }`}
                    >
                      {dossierNotice.text}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#1e1f20] border border-zinc-200/80 dark:border-[#282a2c] space-y-1.5 max-h-40 overflow-y-auto">
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Permanent Unlimited ({dossierAccess.unlimited.length})</span>
                      </div>
                      {filteredUnlimited.length === 0 ? (
                        <p className="text-[11px] text-zinc-400">No numbers matching.</p>
                      ) : (
                        filteredUnlimited.map((u) => (
                          <div
                            key={u.phone}
                            className="flex items-center justify-between gap-2 py-1 border-b border-zinc-100 dark:border-white/5 last:border-none"
                          >
                            <div className="min-w-0">
                              <div className="font-mono font-bold text-zinc-900 dark:text-zinc-100">+91 {u.phone}</div>
                              {u.note && <div className="text-[10px] text-zinc-500 truncate">{u.note}</div>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => runDossierAction('ban_phone', u.phone)}
                                className="p-1 rounded hover:bg-rose-500/15 text-rose-500 cursor-pointer"
                                title="Ban this number"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => runDossierAction('remove_unlimited', u.phone)}
                                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 cursor-pointer"
                                title="Remove unlimited unlock"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#1e1f20] border border-zinc-200/80 dark:border-[#282a2c] space-y-1.5 max-h-40 overflow-y-auto">
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-500">
                        <Ban className="w-3 h-3" />
                        <span>Banned Numbers ({dossierAccess.banned.length})</span>
                      </div>
                      {filteredBanned.length === 0 ? (
                        <p className="text-[11px] text-zinc-400">No numbers banned.</p>
                      ) : (
                        filteredBanned.map((b) => (
                          <div
                            key={b.phone}
                            className="flex items-center justify-between gap-2 py-1 border-b border-zinc-100 dark:border-white/5 last:border-none"
                          >
                            <div className="min-w-0">
                              <div className="font-mono font-bold text-rose-600 dark:text-rose-400">+91 {b.phone}</div>
                              {b.note && <div className="text-[10px] text-zinc-500 truncate">{b.note}</div>}
                            </div>
                            <button
                              type="button"
                              onClick={() => runDossierAction('unban_phone', b.phone)}
                              className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold cursor-pointer shrink-0"
                            >
                              Unban
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Previous WhatsApp Admin Functions & Phone Control Reference */}
                <div className="rounded-xl p-4 bg-zinc-50 dark:bg-[#131314] border border-zinc-200/80 dark:border-[#282a2c] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-sky-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                        WhatsApp Owner Phone Commands (Always Active)
                      </h4>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <Smartphone className="w-3 h-3" /> Works from +91 98630 13886 even when Bot is OFF
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200/70 dark:border-[#282a2c] space-y-1">
                      <div className="font-bold text-zinc-700 dark:text-zinc-200">Bot &amp; Mode Switches</div>
                      <div className="font-mono text-[10px] text-zinc-500 space-y-0.5">
                        <div><code>@bot on</code> / <code>@bot off</code></div>
                        <div><code>@waprint on</code> / <code>@waprint off</code></div>
                        <div><code>@studentbot off</code> / <code>on</code></div>
                        <div><code>@facultybot off</code> / <code>on</code></div>
                        <div><code>@aibot off</code> / <code>on</code> · <code>@botstatus</code></div>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200/70 dark:border-[#282a2c] space-y-1">
                      <div className="font-bold text-zinc-700 dark:text-zinc-200">Server &amp; Host Controls</div>
                      <div className="font-mono text-[10px] text-zinc-500 space-y-0.5">
                        <div><code>#status</code> — Pi/Laptop Health</div>
                        <div><code>#wifilogin</code> — Re-auth NERIST</div>
                        <div><code>#wifi user pass</code> — Change WiFi</div>
                        <div><code>#update</code> — Git pull code</div>
                        <div><code>#shutdown</code> / <code>#cancelshutdown</code></div>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-[#1e1f20] border border-zinc-200/70 dark:border-[#282a2c] space-y-1">
                      <div className="font-bold text-zinc-700 dark:text-zinc-200">VIP, Ban &amp; Broadcasts</div>
                      <div className="font-mono text-[10px] text-zinc-500 space-y-0.5">
                        <div><code>@unlock 98... [note]</code> — ∞ VIP</div>
                        <div><code>@ban 98...</code> / <code>@unban 98...</code></div>
                        <div><code>@lock 98...</code> · <code>@viplist</code></div>
                        <div><code>@ad</code> — Directory promo card</div>
                        <div><code>@send 24h</code> / <code>7d</code> / <code>all</code></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
