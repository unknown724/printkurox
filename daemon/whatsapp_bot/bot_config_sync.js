const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_CACHE_FILE = path.join(__dirname, 'bot_control_state.json');

const DEFAULT_BOT_CONFIG = {
  botEnabled: true,
  printingEnabled: true,
  studentSearchEnabled: true,
  facultySearchEnabled: true,
  aiChatEnabled: true,
  masterOffBehavior: 'reply_print_only', // 'reply_print_only' | 'silent'
  nonPrintOffBehavior: 'silent', // 'silent' | 'reply'
  replyCooldownSec: 60,
  messages: {
    botOff:
      '🖨️ *PrintKurox WhatsApp Bot is currently OFF* for maintenance.\n\nPlease use our web kiosk at https://printkurox.pages.dev or try again shortly.',
    printingOff:
      '🖨️ *WhatsApp Printing is currently paused.* Please print directly via https://printkurox.pages.dev or check back soon.',
    studentOff: '🎓 Student directory lookup is currently paused by the administrator.',
    facultyOff: '🏫 Faculty directory lookup is currently paused by the administrator.',
    aiOff: '🤖 AI assistant is currently paused by the administrator.',
  },
  updatedAt: '',
  lastSyncAt: 0,
};

let cachedConfig = JSON.parse(JSON.stringify(DEFAULT_BOT_CONFIG));
let _syncInFlight = null;
const replyCooldownMap = new Map(); // `${jid}:${kind}` -> timestamp ms

function normalizeBotConfig(raw) {
  const def = DEFAULT_BOT_CONFIG;
  const src = raw && typeof raw === 'object' ? raw : {};
  const msgs = src.messages && typeof src.messages === 'object' ? src.messages : {};
  return {
    botEnabled: src.botEnabled !== undefined ? Boolean(src.botEnabled) : def.botEnabled,
    printingEnabled: src.printingEnabled !== undefined ? Boolean(src.printingEnabled) : def.printingEnabled,
    studentSearchEnabled:
      src.studentSearchEnabled !== undefined ? Boolean(src.studentSearchEnabled) : def.studentSearchEnabled,
    facultySearchEnabled:
      src.facultySearchEnabled !== undefined ? Boolean(src.facultySearchEnabled) : def.facultySearchEnabled,
    aiChatEnabled: src.aiChatEnabled !== undefined ? Boolean(src.aiChatEnabled) : def.aiChatEnabled,
    masterOffBehavior: src.masterOffBehavior === 'silent' ? 'silent' : 'reply_print_only',
    nonPrintOffBehavior: src.nonPrintOffBehavior === 'reply' ? 'reply' : 'silent',
    replyCooldownSec:
      typeof src.replyCooldownSec === 'number' && src.replyCooldownSec >= 10 && src.replyCooldownSec <= 3600
        ? Math.round(src.replyCooldownSec)
        : def.replyCooldownSec,
    messages: {
      botOff: typeof msgs.botOff === 'string' && msgs.botOff.trim() ? msgs.botOff.trim() : def.messages.botOff,
      printingOff:
        typeof msgs.printingOff === 'string' && msgs.printingOff.trim()
          ? msgs.printingOff.trim()
          : def.messages.printingOff,
      studentOff:
        typeof msgs.studentOff === 'string' && msgs.studentOff.trim()
          ? msgs.studentOff.trim()
          : def.messages.studentOff,
      facultyOff:
        typeof msgs.facultyOff === 'string' && msgs.facultyOff.trim()
          ? msgs.facultyOff.trim()
          : def.messages.facultyOff,
      aiOff: typeof msgs.aiOff === 'string' && msgs.aiOff.trim() ? msgs.aiOff.trim() : def.messages.aiOff,
    },
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : '',
    lastSyncAt: Number(src.lastSyncAt || 0),
  };
}

function loadLocalConfigCache() {
  try {
    if (fs.existsSync(CONFIG_CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_CACHE_FILE, 'utf8'));
      cachedConfig = normalizeBotConfig(parsed);
    }
  } catch (e) {
    console.warn('[BotConfig] Could not load bot_control_state.json:', e.message);
  }
}
loadLocalConfigCache();

function saveLocalConfigCache(nextCfg) {
  cachedConfig = normalizeBotConfig({ ...nextCfg, lastSyncAt: Date.now() });
  try {
    fs.writeFileSync(CONFIG_CACHE_FILE, JSON.stringify(cachedConfig, null, 2), 'utf8');
  } catch (e) {
    console.warn('[BotConfig] Could not write bot_control_state.json:', e.message);
  }
  return cachedConfig;
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
    const req = https.request(
      {
        hostname: 'api.cloudflare.com',
        path: `/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
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
      }
    );
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      try {
        req.destroy();
      } catch (e) {}
      resolve({ ok: false, error: 'D1 query timed out' });
    });
    req.write(payload);
    req.end();
  });
}

async function syncBotConfigFromD1(force = false) {
  if (!force && Date.now() - (cachedConfig.lastSyncAt || 0) < 45 * 1000) {
    return cachedConfig;
  }
  if (_syncInFlight) return _syncInFlight;

  _syncInFlight = (async () => {
    try {
      const res = await cfD1Query(
        "SELECT value, updated_at FROM app_settings WHERE key = 'whatsapp_bot_config' LIMIT 1"
      );
      if (res.ok && res.rows && res.rows.length > 0) {
        const rawVal = res.rows[0].value;
        const parsed = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal || {};
        saveLocalConfigCache({
          ...parsed,
          updatedAt: parsed.updatedAt || res.rows[0].updated_at || '',
        });
      }
    } catch (e) {
      console.warn('[BotConfig] D1 sync skipped:', e.message);
    } finally {
      _syncInFlight = null;
    }
    return cachedConfig;
  })();
  return _syncInFlight;
}

async function pushBotConfigToD1(patch) {
  const merged = normalizeBotConfig({
    ...cachedConfig,
    ...patch,
    messages: {
      ...cachedConfig.messages,
      ...(patch.messages || {}),
    },
    updatedAt: new Date().toISOString(),
  });
  const savedLocal = saveLocalConfigCache(merged);
  const { lastSyncAt: _ignored, ...serializable } = savedLocal;
  const serialized = JSON.stringify(serializable);
  const res = await cfD1Query(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('whatsapp_bot_config', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
    [serialized]
  );
  return { savedD1: Boolean(res.ok), error: res.error, config: savedLocal };
}

function getBotControlConfig() {
  return cachedConfig;
}

function canSendOfflineReply(jid, kind = 'print', cooldownSec = 60) {
  const key = `${jid || 'unknown'}:${kind}`;
  const now = Date.now();
  const prev = replyCooldownMap.get(key) || 0;
  const windowMs = Math.max(10, Number(cooldownSec) || 60) * 1000;
  if (now - prev < windowMs) return false;
  replyCooldownMap.set(key, now);
  if (replyCooldownMap.size > 2000) {
    const cutoff = now - windowMs;
    for (const [k, t] of replyCooldownMap.entries()) {
      if (t < cutoff) replyCooldownMap.delete(k);
    }
  }
  return true;
}

/**
 * Owner WhatsApp Phone Control Commands:
 *  @bot on / @bot off / @botstatus
 *  @waprint on / @waprint off / @printbot on / @printbot off
 *  @studentbot on / @studentbot off
 *  @facultybot on / @facultybot off
 *  @aibot on / @aibot off
 *  @setprintmsg <text> / @setbotoffmsg <text>
 */
async function handleOwnerBotControlCommand({ sock, senderJid, rawBody, lowerBody, logFn = console.log }) {
  const trimmed = String(rawBody || '').trim();
  const lower = String(lowerBody || trimmed.toLowerCase()).trim();
  if (!trimmed) return false;

  if (lower === '@botstatus' || lower === '!botstatus') {
    await syncBotConfigFromD1(true);
    const c = getBotControlConfig();
    await sock.sendMessage(senderJid, {
      text:
        `🎛️ *WHATSAPP BOT REMOTE CONTROL STATUS*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Master Switch:* ${c.botEnabled ? '🟢 ON' : '🔴 OFF (Admin phone only)'}\n` +
        `• *Printing:* ${c.printingEnabled ? '🟢 ON' : '🟡 OFF → Custom Auto-Reply'}\n` +
        `• *Student Search & Dossier:* ${c.studentSearchEnabled ? '🟢 ON' : '🔇 OFF (Silent)'}\n` +
        `• *Faculty Search (@find):* ${c.facultySearchEnabled ? '🟢 ON' : '🔇 OFF (Silent)'}\n` +
        `• *AI Chat:* ${c.aiChatEnabled ? '🟢 ON' : '🔇 OFF (Silent)'}\n\n` +
        `📱 *Phone Toggles:*\n` +
        `\`@bot on\` / \`@bot off\`\n` +
        `\`@waprint on\` / \`@waprint off\`\n` +
        `\`@studentbot on\` / \`@studentbot off\`\n` +
        `\`@facultybot on\` / \`@facultybot off\`\n` +
        `\`@aibot on\` / \`@aibot off\`\n` +
        `\`@setprintmsg <text>\` / \`@setbotoffmsg <text>\``,
    });
    return true;
  }

  const toggleMatch = lower.match(/^[@!#](bot|waprint|printbot|studentbot|facultybot|aibot)\s+(on|off)$/);
  if (toggleMatch) {
    const target = toggleMatch[1];
    const nextVal = toggleMatch[2] === 'on';
    const fieldMap = {
      bot: ['botEnabled', 'Master Bot'],
      waprint: ['printingEnabled', 'WhatsApp Printing'],
      printbot: ['printingEnabled', 'WhatsApp Printing'],
      studentbot: ['studentSearchEnabled', 'Student Search & Dossier'],
      facultybot: ['facultySearchEnabled', 'Faculty Search'],
      aibot: ['aiChatEnabled', 'AI Assistant'],
    };
    const [field, label] = fieldMap[target];
    await syncBotConfigFromD1(true);
    const res = await pushBotConfigToD1({ [field]: nextVal });
    logFn(`[BotConfig Owner Command] Set ${field}=${nextVal} (d1=${res.savedD1})`);
    await sock.sendMessage(senderJid, {
      text:
        `🎛️ *${label}: ${nextVal ? '🟢 TURNED ON' : '🔴 TURNED OFF'}*\n` +
        `☁️ D1 Sync: ${res.savedD1 ? 'Synced with /adminkurox' : `Local only (${res.error || 'retry shortly'})`}\n` +
        (nextVal
          ? '_Public users can use this mode normally._'
          : field === 'botEnabled' || field === 'printingEnabled'
          ? '_Public print attempts will receive your custom auto-reply; admin phone still works._'
          : '_Public queries to this module are now silent; admin phone still works._'),
    });
    return true;
  }

  const msgMatch = trimmed.match(/^[@!#](setprintmsg|setbotoffmsg)\s+([\s\S]+)$/i);
  if (msgMatch) {
    const cmd = msgMatch[1].toLowerCase();
    const textVal = msgMatch[2].trim();
    const field = cmd === 'setbotoffmsg' ? 'botOff' : 'printingOff';
    await syncBotConfigFromD1(true);
    const res = await pushBotConfigToD1({ messages: { [field]: textVal } });
    await sock.sendMessage(senderJid, {
      text:
        `💬 *Updated ${field === 'botOff' ? 'Master Bot OFF' : 'Printing OFF'} Auto-Reply*\n` +
        `☁️ D1 Sync: ${res.savedD1 ? 'Synced' : 'Local saved'}\n\n` +
        `*Preview:*\n${textVal}`,
    });
    return true;
  }

  return false;
}

// Non-blocking boot sync + 2-minute D1 poll (0 Worker hits)
setTimeout(() => {
  syncBotConfigFromD1(true).catch(() => {});
}, 2000).unref();
setInterval(() => {
  syncBotConfigFromD1(true).catch(() => {});
}, 2 * 60 * 1000).unref();

module.exports = {
  DEFAULT_BOT_CONFIG,
  getBotControlConfig,
  syncBotConfigFromD1,
  pushBotConfigToD1,
  canSendOfflineReply,
  handleOwnerBotControlCommand,
};
