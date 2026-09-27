$keyPath = "HKCU:\Software\Classes\*\shell\PrintToRoommateEpson"
New-Item -Path $keyPath -Force | Out-Null
Set-ItemProperty -Path $keyPath -Name "(Default)" -Value "Print to Roommate EPSON L3210"

$cmdPath = "$keyPath\command"
New-Item -Path $cmdPath -Force | Out-Null
$scriptPath = "C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\scripts\direct_print.js"
$cmdValue = "cmd.exe /c node `"$scriptPath`" `"%1`" & pause"
Set-ItemProperty -Path $cmdPath -Name "(Default)" -Value $cmdValue

Write-Output "SUCCESS: Right-click context menu installed!"
