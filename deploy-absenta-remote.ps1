# deploy-absenta-remote.ps1 - Skrip Deploy Project Absenta Terisolasi (VPS Linux)
# Hanya untuk men-deploy Project Absenta (Full Stack) secara remote via SSH

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "deploy-absenta-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Show-Header {
    param([string]$Title)
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "                DEPLOYER - PROJECT ABSENTA (FULL STACK)                   " -ForegroundColor Yellow
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
echo '$SudoPass' | sudo -S dpkg --configure -a 2>/dev/null || true
echo "DPKG lock berhasil dibersihkan."
"@
        $tempClearScript = "$env:TEMP\dpkg_clear.sh"
        $clearScript | Out-File -FilePath $tempClearScript -Encoding utf8 -Force
        & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempClearScript" "${TargetUser}@${TargetIP}:/tmp/dpkg_clear.sh" 2>$null
        $clearResult = & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/dpkg_clear.sh"
        Remove-Item $tempClearScript -Force -ErrorAction SilentlyContinue
        Show-Log "Hasil: $clearResult" "Gray"
        return $LASTEXITCODE -eq 0
    }
    Show-Log "Dpkg lock tidak aktif, melanjutkan..." "Green"
    return $true
}

function Kill-AptProcesses {
    param([string]$KeyPath, [string]$TargetUser, [string]$TargetIP, [string]$SudoPass)
    Show-Log "Memeriksa proses apt/dpkg yang stuck..." "Yellow"

    $killScript = @"
set -e
echo "=== KILL APT STUCK PROCESSES ==="
STUCK_PIDS=`$(ps aux | grep -E 'apt-get|dpkg|aptitude' | grep -v grep | awk '{print `$2}')
if [ -n "`$STUCK_PIDS" ]; then
    echo "Membunuh proses stuck: `$STUCK_PIDS"
    echo '$SudoPass' | sudo -S kill -9 `$STUCK_PIDS 2>/dev/null || true
    sleep 2
else
    echo "Tidak ada proses apt/dpkg yang stuck."
fi

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
        Show-Log "Semua proses apt stuck berhasil dibersihkan!" "Green"
        return $true
    }
    return $false
}

function Invoke-AutoFixAptLocks {
    param([string]$KeyPath, [string]$TargetUser, [string]$TargetIP, [string]$SudoPass)
    for ($i = 1; $i -le 3; $i++) {
        Show-Log "Upaya $i - Membersihkan apt locks..." "Yellow"
        $killed = Kill-AptProcesses -KeyPath $KeyPath -TargetUser $TargetUser -TargetIP $TargetIP -SudoPass $SudoPass
        $cleared = Clear-DpkgLock -KeyPath $KeyPath -TargetUser $TargetUser -TargetIP $TargetIP -SudoPass $SudoPass
        if ($killed -and $cleared) { return $true }
        Start-Sleep -Seconds 3
    }
    return $false
}

# ============================================================
# FASE INPUT & KONFIGURASI KONEKSI
# ============================================================
Show-Header "Konfigurasi Koneksi VPS Target"
$NEW_IP = (Read-Host "Masukkan IP VPS Target (Contoh: 10.10.10.163)").Trim()
$NEW_USER = "asepsuryadi"

if ([string]::IsNullOrWhiteSpace($NEW_IP)) {
    Write-Host "IP VPS tidak boleh kosong!" -ForegroundColor Red
    exit
}

Write-Host "Pilih SSH Key:"
Write-Host " 1) nginxonly.pem"
Write-Host " 2) ls-key.pem"
Write-Host " 3) Input path file manual..."
$newKeyChoice = Read-Host "Pilih [1-3] (Default: 1)"
if ($newKeyChoice -eq "2") { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "ls-key.pem" }
elseif ($newKeyChoice -eq "3") { $NEW_KEY_SOURCE = Read-Host "Masukkan path absolut file .pem" }
else { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "nginxonly.pem" }

if (-not (Test-Path $NEW_KEY_SOURCE)) {
    Write-Host "Error: File SSH Key tidak ditemukan di '$NEW_KEY_SOURCE'" -ForegroundColor Red
    exit
}

$SUDO_PASS = (Read-Host "Masukkan password sudo VPS [g1g1G1NGSUL*!2]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "g1g1G1NGSUL*!2" }

# Bersihkan Locks (Opsional)
Write-Host "`nOpsi Perbaikan Dpkg/Apt Locks:"
Write-Host " 1) Lanjutkan ke Deploy (Default)"
Write-Host " 2) Bersihkan locks terlebih dahulu"
Write-Host " 3) Bersihkan + Lanjutkan Deploy"
$preDeployChoice = Read-Host "Pilih [1-3]"

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_NEW_KEY = "$env:TEMP\absenta-deploy-key.pem"
Remove-Item $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $NEW_KEY_SOURCE | Set-Content -Path $SAFE_NEW_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_NEW_KEY -AclObject $acl

if ($preDeployChoice -eq "2" -or $preDeployChoice -eq "3") {
    Show-Header "Membersihkan Dpkg/Apt Locks"
    $fixed = Invoke-AutoFixAptLocks -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP -SudoPass $SUDO_PASS
    if ($fixed) {
        Show-Log "Apt locks berhasil dibersihkan!" "Green"
    } else {
        Write-Host "Peringatan: Gagal membersihkan apt locks sepenuhnya. Melanjutkan dengan risiko..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
    if ($preDeployChoice -eq "2") {
        Stop-Transcript
        Read-Host "Selesai. Tekan [ENTER] untuk keluar..."
        exit
    }
}

# ============================================================
# FASE PARAMETER SPESIFIK PROJECT ABSENTA
# ============================================================
Show-Header "Parameter Project Absenta (Full Stack)"

Write-Host "Pilih Skenario Deployment:"
Write-Host " 1) SaaS / Cloud (Akses via Domain Publik, contoh: https://app.absenta.id)"
Write-Host " 2) Hybrid (Lokal Sekolah + Caddy Proxy, contoh: http://10.10.10.163)"
$scenarioChoice = Read-Host "Pilih [1-2] (Default: 1)"

$DEPLOY_SCENARIO = "saas"
if ($scenarioChoice -eq "2") {
    $DEPLOY_SCENARIO = "hybrid"
}

if ($DEPLOY_SCENARIO -eq "saas") {
    $TARGET_DOMAIN = (Read-Host "Masukkan Domain Utama Platform SaaS [absenta.id]").Trim()
    if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) { $TARGET_DOMAIN = "absenta.id" }
} else {
    $TARGET_DOMAIN = (Read-Host "Masukkan Domain Publik Akses Sekolah [absen.smkn1.sch.id]").Trim()
    if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) { $TARGET_DOMAIN = "absenta.id" }
}

$B_PORT = (Read-Host "Masukkan Port Backend [3003]").Trim()
if ([string]::IsNullOrWhiteSpace($B_PORT)) { $B_PORT = "3003" }

$F_PORT = (Read-Host "Masukkan Port Frontend [5175]").Trim()
if ([string]::IsNullOrWhiteSpace($F_PORT)) { $F_PORT = "5175" }

$CF_TOKEN = ""
if ($DEPLOY_SCENARIO -eq "saas" -or $DEPLOY_SCENARIO -eq "hybrid") {
    $CF_TOKEN = (Read-Host "Masukkan Cloudflare API Token (untuk SSL DNS Challenge, kosongkan jika tidak pakai)").Trim()
}

$DB_URL = (Read-Host "Masukkan DATABASE_URL PostgreSQL [postgresql://postgres:123123123@localhost:5432/absensi]").Trim()
if ([string]::IsNullOrWhiteSpace($DB_URL)) {
    $DB_URL = "postgresql://postgres:123123123@localhost:5432/absensi"
}

$INSTALL_POSTGRES = (Read-Host "Apakah Anda ingin memasang PostgreSQL Server secara otomatis? [y/N]").Trim()
if ([string]::IsNullOrWhiteSpace($INSTALL_POSTGRES)) { $INSTALL_POSTGRES = "N" }

$INSTALL_REDIS = (Read-Host "Apakah Anda ingin memasang Redis Server secara otomatis? [y/N]").Trim()
if ([string]::IsNullOrWhiteSpace($INSTALL_REDIS)) { $INSTALL_REDIS = "N" }

$REDIS_URL = "redis://localhost:6379"
if ($INSTALL_REDIS -eq "n" -or $INSTALL_REDIS -eq "N") {
    $REDIS_URL = (Read-Host "Masukkan REDIS_URL [redis://localhost:6379]").Trim()
    if ([string]::IsNullOrWhiteSpace($REDIS_URL)) { $REDIS_URL = "redis://localhost:6379" }
}

$LICENSE_KEY = (Read-Host "Masukkan Kunci Lisensi Absenta (Kosongkan jika belum ada)").Trim()

$TUNNEL_BASE_DOMAIN = (Read-Host "Masukkan Base Domain Easy Tunnel [absenta.id]").Trim()
if ([string]::IsNullOrWhiteSpace($TUNNEL_BASE_DOMAIN)) { $TUNNEL_BASE_DOMAIN = "absenta.id" }

$LICENSE_SERVER_URL = (Read-Host "Masukkan URL Server Lisensi [https://api.absenta.id]").Trim()
if ([string]::IsNullOrWhiteSpace($LICENSE_SERVER_URL)) { $LICENSE_SERVER_URL = "https://api.absenta.id" }

$NODE_NAME = (Read-Host "Masukkan Identitas Node (NODE_NAME) [node-$($NEW_IP.Replace('.', '-'))]").Trim()
if ([string]::IsNullOrWhiteSpace($NODE_NAME)) { $NODE_NAME = "node-$($NEW_IP.Replace('.', '-'))" }

$SCHEME = "https"
if ($TARGET_DOMAIN -match "^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$") {
    $SCHEME = "http"
}
$BACKEND_API_URL = "${SCHEME}://${TARGET_DOMAIN}/api"
$BACKEND_APP_URL = "${SCHEME}://${TARGET_DOMAIN}"
$BACKEND_FRONTEND_URL = "${SCHEME}://${TARGET_DOMAIN}"
$FRONTEND_API_BASE_URL = "/api"

$REPO_URL = "https://github.com/sharemovie1993/Project-Absenta.git"
$TARGET_SUBDIR = "project-absenta"

function Run-RemoteScript {
    param([string]$ScriptContent, [string]$KeyPath, [string]$TargetUser, [string]$TargetIP)
    $tempScript = "$env:TEMP\remote_script.sh"
    $ScriptContent = $ScriptContent -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($tempScript, $ScriptContent)
    & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/remote_script.sh"
    if ($LASTEXITCODE -ne 0) { throw "Gagal menyalin script ke VPS menggunakan SCP." }
    & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/remote_script.sh"
    if ($LASTEXITCODE -ne 0) { throw "Eksekusi script remote gagal dengan Exit Code $LASTEXITCODE" }
}

# ============================================================
# FASE 1: PROVISIONING & INSTALASI INSTANS
# ============================================================
Show-Header "FASE 1: PROVISIONING VPS TARGET"
Show-Log "Menginstal dependensi sistem di VPS ($NEW_IP)..." "Yellow"

$provisionScript = @"
set -e
# Cepat clear locks
echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S dpkg --configure -a 2>/dev/null || true

echo '$SUDO_PASS' | sudo -S apt-get update -y || {
    echo "APT UPDATE GAGAL - Melakukan force clear..."
    echo '$SUDO_PASS' | sudo -S kill -9 `$(ps aux | grep -E 'apt|dpkg' | grep -v grep | awk '{print `$2}') 2>/dev/null || true
    sleep 1
    echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock-* /var/lib/apt/lists/lock 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S dpkg --configure -a
    echo '$SUDO_PASS' | sudo -S apt-get update -y
}
echo '$SUDO_PASS' | sudo -S apt-get install -y curl git tar ufw build-essential wireguard openresolv

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
    echo '$SUDO_PASS' | sudo -S apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg || true
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S apt-get update -y
    echo '$SUDO_PASS' | sudo -S apt-get install -y caddy
    echo '$SUDO_PASS' | sudo -S systemctl stop caddy || true
    echo '$SUDO_PASS' | sudo -S cp /tmp/caddy_offline /usr/bin/caddy
    echo '$SUDO_PASS' | sudo -S chmod +x /usr/bin/caddy
else
    if ! command -v caddy &>/dev/null; then
        echo '$SUDO_PASS' | sudo -S apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg || true
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
        echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S apt-get update -y
        echo '$SUDO_PASS' | sudo -S apt-get install -y caddy
    fi
fi

if [ ! -f /etc/caddy/Caddyfile ]; then
    echo '$SUDO_PASS' | sudo -S touch /etc/caddy/Caddyfile
fi
echo '$SUDO_PASS' | sudo -S chmod 666 /etc/caddy/Caddyfile

# Opsi Instalasi PostgreSQL
if [[ "$INSTALL_POSTGRES" =~ ^[yY]$ ]]; then
    echo "Menginstal PostgreSQL..."
    echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S apt-get install -y postgresql postgresql-contrib
    echo '$SUDO_PASS' | sudo -S systemctl enable postgresql
    echo '$SUDO_PASS' | sudo -S systemctl start postgresql
    echo '$SUDO_PASS' | sudo -u postgres psql -c "ALTER USER postgres PASSWORD '123123123';" || true
    echo '$SUDO_PASS' | sudo -u postgres psql -c "CREATE DATABASE absensi;" || true
fi

# Opsi Instalasi Redis
if [[ "$INSTALL_REDIS" =~ ^[yY]$ ]]; then
    echo "Menginstal Redis Server..."
    echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S apt-get install -y redis-server
    echo '$SUDO_PASS' | sudo -S systemctl enable redis-server
    echo '$SUDO_PASS' | sudo -S systemctl start redis-server
fi

# Konfigurasi Sysctl Forwarding & Sudo Passwordless untuk WireGuard
echo '$SUDO_PASS' | sudo -S sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
echo "$NEW_USER ALL=(ALL) NOPASSWD: /usr/bin/wg-quick, /usr/bin/wg, /usr/sbin/wg-quick, /usr/sbin/wg" > /tmp/90-wireguard
echo '$SUDO_PASS' | sudo -S cp /tmp/90-wireguard /etc/sudoers.d/90-wireguard
echo '$SUDO_PASS' | sudo -S chown root:root /etc/sudoers.d/90-wireguard
echo '$SUDO_PASS' | sudo -S chmod 440 /etc/sudoers.d/90-wireguard
rm -f /tmp/90-wireguard

echo '$SUDO_PASS' | sudo -S mkdir -p /var/www/$TARGET_SUBDIR
echo '$SUDO_PASS' | sudo -S chown ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR
echo 'Provisioning dasar selesai.'
"@

$LOCAL_CADDY = Join-Path $PSScriptRoot "caddy-bin\caddy"
if (Test-Path $LOCAL_CADDY) {
    Show-Log "Menyalin Caddy offline lokal ke VPS..." "Yellow"
    & scp -i "$SAFE_NEW_KEY" -o StrictHostKeyChecking=no "$LOCAL_CADDY" "${NEW_USER}@${NEW_IP}:/tmp/caddy_offline"
}

Run-RemoteScript -ScriptContent $provisionScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP
Show-Log "Provisioning VPS selesai." "Green"

# ============================================================
# FASE 2: CLONE, ENV SETUP, NPM INSTALL, BUILD & START
# ============================================================
Show-Header "FASE 2: SETUP PROJECT ABSENTA & CLONE"
Show-Log "Mengambil kode terbaru dan mengompilasi Project Absenta..." "Yellow"

$setupScript = @"
set -e
mkdir -p /var/www/$TARGET_SUBDIR
exec > >(tee -a /tmp/deploy_absenta.log) 2>&1
echo "=== MEMULAI REMOTE DEPLOYMENT ABSENTA - `$(date) ==="

# Kloning/Update Repo
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

cd /var/www/$TARGET_SUBDIR

# Backend Setup
cp absenta_backend/.env.example absenta_backend/.env || true
sed -i "s|^PORT=.*|PORT=$B_PORT|g" absenta_backend/.env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|g" absenta_backend/.env
sed -i "s|^NODE_NAME=.*|NODE_NAME=$NODE_NAME|g" absenta_backend/.env
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

# Frontend Setup
cp absenta_frontend/.env.example absenta_frontend/.env || true
sed -i "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=$FRONTEND_API_BASE_URL|g" absenta_frontend/.env
sed -i "s|^VITE_PROXY_TARGET=.*|VITE_PROXY_TARGET=http://localhost:$B_PORT|g" absenta_frontend/.env
sed -i "s|^PORT=.*|PORT=$F_PORT|g" absenta_frontend/.env

# Install & Build Backend
cd absenta_backend
npm install
npx prisma generate
npx prisma db push --accept-data-loss || echo "Prisma DB push dilewati atau gagal."
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

echo '$SUDO_PASS' | sudo -S env PATH=`${PATH}:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || \
echo '$SUDO_PASS' | sudo -S env PATH=`${PATH}:/usr/local/bin pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || true
pm2 save

# Configure Caddyfile
if [ "$DEPLOY_SCENARIO" != "local" ]; then
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

    echo "`$CADDY_HOSTS {" > /tmp/Caddyfile
    echo "    reverse_proxy /api/* localhost:$B_PORT" >> /tmp/Caddyfile
    echo "    reverse_proxy /socket.io/* localhost:$B_PORT" >> /tmp/Caddyfile
    echo "    reverse_proxy /* localhost:$F_PORT" >> /tmp/Caddyfile
    echo "    encode gzip zstd" >> /tmp/Caddyfile
    if [ ! -z "$CF_TOKEN" ]; then
        echo "    tls {" >> /tmp/Caddyfile
        echo "        dns cloudflare $CF_TOKEN" >> /tmp/Caddyfile
        echo "    }" >> /tmp/Caddyfile
    fi
    echo "}" >> /tmp/Caddyfile
    echo '$SUDO_PASS' | sudo -S cp /tmp/Caddyfile /etc/caddy/Caddyfile
fi

echo '$SUDO_PASS' | sudo -S systemctl enable caddy
echo '$SUDO_PASS' | sudo -S systemctl restart caddy
"@

Run-RemoteScript -ScriptContent $setupScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP

# ============================================================
# FASE 3: VERIFIKASI AKHIR
# ============================================================
Show-Header "VERIFIKASI STATUS LAYANAN"
Show-Log "Memeriksa status layanan Absenta..." "Yellow"

$verifyScript = @"
echo "--- STATUS PROSES PM2 ---"
pm2 status

echo -n "Status Caddy Server: "
if systemctl is-active --quiet caddy; then echo -e "\e[1;32mACTIVE\e[0m"; else echo -e "\e[1;31mINACTIVE\e[0m"; fi
"@

& ssh -i "$SAFE_NEW_KEY" -o StrictHostKeyChecking=no "${NEW_USER}@${NEW_IP}" "$verifyScript"

Show-Header "DEPLOY SELESAI!"
Show-Log "Project Absenta berhasil di-deploy ke domain: $TARGET_DOMAIN!" "Green"
Write-Host ""
Show-Log "Log deploy disimpan di: $LOG_FILE" "Cyan"
Write-Host ""

Stop-Transcript
Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
