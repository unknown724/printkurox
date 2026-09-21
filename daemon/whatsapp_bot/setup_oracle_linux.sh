#!/usr/bin/env bash
# ============================================================
# PrintKurox WhatsApp Bot — 1-Click Ubuntu / Oracle VM Setup
# ============================================================

set -e

echo "============================================================"
echo " Starting PrintKurox WhatsApp Bot Setup on Ubuntu / Oracle Cloud"
echo "============================================================"

# 1. Update system packages
echo "[1/5] Updating packages..."
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Install Node.js 20 LTS & build tools
echo "[2/5] Installing Node.js 20 LTS..."
sudo apt-get install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "Node version: $(node -v)"
echo "NPM version:  $(npm -v)"

# 3. Install LibreOffice for headless Word (.docx) to PDF conversion
echo "[3/5] Installing LibreOffice (headless document converter)..."
sudo apt-get install -y libreoffice --no-install-recommends

# 4. Install PM2 process manager globally
echo "[4/5] Installing PM2 daemon manager..."
sudo npm install -g pm2

# 5. Install bot npm dependencies
echo "[5/5] Installing project dependencies..."
npm install

echo "============================================================"
echo " Setup Complete!"
echo ""
echo " To start the bot 24/7 with PM2:"
echo "   pm2 start whatsapp_bot.js --name printkurox-wa"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo " To view live logs:"
echo "   pm2 logs printkurox-wa"
echo "============================================================"
