@echo off
echo ============================================================
echo   Connecting to Roommate Shared EPSON L3210 Printer...
echo ============================================================

:: 1. Save Windows Network Credentials
cmdkey /add:DESKTOP-TRKVJQ2 /user:Roommate /pass:PrintRoommate#29
cmdkey /add:172.17.2.232 /user:Roommate /pass:PrintRoommate#29

:: 2. Map and Install the Shared Printer
echo Installing network printer...
rundll32 printui.dll,PrintUIEntry /in /n "\\DESKTOP-TRKVJQ2\EPSON_Hostel"
if %errorLevel% EQU 0 (
    echo.
    echo [SUCCESS] Printer connected! You can now print directly using Ctrl + P.
) else (
    echo [INFO] Trying direct IP path...
    rundll32 printui.dll,PrintUIEntry /in /n "\\172.17.2.232\EPSON_Hostel"
)

echo.
pause
