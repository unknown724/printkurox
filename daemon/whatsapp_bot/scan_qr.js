const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, delay, DisconnectReason } = require('./node_modules/@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const qrcodeLib = require('c:/Users/Devananda Wahengbam/Desktop/whatsappbot/node_modules/qrcode');
const qrcodeTerminal = require('./node_modules/qrcode-terminal');

const authDir = path.join(__dirname, 'session_auth');
const qrImagePath = 'C:/Users/Devananda Wahengbam/.gemini/antigravity-ide/brain/b09d164b-1530-4d33-85a0-2254285a8b26/qr.png';

// Clear authDir on initial start
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
    browser: ['PrintKurox Kiosk', 'Chrome', '120.0.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[QR Code Received! Saving image and rendering terminal...]');
      try {
        await qrcodeLib.toFile(qrImagePath, qr, {
          width: 450,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' }
        });
        console.log('Saved QR image to:', qrImagePath);
      } catch (e) {
        console.error('Failed to save QR file:', e.message);
      }
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('\n============================================================');
      console.log(' [SUCCESS] DEVICE CONNECTED & PAIRED VIA QR CODE!          ');
      console.log(' Connected as:', sock.user?.name, sock.user?.id);
      console.log('============================================================\n');
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
}

start();
