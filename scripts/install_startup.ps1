$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder 'PrintKurox_Roommate_Listener.lnk'
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)
$sc.TargetPath = 'wscript.exe'
$sc.Arguments = 'C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\scripts\run_listener_silent.vbs'
$sc.WorkingDirectory = 'C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint'
$sc.Save()
Write-Output "Startup shortcut created at: $shortcutPath"
