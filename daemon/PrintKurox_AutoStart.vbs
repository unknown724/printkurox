Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Locate pythonw cleanly
pywExe = "pythonw.exe"
userPyw = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Python\Python313\pythonw.exe"
If FSO.FileExists(userPyw) Then
    pywExe = """" & userPyw & """"
End If

If FSO.FileExists(scriptDir & "\station_keepalive.py") Then
    WshShell.Run pywExe & " -u """ & scriptDir & "\station_keepalive.py""", 0, False
End If

If FSO.FileExists(scriptDir & "\printer_daemon.py") Then
    WshShell.Run pywExe & " -u """ & scriptDir & "\printer_daemon.py""", 0, False
End If

If FSO.FileExists(scriptDir & "\whatsapp_bot\whatsapp_bot.js") Then
    WshShell.Run "node """ & scriptDir & "\whatsapp_bot\whatsapp_bot.js""", 0, False
End If
