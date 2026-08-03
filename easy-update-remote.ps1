# easy-update-remote.ps1 - Skrip Update Cepat Remote (VPS Linux)
# Melakukan git pull, build backend/frontend, prisma sync, dan restart PM2 di VPS

param(
    [string]$TargetIP,
    [string]$TargetUser = "asepsuryadi",
    [string]$KeyPath,
    [string]$SudoPass,
    [string]$Project = "absenta",
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "quick-update-remote-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Show-Header {
    param([string]$Title)
    if (-not $Silent) { Clear-Host }
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "             EASY UPDATE REMOTE - QUICK VPS CODE UPDATER                  " -ForegroundColor Yellow -Bold
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " -> $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

Show-Header "Persiapan Koneksi VPS Target"

if ($Silent) {
    $NEW_IP = $TargetIP
    if ([string]::IsNullOrWhiteSpace($NEW_IP)) { $NEW_IP = "10.10.10.99" }
    $NEW_USER = if ([string]::IsNullOrWhiteSpace($TargetUser)) { "asepsuryadi" } else { $TargetUser }
    $NEW_KEY_SOURCE = $KeyPath
    if ([string]::IsNullOrWhiteSpace($NEW_KEY_SOURCE)) { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "nginxonly.pem" }
    $SUDO_PASS = $SudoPass
    if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "1" }
    $projChoice = if ($Project -eq "licensing" -or $Project -eq "2") { "2" } else { "1" }
} else {
    $NEW_IP = (Read-Host "Masukkan IP VPS Target [10.10.10.163]").Trim()
    if ([string]::IsNullOrWhiteSpace($NEW_IP)) { $NEW_IP = "10.10.10.163" }
    $NEW_USER = "asepsuryadi"

    Write-Host "Pilih SSH Key untuk VPS tersebut:"
    Write-Host " 1) nginxonly.pem"
    Write-Host " 2) ls-key.pem"
    Write-Host " 3) Input path file manual..."
    $newKeyChoice = Read-Host "Pilih [1-3]"
    if ($newKeyChoice -eq "1" -or [string]::IsNullOrWhiteSpace($newKeyChoice)) { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "nginxonly.pem" }
    elseif ($newKeyChoice -eq "2") { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "ls-key.pem" }
    else { $NEW_KEY_SOURCE = Read-Host "Masukkan path absolut file .pem" }

    $SUDO_PASS = (Read-Host "Masukkan password sudo VPS Anda [g1g1G1NGSUL*!2]").Trim()
    if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "g1g1G1NGSUL*!2" }
}

if (-not (Test-Path $NEW_KEY_SOURCE)) {
    Write-Host "Error: File SSH Key tidak ditemukan di '$NEW_KEY_SOURCE'" -ForegroundColor Red
    exit
}

# Set key permission for Windows SSH client
$SAFE_NEW_KEY = "$env:TEMP\new-update-key.pem"
Remove-Item $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $NEW_KEY_SOURCE | Set-Content -Path $SAFE_NEW_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_NEW_KEY -AclObject $acl

# ---------------------------------------------------------
# PEMILIHAN PROYEK
# ---------------------------------------------------------
if (-not $Silent) {
    Show-Header "Pilih Proyek Untuk Quick Update"
    Write-Host " 1) Project Absenta (Full Stack)"
    Write-Host " 2) Server Lisensi (Licensing Server VPS)"
    Write-Host ""
    $projChoice = Read-Host "Pilih proyek [1-2]"
}

$TARGET_SUBDIR = ""
$IS_ABSENTA = $false
$IS_SERVER_LISENSI = $false

if ($projChoice -eq "2") {
    $TARGET_SUBDIR = "licensing-server"
    $IS_SERVER_LISENSI = $true
} else {
    $TARGET_SUBDIR = "project-absenta"
    $IS_ABSENTA = $true
}

function Run-RemoteScript {
    param([string]$ScriptContent, [string]$KeyPath, [string]$TargetUser, [string]$TargetIP)
    $tempScript = "$env:TEMP\remote_script.sh"
    $ScriptContent = $ScriptContent -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($tempScript, $ScriptContent)
    
    & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/remote_script.sh"
    if ($LASTEXITCODE -ne 0) { throw "Gagal menyalin script ke VPS menggunakan SCP." }
    
    & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/remote_script.sh"
    if ($LASTEXITCODE -ne 0) { throw "Eksekusi script remote gagal." }
}

Show-Header "Melakukan Quick Update Remote via SSH"
Show-Log "Menghubungkan ke VPS ($NEW_IP)..." "Yellow"

$updateScript = ""

if ($IS_ABSENTA) {
    $updateScript = @"
set -e
echo "==== Memulai Update Cepat Proyek Absenta ===="
cd /var/www/$TARGET_SUBDIR

# Pastikan WireGuard terpasang (jika belum ada)
if ! command -v wg-quick &> /dev/null; then
    echo "WireGuard/openresolv tidak terdeteksi. Menginstal via apt..."
    echo '$SUDO_PASS' | sudo -S apt-get update -y
    echo '$SUDO_PASS' | sudo -S apt-get install -y wireguard openresolv
    echo '$SUDO_PASS' | sudo -S sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
    echo "Mengonfigurasi passwordless sudo untuk WireGuard..."
    echo "$NEW_USER ALL=(ALL) NOPASSWD: /usr/bin/wg-quick, /usr/bin/wg, /usr/sbin/wg-quick, /usr/sbin/wg" > /tmp/90-wireguard
    echo '$SUDO_PASS' | sudo -S cp /tmp/90-wireguard /etc/sudoers.d/90-wireguard
    echo '$SUDO_PASS' | sudo -S chown root:root /etc/sudoers.d/90-wireguard
    echo '$SUDO_PASS' | sudo -S chmod 440 /etc/sudoers.d/90-wireguard
    rm -f /tmp/90-wireguard
fi

# Stop Caddy terlebih dahulu agar tidak serve versi lama saat proses build
echo "Menghentikan Caddy sementara..."
echo '$SUDO_PASS' | sudo -S systemctl stop caddy || true

echo "Menarik kode terbaru dari branch main..."
git fetch origin main
git reset --hard origin/main

# 1. Update Backend
echo "Memproses Backend..."
cd absenta_backend
npm install
npx prisma generate
npx prisma db push --accept-data-loss || echo "Prisma DB push dilewati atau gagal."
npx prisma db seed || echo "Prisma db seed dilewati atau gagal."
npm run build

# 2. Update Frontend
echo "Memproses Frontend..."
cd ../absenta_frontend
npm install
npm run build

# 3. Reload PM2
echo "Memuat ulang layanan PM2..."
cd ..
pm2 reload ecosystem.config.js || pm2 restart ecosystem.config.js
pm2 save

# Pastikan PM2 terdaftar di systemd startup (agar tetap jalan setelah reboot)
echo "Memastikan PM2 startup systemd terdaftar..."
echo '$SUDO_PASS' | sudo -S env PATH=\${PATH}:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || \
echo '$SUDO_PASS' | sudo -S env PATH=\${PATH}:/usr/local/bin pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || true
pm2 save

# ─── TUNNEL & SERVICE WATCHDOG (Auto-Recovery) ───────────────────────────────
echo "Memasang/memperbarui Absenta Tunnel Watchdog..."

cat > /tmp/absenta-tunnel-watchdog.sh << 'WATCHDOG'
#!/bin/bash
# Absenta Tunnel Watchdog - Monitor WireGuard & PM2 & Caddy setiap 30 detik
LOG_FILE="/var/log/absenta-tunnel-watchdog.log"
MAX_LOG_SIZE=5242880
ET_PEER_IP="10.0.0.1"
STALE_HANDSHAKE_SECS=180

log() {
  [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)" -gt $MAX_LOG_SIZE ] && { mv "$LOG_FILE" "${LOG_FILE}.1"; touch "$LOG_FILE"; }
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

check_wireguard() {
  for iface in $(ip link show type wireguard 2>/dev/null | grep -oP '^\d+: \K[^:]+'); do
    if ! ip link show "$iface" 2>/dev/null | grep -q "UP"; then
      log "⚠️  WireGuard $iface DOWN - mencoba restore..."
      ip link set "$iface" up 2>/dev/null || true
      sleep 3
      ip link show "$iface" 2>/dev/null | grep -q "UP" && log "✅ WireGuard $iface UP kembali" || log "❌ WireGuard $iface gagal UP"
    else
      LAST_HS=$(wg show "$iface" latest-handshakes 2>/dev/null | awk '{print $2}' | head -1)
      if [ -n "$LAST_HS" ] && [ "$LAST_HS" != "0" ]; then
        DIFF=$(( $(date +%s) - LAST_HS ))
        if [ "$DIFF" -gt "$STALE_HANDSHAKE_SECS" ]; then
          log "⚠️  WireGuard $iface stale handshake (${DIFF}s) - trigger reconnect..."
          ping -c 3 -W 5 "$ET_PEER_IP" &>/dev/null || true
          sleep 5
          log "🔄 Reconnect WireGuard $iface dilakukan"
        fi
      fi
    fi
  done
}

check_pm2() {
  if ! pgrep -f "pm2" &>/dev/null; then
    log "⚠️  PM2 tidak berjalan - mencoba resurrect..."
    su - asepsuryadi -c "pm2 resurrect" 2>/dev/null || true
    sleep 5
    pgrep -f "pm2" &>/dev/null && log "✅ PM2 di-resurrect" || log "❌ PM2 gagal resurrect"
  fi
}

check_caddy() {
  if ! systemctl is-active --quiet caddy 2>/dev/null; then
    log "⚠️  Caddy DOWN - restart..."
    systemctl restart caddy 2>/dev/null
    sleep 3
    systemctl is-active --quiet caddy && log "✅ Caddy restart sukses" || log "❌ Caddy gagal restart"
  fi
}

COUNTER_FILE="/tmp/absenta-watchdog-counter"
COUNTER=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
COUNTER=$((COUNTER + 1))
echo "$COUNTER" > "$COUNTER_FILE"
if [ "$COUNTER" -ge 10 ]; then
  echo "0" > "$COUNTER_FILE"
  WG_STATUS=$(ip link show type wireguard 2>/dev/null | grep -q "UP" && echo "UP" || echo "DOWN")
  log "📊 STATUS: WG=$WG_STATUS, Caddy=$(systemctl is-active caddy 2>/dev/null), PM2=$(pgrep -f pm2 &>/dev/null && echo running || echo dead)"
fi

check_wireguard
check_pm2
check_caddy
WATCHDOG

echo '$SUDO_PASS' | sudo -S cp /tmp/absenta-tunnel-watchdog.sh /usr/local/bin/absenta-tunnel-watchdog.sh
echo '$SUDO_PASS' | sudo -S chmod +x /usr/local/bin/absenta-tunnel-watchdog.sh

# Buat systemd service unit untuk watchdog
cat > /tmp/absenta-tunnel-watchdog.service << 'EOF'
[Unit]
Description=Absenta Tunnel & Service Watchdog
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/absenta-tunnel-watchdog.sh
User=root
EOF

# Buat systemd timer (setiap 30 detik)
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

echo '$SUDO_PASS' | sudo -S cp /tmp/absenta-tunnel-watchdog.service /etc/systemd/system/absenta-tunnel-watchdog.service
echo '$SUDO_PASS' | sudo -S cp /tmp/absenta-tunnel-watchdog.timer /etc/systemd/system/absenta-tunnel-watchdog.timer
echo '$SUDO_PASS' | sudo -S systemctl daemon-reload
echo '$SUDO_PASS' | sudo -S systemctl enable absenta-tunnel-watchdog.timer
echo '$SUDO_PASS' | sudo -S systemctl restart absenta-tunnel-watchdog.timer

# Hardening Caddy restart policy
echo '$SUDO_PASS' | sudo -S mkdir -p /etc/systemd/system/caddy.service.d
cat > /tmp/caddy-restart-override.conf << 'EOF'
[Service]
Restart=always
RestartSec=10
StartLimitIntervalSec=120
StartLimitBurst=10
EOF
echo '$SUDO_PASS' | sudo -S cp /tmp/caddy-restart-override.conf /etc/systemd/system/caddy.service.d/restart-override.conf
echo '$SUDO_PASS' | sudo -S systemctl daemon-reload

echo "✅ Watchdog terpasang & aktif (monitor setiap 30 detik)"
# ─────────────────────────────────────────────────────────────────────────────

# Jalankan kembali Caddy setelah build selesai
echo "Menjalankan kembali Caddy..."
echo '$SUDO_PASS' | sudo -S systemctl start caddy
echo '$SUDO_PASS' | sudo -S systemctl enable caddy

echo "============================================="
echo "   QUICK UPDATE ABSENTA VPS SELESAI SAKSES!  "
echo "============================================="
"@
} else {
    $updateScript = @"
set -e
echo "==== Memulai Update Cepat Server Lisensi ===="
cd /var/www/$TARGET_SUBDIR

# Stop Caddy terlebih dahulu agar tidak serve versi lama saat proses update
echo "Menghentikan Caddy sementara..."
echo '$SUDO_PASS' | sudo -S systemctl stop caddy || true

echo "Menarik kode terbaru dari branch main..."
git fetch origin main
git reset --hard origin/main

echo "Menginstal dependensi..."
npm install

echo "Memuat ulang layanan PM2..."
pm2 reload ecosystem.config.js || pm2 restart ecosystem.config.js
pm2 save

# Pastikan PM2 terdaftar di systemd startup (agar tetap jalan setelah reboot)
echo "Memastikan PM2 startup systemd terdaftar..."
echo '$SUDO_PASS' | sudo -S env PATH=\${PATH}:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || \
echo '$SUDO_PASS' | sudo -S env PATH=\${PATH}:/usr/local/bin pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || true
pm2 save

# Jalankan kembali Caddy setelah update selesai
echo "Menjalankan kembali Caddy..."
echo '$SUDO_PASS' | sudo -S systemctl start caddy
echo '$SUDO_PASS' | sudo -S systemctl enable caddy

echo "============================================="
echo "   QUICK UPDATE LISENSI VPS SELESAI SAKSES!  "
echo "============================================="
"@
}

try {
    Run-RemoteScript -ScriptContent $updateScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP
    Show-Log "Quick Update berhasil dijalankan di VPS remote!" "Green"
} catch {
    Show-Log "Error saat menjalankan Quick Update remote: $_" "Red"
} finally {
    Remove-Item -Path $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
    Stop-Transcript
}

if (-not $Silent) {
    Write-Host ""
    Read-Host "Tekan [ENTER] untuk kembali..."
}
