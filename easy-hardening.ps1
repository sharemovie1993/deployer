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

$LOG_FILE = "$PSScriptRoot\hardening-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force | Out-Null

Show-Header "LINUX SERVER HARDENING (IDEMPOTENT)"
Write-Host "Script ini akan menerapkan standar keamanan tingkat lanjut di VPS:"
Write-Host "- Mengaktifkan UFW Firewall (Hanya buka port 22, 80, 443, 51820)"
Write-Host "- Memasang dan mengkonfigurasi Fail2Ban (Proteksi Brute-force)"
Write-Host "- Mematikan akses Login Root via Password"
Write-Host "- Menonaktifkan otentikasi Password di SSH"
Write-Host "Aman dijalankan berkali-kali (Idempotent)." -ForegroundColor Green
Write-Host "----------------------------------------------------------"

$TARGET_IP = (Read-Host "Masukkan IP VPS Target (Contoh: 103.129.148.127)").Trim()
$TARGET_USER = "asepsuryadi"

Write-Host "Pilih SSH Key untuk VPS tersebut:"
Write-Host " 1) nginxonly.pem"
Write-Host " 2) ls-key.pem"
Write-Host " 3) Input path file manual..."
$keyChoice = Read-Host "Pilih opsi [1-3]"

$KEY_FILE = ""
if ($keyChoice -eq "1") { $KEY_FILE = Join-Path $PSScriptRoot "nginxonly.pem" }
elseif ($keyChoice -eq "2") { $KEY_FILE = Join-Path $PSScriptRoot "ls-key.pem" }
elseif ($keyChoice -eq "3") { $KEY_FILE = (Read-Host "Masukkan path absolut file .pem").Trim() }
else { throw "Pilihan key tidak valid." }

if (-not (Test-Path $KEY_FILE)) {
    throw "SSH Key tidak ditemukan di: $KEY_FILE"
}

# Menyalin Key agar permissions aman di Windows tanpa butuh hak Admin
$SAFE_KEY = Join-Path $env:TEMP "safe-hardening-key.pem"
Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $KEY_FILE | Set-Content -Path $SAFE_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_KEY -AclObject $acl

Show-Log "Menghubungkan ke VPS ($TARGET_IP) untuk proses Hardening..."

# Buat Bash Script
$remoteScript = @"
set -e

echo "=== MEMULAI HARDENING SERVER ==="

# 1. Update Repository
echo "Mengupdate package list..."
sudo apt-get update -yqq

# 2. Setup UFW Firewall
echo "Mengkonfigurasi UFW Firewall..."
sudo apt-get install -yqq ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 51820/udp
sudo ufw --force enable
echo "UFW Firewall aktif."

# 3. Setup Fail2Ban
echo "Mengkonfigurasi Fail2Ban..."
sudo apt-get install -yqq fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local || true

cat << 'EOF' | sudo tee /etc/fail2ban/jail.local > /dev/null
[DEFAULT]
bantime  = 1h
findtime  = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
filter  = sshd
logpath  = /var/log/auth.log
maxretry = 3
EOF

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban
echo "Fail2Ban aktif."

# 4. Hardening SSH
echo "Menerapkan konfigurasi aman SSH..."
# Nonaktifkan root login dengan password (biarkan kunci ssh kalau ada, tapi no pass)
sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
# Nonaktifkan otentikasi password sama sekali
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config

# Pastikan pengaturan berlaku (restart SSH)
sudo systemctl restart ssh || sudo systemctl restart sshd
echo "SSH Hardened."

# 5. Absenta Tunnel & Service Watchdog (Auto-Recovery)
echo "Memasang Tunnel & Service Watchdog (auto-recovery tiap 30 detik)..."

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

sudo cp /tmp/absenta-tunnel-watchdog.sh /usr/local/bin/absenta-tunnel-watchdog.sh
sudo chmod +x /usr/local/bin/absenta-tunnel-watchdog.sh

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

sudo cp /tmp/absenta-tunnel-watchdog.service /etc/systemd/system/
sudo cp /tmp/absenta-tunnel-watchdog.timer /etc/systemd/system/
sudo mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nRestart=always\nRestartSec=10\nStartLimitIntervalSec=120\nStartLimitBurst=10\n' | sudo tee /etc/systemd/system/caddy.service.d/restart-override.conf > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable absenta-tunnel-watchdog.timer
sudo systemctl restart absenta-tunnel-watchdog.timer
echo "Watchdog aktif: monitor WireGuard + PM2 + Caddy setiap 30 detik."
echo "Log: /var/log/absenta-tunnel-watchdog.log"

echo "=== PROSES HARDENING SELESAI DENGAN SUKSES ==="
"@

$tempScript = Join-Path $env:TEMP "remote_hardening.sh"
Set-Content -Path $tempScript -Value $remoteScript -Encoding UTF8

$SCPCmd = "scp -i $SAFE_KEY -o StrictHostKeyChecking=no"
$SSHCmd = "ssh -i $SAFE_KEY -o StrictHostKeyChecking=no"

Show-Log "Mengirim script hardening ke VPS..."
Invoke-Expression "$SCPCmd $tempScript ${TARGET_USER}@${TARGET_IP}:/tmp/remote_hardening.sh"
if ($LASTEXITCODE -ne 0) { throw "Gagal mengirim script ke VPS." }

Show-Log "Mengeksekusi proses Hardening di VPS..."
$runCmd = "$SSHCmd ${TARGET_USER}@${TARGET_IP} `"chmod +x /tmp/remote_hardening.sh && /tmp/remote_hardening.sh`""
Invoke-Expression $runCmd
if ($LASTEXITCODE -ne 0) {
    throw "Hardening gagal dengan Exit Code $LASTEXITCODE"
}

Show-Log "Hardening Server sukses diselesaikan!" "Green"

Remove-Item -Path $SAFE_KEY -Force -ErrorAction SilentlyContinue
Remove-Item -Path $tempScript -Force -ErrorAction SilentlyContinue

Stop-Transcript | Out-Null
Write-Host ""
Write-Host "Aman! VPS di $TARGET_IP sekarang telah dibentengi (Hardened)." -ForegroundColor Green
Write-Host "Log disimpan di: $LOG_FILE" -ForegroundColor Gray
