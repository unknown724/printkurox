@echo off
cd /d "%~dp0"
title PrintKurox Daemon
echo Starting PrintKurox Cloud Printer Daemon...
python -u printer_daemon.py
pause
