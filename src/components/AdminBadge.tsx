'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown } from 'lucide-react';

export function AdminBadge() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/auth')
      .then((r) => r.json())
      .then((d) => {
        if (d.isAdmin) {
          setIsAdmin(true);
          const name = d.deviceName || d.device?.device_name;
          if (name) {
            setDeviceName(name);
          }
        }
      })
      .catch(() => {});
  }, []);

  if (!isAdmin) return null;

  return (
    <Link
      href="/adminkurox"
      className="group relative inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-full bg-gradient-to-r from-amber-500/15 via-purple-500/15 to-indigo-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-sm hover:border-amber-400/60 hover:bg-amber-500/20 transition-all duration-200"
      title={`Authorized Admin Device: ${deviceName || 'Active'} — Click to open Operator Portal`}
    >
      <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20 transition-transform group-hover:scale-110" />
      <span className="hidden xs:inline">Admin</span>
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
    </Link>
  );
}
