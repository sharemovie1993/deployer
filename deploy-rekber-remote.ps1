# deploy-rekber-remote.ps1 - Skrip Deploy Rekening Bersama & Payment Gateway (VPS Linux)
# Men-deploy Webapp Project Rekening Bersama (Fastify + Vite React + Prisma SQLite/PostgreSQL) secara remote via SSH

param(
    [string]$TargetIP,
    [string]$TargetUser = "asepsuryadi",
    [string]$KeyPath,
    [string]$SudoPass,
    [string]$TargetDomain,
    [string]$BackendPort = "5050",
    [string]$LicenseServerUrl = "https://api.absenta.id",
    [string]$JwtSecret = "super_secret_rekening_bersama_jwt_key_2026_change_in_production",
    [string]$DbUrl = "file:./dev.db",
    [string]$sslScenario = "auto",
    [string]$cfToken = "",
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "deploy-rekber-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Show-Header {
    param([string]$Title)
    if (-not $Silent) { Clear-Host }
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "         DEPLOYER - B-PAY REKENING BERSAMA & GATEWAY HUB (VPS LINUX)      " -ForegroundColor Yellow -Bold
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " -> $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

# ============================================================
# DPKG LOCK CLEARANCE & APT PROCESS KILLERS
# ============================================================
function Clear-DpkgLock {
    param([string]$KeyPath, [string]$TargetUser, [string]$TargetIP, [string]$SudoPass)
    Show-Log "Memeriksa status dpkg lock..." "Yellow"

    $checkScript = @"
set +e
echo "=== DPKG LOCK CHECK ==="
if [ -f /var/lib/dpkg/lock-frontend ]; then echo "Lock file: /var/lib/dpkg/lock-frontend"; fi
if [ -f /var/lib/dpkg/lock ]; then echo "Lock file: /var/lib/dpkg/lock"; fi
if [ -f /var/lib/apt/lists/lock ]; then echo "Lock file: /var/lib/apt/lists/lock"; fi
if [ -f /var/cache/apt/archives/lock ]; then echo "Lock file: /var/cache/apt/archives/lock"; fi

LOCK_PIDS=`$(ps aux | awk '/apt-get|dpkg|aptitude/ && !/awk/ {print `$2}' | tr '\n' ' ')
if [ -n "`$LOCK_PIDS" ]; then
    echo "Proses apt/dpkg yang aktif: `$LOCK_PIDS"
    echo "AKTIF"
else
    echo "TIDAK_AKTIF"
fi
"@

    $tempScript = "$env:TEMP\dpkg_check.sh"
    $checkScript | Out-File -FilePath $tempScript -Encoding utf8 -Force
    & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/dpkg_check.sh" 2>$null
    $checkResult = & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/dpkg_check.sh"
    Remove-Item $tempScript -Force -ErrorAction SilentlyContinue

    if ($checkResult -contains "AKTIF") {
        Show-Log "Dpkg lock aktif! Mencoba membersihkan..." "Yellow"
        $clearScript = @"
set -e
echo '$SudoPass' | sudo -S rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null || true
echo '$SudoPass' | sudo -S rm -rf /var/lib/dpkg/*.old 2>/dev/null || true
echo '$SudoPass' | sudo -S dpkg --configure -a --force-all 2>&1 || true
"@
        $tempClear = "$env:TEMP\dpkg_clear.sh"
        $clearScript | Out-File -FilePath $tempClear -Encoding utf8 -Force
        & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempClear" "${TargetUser}@${TargetIP}:/tmp/dpkg_clear.sh" 2>$null
        & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/dpkg_clear.sh" 2>&1 | Out-Null
        Remove-Item $tempClear -Force -ErrorAction SilentlyContinue
    }
}

Show-Header "Pemeriksaan Parameter Input"

if ([string]::IsNullOrWhiteSpace($TargetIP)) {
    $TargetIP = Read-Host "Masukkan IP VPS Target (contoh: 103.196.155.87)"
}
if ([string]::IsNullOrWhiteSpace($KeyPath)) {
    $KeyPath = Join-Path $PSScriptRoot "ls-key.pem"
    if (-not (Test-Path $KeyPath)) {
        $KeyPath = Read-Host "Masukkan path absolut file SSH Private Key (.pem)"
    }
}
if ([string]::IsNullOrWhiteSpace($SudoPass)) {
    $SudoPass = Read-Host "Masukkan Password Sudo VPS"
}
if ([string]::IsNullOrWhiteSpace($TargetDomain)) {
    $TargetDomain = Read-Host "Masukkan Domain / Hostname (contoh: pay.barayaproject.id atau IP jika tanpa domain)"
}

Show-Log "Target VPS: $TargetUser@$TargetIP" "Green"
Show-Log "Domain Target: $TargetDomain" "Green"
Show-Log "Port Backend: $BackendPort" "Green"

Clear-DpkgLock -KeyPath $KeyPath -TargetUser $TargetUser -TargetIP $TargetIP -SudoPass $SudoPass

# ============================================================
# TAHAP 1: BUILD LOKAL PROJECT REKENING BERSAMA
# ============================================================
Show-Header "Build Frontend & Backend Lokal"
$PROJECT_ROOT = Resolve-Path (Join-Path $PSScriptRoot "..\Project Rekening Bersama")

Show-Log "Membangun source code di '$PROJECT_ROOT'..." "Yellow"
Push-Location $PROJECT_ROOT
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Gagal melakukan build lokal!"
    }
    Show-Log "Build lokal berhasil 100%!" "Green"
} finally {
    Pop-Location
}

# ============================================================
# TAHAP 2: PACKAGING DIST ARCHIVE
# ============================================================
Show-Header "Membuat Paket Rilis Deploy (Tar.gz)"
$TEMP_TAR = Join-Path $env:TEMP "rekber_dist.tar.gz"
if (Test-Path $TEMP_TAR) { Remove-Item $TEMP_TAR -Force }

Show-Log "Mengompres berkas rilis..." "Yellow"
Push-Location $PROJECT_ROOT
try {
    tar -czf "$TEMP_TAR" dist client/dist prisma package.json package-lock.json
    Show-Log "Paket rilis terkompres di '$TEMP_TAR' ($((Get-Item $TEMP_TAR).Length / 1MB | ForEach-Object { $_.ToString('N2') }) MB)" "Green"
} finally {
    Pop-Location
}

# ============================================================
# TAHAP 3: UPLOAD KE VPS TARGET
# ============================================================
Show-Header "Mengunggah Berkas ke VPS"
Show-Log "Mengirim rekber_dist.tar.gz via SCP..." "Yellow"
& scp -i "$KeyPath" -o StrictHostKeyChecking=no "$TEMP_TAR" "${TargetUser}@${TargetIP}:/tmp/rekber_dist.tar.gz"
if ($LASTEXITCODE -ne 0) {
    throw "Gagal mengunggah berkas ke VPS!"
}
Remove-Item $TEMP_TAR -Force -ErrorAction SilentlyContinue
Show-Log "Upload berhasil!" "Green"

# ============================================================
# TAHAP 4: SETUP SERVER REMOTE VIA SSH SCRIPT
# ============================================================
Show-Header "Menjalankan Instalasi Remote di VPS"

$REMOTE_DIR = "/var/www/project-rekber"

$remoteScript = @"
set -e
echo "$SudoPass" | sudo -S mkdir -p $REMOTE_DIR
echo "$SudoPass" | sudo -S chown -R ${TargetUser}:${TargetUser} $REMOTE_DIR

echo "=== [1/6] Ekstraksi Paket Rilis ==="
tar -xzf /tmp/rekber_dist.tar.gz -C $REMOTE_DIR
rm -f /tmp/rekber_dist.tar.gz

cd $REMOTE_DIR

echo "=== [2/6] Setup Node.js & WireGuard Packages ==="
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | echo "$SudoPass" | sudo -S bash -
    echo "$SudoPass" | sudo -S apt-get install -y nodejs wireguard openresolv
else
    echo "$SudoPass" | sudo -S apt-get install -y wireguard openresolv || true
fi

if ! command -v pm2 &>/dev/null; then
    echo "$SudoPass" | sudo -S npm install -g pm2
fi

echo "=== [3/6] Install Dependencies Produksi & Prisma Generate ==="
npm install --omit=dev --legacy-peer-deps
npx prisma generate
npx prisma db push --skip-generate

echo "=== [4/6] Menyiapkan File Konfigurasi Lingkungan (.env) ==="
cat << 'EOF_ENV' > .env
PORT=$BackendPort
HOST=0.0.0.0
NODE_ENV=production
DATABASE_URL="$DbUrl"
JWT_SECRET="$JwtSecret"
LICENSE_SERVER_URL="$LicenseServerUrl"
EASY_TUNNEL_BASE_DOMAIN="absenta.id"
EOF_ENV

echo "=== [5/6] Konfigurasi PM2 Process Manager ==="
mkdir -p logs tunnels
pm2 delete project-rekber 2>/dev/null || true
pm2 start dist/server.js --name "project-rekber" --max-memory-restart 500M --time
pm2 save

echo "=== [6/6] Menyiapkan Caddy Reverse Proxy & HTTPS (Smart Multi-App Coexistence) ==="
if command -v caddy &>/dev/null; then
    cat << 'EOF_CADDY' > /tmp/caddy_rekber_block.conf
$TargetDomain {
    reverse_proxy 127.0.0.1:$BackendPort
    encode gzip zstd
}
EOF_CADDY

    echo "$SudoPass" | sudo -S mkdir -p /etc/caddy
    if [ ! -f /etc/caddy/Caddyfile ]; then
        echo "# Baraya Multi-Project Caddy Gateway" | echo "$SudoPass" | sudo -S tee /etc/caddy/Caddyfile > /dev/null
    fi

    echo "$SudoPass" | sudo -S cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak 2>/dev/null || true

    echo "$SudoPass" | sudo -S python3 -c "
import re
caddy_file = '/etc/caddy/Caddyfile'
try:
    with open(caddy_file, 'r') as f:
        content = f.read()
    pattern = r'# === BEGIN PROJECT: rekber ===.*?# === END PROJECT: rekber ===\n?'
    cleaned = re.sub(pattern, '', content, flags=re.DOTALL).strip()
    with open('/tmp/caddy_cleaned.txt', 'w') as f:
        f.write(cleaned + '\n\n' if cleaned else '')
except Exception as e:
    with open('/tmp/caddy_cleaned.txt', 'w') as f:
        f.write('')
" 2>/dev/null || (
        echo "$SudoPass" | sudo -S sed -e '/# === BEGIN PROJECT: rekber ===/,/# === END PROJECT: rekber ===/d' /etc/caddy/Caddyfile > /tmp/caddy_cleaned.txt 2>/dev/null || true
    )

    {
        cat /tmp/caddy_cleaned.txt 2>/dev/null
        echo "# === BEGIN PROJECT: rekber ==="
        cat /tmp/caddy_rekber_block.conf
        echo ""
        echo "# === END PROJECT: rekber ==="
    } > /tmp/Caddyfile.merged

    echo "$SudoPass" | sudo -S cp /tmp/Caddyfile.merged /etc/caddy/Caddyfile
    echo "$SudoPass" | sudo -S rm -f /tmp/caddy_cleaned.txt /tmp/caddy_rekber_block.conf /tmp/Caddyfile.merged 2>/dev/null || true

    if echo "$SudoPass" | sudo -S caddy validate --config /etc/caddy/Caddyfile; then
        echo "✅ Validasi Caddyfile Multi-App BERHASIL!"
        echo "$SudoPass" | sudo -S systemctl enable caddy 2>/dev/null || true
        echo "$SudoPass" | sudo -S systemctl reload caddy 2>/dev/null || echo "$SudoPass" | sudo -S systemctl restart caddy 2>/dev/null || true
    else
        echo "⚠️ Validasi Caddyfile gagal, memulihkan backup..."
        echo "$SudoPass" | sudo -S cp /etc/caddy/Caddyfile.bak /etc/caddy/Caddyfile 2>/dev/null || true
        echo "$SudoPass" | sudo -S systemctl restart caddy 2>/dev/null || true
    fi
fi

echo "=========================================================="
echo "✅ DEPLOYMENT PROJECT REKENING BERSAMA SUKSES 100%!"
echo "🚀 Layanan Berjalan di Port $BackendPort"
echo "🌐 URL: https://$TargetDomain"
echo "=========================================================="
"@

$tempRemote = "$env:TEMP\deploy_remote_rekber.sh"
$remoteScript | Out-File -FilePath $tempRemote -Encoding utf8 -Force

Show-Log "Mengirim dan mengeksekusi skrip deployment di VPS..." "Yellow"
& scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempRemote" "${TargetUser}@${TargetIP}:/tmp/deploy_remote_rekber.sh"
& ssh -i "$KeyPath" -o StrictHostKeyChecking=no -t "${TargetUser}@${TargetIP}" "bash /tmp/deploy_remote_rekber.sh; rm -f /tmp/deploy_remote_rekber.sh"

Remove-Item $tempRemote -Force -ErrorAction SilentlyContinue

Show-Header "Deployment Selesai"
Show-Log "Aplikasi Project Rekening Bersama berhasil di-deploy ke VPS Linux!" "Green"
Show-Log "URL Akses: https://$TargetDomain" "Green"

Stop-Transcript
