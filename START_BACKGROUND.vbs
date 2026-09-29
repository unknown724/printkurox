Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

' Launch connector.exe or printer_daemon.py silently with ZERO console popup (WindowStyle = 0)
If fso.FileExists(strPath & "\connector.exe") Then
    WshShell.Run """" & strPath & "\connector.exe""", 0, False
ElseIf fso.FileExists(strPath & "\daemon\printer_daemon.py") Then
    WshShell.Run "pythonw.exe """ & strPath & "\daemon\printer_daemon.py""", 0, False
ElseIf fso.FileExists(strPath & "\START_PRINTKUROX.bat") Then
    WshShell.Run """" & strPath & "\START_PRINTKUROX.bat""", 0, False
End If
