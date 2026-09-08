@echo off
title PrintKurox — Windows Print Daemon
color 0b
echo ===================================================
echo        PrintKurox — Shop Laptop Print Daemon
echo ===================================================
echo Starting print polling engine...
echo.

python printer_daemon.py

if errorlevel 1 (
    echo.
    echo Daemon stopped with an error. Press any key to restart or close.
    pause
)
