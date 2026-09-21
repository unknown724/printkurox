Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
WshShell.Run "python -u printer_daemon.py", 0, False
WshShell.Run "node """ & scriptDir & "\whatsapp_bot\whatsapp_bot.js""", 0, False
