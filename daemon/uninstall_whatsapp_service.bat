@echo off
setlocal
set SERVICE_NAME=PrintKuroxWhatsAppBot

for /f "tokens=*" %%i in ('where nssm 2^>nul') do set NSSM_PATH=%%i
if not defined NSSM_PATH (
    if exist "C:\ProgramData\chocolatey\bin\nssm.exe" set NSSM_PATH=C:\ProgramData\chocolatey\bin\nssm.exe
    if exist "C:\nssm\nssm.exe" set NSSM_PATH=C:\nssm\nssm.exe
)
if not defined NSSM_PATH set NSSM_PATH=nssm

echo [INFO] Stopping %SERVICE_NAME%...
"%NSSM_PATH%" stop %SERVICE_NAME% 2>nul
echo [INFO] Removing %SERVICE_NAME%...
"%NSSM_PATH%" remove %SERVICE_NAME% confirm 2>nul
echo [SUCCESS] Service %SERVICE_NAME% removed successfully.
pause
