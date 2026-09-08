@echo off
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /Y "%~dp0PrintKurox_AutoStart.vbs" "%STARTUP_DIR%\"
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] PrintKurox Auto-Start installed successfully!
    echo The daemon will automatically launch in the background whenever Windows starts.
) else (
    echo [ERROR] Failed to install auto-start.
)
pause
