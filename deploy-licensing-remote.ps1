# deploy-licensing-remote.ps1 - Skrip Deploy Server Lisensi Terisolasi (VPS Linux)
# Hanya untuk men-deploy Server Lisensi (Licensing Server) secara remote via SSH

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "deploy-licensing-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}


# Helper to read values from local .env files for 1-touch deploy suggestion
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
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "            DEPLOYER - SERVER LISENSI (LICENSING SERVER VPS)              " -ForegroundColor Yellow
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
$NEW_IP = (Read-Host "Masukkan IP VPS Server Lisensi [103.196.155.87]").Trim()
$NEW_USER = "asepsuryadi"

if ([string]::IsNullOrWhiteSpace($NEW_IP)) {
    Write-Host "IP VPS tidak boleh kosong!" -ForegroundColor Red
    exit
}

Write-Host "Pilih SSH Key:"
Write-Host " 1) nginxonly.pem"
Write-Host " 2) ls-key.pem"
Write-Host " 3) Input path file manual..."
$newKeyChoice = Read-Host "Pilih [1-3] (Default: 2)"
if ($newKeyChoice -eq "1") { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "nginxonly.pem" }
elseif ($newKeyChoice -eq "3") { $NEW_KEY_SOURCE = Read-Host "Masukkan path absolut file .pem" }
else { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "ls-key.pem" }

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
$SAFE_NEW_KEY = "$env:TEMP\licensing-deploy-key.pem"
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
# FASE PARAMETER SPESIFIK SERVER LISENSI
# ============================================================
Show-Header "Parameter Server Lisensi"

$localEnvPath = Join-Path $PSScriptRoot "..\Project-Server-Lisensi\.env"
$defaultDomain = Get-EnvValue -Path $localEnvPath -Key "MAIN_DOMAIN" -DefaultValue "api.absenta.id"
$defaultCfToken = Get-EnvValue -Path $localEnvPath -Key "CLOUDFLARE_API_TOKEN" -DefaultValue ""
$defaultDbUrl = Get-EnvValue -Path $localEnvPath -Key "DATABASE_URL" -DefaultValue "postgresql://postgres:123123123@localhost:5432/orkestrator_licensing"

$TARGET_DOMAIN = (Read-Host "Masukkan Domain Utama Server Lisensi [$defaultDomain]").Trim()
if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) { $TARGET_DOMAIN = $defaultDomain }

$CF_TOKEN = (Read-Host "Masukkan Cloudflare API Token (untuk SSL Caddy, kosongkan jika tidak ada) [$defaultCfToken]").Trim()
if ([string]::IsNullOrWhiteSpace($CF_TOKEN)) { $CF_TOKEN = $defaultCfToken }
Write-Host "`nPilih Skenario Database PostgreSQL:" -ForegroundColor White
Write-Host " 1) Database Eksternal (Gunakan database terpisah / cloud / VM lain)" -ForegroundColor White
Write-Host " 2) Database Internal (Instal secara lokal di VPS ini)" -ForegroundColor White
$dbChoice = Read-Host "Pilih [1-2] (Default: 1)"

$INSTALL_POSTGRES = "N"
if ($dbChoice -eq "2") {
    $INSTALL_POSTGRES = "Y"
    $suggestedDbUrl = "postgresql://postgres:123123123@localhost:5432/orkestrator_licensing"
} else {
    $suggestedDbUrl = $defaultDbUrl
}

$DB_URL = (Read-Host "Masukkan DATABASE_URL PostgreSQL [$suggestedDbUrl]").Trim()
if ([string]::IsNullOrWhiteSpace($DB_URL)) { $DB_URL = $suggestedDbUrl }
$REPO_URL = "https://github.com/sharemovie1993/server-lisensi.git"
$TARGET_SUBDIR = "licensing-server"

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
    echo "Memasang Caddy dari file offline..."
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
        echo "Mengunduh dan memasang Caddy Server..."
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
    echo "Menginstal PostgreSQL secara lokal di VPS..."
    echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S apt-get install -y postgresql postgresql-contrib
    echo '$SUDO_PASS' | sudo -S systemctl enable postgresql 2>/dev/null
    echo '$SUDO_PASS' | sudo -S systemctl start postgresql
    cd / && echo '$SUDO_PASS' | sudo -u postgres psql -c "ALTER USER postgres PASSWORD '123123123';" || true
    if ! echo '$SUDO_PASS' | sudo -u postgres psql -t -A -c "SELECT 1 FROM pg_database WHERE datname='orkestrator_licensing'" | grep -q 1; then
        echo '$SUDO_PASS' | sudo -u postgres psql -c "CREATE DATABASE orkestrator_licensing;"
    fi
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
# FASE 2: CLONE, ENVIRONMENT, PRISMA SETUP & PM2 DEPLOY
# ============================================================
Show-Header "FASE 2: SETUP SERVER LISENSI & CLONE"
Show-Log "Mengambil kode terbaru dan mengonfigurasi Server Lisensi..." "Yellow"

$setupScript = @"
set -e
mkdir -p /var/www/$TARGET_SUBDIR
exec > >(tee -a /tmp/deploy_licensing.log) 2>&1
echo "=== MEMULAI REMOTE DEPLOYMENT SERVER LISENSI - `$(date) ==="

# Kloning/Update Repo
if [ ! -d "/var/www/$TARGET_SUBDIR/.git" ]; then
    echo '$SUDO_PASS' | sudo -S rm -rf /var/www/$TARGET_SUBDIR || true
    echo '$SUDO_PASS' | sudo -S mkdir -p /var/www/$TARGET_SUBDIR
    echo '$SUDO_PASS' | sudo -S chown -R ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR
    git clone $REPO_URL /var/www/$TARGET_SUBDIR
else
    cd /var/www/$TARGET_SUBDIR
    git fetch origin
    git reset --hard origin/master || git reset --hard origin/main
fi

cd /var/www/$TARGET_SUBDIR
cp .env.example .env || true

# Update .env
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

if grep -q "DATABASE_URL=" .env; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|g" .env
else
    echo "DATABASE_URL=$DB_URL" >> .env
fi

# Setup WireGuard VPN Server (10.0.0.1)
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
    echo "PrivateKey = `$PRV_KEY" >> wg0.conf
    echo "PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE" >> wg0.conf
    echo "PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE" >> wg0.conf

    echo '$SUDO_PASS' | sudo -S cp privatekey publickey wg0.conf /etc/wireguard/
    echo '$SUDO_PASS' | sudo -S chmod 600 /etc/wireguard/privatekey /etc/wireguard/wg0.conf
fi

cd /var/www/$TARGET_SUBDIR
npm install --production
npx prisma generate

# Sinkronisasi Skema & Seeding
npx prisma db push --accept-data-loss || echo "Prisma db push dilewati/gagal."
npx prisma db seed || echo "Prisma db seed dilewati/gagal."

# PM2 Restart
pm2 delete licensing-server || true
pm2 start ecosystem.config.js --update-env
pm2 save

echo '$SUDO_PASS' | sudo -S env PATH=`${PATH}:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER || true
echo '$SUDO_PASS' | sudo -S node scripts/sync-caddy.js
echo '$SUDO_PASS' | sudo -S systemctl enable wg-quick@wg0
echo '$SUDO_PASS' | sudo -S systemctl restart wg-quick@wg0 || true

# Verifikasi Caddy & Caddyfile
echo '$SUDO_PASS' | sudo -S systemctl enable caddy
echo '$SUDO_PASS' | sudo -S systemctl restart caddy
"@

Run-RemoteScript -ScriptContent $setupScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP

# ============================================================
# FASE 3: VERIFIKASI AKHIR
# ============================================================
Show-Header "VERIFIKASI STATUS LAYANAN"
Show-Log "Memeriksa status layanan Server Lisensi..." "Yellow"

$verifyScript = @"
echo "--- STATUS PROSES PM2 ---"
pm2 status

echo -n "Status Caddy Server: "
if systemctl is-active --quiet caddy; then echo -e "\e[1;32mACTIVE\e[0m"; else echo -e "\e[1;31mINACTIVE\e[0m"; fi

echo -n "Status WireGuard (wg0): "
if systemctl is-active --quiet wg-quick@wg0; then echo -e "\e[1;32mACTIVE\e[0m"; else echo -e "\e[1;31mINACTIVE\e[0m"; fi
"@

& ssh -i "$SAFE_NEW_KEY" -o StrictHostKeyChecking=no "${NEW_USER}@${NEW_IP}" "$verifyScript"

Show-Header "DEPLOY SELESAI!"
Show-Log "Server Lisensi berhasil di-deploy ke domain: $TARGET_DOMAIN!" "Green"
Show-Log "Gunakan dashboard admin di: https://$TARGET_DOMAIN/admin" "Green"
Write-Host ""
Show-Log "Log deploy disimpan di: $LOG_FILE" "Cyan"
Write-Host ""

Stop-Transcript
Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
