# easy-setup-ssh.ps1 - Skrip Registrasi SSH Key Jarak Jauh
# Berfungsi mendaftarkan public key nginxonly.pem ke VPS target agar bisa login tanpa password

$ErrorActionPreference = "Stop"

$LOG_FILE = "$PSScriptRoot\logs\ssh-setup-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
$LOG_DIR = Split-Path -Parent $LOG_FILE
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
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

Show-Header "REGISTRASI SSH KEY (REMOTE)"
Write-Host "Script ini akan mendaftarkan public key dari nginxonly.pem ke VPS target."
Write-Host "Agar Anda dapat melakukan deployment remote tanpa mengetik password terus-menerus." -ForegroundColor Green
Write-Host "----------------------------------------------------------"

$TARGET_IP = (Read-Host "Masukkan IP VPS Target (Contoh: 10.10.10.163)").Trim()
$TARGET_USER = "asepsuryadi"

if ([string]::IsNullOrWhiteSpace($TARGET_IP)) {
    Write-Host "Error: IP Target tidak boleh kosong!" -ForegroundColor Red
    Stop-Transcript
    exit
}

$KEY_FILE = Join-Path $PSScriptRoot "nginxonly.pem"
if (-not (Test-Path $KEY_FILE)) {
    throw "Kunci private nginxonly.pem tidak ditemukan di: $KEY_FILE"
}

# 1. Ekstrak Public Key dari nginxonly.pem secara lokal di Windows
Show-Log "Mengekstrak public key dari nginxonly.pem..."
$pubKey = (ssh-keygen -y -f "$KEY_FILE").Trim()
if ([string]::IsNullOrWhiteSpace($pubKey)) {
    throw "Gagal mengekstrak public key dari nginxonly.pem!"
}

# 2. Amankan permission SSH Key lokal di Windows agar tidak didecline OpenSSH
$SAFE_KEY = Join-Path $env:TEMP "safe-ssh-setup-key.pem"
Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $KEY_FILE | Set-Content -Path $SAFE_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_KEY -AclObject $acl

# 3. Jalankan perintah append remote
Show-Log "Menghubungkan ke VPS via password untuk mendaftarkan public key..."
Show-Log "Silakan masukkan password SSH VPS Anda saat diminta oleh sistem:" -ForegroundColor Yellow

$remoteCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$pubKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# Jalankan secara interaktif agar user bisa memasukkan password secara langsung
& ssh -o StrictHostKeyChecking=no "${TARGET_USER}@${TARGET_IP}" $remoteCmd

if ($LASTEXITCODE -ne 0) {
    throw "Registrasi SSH Key gagal. Pastikan password yang Anda masukkan benar."
}

Show-Header "REGISTRASI SSH KEY SELESAI"
Show-Log "Public key dari nginxonly.pem berhasil didaftarkan di VPS!" "Green"
Show-Log "Sekarang Anda dapat login dan mendeploy secara remote tanpa password menggunakan key tersebut." "Green"
Write-Host ""
Write-Host "Seluruh jalannya proses ini telah dicatat di berkas log:" -ForegroundColor Yellow
Write-Host " -> $LOG_FILE" -ForegroundColor Cyan
Write-Host ""
Stop-Transcript
Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
