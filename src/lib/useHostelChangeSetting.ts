'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'nerist_hostel_change_enabled';
export const HOSTEL_CHANGE_EVENT = 'hostel-change-settings-changed';

export function broadcastHostelChangeSetting(enabled: boolean) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {}
    window.dispatchEvent(
      new CustomEvent(HOSTEL_CHANGE_EVENT, {
        detail: { enabled },
      })
    );
  }
}

export function useHostelChangeSetting() {
  const [hostelChangeEnabled, setHostelChangeEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
          return stored === 'true';
        }
      } catch {}
    }
    return false;
  });

  const [loading, setLoading] = useState(true);

  const fetchLatestSetting = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const enabled = Boolean(data.hostelChangeEnabled);
        setHostelChangeEnabled(enabled);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, String(enabled));
          } catch {}
        }
      }
    } catch (err) {
      console.warn('Failed to fetch hostel change setting from server:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatestSetting();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setHostelChangeEnabled(e.newValue === 'true');
      }
    };

    const handleCustomChange = (e: Event) => {
      const custom = e as CustomEvent<{ enabled: boolean }>;
      if (custom.detail && typeof custom.detail.enabled === 'boolean') {
        setHostelChangeEnabled(custom.detail.enabled);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(HOSTEL_CHANGE_EVENT, handleCustomChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(HOSTEL_CHANGE_EVENT, handleCustomChange);
    };
  }, [fetchLatestSetting]);

  return {
    hostelChangeEnabled,
    loading,
    refresh: fetchLatestSetting,
    updateSettingLocal: broadcastHostelChangeSetting,
  };
}
