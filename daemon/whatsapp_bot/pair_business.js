const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay, DisconnectReason } = require('./node_modules/@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const authDir = path.join(__dirname, 'session_auth');
const PHONE_NUMBER = '919362980761';

// Clean out completely for fresh pairing on initial start
if (fs.existsSync(authDir)) {
  fs.rmSync(authDir, { recursive: true, force: true });
}
fs.mkdirSync(authDir, { recursive: true });

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['PrintKurox', 'Chrome', '120.0.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('\n[SUCCESS] Connected and paired successfully as:', sock.user?.name, sock.user?.id);
      process.exit(0);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('Connection closed with code:', code);
      if (code !== DisconnectReason.loggedOut) {
        setTimeout(start, 2500);
      }
    }
  });

  if (!sock.authState.creds.registered) {
    await delay(3000);
    try {
      const code = await sock.requestPairingCode(PHONE_NUMBER);
      console.log('\n============================================================');
      console.log(` >>> FRESH WHATSAPP PAIRING CODE:  ${code} <<< `);
      console.log('============================================================\n');
    } catch (e) {
      console.error('Error requesting pairing code:', e.message);
    }
  }
}

start();
