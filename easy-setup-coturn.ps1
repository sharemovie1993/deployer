# ==============================================================================
# Script Otomasi PowerShell 1-Click Install Coturn STUN/TURN Relay Server
# ==============================================================================
$ErrorActionPreference = "Stop"

function Show-Log {
    param ($Message, $Color = "Cyan")
    $Timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$Timestamp] $Message" -ForegroundColor $Color
}

function Show-Header {
    param ($Title)
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "      $Title" -ForegroundColor Yellow -Bold
    Write-Host "==========================================================" -ForegroundColor Cyan
}

$LOG_FILE = "$PSScriptRoot\coturn-setup-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force | Out-Null

Show-Header "PEMASANGAN COTURN STUN/TURN RELAY SERVER (IDEMPOTENT)"
Write-Host "Script ini akan memasang dan mengkonfigurasi Coturn Server di VPS:"
Write-Host "- Menginstall paket coturn & mengaktifkan daemon Linux"
Write-Host "- Konfigurasi time-limited HMAC authentication secret"
Write-Host "- Membuka port firewall UFW (Port 3478, 5349, 49152-65535)"
Write-Host "- Menghasilkan environment config siap pakai untuk absenta_backend"
Write-Host "----------------------------------------------------------"

$TARGET_IP = (Read-Host "Masukkan IP VPS Target (Contoh: 103.129.148.127)").Trim()
$TARGET_USER = "asepsuryadi"

Write-Host "Pilih SSH Key untuk VPS tersebut:"
Write-Host " 1) nginxonly.pem"
Write-Host " 2) ls-key.pem"
Write-Host " 3) Input path file manual..."
$keyChoice = Read-Host "Pilih opsi [1-3]"

$KEY_FILE = ""
if ($keyChoice -eq "1") { $KEY_FILE = Join-Path $PSScriptRoot "nginxonly.pem" }
elseif ($keyChoice -eq "2") { $KEY_FILE = Join-Path $PSScriptRoot "ls-key.pem" }
elseif ($keyChoice -eq "3") { $KEY_FILE = (Read-Host "Masukkan path absolut file .pem").Trim() }
else { throw "Pilihan key tidak valid." }

if (-not (Test-Path $KEY_FILE)) {
    throw "SSH Key tidak ditemukan di: $KEY_FILE"
}

# Menyalin Key agar permissions aman di Windows
$SAFE_KEY = Join-Path $env:TEMP "safe-coturn-key.pem"
Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $KEY_FILE | Set-Content -Path $SAFE_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_KEY -AclObject $acl

Show-Log "Mengunggah script setup-coturn.sh ke VPS..."
$LOCAL_SETUP = Join-Path $PSScriptRoot "setup-coturn.sh"
& scp -i "$SAFE_KEY" -o StrictHostKeyChecking=no "$LOCAL_SETUP" "${TARGET_USER}@${TARGET_IP}:/tmp/setup-coturn.sh" 2>$null

Show-Log "Mengeksekusi instalasi Coturn di remote VPS ($TARGET_IP)..."
& ssh -i "$SAFE_KEY" -o StrictHostKeyChecking=no -t "${TARGET_USER}@${TARGET_IP}" "sudo bash /tmp/setup-coturn.sh"

Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
Stop-Transcript | Out-Null
Show-Log "Proses instalasi Coturn selesai dengan sukses!" "Green"
