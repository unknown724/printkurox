const fs = require('fs');
const path = require('path');
const { fetchDossier } = require('./dossier');
const { initStudentIndex, getStudentByRoll, getStudentByPhone, regToDetailsMap, phoneToRegsMap } = require('./student_index');

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
const DAILY_FREE_LIMIT = 3; // 3 free dossier unlocks per day

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

function getUserQuota(userPhone) {
    const quotas = loadQuotas();
    const today = new Date().toISOString().slice(0, 10);
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
    const today = new Date().toISOString().slice(0, 10);
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
    if (isAdminUser(userPhone, senderJid)) {
        return { granted: true, type: 'admin', unlimited: true };
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
    if (isAdminUser(userPhone, senderJid)) return;
    const cleanPhone = (userPhone || '').slice(-10);
    const access = checkAccess(cleanPhone, senderJid);
    if (access.type === 'monthly_pass' || access.type === 'admin') return;

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
    const q = rawQuery.trim().toLowerCase();
    const cleanQ = cleanHonorifics(q);

    // 1. Direct Roll / Reg No Match
    const byRoll = getStudentByRoll(rawQuery.trim());
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

    // 5. Branch / Department Match
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

    const sessStr = regRecord?.session || dossier?.session || '';
    const sessMatch = String(sessStr).match(/(\d{4})-(\d{4})\s*(Jul|Jan)/i);
    if (slipSem && sessMatch) {
        const slipYear = parseInt(sessMatch[1], 10);
        const slipSeason = sessMatch[3].toLowerCase();
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-indexed: 6-11 is Jul-Dec
        const currentSeason = currentMonth >= 6 ? 'jul' : 'jan';
        let diffSems = (currentYear - slipYear) * 2;
        if (slipSeason === 'jan' && currentSeason === 'jul') diffSems += 1;
        else if (slipSeason === 'jul' && currentSeason === 'jan') diffSems -= 1;
        const projectedSem = slipSem + diffSems;
        if (projectedSem > (candidateSem || 0)) {
            candidateSem = projectedSem;
        }
    }

    const prog = ((topRecord && topRecord.program_name) || '').toLowerCase();
    let maxSem = 8;
    if (prog.includes('m.tech') || prog.includes('m.sc') || prog.includes('mba') || prog.includes('master')) maxSem = 4;
    else if (prog.includes('diploma')) maxSem = 6;
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
            const semDisplay = isAlumni ? 'Alumni / Ex-Student' : `Sem ${topRecord.semester || currentSem}`;
            dossierText += `🏛️ *Dept:* ${topRecord.department_name || topRecord.degree_name || 'NERIST'}\n` +
                           `🎓 *Program:* ${topRecord.program_name || 'Degree'} (${semDisplay})\n` +
                           `📊 *CGPA:* ${topRecord.cgpa || 'N/A'}\n` +
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

        if (isAdmin) {
            dossierText += `\n👑 *Access Level:* Administrator (Unlimited Searches & Decryptions Active)\n`;
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
                ? 'PrintKurox Student Directory VIP Monthly Pass (30 Days)'
                : `PrintKurox Student Dossier Unlock (${targetRoll || 'Single'})`,
            customer: {
                name: senderName || 'NERIST Student',
                contact: formattedPhone,
            },
            notify: { sms: false, email: false },
            reminder_enable: false,
            notes: {
                service: 'student_directory',
                plan: isMonthly ? 'monthly_pass' : 'single_unlock',
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
                        await sock.sendMessage(senderJid, {
                            text:
                                `🎉 *VIP MONTHLY PASS ACTIVATED!*\n` +
                                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                                `✅ *Payment Received:* ₹119\n` +
                                `⭐ *Plan:* VIP Pass (30 Days Unlimited Access)\n` +
                                `📅 *Valid Until:* ${expiryDate}\n\n` +
                                `You now have unlimited student directory searches and dossier unlocks!`
                        });
                    } else {
                        updateUserQuota(clean10Phone, (q) => {
                            q.paidCredits = (q.paidCredits || 0) + 1;
                        });
                        await sock.sendMessage(senderJid, {
                            text:
                                `✅ *PAYMENT CONFIRMED (₹3)*\n` +
                                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                                `1 Dossier unlock credit added. Decrypting student archive...`
                        });
                    }

                    // Auto-deliver the target dossier
                    if (targetRoll) {
                        const matches = searchStudents(targetRoll);
                        const top = matches.length > 0 ? matches[0] : null;
                        await deliverUnlockedDossier({
                            sock,
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

// Send Paywall Card when quota is exhausted
async function sendPaywallOptions({ sock, senderJid, targetRoll, targetName, userPhone, senderName, sendInteractiveButtons, razorpay }) {
    const cleanRollToken = (targetRoll || '').replace(/[^a-zA-Z0-9]/g, '_');

    // Pre-generate direct 1-Tap UPI Links for seamless instant payment via Google Pay / PhonePe
    let singleLink = null;
    let monthlyLink = null;
    if (razorpay) {
        try {
            const results = await Promise.allSettled([
                createAndPollPaymentLink({
                    razorpay,
                    sock,
                    senderJid,
                    userPhone,
                    senderName,
                    amountInRs: 3,
                    isMonthly: false,
                    targetRoll,
                    targetName
                }),
                createAndPollPaymentLink({
                    razorpay,
                    sock,
                    senderJid,
                    userPhone,
                    senderName,
                    amountInRs: 119,
                    isMonthly: true,
                    targetRoll,
                    targetName
                })
            ]);
            if (results[0].status === 'fulfilled') singleLink = results[0].value;
            if (results[1].status === 'fulfilled') monthlyLink = results[1].value;
        } catch (e) {
            console.warn('[Paywall] Error pre-generating payment links:', e.message);
        }
    }

    let linkAddendum = '';
    if (singleLink?.short_url || monthlyLink?.short_url) {
        linkAddendum =
            `\n\n🔗 *Direct 1-Tap UPI Links:*\n` +
            (singleLink?.short_url ? `• *Pay ₹3 (Single):* ${singleLink.short_url}\n` : '') +
            (monthlyLink?.short_url ? `• *Pay ₹119 (VIP Pass):* ${monthlyLink.short_url}\n` : '') +
            `_Tap a button or link above to pay instantly via Google Pay, PhonePe, or Paytm._\n` +
            `_Access unlocks automatically upon payment!_`;
    }

    const paywallText =
        `🔒 *CONFIDENTIAL DOSSIER LOCKED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Student:* ${targetName || 'NERIST Student'} (${targetRoll})\n\n` +
        `You have used your 3 free credits for today.\n` +
        `Unlock full confidential records, contact details, and official photo:\n\n` +
        `💳 *1. Single Dossier Unlock — ₹3*\n` +
        `• Full confidential profile for ${targetName}\n` +
        `• Official photo\n` +
        `• 1 instant unlock\n\n` +
        `⭐ *2. Monthly VIP Pass — ₹119 / month*\n` +
        `• 30 Days Unlimited Searches & Dossiers\n` +
        `• Unlimited photo downloads\n` +
        `• Instant VIP badge`;

    const buttons = [];
    if (singleLink?.short_url) {
        buttons.push({
            text: '⚡ Pay ₹3 (UPI / GPay / PhonePe)',
            url: singleLink.short_url
        });
    } else {
        buttons.push({
            id: `btn_pay_single_${cleanRollToken}`,
            text: '💳 Unlock Once (₹3)'
        });
    }

    if (monthlyLink?.short_url) {
        buttons.push({
            text: '⭐ VIP Monthly Pass (₹119)',
            url: monthlyLink.short_url
        });
    } else {
        buttons.push({
            id: 'btn_pay_monthly',
            text: '⭐ Monthly VIP Pass (₹119)'
        });
    }

    if (sendInteractiveButtons) {
        await sendInteractiveButtons({
            sock,
            jid: senderJid,
            title: '🔒 Unlock Confidential Student Dossier',
            body: paywallText,
            footer: 'Razorpay Instant UPI Auto-Verify',
            buttons
        });
    } else {
        await sock.sendMessage(senderJid, { text: paywallText + linkAddendum });
    }
}

// Generate Razorpay Payment Link with auto-prefilled phone & start poller (for manual 3 / 119 replies)
async function handleRazorpayPayment({ sock, senderJid, userPhone, senderName, amountInRs, isMonthly, targetRoll, targetName, razorpay, sendInteractiveButtons }) {
    if (!razorpay) {
        await sock.sendMessage(senderJid, {
            text: `⚠️ *Payment Gateway Unavailable:* Razorpay credentials are not configured.`
        });
        return;
    }

    const clean10Phone = (userPhone || '').slice(-10);
    const formattedPhone = clean10Phone.length === 10 ? `+91${clean10Phone}` : '+919362980761';

    const link = await createAndPollPaymentLink({
        razorpay,
        sock,
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
            text: `⚠️ *Payment Link Error:* Could not generate UPI link. Please try again.`
        });
        return;
    }

    const paymentPrompt =
        `💳 *Razorpay Instant UPI Payment*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📦 *Service:* ${isMonthly ? '⭐ 30-Day VIP Pass (Unlimited)' : `🔓 Dossier Unlock (${targetName || targetRoll})`}\n` +
        `💰 *Amount Due:* *₹${amountInRs}*\n` +
        `📱 *Registered Phone:* ${formattedPhone}\n\n` +
        `🔗 *Direct 1-Tap UPI Link:*\n${link.short_url}\n\n` +
        `_Tap the button or link above to pay via GPay, PhonePe, or Paytm._\n` +
        `_Your phone number is pre-verified! Access unlocks automatically upon payment._`;

    if (sendInteractiveButtons) {
        await sendInteractiveButtons({
            sock,
            jid: senderJid,
            title: `💳 Pay ₹${amountInRs} via UPI`,
            body: paymentPrompt,
            footer: 'Razorpay Auto-Verify',
            buttons: [
                { text: `⚡ Pay ₹${amountInRs} (GPay / PhonePe / UPI)`, url: link.short_url }
            ]
        });
    } else {
        await sock.sendMessage(senderJid, { text: paymentPrompt });
    }
}

// MAIN MESSAGE HANDLER
async function handleStudentMessage({ sock, msg, rawBody, lowerBody, buttonId, senderJid, sendInteractiveButtons, razorpay, userPhone: passedPhone }) {
    if (!rawBody && !buttonId) return false;
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
                     `🎓 *Program:* ${m.program_name || 'Degree'} (Sem ${m.semester || 'N/A'})\n` +
                     (m.fatherName ? `👨 *Father:* ${m.fatherName}\n` : '') +
                     (m.motherName ? `👩 *Mother:* ${m.motherName}\n` : '') +
                     `📞 *Matched:* ${m.matchedPhone} (${m.matchType})\n` +
                     `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        }
        await sock.sendMessage(senderJid, { text: reply.trim() });
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

    // 3. RAZORPAY PAYMENT TRIGGERS (₹3 Single Unlock or ₹119 Monthly Pass)
    if (buttonId && buttonId.startsWith('btn_pay_single_')) {
        const cleanToken = buttonId.replace('btn_pay_single_', '');
        const targetRoll = studentCleanIdMap.get(cleanToken) || cleanToken.replace(/_/g, '/');
        const matches = searchStudents(targetRoll);
        const top = matches.length > 0 ? matches[0] : null;
        await handleRazorpayPayment({
            sock,
            senderJid,
            userPhone,
            senderName,
            amountInRs: 3,
            isMonthly: false,
            targetRoll,
            targetName: top ? top.full_name : targetRoll,
            razorpay,
            sendInteractiveButtons
        });
        return true;
    }

    if (buttonId === 'btn_pay_monthly' || lowerBody === '119' || lowerBody === 'monthly' || lowerBody === 'vip') {
        const targetRoll = userLastStudent.get(senderJid) || '';
        const matches = targetRoll ? searchStudents(targetRoll) : [];
        const top = matches.length > 0 ? matches[0] : null;
        await handleRazorpayPayment({
            sock,
            senderJid,
            userPhone,
            senderName,
            amountInRs: 119,
            isMonthly: true,
            targetRoll,
            targetName: top ? top.full_name : targetRoll,
            razorpay,
            sendInteractiveButtons
        });
        return true;
    }

    if (lowerBody === '3' || lowerBody === 'pay 3' || lowerBody === 'single') {
        const targetRoll = userLastStudent.get(senderJid) || '';
        if (targetRoll) {
            const matches = searchStudents(targetRoll);
            const top = matches.length > 0 ? matches[0] : null;
            await handleRazorpayPayment({
                sock,
                senderJid,
                userPhone,
                senderName,
                amountInRs: 3,
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
        dossierQuery = rawBody.replace(/^[@!#]?dossiers*/i, '').trim();
    } else if (lowerBody === 'unlock' || lowerBody === 'unlock dossier') {
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
        const m = cleaned.match(/^[@!#]?(?:find\s+student|student\s+search|search\s+student|student)\s+(.+)$/i);
        if (m && m[1]) {
            studentQuery = m[1].trim();
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
                                ? `🎓 *Status:* Alumni / Ex-Student`
                                : `🎓 *Semester:* Semester ${top.semester} (Odd Sem)`);

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

            replyBody += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n👉 Reply *unlock* to view full dossier & photo!';

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
    searchStudents
};
