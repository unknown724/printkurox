@echo off
title Restart PrintKurox Daemon
echo ============================================================
echo         Restarting PrintKurox Windows Print Daemon
echo ============================================================
echo.
echo Requesting administrator privilege to reload daemon...
powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command Restart-Service PrintKuroxDaemon; Write-Host \"`n[SUCCESS] PrintKurox Daemon restarted with latest code!\" -ForegroundColor Green; Start-Sleep -Seconds 3'"
echo Done! You can close this window.
