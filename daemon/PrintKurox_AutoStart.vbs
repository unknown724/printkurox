Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

q = Chr(34)

userPyw = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Python\Python313\pythonw.exe"
If FSO.FileExists(userPyw) Then
    pyw = userPyw
Else
    pyw = "pythonw.exe"
End If

If FSO.FileExists(scriptDir & "\station_keepalive.py") Then
    WshShell.Run "%COMSPEC% /c start """" """ & pyw & """ """ & scriptDir & "\station_keepalive.py""", 0, False
End If

If FSO.FileExists(scriptDir & "\printer_daemon.py") Then
    WshShell.Run "%COMSPEC% /c start """" """ & pyw & """ """ & scriptDir & "\printer_daemon.py""", 0, False
End If

If FSO.FileExists(scriptDir & "\whatsapp_bot\whatsapp_bot.js") Then
    WshShell.Run "node " & q & scriptDir & "\whatsapp_bot\whatsapp_bot.js" & q, 0, False
End If
