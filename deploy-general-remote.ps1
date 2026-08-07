# deploy-general-remote.ps1 - Kerangka Skrip Deploy Proyek Umum (VPS Linux)
# Berfungsi sebagai template/skeleton deployer proyek standar (POS, Yatim, gform, dll.)

$ErrorActionPreference = "Stop"

function Show-Header {
    param([string]$Title)
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "             DEPLOYER - PROYEK UMUM LAINNYA (SKELETON WIZARD)             " -ForegroundColor Yellow
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " -> $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

Show-Header "Konfigurasi Koneksi VPS Target"
$NEW_IP = (Read-Host "Masukkan IP VPS Target").Trim()
$NEW_USER = "asepsuryadi"

if ([string]::IsNullOrWhiteSpace($NEW_IP)) {
    Write-Host "IP VPS tidak boleh kosong!" -ForegroundColor Red
    exit
}

$NEW_KEY_SOURCE = (Read-Host "Masukkan path SSH Key PEM [nginxonly.pem]").Trim()
if ([string]::IsNullOrWhiteSpace($NEW_KEY_SOURCE)) {
    $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "nginxonly.pem"
}

if (-not (Test-Path $NEW_KEY_SOURCE)) {
    Write-Host "Error: File SSH Key tidak ditemukan!" -ForegroundColor Red
    exit
}

$SUDO_PASS = (Read-Host "Masukkan password sudo VPS [g1g1G1NGSUL*!2]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "g1g1G1NGSUL*!2" }

# ============================================================
# FASE PARAMETER PROYEK UMUM
# ============================================================
Show-Header "Parameter Proyek Umum"
$PROJ_NAME = (Read-Host "Masukkan Nama Proyek (misal: Project Yatim)").Trim()
$REPO_URL = (Read-Host "Masukkan URL Git Repository (.git)").Trim()
$TARGET_SUBDIR = (Read-Host "Masukkan nama folder target (misal: project-yatim)").Trim()
$B_PORT = (Read-Host "Masukkan Port Aplikasi [3000]").Trim()
if ([string]::IsNullOrWhiteSpace($B_PORT)) { $B_PORT = "3000" }

if ([string]::IsNullOrWhiteSpace($PROJ_NAME) -or [string]::IsNullOrWhiteSpace($REPO_URL) -or [string]::IsNullOrWhiteSpace($TARGET_SUBDIR)) {
    Write-Host "Informasi proyek tidak boleh kosong!" -ForegroundColor Red
    exit
}

Write-Host "`n[KERANGKA DEPLOYER PROYEK UMUM]" -ForegroundColor Yellow
Write-Host "Script ini sedang berada dalam masa pengembangan (Skeleton mode)." -ForegroundColor Gray
Write-Host "Di masa mendatang, opsi ini akan men-deploy proyek '$PROJ_NAME' ke target folder '/var/www/$TARGET_SUBDIR' di VPS $NEW_IP." -ForegroundColor Gray
Write-Host "Proses mencakup:"
Write-Host " 1. Git clone/pull ke folder target"
Write-Host " 2. npm install dan build (jika NodeJS)"
Write-Host " 3. Register PM2 process & Caddyfile reverse proxy"
Write-Host ""
Write-Host "Tekan [ENTER] untuk kembali ke menu utama..."
Read-Host
