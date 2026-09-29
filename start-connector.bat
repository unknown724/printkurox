@echo off
cd /d "%~dp0"
echo Starting PrintKurox Setup...
start "" pythonw setup_wizard.py
exit
