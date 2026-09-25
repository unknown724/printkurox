@echo off
:: Run as Administrator to restart the PrintKurox WhatsApp Bot Windows Service
set NSSM=C:\Users\Richard Konsam\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe
set SERVICE_NAME=PrintKuroxWhatsAppBot

echo [1/2] Restarting %SERVICE_NAME%...
"%NSSM%" restart %SERVICE_NAME%
timeout /t 2 /nobreak >nul

echo [2/2] Checking service status...
"%NSSM%" status %SERVICE_NAME%
echo.
echo PrintKurox WhatsApp Bot restarted with updated code!
pause
