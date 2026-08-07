# easy-resize.ps1 - Skrip Pelebaran Partisi Disk Linux VPS Jarak Jauh
# Berfungsi melebarkan partisi root (/) secara remote via SSH

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "resize-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force | Out-Null

function Show-Log {
    param ([string]$Message, $Color = "Cyan")
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

Show-Header "PELEBARAN DISK SERVER LINUX (REMOTE)"
Write-Host "Script ini akan melebarkan partisi root (/) agar mengenali kapasitas disk baru."
Write-Host "Berguna setelah Anda meng-expand ukuran disk di pengaturan VM/Hypervisor." -ForegroundColor Green
Write-Host "----------------------------------------------------------"

$TARGET_IP = (Read-Host "Masukkan IP VPS Target (Contoh: 10.10.10.163)").Trim()
$TARGET_USER = "asepsuryadi"

if ([string]::IsNullOrWhiteSpace($TARGET_IP)) {
    Write-Host "Error: IP Target tidak boleh kosong!" -ForegroundColor Red
    Stop-Transcript
    exit
}

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

$SUDO_PASS = (Read-Host "Masukkan password sudo VPS Anda [g1g1G1NGSUL*!2]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "g1g1G1NGSUL*!2" }

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_KEY = Join-Path $env:TEMP "safe-resize-key.pem"
Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $KEY_FILE | Set-Content -Path $SAFE_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_KEY -AclObject $acl

Show-Log "Menghubungkan ke VPS ($TARGET_IP) untuk proses resize disk..."

$resizeScriptPath = Join-Path $PSScriptRoot "setup-resize.sh"
if (-not (Test-Path $resizeScriptPath)) {
    throw "Skrip setup-resize.sh tidak ditemukan di $PSScriptRoot"
}

# 1. SCP berkas setup-resize.sh ke VPS
Show-Log "Menyalin skrip resize disk ke VPS..."
$localScriptPath = "$env:TEMP\setup-resize-temp.sh"
$scriptContent = Get-Content -Path $resizeScriptPath -Raw
$scriptContent = $scriptContent -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($localScriptPath, $scriptContent)

& scp -i "$SAFE_KEY" -o StrictHostKeyChecking=no "$localScriptPath" "${TARGET_USER}@${TARGET_IP}:/tmp/setup-resize.sh"
if ($LASTEXITCODE -ne 0) {
    throw "Gagal menyalin berkas setup-resize.sh ke VPS target."
}

# 2. Jalankan secara remote menggunakan sudo
Show-Log "Menjalankan skrip resize di VPS..."
& ssh -i "$SAFE_KEY" -o StrictHostKeyChecking=no "${TARGET_USER}@${TARGET_IP}" "echo '$SUDO_PASS' | sudo -S bash /tmp/setup-resize.sh"
if ($LASTEXITCODE -ne 0) {
    throw "Eksekusi script remote gagal dengan Exit Code $LASTEXITCODE"
}

Show-Header "RESIZE DISK SELESAI"
Show-Log "Pelebaran partisi disk berhasil diselesaikan!" "Green"
Write-Host ""
Write-Host "Seluruh jalannya proses ini telah dicatat di berkas log:" -ForegroundColor Yellow
Write-Host " -> $LOG_FILE" -ForegroundColor Cyan
Write-Host ""
Stop-Transcript
Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
