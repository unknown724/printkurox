/**
 * =============================================================================
 * NERIST Faculty Search Module (Migrated from personal bot 9863013886)
 * =============================================================================
 * Supports smart acronym/initials, email handle, name, and department queries
 * via @find / !find and @help / !help in both DMs and WhatsApp groups.
 */

const fs = require('fs');
const path = require('path');

let facultyList = [];
let facultySearchCount = 0;

try {
  const facultyPath = path.join(__dirname, 'faculty.json');
  if (fs.existsSync(facultyPath)) {
    facultyList = JSON.parse(fs.readFileSync(facultyPath, 'utf8'));
    console.log(`[Faculty Module] Loaded ${facultyList.length} faculty records from faculty.json.`);
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
  const cleaned = cleanHonorifics(rawQuery).toLowerCase();
  const q = cleaned || (rawQuery || '').trim().toLowerCase();
  if (!q) return [];

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

  // 4. Department match
  return facultyList.filter((f) => {
    const dept = (f.department || '').toLowerCase();
    return dept.includes(q);
  });
}

function getFacultySearchCount() {
  return facultySearchCount;
}

function getFacultyCount() {
  return facultyList.length;
}

function isGroupFacultyCommand(rawText) {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return false;
  return /^[@!](?:find(?:\s+.*)?|help)$/i.test(trimmed);
}

/**
 * Handle @find / !find / @help / !help (and #help for admins in DM)
 * Returns true if the message was handled.
 */
async function handleFacultyMessage({ sock, senderJid, rawBody, lowerBody, isAdmin = false, isGroup = false, logFn = console.log }) {
  const text = (rawBody || '').trim();
  const lower = (lowerBody || text.toLowerCase()).trim();
  if (!text) return false;

  // 1. Help Command (@help, !help, or admin #help in DM)
  if (lower === '@help' || lower === '!help' || (!isGroup && isAdmin && lower === '#help')) {
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
      `${studentSection}${adminSection}` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_NERIST Campus Automation_`;

    await sock.sendMessage(senderJid, { text: helpMsg.trim() });
    return true;
  }

  // 2. Faculty Search (@find or !find)
  if (/^[@!]find(?:\s|$)/i.test(lower)) {
    const findMatch = text.match(/^[@!]find\s*([\s\S]*)/i);
    const query = (findMatch ? findMatch[1] : '').trim();

    if (!query) {
      await sock.sendMessage(senderJid, {
        text: 'Please specify a faculty name or shortcut.\n*Example:* `@find Rajesh Kumar` or `@find akr`',
      });
      return true;
    }

    logFn(`[@find Triggered] jid=${senderJid} isGroup=${isGroup} text="${text}"`);
    facultySearchCount++;
    const matches = searchFaculty(query);

    if (matches.length > 0) {
      const topMatch = matches[0];
      const displayName = topMatch.name || topMatch.portalName;
      const mobile = topMatch.portalPhone || topMatch.officialPhone || 'Not listed';
      const dept = topMatch.department || 'NERIST';

      let replyBody = `👤 *${displayName}*\n📱 *Mobile:* ${mobile}\n🏛️ *Dept:* ${dept}`;

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

      await sock.sendMessage(senderJid, { text: replyBody.trim() });
      logFn(`Answered @find "${query}" with ${matches.length} matches.`);
    } else {
      const noMatchMsg =
        `❌ *No faculty found matching "${query}"*\n\n` +
        `💡 *Search Tips:*\n` +
        `• Try initials: \`@find akr\`, \`@find jb\`\n` +
        `• Try first/last name: \`@find Rajesh\` or \`@find Ashok\`\n` +
        `• Try department: \`@find ECE\` or \`@find Chemistry\`\n` +
        `• Type \`@help\` for more examples`;
      await sock.sendMessage(senderJid, { text: noMatchMsg });
      logFn(`Answered @find "${query}" with no matches.`);
    }
    return true;
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
};
