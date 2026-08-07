# easy-migrate.ps1 - Skrip Eksekusi Migrasi VPS (Old to New)
# Otomatis Mem-backup, Provisioning, dan Me-restore Ekosistem Absenta.id

$ErrorActionPreference = "Stop"

$LOG_FILE = "$PSScriptRoot\migration-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Show-Header {
    param([string]$Title)
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "                EASY MIGRATE - SERVER LISENSI & ABSENTA.ID                " -ForegroundColor Yellow
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " -> $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

Show-Header "Persiapan Migrasi"

$OLD_IP = (Read-Host "Masukkan IP VPS Sumber/Lama (Contoh: 103.129.148.127)").Trim()
$OLD_USER = "asepsuryadi"

$NEW_IP = (Read-Host "Masukkan IP VPS Tujuan/Baru (Contoh: 103.196.155.87)").Trim()
$NEW_USER = "asepsuryadi"

if ([string]::IsNullOrWhiteSpace($OLD_IP) -or [string]::IsNullOrWhiteSpace($NEW_IP)) {
    Write-Host "IP tidak boleh kosong!" -ForegroundColor Red
    exit
}

Write-Host "Pilih SSH Key untuk VPS Sumber/Lama:"
Write-Host " 1) nginxonly.pem"
Write-Host " 2) ls-key.pem"
Write-Host " 3) Input path file manual..."
$oldKeyChoice = Read-Host "Pilih [1-3]"
if ($oldKeyChoice -eq "1") { $OLD_KEY = Join-Path $PSScriptRoot "nginxonly.pem" }
elseif ($oldKeyChoice -eq "2") { $OLD_KEY = Join-Path $PSScriptRoot "ls-key.pem" }
else { $OLD_KEY = Read-Host "Masukkan path absolut file .pem untuk VPS Sumber" }

Write-Host "Pilih SSH Key untuk VPS Tujuan/Baru:"
Write-Host " 1) nginxonly.pem"
Write-Host " 2) ls-key.pem"
Write-Host " 3) Input path file manual..."
$newKeyChoice = Read-Host "Pilih [1-3]"
if ($newKeyChoice -eq "1") { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "nginxonly.pem" }
elseif ($newKeyChoice -eq "2") { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "ls-key.pem" }
else { $NEW_KEY_SOURCE = Read-Host "Masukkan path absolut file .pem untuk VPS Tujuan" }
$SUDO_PASS_OLD = (Read-Host "Masukkan password sudo VPS Lama [g1g1G1NGSUL*!2]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS_OLD)) { $SUDO_PASS_OLD = "g1g1G1NGSUL*!2" }

$SUDO_PASS_NEW = (Read-Host "Masukkan password sudo VPS Baru [g1g1G1NGSUL*!2]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS_NEW)) { $SUDO_PASS_NEW = "g1g1G1NGSUL*!2" }

Show-Log "VPS Lama: $OLD_IP (User: $OLD_USER)"
Show-Log "VPS Baru: $NEW_IP (User: $NEW_USER)"

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya (UNPROTECTED PRIVATE KEY FILE)
$SAFE_OLD_KEY = "$env:TEMP\old-key-safe.pem"
Copy-Item $OLD_KEY $SAFE_OLD_KEY -Force
icacls $SAFE_OLD_KEY /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):F" /q

$SAFE_NEW_KEY = "$env:TEMP\new-key-safe.pem"
Copy-Item $NEW_KEY_SOURCE $SAFE_NEW_KEY -Force
icacls $SAFE_NEW_KEY /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):F" /q

$SSH_OLD = "ssh -i $SAFE_OLD_KEY -o StrictHostKeyChecking=no ${OLD_USER}@${OLD_IP}"
$SCP_OLD = "scp -i $SAFE_OLD_KEY -o StrictHostKeyChecking=no"
$SSH_NEW = "ssh -i $SAFE_NEW_KEY -o StrictHostKeyChecking=no ${NEW_USER}@${NEW_IP}"
$SCP_NEW = "scp -i $SAFE_NEW_KEY -o StrictHostKeyChecking=no"

$LOCAL_BACKUP_DIR = "$env:TEMP\vps_backup"
if (-not (Test-Path $LOCAL_BACKUP_DIR)) { New-Item -ItemType Directory -Force -Path $LOCAL_BACKUP_DIR | Out-Null }

function Run-RemoteScript {
    param([string]$ScriptContent, [string]$SSHCmd, [string]$SCPCmd, [string]$TargetUser, [string]$TargetIP)
    $tempScript = "$env:TEMP\remote_script.sh"
    # Tulis file tanpa BOM untuk mencegah masalah di bash linux
    $ScriptContent = $ScriptContent -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($tempScript, $ScriptContent)
    Invoke-Expression "$SCPCmd $tempScript ${TargetUser}@${TargetIP}:/tmp/remote_script.sh"
    $runCmd = "$SSHCmd `"bash /tmp/remote_script.sh`""
    Invoke-Expression $runCmd
    if ($LASTEXITCODE -ne 0) {
        throw "Eksekusi script remote gagal dengan Exit Code $LASTEXITCODE"
    }
}

# ---------------------------------------------------------
# FASE 1: BACKUP DARI VPS LAMA
# ---------------------------------------------------------
Show-Header "FASE 1: BACKUP DARI VPS LAMA"
Show-Log "Memulai proses backup data dari VPS Lama ($OLD_IP)..." "Yellow"

$backupScript = @"
#!/bin/bash
set -e
echo '$SUDO_PASS_OLD' | sudo -S rm -rf /tmp/vps_backup.tar.gz
echo '$SUDO_PASS_OLD' | sudo -S touch /var/www/licensing-server/licenses.db
echo '$SUDO_PASS_OLD' | sudo -S tar -czf /tmp/vps_backup.tar.gz -C /var/www/licensing-server licenses.db .env -C /var/www absenta.id -C /etc wireguard
echo '$SUDO_PASS_OLD' | sudo -S chown ${OLD_USER}:${OLD_USER} /tmp/vps_backup.tar.gz
echo 'Backup selesai dikompresi di VPS lama.'
"@

Run-RemoteScript -ScriptContent $backupScript -SSHCmd $SSH_OLD -SCPCmd $SCP_OLD -TargetUser $OLD_USER -TargetIP $OLD_IP

Show-Log "Mengunduh file backup ke komputer lokal..." "Yellow"
Invoke-Expression "$SCP_OLD ${OLD_USER}@${OLD_IP}:/tmp/vps_backup.tar.gz $LOCAL_BACKUP_DIR\vps_backup.tar.gz"
Show-Log "Backup berhasil diunduh ke $LOCAL_BACKUP_DIR\vps_backup.tar.gz" "Green"

# ---------------------------------------------------------
# FASE 2: PROVISIONING VPS BARU
# ---------------------------------------------------------
Show-Header "FASE 2: PROVISIONING VPS BARU"

# Salin Caddy Offline (dengan plugin Cloudflare) ke VPS baru jika ada di komputer lokal
$LOCAL_CADDY = Join-Path $PSScriptRoot "caddy-bin\caddy"
if (Test-Path $LOCAL_CADDY) {
    Show-Log "Menemukan Caddy Offline lokal (Cloudflare DNS). Menyalin ke VPS Baru..." "Yellow"
    Invoke-Expression "$SCP_NEW `"$LOCAL_CADDY`" ${NEW_USER}@${NEW_IP}:/tmp/caddy_offline"
}

Show-Log "Menghubungkan ke VPS Baru ($NEW_IP) untuk instalasi dependensi..." "Yellow"

$provisionScript = @"
#!/bin/bash
set -e
echo '$SUDO_PASS_NEW' | sudo -S apt-get update -y
echo '$SUDO_PASS_NEW' | sudo -S apt-get install -y curl git tar wireguard
# Enable IP Forwarding (Krusial untuk WireGuard VPN)
echo '$SUDO_PASS_NEW' | sudo -S sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
# Install Node 20 (Sesuai dengan versi lama)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
echo '$SUDO_PASS_NEW' | sudo -S apt-get install -y nodejs
# Install PM2
echo '$SUDO_PASS_NEW' | sudo -S npm install -g pm2
# Install Caddy
echo '$SUDO_PASS_NEW' | sudo -S apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
echo '$SUDO_PASS_NEW' | sudo -S apt-get update -y
echo '$SUDO_PASS_NEW' | sudo -S apt-get install -y caddy

# Pasang Caddy Offline (dengan plugin Cloudflare) jika ada
if [ -f /tmp/caddy_offline ]; then
    echo "Mengganti Caddy bawaan dengan Caddy Offline (Cloudflare DNS)..."
    echo '$SUDO_PASS_NEW' | sudo -S systemctl stop caddy || true
    echo '$SUDO_PASS_NEW' | sudo -S cp /tmp/caddy_offline /usr/bin/caddy
    echo '$SUDO_PASS_NEW' | sudo -S chmod +x /usr/bin/caddy
fi

# Buat Caddyfile placeholder dengan hak akses read/write
echo '$SUDO_PASS_NEW' | sudo -S touch /etc/caddy/Caddyfile
echo '$SUDO_PASS_NEW' | sudo -S chmod 666 /etc/caddy/Caddyfile
# Siapkan folder
echo '$SUDO_PASS_NEW' | sudo -S mkdir -p /var/www
echo '$SUDO_PASS_NEW' | sudo -S chown ${NEW_USER}:${NEW_USER} /var/www
echo 'Provisioning dasar selesai.'
"@

Run-RemoteScript -ScriptContent $provisionScript -SSHCmd $SSH_NEW -SCPCmd $SCP_NEW -TargetUser $NEW_USER -TargetIP $NEW_IP
Show-Log "Instalasi dependensi di VPS Baru selesai." "Green"

# ---------------------------------------------------------
# FASE 3: RESTORE & SETUP VPS BARU
# ---------------------------------------------------------
Show-Header "FASE 3: RESTORE & SETUP VPS BARU"
Show-Log "Mengunggah file backup ke VPS Baru..." "Yellow"
Invoke-Expression "$SCP_NEW $LOCAL_BACKUP_DIR\vps_backup.tar.gz ${NEW_USER}@${NEW_IP}:/tmp/vps_backup.tar.gz"

$restoreScript = @"
#!/bin/bash
set -e
# 1. Kloning Repo
cd /var/www
if [ ! -d "/var/www/licensing-server/.git" ]; then
    rm -rf /var/www/licensing-server || true
    git clone https://github.com/sharemovie1993/server-lisensi.git licensing-server
else
    cd licensing-server
    git pull origin master
fi

# 2. Ekstrak Backup (licenses.db, .env, absenta.id, wireguard)
cd /tmp
if [ -f "vps_backup.tar.gz" ]; then
    tar -xf vps_backup.tar.gz
    # Pindahkan absenta.id
    cp -r absenta.id /var/www/
    # Pindahkan database dan env
    cp licenses.db /var/www/licensing-server/ 2>/dev/null || true
    cp .env /var/www/licensing-server/
    # Pindahkan wireguard (butuh sudo)
    echo '$SUDO_PASS_NEW' | sudo -S cp -r wireguard /etc/
fi

# 2b. Sanitize & Update .env with New Domain
cd /var/www/licensing-server
if [ -f ".env" ]; then
    # Hapus character NULL (\0) jika ada akibat masalah encoding UTF-16
    tr -d '\0' < .env > .env.tmp && mv .env.tmp .env
    
    # Ekstrak MAIN_DOMAIN lama sebelum dihapus
    OLD_DOM=`$(grep -oP '(?<=MAIN_DOMAIN=).*' .env | tr -d ' ' || echo "absenta.id")
    if [ -z "`$OLD_DOM" ]; then
        OLD_DOM=`$(tr -d ' \0' < .env | grep -oP '(?<=MAIN_DOMAIN=).*' || echo "absenta.id")
    fi
    
    # Hapus baris MAIN_DOMAIN lama (baik format normal maupun berjarak/spaced)
    sed -i '/MAIN_DOMAIN/d' .env
    sed -i '/M.*A.*I.*N.*_.*D.*O.*M.*A.*I.*N/d' .env
    
    # Tentukan domain akhir: jika input NEW_IP berupa IP Address, gunakan domain lama (OLD_DOM).
    # Jika input berupa domain name, gunakan domain baru (NEW_IP).
    if [[ "$NEW_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        FINAL_DOM="`$OLD_DOM"
    else
        FINAL_DOM="$NEW_IP"
    fi
    
    # Tambahkan MAIN_DOMAIN baru
    echo "MAIN_DOMAIN=`$FINAL_DOM" >> .env
    echo "[Easy-Migrate] .env berhasil diperbarui dengan MAIN_DOMAIN=`$FINAL_DOM"
fi



# 3. NPM Install, Generate Prisma & Mulai Server
cd /var/www/licensing-server
npm install --production
npx prisma generate
# Gunakan restart jika sudah berjalan agar idempotent
if pm2 status | grep -q "licensing-server"; then
    pm2 restart licensing-server --update-env
else
    pm2 start ecosystem.config.js
fi
pm2 save
echo '$SUDO_PASS_NEW' | sudo -S env PATH=`$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER || true

# 4. Restart WireGuard & Sync Caddy
echo '$SUDO_PASS_NEW' | sudo -S systemctl enable wg-quick@wg0
echo '$SUDO_PASS_NEW' | sudo -S systemctl restart wg-quick@wg0
echo "Menunggu koneksi database PostgreSQL terhubung (ping 10.0.0.2)..."
echo "TIPS: Jika koneksi tertunda, silakan jalankan 'ping -t 10.0.0.1' di CMD Windows Anda atau toggle (Deactivate/Activate) WireGuard Anda untuk memicu handshake."
for i in {1..30}; do
    if ping -c 1 -W 1 10.0.0.2 &>/dev/null; then
        echo "WireGuard VPN terhubung sukses ke database!"
        break
    fi
    echo "Menunggu koneksi VPN... (`$i/30)"
    sleep 1
done
echo '$SUDO_PASS_NEW' | sudo -S node scripts/sync-caddy.js

# 5. TAHAP VERIFIKASI
echo ""
echo -e "\e[1;36m==========================================================\e[0m"
echo -e "\e[1;33m      VERIFIKASI STATUS LAYANAN (IDEMPOTENT RUN)      \e[0m"
echo -e "\e[1;36m==========================================================\e[0m"

echo -n "[1] Status PM2 Server Lisensi: "
if pm2 status | grep -q "licensing-server.*online"; then
    echo -e "\e[1;32m✅ ONLINE\e[0m"
else
    echo -e "\e[1;31m❌ OFFLINE / ERROR\e[0m"
fi

echo -n "[2] Status WireGuard (wg0): "
if echo '$SUDO_PASS_NEW' | sudo -S systemctl is-active --quiet wg-quick@wg0; then
    echo -e "\e[1;32m✅ ACTIVE\e[0m"
else
    echo -e "\e[1;31m❌ INACTIVE\e[0m"
fi

echo -n "[3] Status Caddy Server: "
if echo '$SUDO_PASS_NEW' | sudo -S systemctl is-active --quiet caddy; then
    echo -e "\e[1;32m✅ ACTIVE\e[0m"
else
    echo -e "\e[1;31m❌ INACTIVE\e[0m"
fi
echo -e "\e[1;36m==========================================================\e[0m"
echo ""
"@

Show-Log "Mengekstrak data dan menyalakan layanan di VPS Baru..." "Yellow"
Run-RemoteScript -ScriptContent $restoreScript -SSHCmd $SSH_NEW -SCPCmd $SCP_NEW -TargetUser $NEW_USER -TargetIP $NEW_IP

Show-Header "MIGRASI SELESAI!"
Show-Log "Semua data (License DB, .env, WireGuard configs, dan absenta.id) telah sukses dipindahkan!" "Green"
Show-Log "Server lisensi Anda sekarang berjalan di IP Baru: $NEW_IP" "Green"
Write-Host ""
Write-Host "LANGKAH SELANJUTNYA (MANUAL):" -ForegroundColor Yellow
Write-Host "1. Buka dashboard Cloudflare / registrar domain Anda."
Write-Host "2. Ubah A record untuk 'absenta.id' dan '*.absenta.id' agar menunjuk ke IP: $NEW_IP"
Write-Host "3. Cek kembali admin dashboard di: https://$NEW_IP:5001"
Write-Host ""
Write-Host "Log migrasi telah disimpan di: $LOG_FILE" -ForegroundColor Cyan
Write-Host ""

Stop-Transcript
Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
