@echo off
:: ============================================================
:: PrintKurox — Install as a Windows Background Service
:: Run this as Administrator once. The daemon will then run
:: automatically in the background at all times, even without
:: anyone logged in. It auto-restarts on crashes too.
:: ============================================================
setlocal

:: --- Find python path (skip WindowsApps stub, use real interpreter) ---
for /f "tokens=*" %%i in ('where python') do (
    echo %%i | findstr /i "WindowsApps" >nul || set PYTHON_PATH=%%i
)
:: Fallback: check known real location
if not defined PYTHON_PATH (
    if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
        set PYTHON_PATH=%LOCALAPPDATA%\Programs\Python\Python313\python.exe
    )
)
if not defined PYTHON_PATH (
    echo [ERROR] Real Python not found. Make sure Python is installed (not just from Microsoft Store).
    pause
    exit /b 1
)
echo [INFO] Found Python: %PYTHON_PATH%

:: --- Find nssm path ---
for /f "tokens=*" %%i in ('where nssm 2^>nul') do set NSSM_PATH=%%i
if not defined NSSM_PATH (
    :: Try common install paths
    if exist "C:\ProgramData\chocolatey\bin\nssm.exe" set NSSM_PATH=C:\ProgramData\chocolatey\bin\nssm.exe
    if exist "C:\nssm\nssm.exe" set NSSM_PATH=C:\nssm\nssm.exe
)
if not defined NSSM_PATH (
    echo [ERROR] NSSM not found. Please install it: winget install nssm
    pause
    exit /b 1
)
echo [INFO] Found NSSM: %NSSM_PATH%

set DAEMON_DIR=%~dp0
set DAEMON_SCRIPT=%DAEMON_DIR%printer_daemon.py
set SERVICE_NAME=PrintKuroxDaemon
set LOG_DIR=%DAEMON_DIR%logs

:: Create logs directory
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: Remove existing service if present
echo [INFO] Removing any existing service...
"%NSSM_PATH%" stop %SERVICE_NAME% 2>nul
"%NSSM_PATH%" remove %SERVICE_NAME% confirm 2>nul

:: Install the service
echo [INFO] Installing PrintKurox as a Windows Service...
"%NSSM_PATH%" install %SERVICE_NAME% "%PYTHON_PATH%" "-u "%DAEMON_SCRIPT%""

:: Configure service settings
"%NSSM_PATH%" set %SERVICE_NAME% DisplayName "PrintKurox Print Daemon"
"%NSSM_PATH%" set %SERVICE_NAME% Description "PrintKurox kiosk daemon — polls Cloudflare D1 for paid print jobs and prints them silently."
"%NSSM_PATH%" set %SERVICE_NAME% AppDirectory "%DAEMON_DIR%"
"%NSSM_PATH%" set %SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM_PATH%" set %SERVICE_NAME% AppRestartDelay 5000
"%NSSM_PATH%" set %SERVICE_NAME% AppStdout "%LOG_DIR%\daemon_stdout.log"
"%NSSM_PATH%" set %SERVICE_NAME% AppStderr "%LOG_DIR%\daemon_stderr.log"
"%NSSM_PATH%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM_PATH%" set %SERVICE_NAME% AppRotateOnline 1
"%NSSM_PATH%" set %SERVICE_NAME% AppRotateBytes 5242880

:: Start the service now
echo [INFO] Starting the service...
"%NSSM_PATH%" start %SERVICE_NAME%

echo.
echo ============================================================
echo  PrintKurox Daemon installed as a Windows Service!
echo  - Service Name : %SERVICE_NAME%
echo  - Status       : Running in background
echo  - Auto-starts  : On every Windows boot (even before login)
echo  - Auto-restarts: On crash (after 5 second delay)
echo  - Logs         : %LOG_DIR%\
echo ============================================================
echo.
echo To manage the service, use these commands:
echo   nssm start  PrintKuroxDaemon
echo   nssm stop   PrintKuroxDaemon
echo   nssm status PrintKuroxDaemon
echo.
pause
