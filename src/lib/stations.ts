/**
 * Station Configuration Registry
 * Manages multi-store settings, counter branding, WhatsApp contacts, and staff PINs.
 */

export interface StationConfig {
  id: string;
  name: string;
  tagline: string;
  whatsappNumber: string;
  adminPin: string;
  operatorName: string;
  allowOnlinePayment: boolean;
  allowCounterPayment: boolean;
  requireCounterApproval: boolean;
  address?: string;
}

export const DEFAULT_STATION_ID = 'main';

export const STATIONS: Record<string, StationConfig> = {
  main: {
    id: 'main',
    name: 'PrintKurox Autonomous Kiosk',
    tagline: 'Autonomous Self-Service Cloud Printing',
    whatsappNumber: '',
    adminPin: process.env.ADMIN_SECRET_KEY || 'Kurox725#29',
    operatorName: 'Admin',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
  },
  romen: {
    id: 'romen_xerox',
    name: 'Romen Xerox',
    tagline: 'Fast Photocopy, Printing & Stationery Services',
    whatsappNumber: '+916909228847',
    adminPin: 'Romen69092#',
    operatorName: 'Romen',
    allowOnlinePayment: false, // Online Razorpay paused for Romen
    allowCounterPayment: true, // Pay in cash / UPI locally
    requireCounterApproval: true, // Contact Romen on WhatsApp or staff PIN approval
    address: 'Near Main Gate',
  },
  romen_xerox: {
    id: 'romen_xerox',
    name: 'Romen Xerox',
    tagline: 'Fast Photocopy, Printing & Stationery Services',
    whatsappNumber: '+916909228847',
    adminPin: 'Romen69092#',
    operatorName: 'Romen',
    allowOnlinePayment: false,
    allowCounterPayment: true,
    requireCounterApproval: true,
    address: 'Near Main Gate',
  },
};

export function getStationConfig(stationId?: string | null): StationConfig {
  if (!stationId) return STATIONS.main;
  const key = stationId.toLowerCase().trim();
  return STATIONS[key] || STATIONS.main;
}

export function validateStationPin(stationId: string, inputPin: string): boolean {
  if (!inputPin) return false;
  const station = getStationConfig(stationId);
  const masterPin = process.env.ADMIN_SECRET_KEY || 'Kurox725#29';

  // Master admin PIN always works across all stations
  if (inputPin.trim() === masterPin.trim()) return true;

  // Station specific PIN (e.g. Romen69092# for Romen Xerox)
  return inputPin.trim() === station.adminPin.trim();
}
