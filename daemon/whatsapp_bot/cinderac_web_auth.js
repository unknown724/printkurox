/**
 * cinderac_web_auth.js
 * 
 * Embedded Mobile-Optimized Web Authentication Server for Agent Kurox
 * Provides:
 *  - 10-Minute Expiring Cryptographic One-Time Tokens (OTT)
 *  - Instant single-use token destruction on success (Anti-Hijack)
 *  - Cinderac dark-mode mobile UI with smooth AJAX login
 *  - Inline error feedback on wrong credentials without page reload
 *  - One-tap WhatsApp deep link back to Agent Kurox
 */

const http = require('http');
const url = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { syncStudentData, saveCinderacSession } = require('./cinderac_sync_module');

const DEFAULT_PORT = 7260;
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Map<tokenString, { phone: string, senderJid: string, expiresAt: number, used: boolean }>
const pendingAuthTokens = new Map();

// Optional external callback triggered on successful auth: (senderJid, phone, cinderacData) => void
let onAuthSuccessCallback = null;

/**
 * Determine local LAN IP address for reliable fallback access
 */
function getLocalIpAddress() {
  try {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
          return alias.address;
        }
      }
    }
  } catch (e) {}
  return 'localhost';
}

// Public tunnel URL (updated dynamically if cloudflared starts, defaults to local LAN address)
let currentPublicUrl = `http://${getLocalIpAddress()}:${DEFAULT_PORT}`;

// Singleton state for cloudflared tunnel
let cloudflaredProc = null;
let isCloudflaredStarting = false;
let cloudflaredRetryCount = 0;
const MAX_CF_RETRIES = 3;

/**
 * Generate a cryptographically random, single-use 10-minute auth token
 */
function createAuthToken(phone, senderJid) {
  // Purge any expired tokens first
  const now = Date.now();
  for (const [t, meta] of pendingAuthTokens.entries()) {
    if (meta.expiresAt < now || meta.used) {
      pendingAuthTokens.delete(t);
    }
  }

  const token = crypto.randomBytes(16).toString('hex');
  pendingAuthTokens.set(token, {
    phone: phone ? String(phone).replace(/[^0-9]/g, '').slice(-10) : '',
    senderJid: senderJid || '',
    expiresAt: now + TOKEN_TTL_MS,
    used: false
  });

  return token;
}

/**
 * Validate a token
 */
function validateAuthToken(token) {
  if (!token || !pendingAuthTokens.has(token)) return { valid: false, reason: 'NOT_FOUND' };
  const meta = pendingAuthTokens.get(token);
  if (meta.used) return { valid: false, reason: 'ALREADY_USED' };
  if (meta.expiresAt < Date.now()) {
    pendingAuthTokens.delete(token);
    return { valid: false, reason: 'EXPIRED' };
  }
  return { valid: true, meta };
}

/**
 * Set callback for WhatsApp push notifications
 */
function setOnAuthSuccess(cb) {
  onAuthSuccessCallback = cb;
}

/**
 * Get current base URL for generating student links
 */
function getPublicAuthUrl() {
  return currentPublicUrl;
}

/**
 * Generate HTML for Login Page
 */
function renderLoginPage(token) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Cinderac Portal Verification · Agent Kurox</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: #0d0f12;
      color: #f3f4f6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 18px;
    }
    .card {
      background: #171a21;
      border: 1px solid #2a2f3a;
      border-radius: 20px;
      padding: 30px 24px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.45);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 22px;
    }
    .brand-icon {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #ff6b35, #ea580c);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 4px 14px rgba(234, 88, 12, 0.4);
    }
    .brand-title {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.3px;
    }
    .brand-subtitle {
      font-size: 12px;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .desc {
      font-size: 13.5px;
      color: #9ca3af;
      line-height: 1.5;
      margin-bottom: 22px;
    }
    .timer-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(234, 88, 12, 0.12);
      border: 1px solid rgba(234, 88, 12, 0.3);
      color: #fb923c;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 20px;
      margin-bottom: 16px;
    }
    .form-group {
      margin-bottom: 16px;
      text-align: left;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    input {
      width: 100%;
      background: #0f1218;
      border: 1px solid #2a313e;
      color: #ffffff;
      padding: 13px 15px;
      border-radius: 12px;
      font-size: 15px;
      outline: none;
      transition: all 0.2s ease;
    }
    input:focus {
      border-color: #ff6b35;
      box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.18);
    }
    input::placeholder {
      color: #4b5563;
    }
    .btn {
      width: 100%;
      background: linear-gradient(135deg, #ff6b35, #ea580c);
      color: #ffffff;
      border: none;
      padding: 14px;
      border-radius: 12px;
      font-size: 15.5px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(234, 88, 12, 0.35);
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 20px;
    }
    .btn:active {
      transform: scale(0.98);
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .alert-box {
      display: none;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #fca5a5;
      font-size: 13px;
      padding: 12px;
      border-radius: 10px;
      margin-bottom: 16px;
      line-height: 1.4;
    }
    .success-box {
      display: none;
      text-align: center;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    .success-title {
      font-size: 20px;
      font-weight: 700;
      color: #34d399;
      margin-bottom: 8px;
    }
    .success-desc {
      font-size: 13.5px;
      color: #9ca3af;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .btn-wa {
      background: #25d366;
      box-shadow: 0 6px 18px rgba(37, 211, 102, 0.35);
      color: #ffffff;
      text-decoration: none;
      padding: 14px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .spinner {
      border: 2px solid rgba(255,255,255,0.3);
      border-top: 2px solid #ffffff;
      border-radius: 50%;
      width: 18px;
      height: 18px;
      animation: spin 0.8s linear infinite;
      display: none;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .footer {
      margin-top: 22px;
      font-size: 11px;
      color: #4b5563;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="card" id="mainCard">
    <div id="loginSection">
      <div class="brand">
        <div class="brand-icon">🎓</div>
        <div>
          <div class="brand-title">Cinderac Sync</div>
          <div class="brand-subtitle">NERIST Academic Portal</div>
        </div>
      </div>

      <div class="timer-badge">
        <span>⏱️</span>
        <span>Secure Link: Valid for 10 minutes</span>
      </div>

      <p class="desc">
        Sign in with your Cinderac / SymphonyX portal account to sync your 7 enrolled subjects &amp; assigned teachers with Agent Kurox.
      </p>

      <div class="alert-box" id="errorAlert"></div>

      <form id="authForm" onsubmit="handleLogin(event)">
        <input type="hidden" id="tokenField" value="${token}">
        
        <div class="form-group">
          <label for="regId">Registration ID</label>
          <input type="text" id="regId" placeholder="121/016" required autocomplete="username" autofocus>
        </div>

        <div class="form-group">
          <label for="password">Portal Password</label>
          <input type="password" id="password" placeholder="Password123" required autocomplete="current-password">
        </div>

        <button type="submit" class="btn" id="submitBtn">
          <span class="spinner" id="btnSpinner"></span>
          <span id="btnText">Verify &amp; Sync Courses</span>
        </button>
      </form>
    </div>

    <div class="success-box" id="successSection">
      <div class="success-icon">✅</div>
      <div class="success-title" id="studentWelcome">Verification Successful!</div>
      <p class="success-desc" id="coursesCountDesc">
        Your academic courses and faculty details are now synced with WhatsApp.
      </p>
      <a href="https://wa.me/919362980761?text=Synced" class="btn-wa" id="waReturnLink">
        <span>📲</span>
        <span>Tap to Return to WhatsApp</span>
      </a>
    </div>

    <div class="footer">
      End-to-End Encrypted Session · Single-Use Token · Agent Kurox
    </div>
  </div>

  <script>
    async function handleLogin(e) {
      e.preventDefault();
      const token = document.getElementById('tokenField').value;
      const regId = document.getElementById('regId').value.trim();
      const password = document.getElementById('password').value;

      const submitBtn = document.getElementById('submitBtn');
      const btnSpinner = document.getElementById('btnSpinner');
      const btnText = document.getElementById('btnText');
      const errorAlert = document.getElementById('errorAlert');

      errorAlert.style.display = 'none';
      submitBtn.disabled = true;
      btnSpinner.style.display = 'inline-block';
      btnText.textContent = 'Verifying with Cinderac...';

      try {
        const res = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, regId, password })
        });

        const data = await res.json();

        if (data.success) {
          document.getElementById('loginSection').style.display = 'none';
          document.getElementById('successSection').style.display = 'block';
          document.getElementById('studentWelcome').textContent = 'Welcome, ' + (data.studentName || 'Student') + '!';
          document.getElementById('coursesCountDesc').textContent = 
            'Successfully synced ' + (data.coursesCount || 'all') + ' registered courses. You can now generate your official 1-click front cover in WhatsApp!';
          if (data.returnUrl) {
            document.getElementById('waReturnLink').href = data.returnUrl;
          }
        } else {
          errorAlert.textContent = '⚠️ ' + (data.message || 'Invalid Registration ID or Password. Please try again.');
          errorAlert.style.display = 'block';
          document.getElementById('password').value = '';
          document.getElementById('password').focus();
          submitBtn.disabled = false;
          btnSpinner.style.display = 'none';
          btnText.textContent = 'Verify & Sync Courses';
        }
      } catch (err) {
        errorAlert.textContent = '❌ Connection error: ' + err.message + '. Please retry.';
        errorAlert.style.display = 'block';
        submitBtn.disabled = false;
        btnSpinner.style.display = 'none';
        btnText.textContent = 'Verify & Sync Courses';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Generate HTML for Expired/Invalid Token Page
 */
function renderExpiredPage(reason) {
  let title = 'Verification Link Expired';
  let message = 'This secure verification link has expired or has already been used to authenticate an account.';
  if (reason === 'ALREADY_USED') {
    title = 'Link Already Used';
    message = 'This one-time security link has already been verified and permanently self-destructed for your security.';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} · Agent Kurox</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: #0d0f12;
      color: #f3f4f6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 18px;
    }
    .card {
      background: #171a21;
      border: 1px solid #2a2f3a;
      border-radius: 20px;
      padding: 34px 24px;
      width: 100%;
      max-width: 420px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.45);
    }
    .icon { font-size: 52px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 700; color: #f87171; margin-bottom: 12px; }
    p { font-size: 14px; color: #9ca3af; line-height: 1.5; margin-bottom: 26px; }
    a.btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #25d366;
      color: #ffffff;
      text-decoration: none;
      padding: 14px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 15px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⛔</div>
    <h1>${title}</h1>
    <p>${message}<br><br>Please return to WhatsApp and request a fresh link by tapping <b>[🌐 Verify via Web Link]</b> or verify directly in chat.</p>
    <a href="https://wa.me/919362980761" class="btn">
      <span>📲</span>
      <span>Return to WhatsApp Bot</span>
    </a>
  </div>
</body>
</html>`;
}

/**
 * Embedded HTTP Server Request Handler
 */
function handleHttpRequest(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /auth?t=<token>
  if (req.method === 'GET' && pathname === '/auth') {
    const token = parsedUrl.searchParams.get('t');
    const validation = validateAuthToken(token);

    if (!validation.valid) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderExpiredPage(validation.reason));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderLoginPage(token));
    return;
  }

  // POST /auth/login
  if (req.method === 'POST' && pathname === '/auth/login') {
    let bodyData = '';
    req.on('data', chunk => bodyData += chunk);
    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyData || '{}');
        const token = body.token;
        const regId = body.regId;
        const password = body.password;

        const validation = validateAuthToken(token);
        if (!validation.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'This verification link has expired. Please request a new one in WhatsApp.'
          }));
          return;
        }

        const syncResult = await syncStudentData(regId, password);

        if (!syncResult.success) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: syncResult.message || 'Incorrect Registration ID or Password.'
          }));
          return;
        }

        // Successfully synced! Destroy token immediately to prevent reuse
        validation.meta.used = true;
        pendingAuthTokens.delete(token);

        // Save session in user_profiles.json
        const userPhone = validation.meta.phone;
        const senderJid = validation.meta.senderJid;
        saveCinderacSession(senderJid, userPhone, {
          regId: syncResult.profile.regId,
          profile: syncResult.profile,
          courses: syncResult.courses,
          syncedAt: syncResult.syncedAt
        });

        // Trigger WhatsApp push callback if registered
        if (typeof onAuthSuccessCallback === 'function') {
          try {
            onAuthSuccessCallback(senderJid, userPhone, syncResult);
          } catch (err) {
            console.error('[WebAuth] ❌ Error in onAuthSuccessCallback:', err.message);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          studentName: syncResult.profile.fullName,
          rollNo: syncResult.profile.rollNo,
          coursesCount: syncResult.courses.length,
          returnUrl: 'https://wa.me/919362980761?text=Synced'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: `Server error: ${err.message}` }));
      }
    });
    return;
  }

  // Health / Default
  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', service: 'Agent Kurox Cinderac Web Auth', time: Date.now() }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

/**
 * Start the Web Auth HTTP Server
 */
let serverInstance = null;
function startWebAuthServer(port = DEFAULT_PORT) {
  if (serverInstance) return serverInstance;

  serverInstance = http.createServer(handleHttpRequest);
  serverInstance.listen(port, '0.0.0.0', () => {
    console.log(`[WebAuth] 🚀 Cinderac Web Auth Server listening on http://0.0.0.0:${port}`);
  });

  serverInstance.on('error', (err) => {
    console.error('[WebAuth] ❌ Server error:', err.message);
  });

  return serverInstance;
}

/**
 * Helper to start cloudflared quick tunnel with singleton protection & retry backoff
 */
function startCloudflaredTunnel(port = DEFAULT_PORT) {
  if (cloudflaredProc && !cloudflaredProc.killed) {
    return;
  }
  if (isCloudflaredStarting) {
    return;
  }

  const cloudflaredPaths = process.platform === 'win32'
    ? [
        'C:\\PrintKurox\\daemon\\cloudflared.exe',
        path.join(__dirname, 'daemon', 'cloudflared.exe'),
        path.join(__dirname, 'cloudflared.exe')
      ]
    : [
        '/usr/local/bin/cloudflared',
        '/usr/bin/cloudflared',
        path.join(__dirname, 'daemon', 'cloudflared'),
        path.join(__dirname, 'cloudflared')
      ];

  let cfPath = cloudflaredPaths.find(p => fs.existsSync(p));
  if (!cfPath) {
    console.log(`[WebAuth] cloudflared.exe not found. Running with direct network access on: ${currentPublicUrl}`);
    return;
  }

  isCloudflaredStarting = true;

  try {
    console.log(`[WebAuth] Initializing cloudflared HTTP/2 tunnel for port ${port}...`);
    const cfProc = spawn(cfPath, ['tunnel', '--protocol', 'http2', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    cloudflaredProc = cfProc;

    cfProc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/(?!api\.)[a-z0-9\-]{4,}\.trycloudflare\.com/i);
      if (match && !match[0].includes('api.trycloudflare.com')) {
        currentPublicUrl = match[0];
        isCloudflaredStarting = false;
        cloudflaredRetryCount = 0;
        console.log(`[WebAuth] Public Secure Auth Tunnel LIVE: ${currentPublicUrl}`);
      }
    });

    cfProc.on('exit', (code) => {
      cloudflaredProc = null;
      isCloudflaredStarting = false;
      if (code !== 0 && cloudflaredRetryCount < MAX_CF_RETRIES) {
        cloudflaredRetryCount++;
        const delay = cloudflaredRetryCount * 5000;
        console.log(`[WebAuth] cloudflared exited (code ${code}). Retrying in ${delay / 1000}s (Attempt ${cloudflaredRetryCount}/${MAX_CF_RETRIES})...`);
        setTimeout(() => startCloudflaredTunnel(port), delay);
      } else if (code !== 0) {
        console.log(`[WebAuth] Quick tunnel negotiation ended. Using network access URL: ${currentPublicUrl}`);
      }
    });

    cfProc.on('error', (err) => {
      cloudflaredProc = null;
      isCloudflaredStarting = false;
      console.warn(`[WebAuth] cloudflared notice: ${err.message}. Accessible via: ${currentPublicUrl}`);
    });
  } catch (err) {
    isCloudflaredStarting = false;
    cloudflaredProc = null;
    console.warn('[WebAuth] Could not spawn cloudflared:', err.message);
  }
}

/**
 * Cleanly terminate active cloudflared child process on exit
 */
function stopCloudflaredTunnel() {
  if (cloudflaredProc) {
    try {
      cloudflaredProc.kill('SIGTERM');
    } catch (e) {}
    cloudflaredProc = null;
  }
}

process.on('exit', stopCloudflaredTunnel);
process.on('SIGINT', stopCloudflaredTunnel);
process.on('SIGTERM', stopCloudflaredTunnel);

module.exports = {
  createAuthToken,
  validateAuthToken,
  startWebAuthServer,
  startCloudflaredTunnel,
  stopCloudflaredTunnel,
  setOnAuthSuccess,
  getPublicAuthUrl
};
