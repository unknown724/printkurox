/**
 * =============================================================================
 * NERIST Host Server Admin Controller & Power Watchdog Module
 * =============================================================================
 * Migrated from personal bot (9863013886) into PrintKurox Bot (9362980761).
 * - Sends startup & power cut/restore alerts to ADMIN_PHONE (9863013886).
 * - Accepts #status, #wifilogin, #wifi <user> <pass>, #shutdown, #cancelshutdown,
 *   #update and interactive admin buttons from ADMIN_PHONE or self-chat.
 * - Keeps critical low-battery (<12%) auto-shutdown protection active.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec, execSync } = require('child_process');

const CAMPUS_PORTAL_URL = process.env.CAMPUS_PORTAL_URL || 'http://10.10.200.1:8090';
const SHUTDOWN_THRESHOLD = parseInt(process.env.AUTO_SHUTDOWN_BATTERY_THRESHOLD || '12', 10);
const ADMIN_PHONE = (process.env.ADMIN_PHONE || '9863013886').replace(/[^0-9]/g, '').slice(-10);
const INTERNAL_ALERT_PORT = parseInt(process.env.INTERNAL_ALERT_PORT || '7261', 10);
const STATION_TOKEN = (process.env.STATION_TOKEN || '').trim();

const WORKSPACE_ENV_PATH =
  'C:\\Users\\91600\\OneDrive - North Eastern Regional Institute of Science and Technology\\Desktop\\whatsappbot\\.env';

let lastAcStatus = null;
let emergencyShutdownTriggered = false;
let pendingShutdownTimer = null;
let greetedOnStartup = false;
let watchdogsStarted = false;
const botStartTime = Date.now();
const adminAlertCooldowns = new Map();
let alertServerStarted = false;

function getPiDiagnosticsSummary() {
  if (process.platform === 'win32') return null;
  const info = { tempC: null, throttledHex: null, undervoltageNow: false, diskFreeGb: null, diskUsedPct: null, memUsedMb: null, memTotalMb: null, printers: [] };
  try {
    const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim();
    info.tempC = +(parseInt(raw, 10) / 1000).toFixed(1);
  } catch {}
  try {
    const out = execSync('vcgencmd get_throttled', { encoding: 'utf8', timeout: 2000 }).trim();
    if (out.includes('0x')) {
      info.throttledHex = out.split('=').pop();
      const val = parseInt(info.throttledHex, 16) || 0;
      info.undervoltageNow = Boolean(val & 0x1);
    }
  } catch {}
  try {
    const dfOut = execSync("df -BG --output=avail,pcent / | tail -n 1", { encoding: 'utf8', timeout: 2000 }).trim().split(/\s+/);
    if (dfOut.length >= 2) {
      info.diskFreeGb = dfOut[0];
      info.diskUsedPct = dfOut[1];
    }
  } catch {}
  try {
    const mem = {};
    for (const line of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) {
      const [k, v] = line.split(':');
      if (k && v) mem[k.trim()] = parseInt(v.trim().split(/\s+/)[0], 10) || 0;
    }
    if (mem.MemTotal) {
      const usedKb = Math.max(0, mem.MemTotal - (mem.MemAvailable || mem.MemFree || 0));
      info.memTotalMb = Math.round(mem.MemTotal / 1024);
      info.memUsedMb = Math.round(usedKb / 1024);
    }
  } catch {}
  try {
    const lp = execSync('lpstat -e 2>/dev/null || true', { encoding: 'utf8', timeout: 2000 }).trim();
    info.printers = lp ? lp.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  } catch {}
  return info;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d > 0 ? d + 'd ' : ''}${h}h ${m}m`;
}

async function getPowerStatus() {
  return new Promise((resolve) => {
    try {
      if (process.platform === 'win32') {
        const cmd =
          'powershell -NoProfile -Command "(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue).EstimatedChargeRemaining; (Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue).PowerOnline"';
        exec(cmd, { encoding: 'utf8', timeout: 6000 }, (error, stdout) => {
          if (error || !stdout) {
            return resolve({ batteryPct: 100, isAcOnline: true, success: true });
          }
          const lines = stdout
            .trim()
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          const batteryPct = parseInt(lines[0], 10) || 100;
          const isAcOnline = lines[1] ? lines[1].toLowerCase() === 'true' : true;
          resolve({ batteryPct, isAcOnline, success: true });
        });
      } else {
        let batteryPct = 100;
        let isAcOnline = true;
        try {
          if (fs.existsSync('/sys/class/power_supply/BAT0/capacity')) {
            batteryPct = parseInt(fs.readFileSync('/sys/class/power_supply/BAT0/capacity', 'utf8').trim(), 10) || 100;
          } else if (fs.existsSync('/sys/class/power_supply/BAT1/capacity')) {
            batteryPct = parseInt(fs.readFileSync('/sys/class/power_supply/BAT1/capacity', 'utf8').trim(), 10) || 100;
          }
          const acFiles = [
            '/sys/class/power_supply/AC/online',
            '/sys/class/power_supply/ACAD/online',
            '/sys/class/power_supply/ADP1/online',
          ];
          for (const acFile of acFiles) {
            if (fs.existsSync(acFile)) {
              isAcOnline = fs.readFileSync(acFile, 'utf8').trim() === '1';
              break;
            }
          }
        } catch (e) {}
        resolve({ batteryPct, isAcOnline, success: true });
      }
    } catch (e) {
      resolve({ batteryPct: 100, isAcOnline: true, success: false, error: e.message });
    }
  });
}

function executeShutdown(delaySeconds = 10, reason = 'Remote shutdown requested via WhatsApp') {
  if (process.platform === 'win32') {
    exec(`shutdown /s /t ${delaySeconds} /c "${reason}"`);
  } else {
    if (pendingShutdownTimer) clearTimeout(pendingShutdownTimer);
    pendingShutdownTimer = setTimeout(() => {
      exec('sudo shutdown -h now');
    }, Math.max(1, delaySeconds) * 1000);
  }
}

function executeCancelShutdown() {
  if (process.platform === 'win32') {
    exec('shutdown /a');
  } else {
    if (pendingShutdownTimer) {
      clearTimeout(pendingShutdownTimer);
      pendingShutdownTimer = null;
    }
    exec('sudo shutdown -c 2>/dev/null || true');
  }
}

async function loginCampusPortal(logFn = console.log) {
  const portalUser = process.env.CAMPUS_WIFI_USER || '122148';
  const portalPass = process.env.CAMPUS_WIFI_PASS || 'Tombinao123';
  if (!portalUser || !portalPass) {
    return { success: false, message: 'Campus credentials not configured in .env' };
  }
  try {
    const params = new URLSearchParams({
      mode: '191',
      username: portalUser,
      password: portalPass,
      a: Date.now().toString(),
      producttype: '0',
    });
    const res = await fetch(`${CAMPUS_PORTAL_URL}/login.xml`, {
      method: 'POST',
      body: params.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    if (text.includes('LIVE') || text.includes('signed in') || /already/i.test(text)) {
      logFn(`[NERIST Wi-Fi] Authenticated successfully as ${portalUser}`);
      return { success: true, message: `Signed in as ${portalUser}` };
    } else {
      logFn(`[NERIST Wi-Fi] Login response: ${text.slice(0, 100)}`);
      return { success: false, message: 'Portal rejected credentials' };
    }
  } catch (e) {
    return { success: false, message: `Portal error: ${e.message}` };
  }
}

function updateEnvCredentials(envPath, newUser, newPass) {
  try {
    if (!fs.existsSync(envPath)) return;
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('CAMPUS_WIFI_USER=')) {
      envContent = envContent.replace(/CAMPUS_WIFI_USER=.*(\r?\n|$)/, `CAMPUS_WIFI_USER=${newUser}$1`);
    } else {
      envContent += `\nCAMPUS_WIFI_USER=${newUser}`;
    }
    if (envContent.includes('CAMPUS_WIFI_PASS=')) {
      envContent = envContent.replace(/CAMPUS_WIFI_PASS=.*(\r?\n|$)/, `CAMPUS_WIFI_PASS=${newPass}$1`);
    } else {
      envContent += `\nCAMPUS_WIFI_PASS=${newPass}`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
  } catch (e) {}
}

/**
 * Handles remote server admin commands (#status, #wifilogin, #wifi, #shutdown, #cancelshutdown, #update)
 * Returns true if the command was handled.
 */
async function handleServerAdminCommand({
  sock,
  senderJid,
  rawBody,
  lowerBody,
  buttonId,
  sendInteractiveButtons,
  getSearchCount = () => 0,
  logFn = console.log,
}) {
  const text = (buttonId || rawBody || '').trim();
  const lower = (buttonId || lowerBody || text.toLowerCase()).trim();
  if (!text) return false;

  // 1. Status Command
  if (lower === '#status' || lower === 'btn_admin_status') {
    const uptimeStr = formatUptime(Math.floor((Date.now() - botStartTime) / 1000));
    const botMemMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const wifiUser = process.env.CAMPUS_WIFI_USER || '122148';
    const pi = getPiDiagnosticsSummary();

    let statusTitle = '📊 NERIST Host Server Status';
    let statusBody = '';
    let shutdownBtnText = '🛑 Shutdown Server';

    if (pi) {
      statusTitle = '🍓 PrintKurox Raspberry Pi Status';
      shutdownBtnText = '🛑 Shutdown Pi';
      const powerText = pi.undervoltageNow
        ? `⚠️ Undervoltage Alert (${pi.throttledHex})`
        : `✅ 5V Healthy${pi.throttledHex && pi.throttledHex !== '0x0' ? ` (hist ${pi.throttledHex})` : ''}`;
      const printerText = pi.printers.length > 0 ? pi.printers.join(', ') : '❌ No USB printer';
      statusBody =
        `• Status: 🟢 Online 24/7\n` +
        `• CPU Temp: ${pi.tempC !== null ? `${pi.tempC}°C` : 'N/A'}\n` +
        `• Power: ${powerText}\n` +
        `• Storage Free: ${pi.diskFreeGb || 'N/A'} (${pi.diskUsedPct || '?'} used)\n` +
        `• RAM: ${pi.memUsedMb ?? '?'} / ${pi.memTotalMb ?? '?'} MB (Bot ${botMemMb} MB)\n` +
        `• Printer: ${printerText}\n` +
        `• Wi-Fi User: ${wifiUser} · Uptime: ${uptimeStr}\n` +
        `• Searches Served: ${getSearchCount()}`;
    } else {
      const power = await getPowerStatus();
      const powerText = power.isAcOnline
        ? '⚡ Plugged In (AC Electricity ON)'
        : `⚠️ Battery: ${power.batteryPct}% (Electric OFF)`;
      statusBody =
        `• Status: 🟢 Online & Healthy\n` +
        `• Power: ${powerText}\n` +
        `• Uptime: ${uptimeStr}\n` +
        `• Memory: ${botMemMb} MB\n` +
        `• Wi-Fi User: ${wifiUser}\n` +
        `• Faculty Searches Served: ${getSearchCount()}`;
    }

    await sendInteractiveButtons({
      sock,
      jid: senderJid,
      title: statusTitle,
      body: statusBody,
      footer: 'PrintKurox Raspberry Pi Controller',
      buttons: [
        { id: 'btn_admin_wifi_login', text: '📶 Re-login Wi-Fi' },
        { id: 'btn_admin_shutdown_req', text: shutdownBtnText },
      ],
    });
    return true;
  }

  // 2. Wi-Fi Re-login
  if (lower === '#wifilogin' || lower === 'btn_admin_wifi_login') {
    await sock.sendMessage(senderJid, { text: '🔄 Attempting campus Wi-Fi re-authentication...' });
    const loginRes = await loginCampusPortal(logFn);
    const icon = loginRes.success ? '✅' : '❌';
    await sock.sendMessage(senderJid, { text: `${icon} *NERIST Wi-Fi Login Result:*\n${loginRes.message}` });
    return true;
  }

  // 3. Change Wi-Fi credentials (#wifi <user> <pass>)
  if (lower.startsWith('#wifi ')) {
    const parts = rawBody.trim().split(/\s+/);
    if (parts.length >= 3) {
      const newUser = parts[1].trim();
      const newPass = parts[2].trim();
      process.env.CAMPUS_WIFI_USER = newUser;
      process.env.CAMPUS_WIFI_PASS = newPass;
      updateEnvCredentials(path.join(__dirname, '.env'), newUser, newPass);
      updateEnvCredentials(WORKSPACE_ENV_PATH, newUser, newPass);

      await sock.sendMessage(senderJid, { text: `🔑 Updated credentials to User: *${newUser}*. Testing login...` });
      const loginRes = await loginCampusPortal(logFn);
      await sock.sendMessage(senderJid, {
        text: `${loginRes.success ? '✅' : '❌'} Login result: ${loginRes.message}`,
      });
    } else {
      await sock.sendMessage(senderJid, { text: 'Usage: `#wifi <username> <password>`' });
    }
    return true;
  }

  // 4. Remote Shutdown / Reboot Request
  if (lower === '#shutdown' || lower === 'btn_admin_shutdown_req') {
    const delaySec = process.platform === 'win32' ? 30 : 12;
    const hostLabel = process.platform === 'win32' ? 'Laptop' : 'Raspberry Pi';
    await sendInteractiveButtons({
      sock,
      jid: senderJid,
      title: `🛑 Confirm ${hostLabel} Shutdown`,
      body: `⚠️ ${hostLabel} will shut down cleanly in *${delaySec} seconds*.\nOnce the green LED stops blinking, unplug power safely.\n\nReply \`#cancelshutdown\` or tap below to abort.`,
      footer: 'Safe Shutdown Confirmation',
      buttons: [{ id: '#cancelshutdown', text: '❌ Cancel Shutdown' }],
    });
    executeShutdown(delaySec, 'Remote shutdown requested by admin via WhatsApp');
    return true;
  }

  if (lower === '#reboot' && process.platform !== 'win32') {
    await sock.sendMessage(senderJid, { text: '🔄 Rebooting Raspberry Pi in 5 seconds... It will rejoin online in ~35s.' });
    setTimeout(() => exec('sudo reboot'), 5000);
    return true;
  }

  // 5. Cancel Shutdown
  if (lower === '#cancelshutdown') {
    executeCancelShutdown();
    emergencyShutdownTriggered = false;
    await sock.sendMessage(senderJid, { text: '✅ *Shutdown CANCELLED!* The server will remain running.' });
    return true;
  }

  // 6. Update from Git
  if (lower === '#update') {
    try {
      await sock.sendMessage(senderJid, { text: '🔄 Pulling latest updates from git...' });
      const repoRoot = path.resolve(__dirname, '..', '..');
      const out = execSync('git pull', { cwd: repoRoot, encoding: 'utf8', timeout: 15000 });
      await sock.sendMessage(senderJid, {
        text: `✅ Git pull completed:\n\`\`\`${out.trim().slice(0, 500)}\`\`\``,
      });
    } catch (gitErr) {
      await sock.sendMessage(senderJid, { text: `❌ Git pull failed: ${gitErr.message}` });
    }
    return true;
  }

  return false;
}

/**
 * Resolve the admin WhatsApp JID to receive proactive power/startup alerts (defaults to 9863013886)
 */
function resolveAdminAlertJid() {
  try {
    const actPath = path.join(__dirname, 'user_activity_log.json');
    if (fs.existsSync(actPath)) {
      const act = JSON.parse(fs.readFileSync(actPath, 'utf8'));
      const entry = act?.[ADMIN_PHONE];
      if (entry?.jid) return entry.jid;
    }
  } catch (e) {}

  if (ADMIN_PHONE === '9863013886') {
    return '60769525878871@lid';
  }
  return `91${ADMIN_PHONE}@s.whatsapp.net`;
}

/**
 * Starts startup alert (once per boot) and 30s hardware Power/Battery Watchdog
 */
async function sendAdminAlert({ getSock, alertKey, severity = 'warn', title, body, cooldownMs = 30 * 60 * 1000, logFn = console.log }) {
  try {
    const key = String(alertKey || title || 'generic');
    const now = Date.now();
    const isRecovery = severity === 'recovery';

    if (!isRecovery) {
      const prevAt = adminAlertCooldowns.get(key) || 0;
      if (now - prevAt < cooldownMs) {
        return { sent: false, skipped: 'cooldown' };
      }
      adminAlertCooldowns.set(key, now);
    } else {
      adminAlertCooldowns.delete(key.replace(/_recovery$/, ''));
    }

    const sock = getSock?.();
    if (!sock || sock.ws?.readyState !== 1) {
      return { sent: false, skipped: 'socket_offline' };
    }

    const icon = severity === 'critical' ? '🚨' : severity === 'recovery' ? '✅' : '⚠️';
    const targetJid = resolveAdminAlertJid();
    const msgText =
      `${icon} *PrintKurox Pi Alert · ${title}*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${body}\n\n` +
      `_Target: +91 ${ADMIN_PHONE} · Reply \`#status\` for live Pi health_`;

    await sock.sendMessage(targetJid, { text: msgText });
    logFn(`[AdminAlert] Sent (${severity}:${key}) to ${targetJid}`);
    return { sent: true };
  } catch (err) {
    logFn(`[AdminAlert] Failed (${alertKey}): ${err.message}`);
    return { sent: false, error: err.message };
  }
}

function startAdminAlertServer({ getSock, logFn = console.log }) {
  if (alertServerStarted) return;
  alertServerStarted = true;

  const srv = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/internal/admin-alert') {
      const hdrToken = String(req.headers['x-station-token'] || '').trim();
      if (STATION_TOKEN && hdrToken && hdrToken !== STATION_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid station token' }));
        return;
      }

      let raw = '';
      req.on('data', (chunk) => {
        if (raw.length < 16384) raw += chunk;
      });
      req.on('end', async () => {
        try {
          const data = JSON.parse(raw || '{}');
          const result = await sendAdminAlert({
            getSock,
            alertKey: data.alertKey || 'pi_alert',
            severity: data.severity || 'warn',
            title: data.title || 'Raspberry Pi Notice',
            body: data.body || '',
            cooldownMs: Number(data.cooldownMs || 1800 * 1000),
            logFn,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, ...result }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  srv.on('error', (err) => {
    logFn(`[AdminAlert] Listener error on port ${INTERNAL_ALERT_PORT}: ${err.message}`);
  });
  srv.listen(INTERNAL_ALERT_PORT, '127.0.0.1', () => {
    logFn(`[AdminAlert] Listening on http://127.0.0.1:${INTERNAL_ALERT_PORT}/internal/admin-alert -> ${ADMIN_PHONE}`);
  });
}

async function onBotConnectionOpen({ getSock, sendInteractiveButtons, logFn = console.log }) {
  const sock = getSock();
  if (!sock) return;

  const adminJid = resolveAdminAlertJid();

  if (!greetedOnStartup) {
    greetedOnStartup = true;
    try {
      const pi = getPiDiagnosticsSummary();
      const wifiUser = process.env.CAMPUS_WIFI_USER || '122148';
      const title = pi ? '🍓 PrintKurox Raspberry Pi Online' : '🟢 NERIST Laptop Server Online';
      let startupBody = '';
      if (pi) {
        const printerStr = pi.printers.length > 0 ? pi.printers.join(', ') : 'None (Plug USB Printer)';
        startupBody =
          `Pi & WhatsApp Bot active 24/7 (+91 9362980761).\n\n` +
          `• Temp: ${pi.tempC !== null ? `${pi.tempC}°C` : 'N/A'} · Disk Free: ${pi.diskFreeGb || 'N/A'}\n` +
          `• Printer: ${printerStr}\n` +
          `• Campus Wi-Fi User: ${wifiUser}\n` +
          `• Memory: ${pi.memUsedMb ?? '?'} / ${pi.memTotalMb ?? '?'} MB`;
      } else {
        const power = await getPowerStatus();
        const powerText = power.isAcOnline
          ? '⚡ Plugged In (AC Electricity ON)'
          : `⚠️ Battery: ${power.batteryPct}% (Electric OFF)`;
        startupBody =
          `Server is active and running 24/7 via PrintKurox Bot (+91 9362980761).\n\n` +
          `• Power: ${powerText}\n` +
          `• Campus Wi-Fi User: ${wifiUser}\n` +
          `• Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`;
      }

      await sendInteractiveButtons({
        sock,
        jid: adminJid,
        title,
        body: startupBody,
        footer: 'PrintKurox Raspberry Pi Controller',
        buttons: [
          { id: 'btn_admin_status', text: pi ? '📊 Check Pi Status' : '📊 Check Server Status' },
          { id: 'btn_admin_wifi_login', text: '📶 Re-login Campus Wi-Fi' },
          { id: 'btn_admin_shutdown_req', text: pi ? '🛑 Shutdown Pi' : '🛑 Shutdown Laptop' },
        ],
      });
    } catch (err) {
      logFn(`[Server Controller] Startup alert notice: ${err.message}`);
    }
  }

  if (!watchdogsStarted && process.platform === 'win32') {
    watchdogsStarted = true;
    try {
      const initialPower = await getPowerStatus();
      lastAcStatus = initialPower.isAcOnline;
    } catch (e) {}

    setInterval(async () => {
      try {
        const liveSock = getSock();
        if (!liveSock || liveSock.ws?.readyState !== 1) return;

        const power = await getPowerStatus();
        if (!power.success) return;

        const targetJid = resolveAdminAlertJid();

        // Detect Electricity Cut
        if (lastAcStatus === true && power.isAcOnline === false) {
          logFn(`[POWER ALERT] Electricity CUT! Running on battery: ${power.batteryPct}%`);
          await sendInteractiveButtons({
            sock: liveSock,
            jid: targetJid,
            title: '⚠️ [NERIST Server Alert]',
            body:
              `⚡ Electricity in the hostel is *OFF*!\n` +
              `🔋 Laptop is running on battery: *${power.batteryPct}%*\n\n` +
              `⏱️ Server will auto-shutdown if battery drops below ${SHUTDOWN_THRESHOLD}%.`,
            footer: 'Power Alert',
            buttons: [
              { id: 'btn_admin_status', text: '📊 Check Status' },
              { id: 'btn_admin_shutdown_req', text: '🛑 Shutdown Laptop' },
            ],
          });
        }

        // Detect Electricity Restored
        if (lastAcStatus === false && power.isAcOnline === true) {
          logFn(`[POWER ALERT] Electricity RESTORED! Battery: ${power.batteryPct}%`);
          emergencyShutdownTriggered = false;
          await liveSock.sendMessage(targetJid, {
            text:
              `✅ *[NERIST Server Alert]*\n` +
              `⚡ Electricity has been *RESTORED*!\n` +
              `🔋 Laptop is plugged in and charging: *${power.batteryPct}%*`,
          });
        }

        lastAcStatus = power.isAcOnline;

        // Failsafe Critical Low Battery Auto-Shutdown
        if (!power.isAcOnline && power.batteryPct <= SHUTDOWN_THRESHOLD && !emergencyShutdownTriggered) {
          emergencyShutdownTriggered = true;
          logFn(`[CRITICAL] Battery at ${power.batteryPct}%. Initiating safe emergency shutdown in 60s!`);
          await liveSock.sendMessage(targetJid, {
            text:
              `🚨 *[CRITICAL BATTERY ALERT]*\n` +
              `Battery reached *${power.batteryPct}%*!\n` +
              `Shutting down laptop safely in 60 seconds to protect hardware.\n\n` +
              `_To cancel, reply \`#cancelshutdown\`!_`,
          });
          executeShutdown(60, 'NERIST Bot: Emergency battery protection shutdown');
        }
      } catch (loopErr) {
        logFn(`[Power Watchdog] Loop error: ${loopErr.message}`);
      }
    }, 30000);
  }
}

module.exports = {
  handleServerAdminCommand,
  onBotConnectionOpen,
  getPowerStatus,
  loginCampusPortal,
  sendAdminAlert,
  startAdminAlertServer,
  resolveAdminAlertJid,
};
