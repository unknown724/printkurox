const fs = require('fs');
const path = require('path');
const https = require('https');
const { fetchDossier } = require('./dossier');
const { initStudentIndex, getStudentByRoll, getStudentByPhone, regToDetailsMap, phoneToRegsMap } = require('./student_index');
const { rankCandidates } = require('./smart_search_engine');

const ADMIN_PHONE = (process.env.ADMIN_PHONE || '9863013886').replace(/[^0-9]/g, '').slice(-10);
const ADMIN_PHONES = new Set([
    '9863013886',
    '9525878871',
    ADMIN_PHONE
]);
const ADMIN_LIDS = new Set([
    '60769525878871',
    '60769525878871@lid'
]);

function isAdminUser(userPhone, senderJid) {
    if (userPhone) {
        const clean = String(userPhone).replace(/[^0-9]/g, '').slice(-10);
        if (ADMIN_PHONES.has(clean)) return true;
    }
    if (senderJid) {
        const cleanJid = String(senderJid).trim().toLowerCase();
        for (const ap of ADMIN_PHONES) {
            if (cleanJid.includes(ap)) return true;
        }
        for (const al of ADMIN_LIDS) {
            if (cleanJid.includes(al)) return true;
        }
    }
    return false;
}
const QUOTA_FILE = path.join(__dirname, 'user_quotas.json');
const VIP_ACCESS_FILE = path.join(__dirname, 'vip_access_state.json');
const DAILY_FREE_LIMIT = 3; // 3 free dossier unlocks per day (anti-abuse cap)
const SUPPORT_PACK_PRICE = 5;
const SUPPORT_PACK_CREDITS = 5;
const SUPPORTER_MONTHLY_PRICE = 49;

// Permanent Dossier VIP & Ban Lists (Synced directly with Cloudflare D1 every 10 min; 0 Worker hits)
let vipAccessCache = {
    unlimitedPhones: [],
    bannedPhones: [],
    updatedAt: '',
    lastSyncAt: 0
};
let _vipSyncInFlight = null;

function normalizePhone10(raw) {
    const digits = String(raw || '').replace(/[^0-9]/g, '');
    if (!digits) return '';
    const last10 = digits.slice(-10);
    return last10.length === 10 ? last10 : '';
}

function normalizePhoneEntryList(rawList) {
    if (!Array.isArray(rawList)) return [];
    const seen = new Set();
    const out = [];
    for (const item of rawList) {
        const rawPhone = typeof item === 'string' ? item : item?.phone;
        const phone = normalizePhone10(rawPhone);
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        out.push({
            phone,
            note: typeof item === 'object' && item?.note ? String(item.note).slice(0, 80) : '',
            addedAt: typeof item === 'object' && item?.addedAt ? String(item.addedAt) : new Date().toISOString()
        });
    }
    return out;
}

function loadLocalVipCache() {
    try {
        if (fs.existsSync(VIP_ACCESS_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(VIP_ACCESS_FILE, 'utf8'));
            vipAccessCache = {
                unlimitedPhones: normalizePhoneEntryList(parsed.unlimited ?? parsed.unlimitedPhones),
                bannedPhones: normalizePhoneEntryList(parsed.banned ?? parsed.bannedPhones),
                updatedAt: String(parsed.updatedAt || ''),
                lastSyncAt: Number(parsed.lastSyncAt || 0)
            };
        }
    } catch (e) {
        console.warn('[Student Module] Could not read vip_access_state.json:', e.message);
    }
}
loadLocalVipCache();

function saveLocalVipCache(state) {
    vipAccessCache = {
        unlimitedPhones: normalizePhoneEntryList(state.unlimitedPhones),
        bannedPhones: normalizePhoneEntryList(state.bannedPhones),
        updatedAt: String(state.updatedAt || new Date().toISOString()),
        lastSyncAt: Date.now()
    };
    try {
        fs.writeFileSync(VIP_ACCESS_FILE, JSON.stringify(vipAccessCache, null, 2), 'utf8');
    } catch (e) {
        console.warn('[Student Module] Could not write vip_access_state.json:', e.message);
    }
    return vipAccessCache;
}

function cfD1Query(sql, params = []) {
    return new Promise((resolve) => {
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
        const apiToken = process.env.CLOUDFLARE_API_TOKEN;
        if (!accountId || !databaseId || !apiToken) {
            return resolve({ ok: false, error: 'Missing Cloudflare D1 credentials' });
        }

        const payload = JSON.stringify({ sql, params });
        const req = https.request({
            hostname: 'api.cloudflare.com',
            path: `/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 10000
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data && data.success && Array.isArray(data.result) && data.result[0]) {
                        return resolve({ ok: true, rows: data.result[0].results || [] });
                    }
                    return resolve({ ok: false, error: data?.errors?.[0]?.message || 'D1 query failed' });
                } catch (err) {
                    return resolve({ ok: false, error: err.message });
                }
            });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message }));
        req.on('timeout', () => {
            try { req.destroy(); } catch (e) {}
            resolve({ ok: false, error: 'D1 query timed out' });
        });
        req.write(payload);
        req.end();
    });
}

async function syncVipStateFromD1(force = false) {
    if (!force && Date.now() - (vipAccessCache.lastSyncAt || 0) < 60 * 1000) {
        return vipAccessCache;
    }
    if (_vipSyncInFlight) return _vipSyncInFlight;

    _vipSyncInFlight = (async () => {
        try {
            const res = await cfD1Query(
                "SELECT value, updated_at FROM app_settings WHERE key = 'dossier_access_lists' LIMIT 1"
            );
            if (res.ok && res.rows && res.rows.length > 0) {
                const rawVal = res.rows[0].value;
                const parsed = typeof rawVal === 'string' ? JSON.parse(rawVal) : (rawVal || {});
                saveLocalVipCache({
                    unlimitedPhones: parsed.unlimited ?? parsed.unlimitedPhones ?? [],
                    bannedPhones: parsed.banned ?? parsed.bannedPhones ?? [],
                    updatedAt: parsed.updatedAt || res.rows[0].updated_at || new Date().toISOString()
                });
            }
        } catch (e) {
            console.warn('[Student Module] D1 VIP sync skipped:', e.message);
        } finally {
            _vipSyncInFlight = null;
        }
        return vipAccessCache;
    })();
    return _vipSyncInFlight;
}

async function pushVipStateToD1(nextState) {
    const cleanState = saveLocalVipCache({
        unlimitedPhones: nextState.unlimitedPhones,
        bannedPhones: nextState.bannedPhones,
        updatedAt: new Date().toISOString()
    });
    const serialized = JSON.stringify({
        unlimited: cleanState.unlimitedPhones,
        banned: cleanState.bannedPhones
    });
    const res = await cfD1Query(
        "INSERT INTO app_settings (key, value, updated_at) VALUES ('dossier_access_lists', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        [serialized]
    );
    return { savedD1: Boolean(res.ok), error: res.error, state: cleanState };
}

function listContainsPhone(entries, userPhone, senderJid) {
    if (!entries || entries.length === 0) return false;
    const clean = normalizePhone10(userPhone);
    const jidLower = String(senderJid || '').toLowerCase();
    for (const item of entries) {
        if (!item?.phone) continue;
        if (clean && item.phone === clean) return true;
        if (jidLower && jidLower.includes(item.phone)) return true;
    }
    return false;
}

function isBannedUser(userPhone, senderJid) {
    if (isAdminUser(userPhone, senderJid)) return false;
    return listContainsPhone(vipAccessCache.bannedPhones, userPhone, senderJid);
}

function isPermanentVip(userPhone, senderJid) {
    if (isBannedUser(userPhone, senderJid)) return false;
    return listContainsPhone(vipAccessCache.unlimitedPhones, userPhone, senderJid);
}

// Non-blocking boot sync + 10-minute background refresh (144 tiny D1 reads/day, 0 Worker hits)
setTimeout(() => { syncVipStateFromD1(true).catch(() => {}); }, 2500).unref();
setInterval(() => { syncVipStateFromD1(true).catch(() => {}); }, 10 * 60 * 1000).unref();

let studentsList = [];
const studentCleanIdMap = new Map();
const userLastStudent = new Map();
const activePaymentPollers = new Map(); // pollers keyed by paymentLinkId

// Load student records
try {
    const studentsPath = path.join(__dirname, 'students.json');
    if (fs.existsSync(studentsPath)) {
        studentsList = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
        console.log(`[Student Module] Loaded ${studentsList.length} student records.`);
        initStudentIndex(studentsList);
        for (const s of studentsList) {
            if (s.user_id) {
                const cleanKey = s.user_id.replace(/[^a-zA-Z0-9]/g, '_');
                studentCleanIdMap.set(cleanKey, s.user_id);
            }
        }
    }
} catch (e) {
    console.warn('[Student Module] Error loading students.json:', e.message);
}

// User Quota Management (In-Memory Cached for 0ms response latency)
let memoryQuotas = null;
let quotaSaveTimer = null;

function loadQuotas() {
    if (memoryQuotas) return memoryQuotas;
    try {
        if (fs.existsSync(QUOTA_FILE)) {
            memoryQuotas = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
            return memoryQuotas;
        }
    } catch (e) {
        console.warn('[Student Module] Error reading quota file:', e.message);
    }
    memoryQuotas = {};
    return memoryQuotas;
}

function saveQuotas(quotas) {
    memoryQuotas = quotas;
    if (quotaSaveTimer) clearTimeout(quotaSaveTimer);
    quotaSaveTimer = setTimeout(() => {
        try {
            fs.writeFile(QUOTA_FILE, JSON.stringify(memoryQuotas, null, 2), 'utf8', (err) => {
                if (err) console.warn('[Student Module] Async quota save error:', err.message);
            });
        } catch (e) {
            console.warn('[Student Module] Error saving quota file:', e.message);
        }
    }, 1000);
}

// IST Timezone Helpers for Daily Quota Reset
function getTodayIstDate() {
    const now = new Date();
    const istMs = now.getTime() + (5.5 * 60 * 60 * 1000);
    return new Date(istMs).toISOString().slice(0, 10);
}

function getDailyQuotaResetInfo() {
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(now.getTime() + istOffsetMs);

    const nextResetIst = new Date(nowIst);
    nextResetIst.setUTCDate(nextResetIst.getUTCDate() + 1);
    nextResetIst.setUTCHours(0, 0, 0, 0);

    const resetTimestamp = nextResetIst.getTime() - istOffsetMs;
    const diffMs = Math.max(0, resetTimestamp - now.getTime());
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    const countdownStr = hours > 0
        ? `${hours} hr${hours > 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''}`
        : `${mins} min${mins !== 1 ? 's' : ''}`;

    return {
        hours,
        mins,
        resetTimeStr: '12:00 AM midnight tonight',
        countdownStr
    };
}

function getUserQuota(userPhone) {
    const quotas = loadQuotas();
    const today = getTodayIstDate();
    const key = (userPhone || '').slice(-10);

    if (!quotas[key]) {
        quotas[key] = {
            dailyCount: 0,
            lastDate: today,
            paidCredits: 0,
            passExpiresAt: 0,
        };
    } else {
        if (quotas[key].lastDate !== today) {
            quotas[key].dailyCount = 0;
            quotas[key].lastDate = today;
        }
    }
    saveQuotas(quotas);
    return quotas[key];
}

function updateUserQuota(userPhone, updater) {
    const quotas = loadQuotas();
    const today = getTodayIstDate();
    const key = (userPhone || '').slice(-10);
    if (!quotas[key]) {
        quotas[key] = {
            dailyCount: 0,
            lastDate: today,
            paidCredits: 0,
            passExpiresAt: 0,
        };
    }
    updater(quotas[key]);
    saveQuotas(quotas);
    return quotas[key];
}

function checkAccess(userPhone, senderJid) {
    if (isBannedUser(userPhone, senderJid)) {
        return { granted: false, type: 'banned', unlimited: false };
    }
    if (isAdminUser(userPhone, senderJid)) {
        return { granted: true, type: 'admin', unlimited: true };
    }
    if (isPermanentVip(userPhone, senderJid)) {
        return { granted: true, type: 'permanent_vip', unlimited: true };
    }
    const cleanPhone = (userPhone || '').slice(-10);
    const quota = getUserQuota(cleanPhone);
    const now = Date.now();

    // Check Monthly VIP Pass
    if (quota.passExpiresAt && quota.passExpiresAt > now) {
        const daysLeft = Math.ceil((quota.passExpiresAt - now) / (1000 * 60 * 60 * 24));
        return { granted: true, type: 'monthly_pass', daysLeft };
    }

    // Check Paid Single Credits
    if (quota.paidCredits && quota.paidCredits > 0) {
        return { granted: true, type: 'paid_credit', credits: quota.paidCredits };
    }

    // Check Daily Free Limit
    if (quota.dailyCount < DAILY_FREE_LIMIT) {
        return { granted: true, type: 'free_daily', remaining: DAILY_FREE_LIMIT - quota.dailyCount };
    }

    return { granted: false, type: 'quota_exhausted' };
}

function consumeAccess(userPhone, senderJid) {
    if (isAdminUser(userPhone, senderJid) || isPermanentVip(userPhone, senderJid) || isBannedUser(userPhone, senderJid)) return;
    const cleanPhone = (userPhone || '').slice(-10);
    const access = checkAccess(cleanPhone, senderJid);
    if (access.type === 'monthly_pass' || access.type === 'admin' || access.type === 'permanent_vip' || access.type === 'banned') return;

    updateUserQuota(cleanPhone, (q) => {
        if (access.type === 'paid_credit') {
            q.paidCredits = Math.max(0, (q.paidCredits || 1) - 1);
        } else if (access.type === 'free_daily') {
            q.dailyCount = (q.dailyCount || 0) + 1;
        }
    });
}

function cleanHonorifics(str) {
    if (!str) return '';
    return str
        .replace(/\b(dr|mr|ms|prof|mrs|er|sir|maam|mam|madam|miss)\b\.?/gi, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function searchStudents(rawQuery) {
    if (!rawQuery || !rawQuery.trim()) return [];
    // Clean conversational query wrappers (e.g. "search for student named Richard Konsam" -> "Richard Konsam")
    let cleanRaw = rawQuery.replace(/\b(search\s+for|search|find|who\s+is|tell\s+me\s+about|details\s+of|profile\s+of|student|named|called)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanRaw) cleanRaw = rawQuery.trim();
    const q = cleanRaw.toLowerCase();
    const cleanQ = cleanHonorifics(q);

    // 1. Direct Roll / Reg No Match
    const byRoll = getStudentByRoll(cleanRaw);
    if (byRoll) return [byRoll];

    // 2. Alphanumeric match in user_id or roll_no (e.g. 120/011, 120011, D/22/AE/002, D22AE002)
    const rollQuery = q.replace(/[^a-zA-Z0-9]/g, '');
    const rollMatches = studentsList.filter(s => {
        const roll = (s.user_id || '').toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        const classRoll = (s.roll_no || '').toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        return roll === rollQuery || classRoll === rollQuery || (rollQuery.length >= 4 && (roll.includes(rollQuery) || classRoll.includes(rollQuery)));
    });
    if (rollMatches.length > 0) return rollMatches;

    // 3. Name Match
    const nameMatches = studentsList.filter((s) => {
        if (!s.full_name) return false;
        const normName = cleanHonorifics(s.full_name.toLowerCase());
        return normName.includes(cleanQ) || cleanQ.includes(normName);
    });
    if (nameMatches.length > 0) return nameMatches;

    // 4. Multi-word name match
    const words = cleanQ.split(' ').filter(Boolean);
    if (words.length > 1) {
        const multiMatches = studentsList.filter(s => {
            const cleanName = cleanHonorifics(s.full_name || '').toLowerCase();
            return words.every(w => cleanName.includes(w));
        });
        if (multiMatches.length > 0) return multiMatches;
    }

    // 5. ML / Hybrid Fuzzy Ranking (handles typos, phonetic variations, swapped names)
    const fuzzyMatches = rankCandidates(cleanQ, studentsList, (s) => s.full_name, 0.72, 5);
    if (fuzzyMatches.length > 0) return fuzzyMatches;

    // 6. Branch / Department Match
    return studentsList.filter((s) => {
        const dept = (s.department_name || s.degree_name || '').toLowerCase();
        return dept.includes(q);
    });
}

async function fetchStudentPhotoBuffer(targetRoll) {
    if (!targetRoll) return null;
    const cleanReg = targetRoll.replace(/\//g, '_');
    const rawCdnUrl = `https://saascdn.symphonyx.in/fetch/9/1/3/STUDENT_IMAGES/${cleanReg}.jpg`;
    const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(rawCdnUrl)}`;

    try {
        let res = await fetch(rawCdnUrl, { signal: AbortSignal.timeout(5000) });
        if (res.ok && res.headers.get('content-type')?.includes('image')) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 500) return buf;
        }
    } catch (e) {}

    try {
        let res = await fetch(wsrvUrl, { signal: AbortSignal.timeout(5000) });
        if (res.ok && res.headers.get('content-type')?.includes('image')) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 500) return buf;
        }
    } catch (e) {}

    return null;
}

// Helper: Aggregate all roll numbers across datasets (lateral entry, diploma + degree, PG, etc.)
function getAllRollNumbersForStudent(targetReg, targetName, phone, initialRoll) {
    const rolls = new Set();
    if (initialRoll && typeof initialRoll === 'string' && initialRoll.trim() && initialRoll.trim() !== 'N/A') {
        rolls.add(initialRoll.trim());
    }
    if (targetReg && regToDetailsMap && regToDetailsMap.has(targetReg)) {
        const details = regToDetailsMap.get(targetReg);
        if (details && details.rollNo && details.rollNo !== 'N/A') rolls.add(details.rollNo.trim());
    }
    if (targetReg && Array.isArray(studentsList)) {
        const matchReg = studentsList.find(s => s.user_id === targetReg);
        if (matchReg && matchReg.roll_no && matchReg.roll_no !== 'N/A') rolls.add(matchReg.roll_no.trim());
    }
    if (targetName && typeof targetName === 'string' && Array.isArray(studentsList)) {
        const normTarget = targetName.trim().toLowerCase();
        for (const s of studentsList) {
            if (s.full_name && s.full_name.trim().toLowerCase() === normTarget) {
                if (s.roll_no && s.roll_no !== 'N/A') rolls.add(s.roll_no.trim());
                if (regToDetailsMap && regToDetailsMap.has(s.user_id)) {
                    const details = regToDetailsMap.get(s.user_id);
                    if (details && details.rollNo && details.rollNo !== 'N/A') rolls.add(details.rollNo.trim());
                }
            }
        }
    }
    const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '').slice(-10) : '';
    if (cleanPhone && cleanPhone.length === 10 && phoneToRegsMap) {
        const matches = phoneToRegsMap.get(cleanPhone) || [];
        for (const m of matches) {
            if (regToDetailsMap && regToDetailsMap.has(m.regNo)) {
                const details = regToDetailsMap.get(m.regNo);
                if (details && details.rollNo && details.rollNo !== 'N/A') rolls.add(details.rollNo.trim());
            }
            if (Array.isArray(studentsList)) {
                const s = studentsList.find(st => st.user_id === m.regNo);
                if (s && s.roll_no && s.roll_no !== 'N/A') rolls.add(s.roll_no.trim());
            }
        }
    }
    return Array.from(rolls).filter(r => r && r !== 'N/A' && r.length > 2);
}

// Helper: Calculate/Resolve the correct current semester (fixes outdated semester slips)
function resolveCorrectSemester(topRecord, dossier, regRecord) {
    const romanMap = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8 };
    let candidateSem = null;
    if (topRecord && typeof topRecord.semester === 'number' && topRecord.semester > 0) {
        candidateSem = topRecord.semester;
    } else if (topRecord && topRecord.semester) {
        const num = parseInt(topRecord.semester, 10);
        if (!isNaN(num) && num > 0) candidateSem = num;
    }

    const semStr = regRecord?.semester || dossier?.semester || topRecord?.sem_string;
    let slipSem = null;
    if (semStr) {
        const match = String(semStr).match(/^(I|II|III|IV|V|VI|VII|VIII)/i);
        if (match) slipSem = romanMap[match[1].toUpperCase()];
        else {
            const mDigit = String(semStr).match(/(\d+)/);
            if (mDigit) slipSem = parseInt(mDigit[1], 10);
        }
    }

    // Only project if candidateSem was not already established from verified database
    if (!candidateSem) {
        const sessStr = regRecord?.session || dossier?.session || '';
        const sessMatch = String(sessStr).match(/(\d{4})-(\d{4})\s*(Jul|Jan)/i);
        if (slipSem && sessMatch) {
            // Note: Academic session "2025-2026 Jan-May" takes place in calendar year 2026 (the second year)
            const slipSeason = sessMatch[3].toLowerCase();
            const slipYear = slipSeason === 'jan' ? parseInt(sessMatch[2], 10) : parseInt(sessMatch[1], 10);
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth(); // 0-indexed: 6-11 is Jul-Dec
            const currentSeason = currentMonth >= 6 ? 'jul' : 'jan';
            let diffSems = (currentYear - slipYear) * 2;
            if (slipSeason === 'jan' && currentSeason === 'jul') diffSems += 1;
            else if (slipSeason === 'jul' && currentSeason === 'jan') diffSems -= 1;
            const projectedSem = slipSem + diffSems;
            candidateSem = projectedSem;
        }
    }

    const prog = ((topRecord && topRecord.program_name) || '').toLowerCase();
    let maxSem = 8;
    if (prog.includes('m.tech') || prog.includes('m.sc') || prog.includes('mba') || prog.includes('master')) maxSem = 4;
    else if (prog.includes('diploma')) maxSem = 6;
    else if (prog.includes('base') || prog.includes('certificate')) maxSem = 4;
    else if (prog.includes('phd')) maxSem = 10;

    if (candidateSem && candidateSem > maxSem) {
        candidateSem = maxSem;
    }

    return candidateSem || (slipSem ? Math.min(slipSem, maxSem) : (topRecord?.semester || 'N/A'));
}

// Core Dossier Unlock and Delivery Function
async function deliverUnlockedDossier({ sock, senderJid, targetRoll, targetName, userPhone, topRecord }) {
    await sock.sendMessage(senderJid, {
        text: `👤 *Student:* ${targetName}\n` +
              `📋 *Reg. No:* \`${targetRoll}\`\n\n` +
              `⏳ _Accessing..._`
    });

    if (!topRecord && targetRoll) {
        const matches = searchStudents(targetRoll);
        if (matches.length > 0) topRecord = matches[0];
    }

    const [dossier, photoBuffer] = await Promise.all([
        fetchDossier(targetRoll),
        fetchStudentPhotoBuffer(targetRoll)
    ]);

    const regRec = regToDetailsMap.get(targetRoll);
    let effDossier = {
        ...(regRec || {}),
        ...(dossier || {})
    };
    if (topRecord) {
        if (!effDossier.rollNo && topRecord.roll_no) effDossier.rollNo = topRecord.roll_no;
        if (!effDossier.phone && topRecord.mobile) effDossier.phone = topRecord.mobile;
        if (!effDossier.email && topRecord.email) effDossier.email = topRecord.email;
        if (!effDossier.semester && topRecord.semester) effDossier.semester = topRecord.semester;
        if (!effDossier.address && topRecord.pincode) effDossier.address = `PIN: ${topRecord.pincode}`;
    }
    if (regRec) {
        if (!effDossier.rollNo && (regRec.rollNo || regRec.roll_no)) effDossier.rollNo = regRec.rollNo || regRec.roll_no;
        if (!effDossier.phone && (regRec.mobile || regRec.phone)) effDossier.phone = regRec.mobile || regRec.phone;
        if (!effDossier.email && regRec.email) effDossier.email = regRec.email;
        if (!effDossier.parentsMobile && (regRec.parentMobile || regRec.parentsMobile)) effDossier.parentsMobile = regRec.parentMobile || regRec.parentsMobile;
    }

    if (effDossier || topRecord) {
        effDossier = effDossier || {};
        const isAdmin = isAdminUser(userPhone, senderJid);
        const headerTitle = isAdmin
            ? `👑 *ADMINISTRATOR CONFIDENTIAL DOSSIER*`
            : `🔓 *CONFIDENTIAL DOSSIER UNLOCKED*`;

        const allRolls = getAllRollNumbersForStudent(
            targetRoll,
            targetName,
            effDossier.phone || effDossier.parentsMobile || regRec?.mobile,
            effDossier.rollNo || regRec?.rollNo
        );

        const currentSem = resolveCorrectSemester(topRecord, effDossier, regRec);

        let dossierText = `${headerTitle}\n` +
                          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                          `👤 *Name:* ${targetName}\n` +
                          `📋 *Reg. No:* \`${targetRoll}\`\n`;

        if (allRolls.length > 1) {
            dossierText += `🔢 *Roll Nos:* ${allRolls.map(r => `\`${r}\``).join(' · ')}\n`;
        } else if (allRolls.length === 1) {
            dossierText += `🔢 *Roll No:* \`${allRolls[0]}\`\n`;
        }

        if (topRecord) {
            const isAlumni = topRecord.status === 'Alumni / Left' || effDossier.status === 'Alumni / Left';
            const statusDisplay = isAlumni
                ? (topRecord.program_year || 'Alumni / Ex-Student')
                : `${topRecord.program_year ? topRecord.program_year + ' · ' : ''}Semester ${topRecord.semester || currentSem} (Active)`;
            const gazetteInfo = topRecord.result_semester
                ? ` (Sem ${topRecord.result_semester} Result · Jan–May 2026)`
                : '';
            dossierText += `🏛️ *Dept:* ${topRecord.department_name || topRecord.degree_name || 'NERIST'}\n` +
                           `🎓 *Academic Status:* ${statusDisplay}\n` +
                           `📊 *Gazette CGPA:* ${topRecord.cgpa || 'N/A'}${gazetteInfo}\n` +
                           (topRecord.state ? `📍 *State:* ${topRecord.state}\n` : '');
        }

        dossierText += `\n📋 *Personal Information:*\n`;
        if (effDossier.phone) dossierText += `📞 *Phone:* ${effDossier.phone}\n`;
        if (effDossier.email) dossierText += `📧 *Email:* ${effDossier.email}\n`;
        if (effDossier.dob) dossierText += `🎂 *DOB:* ${effDossier.dob}\n`;
        if (effDossier.fatherName) dossierText += `👨 *Father:* ${effDossier.fatherName}\n`;
        if (effDossier.motherName) dossierText += `👩 *Mother:* ${effDossier.motherName}\n`;
        if (effDossier.parentsMobile) dossierText += `📱 *Parent Phone:* ${effDossier.parentsMobile}\n`;
        if (effDossier.address) dossierText += `🏠 *Address/Pin:* ${effDossier.address}\n`;
        if (effDossier.aadhaar) dossierText += `💳 *Aadhaar:* \`${effDossier.aadhaar}\`\n`;

        const accessSnapshot = checkAccess(userPhone, senderJid);
        if (isAdmin) {
            dossierText += `\n👑 *Access Level:* Administrator (Unlimited Searches & Decryptions Active)\n`;
        } else if (accessSnapshot.type === 'permanent_vip') {
            dossierText += `\n_👑 Permanent VIP Access Active (Unlimited ∞ Dossiers)_\n`;
        } else if (accessSnapshot.type === 'monthly_pass') {
            dossierText += `\n_🛡️ Server Supporter Pass Active (${accessSnapshot.daysLeft} days left)_\n`;
        } else if (accessSnapshot.type === 'paid_credit') {
            const leftAfter = Math.max(0, (accessSnapshot.credits || 1) - 1);
            dossierText += `\n_⚡ Bypass Credit Used (${leftAfter} never-expiring left)_\n`;
        } else if (accessSnapshot.type === 'free_daily') {
            const leftAfter = Math.max(0, (accessSnapshot.remaining || 1) - 1);
            dossierText += `\n_🛡️ Anti-Abuse Quota: ${leftAfter}/${DAILY_FREE_LIMIT} free left today (resets 12:00 AM IST)_\n`;
        }

        // Consume access quota
        consumeAccess(userPhone, senderJid);

        if (photoBuffer && photoBuffer.length > 500) {
            try {
                await sock.sendMessage(senderJid, {
                    image: photoBuffer,
                    caption: dossierText.trim()
                });
                return true;
            } catch (imgErr) {
                console.warn('[Student Module] Failed to send image message:', imgErr.message);
            }
        }

        await sock.sendMessage(senderJid, { text: dossierText.trim() });
    } else {
        await sock.sendMessage(senderJid, { text: `❌ Unable to unlock dossier for \`${targetRoll}\`.` });
    }
    return true;
}

// Helper: Create Razorpay Payment Link with auto-prefilled phone & start poller
async function createAndPollPaymentLink({
    razorpay,
    sock,
    getSock = null,
    senderJid,
    userPhone,
    senderName,
    amountInRs,
    isMonthly,
    targetRoll,
    targetName
}) {
    if (!razorpay) return null;
    const clean10Phone = (userPhone || '').slice(-10);
    const formattedPhone = clean10Phone.length === 10 ? `+91${clean10Phone}` : '+919362980761';
    const amountInPaise = amountInRs * 100;

    try {
        const link = await razorpay.paymentLink.create({
            amount: amountInPaise,
            currency: 'INR',
            accept_partial: false,
            description: isMonthly
                ? 'NERIST Directory Server Supporter (30 Days Unlimited)'
                : `NERIST Directory +${SUPPORT_PACK_CREDITS} Bypass Credits (Never Expire)`,
            customer: {
                name: senderName || 'NERIST Student',
                contact: formattedPhone,
            },
            notify: { sms: false, email: false },
            reminder_enable: false,
            notes: {
                service: 'student_directory',
                plan: isMonthly ? 'supporter_monthly' : 'bypass_pack_5',
                targetRoll: targetRoll || '',
                userPhone: clean10Phone,
            },
            upi_link: true,
        });

        // Start active 3-second background polling
        const pollStartTime = Date.now();
        const pollInterval = setInterval(async () => {
            try {
                if (Date.now() - pollStartTime > 10 * 60 * 1000) {
                    clearInterval(pollInterval);
                    activePaymentPollers.delete(link.id);
                    return;
                }

                const fetched = await razorpay.paymentLink.fetch(link.id);
                if (fetched.status === 'paid') {
                    clearInterval(pollInterval);
                    activePaymentPollers.delete(link.id);
                    console.log(`[Student Payment] Link ${link.id} PAID by ${clean10Phone}! Granting access...`);
                    const liveSock = (typeof getSock === 'function' ? getSock() : null) || sock;

                    if (isMonthly) {
                        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
                        updateUserQuota(clean10Phone, (q) => {
                            q.passExpiresAt = Date.now() + thirtyDays;
                        });
                        const expiryDate = new Date(Date.now() + thirtyDays).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                        });
                        await liveSock.sendMessage(senderJid, {
                            text:
                                `🛡️ *SERVER SUPPORTER PASS ACTIVATED!*\n` +
                                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                                `✅ *Contribution Confirmed:* ₹${SUPPORTER_MONTHLY_PRICE}\n` +
                                `🚀 *Tier:* Server Supporter (30 Days Unlimited, Anti-Abuse Exempt)\n` +
                                `📅 *Valid Until:* ${expiryDate}\n\n` +
                                `🙏 _Thank you for helping maintain the campus server!_`
                        });
                    } else {
                        updateUserQuota(clean10Phone, (q) => {
                            q.paidCredits = (q.paidCredits || 0) + SUPPORT_PACK_CREDITS;
                        });
                        await liveSock.sendMessage(senderJid, {
                            text:
                                `✅ *SERVER SUPPORT CONFIRMED (₹${SUPPORT_PACK_PRICE})*\n` +
                                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                                `⚡ *+${SUPPORT_PACK_CREDITS} Extra Bypass Credits* added (never expire).\n` +
                                `🙏 _Thank you for supporting server upkeep! Unlocking requested record..._`
                        });
                    }

                    // Auto-deliver the target dossier
                    if (targetRoll) {
                        const matches = searchStudents(targetRoll);
                        const top = matches.length > 0 ? matches[0] : null;
                        await deliverUnlockedDossier({
                            sock: liveSock,
                            senderJid,
                            targetRoll,
                            targetName: targetName || top?.full_name || targetRoll,
                            userPhone: clean10Phone,
                            topRecord: top
                        });
                    }
                }
            } catch (err) {
                console.warn('[Student Payment Poller] Error checking payment:', err.message);
            }
        }, 3000);

        activePaymentPollers.set(link.id, pollInterval);
        return link;
    } catch (e) {
        console.error('[Student Payment] Failed to create Razorpay link:', e.message);
        return null;
    }
}

// Send Anti-Abuse Limit & Optional Server Support Card when quota is exhausted
async function sendPaywallOptions({ sock, getSock = null, senderJid, targetRoll, targetName, userPhone, senderName, sendInteractiveButtons, razorpay }) {
    const cleanRollToken = (targetRoll || '').replace(/[^a-zA-Z0-9]/g, '_');
    if (targetRoll) studentCleanIdMap.set(cleanRollToken, targetRoll);

    const resetInfo = getDailyQuotaResetInfo();

    // Look up student record & registration cache for blurred/redacted preview teaser
    const matches = targetRoll ? searchStudents(targetRoll) : [];
    const top = matches.length > 0 ? matches[0] : null;
    const regRec = (targetRoll && regToDetailsMap) ? regToDetailsMap.get(targetRoll) : null;
    const rawPhone = regRec?.mobile || regRec?.phone || top?.mobile || '';
    const cleanPh = String(rawPhone).replace(/[^0-9]/g, '');
    const maskedPhone = cleanPh.length >= 10 ? `${cleanPh.slice(0, 5)} •••••` : '[Verified · Encrypted]';
    const maskedDob = regRec?.dob ? regRec.dob.replace(/\d{4}/, '••••') : '[Verified · Encrypted]';
    const hasParentsMobile = !!(regRec?.parentMobile || regRec?.parentsMobile);
    const hasAddress = !!(regRec?.address || top?.pincode);
    const displayName = targetName || top?.full_name || 'NERIST Student';
    const deptDisplay = top?.department_name || top?.degree_name || 'NERIST';
    const semDisplay = top?.semester ? `Semester ${top.semester}` : 'Degree';

    const paywallText =
        `🔒 *CONFIDENTIAL RECORD LOCATED (BLURRED / LOCKED)*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Target:* ${displayName}\n` +
        `📋 *Reg. No:* \`${targetRoll}\`\n` +
        `🏛️ *Dept:* ${deptDisplay} (${semDisplay})\n` +
        `📸 *Student Photo:* [Verified & Staged for Unlock]\n` +
        `📞 *Contact:* \`${maskedPhone}\`\n` +
        `🎂 *DOB:* \`${maskedDob}\`\n` +
        `👨 *Guardian / Parents:* [Verified · ${hasParentsMobile ? 'Contact Available' : 'Confidential'}]\n` +
        `🏠 *Address / PIN:* [Verified · ${hasAddress ? 'Available' : 'Confidential'}]\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🛡️ *ANTI-ABUSE LIMIT REACHED (${DAILY_FREE_LIMIT}/${DAILY_FREE_LIMIT} Today)*\n\n` +
        `To protect student privacy and prevent automated bulk scraping, full dossier lookups are capped at *${DAILY_FREE_LIMIT} free records per day*.\n\n` +
        `✅ *Basic \`@student\` search* stays *100% free & unlimited*.\n` +
        `⏳ Your 3 free credits auto-renew at *12:00 AM midnight IST* (in ${resetInfo.countdownStr}).\n\n` +
        `Need to unlock *${displayName}*'s complete profile right now?\n\n` +
        `⚡ *1. +${SUPPORT_PACK_CREDITS} Extra Bypass Credits — ₹${SUPPORT_PACK_PRICE}*\n` +
        `• ₹1 per unlock · Credits *never expire*\n` +
        `• Full confidential profile, parent contact & high-res photo\n\n` +
        `🛡️ *2. Server Supporter (30 Days) — ₹${SUPPORTER_MONTHLY_PRICE} / month*\n` +
        `• Unlimited lookups (anti-abuse exempt)\n` +
        `• Helps maintain the server`;

    const buttons = [
        {
            id: `btn_paywall_subscribe_${cleanRollToken}`,
            text: '🛡️ Subscribe & Credits'
        },
        {
            id: 'info_limit_policy',
            text: '❓ Why This Limit?'
        },
        {
            id: 'btn_paywall_chat_agent',
            text: '🤖 Chat ur Agent Kurox'
        }
    ];

    if (sendInteractiveButtons) {
        await sendInteractiveButtons({
            sock,
            jid: senderJid,
            title: '🛡️ Daily Anti-Abuse Cap Reached',
            body: paywallText,
            footer: 'Anti-Abuse Protection · Optional Server Support',
            buttons
        });
    } else {
        await sock.sendMessage(senderJid, {
            text: paywallText +
                `\n\n_Reply "5" for +5 Credits (₹5) or "49" for Monthly Supporter (₹49)._\n_Reply "agent" to chat with Agent Kurox._`
        });
    }
}

// Dedicated Sub-Card when student taps "🛡️ Subscribe & Credits"
async function sendSubscriptionOptionsCard({
    sock,
    getSock = null,
    senderJid,
    userPhone,
    senderName,
    targetRoll,
    razorpay,
    sendInteractiveButtons
}) {
    if (!targetRoll && userLastStudent.has(senderJid)) {
        targetRoll = userLastStudent.get(senderJid);
    }
    const cleanRollToken = (targetRoll || '').replace(/[^a-zA-Z0-9]/g, '_');
    if (targetRoll) studentCleanIdMap.set(cleanRollToken, targetRoll);

    let singleLink = null;
    let monthlyLink = null;
    if (razorpay) {
        try {
            const results = await Promise.allSettled([
                createAndPollPaymentLink({
                    razorpay,
                    sock,
                    getSock,
                    senderJid,
                    userPhone,
                    senderName,
                    amountInRs: SUPPORT_PACK_PRICE,
                    isMonthly: false,
                    targetRoll,
                    targetName: ''
                }),
                createAndPollPaymentLink({
                    razorpay,
                    sock,
                    getSock,
                    senderJid,
                    userPhone,
                    senderName,
                    amountInRs: SUPPORTER_MONTHLY_PRICE,
                    isMonthly: true,
                    targetRoll,
                    targetName: ''
                })
            ]);
            if (results[0].status === 'fulfilled') singleLink = results[0].value;
            if (results[1].status === 'fulfilled') monthlyLink = results[1].value;
        } catch (e) {
            console.warn('[Paywall] Error pre-generating payment links:', e.message);
        }
    }

    const matches = targetRoll ? searchStudents(targetRoll) : [];
    const top = matches.length > 0 ? matches[0] : null;
    const displayName = top?.full_name || targetRoll || 'NERIST Student';

    const subCardText =
        `💳 *CHOOSE A SERVER SUPPORT OPTION*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        (targetRoll ? `👤 *Target Record:* ${displayName} (\`${targetRoll}\`)\n\n` : '') +
        `⚡ *1. +${SUPPORT_PACK_CREDITS} Extra Bypass Credits — ₹${SUPPORT_PACK_PRICE}*\n` +
        `• Only ₹1 per unlock · Credits *never expire*\n` +
        `• Full confidential profile, parent contact & high-res photo\n\n` +
        `🛡️ *2. 30-Day Server Supporter — ₹${SUPPORTER_MONTHLY_PRICE} / month*\n` +
        `• Unlimited dossier lookups (anti-abuse exempt)\n` +
        `• Helps maintain the server\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        (singleLink?.short_url || monthlyLink?.short_url
            ? `🔗 *Instant UPI Checkout Links:*\n` +
              (singleLink?.short_url ? `• *₹${SUPPORT_PACK_PRICE} (+5 Credits):* ${singleLink.short_url}\n` : '') +
              (monthlyLink?.short_url ? `• *₹${SUPPORTER_MONTHLY_PRICE} (Monthly):* ${monthlyLink.short_url}\n` : '') +
              `_Auto-unlocks immediately upon UPI confirmation._\n\n`
            : '') +
        `_Tap an option below to proceed via Instant UPI:_`;

    const buttons = [];
    if (singleLink?.short_url) {
        buttons.push({
            text: `⚡ +${SUPPORT_PACK_CREDITS} Credits (₹${SUPPORT_PACK_PRICE})`,
            url: singleLink.short_url
        });
    } else {
        buttons.push({
            id: `btn_pay_single_${cleanRollToken}`,
            text: `⚡ +${SUPPORT_PACK_CREDITS} Credits (₹${SUPPORT_PACK_PRICE})`
        });
    }

    if (monthlyLink?.short_url) {
        buttons.push({
            text: `🛡️ Supporter (₹${SUPPORTER_MONTHLY_PRICE}/mo)`,
            url: monthlyLink.short_url
        });
    } else {
        buttons.push({
            id: 'btn_pay_monthly',
            text: `🛡️ Supporter (₹${SUPPORTER_MONTHLY_PRICE}/mo)`
        });
    }

    buttons.push({
        id: 'btn_paywall_chat_agent',
        text: '🤖 Chat ur Agent Kurox'
    });

    if (sendInteractiveButtons) {
        await sendInteractiveButtons({
            sock,
            jid: senderJid,
            title: '🛡️ Server Support & Bypass Credits',
            body: subCardText,
            footer: 'Instant UPI · Automatic Instant Activation',
            buttons
        });
    } else {
        await sock.sendMessage(senderJid, { text: subCardText });
    }
}

// Introduction & Academic Hub when student taps "🤖 Chat ur Agent Kurox"
async function sendAgentKuroxIntroCard({ sock, senderJid, senderName, sendInteractiveButtons }) {
    const hr = new Date().getHours();
    const timeGreeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const cleanName = (senderName && /^[a-zA-Z\s]{2,25}$/.test(senderName.trim())) ? `, ${senderName.trim()}` : '';

    const introText =
        `*${timeGreeting}${cleanName}!* ☀️\n\n` +
        `🤖 *Meet Agent Kurox — Your Campus AI Companion*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Hey there! I am *Agent Kurox*, an intelligent, versatile campus AI assistant designed specifically for NERISTians.\n\n` +
        `Beyond directory lookups, I can assist and automate almost anything for your academic journey:\n\n` +
        `📄 *1-Click Assignment Front Covers*\n` +
        `• Formatted to official NERIST specifications with institute crest, border & auto-filled details\n` +
        `• Download instantly as ready-to-print vector PDF or editable Word (.docx)\n\n` +
        `📝 *Academic Application Studio*\n` +
        `• Instant formal drafting for Hostel Leave, Bonafide certificates, NOC, and Permissions\n` +
        `• Formatted to official administrative standards with zero fluff\n\n` +
        `🎮 *Playable Offline Mini-Games*\n` +
        `• Snake, 2048, Tic-Tac-Toe, and Ludo\n` +
        `• Download as .html and play directly in your mobile browser with zero internet\n\n` +
        `📊 *Live Cinderac Portal Integration*\n` +
        `• Live course attendance tracking with 75% bunk/buffer calculator\n` +
        `• Full semester SGPA/CGPA trend graphs & official examination admit cards\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `_Tap an option below to start, or type any academic question to chat with me!_`;

    const buttons = [
        { id: 'btn_flow_cover', text: '📄 1-Click Cover' },
        { id: 'btn_flow_application', text: '📝 Write Application' },
        { id: 'btn_flow_game', text: '🎮 Play Games' },
        { id: 'btn_flow_attendance', text: '📊 Live Attendance' }
    ];

    if (sendInteractiveButtons) {
        await sendInteractiveButtons({
            sock,
            jid: senderJid,
            title: 'Agent Kurox · Campus AI Companion',
            body: introText,
            footer: 'Agent Kurox · Built for NERISTians',
            buttons
        });
    } else {
        await sock.sendMessage(senderJid, { text: introText });
    }
}

// Generate Razorpay Payment Link with auto-prefilled phone & start poller (for manual 5 / 49 replies)
async function handleRazorpayPayment({ sock, getSock = null, senderJid, userPhone, senderName, amountInRs, isMonthly, targetRoll, targetName, razorpay, sendInteractiveButtons }) {
    if (!razorpay) {
        await sock.sendMessage(senderJid, {
            text: `⚠️ *Support Gateway Unavailable:* UPI link generator is not configured right now.`
        });
        return;
    }

    const clean10Phone = (userPhone || '').slice(-10);
    const formattedPhone = clean10Phone.length === 10 ? `+91${clean10Phone}` : '+919362980761';

    const link = await createAndPollPaymentLink({
        razorpay,
        sock,
        getSock,
        senderJid,
        userPhone,
        senderName,
        amountInRs,
        isMonthly,
        targetRoll,
        targetName
    });

    if (!link || !link.short_url) {
        await sock.sendMessage(senderJid, {
            text: `⚠️ *Link Error:* Could not generate UPI support link. Please try again.`
        });
        return;
    }

    const paymentPrompt =
        `🛡️ *SERVER SUPPORT · INSTANT UPI*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📦 *Support Tier:* ${isMonthly ? '🛡️ 30-Day Server Supporter (Unlimited)' : `⚡ +${SUPPORT_PACK_CREDITS} Bypass Credits (Never Expire)`}\n` +
        `🙏 *Contribution:* *₹${amountInRs}*\n` +
        `📱 *Registered Phone:* ${formattedPhone}\n\n` +
        `🔗 *1-Tap UPI Link:*\n${link.short_url}\n\n` +
        `_Tap below to pay via GPay, PhonePe, or Paytm._\n` +
        `_Thank you for supporting 24/7 server maintenance — unlocks automatically once confirmed!_`;

    if (sendInteractiveButtons) {
        await sendInteractiveButtons({
            sock,
            jid: senderJid,
            title: `🛡️ Server Support (₹${amountInRs})`,
            body: paymentPrompt,
            footer: 'Optional Server Maintenance Support',
            buttons: [
                { text: `⚡ Contribute ₹${amountInRs} via UPI`, url: link.short_url }
            ]
        });
    } else {
        await sock.sendMessage(senderJid, { text: paymentPrompt });
    }
}

// MAIN MESSAGE HANDLER
async function handleStudentMessage({ sock, getSock = null, msg, rawBody, lowerBody, buttonId, senderJid, sendInteractiveButtons, razorpay, userPhone: passedPhone }) {
    if (!rawBody && !buttonId) return false;

    // HARD GUARD: Never intercept Cinderac authentication or login commands
    const cleanRaw = (rawBody || '').trim();
    if (/^(?:login|logout|@cinderac|cinderac)\b/i.test(cleanRaw)) {
        return false;
    }
    let userPhone = passedPhone || (senderJid || '').split('@')[0].replace(/[^0-9]/g, '').slice(-10);
    if (isAdminUser(userPhone, senderJid)) {
        userPhone = '9863013886';
    }
    const senderName = msg?.pushName || (isAdminUser(userPhone, senderJid) ? 'Administrator' : 'Student');

    // 1. ADMIN PHONE NUMBER LOOKUP (@phone <num>)
    if (lowerBody.startsWith('@phone') || lowerBody.startsWith('!phone') || lowerBody.startsWith('#phone')) {
        if (!isAdminUser(userPhone, senderJid)) {
            await sock.sendMessage(senderJid, { text: '🚫 *Access Denied:* Phone lookup is restricted to administrators only.' });
            return true;
        }
        const phoneQuery = rawBody.replace(/^[@!#]phone/i, '').trim();
        if (!phoneQuery) {
            await sock.sendMessage(senderJid, { text: '📱 *Usage:* `@phone <10-digit number>`\nExample: `@phone 7628811494`' });
            return true;
        }
        const matches = getStudentByPhone(phoneQuery);
        if (!matches || matches.length === 0) {
            await sock.sendMessage(senderJid, { text: `🔍 No student record found matching phone: \`${phoneQuery}\`` });
            return true;
        }
        let reply = `📱 *Phone Lookup Result (${matches.length} found):*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        for (const m of matches) {
            reply += `👤 *${m.full_name}*\n` +
                     `🆔 *Reg No:* \`${m.user_id}\`\n` +
                     (m.rollNo ? `🔢 *Roll No:* \`${m.rollNo}\`\n` : '') +
                     `🏛️ *Dept:* ${m.department_name || m.degree_name || 'NERIST'}\n` +
                     `🎓 *Program:* ${m.program_name || 'Degree'} (${m.status === 'Alumni / Left' ? (m.program_year || 'Alumni') : `Sem ${m.semester || 'N/A'}`})\n` +
                     (m.fatherName ? `👨 *Father:* ${m.fatherName}\n` : '') +
                     (m.motherName ? `👩 *Mother:* ${m.motherName}\n` : '') +
                     `📞 *Matched:* ${m.matchedPhone} (${m.matchType})\n` +
                     `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        }
        await sock.sendMessage(senderJid, { text: reply.trim() });
        return true;
    }

    // 1b. OWNER DOSSIER VIP & BAN CONTROLS (@unlock, @lock, @ban, @unban, @viplist)
    if (/^[@!#]?(unlock|lock|revokepass|ban|unban|viplist|vip)\b/i.test(cleanRaw)) {
        if (!isAdminUser(userPhone, senderJid)) {
            await sock.sendMessage(senderJid, { text: '🚫 *Access Denied:* VIP & Ban management is restricted to administrators only.' });
            return true;
        }

        await syncVipStateFromD1(true);
        const cmdMatch = cleanRaw.match(/^[@!#]?(unlock|lock|revokepass|ban|unban|viplist|vip)\s*(.*)$/i);
        const action = (cmdMatch?.[1] || '').toLowerCase();
        const argStr = (cmdMatch?.[2] || '').trim();

        if (action === 'viplist' || action === 'vip') {
            const vips = vipAccessCache.unlimitedPhones || [];
            const banned = vipAccessCache.bannedPhones || [];
            let listMsg = `👑 *PERMANENT DOSSIER ACCESS CONTROL*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            listMsg += `✅ *Permanent VIP Unlimited (∞):* ${vips.length}\n`;
            if (vips.length === 0) {
                listMsg += `_None added yet._\n`;
            } else {
                listMsg += vips.map((v, i) => `${i + 1}. \`+91${v.phone}\`${v.note ? ` — ${v.note}` : ''}`).join('\n') + '\n';
            }
            listMsg += `\n⛔ *Banned Numbers:* ${banned.length}\n`;
            if (banned.length === 0) {
                listMsg += `_None banned._\n`;
            } else {
                listMsg += banned.map((b, i) => `${i + 1}. \`+91${b.phone}\`${b.note ? ` — ${b.note}` : ''}`).join('\n') + '\n';
            }
            listMsg += `\n*Commands:*\n• \`@unlock <10-digit> [note]\` — Lifetime ∞ Dossier\n• \`@lock <10-digit>\` — Remove Lifetime VIP\n• \`@ban <10-digit> [reason]\` — Ban from Dossier\n• \`@unban <10-digit>\` — Lift Ban`;
            await sock.sendMessage(senderJid, { text: listMsg });
            return true;
        }

        const phoneMatch = argStr.match(/(\+?\d[\d\s\-]{8,15}\d)/);
        const targetPhone = normalizePhone10(phoneMatch ? phoneMatch[1] : '');
        const noteText = phoneMatch ? argStr.replace(phoneMatch[1], '').trim() : '';

        if (!targetPhone) {
            await sock.sendMessage(senderJid, {
                text: `📱 *Usage:* \`@${action} <10-digit WhatsApp number> [optional note]\`\nExample: \`@${action} 9876543210 Roommate\``
            });
            return true;
        }

        let nextVip = [...vipAccessCache.unlimitedPhones];
        let nextBanned = [...vipAccessCache.bannedPhones];

        if (action === 'unlock') {
            nextBanned = nextBanned.filter(x => x.phone !== targetPhone);
            nextVip = [{ phone: targetPhone, note: noteText || 'Owner WhatsApp Unlock', addedAt: new Date().toISOString() }, ...nextVip.filter(x => x.phone !== targetPhone)];
            const pushed = await pushVipStateToD1({ unlimitedPhones: nextVip, bannedPhones: nextBanned });
            await sock.sendMessage(senderJid, {
                text: `👑 *PERMANENT VIP UNLOCKED (∞)*\n` +
                      `📱 *Number:* \`+91${targetPhone}\`\n` +
                      (noteText ? `📝 *Note:* ${noteText}\n` : '') +
                      `♾️ *Quota:* Unlimited Dossiers Forever\n` +
                      `☁️ *D1 Sync:* ${pushed.savedD1 ? 'Synced (Admin + Bot)' : `Local saved (D1 pending: ${pushed.error})`}\n\n` +
                      `_To revoke or ban anytime, send \`@ban ${targetPhone}\` or \`@lock ${targetPhone}\`._`
            });
            return true;
        }

        if (action === 'lock' || action === 'revokepass') {
            nextVip = nextVip.filter(x => x.phone !== targetPhone);
            const pushed = await pushVipStateToD1({ unlimitedPhones: nextVip, bannedPhones: nextBanned });
            await sock.sendMessage(senderJid, {
                text: `🔒 *PERMANENT VIP REMOVED*\n` +
                      `📱 *Number:* \`+91${targetPhone}\` reverted to standard daily cap (3/day).\n` +
                      `☁️ *D1 Sync:* ${pushed.savedD1 ? 'Synced' : 'Local saved'}`
            });
            return true;
        }

        if (action === 'ban') {
            nextVip = nextVip.filter(x => x.phone !== targetPhone);
            nextBanned = [{ phone: targetPhone, note: noteText || 'Banned by Owner', addedAt: new Date().toISOString() }, ...nextBanned.filter(x => x.phone !== targetPhone)];
            const pushed = await pushVipStateToD1({ unlimitedPhones: nextVip, bannedPhones: nextBanned });
            await sock.sendMessage(senderJid, {
                text: `⛔ *NUMBER BANNED FROM DOSSIER*\n` +
                      `📱 *Number:* \`+91${targetPhone}\`\n` +
                      (noteText ? `📝 *Reason:* ${noteText}\n` : '') +
                      `🛡️ VIP revoked (if active) & dossier lookups blocked.\n` +
                      `☁️ *D1 Sync:* ${pushed.savedD1 ? 'Synced' : 'Local saved'}`
            });
            return true;
        }

        if (action === 'unban') {
            nextBanned = nextBanned.filter(x => x.phone !== targetPhone);
            const pushed = await pushVipStateToD1({ unlimitedPhones: nextVip, bannedPhones: nextBanned });
            await sock.sendMessage(senderJid, {
                text: `✅ *DOSSIER BAN LIFTED*\n` +
                      `📱 *Number:* \`+91${targetPhone}\` can use standard student lookups again.\n` +
                      `☁️ *D1 Sync:* ${pushed.savedD1 ? 'Synced' : 'Local saved'}`
            });
            return true;
        }
    }

    // 1c. BANNED USER ENFORCEMENT (blocks student dossier lookups, preserves PDF printing)
    if (isBannedUser(userPhone, senderJid)) {
        await sock.sendMessage(senderJid, {
            text: '⛔ *Access Restricted:* Your WhatsApp number has been restricted from student directory & dossier lookups by the administrator.\n\n_Automated document printing remains available._'
        });
        return true;
    }

    // 2. STUDENT DIRECTORY HOME / GUIDANCE
    const isStudentHomeTrigger =
        buttonId === 'btn_flow_student' ||
        lowerBody === '2' ||
        lowerBody === 'student' ||
        lowerBody === 'students' ||
        lowerBody === 'directory' ||
        lowerBody === '@student' ||
        lowerBody === '!student' ||
        lowerBody === '#student' ||
        lowerBody === 'find student' ||
        lowerBody === '@find student' ||
        lowerBody === 'student search';

    if (isStudentHomeTrigger) {
        const directoryGuide =
            '🎓 *Student Directory of Current NERIST*\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            'Search across 3,950+ students and academic batches.\n\n' +
            '🔍 *Quick Search Examples:*\n' +
            '• *By Name:* `@student richard`\n' +
            '• *By Reg No:* `@student 222/061`\n' +
            '• *By Class Roll:* `@student 21/043`\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
            '👉 *Type `@student <name>` to search any student!*';

        await sock.sendMessage(senderJid, { text: directoryGuide });
        return true;
    }

    // 2b. WHY IS THERE A LIMIT? (ANTI-ABUSE & SERVER COST TRANSPARENCY)
    if (buttonId === 'info_limit_policy' || lowerBody === 'why limit' || lowerBody === 'limit policy') {
        const resetInfo = getDailyQuotaResetInfo();
        const policyText =
            `🛡️ *WHY IS THERE A ${DAILY_FREE_LIMIT}/DAY DOSSIER LIMIT?*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `1️⃣ *Anti-Abuse & Student Privacy:*\n` +
            `Full dossiers contain personal phone numbers, parent contacts, DOB, and details. Without a daily cap, bots or spammers could scrape the entire campus directory.\n\n` +
            `2️⃣ *100% Free Every Day:*\n` +
            `• Basic \`@student\` search (name, roll, dept, sem, CGPA) is *unlimited & free*.\n` +
            `• You get *${DAILY_FREE_LIMIT} free dossier unlocks daily*, resetting automatically at *12:00 AM IST* (in ${resetInfo.countdownStr}).\n\n` +
            `3️⃣ *Optional Server Support (₹${SUPPORT_PACK_PRICE} / ₹${SUPPORTER_MONTHLY_PRICE}):*\n` +
            `Maintaining the 24/7 server and database has real costs. If you wait until midnight, you never need to pay ₹1. If you need extra lookups immediately or want full access:\n` +
            `• *₹${SUPPORT_PACK_PRICE}* → *+${SUPPORT_PACK_CREDITS} Extra Credits* (₹1/unlock, never expire)\n` +
            `• *₹${SUPPORTER_MONTHLY_PRICE}* → *30-Day Server Supporter* (unlimited, anti-abuse exempt)`;

        if (sendInteractiveButtons) {
            const lastRoll = userLastStudent.get(senderJid) || '';
            const cleanToken = lastRoll ? lastRoll.replace(/[^a-zA-Z0-9]/g, '_') : 'default';
            await sendInteractiveButtons({
                sock,
                jid: senderJid,
                title: '🛡️ Anti-Abuse & Privacy Policy',
                body: policyText,
                footer: 'Student Privacy Protection',
                buttons: [
                    { id: `btn_paywall_subscribe_${cleanToken}`, text: '🛡️ Subscribe & Credits' },
                    { id: 'btn_paywall_chat_agent', text: '🤖 Chat ur Agent Kurox' }
                ]
            });
        } else {
            await sock.sendMessage(senderJid, { text: policyText });
        }
        return true;
    }

    // 2c. FREE QUOTA & RESET CHECK (@quota / @credits / quota)
    if (lowerBody === '@quota' || lowerBody === '!quota' || lowerBody === 'quota' || lowerBody === '@credits' || lowerBody === 'my credits') {
        const access = checkAccess(userPhone, senderJid);
        const resetInfo = getDailyQuotaResetInfo();
        const q = getUserQuota((userPhone || '').slice(-10));
        let quotaMsg =
            `🛡️ *YOUR ANTI-ABUSE QUOTA STATUS*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

        if (access.type === 'banned') {
            quotaMsg += `⛔ *Status:* Restricted from Dossier Access\n`;
        } else if (access.type === 'admin') {
            quotaMsg += `👑 *Status:* Admin Unlimited Access\n`;
        } else if (access.type === 'permanent_vip') {
            quotaMsg += `👑 *Status:* Permanent VIP Unlimited Access (∞ Lifetime)\n`;
        } else if (access.type === 'monthly_pass') {
            quotaMsg += `🛡️ *Server Supporter Pass:* Active (${access.daysLeft} days left)\n`;
        } else {
            const freeLeft = Math.max(0, DAILY_FREE_LIMIT - (q.dailyCount || 0));
            quotaMsg += `🆓 *Free Daily Unlocks:* ${freeLeft}/${DAILY_FREE_LIMIT} left today\n`;
            quotaMsg += `⏳ *Next Free Reset:* 12:00 AM IST (in ${resetInfo.countdownStr})\n`;
            quotaMsg += `⚡ *Extra Bypass Credits:* ${q.paidCredits || 0} (never expire)\n`;
        }
        quotaMsg += `\n_Basic \`@student\` search is always 100% free & unlimited._`;
        await sock.sendMessage(senderJid, { text: quotaMsg });
        return true;
    }

    // 2d. SUBSCRIPTION & CREDITS SUB-MENU (btn_paywall_subscribe_...)
    if (buttonId && buttonId.startsWith('btn_paywall_subscribe_')) {
        const cleanToken = buttonId.replace('btn_paywall_subscribe_', '');
        const targetRoll = studentCleanIdMap.get(cleanToken) || cleanToken.replace(/_/g, '/');
        await sendSubscriptionOptionsCard({
            sock,
            getSock,
            senderJid,
            userPhone,
            senderName,
            targetRoll,
            razorpay,
            sendInteractiveButtons
        });
        return true;
    }

    // 2e. CHAT WITH AGENT KUROX HUB (btn_paywall_chat_agent)
    if (buttonId === 'btn_paywall_chat_agent' || buttonId === 'btn_flow_agent' || lowerBody === 'chat ur agent kurox') {
        await sendAgentKuroxIntroCard({
            sock,
            senderJid,
            senderName,
            sendInteractiveButtons
        });
        return true;
    }

    // 3. RAZORPAY SERVER SUPPORT TRIGGERS (₹5 for +5 Credits or ₹49 Monthly Supporter)
    if (buttonId && buttonId.startsWith('btn_pay_single_')) {
        const cleanToken = buttonId.replace('btn_pay_single_', '');
        const targetRoll = studentCleanIdMap.get(cleanToken) || cleanToken.replace(/_/g, '/');
        const matches = searchStudents(targetRoll);
        const top = matches.length > 0 ? matches[0] : null;
        await handleRazorpayPayment({
            sock,
            getSock,
            senderJid,
            userPhone,
            senderName,
            amountInRs: SUPPORT_PACK_PRICE,
            isMonthly: false,
            targetRoll,
            targetName: top ? top.full_name : targetRoll,
            razorpay,
            sendInteractiveButtons
        });
        return true;
    }

    if (buttonId === 'btn_pay_monthly' || lowerBody === '49' || lowerBody === '119' || lowerBody === 'monthly' || lowerBody === 'supporter' || lowerBody === 'vip') {
        const targetRoll = userLastStudent.get(senderJid) || '';
        const matches = targetRoll ? searchStudents(targetRoll) : [];
        const top = matches.length > 0 ? matches[0] : null;
        await handleRazorpayPayment({
            sock,
            getSock,
            senderJid,
            userPhone,
            senderName,
            amountInRs: SUPPORTER_MONTHLY_PRICE,
            isMonthly: true,
            targetRoll,
            targetName: top ? top.full_name : targetRoll,
            razorpay,
            sendInteractiveButtons
        });
        return true;
    }

    if (lowerBody === '5' || lowerBody === 'pay 5' || lowerBody === '3' || lowerBody === 'pay 3' || lowerBody === 'single' || lowerBody === 'pack') {
        const targetRoll = userLastStudent.get(senderJid) || '';
        if (targetRoll) {
            const matches = searchStudents(targetRoll);
            const top = matches.length > 0 ? matches[0] : null;
            await handleRazorpayPayment({
                sock,
                getSock,
                senderJid,
                userPhone,
                senderName,
                amountInRs: SUPPORT_PACK_PRICE,
                isMonthly: false,
                targetRoll,
                targetName: top ? top.full_name : targetRoll,
                razorpay,
                sendInteractiveButtons
            });
            return true;
        }
    }

    // 4. DOSSIER UNLOCK TRIGGER (unlock_ button, unlock, @dossier <query>)
    let dossierQuery = '';
    if (buttonId && buttonId.startsWith('unlock_')) {
        const cleanToken = buttonId.replace('unlock_', '');
        dossierQuery = studentCleanIdMap.get(cleanToken) || cleanToken.replace(/_/g, '/');
    } else if (lowerBody.startsWith('@dossier') || lowerBody.startsWith('!dossier') || lowerBody.startsWith('dossier ')) {
        dossierQuery = rawBody.replace(/^[@!#]?dossier\s*/i, '').trim();
    } else if (lowerBody === 'unlock' || lowerBody === 'unlock dossier' || (lowerBody === '1' && userLastStudent.has(senderJid))) {
        dossierQuery = userLastStudent.get(senderJid) || '';
    }

    if (dossierQuery) {
        const matches = searchStudents(dossierQuery);
        const top = matches.length > 0 ? matches[0] : null;
        const targetRoll = top ? top.user_id : dossierQuery;
        const targetName = top ? top.full_name : targetRoll;
        userLastStudent.set(senderJid, targetRoll);

        // Check Access
        const access = checkAccess(userPhone, senderJid);
        if (access.granted) {
            await deliverUnlockedDossier({
                sock,
                senderJid,
                targetRoll,
                targetName,
                userPhone,
                topRecord: top
            });
        } else {
            // Send paywall with 1-Tap direct UPI buttons & background poller
            await sendPaywallOptions({
                sock,
                getSock,
                senderJid,
                targetRoll,
                targetName,
                userPhone,
                senderName,
                sendInteractiveButtons,
                razorpay
            });
        }
        return true;
    }

    // 5. STUDENT SEARCH (@student <query>, student <query>, find student <query>, view_student_ button, search_ex_richard)
    let studentQuery = '';
    if (buttonId === 'search_ex_richard') {
        studentQuery = 'Richard';
    } else if (buttonId && buttonId.startsWith('view_student_')) {
        const altClean = buttonId.replace('view_student_', '');
        studentQuery = studentCleanIdMap.get(altClean) || altClean.replace(/_/g, '/');
    } else {
        const cleaned = rawBody.trim();
        // Robust pattern matching for natural queries:
        // "@student ...", "student ...", "find student ...", "search for student ...", "search student ...", "who is student ...", "who is ..."
        const m = cleaned.match(/^[@!#]?(?:search\s+for\s+student|find\s+student|student\s+search|search\s+student|who\s+is\s+student|who\s+is|student)\s+(.+)$/i);
        if (m && m[1]) {
            studentQuery = m[1].replace(/^(?:named|called|profile\s+of|details\s+of)\s+/i, '').trim();
        } else {
            const rollMatch = cleaned.match(/(?:\b|\/)([0-9]{2,3}[\/_][0-9]{2,4})\b/i) || cleaned.match(/\b([A-Za-z]\/[0-9]{2}\/[A-Za-z]{2}\/[0-9]{2,4})\b/i);
            if (rollMatch) {
                studentQuery = rollMatch[1];
            } else {
                studentQuery = cleaned.replace(/^(?:named|called)\s+/i, '').trim();
            }
        }
    }

    if (studentQuery) {
        const matches = searchStudents(studentQuery);
        if (matches.length > 0) {
            const top = matches[0];
            const rollNo = top.user_id || 'N/A';
            userLastStudent.set(senderJid, rollNo);

            // HARD RULE: Initial @student search card ONLY shows Name, Reg No, and Department.
            // Roll number, Program, Semester, CGPA, State, and personal info are strictly locked behind Unlock Dossier.
            let replyBody = `👤 *Name:* ${top.full_name}\n` +
                            `📋 *Reg. No:* \`${rollNo}\`\n` +
                            (top.roll_no ? `🔢 *Class Roll:* \`${top.roll_no}\`\n` : '') +
                            `🏛️ *Dept:* ${top.department_name || top.degree_name || 'NERIST'}\n` +
                            (top.status === 'Alumni / Left'
                                ? `🎓 *Status:* ${top.program_year || 'Alumni / Ex-Student'}`
                                : `🎓 *Academic Status:* ${top.program_year ? top.program_year + ' · ' : ''}Semester ${top.semester} (Active)`);

            const cleanRollToken = rollNo.replace(/[^a-zA-Z0-9]/g, '_');
            const actionButtons = [
                { id: `unlock_${cleanRollToken}`, text: '🔓 Unlock Dossier' }
            ];

            if (matches.length > 1) {
                for (let i = 1; i < Math.min(3, matches.length); i++) {
                    const alt = matches[i];
                    const altClean = (alt.user_id || '').replace(/[^a-zA-Z0-9]/g, '_');
                    const label = `👤 ${alt.full_name || 'Student'}`.trim();
                    actionButtons.push({
                        id: `view_student_${altClean}`,
                        text: label.length > 24 ? label.slice(0, 23) + '…' : label
                    });
                }
            }

            if (matches.length > 3) {
                replyBody += `\n\n_Additional matches (${matches.length - 3} more):_\n` +
                             matches.slice(3, 7).map(s => `• *${s.full_name}* (\`@student ${s.user_id}\`)`).join('\n');
            }

            replyBody += '\n\n_Tap a button below to unlock dossier or switch candidate:_';

            if (sendInteractiveButtons) {
                await sendInteractiveButtons({
                    sock,
                    jid: senderJid,
                    title: '🎓 NERIST Student Profile',
                    body: replyBody.trim(),
                    footer: matches.length > 1 ? `Found ${matches.length} matches · Tap to switch` : 'Confidential dossier is locked',
                    buttons: actionButtons
                });
            } else {
                await sock.sendMessage(senderJid, { text: replyBody.trim() });
            }
            return true;
        } else {
            await sock.sendMessage(senderJid, {
                text: `🔍 No student record found matching: "${studentQuery}".\n\n_Try searching by name or roll number (e.g. @student richard or @student 222/061)._`
            });
            return true;
        }
    }

    return false;
}

module.exports = {
    handleStudentMessage,
    searchStudents,
    sendPaywallOptions,
    sendSubscriptionOptionsCard,
    sendAgentKuroxIntroCard
};
