#!/bin/bash
# ==============================================================================
# PrintKurox Linux Embedded Hardware Installer
# Configures CUPS, Epson ESC/P-R Drivers, and registers PrintKurox systemd service
# Compatible with: Armbian, Debian, Raspberry Pi OS, Ubuntu
# ==============================================================================

set -e

echo "=========================================================="
echo "  PrintKurox Embedded Kiosk Installer for Linux SBC       "
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root (sudo ./install_linux_service.sh)"
  exit 1
fi

INSTALL_DIR=$(pwd)
CURRENT_USER=$(logname || echo $SUDO_USER || echo "root")

echo "[1/4] Updating package lists..."
apt-get update -y

echo "[2/4] Installing CUPS, Python3, and Printer Drivers..."
apt-get install -y cups cups-client python3 python3-pip python3-requests printer-driver-escpr hplip

echo "[3/4] Configuring CUPS permissions & Network Sharing..."
# Add user to lpadmin group
usermod -aG lpadmin $CURRENT_USER || true

# Enable CUPS remote access & network sharing for Dual Mode
cupsctl --remote-admin --remote-any --share-printers
systemctl enable cups
systemctl restart cups

# Cap systemd journald logs so Raspberry Pi SD/USB storage cannot fill up
mkdir -p /etc/systemd/journald.conf.d
cat <<EOF > /etc/systemd/journald.conf.d/printkurox-cap.conf
[Journal]
SystemMaxUse=150M
MaxRetentionSec=14day
EOF
systemctl restart systemd-journald || true

echo "[4/4] Creating PrintKurox systemd Background Service..."
SERVICE_FILE="/etc/systemd/system/printkurox.service"

cat <<EOF > $SERVICE_FILE
[Unit]
Description=PrintKurox Autonomous Print Kiosk Daemon
After=network-online.target cups.service
Wants=network-online.target cups.service

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/printer_daemon_linux.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable printkurox.service
systemctl restart printkurox.service

NODE_BIN=$(command -v node || echo "/usr/bin/node")
BOT_DIR="$INSTALL_DIR/whatsapp_bot"
if [ -f "$BOT_DIR/whatsapp_bot.js" ] && [ -x "$NODE_BIN" ]; then
  BOT_SERVICE_FILE="/etc/systemd/system/printkurox-bot.service"
  cat <<EOF > $BOT_SERVICE_FILE
[Unit]
Description=PrintKurox Unified WhatsApp Bot (+91 93629 80761)
After=network-online.target printkurox.service
Wants=network-online.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$BOT_DIR
Environment=NODE_OPTIONS=--max-old-space-size=384
ExecStart=$NODE_BIN $BOT_DIR/whatsapp_bot.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable printkurox-bot.service
  systemctl restart printkurox-bot.service
fi

echo "=========================================================="
echo "  PrintKurox Hardware & WhatsApp Services Started!       "
echo "  Printer daemon status:  sudo systemctl status printkurox     "
echo "  WhatsApp bot status:    sudo systemctl status printkurox-bot "
echo "  View live logs:         sudo journalctl -u printkurox-bot -f "
echo "=========================================================="

