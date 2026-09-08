@echo off
:: Run this as Administrator to fix the PrintKurox service
setlocal

set NSSM=C:\Users\Richard Konsam\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe
set PYTHON=C:\Users\Richard Konsam\AppData\Local\Programs\Python\Python313\python.exe
set DAEMON_DIR=C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\daemon
set DAEMON_SCRIPT=C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\daemon\printer_daemon.py
set LOG_DIR=C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\daemon\logs
set SERVICE_NAME=PrintKuroxDaemon

echo [1/6] Stopping service...
"%NSSM%" stop %SERVICE_NAME% 2>nul
timeout /t 2 /nobreak >nul

echo [2/6] Fixing Python path (real python, not WindowsApps stub)...
"%NSSM%" set %SERVICE_NAME% Application "%PYTHON%"

echo [3/6] Fixing AppDirectory...
"%NSSM%" set %SERVICE_NAME% AppDirectory "%DAEMON_DIR%"

echo [4/6] Fixing script arguments...
"%NSSM%" set %SERVICE_NAME% AppParameters "-u \"%DAEMON_SCRIPT%\""

echo [5/6] Ensuring logs directory exists...
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
"%NSSM%" set %SERVICE_NAME% AppStdout "%LOG_DIR%\daemon_stdout.log"
"%NSSM%" set %SERVICE_NAME% AppStderr "%LOG_DIR%\daemon_stderr.log"

echo [6/6] Starting service...
"%NSSM%" start %SERVICE_NAME%
timeout /t 3 /nobreak >nul

echo.
echo === Service Status ===
"%NSSM%" status %SERVICE_NAME%
echo.
echo If status shows SERVICE_RUNNING — you are done! 
echo The daemon now runs 24/7 in background without any terminal.
echo.
echo Logs are at: %LOG_DIR%\
pause
