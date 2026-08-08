# easy-deploy.ps1 - Skrip Deploy Universal Remote (VPS Linux)
# Dapat men-deploy berbagai proyek web secara remote via SSH
# Fitur: Auto dpkg lock clearance, WireGuard, PM2, Caddy, dll

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "deploy-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Show-Header {
    param([string]$Title)
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "                EASY DEPLOY - UNIVERSAL REMOTE DEPLOYER                 " -ForegroundColor Yellow
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " -> $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

# ============================================================
# FUNGSI DPKG LOCK CLEARANCE (BARU)
# ============================================================
function Clear-DpkgLock {
    param(
        [string]$KeyPath,
        [string]$TargetUser,
        [string]$TargetIP,
        [string]$SudoPass
    )

    Show-Log "Memeriksa status dpkg lock..." "Yellow"

    $checkScript = @"
set +e  # Jangan berhenti jika ada error
echo "=== DPKG LOCK CHECK ==="

# Cek lock files
if [ -f /var/lib/dpkg/lock-frontend ]; then
    echo "Lock file found: /var/lib/dpkg/lock-frontend"
fi
if [ -f /var/lib/dpkg/lock ]; then
    echo "Lock file found: /var/lib/dpkg/lock"
fi
if [ -f /var/lib/apt/lists/lock ]; then
    echo "Lock file found: /var/lib/apt/lists/lock"
fi
if [ -f /var/cache/apt/archives/lock ]; then
    echo "Lock file found: /var/cache/apt/archives/lock"
fi

# Cek jika lock masih aktif (proses masih berjalan)
LOCK_PIDS=$(ps aux | awk '/apt-get|dpkg|aptitude/ && !/awk/ {print $2}' | tr '\n' ' ')
if [ -n "$LOCK_PIDS" ]; then
    echo "Proses apt/dpkg yang aktif: $LOCK_PIDS"
    echo "AKTIF"
else
    echo "Tidak ada proses apt/dpkg yang aktif."
    echo "TIDAK_AKTIF"
fi
"@

    $tempScript = "$env:TEMP\dpkg_check.sh"
    $checkScript | Out-File -FilePath $tempScript -Encoding utf8 -Force

    & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/dpkg_check.sh" 2>$null
    $checkResult = & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/dpkg_check.sh"
    Remove-Item $tempScript -Force -ErrorAction SilentlyContinue

    # Parse hasil - cek apakah ada kata AKTIF
    if ($checkResult -contains "AKTIF") {
        Show-Log "PERINGATAN: Dpkg lock terdeteksi aktif!" "Yellow"
        Show-Log "Mencoba membersihkan dpkg lock..." "Yellow"

        $clearScript = @"
set -e
echo '$SudoPass' | sudo -S rm -f /var/lib/dpkg/lock-frontend 2>/dev/null || true
echo '$SudoPass' | sudo -S rm -f /var/lib/dpkg/lock 2>/dev/null || true
echo '$SudoPass' | sudo -S rm -f /var/lib/apt/lists/lock 2>/dev/null || true
echo '$SudoPass' | sudo -S rm -f /var/cache/apt/archives/lock 2>/dev/null || true
echo '$SudoPass' | sudo -S rm -rf /var/lib/dpkg/*.old 2>/dev/null || true
echo '$SudoPass' | sudo -S dpkg --configure -a 2>/dev/null || true
echo "DPKG lock berhasil dibersihkan."
"@

        $tempClearScript = "$env:TEMP\dpkg_clear.sh"
        $clearScript | Out-File -FilePath $tempClearScript -Encoding utf8 -Force

        & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempClearScript" "${TargetUser}@${TargetIP}:/tmp/dpkg_clear.sh" 2>$null
        $clearResult = & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/dpkg_clear.sh"
        Remove-Item $tempClearScript -Force -ErrorAction SilentlyContinue

        Show-Log "Hasil: $clearResult" "Gray"

        if ($LASTEXITCODE -eq 0) {
            Show-Log "Dpkg lock clearance BERHASIL!" "Green"
            return $true
        } else {
            Show-Log "Dpkg lock clearance GAGAL!" "Red"
            return $false
        }
    } else {
        Show-Log "Dpkg lock tidak aktif, melanjutkan..." "Green"
        return $true
    }
}

# ============================================================
# FUNGSI CEK & KILL PROSES APT STUCK
# ============================================================
function Kill-AptProcesses {
    param(
        [string]$KeyPath,
        [string]$TargetUser,
        [string]$TargetIP,
        [string]$SudoPass
    )

    Show-Log "Memeriksa proses apt/dpkg yang stuck..." "Yellow"

    $killScript = @"
set -e
echo "=== KILL APT STUCK PROCESSES ==="

# Kill semua proses apt-get, dpkg, aptitude yang stuck
STUCK_PIDS=`$(ps aux | grep -E 'apt-get|dpkg|aptitude' | grep -v grep | awk '{print `$2}')
if [ -n "`$STUCK_PIDS" ]; then
    echo "Membunuh proses yang stuck: `$STUCK_PIDS"
    echo '$SudoPass' | sudo -S kill -9 `$STUCK_PIDS 2>/dev/null || true
    sleep 2
    echo "Proses berhasil dibunuh."
else
    echo "Tidak ada proses apt/dpkg yang stuck."
fi

# Verifikasi tidak ada proses yang masih stuck
REMAINING=`$(ps aux | grep -E 'apt-get|dpkg' | grep -v grep | wc -l)
if [ "`$REMAINING" -eq 0 ]; then
    echo "VERIFIED_CLEAN"
else
    echo "MASIH_TERSISA: `$REMAINING"
fi
"@

    $tempScript = "$env:TEMP\kill_apt.sh"
    $killScript | Out-File -FilePath $tempScript -Encoding utf8 -Force

    & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/kill_apt.sh" 2>$null
    $killResult = & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/kill_apt.sh"
    Remove-Item $tempScript -Force -ErrorAction SilentlyContinue

    if ($killResult -match "VERIFIED_CLEAN") {
        Show-Log "Semua proses apt yang stuck sudah dibunuh!" "Green"
        return $true
    } else {
        Show-Log "Masih ada proses apt yang aktif" "Yellow"
        return $false
    }
}

# ============================================================
# FUNGSI UTILITY: AUTO-CLEAR DPKG + APT LOCKS SEBELUM OPSI
# ============================================================
function Invoke-AutoFixAptLocks {
    param(
        [string]$KeyPath,
        [string]$TargetUser,
        [string]$TargetIP,
        [string]$SudoPass,
        [int]$MaxRetries = 3
    )

    for ($i = 1; $i -le $MaxRetries; $i++) {
        Show-Log "Upaya ke-$i dari $MaxRetries - Membersihkan apt locks..." "Yellow"

        # Step 1: Kill stuck processes
        $killed = Kill-AptProcesses -KeyPath $KeyPath -TargetUser $TargetUser -TargetIP $TargetIP -SudoPass $SudoPass

        # Step 2: Clear lock files
        $cleared = Clear-DpkgLock -KeyPath $KeyPath -TargetUser $TargetUser -TargetIP $TargetIP -SudoPass $SudoPass

        if ($killed -and $cleared) {
            Show-Log "Apt locks berhasil dibersihkan!" "Green"
            return $true
        }

        if ($i -lt $MaxRetries) {
            Show-Log "Mencoba lagi dalam 5 detik..." "Yellow"
            Start-Sleep -Seconds 5
        }
    }

    Show-Log "Gagal membersihkan apt locks setelah $MaxRetries percobaan." "Red"
    return $false
}

Show-Header "Persiapan Koneksi VPS Target"

$NEW_IP = (Read-Host "Masukkan IP VPS Target (Contoh: 103.196.155.87)").Trim()
$NEW_USER = "asepsuryadi"

if ([string]::IsNullOrWhiteSpace($NEW_IP)) {
    Write-Host "IP VPS Target tidak boleh kosong!" -ForegroundColor Red
    exit
}

Write-Host "Pilih SSH Key untuk VPS tersebut:"
Write-Host " 1) nginxonly.pem"
Write-Host " 2) ls-key.pem"
Write-Host " 3) Input path file manual..."
$newKeyChoice = Read-Host "Pilih [1-3]"
if ($newKeyChoice -eq "1") { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "nginxonly.pem" }
elseif ($newKeyChoice -eq "2") { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "ls-key.pem" }
else { $NEW_KEY_SOURCE = Read-Host "Masukkan path absolut file .pem" }

if (-not (Test-Path $NEW_KEY_SOURCE)) {
    Write-Host "Error: File SSH Key tidak ditemukan di '$NEW_KEY_SOURCE'" -ForegroundColor Red
    exit
}

$SUDO_PASS = (Read-Host "Masukkan password sudo VPS Anda [g1g1G1NGSUL*!2]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "g1g1G1NGSUL*!2" }

# ============================================================
# OPSI: CLEAR DPKG LOCK SEBELUM DEPLOY (JIKA DIPILIH)
# ============================================================
Write-Host ""
Write-Host "------------------------------------------------------------------------------"
Write-Host " PERHATIAN: Jika VPS pernah crash atau ada proses apt yang stuck," -ForegroundColor Yellow
Write-Host " Anda bisa membersihkan dpkg lock SEBELUM deploy dimulai." -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------"
Write-Host " 1) Lanjutkan ke Deploy (Default)"
Write-Host " 2) Bersihkan Dpkg/Apt Locks terlebih dahulu"
Write-Host " 3) Bersihkan + Lanjutkan Deploy"
$preDeployChoice = Read-Host "Pilih [1-3] (Default: 1)"

if ($preDeployChoice -eq "2" -or $preDeployChoice -eq "3") {
    Show-Header "Membersihkan Dpkg/Apt Locks"

    # Perbaiki permission SSH Key
    $SAFE_NEW_KEY = "$env:TEMP\new-deploy-key.pem"
    Remove-Item $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
    Get-Content -Path $NEW_KEY_SOURCE | Set-Content -Path $SAFE_NEW_KEY
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -Path $SAFE_NEW_KEY -AclObject $acl

    $fixed = Invoke-AutoFixAptLocks -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP -SudoPass $SUDO_PASS -MaxRetries 3

    if ($fixed) {
        Show-Log "VPS siap untuk deployment!" "Green"
    } else {
        Write-Host ""
        Write-Host "PERINGATAN: Gagal membersihkan apt locks sepenuhnya." -ForegroundColor Yellow
        Write-Host "Deployment masih bisa dicoba, tetapi mungkin gagal." -ForegroundColor Yellow
        $continue = Read-Host "Lanjutkan deployment? [y/N]"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-Host "Deployment dibatalkan." -ForegroundColor Red
            exit
        }
    }

    if ($preDeployChoice -eq "2") {
        Show-Log "Selesai. Dpkg locks sudah dibersihkan." "Green"
        Read-Host "Tekan ENTER untuk keluar..."
        exit
    }
}

# ---------------------------------------------------------
# PEMILIHAN PROYEK
# ---------------------------------------------------------
Show-Header "Pilih Proyek Yang Ingin Di-deploy"
Write-Host " 1) Server Lisensi (Licensing Server VPS)"
Write-Host " 2) Project Absenta (Full Stack)"
Write-Host " 3) Project Yatim (Mustahiq Care)"
Write-Host " 4) gform-orkestrator"
Write-Host " 5) Project-POS"
Write-Host " 6) Custom Git Repository"
Write-Host ""
$projChoice = Read-Host "Pilih proyek [1-6]"

$PROJ_NAME = ""
$REPO_URL = ""
$TARGET_SUBDIR = ""
$IS_ABSENTA = "False"
$IS_SERVER_LISENSI = "False"

switch ($projChoice) {
    "1" {
        $PROJ_NAME = "Server Lisensi"
        $REPO_URL = "https://github.com/sharemovie1993/server-lisensi.git"
        $TARGET_SUBDIR = "licensing-server"
        $IS_SERVER_LISENSI = "True"
    }
    "2" {
        $PROJ_NAME = "Project Absenta"
        $REPO_URL = "https://github.com/sharemovie1993/Project-Absenta.git"
        $TARGET_SUBDIR = "project-absenta"
        $IS_ABSENTA = "True"
    }
    "3" {
        $PROJ_NAME = "Project Yatim"
        $REPO_URL = "https://github.com/sharemovie1993/Project-Yatim.git"
        $TARGET_SUBDIR = "project-yatim"
    }
    "4" {
        $PROJ_NAME = "gform-orkestrator"
        $REPO_URL = "https://github.com/sharemovie1993/gform-orkestrator.git"
        $TARGET_SUBDIR = "gform-orkestrator"
    }
    "5" {
        $PROJ_NAME = "Project-POS"
        $REPO_URL = "https://github.com/sharemovie1993/Project-POS.git"
        $TARGET_SUBDIR = "project-pos"
    }
    "6" {
        $PROJ_NAME = (Read-Host "Masukkan Nama Proyek").Trim()
        $REPO_URL = (Read-Host "Masukkan URL Git Repository (.git)").Trim()
        $TARGET_SUBDIR = (Read-Host "Masukkan nama folder target (misal: my-app)").Trim()
    }
    default {
        Write-Host "Pilihan tidak valid, dibatalkan." -ForegroundColor Red
        exit
    }
}

if ([string]::IsNullOrWhiteSpace($PROJ_NAME) -or [string]::IsNullOrWhiteSpace($REPO_URL) -or [string]::IsNullOrWhiteSpace($TARGET_SUBDIR)) {
    Write-Host "Informasi proyek tidak boleh kosong!" -ForegroundColor Red
    exit
}

# ---------------------------------------------------------
# KONFIGURASI PARAMETER PROYEK
# ---------------------------------------------------------
Show-Header "Konfigurasi Proyek - $PROJ_NAME"

$B_PORT = "3000"
$F_PORT = "5000"
$LICENSE_KEY = ""
$CF_TOKEN = ""
$DB_URL = ""
$INSTALL_POSTGRES = "N"
$INSTALL_REDIS = "N"
$DEPLOY_SCENARIO = "hybrid"
$TUNNEL_BASE_DOMAIN = "absenta.id"
$LICENSE_SERVER_URL = "https://api.absenta.id"
$REDIS_URL = "redis://localhost:6379"
$NODE_NAME = "absenta-node-1"

if ($IS_SERVER_LISENSI -eq "True") {
    Write-Host "Menggunakan port default untuk Server Lisensi." -ForegroundColor Gray
    $TARGET_DOMAIN = (Read-Host "Masukkan Domain Server Lisensi (Contoh: absenta.id)").Trim()
    if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) { $TARGET_DOMAIN = "absenta.id" }
} elseif ($IS_ABSENTA -eq "True") {
    # ─── BAGIAN A: Jaringan, Port & SSL (Network & SSL) ──────────────────────────
    Write-Host "`n[BAGIAN A: Jaringan, Port & SSL]" -ForegroundColor Cyan
    Write-Host "Pilih Skenario Deployment:" -ForegroundColor White
    Write-Host " 1) SaaS / Cloud (Akses via Domain Publik, contoh: https://app.absenta.id)"
    Write-Host " 2) Hybrid (Lokal Sekolah + Caddy Proxy, contoh: http://10.10.10.163)"
    $scenarioChoice = Read-Host "Pilih [1-2] (Default: 1)"

    $DEPLOY_SCENARIO = "saas"
    if ($scenarioChoice -eq "2") {
        $DEPLOY_SCENARIO = "hybrid"
    }

    if ($DEPLOY_SCENARIO -eq "saas") {
        $TARGET_DOMAIN = (Read-Host "Masukkan Domain Utama Platform SaaS (Contoh: absenta.id)").Trim()
        if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) { $TARGET_DOMAIN = "absenta.id" }
    } else {
        $TARGET_DOMAIN = (Read-Host "Masukkan Domain Publik Akses Sekolah (Contoh: absen.smkn1.sch.id)").Trim()
        if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) { $TARGET_DOMAIN = "absenta.id" }
    }

    $B_PORT = (Read-Host "Masukkan Port Backend [3003]").Trim()
    if ([string]::IsNullOrWhiteSpace($B_PORT)) { $B_PORT = "3003" }

    $F_PORT = (Read-Host "Masukkan Port Frontend [5175]").Trim()
    if ([string]::IsNullOrWhiteSpace($F_PORT)) { $F_PORT = "5175" }

    $CF_TOKEN = ""
    if ($DEPLOY_SCENARIO -eq "saas" -or $DEPLOY_SCENARIO -eq "hybrid") {
        $CF_TOKEN = (Read-Host "Masukkan Cloudflare API Token (untuk DNS Challenge SSL, kosongkan jika tidak pakai)").Trim()
    }

    # ─── BAGIAN B: Database & Cache (Data Storage) ──────────────────────────────────
    Write-Host "`n[BAGIAN B: Database & Cache]" -ForegroundColor Cyan
    $defaultDb = "absensi"
    if ($IS_SERVER_LISENSI -eq "True") { $defaultDb = "orkestrator_licensing" }
    $DB_URL = (Read-Host "Masukkan DATABASE_URL PostgreSQL [postgresql://postgres:123123123@localhost:5432/$defaultDb]").Trim()
    if ([string]::IsNullOrWhiteSpace($DB_URL)) {
        $DB_URL = "postgresql://postgres:123123123@localhost:5432/$defaultDb"
    } else {
        if ($DB_URL.StartsWith("[")) { $DB_URL = $DB_URL.Substring(1) }
        if ($DB_URL.EndsWith("]")) { $DB_URL = $DB_URL.Substring(0, $DB_URL.Length - 1) }
    }

    $INSTALL_POSTGRES = (Read-Host "Apakah Anda ingin memasang PostgreSQL Server di VPS Linux secara otomatis? [y/N]").Trim()
    if ([string]::IsNullOrWhiteSpace($INSTALL_POSTGRES)) { $INSTALL_POSTGRES = "N" }

    $INSTALL_REDIS = (Read-Host "Apakah Anda ingin memasang Redis Server di VPS Linux secara otomatis? [y/N]").Trim()
    if ([string]::IsNullOrWhiteSpace($INSTALL_REDIS)) { $INSTALL_REDIS = "N" }

    $REDIS_URL = "redis://localhost:6379"
    if ($INSTALL_REDIS -eq "n" -or $INSTALL_REDIS -eq "N") {
        $REDIS_URL = (Read-Host "Masukkan REDIS_URL [redis://localhost:6379]").Trim()
        if ([string]::IsNullOrWhiteSpace($REDIS_URL)) { $REDIS_URL = "redis://localhost:6379" }
    }

    # ─── BAGIAN C: Lisensi & Tunnel (License & Integration) ─────────────────────────
    Write-Host "`n[BAGIAN C: Lisensi & Tunnel]" -ForegroundColor Cyan
    $LICENSE_KEY = (Read-Host "Masukkan Kunci Lisensi Absenta (Kosongkan jika belum ada)").Trim()

    $TUNNEL_BASE_DOMAIN = (Read-Host "Masukkan Base Domain Easy Tunnel [absenta.id]").Trim()
    if ([string]::IsNullOrWhiteSpace($TUNNEL_BASE_DOMAIN)) { $TUNNEL_BASE_DOMAIN = "absenta.id" }

    $LICENSE_SERVER_URL = (Read-Host "Masukkan URL Server Lisensi [https://api.absenta.id]").Trim()
    if ([string]::IsNullOrWhiteSpace($LICENSE_SERVER_URL)) { $LICENSE_SERVER_URL = "https://api.absenta.id" }

    # ─── BAGIAN D: Identitas Node (Node Identity) ───────────────────────────────
    Write-Host "`n[BAGIAN D: Identitas Node]" -ForegroundColor Cyan
    $NODE_NAME = (Read-Host "Masukkan Identitas Node (NODE_NAME) [node-$($NEW_IP.Replace('.', '-'))]").Trim()
    if ([string]::IsNullOrWhiteSpace($NODE_NAME)) { $NODE_NAME = "node-$($NEW_IP.Replace('.', '-'))" }
} else {
    $B_PORT = (Read-Host "Masukkan Port Aplikasi [3000]").Trim()
    if ([string]::IsNullOrWhiteSpace($B_PORT)) { $B_PORT = "3000" }
    $TARGET_DOMAIN = (Read-Host "Masukkan Domain untuk Proyek ini (Contoh: pos.absenta.id atau kosongkan untuk gunakan IP)").Trim()
    if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) { $TARGET_DOMAIN = $NEW_IP }
}

$SCHEME = "https"
if ($TARGET_DOMAIN -match "^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$") {
    $SCHEME = "http"
}
# Tentukan nilai URL sesuai skenario
$BACKEND_API_URL = "${SCHEME}://${TARGET_DOMAIN}/api"
$BACKEND_APP_URL = "${SCHEME}://${TARGET_DOMAIN}"
$BACKEND_FRONTEND_URL = "${SCHEME}://${TARGET_DOMAIN}"
$FRONTEND_API_BASE_URL = "/api"

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_NEW_KEY = "$env:TEMP\new-deploy-key.pem"
Remove-Item $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $NEW_KEY_SOURCE | Set-Content -Path $SAFE_NEW_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_NEW_KEY -AclObject $acl

function Run-RemoteScript {
    param([string]$ScriptContent, [string]$KeyPath, [string]$TargetUser, [string]$TargetIP)
    $tempScript = "$env:TEMP\remote_script.sh"
    $ScriptContent = $ScriptContent -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($tempScript, $ScriptContent)

    # Run SCP directly
    & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/remote_script.sh"
    if ($LASTEXITCODE -ne 0) {
        throw "Gagal menyalin script ke VPS menggunakan SCP."
    }

    # Run SSH directly
    & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/remote_script.sh"
    if ($LASTEXITCODE -ne 0) {
        throw "Eksekusi script remote gagal dengan Exit Code $LASTEXITCODE"
    }
}

# ============================================================
# FASE 0: AUTO FIX DPKG LOCK SEBELUM PROVISIONING
# ============================================================
Show-Header "FASE 0: CEK & FIX APT LOCKS"
Show-Log "Memeriksa kondisi apt/dpkg di VPS..." "Yellow"

$preCheckSuccess = $true
try {
    $preCheckSuccess = -not (Invoke-AutoFixAptLocks -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP -SudoPass $SUDO_PASS -MaxRetries 2)
} catch {
    Show-Log "Gagal melakukan pre-check apt locks: $_" "Yellow"
}

# ---------------------------------------------------------
# FASE 1: PROVISIONING SERVER
# ---------------------------------------------------------
Show-Header "FASE 1: PROVISIONING VPS TARGET"
Show-Log "Menghubungkan ke VPS ($NEW_IP) untuk instalasi dependensi..." "Yellow"

$DB_NAME = "absensi"
try {
    $cleanDbUrl = $DB_URL
    if ($cleanDbUrl.StartsWith("[")) { $cleanDbUrl = $cleanDbUrl.Substring(1) }
    if ($cleanDbUrl.EndsWith("]")) { $cleanDbUrl = $cleanDbUrl.Substring(0, $cleanDbUrl.Length - 1) }
    $uri = [System.Uri]$cleanDbUrl
    $parsedDbName = $uri.AbsolutePath.TrimStart('/')
    if ($parsedDbName -match "^([^?#/]+)") {
        $parsedDbName = $Matches[1]
    }
    if ($parsedDbName) {
        $DB_NAME = $parsedDbName
    }
} catch {}

$provisionScript = @"
set -e
# Auto-fix dpkg lock sebelum apt-get
echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock-frontend 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S rm -f /var/lib/apt/lists/lock 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S rm -f /var/cache/apt/archives/lock 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S dpkg --configure -a 2>/dev/null || true

echo '$SUDO_PASS' | sudo -S apt-get update -y || {
    echo "APT UPDATE GAGAL - Mencoba fix dan retry..."
    echo '$SUDO_PASS' | sudo -S kill -9 `$(ps aux | grep -E 'apt|dpkg' | grep -v grep | awk '{print `$2}') 2>/dev/null || true
    sleep 2
    echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock-* /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S dpkg --configure -a
    echo '$SUDO_PASS' | sudo -S apt-get update -y
}
echo '$SUDO_PASS' | sudo -S apt-get install -y curl git tar ufw build-essential

# Install Node 20
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    echo '$SUDO_PASS' | sudo -S apt-get install -y nodejs
fi

# Install PM2
if ! command -v pm2 &>/dev/null; then
    echo '$SUDO_PASS' | sudo -S npm install -g pm2
fi

# Install Caddy
if [ -f /tmp/caddy_offline ]; then
    NEEDS_COPY=true
    if [ -f /usr/bin/caddy ]; then
        MD5_OFFLINE=`$(md5sum /tmp/caddy_offline | awk '{print `$1}')`
        MD5_INSTALLED=`$(md5sum /usr/bin/caddy | awk '{print `$1}')`
        if [ "$MD5_OFFLINE" = "$MD5_INSTALLED" ]; then
            echo "Caddy kustom offline sudah sama dengan yang terpasang. Melewati pembaruan binary."
            NEEDS_COPY=false
        fi
    fi

    if [ "$NEEDS_COPY" = "true" ]; then
        echo "Memasang Caddy menggunakan berkas kustom offline..."
        if ! command -v caddy &>/dev/null; then
            echo '$SUDO_PASS' | sudo -S apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
            curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg || true
            curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
            # FIX: Clear lock sebelum apt-get install
            echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null || true
            echo '$SUDO_PASS' | sudo -S dpkg --configure -a 2>/dev/null || true
            echo '$SUDO_PASS' | sudo -S apt-get update -y
            echo '$SUDO_PASS' | sudo -S apt-get install -y caddy
        fi
        echo '$SUDO_PASS' | sudo -S systemctl stop caddy || true
        echo '$SUDO_PASS' | sudo -S cp /tmp/caddy_offline /usr/bin/caddy
        echo '$SUDO_PASS' | sudo -S chmod +x /usr/bin/caddy
    fi
else
    if ! command -v caddy &>/dev/null; then
        echo '$SUDO_PASS' | sudo -S apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg || true
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
        # FIX: Clear lock sebelum apt-get install
        echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S dpkg --configure -a 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S apt-get update -y
        echo '$SUDO_PASS' | sudo -S apt-get install -y caddy
    fi
fi

# Buat Caddyfile placeholder dengan hak akses write
if [ ! -f /etc/caddy/Caddyfile ]; then
    echo '$SUDO_PASS' | sudo -S touch /etc/caddy/Caddyfile
fi
echo '$SUDO_PASS' | sudo -S chmod 666 /etc/caddy/Caddyfile

# Opsi Instalasi Database & Redis untuk Project Absenta
if [ "$IS_ABSENTA" = "True" ]; then
    if [[ "$INSTALL_POSTGRES" =~ ^[yY]$ ]]; then
        echo "Menginstal PostgreSQL secara lokal..."
        echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S apt-get install -y postgresql postgresql-contrib
        echo "Mengaktifkan dan menjalankan PostgreSQL..."
        echo '$SUDO_PASS' | sudo -S systemctl enable postgresql 2>/dev/null
        echo '$SUDO_PASS' | sudo -S systemctl start postgresql

        # Buat database & user postgres default jika belum ada
        echo "Mengonfigurasi database $DB_NAME dan user postgres..."
        cd / && echo '$SUDO_PASS' | sudo -u postgres psql -c "ALTER USER postgres PASSWORD '123123123';" || true
        if ! echo '$SUDO_PASS' | sudo -u postgres psql -t -A -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
            echo '$SUDO_PASS' | sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"
        fi
    fi

    if [[ "$INSTALL_REDIS" =~ ^[yY]$ ]]; then
        echo "Menginstal Redis Server secara lokal..."
        echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S apt-get install -y redis-server
        echo '$SUDO_PASS' | sudo -S systemctl enable redis-server 2>/dev/null
        echo '$SUDO_PASS' | sudo -S systemctl start redis-server
    fi
fi

# Opsi WireGuard untuk Server Lisensi dan Absenta (Easy Tunnel Built-in)
if [ "$IS_SERVER_LISENSI" = "True" ] || [ "$IS_ABSENTA" = "True" ]; then
    echo '$SUDO_PASS' | sudo -S apt-get install -y wireguard openresolv
    echo '$SUDO_PASS' | sudo -S sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf

    # Configure passwordless sudo for WireGuard
    echo "Mengonfigurasi passwordless sudo untuk WireGuard..."
    echo "$NEW_USER ALL=(ALL) NOPASSWD: /usr/bin/wg-quick, /usr/bin/wg, /usr/sbin/wg-quick, /usr/sbin/wg" > /tmp/90-wireguard
    echo '$SUDO_PASS' | sudo -S cp /tmp/90-wireguard /etc/sudoers.d/90-wireguard
    echo '$SUDO_PASS' | sudo -S chown root:root /etc/sudoers.d/90-wireguard
    echo '$SUDO_PASS' | sudo -S chmod 440 /etc/sudoers.d/90-wireguard
    rm -f /tmp/90-wireguard
fi

# Siapkan folder target
echo '$SUDO_PASS' | sudo -S mkdir -p /var/www/$TARGET_SUBDIR
echo '$SUDO_PASS' | sudo -S chown ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR
echo 'Provisioning dasar selesai.'
"@

$LOCAL_CADDY = Join-Path $PSScriptRoot "caddy-bin\caddy"
if (Test-Path $LOCAL_CADDY) {
    Show-Log "Menemukan Caddy Offline lokal. Menyalin ke VPS target..." "Yellow"
    & scp -i "$SAFE_NEW_KEY" -o StrictHostKeyChecking=no "$LOCAL_CADDY" "${NEW_USER}@${NEW_IP}:/tmp/caddy_offline"
}

Run-RemoteScript -ScriptContent $provisionScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP
Show-Log "Instalasi dependensi di VPS target selesai." "Green"

# ---------------------------------------------------------
# FASE 2: CLONE & SETUP ECOSYSTEM
# ---------------------------------------------------------
Show-Header "FASE 2: CLONE & SETUP ECOSYSTEM"
Show-Log "Melakukan clone repository dan konfigurasi project..." "Yellow"

$setupScript = @"
set -e

# 1. Setup Logging di VPS
mkdir -p /var/www/$TARGET_SUBDIR
exec > >(tee -a /tmp/deploy.log) 2>&1

echo "=== MEMULAI REMOTE DEPLOYMENT - $(date) ==="

# Hentikan PM2 dan Caddy terlebih dahulu agar proses redeployment bersih dan lancar
echo "Menghentikan PM2 daemon dan layanan web server Caddy..."
pm2 kill || true
echo '$SUDO_PASS' | sudo -S systemctl stop caddy || true

# 2. Kloning / Update Repo
if [ ! -d "/var/www/$TARGET_SUBDIR/.git" ]; then
    echo '$SUDO_PASS' | sudo -S rm -rf /var/www/$TARGET_SUBDIR || true
    echo '$SUDO_PASS' | sudo -S mkdir -p /var/www/$TARGET_SUBDIR
    echo '$SUDO_PASS' | sudo -S chown -R ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR
    git clone $REPO_URL /var/www/$TARGET_SUBDIR
else
    cd /var/www/$TARGET_SUBDIR
    git fetch origin
    git reset --hard origin/main || git reset --hard origin/master
fi

# 2. Setup Environment Variables & Build
if [ "$IS_ABSENTA" = "True" ]; then
    # deployment Absenta
    cd /var/www/project-absenta

    # Backend Setup
    cp absenta_backend/.env.example absenta_backend/.env || true

    # Mengganti baris kritis di backend .env
    sed -i "s|^PORT=.*|PORT=$B_PORT|g" absenta_backend/.env
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|g" absenta_backend/.env
    if grep -q "^NODE_NAME=" absenta_backend/.env; then
        sed -i "s|^NODE_NAME=.*|NODE_NAME=$NODE_NAME|g" absenta_backend/.env
    else
        echo "NODE_NAME=$NODE_NAME" >> absenta_backend/.env
    fi
    sed -i "s|^REDIS_MODE=.*|REDIS_MODE=single|g" absenta_backend/.env
    sed -i "s|^REDIS_URL=.*|REDIS_URL=$REDIS_URL|g" absenta_backend/.env
    sed -i "s|^LICENSE_SERVER_URL=.*|LICENSE_SERVER_URL=$LICENSE_SERVER_URL|g" absenta_backend/.env
    sed -i "s|^LICENSE_KEY=.*|LICENSE_KEY=$LICENSE_KEY|g" absenta_backend/.env
    sed -i "s|^EASY_TUNNEL_BASE_DOMAIN=.*|EASY_TUNNEL_BASE_DOMAIN=$TUNNEL_BASE_DOMAIN|g" absenta_backend/.env
    sed -i "s|^API_URL=.*|API_URL=$BACKEND_API_URL|g" absenta_backend/.env
    sed -i "s|^APP_URL=.*|APP_URL=$BACKEND_APP_URL|g" absenta_backend/.env
    sed -i "s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=$BACKEND_APP_URL|g" absenta_backend/.env
    sed -i "s|^PUBLIC_INVOICE_BASE_URL=.*|PUBLIC_INVOICE_BASE_URL=$BACKEND_APP_URL|g" absenta_backend/.env
    sed -i "s|^PUBLIC_APP_SCHEME=.*|PUBLIC_APP_SCHEME=$SCHEME|g" absenta_backend/.env
    sed -i "s|^PUBLIC_DOMAIN_BASE=.*|PUBLIC_DOMAIN_BASE=$TARGET_DOMAIN|g" absenta_backend/.env
    sed -i "s|^MAIN_DOMAIN=.*|MAIN_DOMAIN=$TARGET_DOMAIN|g" absenta_backend/.env
    sed -i "s|^TENANT_BASE_DOMAIN=.*|TENANT_BASE_DOMAIN=$TARGET_DOMAIN|g" absenta_backend/.env
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=$BACKEND_FRONTEND_URL|g" absenta_backend/.env
    if grep -q "^DEPLOY_SCENARIO=" absenta_backend/.env; then
        sed -i "s|^DEPLOY_SCENARIO=.*|DEPLOY_SCENARIO=$DEPLOY_SCENARIO|g" absenta_backend/.env
    else
        echo "DEPLOY_SCENARIO=$DEPLOY_SCENARIO" >> absenta_backend/.env
    fi

    # S3 MinIO Storage Configuration for On-Premise / Production
    if grep -q "^STORAGE_DRIVER=" absenta_backend/.env; then
        sed -i "s|^STORAGE_DRIVER=.*|STORAGE_DRIVER=s3|g" absenta_backend/.env
    else
        echo "STORAGE_DRIVER=s3" >> absenta_backend/.env
    fi
    if grep -q "^S3_BUCKET=" absenta_backend/.env; then
        sed -i "s|^S3_BUCKET=.*|S3_BUCKET=absenta-storage|g" absenta_backend/.env
    else
        echo "S3_BUCKET=absenta-storage" >> absenta_backend/.env
    fi
    if grep -q "^S3_ENDPOINT=" absenta_backend/.env; then
        sed -i "s|^S3_ENDPOINT=.*|S3_ENDPOINT=http://127.0.0.1:9000|g" absenta_backend/.env
    else
        echo "S3_ENDPOINT=http://127.0.0.1:9000" >> absenta_backend/.env
    fi
    if grep -q "^S3_ACCESS_KEY=" absenta_backend/.env; then
        sed -i "s|^S3_ACCESS_KEY=.*|S3_ACCESS_KEY=minioadmin|g" absenta_backend/.env
    else
        echo "S3_ACCESS_KEY=minioadmin" >> absenta_backend/.env
    fi
    if grep -q "^S3_SECRET_KEY=" absenta_backend/.env; then
        sed -i "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=minioadmin|g" absenta_backend/.env
    else
        echo "S3_SECRET_KEY=minioadmin" >> absenta_backend/.env
    fi
    if grep -q "^S3_FORCE_PATH_STYLE=" absenta_backend/.env; then
        sed -i "s|^S3_FORCE_PATH_STYLE=.*|S3_FORCE_PATH_STYLE=true|g" absenta_backend/.env
    else
        echo "S3_FORCE_PATH_STYLE=true" >> absenta_backend/.env
    fi

    # Otomatis Pemasangan & Inisialisasi MinIO S3 Storage Server
    echo "Menjalankan otomatisasi setup MinIO Self-Hosted S3 Storage Server..."
    if [ -f /var/www/project-absenta/deployer/setup-minio.sh ]; then
        chmod +x /var/www/project-absenta/deployer/setup-minio.sh || true
        echo '$SUDO_PASS' | sudo -S bash /var/www/project-absenta/deployer/setup-minio.sh || true
    fi

    # Frontend Setup
    cp absenta_frontend/.env.example absenta_frontend/.env || true
    sed -i "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=$FRONTEND_API_BASE_URL|g" absenta_frontend/.env
    sed -i "s|^VITE_PROXY_TARGET=.*|VITE_PROXY_TARGET=http://localhost:$B_PORT|g" absenta_frontend/.env
    sed -i "s|^PORT=.*|PORT=$F_PORT|g" absenta_frontend/.env
    if grep -q "^VITE_MAIN_DOMAIN=" absenta_frontend/.env; then
        sed -i "s|^VITE_MAIN_DOMAIN=.*|VITE_MAIN_DOMAIN=$TARGET_DOMAIN|g" absenta_frontend/.env
    else
        echo "VITE_MAIN_DOMAIN=$TARGET_DOMAIN" >> absenta_frontend/.env
    fi
    if grep -q "^VITE_DEPLOY_SCENARIO=" absenta_frontend/.env; then
        sed -i "s|^VITE_DEPLOY_SCENARIO=.*|VITE_DEPLOY_SCENARIO=$DEPLOY_SCENARIO|g" absenta_frontend/.env
    else
        echo "VITE_DEPLOY_SCENARIO=$DEPLOY_SCENARIO" >> absenta_frontend/.env
    fi

    # Install & Build Backend
    cd absenta_backend
    npm install
    npx prisma generate

    # Jalankan prisma db push & seed (jika database postgresql sudah siap)
    npx prisma db push --accept-data-loss || echo "Prisma DB push dilewati atau gagal. Pastikan PostgreSQL siap."
    npx prisma db seed || echo "Prisma DB seed dilewati atau gagal."

    npm run build

    # Install & Build Frontend
    cd ../absenta_frontend
    npm install
    npm run build

    # PM2 Start
    cd ..
    pm2 delete ecosystem.config.js || true
    pm2 start ecosystem.config.js --update-env
    pm2 save

    # Daftarkan PM2 sebagai systemd service agar otomatis jalan setelah reboot
    echo "Mendaftarkan PM2 ke systemd startup..."
    echo '$SUDO_PASS' | sudo -S env PATH=\${PATH}:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || \
    echo '$SUDO_PASS' | sudo -S env PATH=\${PATH}:/usr/local/bin pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || true
    pm2 save
    echo "PM2 startup systemd berhasil didaftarkan untuk Project Absenta."

    # Configure Caddyfile
    if [ "$DEPLOY_SCENARIO" != "local" ]; then
        # Deteksi apakah domain target merupakan IP address atau Domain
        if [[ "$TARGET_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            CADDY_HOSTS="$TARGET_DOMAIN, http://:80"
        else
            if [ "$DEPLOY_SCENARIO" = "hybrid" ]; then
                CADDY_HOSTS="$TARGET_DOMAIN, http://:80"
            elif [ ! -z "$CF_TOKEN" ]; then
                CADDY_HOSTS="$TARGET_DOMAIN, *.$TARGET_DOMAIN"
            else
                CADDY_HOSTS="$TARGET_DOMAIN"
            fi
        fi

        echo "http://`$CADDY_HOSTS {" > /tmp/Caddyfile
        echo "    reverse_proxy /api/* localhost:$B_PORT" >> /tmp/Caddyfile
        echo "    reverse_proxy /socket.io/* localhost:$B_PORT" >> /tmp/Caddyfile
        echo "    reverse_proxy /* localhost:$F_PORT" >> /tmp/Caddyfile
        echo "    encode gzip zstd" >> /tmp/Caddyfile
        echo "}" >> /tmp/Caddyfile
        echo "" >> /tmp/Caddyfile
        echo "https://`$CADDY_HOSTS {" >> /tmp/Caddyfile
        echo "    reverse_proxy /api/* localhost:$B_PORT" >> /tmp/Caddyfile
        echo "    reverse_proxy /socket.io/* localhost:$B_PORT" >> /tmp/Caddyfile
        echo "    reverse_proxy /* localhost:$F_PORT" >> /tmp/Caddyfile
        echo "    encode gzip zstd" >> /tmp/Caddyfile
        if [ -f /etc/caddy/ssl/cert.pem ]; then
            echo "    tls /etc/caddy/ssl/cert.pem /etc/caddy/ssl/key.pem" >> /tmp/Caddyfile
        elif [ ! -z "$CF_TOKEN" ]; then
            echo "    tls {" >> /tmp/Caddyfile
            echo "        dns cloudflare $CF_TOKEN" >> /tmp/Caddyfile
            echo "    }" >> /tmp/Caddyfile
        fi
        echo "}" >> /tmp/Caddyfile
        echo '$SUDO_PASS' | sudo -S cp /tmp/Caddyfile /etc/caddy/Caddyfile
    else
        echo "Skenario Lokal terdeteksi. Melewati konfigurasi Caddy Reverse Proxy."
    fi

elif [ "$IS_SERVER_LISENSI" = "True" ]; then
    # deployment Server Lisensi
    cd /var/www/licensing-server
    cp .env.example .env || true
    if grep -q "MAIN_DOMAIN=" .env; then
        sed -i "s/MAIN_DOMAIN=.*/MAIN_DOMAIN=$TARGET_DOMAIN/g" .env
    else
        echo "MAIN_DOMAIN=$TARGET_DOMAIN" >> .env
    fi
    if [ ! -z "$CF_TOKEN" ]; then
        if grep -q "CLOUDFLARE_API_TOKEN=" .env; then
            sed -i "s/CLOUDFLARE_API_TOKEN=.*/CLOUDFLARE_API_TOKEN=$CF_TOKEN/g" .env
        else
            echo "CLOUDFLARE_API_TOKEN=$CF_TOKEN" >> .env
        fi
    fi
    # Setup DATABASE_URL
    if grep -q "DATABASE_URL=" .env; then
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|g" .env
    else
        echo "DATABASE_URL=$DB_URL" >> .env
    fi

    # Setup WireGuard
    echo '$SUDO_PASS' | sudo -S mkdir -p /etc/wireguard
    mkdir -p /tmp/wireguard_setup
    cd /tmp/wireguard_setup
    if ! echo '$SUDO_PASS' | sudo -S test -f /etc/wireguard/privatekey; then
        wg genkey | tee privatekey | wg pubkey | tee publickey > /dev/null
        PRV_KEY=`$(cat privatekey)
        echo "[Interface]" > wg0.conf
        echo "Address = 10.0.0.1/24" >> wg0.conf
        echo "SaveConfig = true" >> wg0.conf
        echo "ListenPort = 51820" >> wg0.conf
        echo "PrivateKey = \`$PRV_KEY" >> wg0.conf
        echo "PostUp = iptables -A FORWARD -i wg0 -o wg0 -s 10.0.0.2/29 -j ACCEPT; iptables -A FORWARD -i wg0 -o wg0 -m iprange --src-range 10.0.0.10-10.0.0.254 --dst-range 10.0.0.10-10.0.0.254 -j REJECT --reject-with icmp-port-unreachable; iptables -A FORWARD -i wg0 -o wg0 -s 10.0.1.0/24 -d 10.0.0.0/24 -j REJECT; iptables -A FORWARD -i wg0 -o wg0 -s 10.0.0.0/24 -d 10.0.1.0/24 -j REJECT; iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE" >> wg0.conf
        echo "PostDown = iptables -D FORWARD -i wg0 -o wg0 -s 10.0.0.2/29 -j ACCEPT; iptables -D FORWARD -i wg0 -o wg0 -m iprange --src-range 10.0.0.10-10.0.0.254 --dst-range 10.0.0.10-10.0.0.254 -j REJECT --reject-with icmp-port-unreachable; iptables -D FORWARD -i wg0 -o wg0 -s 10.0.1.0/24 -d 10.0.0.0/24 -j REJECT; iptables -D FORWARD -i wg0 -o wg0 -s 10.0.0.0/24 -d 10.0.1.0/24 -j REJECT; iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE" >> wg0.conf

        echo '$SUDO_PASS' | sudo -S cp privatekey publickey wg0.conf /etc/wireguard/
        echo '$SUDO_PASS' | sudo -S chmod 600 /etc/wireguard/privatekey /etc/wireguard/wg0.conf
    fi

    cd /var/www/licensing-server
    npm install --production
    npx prisma generate
    npx prisma db push --accept-data-loss || echo "Prisma db push dilewati atau gagal."
    npx prisma db seed || echo "Prisma db seed dilewati atau gagal."

    pm2 delete licensing-server || true
    pm2 start ecosystem.config.js --update-env
    pm2 save

    echo '$SUDO_PASS' | sudo -S env PATH=`$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER || true
    echo '$SUDO_PASS' | sudo -S node scripts/sync-caddy.js
    echo '$SUDO_PASS' | sudo -S systemctl enable wg-quick@wg0
    echo '$SUDO_PASS' | sudo -S systemctl restart wg-quick@wg0 || true

else
    # deployment Standard (POS, Yatim, gform, Custom Repo)
    cd /var/www/$TARGET_SUBDIR

    # Setup .env
    cp .env.example .env || true
    sed -i "s|^PORT=.*|PORT=$B_PORT|g" .env || true

    npm install
    if grep -q "build" package.json; then
        npm run build || echo "Build script failed atau tidak ditemukan."
    fi

    # PM2 Start
    pm2 delete $TARGET_SUBDIR || true
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js --update-env
    elif [ -f "dist/main.js" ]; then
        pm2 start dist/main.js --name $TARGET_SUBDIR -- --port $B_PORT
    else
        pm2 start server.js --name $TARGET_SUBDIR || pm2 start index.js --name $TARGET_SUBDIR
    fi
    pm2 save

    # Daftarkan PM2 sebagai systemd service agar otomatis jalan setelah reboot
    echo "Mendaftarkan PM2 ke systemd startup..."
    echo '$SUDO_PASS' | sudo -S env PATH=\${PATH}:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || \
    echo '$SUDO_PASS' | sudo -S env PATH=\${PATH}:/usr/local/bin pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || true
    pm2 save
    echo "PM2 startup systemd berhasil didaftarkan."

    # Configure Caddyfile
    echo "$TARGET_DOMAIN {" > /tmp/Caddyfile
    echo "    reverse_proxy /* localhost:$B_PORT" >> /tmp/Caddyfile
    echo "    encode gzip zstd" >> /tmp/Caddyfile
    echo "}" >> /tmp/Caddyfile
    echo '$SUDO_PASS' | sudo -S cp /tmp/Caddyfile /etc/caddy/Caddyfile
fi

# Restart Caddy to apply changes
echo '$SUDO_PASS' | sudo -S systemctl enable caddy
echo '$SUDO_PASS' | sudo -S systemctl restart caddy

# ─── TUNNEL & SERVICE WATCHDOG (Auto-Recovery) ───────────────────────────────
echo "Memasang Absenta Tunnel Watchdog untuk auto-recovery..."

cat > /tmp/absenta-tunnel-watchdog.sh << 'WATCHDOG'
#!/bin/bash
LOG_FILE="/var/log/absenta-tunnel-watchdog.log"
MAX_LOG_SIZE=5242880
ET_PEER_IP="10.0.0.1"
STALE_HANDSHAKE_SECS=180
log() {
  [ -f "`$LOG_FILE" ] && [ "`$(stat -c%s "`$LOG_FILE" 2>/dev/null || echo 0)" -gt `$MAX_LOG_SIZE ] && { mv "`$LOG_FILE" "`${LOG_FILE}.1"; touch "`$LOG_FILE"; }
  echo "[`$(date '+%Y-%m-%d %H:%M:%S')] `$1" >> "`$LOG_FILE"
}
check_wireguard() {
  # Multi-Tunnel Coexistence: Auto-sanitize legacy /24 netmask -> /32 host mask
  sed -i 's/Address = \(10\.[0-9]\+\.[0-9]\+\.[0-9]\+\)\/24/Address = \1\/32/g' /etc/wireguard/et-*.conf 2>/dev/null || true
  sed -i 's/AllowedIPs = 10\.0\.0\.0\/24/AllowedIPs = 10.0.0.1\/32/g' /etc/wireguard/et-*.conf 2>/dev/null || true

  CONF_FILES=`$(ls /var/www/project-absenta/tunnels/*.conf /etc/wireguard/*.conf 2>/dev/null || true)
  for cfile in `$CONF_FILES; do
    [ -f "`$cfile" ] || continue
    bname=`$(basename "`$cfile")
    iface="`${bname%.conf}"
    if [ "`$cfile" != "/etc/wireguard/`$bname" ]; then
      cp -f "`$cfile" "/etc/wireguard/`$bname" 2>/dev/null || true; chmod 600 "/etc/wireguard/`$bname" 2>/dev/null || true
    fi
    systemctl is-enabled "wg-quick@`$iface" &>/dev/null || systemctl enable "wg-quick@`$iface" 2>/dev/null || true
    if ! ip link show "`$iface" 2>/dev/null | grep -q "UP"; then
      log "⚠️  WG `$iface DOWN - restore..."; wg-quick up "`$iface" 2>/dev/null || systemctl restart "wg-quick@`$iface" 2>/dev/null || true; sleep 3
      ip link show "`$iface" 2>/dev/null | grep -q "UP" && log "✅ WG `$iface UP" || log "❌ WG `$iface gagal"
    else
      LAST_HS=`$(wg show "`$iface" latest-handshakes 2>/dev/null | awk '{print `$2}' | head -1)
      if [ -n "`$LAST_HS" ] && [ "`$LAST_HS" != "0" ]; then
        DIFF=`$(( `$(date +%s) - LAST_HS ))
        if [ "`$DIFF" -gt "`$STALE_HANDSHAKE_SECS" ]; then
          log "⚠️  WG `$iface stale `${DIFF}s - reconnect..."; ping -c 3 -W 5 "`$ET_PEER_IP" &>/dev/null || true; sleep 5; log "🔄 WG reconnect"
        fi
      fi
    fi
  done
}
check_pm2() {
  if ! pgrep -f "pm2" &>/dev/null; then
    log "⚠️  PM2 mati - resurrect..."; su - asepsuryadi -c "pm2 resurrect" 2>/dev/null || true; sleep 5
    pgrep -f "pm2" &>/dev/null && log "✅ PM2 hidup" || log "❌ PM2 gagal"
  fi
}
check_caddy() {
  if ! systemctl is-active --quiet caddy 2>/dev/null; then
    log "⚠️  Caddy DOWN - restart..."; systemctl restart caddy 2>/dev/null; sleep 3
    systemctl is-active --quiet caddy && log "✅ Caddy OK" || log "❌ Caddy gagal"
  fi
}
COUNTER_FILE="/tmp/absenta-watchdog-counter"
COUNTER=`$(cat "`$COUNTER_FILE" 2>/dev/null || echo 0); COUNTER=`$((COUNTER+1)); echo "`$COUNTER" > "`$COUNTER_FILE"
if [ "`$COUNTER" -ge 10 ]; then echo "0" > "`$COUNTER_FILE"
  WG_STATUS=`$(ip link show type wireguard 2>/dev/null | grep -q "UP" && echo "UP" || echo "DOWN")
  log "📊 WG=`$WG_STATUS Caddy=`$(systemctl is-active caddy 2>/dev/null) PM2=`$(pgrep -f pm2 &>/dev/null && echo ok || echo dead)"
fi
check_wireguard; check_pm2; check_caddy
WATCHDOG

echo '$SUDO_PASS' | sudo -S cp /tmp/absenta-tunnel-watchdog.sh /usr/local/bin/absenta-tunnel-watchdog.sh
echo '$SUDO_PASS' | sudo -S chmod +x /usr/local/bin/absenta-tunnel-watchdog.sh

cat > /tmp/absenta-tunnel-watchdog.service << 'EOF'
[Unit]
Description=Absenta Tunnel & Service Watchdog
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/absenta-tunnel-watchdog.sh
User=root
EOF

cat > /tmp/absenta-tunnel-watchdog.timer << 'EOF'
[Unit]
Description=Run Absenta Tunnel Watchdog every 30 seconds
Requires=absenta-tunnel-watchdog.service
[Timer]
OnBootSec=30s
OnUnitActiveSec=30s
AccuracySec=5s
Persistent=true
[Install]
WantedBy=timers.target
EOF

echo '$SUDO_PASS' | sudo -S cp /tmp/absenta-tunnel-watchdog.service /etc/systemd/system/
echo '$SUDO_PASS' | sudo -S cp /tmp/absenta-tunnel-watchdog.timer /etc/systemd/system/
echo '$SUDO_PASS' | sudo -S mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nRestart=always\nRestartSec=10\nStartLimitIntervalSec=120\nStartLimitBurst=10\n' | sudo tee /etc/systemd/system/caddy.service.d/restart-override.conf > /dev/null
echo '$SUDO_PASS' | sudo -S systemctl daemon-reload
echo '$SUDO_PASS' | sudo -S systemctl enable absenta-tunnel-watchdog.timer
echo '$SUDO_PASS' | sudo -S systemctl restart absenta-tunnel-watchdog.timer
echo "✅ Watchdog aktif - server sekarang robust dari disconnect tunnel"
# ─────────────────────────────────────────────────────────────────────────────


# 3. VERIFIKASI STATUS LAYANAN
echo ""
echo -e "\e[1;36m==========================================================\e[0m"
echo -e "\e[1;33m            VERIFIKASI STATUS LAYANAN VPS                 \e[0m"
echo -e "\e[1;36m==========================================================\e[0m"

echo "Status PM2 Processes:"
pm2 status

echo -n "Status Caddy Server: "
if echo '$SUDO_PASS' | sudo -S systemctl is-active --quiet caddy; then
    echo -e "\e[1;32m ACTIVE\e[0m"
else
    echo -e "\e[1;31m INACTIVE\e[0m"
fi

if [ "$IS_SERVER_LISENSI" = "True" ]; then
    echo -n "Status WireGuard (wg0): "
    if echo '$SUDO_PASS' | sudo -S systemctl is-active --quiet wg-quick@wg0; then
        echo -e "\e[1;32m ACTIVE\e[0m"
    else
        echo -e "\e[1;31m INACTIVE\e[0m"
    fi
fi
echo -e "\e[1;36m==========================================================\e[0m"
echo ""
# Salin log akhir ke folder target proyek
cp /tmp/deploy.log /var/www/$TARGET_SUBDIR/deploy.log || true
"@

Run-RemoteScript -ScriptContent $setupScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP

Show-Header "DEPLOY SELESAI!"
Show-Log "Proyek '$PROJ_NAME' berhasil di-deploy ke $TARGET_DOMAIN!" "Green"
Show-Log "Server berjalan di IP Baru: $NEW_IP" "Green"
Write-Host ""
Write-Host "LANGKAH SELANJUTNYA (MANUAL):" -ForegroundColor Yellow
Write-Host "1. Arahkan DNS Record domain '$TARGET_DOMAIN' ke IP VPS: $NEW_IP"
Write-Host "2. Jika mendeploy Absenta, pastikan PostgreSQL & Redis sudah siap digunakan."
Write-Host ""
Write-Host "Log deploy disimpan di: $LOG_FILE" -ForegroundColor Cyan
Write-Host ""

Stop-Transcript
Read-Host "Tekan [ENTER] untuk kembali..."
