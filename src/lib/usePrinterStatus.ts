'use client';

import { useState, useEffect, useCallback } from 'react';

interface PrinterStatus {
  online: boolean;
  lastSeen: string | null;
  ageSeconds: number | null;
  loading: boolean;
}

export function usePrinterStatus(pollIntervalMs = 30_000): PrinterStatus {
  const [status, setStatus] = useState<PrinterStatus>({
    online: true, // Optimistic default until we know
    lastSeen: null,
    ageSeconds: null,
    loading: true,
  });

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/printer-status', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setStatus({
        online: Boolean(data.online),
        lastSeen: data.lastSeen ?? null,
        ageSeconds: data.ageSeconds ?? null,
        loading: false,
      });
    } catch {
      // Network error — assume offline
      setStatus((prev) => ({ ...prev, online: false, loading: false }));
    }
  }, []);

  useEffect(() => {
    // Initial check
    queueMicrotask(() => {
      check();
    });

    // Poll on interval
    const timer = setInterval(check, pollIntervalMs);
    return () => clearInterval(timer);
  }, [check, pollIntervalMs]);

  return status;
}
