/**
 * =============================================================================
 * NERIST Faculty Search Module (Migrated from personal bot 9863013886)
 * =============================================================================
 * Supports smart acronym/initials, email handle, name, and department queries
 * via @find / !find / @faculty / !faculty in both DMs and WhatsApp groups.
 * Features 1-tap interactive disambiguation quick-reply buttons when multiple
 * faculty match, mirroring the student search disambiguation flow.
 */

const fs = require('fs');
const path = require('path');
const {
  matchScore,
  rankCandidates,
  resolveDepartment,
  formatClickablePhone,
} = require('./smart_search_engine');

let facultyList = [];
let facultySearchCount = 0;
const facultyCleanIdMap = new Map();
const lastFacultySearchMap = new Map(); // senderJid -> array of matched faculty records
const groupCooldownMap = new Map(); // groupJid -> timestamp of last reply (anti-flood)
const GROUP_COOLDOWN_MS = 2500; // 2.5s debounce per group

function getFacultyToken(f, idx = 0) {
  if (f._assignedToken) return f._assignedToken;
  let base = f.portalId
    ? f.portalId.replace(/[^a-zA-Z0-9]/g, '_')
    : 'fn_' + (f.name || f.portalName || `fac_${idx}`).replace(/[^a-zA-Z0-9]/g, '_');
  if (facultyCleanIdMap.has(base) && facultyCleanIdMap.get(base) !== f) {
    base = `${base}_${idx}`;
  }
  f._assignedToken = base;
  return base;
}

function initFacultyIndex(list) {
  facultyList = list || [];
  facultyCleanIdMap.clear();
  facultyList.forEach((f, idx) => {
    delete f._assignedToken;
    const token = getFacultyToken(f, idx);
    facultyCleanIdMap.set(token, f);
    if (f.portalId) {
      facultyCleanIdMap.set(f.portalId.toLowerCase().trim(), f);
    }
  });
}

try {
  const facultyPath = path.join(__dirname, 'faculty.json');
  if (fs.existsSync(facultyPath)) {
    const rawData = JSON.parse(fs.readFileSync(facultyPath, 'utf8'));
    initFacultyIndex(rawData);
    console.log(`[Faculty Module] Loaded ${facultyList.length} faculty records from faculty.json (${facultyCleanIdMap.size} index entries).`);
  } else {
    console.warn(`[Faculty Module] Warning: faculty.json not found at ${facultyPath}`);
  }
} catch (err) {
  console.warn('[Faculty Module] Failed to load faculty.json:', err.message);
}

/**
 * Clean honorifics and titles (Dr, Mr, Ms, Prof, Sir, Maam, etc.)
 */
function cleanHonorifics(str) {
  if (!str) return '';
  return str
    .replace(/\b(dr|mr|ms|prof|mrs|er|sir|maam|mam|madam|miss)\b\.?/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts all acronym combinations (e.g. "Joyatri Bora Hazarika" -> ['jbh', 'jb', 'jh'])
 */
function getAllAcronyms(nameStr) {
  const cleaned = cleanHonorifics(nameStr);
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const initials = words.map((w) => w[0].toLowerCase());
  const full = initials.join('');
  const list = new Set();
  list.add(full);

  if (words.length >= 3) {
    list.add(initials[0] + initials[1]);
    list.add(initials[0] + initials[words.length - 1]);
  }
  return Array.from(list);
}

/**
 * Faculty Smart Search with Acronym & Nickname support (e.g. jb, jb maam, akr, akr sir)
 */
function searchFaculty(rawQuery) {
  if (!rawQuery) return [];
  const qStr = rawQuery.trim();
  const lowerQ = qStr.toLowerCase();
  const cleaned = cleanHonorifics(qStr).toLowerCase();
  const q = cleaned || lowerQ;
  if (!q) return [];

  // 0. Direct token or portalId match
  const tokenMatch = facultyCleanIdMap.get(qStr) || facultyCleanIdMap.get(lowerQ);
  if (tokenMatch) return [tokenMatch];

  const portalMatches = facultyList.filter(
    (f) => f.portalId && f.portalId.toLowerCase() === lowerQ
  );
  if (portalMatches.length > 0) return portalMatches;

  // 1. Acronym match (when query is short: <= 4 letters, no spaces)
  if (q.length <= 4 && !q.includes(' ')) {
    const acronymMatches = facultyList.filter((f) => {
      const acrs = [
        ...getAllAcronyms(f.name),
        ...getAllAcronyms(f.portalName),
      ];
      return acrs.includes(q) || acrs.some((a) => a.startsWith(q));
    });
    if (acronymMatches.length > 0) return acronymMatches;
  }

  // 2. Email username match
  const emailMatch = facultyList.filter((f) =>
    (f.emails || []).some((em) => em.toLowerCase().split('@')[0] === q)
  );
  if (emailMatch.length > 0) return emailMatch;

  // 3. Name or portal name match
  const nameMatches = facultyList.filter((f) => {
    const n = cleanHonorifics(f.name || '').toLowerCase();
    const pn = cleanHonorifics(f.portalName || '').toLowerCase();
    return (
      n.includes(q) ||
      pn.includes(q) ||
      (f.name || '').toLowerCase().includes(q) ||
      (f.portalName || '').toLowerCase().includes(q)
    );
  });
  if (nameMatches.length > 0) return nameMatches;

  // 4. ML / Hybrid Fuzzy Ranking (handles typos like "gautm roy", "sarshing gao", transposed letters)
  const fuzzyMatches = rankCandidates(q, facultyList, (f) => f.name || f.portalName, 0.68, 5);
  if (fuzzyMatches.length > 0) return fuzzyMatches;

  // 5. Department match
  const deptMatches = facultyList.filter((f) => {
    const dept = (f.department || '').toLowerCase();
    return dept.includes(q);
  });
  if (deptMatches.length > 0) return deptMatches;

  // 6. Phone / Mobile number match (e.g. searching by 10-digit mobile or extension)
  const digits = q.replace(/[^0-9]/g, '');
  if (digits.length >= 6) {
    const phoneMatches = facultyList.filter((f) => {
      const allPhones = ((f.portalPhone || '') + ' ' + (f.officialPhone || '')).replace(/[^0-9]/g, '');
      return allPhones.includes(digits);
    });
    if (phoneMatches.length > 0) return phoneMatches;
  }

  return [];
}

function getFacultySearchCount() {
  return facultySearchCount;
}

function getFacultyCount() {
  return facultyList.length;
}

function isGroupFacultyCommand(rawText, buttonId = null) {
  // In groups, completely ignore all button interactions to prevent group-wide feedback loops
  if (buttonId) return false;
  const trimmed = (rawText || '').trim();
  if (!trimmed) return false;
  // In groups, strictly require @find or !find at the beginning of the text
  return /^[@!]find\b/i.test(trimmed);
}

/**
 * Extract and format all distinct valid phone / mobile numbers
 * (Only returns authentic 10-digit mobile numbers starting with 6-9;
 * suppresses confusing landlines, EPABX extensions, and office desks).
 */
function formatFacultyPhone(f) {
  const rawList = [f.portalPhone, f.officialPhone].filter(Boolean);
  const numbers = [];

  rawList.forEach((raw) => {
    // 10-digit Indian mobile numbers (starting with 6, 7, 8, 9)
    const mobiles = raw.match(/(?:(?:\+91|91|0)[-\s]?)?[6-9]\d{9}\b/g) || [];
    mobiles.forEach((m) => {
      const clean = m.replace(/[^0-9]/g, '').slice(-10);
      if (!numbers.includes(clean)) numbers.push(clean);
    });
  });

  if (numbers.length === 0) {
    return 'Not listed';
  }

  // Format as clickable WhatsApp numbers (+91 XXXXX XXXXX)
  return numbers.map((n) => formatClickablePhone(n)).join(', ');
}

/**
 * Format department faculty roster into a clean, structured directory card
 */
function formatDepartmentRoster(deptName, facultyInDept) {
  const count = facultyInDept.length;
  let text =
    `🏛️ *NERIST Department of ${deptName}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 *Faculty Members (${count} listed):*\n`;

  // Sort by Designation precedence
  const sorted = [...facultyInDept].sort((a, b) => {
    const getRank = (f) => {
      const d = (f.designation || '').toLowerCase();
      if (d.includes('director') || d.includes('registrar')) return 1;
      if (d.includes('dean') || d.includes('head') || d.includes('hod')) return 2;
      if (d.includes('professor') && !d.includes('associate') && !d.includes('assistant')) return 3;
      if (d.includes('associate')) return 4;
      if (d.includes('assistant')) return 5;
      return 6;
    };
    return getRank(a) - getRank(b);
  });

  const displayList = sorted.slice(0, 15);
  displayList.forEach((f) => {
    const name = f.name || f.portalName;
    const desig = f.designation ? ` (${f.designation})` : '';
    const phone = formatFacultyPhone(f);
    const phoneStr = phone !== 'Not listed' ? ` — 📱 ${phone}` : '';
    text += `• *${name}*${desig}${phoneStr}\n`;
  });

  if (sorted.length > 15) {
    text += `\n_...and ${sorted.length - 15} more faculty members._\n`;
  }

  text +=
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *To view profile:* \`@find <name>\``;

  return text.trim();
}

/**
 * Format clean faculty card text:
 * Name, Department, Designation, and Mobile number only.
 */
function formatFacultyCard(f) {
  const displayName = f.name || f.portalName || 'NERIST Faculty';
  const dept = f.department || 'NERIST';
  const desig = f.designation || 'Faculty';
  const phone = formatFacultyPhone(f);

  return (
    `👤 *${displayName}*\n` +
    `🏛️ *Dept:* ${dept}\n` +
    `🏷️ *Designation:* ${desig}\n` +
    `📱 *Mobile:* ${phone}`
  ).trim();
}

/**
 * Build up to 3 interactive native flow buttons:
 * Alternate candidate quick reply buttons for disambiguation only.
 */
function buildFacultyButtons({ topMatch, matches = [], maxButtons = 3 }) {
  const buttons = [];
  const topToken = getFacultyToken(topMatch);
  const alternates = matches.filter((m) => getFacultyToken(m) !== topToken);

  if (alternates.length > 0) {
    const numAltButtons = Math.min(alternates.length, maxButtons);

    for (let i = 0; i < numAltButtons; i++) {
      const alt = alternates[i];
      const altToken = getFacultyToken(alt);
      const rawName = alt.name || alt.portalName || 'Faculty';
      const label = `👨‍🏫 ${rawName}`.trim();
      const displayLabel = label.length > 24 ? label.slice(0, 23) + '…' : label;
      buttons.push({
        id: `view_faculty_${altToken}`,
        text: displayLabel,
      });
    }
  }

  return buttons;
}

/**
 * Handle @find / !find / @faculty / view_faculty_ button / @help / !help
 * Returns true if the message was handled.
 */
async function handleFacultyMessage({
  sock,
  senderJid,
  rawBody,
  lowerBody,
  buttonId = null,
  sendInteractiveButtons = null,
  isAdmin = false,
  isGroup = false,
  rawMessage = null,
  logFn = console.log,
}) {
  const text = (rawBody || '').trim();
  const lower = (lowerBody || text.toLowerCase()).trim();

  // =========================================================================
  // 0. STRICT GROUP SAFETY GUARDS
  // =========================================================================
  // In groups, ignore ALL button clicks to prevent feedback loops/spam
  if (isGroup && buttonId) {
    return false;
  }

  // In groups, STRICTLY respond ONLY when the message begins with @find or !find
  if (isGroup && !/^[@!]find\b/i.test(lower)) {
    return false;
  }

  // In groups, enforce anti-flood rate limit (2.5s cooldown per group)
  if (isGroup) {
    const now = Date.now();
    const lastTime = groupCooldownMap.get(senderJid) || 0;
    if (now - lastTime < GROUP_COOLDOWN_MS) {
      logFn(`[Group Cooldown] Throttled rapid @find from ${senderJid} (${now - lastTime}ms since last reply)`);
      return true; // silently handled to prevent group flood
    }
    groupCooldownMap.set(senderJid, now);
  }

  // =========================================================================
  // 1. DISAMBIGUATION BUTTON TAP (view_faculty_<token>) - Strictly DM only
  // =========================================================================
  if (!isGroup && buttonId && buttonId.startsWith('view_faculty_')) {
    const altToken = buttonId.replace('view_faculty_', '');
    const selected = facultyCleanIdMap.get(altToken);

    if (selected) {
      logFn(`[Faculty Disambig Tap] Selected faculty "${selected.name}" (${altToken}) by ${senderJid}`);
      facultySearchCount++;

      // Maintain user's search session so they can continue switching between alternates
      const prevMatches = lastFacultySearchMap.get(senderJid) || [];
      let currentMatches = [selected];
      if (prevMatches.length > 1 && prevMatches.some((m) => getFacultyToken(m) === altToken)) {
        currentMatches = [selected, ...prevMatches.filter((m) => getFacultyToken(m) !== altToken)];
      }

      let replyBody = formatFacultyCard(selected);
      const actionButtons = buildFacultyButtons({ topMatch: selected, matches: currentMatches });

      const altButtonCount = actionButtons.filter((b) => b.id && b.id.startsWith('view_faculty_')).length;
      const alternates = currentMatches.slice(1);
      if (alternates.length > altButtonCount) {
        const remaining = alternates.slice(altButtonCount);
        replyBody +=
          `\n\n_Additional matches (${remaining.length} more):_\n` +
          remaining
            .slice(0, 5)
            .map((f) => `• *${f.name || f.portalName}* (\`@find ${f.name || f.portalName}\`)`)
            .join('\n');
      }

      if (currentMatches.length > 1) {
        replyBody += '\n\n_Tap an alternate button below to switch faculty profile:_';
      }

      if (sendInteractiveButtons && actionButtons.length > 0) {
        try {
          await sendInteractiveButtons({
            sock,
            jid: senderJid,
            title: '👨‍🏫 NERIST Faculty Profile',
            body: replyBody.trim(),
            footer: currentMatches.length > 1 ? `Found ${currentMatches.length} matches · Tap to switch` : 'NERIST Faculty Directory',
            buttons: actionButtons,
          });
          return true;
        } catch (err) {
          logFn(`[Faculty Module] sendInteractiveButtons error: ${err.message}. Falling back to text.`);
        }
      }

      await sock.sendMessage(senderJid, { text: replyBody.trim() });
      return true;
    }
  }

  // =========================================================================
  // 2. FACULTY FLOW ONBOARDING BUTTON (btn_flow_faculty from menu) - Strictly DM only
  // =========================================================================
  if (!isGroup && buttonId === 'btn_flow_faculty') {
    const facultyGuide =
      '👨‍🏫 *NERIST Faculty Directory Search*\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      `Search ${facultyList.length}+ faculty profiles, phone numbers & departments instantly:\n\n` +
      '🔍 *Quick Search Examples:*\n' +
      '• *By Initials:* `@find akr` or `@find jb`\n' +
      '• *By Name:* `@find Rajesh Kumar` or `@find Ashok`\n' +
      '• *By Email Handle:* `@find kry`\n' +
      '• *By Department:* `@find CSE` or `@find Chemistry`\n\n' +
      '✨ *1-Tap Disambiguation Buttons:*\n' +
      'When multiple faculty match your search, interactive quick-reply buttons let you switch between profiles instantly without typing!\n\n' +
      '_Works both here in DM and in WhatsApp groups!_';

    const guideButtons = [
      { id: '@find akr', text: '🔍 Search AKR Sir' },
      { id: '@find jb', text: '🔍 Search JB Ma\'am' },
      { text: '🌐 Faculty Explorer', url: 'https://nerist-faculty-search.pages.dev/' }
    ];

    if (sendInteractiveButtons) {
      try {
        await sendInteractiveButtons({
          sock,
          jid: senderJid,
          title: '👨‍🏫 NERIST Faculty Search',
          body: facultyGuide.trim(),
          footer: 'NERIST Campus Automation',
          buttons: guideButtons,
        });
        return true;
      } catch (e) {}
    }
    await sock.sendMessage(senderJid, { text: facultyGuide });
    return true;
  }

  // =========================================================================
  // 3. HELP COMMAND (@help, !help, #help) - Strictly DM only
  // =========================================================================
  if (!isGroup && (lower === '@help' || lower === '!help' || (isAdmin && lower === '#help'))) {
    const studentSection = !isGroup
      ? `\n🎓 *Student Directory (DM Only):*\n` +
        `• \`@student <name or roll>\` ➔ Look up student profile\n` +
        `• \`@find student <name>\` ➔ Search student directory\n`
      : '';

    const adminSection =
      !isGroup && isAdmin
        ? `\n👑 *Admin Server Controls:*\n` +
          `• \`#status\` ➔ Server power, RAM & Wi-Fi state\n` +
          `• \`#wifilogin\` ➔ Re-authenticate campus Fortinet Wi-Fi\n` +
          `• \`#wifi <user> <pass>\` ➔ Save & test new Wi-Fi credentials\n` +
          `• \`#shutdown\` ➔ Initiate 30s shutdown sequence\n` +
          `• \`#cancelshutdown\` ➔ Abort pending shutdown\n` +
          `• \`#update\` ➔ Pull latest code from git\n`
        : '';

    const helpMsg =
      `🤖 *NERIST Campus WhatsApp Assistant*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔍 *Faculty Search:*\n` +
      `• \`@find <name>\` ➔ Search faculty by name\n` +
      `  _Example:_ \`@find Rajesh Kumar\` or \`@find Ashok\`\n` +
      `• \`@find <initials>\` ➔ Search by acronym/initials\n` +
      `  _Example:_ \`@find akr\` or \`@find jb\`\n` +
      `• \`@find <email-handle>\` ➔ Search by email username\n` +
      `  _Example:_ \`@find kry\`\n` +
      `• _Multi-match searches show 1-tap quick buttons to switch between faculty_\n` +
      `${studentSection}${adminSection}` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_NERIST Campus Automation_`;

    await sock.sendMessage(senderJid, { text: helpMsg.trim() });
    return true;
  }

  // =========================================================================
  // 4. FACULTY SEARCH COMMANDS (@find, !find in groups; friendly variants in DM)
  // =========================================================================
  const isFacultySearchTrigger = isGroup
    ? /^[@!]find\b/i.test(lower)
    : /^[@!#]?(?:find\s+faculty|faculty\s+search|search\s+faculty|faculty|find)(?:\s|$)/i.test(lower);

  if (isFacultySearchTrigger) {
    let query = '';
    if (isGroup) {
      const m = text.match(/^[@!]find\s*([\s\S]*)/i);
      query = (m ? m[1] : '').trim();
    } else {
      const m = text.match(/^[@!#]?(?:find\s+faculty|faculty\s+search|search\s+faculty|faculty|find)\s*([\s\S]*)/i);
      query = (m ? m[1] : '').trim();
    }

    if (!query) {
      const sendOptions = isGroup && rawMessage ? { quoted: rawMessage } : undefined;
      await sock.sendMessage(senderJid, {
        text: 'Please specify a faculty name or shortcut.\n*Example:* `@find Rajesh Kumar` or `@find akr`',
      }, sendOptions);
      return true;
    }

    logFn(`[@find Triggered] jid=${senderJid} isGroup=${isGroup} query="${query}"`);
    facultySearchCount++;

    // Check Department Roster Shortcut (@find CSE, @find ECE, @find Mechanical, etc.)
    const targetDept = resolveDepartment(query);
    if (targetDept) {
      const deptFaculty = facultyList.filter((f) =>
        (f.department || '').toLowerCase().includes(targetDept.toLowerCase())
      );
      if (deptFaculty.length > 0) {
        logFn(`[@find Dept Roster] jid=${senderJid} isGroup=${isGroup} dept="${targetDept}" count=${deptFaculty.length}`);
        const rosterText = formatDepartmentRoster(targetDept, deptFaculty);
        const sendOptions = isGroup && rawMessage ? { quoted: rawMessage } : undefined;
        await sock.sendMessage(senderJid, { text: rosterText }, sendOptions);
        return true;
      }
    }

    const matches = searchFaculty(query);

    if (matches.length > 0) {
      lastFacultySearchMap.set(senderJid, matches);
      const topMatch = matches[0];

      let replyBody = formatFacultyCard(topMatch);
      const actionButtons = buildFacultyButtons({ topMatch, matches });

      // In groups, NEVER send interactive buttons to avoid group-wide button tap loops
      const canSendButtons = !isGroup && Boolean(sendInteractiveButtons) && actionButtons.length > 0;

      if (canSendButtons) {
        const altButtonCount = actionButtons.filter((b) => b.id && b.id.startsWith('view_faculty_')).length;
        const alternates = matches.slice(1);
        if (alternates.length > altButtonCount) {
          const remaining = alternates.slice(altButtonCount);
          replyBody +=
            `\n\n_Additional matches (${remaining.length} more):_\n` +
            remaining
              .slice(0, 5)
              .map((f) => `• *${f.name || f.portalName}* (\`@find ${f.name || f.portalName}\`)`)
              .join('\n');
        }

        if (matches.length > 1) {
          replyBody += '\n\n_Tap an alternate button below to switch faculty profile:_';
        }

        try {
          await sendInteractiveButtons({
            sock,
            jid: senderJid,
            title: '👨‍🏫 NERIST Faculty Profile',
            body: replyBody.trim(),
            footer: matches.length > 1 ? `Found ${matches.length} matches · Tap to switch` : 'NERIST Faculty Directory',
            buttons: actionButtons,
          });
          logFn(`Answered @find "${query}" with ${matches.length} matches & ${actionButtons.length} buttons.`);
          return true;
        } catch (btnErr) {
          logFn(`[Faculty Module] sendInteractiveButtons error: ${btnErr.message}. Falling back to text.`);
        }
      }

      // Plain text message (always used in groups, or when buttons are disabled/empty)
      if (matches.length > 1) {
        replyBody +=
          `\n\n_Also found:_ ` +
          matches
            .slice(1, 4)
            .map((m) => {
              const name = m.name || m.portalName;
              return `${name} (\`@find ${name}\`)`;
            })
            .join(', ');
      }

      const sendOptions = isGroup && rawMessage ? { quoted: rawMessage } : undefined;
      await sock.sendMessage(senderJid, { text: replyBody.trim() }, sendOptions);
      logFn(`Answered @find "${query}" with text.`);
      return true;
    } else {
      const noMatchMsg =
        `❌ *No faculty found matching "${query}"*\n\n` +
        `💡 *Search Tips:*\n` +
        `• Try initials: \`@find akr\`, \`@find jb\`\n` +
        `• Try first/last name: \`@find Rajesh\` or \`@find Ashok\`\n` +
        `• Try department: \`@find ECE\` or \`@find Chemistry\`\n` +
        `• Type \`@help\` for more examples`;
      const sendOptions = isGroup && rawMessage ? { quoted: rawMessage } : undefined;
      await sock.sendMessage(senderJid, { text: noMatchMsg }, sendOptions);
      logFn(`Answered @find "${query}" with no matches.`);
      return true;
    }
  }

  return false;
}

module.exports = {
  cleanHonorifics,
  getAllAcronyms,
  searchFaculty,
  handleFacultyMessage,
  isGroupFacultyCommand,
  getFacultySearchCount,
  getFacultyCount,
  getFacultyToken,
  initFacultyIndex,
  formatFacultyCard,
  formatDepartmentRoster,
  buildFacultyButtons,
  facultyCleanIdMap,
  lastFacultySearchMap,
};
