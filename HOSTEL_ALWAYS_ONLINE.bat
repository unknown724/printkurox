@echo off
cd /d "%~dp0daemon"
if exist PrintKurox_AutoStart.vbs (
    start "" wscript.exe //B //Nologo "PrintKurox_AutoStart.vbs"
    exit /b 0
)
start "" pythonw station_keepalive.py
start "" pythonw printer_daemon.py
exit /b 0
