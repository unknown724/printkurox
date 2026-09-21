@echo off
setlocal
set PRINT_SVC=PrintKuroxDaemon
set WA_SVC=PrintKuroxWhatsAppBot
set DAEMON_DIR=%~dp0

for /f "tokens=*" %%i in ('where nssm 2^>nul') do set NSSM_PATH=%%i
if not defined NSSM_PATH (
    if exist "C:\ProgramData\chocolatey\bin\nssm.exe" set NSSM_PATH=C:\ProgramData\chocolatey\bin\nssm.exe
    if exist "C:\nssm\nssm.exe" set NSSM_PATH=C:\nssm\nssm.exe
)
if not defined NSSM_PATH set NSSM_PATH=nssm

:MENU
cls
echo ============================================================
echo         PrintKurox 24/7 Services — Status & Manager
echo ============================================================
echo.

set PRINT_STATE=NOT_INSTALLED
for /f "tokens=3" %%s in ('sc query %PRINT_SVC% 2^>nul ^| findstr "STATE"') do set PRINT_STATE=%%s

set WA_STATE=NOT_INSTALLED
for /f "tokens=3" %%s in ('sc query %WA_SVC% 2^>nul ^| findstr "STATE"') do set WA_STATE=%%s

echo  [1] Printer Daemon Service  : %PRINT_STATE%
echo  [2] WhatsApp Bot Service    : %WA_STATE%
echo.
echo ------------------------------------------------------------
echo  WHATSAPP BOT CONTROLS:
echo    [W1] Start WhatsApp Bot       [W2] Stop WhatsApp Bot
echo    [W3] Restart WhatsApp Bot     [W4] View WhatsApp Live Logs
echo.
echo  PRINTER DAEMON CONTROLS:
echo    [P1] Start Printer Daemon     [P2] Stop Printer Daemon
echo    [P3] Restart Printer Daemon   [P4] View Printer Live Logs
echo.
echo  ALL SERVICES:
echo    [A1] Start BOTH Services      [A2] Stop BOTH Services
echo    [A3] Restart BOTH Services
echo.
echo    [Q] Exit
echo ------------------------------------------------------------
echo.
set /p CHOICE=Choose an option: 

if /i "%CHOICE%"=="W1" (
    "%NSSM_PATH%" start %WA_SVC%
    pause
    goto MENU
)
if /i "%CHOICE%"=="W2" (
    "%NSSM_PATH%" stop %WA_SVC%
    pause
    goto MENU
)
if /i "%CHOICE%"=="W3" (
    "%NSSM_PATH%" restart %WA_SVC%
    pause
    goto MENU
)
if /i "%CHOICE%"=="W4" (
    echo Tailing WhatsApp bot log... Press Ctrl+C to return.
    powershell -Command "if (Test-Path '%DAEMON_DIR%whatsapp_bot\logs\wa_bot_stdout.log') { Get-Content '%DAEMON_DIR%whatsapp_bot\logs\wa_bot_stdout.log' -Wait -Tail 40 } else { Write-Host 'No log file yet. Ensure the service is running.' }"
    goto MENU
)

if /i "%CHOICE%"=="P1" (
    "%NSSM_PATH%" start %PRINT_SVC%
    pause
    goto MENU
)
if /i "%CHOICE%"=="P2" (
    "%NSSM_PATH%" stop %PRINT_SVC%
    pause
    goto MENU
)
if /i "%CHOICE%"=="P3" (
    "%NSSM_PATH%" restart %PRINT_SVC%
    pause
    goto MENU
)
if /i "%CHOICE%"=="P4" (
    echo Tailing Printer Daemon log... Press Ctrl+C to return.
    powershell -Command "if (Test-Path '%DAEMON_DIR%logs\daemon_stdout.log') { Get-Content '%DAEMON_DIR%logs\daemon_stdout.log' -Wait -Tail 40 } else { Write-Host 'No log file yet.' }"
    goto MENU
)

if /i "%CHOICE%"=="A1" (
    "%NSSM_PATH%" start %PRINT_SVC%
    "%NSSM_PATH%" start %WA_SVC%
    pause
    goto MENU
)
if /i "%CHOICE%"=="A2" (
    "%NSSM_PATH%" stop %PRINT_SVC%
    "%NSSM_PATH%" stop %WA_SVC%
    pause
    goto MENU
)
if /i "%CHOICE%"=="A3" (
    "%NSSM_PATH%" restart %PRINT_SVC%
    "%NSSM_PATH%" restart %WA_SVC%
    pause
    goto MENU
)

if /i "%CHOICE%"=="Q" exit /b

goto MENU
