@echo off
setlocal EnableDelayedExpansion
title PrintKurox -- Wi-Fi Auto-Connect Optimizer (BLOCK-B)
color 0A

echo ===============================================================================
echo            PRINTKUROX HOSTEL STATION -- WI-FI AUTO-CONNECT FIX
echo ===============================================================================
echo Target Wi-Fi SSID / Profile: BLOCK-B
echo.

:: 1. Remove duplicate/corrupted profile if present
echo [1/5] Removing conflicting or duplicate profiles...
netsh wlan delete profile name="BLOCK-B 2" >nul 2>&1

:: 2. Set BLOCK-B to Priority 1
echo [2/5] Setting BLOCK-B profile priority to 1 (Highest Priority)...
netsh wlan set profileorder name="BLOCK-B" interface="Wi-Fi" priority=1
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Could not set profile order. Ensuring profile exists...
)

:: 3. Configure Auto-Connect mode
echo [3/5] Setting Connection Mode to AUTOMATIC...
netsh wlan set profileparameter name="BLOCK-B" connectionmode=auto

:: 4. Force Windows to actively search even if beacon is delayed
echo [4/5] Enabling active network search (nonBroadcast=yes)...
netsh wlan set profileparameter name="BLOCK-B" nonBroadcast=yes

:: 5. Set network cost to unrestricted
echo [5/5] Setting connection to Unrestricted (Disable metered throttling)...
netsh wlan set profileparameter name="BLOCK-B" cost=Unrestricted

echo.
echo Attempting immediate connection to BLOCK-B...
netsh wlan connect name="BLOCK-B"

echo.
echo ===============================================================================
echo [SUCCESS] Wi-Fi BLOCK-B is configured to connect automatically on PC boot!
echo ===============================================================================
pause
