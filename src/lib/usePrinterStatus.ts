'use client';

import { useState, useEffect, useCallback } from 'react';

interface PrinterStatus {
  online: boolean;
  lastSeen: string | null;
  ageSeconds: number | null;
  loading: boolean;
}

// In-memory module cache to deduplicate simultaneous calls across multiple components
const cacheMap = new Map<string, { data: any; timestamp: number }>();
const inFlightMap = new Map<string, Promise<any>>();
const CACHE_TTL_MS = 15_000; // 15 seconds client cache

async function fetchStationStatus(stationId?: string): Promise<any> {
  const cacheKey = stationId || '__default__';
  const now = Date.now();

  const cached = cacheMap.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  if (inFlightMap.has(cacheKey)) {
    return inFlightMap.get(cacheKey);
  }

  const url = stationId
    ? `/api/printer-status?station_id=${encodeURIComponent(stationId)}`
    : '/api/printer-status';

  const promise = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      cacheMap.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => {
      inFlightMap.delete(cacheKey);
    });

  inFlightMap.set(cacheKey, promise);
  return promise;
}

export function usePrinterStatus(pollIntervalMs = 30_000, stationId?: string): PrinterStatus {
  const [status, setStatus] = useState<PrinterStatus>({
    online: true, // Optimistic default until we know
    lastSeen: null,
    ageSeconds: null,
    loading: true,
  });

  const check = useCallback(async () => {
    // NEVER poll if tab is hidden / device is locked to prevent Vercel CDN request bleed
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    try {
      const data = await fetchStationStatus(stationId);
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
  }, [stationId]);

  useEffect(() => {
    // Initial check
    queueMicrotask(() => {
      check();
    });

    // Poll on interval (only when tab is visible)
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        check();
      }
    }, pollIntervalMs);

    // Instant refresh when user returns to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        check();
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', check);

    return () => {
      clearInterval(timer);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', check);
    };
  }, [check, pollIntervalMs]);

  return status;
}
