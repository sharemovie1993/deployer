# deploy-undangan-remote.ps1 - Skrip Deploy Undangan Digital Terisolasi (VPS Linux)
# Men-deploy Webapp Undangan Digital (Fastify + Vite React + Prisma) secara remote via SSH

param(
    [string]$TargetIP,
    [string]$TargetUser = "asepsuryadi",
    [string]$KeyPath,
    [string]$SudoPass,
    [string]$TargetDomain,
    [string]$BackendPort = "4001",
    [string]$LicenseServerUrl = "https://api.absenta.id",
    [string]$JwtSecret = "super-secret-jwt-key-undangan-digital-2026",
    [string]$DbUrl = "file:./dev.db",
    [string]$sslScenario = "auto",
    [string]$cfToken = "",
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "deploy-undangan-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Get-EnvValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$DefaultValue = ""
    )
    if (Test-Path $Path) {
        $lines = Get-Content $Path
        foreach ($line in $lines) {
            $line = $line.Trim()
            if ($line.StartsWith("#") -or $line -notmatch "=") { continue }
            $parts = $line -split '=', 2
            $k = $parts[0].Trim()
            $v = $parts[1].Trim()
            if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
            elseif ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
            if ($k -eq $Key) { return $v }
        }
    }
    return $DefaultValue
}

function Show-Header {
    param([string]$Title)
    if (-not $Silent) { Clear-Host }
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "         DEPLOYER - UNDANGAN DIGITAL (STUDIO & PRINT READY VPS)           " -ForegroundColor Yellow -Bold
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
    Show-Log "Mencoba mematikan proses apt/dpkg yang menggantung..." "Yellow"

    $killScript = @"
set +e
echo "=== KILL APT PROCESSES ==="
LOCK_PIDS=`$(ps aux | awk '/apt-get|dpkg|aptitude|unattended-upgrade/ && !/awk/ {print `$2}' | tr '\n' ' ')
if [ -n "`$LOCK_PIDS" ]; then
    echo "Ditemukan proses aktif: `$LOCK_PIDS"
    for pid in `$LOCK_PIDS; do
        echo '$SudoPass' | sudo -S kill -9 `$pid 2>/dev/null || true
    done
    sleep 1
fi
echo '$SudoPass' | sudo -S rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null || true
echo '$SudoPass' | sudo -S dpkg --configure -a 2>/dev/null || true
echo "VERIFIED_CLEAN"
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
if ($Silent) {
    $NEW_IP = $TargetIP
    $NEW_USER = if ($TargetUser) { $TargetUser } else { "asepsuryadi" }
    $NEW_KEY_SOURCE = $KeyPath
    $SUDO_PASS = $SudoPass
    $preDeployChoice = "1"
    
    if ([string]::IsNullOrWhiteSpace($NEW_IP)) {
        Write-Host "IP VPS tidak boleh kosong!" -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path $NEW_KEY_SOURCE)) {
        Write-Host "Error: File SSH Key tidak ditemukan di '$NEW_KEY_SOURCE'" -ForegroundColor Red
        exit 1
    }
} else {
    Show-Header "Konfigurasi Koneksi VPS Target"
    $NEW_IP = (Read-Host "Masukkan IP VPS Target (Contoh: 103.196.155.87 atau 10.10.10.99)").Trim()
    $NEW_USER = "asepsuryadi"

    if ([string]::IsNullOrWhiteSpace($NEW_IP)) {
        Write-Host "IP VPS tidak boleh kosong!" -ForegroundColor Red
        exit 1
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
        exit 1
    }

    $SUDO_PASS = (Read-Host "Masukkan password sudo VPS [g1g1G1NGSUL*!2]").Trim()
    if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "g1g1G1NGSUL*!2" }

    # Bersihkan Locks
    Write-Host "`nOpsi Perbaikan Dpkg/Apt Locks:"
    Write-Host " 1) Lanjutkan ke Deploy (Default)"
    Write-Host " 2) Bersihkan locks terlebih dahulu"
    Write-Host " 3) Bersihkan + Lanjutkan Deploy"
    $preDeployChoice = Read-Host "Pilih [1-3]"
}

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_NEW_KEY = "$env:TEMP\undangan-deploy-key.pem"
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
        exit 0
    }
}

# ============================================================
# FASE PARAMETER SPESIFIK PROJECT UNDANGAN DIGITAL
# ============================================================
Show-Header "Parameter Project Undangan Digital"

$localBackendEnv = Join-Path $PSScriptRoot "..\Project Undangan Digital\backend\.env"
$defaultBPort = Get-EnvValue -Path $localBackendEnv -Key "PORT" -DefaultValue "4001"
$defaultLicenseServer = Get-EnvValue -Path $localBackendEnv -Key "LICENSE_SERVER_URL" -DefaultValue "https://api.absenta.id"
$defaultJwt = Get-EnvValue -Path $localBackendEnv -Key "JWT_SECRET" -DefaultValue "super-secret-jwt-key-undangan-digital-2026"
$defaultDb = Get-EnvValue -Path $localBackendEnv -Key "DATABASE_URL" -DefaultValue "file:./dev.db"

$REPO_URL = "https://github.com/sharemovie1993/undangan-digital.git"
$TARGET_SUBDIR = "undangan-digital"

if ($Silent) {
    $TARGET_DOMAIN = $TargetDomain
    $B_PORT = if ($BackendPort) { $BackendPort } else { $defaultBPort }
    $LICENSE_SERVER_URL = if ($LicenseServerUrl) { $LicenseServerUrl } else { $defaultLicenseServer }
    $JWT_SECRET = if ($JwtSecret) { $JwtSecret } else { $defaultJwt }
    $DB_URL = if ($DbUrl) { $DbUrl } else { $defaultDb }
    $SSL_SCENARIO = if ($sslScenario) { $sslScenario } else { "auto" }
    $CF_TOKEN = $cfToken
} else {
    $TARGET_DOMAIN = (Read-Host "Masukkan Domain / Subdomain untuk Undangan Digital (contoh: undangan.absenta.id atau $NEW_IP)").Trim()
    if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) { $TARGET_DOMAIN = $NEW_IP }

    $B_PORT = (Read-Host "Masukkan Port Backend API [$defaultBPort]").Trim()
    if ([string]::IsNullOrWhiteSpace($B_PORT)) { $B_PORT = $defaultBPort }

    $LICENSE_SERVER_URL = (Read-Host "Masukkan URL Server Lisensi [$defaultLicenseServer]").Trim()
    if ([string]::IsNullOrWhiteSpace($LICENSE_SERVER_URL)) { $LICENSE_SERVER_URL = $defaultLicenseServer }

    $JWT_SECRET = (Read-Host "Masukkan JWT Secret Key [$defaultJwt]").Trim()
    if ([string]::IsNullOrWhiteSpace($JWT_SECRET)) { $JWT_SECRET = $defaultJwt }

    Write-Host "`nPilih Database Storage:"
    Write-Host " 1) SQLite File Embedded (dev.db - Sangat Ringan & Cepat, Default)"
    Write-Host " 2) PostgreSQL URL Manual"
    $dbChoice = Read-Host "Pilih [1-2] (Default: 1)"
    if ($dbChoice -eq "2") {
        $DB_URL = (Read-Host "Masukkan URL PostgreSQL (contoh: postgresql://postgres:pass@localhost:5432/undangan)").Trim()
        if ([string]::IsNullOrWhiteSpace($DB_URL)) { $DB_URL = "file:./dev.db" }
    } else {
        $DB_URL = "file:./dev.db"
    }

    Write-Host "`nPilih Skenario SSL Caddy:"
    Write-Host " 1) Otomatis Let's Encrypt / HTTPS Standar (Default untuk Domain Publik)"
    Write-Host " 2) Cloudflare DNS-01 Challenge"
    Write-Host " 3) Internal Self-Signed (Caddy Local CA / IP Address)"
    $sslChoice = Read-Host "Pilih [1-3] (Default: 1)"
    $CF_TOKEN = ""
    if ($sslChoice -eq "2") {
        $SSL_SCENARIO = "cloudflare"
        $CF_TOKEN = (Read-Host "Masukkan Cloudflare API Token").Trim()
    } elseif ($sslChoice -eq "3") {
        $SSL_SCENARIO = "internal"
    } else {
        $SSL_SCENARIO = "auto"
    }
}

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
# FASE 1: PROVISIONING VPS TARGET
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
echo '$SUDO_PASS' | sudo -S apt-get install -y curl git tar ufw build-essential wireguard wireguard-tools openresolv

# Sudoers Passwordless untuk Easy-Tunnel WireGuard Engine
echo "${NEW_USER} ALL=(ALL) NOPASSWD: /usr/bin/wg-quick, /usr/bin/wg, /usr/sbin/wg-quick, /usr/sbin/wg, /usr/bin/ip, /usr/sbin/ip, /usr/bin/systemctl, /usr/bin/ln, /usr/bin/rm, /usr/bin/chmod, /usr/bin/apt-get, /usr/bin/dpkg" > /tmp/99-easy-tunnel-undangan
echo '$SUDO_PASS' | sudo -S cp /tmp/99-easy-tunnel-undangan /etc/sudoers.d/99-easy-tunnel-undangan
echo '$SUDO_PASS' | sudo -S chown root:root /etc/sudoers.d/99-easy-tunnel-undangan
echo '$SUDO_PASS' | sudo -S chmod 0440 /etc/sudoers.d/99-easy-tunnel-undangan
rm -f /tmp/99-easy-tunnel-undangan

# Enable IPv4 Forwarding
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf >/dev/null || true
echo '$SUDO_PASS' | sudo -S sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true

# Install Node.js 20 LTS
if ! command -v node &>/dev/null; then
    echo "Memasang Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    echo '$SUDO_PASS' | sudo -S apt-get install -y nodejs
fi

# Install PM2
if ! command -v pm2 &>/dev/null; then
    echo "Memasang PM2 Process Manager..."
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
        echo "Memasang Web Server Caddy..."
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

echo '$SUDO_PASS' | sudo -S mkdir -p /var/www/$TARGET_SUBDIR
echo '$SUDO_PASS' | sudo -S chown -R ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR
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
# FASE 2: CLONE, ENV, PRISMA, BUILD & START
# ============================================================
Show-Header "FASE 2: SETUP PROJECT UNDANGAN DIGITAL & CLONE"
Show-Log "Mengambil kode terbaru dan mengompilasi Undangan Digital..." "Yellow"

$caddyHostHeader = if ($SSL_SCENARIO -eq "cloudflare" -and $CF_TOKEN) {
    "$TARGET_DOMAIN, *.$TARGET_DOMAIN"
} elseif ($SSL_SCENARIO -eq "internal") {
    "$TARGET_DOMAIN"
} elseif ($TARGET_DOMAIN -match '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$') {
    "http://$TARGET_DOMAIN, http://:80"
} else {
    "$TARGET_DOMAIN"
}

$caddyTlsBlock = if ($SSL_SCENARIO -eq "cloudflare" -and $CF_TOKEN) {
@"
    tls {
        dns cloudflare $CF_TOKEN
    }
"@
} elseif ($SSL_SCENARIO -eq "internal") {
@"
    tls internal
"@
} else {
    ""
}

$setupScript = @"
set -e
mkdir -p /var/www/$TARGET_SUBDIR
exec > >(tee -a /tmp/deploy_undangan.log) 2>&1
echo "=== MEMULAI REMOTE DEPLOYMENT UNDANGAN DIGITAL - `$(date) ==="

# Hentikan PM2 dan Caddy sementara
echo "Menghentikan proses PM2 undangan-backend (jika ada)..."
pm2 delete undangan-backend || true
echo '$SUDO_PASS' | sudo -S systemctl stop caddy || true

# Kloning / Update Repo
if [ ! -d "/var/www/$TARGET_SUBDIR/.git" ] || [ ! -d "/var/www/$TARGET_SUBDIR/backend" ]; then
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

# -------------------------------------------------------------
# Konfigurasi Backend
# -------------------------------------------------------------
cd /var/www/$TARGET_SUBDIR/backend
mkdir -p uploads

cat << 'EOF' > .env
PORT=$B_PORT
DATABASE_URL="$DB_URL"
JWT_SECRET="$JWT_SECRET"
LICENSE_SERVER_URL="$LICENSE_SERVER_URL"
EOF

echo "Menginstal dependensi Backend..."
npm install
echo "Generate Prisma Client & Sinkronisasi DB..."
npx prisma generate
npx prisma db push --accept-data-loss || echo "Prisma db push dilewati/gagal."
echo "Mengompilasi TypeScript Backend..."
npm run build

# -------------------------------------------------------------
# Konfigurasi Frontend
# -------------------------------------------------------------
cd /var/www/$TARGET_SUBDIR/frontend

cat << 'EOF' > .env
VITE_API_URL=""
EOF

echo "Menginstal dependensi Frontend..."
npm install
echo "Membangun Static Frontend Vite..."
npm run build

# -------------------------------------------------------------
# PM2 Daemon Setup
# -------------------------------------------------------------
cd /var/www/$TARGET_SUBDIR

cat << 'EOF' > ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'undangan-backend',
      cwd: '/var/www/$TARGET_SUBDIR/backend',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: $B_PORT
      }
    }
  ]
};
EOF

pm2 delete ecosystem.config.js || true
pm2 start ecosystem.config.js
echo '$SUDO_PASS' | sudo -S env PATH=`${PATH}:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || \
echo '$SUDO_PASS' | sudo -S env PATH=`${PATH}:/usr/local/bin pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || true
pm2 save

# Pastikan permission folder static frontend dapat diakses oleh user caddy
echo '$SUDO_PASS' | sudo -S chmod 755 /var/www /var/www/$TARGET_SUBDIR /var/www/$TARGET_SUBDIR/frontend
echo '$SUDO_PASS' | sudo -S chmod -R 755 /var/www/$TARGET_SUBDIR/frontend/dist 2>/dev/null || true

# Hentikan web server lain yang mungkin memakai port 80/443
echo '$SUDO_PASS' | sudo -S systemctl stop nginx 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S systemctl stop apache2 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S systemctl disable nginx 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S systemctl disable apache2 2>/dev/null || true

# -------------------------------------------------------------
# Caddy Web Server & Reverse Proxy Setup
# -------------------------------------------------------------
cat << 'EOF_CADDY' > /tmp/Caddyfile
$caddyHostHeader {
    root * /var/www/$TARGET_SUBDIR/frontend/dist

    # Reverse proxy backend API endpoints
    reverse_proxy /api/* localhost:$B_PORT
    reverse_proxy /uploads/* localhost:$B_PORT
    reverse_proxy /health localhost:$B_PORT

    # SPA routing fallback
    try_files {path} /index.html
    file_server

    encode gzip zstd
$caddyTlsBlock
}
EOF_CADDY

echo '$SUDO_PASS' | sudo -S cp /tmp/Caddyfile /etc/caddy/Caddyfile
echo "Validasi konfigurasi Caddyfile..."
echo '$SUDO_PASS' | sudo -S caddy validate --config /etc/caddy/Caddyfile || true
echo '$SUDO_PASS' | sudo -S systemctl enable caddy
echo '$SUDO_PASS' | sudo -S systemctl restart caddy || {
    echo "Caddy restart gagal, memeriksa log detail terbaru:"
    sudo journalctl -u caddy.service -n 25 --no-pager || true
    exit 1
}
"@

Run-RemoteScript -ScriptContent $setupScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP
Show-Log "Setup dan build Undangan Digital berhasil." "Green"

# ============================================================
# FASE 3: VERIFIKASI AKHIR
# ============================================================
Show-Header "VERIFIKASI STATUS LAYANAN"
Show-Log "Memeriksa status layanan Undangan Digital..." "Yellow"

$verifyScript = @'
echo -e "\n=========================================================================="
echo -e "             STATUS LAYANAN UNDANGAN DIGITAL PADA VPS TARGET"
echo -e "=========================================================================="

echo -e "\n---> STATUS PROSES PM2:"
pm2 status

echo -e "\n---> STATUS WEB SERVER CADDY:"
if systemctl is-active --quiet caddy; then
    echo -e 'Status Caddy: \033[1;32mRUNNING (ACTIVE)\033[0m'
else
    echo -e 'Status Caddy: \033[1;31mFAILED (INACTIVE)\033[0m'
    echo -e "\n[LOG DETAIL KESALAHAN CADDY TERBARU]:"
    sudo systemctl status caddy --no-pager -n 10
fi
echo -e "==========================================================================\n"
'@

Run-RemoteScript -ScriptContent $verifyScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP

Show-Header "DEPLOY SELESAI!"
Show-Log "Project Undangan Digital berhasil di-deploy ke: https://$TARGET_DOMAIN" "Green"
Write-Host ""
Show-Log "Log deploy disimpan di: $LOG_FILE" "Cyan"
Write-Host ""

Stop-Transcript
if (-not $Silent) {
    Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
}
