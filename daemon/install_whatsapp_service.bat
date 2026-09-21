@echo off
:: ============================================================
:: PrintKurox — Install WhatsApp Bot as a Windows 24/7 Service
:: Automatically requests Administrator privileges if needed.
:: ============================================================
setlocal

:: Check for Administrative permissions & auto-elevate
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Requesting Administrator permissions...
    powershell -Command "Start-Process cmd.exe -ArgumentList '/k \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

title PrintKurox WhatsApp Bot 24/7 Service Installer

:: --- Find Node.js path ---
for /f "tokens=*" %%i in ('where node 2^>nul') do (
    set NODE_PATH=%%i
    goto :FOUND_NODE
)
:FOUND_NODE
if not defined NODE_PATH (
    if exist "C:\Program Files\nodejs\node.exe" set NODE_PATH=C:\Program Files\nodejs\node.exe
)
if not defined NODE_PATH (
    echo [ERROR] Node.js not found in PATH or standard location!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)
echo [INFO] Found Node.js: %NODE_PATH%

:: --- Find NSSM path ---
for /f "tokens=*" %%i in ('where nssm 2^>nul') do (
    set NSSM_PATH=%%i
    goto :FOUND_NSSM
)
:FOUND_NSSM
if not defined NSSM_PATH (
    if exist "C:\ProgramData\chocolatey\bin\nssm.exe" set NSSM_PATH=C:\ProgramData\chocolatey\bin\nssm.exe
    if exist "C:\nssm\nssm.exe" set NSSM_PATH=C:\nssm\nssm.exe
)
if not defined NSSM_PATH (
    echo [ERROR] NSSM not found. Please install it: winget install nssm
    pause
    exit /b 1
)
echo [INFO] Found NSSM: %NSSM_PATH%

set BOT_DIR=%~dp0whatsapp_bot
set BOT_SCRIPT=whatsapp_bot.js
set SERVICE_NAME=PrintKuroxWhatsAppBot
set LOG_DIR=%BOT_DIR%\logs

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

sc query %SERVICE_NAME% >nul 2>&1
if %errorLevel% equ 0 (
    echo [INFO] Removing existing service %SERVICE_NAME%...
    "%NSSM_PATH%" stop %SERVICE_NAME% >nul 2>&1
    "%NSSM_PATH%" remove %SERVICE_NAME% confirm >nul 2>&1
)

echo [INFO] Installing %SERVICE_NAME% as a Windows 24/7 Service...
"%NSSM_PATH%" install %SERVICE_NAME% "%NODE_PATH%" "%BOT_SCRIPT%"

:: Configure service parameters
"%NSSM_PATH%" set %SERVICE_NAME% DisplayName "PrintKurox WhatsApp Bot Daemon"
"%NSSM_PATH%" set %SERVICE_NAME% Description "PrintKurox WhatsApp ingestion bot — processes student document print jobs 24/7."
"%NSSM_PATH%" set %SERVICE_NAME% AppDirectory "%BOT_DIR%"
"%NSSM_PATH%" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM_PATH%" set %SERVICE_NAME% AppRestartDelay 5000
"%NSSM_PATH%" set %SERVICE_NAME% AppStdout "%LOG_DIR%\wa_bot_stdout.log"
"%NSSM_PATH%" set %SERVICE_NAME% AppStderr "%LOG_DIR%\wa_bot_stderr.log"
"%NSSM_PATH%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM_PATH%" set %SERVICE_NAME% AppRotateOnline 1
"%NSSM_PATH%" set %SERVICE_NAME% AppRotateBytes 5242880

echo [INFO] Starting %SERVICE_NAME%...
"%NSSM_PATH%" start %SERVICE_NAME%

echo.
echo ============================================================
echo  PrintKurox WhatsApp Bot installed as a 24/7 Windows Service!
echo  - Service Name : %SERVICE_NAME%
echo  - Status       : Running in background (24/7)
echo  - Auto-starts  : On every Windows boot (even before login)
echo  - Auto-restarts: On crash or network drop (after 5s delay)
echo  - Logs         : %LOG_DIR%\wa_bot_stdout.log
echo ============================================================
echo.
echo You can close this window now. The bot is actively running!
pause
