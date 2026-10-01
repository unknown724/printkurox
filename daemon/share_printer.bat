@echo off
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo Requesting Administrator privileges to share printer...
    powershell -Command "Start-Process cmd -ArgumentList '/c %~fnx0' -Verb RunAs"
    exit /b
)

echo Enabling Printer Sharing for EPSON L3210 Series...
powershell -NoProfile -Command "Set-Printer -Name 'EPSON L3210 Series' -Shared 1 -ShareName 'EPSON_Hostel'"
if %errorLevel% EQU 0 (
    echo [SUCCESS] EPSON L3210 Series is now shared as 'EPSON_Hostel' across local network!
) else (
    echo [ERROR] Failed to share printer.
)
timeout /t 5
