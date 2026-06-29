# easy-deploy.ps1 - Skrip Deploy Cabang Baru (Tenant Server)
# Membangun Ekosistem Server Lisensi & WireGuard dari Kosong

$ErrorActionPreference = "Stop"

$LOG_FILE = "$PSScriptRoot\deploy-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Show-Header {
    param([string]$Title)
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "                EASY DEPLOY - CABANG SERVER LISENSI BARU                " -ForegroundColor Yellow
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " -> $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

Show-Header "Persiapan Deploy Cabang Baru"

$NEW_IP = (Read-Host "Masukkan IP VPS Kosong (Contoh: 103.196.155.87)").Trim()
$NEW_USER = "asepsuryadi"

$TARGET_DOMAIN = (Read-Host "Masukkan Domain Utama untuk Server ini (Contoh: tefatjkt.net)").Trim()

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

$SUDO_PASS = "g1g1G1NGSUL*!2"

Show-Log "VPS Target: $NEW_IP (User: $NEW_USER)"
Show-Log "Domain Target: $TARGET_DOMAIN"

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_NEW_KEY = "$env:TEMP\new-deploy-key.pem"
Remove-Item $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $NEW_KEY_SOURCE | Set-Content -Path $SAFE_NEW_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_NEW_KEY -AclObject $acl

$SSH_NEW = "ssh -i $SAFE_NEW_KEY -o StrictHostKeyChecking=no ${NEW_USER}@${NEW_IP}"
$SCP_NEW = "scp -i $SAFE_NEW_KEY -o StrictHostKeyChecking=no"

function Run-RemoteScript {
    param([string]$ScriptContent, [string]$SSHCmd, [string]$SCPCmd, [string]$TargetUser, [string]$TargetIP)
    $tempScript = "$env:TEMP\remote_script.sh"
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
# FASE 1: PROVISIONING SERVER
# ---------------------------------------------------------
Show-Header "FASE 1: PROVISIONING VPS BARU"
Show-Log "Menghubungkan ke VPS ($NEW_IP) untuk instalasi dependensi..." "Yellow"

$provisionScript = @"
set -e
echo '$SUDO_PASS' | sudo -S apt-get update -y
echo '$SUDO_PASS' | sudo -S apt-get install -y curl git tar wireguard
# Enable IP Forwarding
echo '$SUDO_PASS' | sudo -S sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
# Install Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
echo '$SUDO_PASS' | sudo -S apt-get install -y nodejs
# Install PM2
echo '$SUDO_PASS' | sudo -S npm install -g pm2
# Install Caddy
echo '$SUDO_PASS' | sudo -S apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg || true
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
echo '$SUDO_PASS' | sudo -S apt-get update -y
echo '$SUDO_PASS' | sudo -S apt-get install -y caddy
# Buat Caddyfile placeholder dengan hak akses read/write
echo '$SUDO_PASS' | sudo -S touch /etc/caddy/Caddyfile
echo '$SUDO_PASS' | sudo -S chmod 666 /etc/caddy/Caddyfile
# Siapkan folder
echo '$SUDO_PASS' | sudo -S mkdir -p /var/www/$TARGET_DOMAIN
echo '$SUDO_PASS' | sudo -S chown ${NEW_USER}:${NEW_USER} /var/www/$TARGET_DOMAIN
echo 'Provisioning dasar selesai.'
"@

Run-RemoteScript -ScriptContent $provisionScript -SSHCmd $SSH_NEW -SCPCmd $SCP_NEW -TargetUser $NEW_USER -TargetIP $NEW_IP
Show-Log "Instalasi dependensi di VPS Baru selesai." "Green"

# ---------------------------------------------------------
# FASE 2: CLONE & SETUP ECOSYSTEM
# ---------------------------------------------------------
Show-Header "FASE 2: CLONE & SETUP ECOSYSTEM"
Show-Log "Melakukan clone repository dan menginisialisasi WireGuard..." "Yellow"

$setupScript = @"
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

# 2. Setup Environment Variables (.env)
cd /var/www/licensing-server
cp .env.example .env || true
# Inject MAIN_DOMAIN ke dalam file .env
if grep -q "MAIN_DOMAIN=" .env; then
    sed -i "s/MAIN_DOMAIN=.*/MAIN_DOMAIN=$TARGET_DOMAIN/g" .env
else
    echo "MAIN_DOMAIN=$TARGET_DOMAIN" >> .env
fi

# 3. Setup WireGuard (Fresh Keys)
echo '$SUDO_PASS' | sudo -S mkdir -p /etc/wireguard
mkdir -p /tmp/wireguard_setup
cd /tmp/wireguard_setup
# Generate Kunci Server jika belum ada di VPS
if ! echo '$SUDO_PASS' | sudo -S test -f /etc/wireguard/privatekey; then
    wg genkey | tee privatekey | wg pubkey | tee publickey > /dev/null
    PRV_KEY=`$(cat privatekey)
    # Buat file wg0.conf dasar
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

# 4. NPM Install & Mulai Server (Database SQLite otomatis tercipta kosong saat server.js dijalankan)
cd /var/www/licensing-server
npm install --production
if pm2 status | grep -q "licensing-server"; then
    pm2 restart licensing-server --update-env
else
    pm2 start ecosystem.config.js
fi
pm2 save
echo '$SUDO_PASS' | sudo -S env PATH=`$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER || true

# 5. Sync Caddy & Restart WireGuard
echo '$SUDO_PASS' | sudo -S node scripts/sync-caddy.js
echo '$SUDO_PASS' | sudo -S systemctl enable wg-quick@wg0
echo '$SUDO_PASS' | sudo -S systemctl restart wg-quick@wg0

# 6. TAHAP VERIFIKASI
echo ""
echo -e "\e[1;36m==========================================================\e[0m"
echo -e "\e[1;33m      VERIFIKASI STATUS LAYANAN (FRESH DEPLOY)      \e[0m"
echo -e "\e[1;36m==========================================================\e[0m"

echo -n "[1] Status PM2 Server Lisensi: "
if pm2 status | grep -q "licensing-server.*online"; then
    echo -e "\e[1;32m✅ ONLINE\e[0m"
else
    echo -e "\e[1;31m❌ OFFLINE / ERROR\e[0m"
fi

echo -n "[2] Status WireGuard (wg0): "
if echo '$SUDO_PASS' | sudo -S systemctl is-active --quiet wg-quick@wg0; then
    echo -e "\e[1;32m✅ ACTIVE\e[0m"
else
    echo -e "\e[1;31m❌ INACTIVE\e[0m"
fi

echo -n "[3] Status Caddy Server: "
if echo '$SUDO_PASS' | sudo -S systemctl is-active --quiet caddy; then
    echo -e "\e[1;32m✅ ACTIVE\e[0m"
else
    echo -e "\e[1;31m❌ INACTIVE\e[0m"
fi
echo -e "\e[1;36m==========================================================\e[0m"
echo ""
"@

Run-RemoteScript -ScriptContent $setupScript -SSHCmd $SSH_NEW -SCPCmd $SCP_NEW -TargetUser $NEW_USER -TargetIP $NEW_IP

Show-Header "DEPLOY SELESAI!"
Show-Log "Server Lisensi untuk cabang '$TARGET_DOMAIN' telah sukses diprovisi!" "Green"
Show-Log "Server lisensi Anda sekarang berjalan di IP Baru: $NEW_IP" "Green"
Write-Host ""
Write-Host "LANGKAH SELANJUTNYA (MANUAL):" -ForegroundColor Yellow
Write-Host "1. Buka dashboard Cloudflare / registrar domain Anda."
Write-Host "2. Ubah A record untuk '$TARGET_DOMAIN' dan '*.$TARGET_DOMAIN' agar menunjuk ke IP: $NEW_IP"
Write-Host "3. Cek kembali admin dashboard di: https://api.$TARGET_DOMAIN/admin.html"
Write-Host ""
Write-Host "Log deploy telah disimpan di: $LOG_FILE" -ForegroundColor Cyan
Write-Host ""

Stop-Transcript
Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
