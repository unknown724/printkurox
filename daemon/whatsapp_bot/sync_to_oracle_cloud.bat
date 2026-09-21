@echo off
title Sync PrintKurox WhatsApp Bot to Oracle Cloud VM
setlocal

echo ============================================================
echo   PrintKurox WhatsApp Bot — Transfer to Oracle Cloud VM
echo ============================================================
echo.

set /p VM_IP="Enter your Oracle Cloud VM Public IP address: "
if "%VM_IP%"=="" (
    echo [ERROR] VM IP address cannot be empty!
    pause
    exit /b 1
)

set /p SSH_KEY="Enter path to your SSH Private Key (.key / .pem) file: "
if "%SSH_KEY%"=="" (
    echo [ERROR] SSH Key path cannot be empty!
    pause
    exit /b 1
)

echo.
echo [1/3] Creating directory on Oracle VM...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no ubuntu@%VM_IP% "mkdir -p ~/whatsapp_bot"

echo [2/3] Uploading bot files and active WhatsApp session...
scp -i "%SSH_KEY%" -r "%~dp0whatsapp_bot.js" "%~dp0docx_converter.js" "%~dp0package.json" "%~dp0.env" "%~dp0setup_oracle_linux.sh" "%~dp0session_auth" ubuntu@%VM_IP%:~/whatsapp_bot/

echo.
echo [3/3] Setting permissions...
ssh -i "%SSH_KEY%" ubuntu@%VM_IP% "chmod +x ~/whatsapp_bot/setup_oracle_linux.sh"

echo.
echo ============================================================
echo  Files Transferred Successfully!
echo ============================================================
echo.
echo Next, connect to your Oracle VM:
echo   ssh -i "%SSH_KEY%" ubuntu@%VM_IP%
echo.
echo And run:
echo   cd ~/whatsapp_bot
echo   ./setup_oracle_linux.sh
echo   pm2 start whatsapp_bot.js --name printkurox-wa
echo   pm2 save
echo   pm2 startup
echo ============================================================
pause
