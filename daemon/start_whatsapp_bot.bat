@echo off
title PrintKurox WhatsApp AutoPrint Bot
cd /d "%~dp0\whatsapp_bot"
echo ============================================================
echo         Starting PrintKurox WhatsApp Ingestion Bot
echo ============================================================
echo.
echo Checking Node.js environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo Starting WhatsApp Bot listener...
echo (If this is your first run, scan the QR code that appears below)
echo.
node whatsapp_bot.js
pause
