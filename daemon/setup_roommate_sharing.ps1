# =============================================================================
# PrintKurox Secure Roommate Printer Sharing Setup
# =============================================================================
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "     PrintKurox Secure Roommate Printer Sharing Setup       " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Create Local User for Roommate
$UserName = "Roommate"
$UserPass = "PrintRoommate#29"
$SecurePass = ConvertTo-SecureString $UserPass -AsPlainText -Force

if (-not (Get-LocalUser -Name $UserName -ErrorAction SilentlyContinue)) {
    New-LocalUser -Name $UserName -Password $SecurePass -Description "PrintKurox Authorized Roommate Account" -PasswordNeverExpires -UserMayNotChangePassword
    Write-Host "[SUCCESS] Created restricted local user: $UserName" -ForegroundColor Green
} else {
    Set-LocalUser -Name $UserName -Password $SecurePass
    Write-Host "[INFO] Local user $UserName exists. Password refreshed." -ForegroundColor Yellow
}

# 2. Enable File & Printer Sharing in Firewall
Write-Host "[INFO] Enabling File and Printer Sharing in Windows Firewall..." -ForegroundColor Yellow
Enable-NetFirewallRule -DisplayGroup "File and Printer Sharing" -ErrorAction SilentlyContinue

# 3. Share the EPSON Printer
Write-Host "[INFO] Sharing 'EPSON L3210 Series' as 'EPSON_Hostel'..." -ForegroundColor Yellow
Set-Printer -Name "EPSON L3210 Series" -Shared 1 -ShareName "EPSON_Hostel"
Write-Host "[SUCCESS] Printer successfully shared as 'EPSON_Hostel'!" -ForegroundColor Green

# 4. Display Connection Information
$IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like '*Wi-Fi*' -or $_.InterfaceAlias -like '*Ethernet*' } | Select-Object -First 1).IPAddress
$HostName = $env:COMPUTERNAME

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "             ROOMMATE CONNECTION CREDENTIALS                " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Share Path:      \\$HostName\EPSON_Hostel  OR  \\$IP\EPSON_Hostel" -ForegroundColor White
Write-Host "Username:        $UserName" -ForegroundColor White
Write-Host "Password:        $UserPass" -ForegroundColor White
Write-Host "Protection:      Password Protected (Strangers on hostel Wi-Fi cannot print)" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Cyan
