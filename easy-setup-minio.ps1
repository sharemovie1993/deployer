# ==============================================================================
# Script Otomasi PowerShell 1-Click Install MinIO S3 Storage Server (Linux VM)
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

$LOG_FILE = "$PSScriptRoot\minio-setup-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force | Out-Null

Show-Header "PEMASANGAN MINIO SELF-HOSTED S3 SERVER DI LINUX VM"
Write-Host "Script ini akan memasang MinIO Server & MinIO Client (mc) di Linux VM:"
Write-Host "- Menggunakan offline binary dari deployer/minio-bin (Instan & tanpa kuota)"
Write-Host "- Konfigurasi systemd daemon auto-start on boot"
Write-Host "- Inisialisasi otomatis bucket 'absenta-platform-backups' & 'absenta-storage'"
Write-Host "- Port 9000 (API S3) & Port 9001 (Web Console GUI)"
Write-Host "----------------------------------------------------------"

$TARGET_IP = (Read-Host "Masukkan IP Linux VM Target (Contoh: 10.10.10.251)").Trim()
if ([string]::IsNullOrWhiteSpace($TARGET_IP)) {
    throw "IP VM Target tidak boleh kosong."
}

$TARGET_USER = (Read-Host "Masukkan SSH Username [default: root]").Trim()
if ([string]::IsNullOrWhiteSpace($TARGET_USER)) {
    $TARGET_USER = "root"
}

$MINIO_USER = (Read-Host "Masukkan MinIO Root Username [default: minioadmin]").Trim()
if ([string]::IsNullOrWhiteSpace($MINIO_USER)) {
    $MINIO_USER = "minioadmin"
}

$MINIO_PASS = (Read-Host "Masukkan MinIO Root Password [default: minioadmin]").Trim()
if ([string]::IsNullOrWhiteSpace($MINIO_PASS)) {
    $MINIO_PASS = "minioadmin"
}

Write-Host "`nPilih Metode Otentikasi SSH:"
Write-Host " 1) Password SSH biasa"
Write-Host " 2) SSH Key (.pem) - ls-key.pem"
Write-Host " 3) SSH Key (.pem) - nginxonly.pem"
Write-Host " 4) Input path SSH Key manual..."
$authChoice = (Read-Host "Pilih opsi [1-4, default: 1]").Trim()
if ([string]::IsNullOrWhiteSpace($authChoice)) { $authChoice = "1" }

$USE_KEY = $false
$KEY_FILE = ""

if ($authChoice -eq "2") {
    $USE_KEY = $true
    $KEY_FILE = Join-Path $PSScriptRoot "ls-key.pem"
} elseif ($authChoice -eq "3") {
    $USE_KEY = $true
    $KEY_FILE = Join-Path $PSScriptRoot "nginxonly.pem"
} elseif ($authChoice -eq "4") {
    $USE_KEY = $true
    $KEY_FILE = (Read-Host "Masukkan path absolut file .pem").Trim()
}

$SSH_PREFIX = ""
$SCP_PREFIX = ""
if ($USE_KEY) {
    if (-not (Test-Path $KEY_FILE)) {
        throw "SSH Key tidak ditemukan di: $KEY_FILE"
    }
    $SAFE_KEY = Join-Path $env:TEMP "safe-minio-key.pem"
    Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
    Get-Content -Path $KEY_FILE | Set-Content -Path $SAFE_KEY
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -Path $SAFE_KEY -AclObject $acl

    $SSH_PREFIX = "-i `"$SAFE_KEY`""
    $SCP_PREFIX = "-i `"$SAFE_KEY`""
}

# 1. Cek ketersediaan binary offline di deployer/minio-bin
$OFFLINE_MINIO = Join-Path $PSScriptRoot "minio-bin\minio"
$OFFLINE_MC = Join-Path $PSScriptRoot "minio-bin\mc"

if ((Test-Path $OFFLINE_MINIO) -and (Test-Path $OFFLINE_MC)) {
    Show-Log "Mengunggah paket binary MinIO offline ke VM ($TARGET_IP)..." "Yellow"
    if ($USE_KEY) {
        & scp -i "$SAFE_KEY" -o StrictHostKeyChecking=no "$OFFLINE_MINIO" "${TARGET_USER}@${TARGET_IP}:/tmp/minio_offline"
        & scp -i "$SAFE_KEY" -o StrictHostKeyChecking=no "$OFFLINE_MC" "${TARGET_USER}@${TARGET_IP}:/tmp/mc_offline"
    } else {
        & scp -o StrictHostKeyChecking=no "$OFFLINE_MINIO" "${TARGET_USER}@${TARGET_IP}:/tmp/minio_offline"
        & scp -o StrictHostKeyChecking=no "$OFFLINE_MC" "${TARGET_USER}@${TARGET_IP}:/tmp/mc_offline"
    }
    Show-Log "Binary offline MinIO berhasil diunggah." "Green"
}

# 2. Unggah script setup-minio.sh
Show-Log "Mengunggah script setup-minio.sh ke VM..."
$LOCAL_SETUP = Join-Path $PSScriptRoot "setup-minio.sh"
if ($USE_KEY) {
    & scp -i "$SAFE_KEY" -o StrictHostKeyChecking=no "$LOCAL_SETUP" "${TARGET_USER}@${TARGET_IP}:/tmp/setup-minio.sh"
} else {
    & scp -o StrictHostKeyChecking=no "$LOCAL_SETUP" "${TARGET_USER}@${TARGET_IP}:/tmp/setup-minio.sh"
}

# 3. Eksekusi remote setup
Show-Log "Mengeksekusi instalasi MinIO di remote Linux VM ($TARGET_IP)..." "Yellow"
$ENV_VARS = "MINIO_ROOT_USER='$MINIO_USER' MINIO_ROOT_PASSWORD='$MINIO_PASS' S3_BUCKET='absenta-platform-backups'"

if ($USE_KEY) {
    & ssh -i "$SAFE_KEY" -o StrictHostKeyChecking=no -t "${TARGET_USER}@${TARGET_IP}" "sudo env $ENV_VARS bash /tmp/setup-minio.sh"
} else {
    & ssh -o StrictHostKeyChecking=no -t "${TARGET_USER}@${TARGET_IP}" "sudo env $ENV_VARS bash /tmp/setup-minio.sh"
}

if ($USE_KEY -and (Test-Path $SAFE_KEY)) {
    Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
}

Stop-Transcript | Out-Null
Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "🎉 INSTALASI MINIO SERVER DI VM BERHASIL!" -ForegroundColor Green -Bold
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Informasi Akses Server VM Baru ($TARGET_IP):"
Write-Host "  - S3 API Endpoint : http://${TARGET_IP}:9000" -ForegroundColor Yellow
Write-Host "  - Web Console GUI : http://${TARGET_IP}:9001" -ForegroundColor Yellow
Write-Host "  - Access Key      : $MINIO_USER"
Write-Host "  - Secret Key      : $MINIO_PASS"
Write-Host "  - Bucket          : absenta-platform-backups"
Write-Host "----------------------------------------------------------"
Write-Host "👉 Sekarang Anda dapat memasukkan URL di atas ke GUI"
Write-Host "   '/superadmin/backups' -> 'Replikasi Storage'!" -ForegroundColor Cyan
Write-Host "==========================================================`n"
