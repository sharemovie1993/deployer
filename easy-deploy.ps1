# easy-deploy.ps1 - Skrip Deploy Universal Remote (VPS Linux)
# Dapat men-deploy berbagai proyek web secara remote via SSH

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
    Write-Host "                EASY DEPLOY - UNIVERSAL REMOTE DEPLOYER                 " -ForegroundColor Yellow -Bold
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " -> $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

Show-Header "Persiapan Koneksi VPS Target"

$NEW_IP = (Read-Host "Masukkan IP VPS Target (Contoh: 103.196.155.87)").Trim()
$NEW_USER = "asepsuryadi"

$TARGET_DOMAIN = (Read-Host "Masukkan Domain Utama (Contoh: tefatjkt.net)").Trim()

if ([string]::IsNullOrWhiteSpace($NEW_IP) -or [string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) {
    Write-Host "IP dan Domain Utama tidak boleh kosong!" -ForegroundColor Red
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
$TUNNEL_BASE_DOMAIN = "tefatjkt.net"
$LICENSE_SERVER_URL = "https://api.absenta.id"

if ($IS_SERVER_LISENSI -eq "True") {
    Write-Host "Menggunakan port default untuk Server Lisensi." -ForegroundColor Gray
} elseif ($IS_ABSENTA -eq "True") {
    Write-Host "Pilih Skenario Deployment:" -ForegroundColor White
    Write-Host " 1) SaaS / Cloud (Akses via Domain Publik, e.g. https://app.absenta.id)"
    Write-Host " 2) Lokal Sekolah (Akses via IP LAN langsung tanpa Caddy, e.g. http://10.10.10.163:5175)"
    Write-Host " 3) Hybrid (Lokal Sekolah + Caddy Proxy, e.g. http://10.10.10.163)"
    $scenarioChoice = Read-Host "Pilih [1-3] (Default: 1)"
    
    $DEPLOY_SCENARIO = "saas"
    if ($scenarioChoice -eq "2") {
        $DEPLOY_SCENARIO = "local"
    } elseif ($scenarioChoice -eq "3") {
        $DEPLOY_SCENARIO = "hybrid"
    }

    $B_PORT = (Read-Host "Masukkan Port Backend [3003]").Trim()
    if ([string]::IsNullOrWhiteSpace($B_PORT)) { $B_PORT = "3003" }
    
    $F_PORT = (Read-Host "Masukkan Port Frontend [5175]").Trim()
    if ([string]::IsNullOrWhiteSpace($F_PORT)) { $F_PORT = "5175" }
    
    $LICENSE_KEY = (Read-Host "Masukkan Kunci Lisensi Absenta (Kosongkan jika belum ada)").Trim()
    
    $TUNNEL_BASE_DOMAIN = (Read-Host "Masukkan Base Domain Easy Tunnel [tefatjkt.net]").Trim()
    if ([string]::IsNullOrWhiteSpace($TUNNEL_BASE_DOMAIN)) { $TUNNEL_BASE_DOMAIN = "tefatjkt.net" }
    
    $LICENSE_SERVER_URL = (Read-Host "Masukkan URL Server Lisensi [https://api.absenta.id]").Trim()
    if ([string]::IsNullOrWhiteSpace($LICENSE_SERVER_URL)) { $LICENSE_SERVER_URL = "https://api.absenta.id" }
    
    $DB_URL = (Read-Host "Masukkan DATABASE_URL PostgreSQL [postgresql://postgres:123123123@localhost:5432/absensi]").Trim()
    if ([string]::IsNullOrWhiteSpace($DB_URL)) {
        $DB_URL = "postgresql://postgres:123123123@localhost:5432/absensi"
    } else {
        if ($DB_URL.StartsWith("[")) { $DB_URL = $DB_URL.Substring(1) }
        if ($DB_URL.EndsWith("]")) { $DB_URL = $DB_URL.Substring(0, $DB_URL.Length - 1) }
    }
    
    $INSTALL_POSTGRES = (Read-Host "Apakah Anda ingin memasang PostgreSQL Server di VPS Linux secara otomatis? [y/N]").Trim()
    if ([string]::IsNullOrWhiteSpace($INSTALL_POSTGRES)) { $INSTALL_POSTGRES = "N" }
    
    $INSTALL_REDIS = (Read-Host "Apakah Anda ingin memasang Redis Server di VPS Linux secara otomatis? [y/N]").Trim()
    if ([string]::IsNullOrWhiteSpace($INSTALL_REDIS)) { $INSTALL_REDIS = "N" }
    
    $CF_TOKEN = ""
    if ($DEPLOY_SCENARIO -eq "saas") {
        $CF_TOKEN = (Read-Host "Masukkan Cloudflare API Token (Opsional, untuk DNS Challenge Wildcard SSL)").Trim()
    }
} else {
    $B_PORT = (Read-Host "Masukkan Port Aplikasi [3000]").Trim()
    if ([string]::IsNullOrWhiteSpace($B_PORT)) { $B_PORT = "3000" }
}

$SCHEME = "https"
if ($TARGET_DOMAIN -match "^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$") {
    $SCHEME = "http"
}
if ($DEPLOY_SCENARIO -eq "local") {
    $SCHEME = "http"
}

# Tentukan nilai URL sesuai skenario
if ($DEPLOY_SCENARIO -eq "local") {
    $BACKEND_API_URL = "http://${TARGET_DOMAIN}:${B_PORT}/api"
    $BACKEND_APP_URL = "http://${TARGET_DOMAIN}:${B_PORT}"
    $BACKEND_FRONTEND_URL = "http://${TARGET_DOMAIN}:${F_PORT}"
    $FRONTEND_API_BASE_URL = "http://${TARGET_DOMAIN}:${B_PORT}/api"
} else {
    $BACKEND_API_URL = "${SCHEME}://${TARGET_DOMAIN}/api"
    $BACKEND_APP_URL = "${SCHEME}://${TARGET_DOMAIN}"
    $BACKEND_FRONTEND_URL = "${SCHEME}://${TARGET_DOMAIN}"
    $FRONTEND_API_BASE_URL = "/api"
}

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

# ---------------------------------------------------------
# FASE 1: PROVISIONING SERVER
# ---------------------------------------------------------
Show-Header "FASE 1: PROVISIONING VPS TARGET"
Show-Log "Menghubungkan ke VPS ($NEW_IP) untuk instalasi dependensi..." "Yellow"

$provisionScript = @"
set -e
echo '$SUDO_PASS' | sudo -S apt-get update -y
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
        MD5_OFFLINE=`$(md5sum /tmp/caddy_offline | awk '{print `$1}')
        MD5_INSTALLED=`$(md5sum /usr/bin/caddy | awk '{print `$1}')
        if [ "`$MD5_OFFLINE" = "`$MD5_INSTALLED" ]; then
            echo "Caddy kustom offline sudah sama dengan yang terpasang. Melewati pembaruan binary."
            NEEDS_COPY=false
        fi
    fi

    if [ "`$NEEDS_COPY" = "true" ]; then
        echo "Memasang Caddy menggunakan berkas kustom offline..."
        if ! command -v caddy &>/dev/null; then
            echo '$SUDO_PASS' | sudo -S apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
            curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg || true
            curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
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
        echo '$SUDO_PASS' | sudo -S apt-get install -y postgresql postgresql-contrib
        echo "Mengaktifkan dan menjalankan PostgreSQL..."
        echo '$SUDO_PASS' | sudo -S systemctl enable postgresql
        echo '$SUDO_PASS' | sudo -S systemctl start postgresql
        
        # Buat database & user postgres default jika belum ada
        echo "Mengonfigurasi database absensi dan user postgres..."
        echo '$SUDO_PASS' | sudo -u postgres psql -c "ALTER USER postgres PASSWORD '123123123';" || true
        echo '$SUDO_PASS' | sudo -u postgres psql -c "CREATE DATABASE absensi;" || true
    fi
    
    if [[ "$INSTALL_REDIS" =~ ^[yY]$ ]]; then
        echo "Menginstal Redis Server secara lokal..."
        echo '$SUDO_PASS' | sudo -S apt-get install -y redis-server
        echo '$SUDO_PASS' | sudo -S systemctl enable redis-server
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
    echo "$NEW_USER ALL=(ALL) NOPASSWD: /usr/bin/wg-quick, /usr/bin/wg, /usr/sbin/wg-quick, /usr/sbin/wg" | echo '$SUDO_PASS' | sudo -S tee /etc/sudoers.d/90-wireguard >/dev/null
    echo '$SUDO_PASS' | sudo -S chmod 440 /etc/sudoers.d/90-wireguard
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
    sed -i "s|^REDIS_MODE=.*|REDIS_MODE=single|g" absenta_backend/.env
    sed -i "s|^REDIS_URL=.*|REDIS_URL=redis://localhost:6379|g" absenta_backend/.env
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
    
    # Frontend Setup
    cp absenta_frontend/.env.example absenta_frontend/.env || true
    sed -i "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=$FRONTEND_API_BASE_URL|g" absenta_frontend/.env
    sed -i "s|^VITE_PROXY_TARGET=.*|VITE_PROXY_TARGET=http://localhost:$B_PORT|g" absenta_frontend/.env
    sed -i "s|^PORT=.*|PORT=$F_PORT|g" absenta_frontend/.env

    # Install & Build Backend
    cd absenta_backend
    npm install
    npx prisma generate
    
    # Jalankan prisma db push (jika database postgresql sudah siap)
    npx prisma db push --accept-data-loss || echo "Prisma DB push dilewati atau gagal. Pastikan PostgreSQL siap."

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

    # Configure Caddyfile
    if [ "$DEPLOY_SCENARIO" != "local" ]; then
        # Deteksi apakah domain target merupakan IP address atau Domain
        if [[ "$TARGET_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            CADDY_HOSTS="$TARGET_DOMAIN"
        else
            if [ ! -z "$CF_TOKEN" ]; then
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
        echo "PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE" >> wg0.conf
        echo "PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE" >> wg0.conf
        
        echo '$SUDO_PASS' | sudo -S cp privatekey publickey wg0.conf /etc/wireguard/
        echo '$SUDO_PASS' | sudo -S chmod 600 /etc/wireguard/privatekey /etc/wireguard/wg0.conf
    fi

    cd /var/www/licensing-server
    npm install --production
    pm2 delete licensing-server || true
    pm2 start ecosystem.config.js --update-env
    pm2 save
    
    echo '$SUDO_PASS' | sudo -S env PATH=\`$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER || true
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

# 3. VERIFIKASI STATUS LAYANAN
echo ""
echo -e "\e[1;36m==========================================================\e[0m"
echo -e "\e[1;33m            VERIFIKASI STATUS LAYANAN VPS                 \e[0m"
echo -e "\e[1;36m==========================================================\e[0m"

echo "Status PM2 Processes:"
pm2 status

echo -n "Status Caddy Server: "
if echo '$SUDO_PASS' | sudo -S systemctl is-active --quiet caddy; then
    echo -e "\e[1;32m✅ ACTIVE\e[0m"
else
    echo -e "\e[1;31m❌ INACTIVE\e[0m"
fi

if [ "$IS_SERVER_LISENSI" = "True" ]; then
    echo -n "Status WireGuard (wg0): "
    if echo '$SUDO_PASS' | sudo -S systemctl is-active --quiet wg-quick@wg0; then
        echo -e "\e[1;32m✅ ACTIVE\e[0m"
    else
        echo -e "\e[1;31m❌ INACTIVE\e[0m"
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
