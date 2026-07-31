# easy-tuning.ps1 - Skrip Remote Tuning Linux Produksi Absenta
# Berfungsi melakukan tuning kernel sysctl, limit file, Docker, & waktu secara remote via SSH

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "tuning-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
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

Show-Header "TUNING KERNEL & SISTEM LINUX PRODUKSI (REMOTE)"
Write-Host "Script ini akan melakukan tuning kernel sysctl, file descriptor limits,"
Write-Host "Docker log-rotation, serta sinkronisasi waktu NTP untuk skenario On-Premise & SaaS." -ForegroundColor Green
Write-Host "----------------------------------------------------------"

$TARGET_IP = (Read-Host "Masukkan IP VPS Target [Default: 10.10.10.99]").Trim()
if ([string]::IsNullOrWhiteSpace($TARGET_IP)) { $TARGET_IP = "10.10.10.99" }

$TARGET_USER = "asepsuryadi"

Write-Host "Pilih SSH Key untuk VPS tersebut:"
Write-Host " 1) nginxonly.pem"
Write-Host " 2) ls-key.pem"
Write-Host " 3) Input path file manual..."
$keyChoice = Read-Host "Pilih opsi [1-3] (Default: 1)"

$KEY_FILE = ""
if ([string]::IsNullOrWhiteSpace($keyChoice) -or $keyChoice -eq "1") { $KEY_FILE = Join-Path $PSScriptRoot "nginxonly.pem" }
elseif ($keyChoice -eq "2") { $KEY_FILE = Join-Path $PSScriptRoot "ls-key.pem" }
elseif ($keyChoice -eq "3") { $KEY_FILE = (Read-Host "Masukkan path absolut file .pem").Trim() }
else { throw "Pilihan key tidak valid." }

if (-not (Test-Path $KEY_FILE)) {
    throw "SSH Key tidak ditemukan di: $KEY_FILE"
}

$SUDO_PASS = (Read-Host "Masukkan password sudo VPS Anda [Default: 1]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "1" }

Write-Host "`nPilih Zona Waktu Server OS:" -ForegroundColor Yellow
Write-Host " 1) UTC (Standar SaaS Multi-Tenant Cloud)" -ForegroundColor White
Write-Host " 2) Asia/Jakarta (WIB - On-Premise Jawa/Sumatera)" -ForegroundColor White
Write-Host " 3) Asia/Makassar (WITA - Bali, Sulawesi, Kalsel, Kaltim, NTB, NTT)" -ForegroundColor White
Write-Host " 4) Asia/Jayapura (WIT - Papua, Maluku)" -ForegroundColor White
$tzChoice = Read-Host "Pilih zona waktu [1-4] (Default: 1 - UTC)"

$CHOSEN_TZ = "UTC"
if ($tzChoice -eq "2") { $CHOSEN_TZ = "Asia/Jakarta" }
elseif ($tzChoice -eq "3") { $CHOSEN_TZ = "Asia/Makassar" }
elseif ($tzChoice -eq "4") { $CHOSEN_TZ = "Asia/Jayapura" }

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_KEY = Join-Path $env:TEMP "safe-tuning-key.pem"
Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $KEY_FILE | Set-Content -Path $SAFE_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_KEY -AclObject $acl

Show-Log "Menghubungkan ke VPS ($TARGET_IP) untuk tuning sistem..."

$tuningScriptPath = Join-Path $PSScriptRoot "setup-tuning.sh"
if (-not (Test-Path $tuningScriptPath)) {
    throw "Skrip setup-tuning.sh tidak ditemukan di $PSScriptRoot"
}

# 1. SCP berkas setup-tuning.sh ke /tmp/setup-tuning.sh di VPS
Show-Log "Menyalin skrip tuning ke VPS target..."
$localScriptPath = "$env:TEMP\setup-tuning-temp.sh"
$scriptContent = Get-Content -Path $tuningScriptPath -Raw
$scriptContent = $scriptContent -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($localScriptPath, $scriptContent)

& scp -i "$SAFE_KEY" -o StrictHostKeyChecking=no "$localScriptPath" "${TARGET_USER}@${TARGET_IP}:/tmp/setup-tuning.sh"
if ($LASTEXITCODE -ne 0) {
    throw "Gagal menyalin berkas setup-tuning.sh ke VPS target."
}

# 2. Jalankan secara remote menggunakan sudo
Show-Log "Menjalankan skrip tuning produksi ($CHOSEN_TZ) di VPS..."
& ssh -i "$SAFE_KEY" -o StrictHostKeyChecking=no "${TARGET_USER}@${TARGET_IP}" "echo '$SUDO_PASS' | sudo -S bash /tmp/setup-tuning.sh $CHOSEN_TZ"
if ($LASTEXITCODE -ne 0) {
    throw "Eksekusi script remote gagal dengan Exit Code $LASTEXITCODE"
}

Show-Header "TUNING SISTEM SELESAI"
Show-Log "Tuning Kernel & System Linux Produksi berhasil diterapkan secara remote!" "Green"
Write-Host ""
Write-Host "Seluruh jalannya proses ini telah dicatat di berkas log:" -ForegroundColor Yellow
Write-Host " -> $LOG_FILE" -ForegroundColor Cyan
Write-Host ""
Stop-Transcript
Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
