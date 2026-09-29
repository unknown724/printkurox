/**
 * NERIST Campus Station Configuration Registry
 * Manages campus-wide hostel print stations, real-time availability,
 * operator metadata, and staff authentication.
 */
import crypto from 'crypto';

export type StationOperationalStatus = 'active' | 'standby' | 'expansion_planned';

export interface StationConfig {
  id: string;
  name: string;
  shortName: string;
  blockCode: string;
  riverName: string;
  tagline: string;
  whatsappNumber: string;
  adminPin: string;
  operatorName: string;
  allowOnlinePayment: boolean;
  allowCounterPayment: boolean;
  requireCounterApproval: boolean;
  address: string;
  status: StationOperationalStatus;
  isPublicCampus: boolean; // Set false to hide external partner kiosks like Romen from main campus web app
  slot: number;
  razorpayAccountId?: string; // Razorpay Route sub-merchant account id (e.g. 'acc_xxxxxxxxxxxxxx')
  commissionPercent?: number; // Platform fee percentage (default 10%)
}

export const DEFAULT_STATION_ID = 'block_b';
export const DEFAULT_DEVELOPER_WHATSAPP = '+919863013886';
export const OFFICIAL_WHATSAPP_BOT_NUMBER = '+919362980761';
export const OFFICIAL_WHATSAPP_BOT_RAW = '919362980761';
export const OFFICIAL_WHATSAPP_BOT_LINK = 'https://wa.me/919362980761?text=Hi%20PrintKurox%2C%20I%20want%20to%20print%20a%20document';

export const STATIONS: Record<string, StationConfig> = {
  // --- PRIMARY OPERATIONAL CAMPUS STATION ---
  block_b: {
    id: 'block_b',
    name: 'Hostel Block B (Pare)',
    shortName: 'Block B · Pare',
    blockCode: 'Block B',
    riverName: 'Pare',
    tagline: 'Autonomous Hostel Print Station · Room 29',
    whatsappNumber: '+919362980761',
    adminPin: process.env.ADMIN_SECRET_KEY || 'Kurox725#29',
    operatorName: 'Devananda / Custodian',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Room 29, 1st Floor, Block B (Pare Hostel), NERIST',
    status: 'active',
    isPublicCampus: true,
    slot: 1,
  },
  // Backward compatibility alias for main
  main: {
    id: 'block_b',
    name: 'Hostel Block B (Pare)',
    shortName: 'Block B · Pare',
    blockCode: 'Block B',
    riverName: 'Pare',
    tagline: 'Autonomous Hostel Print Station · Room 29',
    whatsappNumber: '+919362980761',
    adminPin: process.env.ADMIN_SECRET_KEY || 'Kurox725#29',
    operatorName: 'Devananda / Custodian',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Room 29, 1st Floor, Block B (Pare Hostel), NERIST',
    status: 'active',
    isPublicCampus: true,
    slot: 1,
  },

  // --- EXPANSION PHASE 1: NEXT PLANNED HOSTEL STATION ---
  block_c: {
    id: 'block_c',
    name: 'Hostel Block C (Dibang)',
    shortName: 'Block C · Dibang',
    blockCode: 'Block C',
    riverName: 'Dibang',
    tagline: 'Next Campus Print Hub · Ground Floor',
    whatsappNumber: '+919362980761',
    adminPin: 'Dibang725#',
    operatorName: 'Block C Manager (In Setup)',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Ground Floor Common Area, Block C (Dibang Hostel), NERIST',
    status: 'standby',
    isPublicCampus: true,
    slot: 2,
  },

  // --- EXPANSION PHASE 2: REMAINING NERIST HOSTEL BLOCKS (PLANNED) ---
  block_a: {
    id: 'block_a',
    name: 'Hostel Block A (Tirap)',
    shortName: 'Block A · Tirap',
    blockCode: 'Block A',
    riverName: 'Tirap',
    tagline: 'Upcoming Station · In Negotiation',
    whatsappNumber: '+919863013886',
    adminPin: 'Tirap725#',
    operatorName: 'Campus Coordinator',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Block A (Tirap Hostel), NERIST',
    status: 'expansion_planned',
    isPublicCampus: true,
    slot: 3,
  },
  block_d: {
    id: 'block_d',
    name: 'Hostel Block D (Panyor)',
    shortName: 'Block D · Panyor',
    blockCode: 'Block D',
    riverName: 'Panyor',
    tagline: 'Upcoming Station · In Negotiation',
    whatsappNumber: '+919863013886',
    adminPin: 'Panyor725#',
    operatorName: 'Campus Coordinator',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Block D (Panyor Hostel), NERIST',
    status: 'expansion_planned',
    isPublicCampus: true,
    slot: 4,
  },
  block_e: {
    id: 'block_e',
    name: 'Hostel Block E (Kameng)',
    shortName: 'Block E · Kameng',
    blockCode: 'Block E',
    riverName: 'Kameng',
    tagline: 'Upcoming Station · In Negotiation',
    whatsappNumber: '+919863013886',
    adminPin: 'Kameng725#',
    operatorName: 'Campus Coordinator',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Block E (Kameng Hostel), NERIST',
    status: 'expansion_planned',
    isPublicCampus: true,
    slot: 5,
  },
  block_f: {
    id: 'block_f',
    name: 'Hostel Block F (Lohit)',
    shortName: 'Block F · Lohit',
    blockCode: 'Block F',
    riverName: 'Lohit',
    tagline: 'Upcoming Station · In Negotiation',
    whatsappNumber: '+919863013886',
    adminPin: 'Lohit725#',
    operatorName: 'Campus Coordinator',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Block F (Lohit Hostel), NERIST',
    status: 'expansion_planned',
    isPublicCampus: true,
    slot: 6,
  },
  block_g: {
    id: 'block_g',
    name: 'Hostel Block G (Siang)',
    shortName: 'Block G · Siang',
    blockCode: 'Block G',
    riverName: 'Siang',
    tagline: 'Upcoming Station · In Negotiation',
    whatsappNumber: '+919863013886',
    adminPin: 'Siang725#',
    operatorName: 'Campus Coordinator',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Block G (Siang Hostel), NERIST',
    status: 'expansion_planned',
    isPublicCampus: true,
    slot: 7,
  },
  block_h: {
    id: 'block_h',
    name: 'Hostel Block H (Kurung-Paniu)',
    shortName: 'Block H · Kurung-Paniu',
    blockCode: 'Block H',
    riverName: 'Kurung-Paniu',
    tagline: 'Upcoming Station · In Negotiation',
    whatsappNumber: '+919863013886',
    adminPin: 'Kurung725#',
    operatorName: 'Campus Coordinator',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Block H (Kurung-Paniu Hostel), NERIST',
    status: 'expansion_planned',
    isPublicCampus: true,
    slot: 8,
  },
  girls_hostel: {
    id: 'girls_hostel',
    name: 'Girls Hostel Complex (Subansiri)',
    shortName: 'Girls Hostel · Subansiri',
    blockCode: 'GH Complex',
    riverName: 'Subansiri',
    tagline: 'Upcoming Station · In Negotiation',
    whatsappNumber: '+919863013886',
    adminPin: 'Subansiri725#',
    operatorName: 'Campus Coordinator',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Girls Hostel Complex, NERIST',
    status: 'expansion_planned',
    isPublicCampus: true,
    slot: 9,
  },

  // --- EXTERNAL OFF-CAMPUS PARTNER KIOSK (Kept functional via direct link, but HIDDEN from campus web app picker) ---
  romen: {
    id: 'romen_xerox',
    name: 'Romen Xerox',
    shortName: 'Romen Xerox',
    blockCode: 'Off-Campus',
    riverName: 'Main Gate',
    tagline: 'Fast Photocopy, Printing & Stationery Services',
    whatsappNumber: '+916909228847',
    adminPin: 'Romen69092#',
    operatorName: 'Romen',
    allowOnlinePayment: false,
    allowCounterPayment: true,
    requireCounterApproval: true,
    address: 'Near Main Gate, Nirjuli',
    status: 'active',
    isPublicCampus: false, // HIDDEN on campus web app UI
    slot: 154,
  },
  romen_xerox: {
    id: 'romen_xerox',
    name: 'Romen Xerox',
    shortName: 'Romen Xerox',
    blockCode: 'Off-Campus',
    riverName: 'Main Gate',
    tagline: 'Fast Photocopy, Printing & Stationery Services',
    whatsappNumber: '+916909228847',
    adminPin: 'Romen69092#',
    operatorName: 'Romen',
    allowOnlinePayment: false,
    allowCounterPayment: true,
    requireCounterApproval: true,
    address: 'Near Main Gate, Nirjuli',
    status: 'active',
    isPublicCampus: false, // HIDDEN on campus web app UI
    slot: 154,
  },
  hostel_block_b_pare: {
    id: 'hostel_block_b_pare',
    name: 'Hostel Block B (Pare)',
    shortName: 'Block B · Pare',
    blockCode: 'Block B',
    riverName: 'Pare',
    tagline: 'Autonomous Hostel Print Station · Room 29',
    whatsappNumber: '+919362980761',
    adminPin: process.env.ADMIN_SECRET_KEY || 'Kurox725#29',
    operatorName: 'Devananda / Custodian',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: 'Room 29, 1st Floor, Block B (Pare Hostel), NERIST',
    status: 'active',
    isPublicCampus: true,
    slot: 1,
  },
  romen_xerox_main_gate: {
    id: 'romen_xerox_main_gate',
    name: 'Romen Xerox',
    shortName: 'Romen Xerox',
    blockCode: 'Off-Campus',
    riverName: 'Main Gate',
    tagline: 'Fast Photocopy, Printing & Stationery Services',
    whatsappNumber: '+916909228847',
    adminPin: 'Romen69092#',
    operatorName: 'Romen',
    allowOnlinePayment: false,
    allowCounterPayment: true,
    requireCounterApproval: true,
    address: 'Near Main Gate, Nirjuli',
    status: 'active',
    isPublicCampus: false,
    slot: 154,
  },
};

/**
 * Normalizes station IDs across legacy, D1, and URL variations.
 */
export function normalizeStationId(stationId?: string | null): string {
  if (!stationId) return DEFAULT_STATION_ID;
  const key = stationId.toLowerCase().trim();
  if (key === 'block_b' || key === 'main' || key === 'hostel_block_b_pare' || key === 'pare') {
    return 'block_b';
  }
  if (key === 'romen' || key === 'romen_xerox' || key === 'romen_xerox_main_gate') {
    return 'romen_xerox';
  }
  const cleanKey = key.replace(/^hostel_/, '').replace(/_pare$/, '').replace(/_main_gate$/, '');
  if (STATIONS[cleanKey]) {
    return cleanKey;
  }
  return key;
}

/**
 * Robust check if two station IDs refer to the same station.
 */
export function isStationMatch(idA?: string | null, idB?: string | null): boolean {
  if (!idA || !idB) return false;
  const a = idA.toLowerCase().trim();
  const b = idB.toLowerCase().trim();
  if (a === b) return true;
  if (normalizeStationId(a) === normalizeStationId(b)) return true;

  const cleanA = a.replace(/^hostel_/, '').replace(/_pare$/, '').replace(/_main_gate$/, '');
  const cleanB = b.replace(/^hostel_/, '').replace(/_pare$/, '').replace(/_main_gate$/, '');
  return cleanA === cleanB;
}

const dynamicStationsCache: Record<string, StationConfig> = {};

export function registerDynamicStation(station: StationConfig) {
  if (station && station.id) {
    dynamicStationsCache[station.id.toLowerCase().trim()] = station;
  }
}

/**
 * Returns station config for a given ID.
 * Dynamically synthesizes config for newly registered D1 stations (like Hostel Block K).
 */
export function getStationConfig(stationId?: string | null): StationConfig {
  if (!stationId) return STATIONS.block_b;
  const key = stationId.toLowerCase().trim();
  const normKey = normalizeStationId(key);

  if (STATIONS[key]) return STATIONS[key];
  if (STATIONS[normKey]) return STATIONS[normKey];
  if (dynamicStationsCache[key]) return dynamicStationsCache[key];
  if (dynamicStationsCache[normKey]) return dynamicStationsCache[normKey];

  // Synthesize dynamic StationConfig for custom/D1 stations
  const isHostel = key.includes('hostel') || key.includes('block');
  const prettyName = key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const blockMatch = key.match(/block[_-]?([a-z0-9]+)/i);
  const blockCode = blockMatch ? `Block ${blockMatch[1].toUpperCase()}` : (isHostel ? 'Hostel' : 'Station');

  return {
    id: key,
    name: prettyName,
    shortName: blockCode,
    blockCode: blockCode,
    riverName: blockCode,
    tagline: 'Autonomous Campus Print Station',
    whatsappNumber: DEFAULT_DEVELOPER_WHATSAPP,
    adminPin: '',
    operatorName: 'Station Custodian',
    allowOnlinePayment: true,
    allowCounterPayment: false,
    requireCounterApproval: false,
    address: `Common Area, ${prettyName}, NERIST`,
    status: 'active',
    isPublicCampus: true,
    slot: 50,
  };
}

/**
 * Returns all campus stations that should be visible on the student web app.
 * Filters out off-campus partner kiosks like Romen Xerox.
 */
export function getCampusStations(): StationConfig[] {
  // Return unique entries with isPublicCampus = true
  const seen = new Set<string>();
  const campusList: StationConfig[] = [];

  for (const station of Object.values(STATIONS)) {
    if (station.isPublicCampus && !seen.has(station.id)) {
      seen.add(station.id);
      campusList.push(station);
    }
  }

  // Ensure Block B is first, Block C is second, followed by others
  return campusList.sort((a, b) => a.slot - b.slot);
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a.trim());
  const bufB = Buffer.from(b.trim());
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Returns a cryptographically deterministic 64-character Secret Token for a station daemon.
 * Used exclusively for Zero-Cloud-Secret proxy authentication from hostel laptops.
 */
export function getStationToken(stationId: string): string {
  const normId = (stationId || DEFAULT_STATION_ID).toLowerCase().trim();
  const envVar = `STATION_TOKEN_${normId.toUpperCase()}`;
  if (process.env[envVar]) {
    return process.env[envVar]!;
  }

  const masterSecret = process.env.ADMIN_SECRET_KEY || 'kurox_zero_trust_station_salt_2026';
  const rawHash = crypto.createHmac('sha256', masterSecret).update(`station_daemon:${normId}`).digest('hex');
  return `kurox_st_${normId}_${rawHash}`;
}

import { queryD1 } from '@/lib/cloudflare-d1';

/**
 * Validates a daemon station token timing-safely and returns the associated station config.
 */
export function validateStationToken(token?: string | null): { isValid: boolean; station: StationConfig | null } {
  if (!token || typeof token !== 'string') return { isValid: false, station: null };
  const trimmed = token.trim();

  for (const station of Object.values(STATIONS)) {
    const expected = getStationToken(station.id);
    if (safeCompare(trimmed, expected)) {
      return { isValid: true, station };
    }
  }

  for (const station of Object.values(dynamicStationsCache)) {
    const expected = getStationToken(station.id);
    if (safeCompare(trimmed, expected)) {
      return { isValid: true, station };
    }
  }

  return { isValid: false, station: null };
}

/**
 * Async token validator that checks in-memory config first, then queries Cloudflare D1
 * to authenticate dynamic hostel/campus stations created via /adminkurox.
 */
export async function validateStationTokenAsync(
  token?: string | null
): Promise<{ isValid: boolean; station: StationConfig | null }> {
  if (!token || typeof token !== 'string') return { isValid: false, station: null };
  const trimmed = token.trim();

  // 1. Fast in-memory check
  const syncResult = validateStationToken(trimmed);
  if (syncResult.isValid && syncResult.station) {
    return syncResult;
  }

  // 2. Query Cloudflare D1 stations table
  try {
    const rows = await queryD1<{ id: string; name: string; short_name: string; station_token: string; admin_pin: string }>(
      `SELECT id, name, short_name, station_token, admin_pin FROM stations WHERE station_token = ? LIMIT 1`,
      [trimmed]
    );

    if (rows && rows.length > 0) {
      const row = rows[0];
      const station = getStationConfig(row.id);
      station.name = row.name || station.name;
      if (row.short_name) station.shortName = row.short_name;
      if (row.admin_pin) station.adminPin = row.admin_pin;
      registerDynamicStation(station);
      return { isValid: true, station };
    }

    // Also check if token matches getStationToken for any row in D1
    const allRows = await queryD1<{ id: string; name: string; short_name: string; station_token: string; admin_pin: string }>(
      `SELECT id, name, short_name, station_token, admin_pin FROM stations LIMIT 50`
    );
    for (const row of allRows) {
      if (safeCompare(trimmed, row.station_token) || safeCompare(trimmed, getStationToken(row.id))) {
        const station = getStationConfig(row.id);
        station.name = row.name || station.name;
        if (row.short_name) station.shortName = row.short_name;
        if (row.admin_pin) station.adminPin = row.admin_pin;
        registerDynamicStation(station);
        return { isValid: true, station };
      }
    }
  } catch (err) {
    console.error('validateStationTokenAsync D1 error:', err);
  }

  return { isValid: false, station: null };
}

/**
 * Validates station PIN with role detection (master admin vs station co-admin).
 */
export function validateStationPinWithRole(
  stationId: string,
  inputPin: string
): { isValid: boolean; isMaster: boolean } {
  if (!inputPin) return { isValid: false, isMaster: false };
  const station = getStationConfig(stationId);
  const masterPin = (process.env.ADMIN_SECRET_KEY || '').trim();

  // 1. Check Master Admin PIN from ENV
  if (masterPin && safeCompare(inputPin, masterPin)) {
    return { isValid: true, isMaster: true };
  }

  // 2. Fallback for unquoted #29 comment in .env
  if (masterPin === 'Kurox725' && (inputPin.trim() === 'Kurox725#29' || inputPin.trim() === 'Kurox725')) {
    return { isValid: true, isMaster: true };
  }

  // 3. In dev mode, allow default master PIN if no env secret configured
  if (process.env.NODE_ENV === 'development' && !masterPin) {
    if (safeCompare(inputPin, 'Kurox725#29')) {
      return { isValid: true, isMaster: true };
    }
  }

  // 4. Check station-specific co-admin PIN
  if (station.adminPin && safeCompare(inputPin, station.adminPin)) {
    return { isValid: true, isMaster: false };
  }

  return { isValid: false, isMaster: false };
}

/**
 * Async PIN validator that validates against env master secret, static configs,
 * and Cloudflare D1 stations table admin_pin.
 */
export async function validateStationPinWithRoleAsync(
  stationId: string,
  inputPin: string
): Promise<{ isValid: boolean; isMaster: boolean }> {
  if (!inputPin) return { isValid: false, isMaster: false };

  // 1. Fast in-memory check
  const syncResult = validateStationPinWithRole(stationId, inputPin);
  if (syncResult.isValid) {
    return syncResult;
  }

  // 2. Query Cloudflare D1 for dynamic station custodian PIN
  try {
    const rows = await queryD1<{ admin_pin: string }>(
      `SELECT admin_pin FROM stations WHERE id = ? OR id = ? OR id = ? LIMIT 1`,
      [stationId, normalizeStationId(stationId), `hostel_${stationId}`]
    );

    if (rows && rows.length > 0 && rows[0].admin_pin) {
      if (safeCompare(inputPin, rows[0].admin_pin)) {
        return { isValid: true, isMaster: false };
      }
    }
  } catch (err) {
    console.error('validateStationPinWithRoleAsync D1 error:', err);
  }

  return { isValid: false, isMaster: false };
}

export function validateStationPin(stationId: string, inputPin: string): boolean {
  return validateStationPinWithRole(stationId, inputPin).isValid;
}

