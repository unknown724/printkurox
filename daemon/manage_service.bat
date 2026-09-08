@echo off
setlocal
set SERVICE_NAME=PrintKuroxDaemon
set DAEMON_DIR=%~dp0

:MENU
cls
echo ============================================================
echo         PrintKurox Daemon — Service Manager
echo ============================================================
echo.
for /f "tokens=3" %%s in ('sc query %SERVICE_NAME% ^| findstr "STATE"') do set STATE=%%s
echo  Current Status: %STATE%
echo.
echo  [1] Start daemon
echo  [2] Stop daemon
echo  [3] Restart daemon
echo  [4] View live logs (stdout)
echo  [5] View live logs (errors)
echo  [6] Uninstall service
echo  [7] Exit
echo.
set /p CHOICE=Choose an option: 

if "%CHOICE%"=="1" (
    nssm start %SERVICE_NAME%
    pause
    goto MENU
)
if "%CHOICE%"=="2" (
    nssm stop %SERVICE_NAME%
    pause
    goto MENU
)
if "%CHOICE%"=="3" (
    nssm restart %SERVICE_NAME%
    pause
    goto MENU
)
if "%CHOICE%"=="4" (
    echo Tailing stdout log... Press Ctrl+C to stop.
    powershell -Command "Get-Content '%DAEMON_DIR%logs\daemon_stdout.log' -Wait -Tail 40"
    goto MENU
)
if "%CHOICE%"=="5" (
    echo Tailing stderr log... Press Ctrl+C to stop.
    powershell -Command "Get-Content '%DAEMON_DIR%logs\daemon_stderr.log' -Wait -Tail 40"
    goto MENU
)
if "%CHOICE%"=="6" (
    nssm stop %SERVICE_NAME%
    nssm remove %SERVICE_NAME% confirm
    echo Service removed.
    pause
    goto MENU
)
if "%CHOICE%"=="7" exit /b

goto MENU
