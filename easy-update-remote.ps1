# easy-update-remote.ps1 - Skrip Update Cepat Remote (VPS Linux)
# Melakukan git pull, build backend/frontend, prisma sync, dan restart PM2 di VPS

param(
    [string]$TargetIP,
    [string]$TargetUser = "asepsuryadi",
    [string]$KeyPath,
    [string]$SudoPass,
    [string]$Project = "absenta",
    [string]$BuildMode = "remote",          # "remote" = build di VPS | "local" = build lokal | "skip" = skip build lokal (upload dist/ eksisting)
    [string]$LocalProjectPath = "",          # Path lokal Project-Server-Lisensi (auto-detect jika kosong)
    [string]$Obfuscate = "N",               # "N" = matikan pengacakan (Trial & Error) | "Y" = aktifkan pengacakan (Proteksi HKI)
    [switch]$SkipBuild,
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "quick-update-remote-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param(
        [string]$Message, 
        [string]$Color = "Cyan"
    )
    $validColors = @('Black', 'DarkBlue', 'DarkGreen', 'DarkCyan', 'DarkRed', 'DarkMagenta', 'DarkYellow', 'Gray', 'DarkGray', 'Blue', 'Green', 'Cyan', 'Red', 'Magenta', 'Yellow', 'White')
    $targetColor = "Cyan"
    if ($Color -and ($validColors -contains $Color)) {
        $targetColor = $Color
    }
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $targetColor
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

if ($SkipBuild) { $BUILD_MODE = "skip" }

if ($Silent) {
    $NEW_IP = $TargetIP
    if ([string]::IsNullOrWhiteSpace($NEW_IP)) { $NEW_IP = "10.10.10.99" }
    $NEW_USER = if ([string]::IsNullOrWhiteSpace($TargetUser)) { "asepsuryadi" } else { $TargetUser }
    $NEW_KEY_SOURCE = $KeyPath
    if ([string]::IsNullOrWhiteSpace($NEW_KEY_SOURCE)) { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "nginxonly.pem" }
    $SUDO_PASS = $SudoPass
    # Sudo password bersifat opsional — jika kosong, perintah sudo tidak akan disertakan password
    $projChoice = if ($Project -eq "licensing" -or $Project -eq "2") { "2" } else { "1" }
    $BUILD_MODE = if ($SkipBuild -or $BuildMode -eq "skip") { "skip" } elseif ($BuildMode -eq "local") { "local" } else { "remote" }
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

    $SUDO_PASS = (Read-Host "Masukkan password sudo VPS Anda (kosongkan jika passwordless sudo)").Trim()
    # Sudo password opsional - kosongkan jika server sudah dikonfigurasi NOPASSWD
    $BUILD_MODE = "remote"
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

# ---------------------------------------------------------
# PEMILIHAN MODE BUILD
# ---------------------------------------------------------
if (-not $Silent) {
    Show-Header "Pilih Mode Build"
    Write-Host "" 
    Write-Host " [remote] Build di VPS     - VPS yang compile TypeScript (cocok untuk VPS RAM >= 4GB)" -ForegroundColor Cyan
    Write-Host " [local]  Build di Lokal    - Kompilasi di PC ini lalu upload dist/ ke VPS (cocok untuk VPS RAM 1GB/2GB)" -ForegroundColor Green
    Write-Host " [skip]   Skip Build Lokal - Langsung upload folder dist/ eksisting via SCP (Instan 3-5 detik!)" -ForegroundColor Yellow
    Write-Host ""
    $buildChoice = (Read-Host "Pilih mode build [remote/local/skip]").Trim().ToLower()
    if ($buildChoice -eq "skip" -or $buildChoice -eq "s") {
        $BUILD_MODE = "skip"
    } elseif ($buildChoice -eq "local" -or $buildChoice -eq "l") {
        $BUILD_MODE = "local"
    } else {
        $BUILD_MODE = "remote"
    }
    Write-Host ""
    Write-Host "Mode build dipilih: $($BUILD_MODE.ToUpper())" -ForegroundColor Yellow
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

OLD_COMMIT=`$(git rev-parse HEAD 2>/dev/null)

echo "Menarik kode terbaru dari branch main..."
git fetch origin main

CHANGED_FILES=""
if [ -n "`$OLD_COMMIT" ]; then
    CHANGED_FILES=`$(git diff --name-only `$OLD_COMMIT origin/main 2>/dev/null)
fi

git reset --hard origin/main

# Tentukan komponen yang perlu di-build berdasarkan file yang berubah
DO_BUILD_BACKEND=true
DO_BUILD_FRONTEND=true
DO_NPM_INSTALL_BACKEND=true
DO_NPM_INSTALL_FRONTEND=true
DO_DB_SEED=true

if [ -n "`$OLD_COMMIT" ] && [ -n "`$CHANGED_FILES" ]; then
    HAS_BACKEND=`$(echo "`$CHANGED_FILES" | grep -E '^absenta_backend/' || echo "")
    HAS_FRONTEND=`$(echo "`$CHANGED_FILES" | grep -E '^absenta_frontend/' || echo "")
    HAS_DB_SCHEMA=`$(echo "`$CHANGED_FILES" | grep -E '^absenta_backend/(prisma/|src/database/seeds/)' || echo "")
    HAS_BACKEND_PKG=`$(echo "`$CHANGED_FILES" | grep -E '^absenta_backend/package' || echo "")
    HAS_FRONTEND_PKG=`$(echo "`$CHANGED_FILES" | grep -E '^absenta_frontend/package' || echo "")

    if [ -n "`$HAS_BACKEND" ] && [ -z "`$HAS_FRONTEND" ]; then
        echo "⚡ SMART BUILD: Perubahan HANYA pada Backend. Melewati build Frontend!"
        DO_BUILD_FRONTEND=false
    elif [ -z "`$HAS_BACKEND" ] && [ -n "`$HAS_FRONTEND" ]; then
        echo "⚡ SMART BUILD: Perubahan HANYA pada Frontend. Melewati build Backend!"
        DO_BUILD_BACKEND=false
    elif [ -z "`$HAS_BACKEND" ] && [ -z "`$HAS_FRONTEND" ]; then
        echo "⚡ SMART BUILD: Tidak ada perubahan kode pada Backend & Frontend."
        DO_BUILD_BACKEND=false
        DO_BUILD_FRONTEND=false
    fi

    if [ -z "`$HAS_DB_SCHEMA" ]; then
        echo "⏩ SMART SEED: Skema DB & Seeder tidak berubah. Melewati db push & seed!"
        DO_DB_SEED=false
    fi

    if [ -z "`$HAS_BACKEND_PKG" ]; then
        DO_NPM_INSTALL_BACKEND=false
    fi

    if [ -z "`$HAS_FRONTEND_PKG" ]; then
        DO_NPM_INSTALL_FRONTEND=false
    fi
fi

# Ensure MinIO S3 Storage Server is installed & running
if [ -f /var/www/$TARGET_SUBDIR/deployer/setup-minio.sh ]; then
    echo "Memeriksa & mengaktifkan MinIO Self-Hosted S3 Storage Server..."
    chmod +x /var/www/$TARGET_SUBDIR/deployer/setup-minio.sh || true
    echo '$SUDO_PASS' | sudo -S bash /var/www/$TARGET_SUBDIR/deployer/setup-minio.sh || true
fi

# Ensure Backend .env has S3 Storage variables
if [ -f absenta_backend/.env ]; then
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
fi

# 1. Update Backend
if [ "`$DO_BUILD_BACKEND" = true ]; then
    echo "Memproses & Mem-build Backend..."
    cd absenta_backend
    if [ "`$DO_NPM_INSTALL_BACKEND" = true ]; then
        echo "📦 Memperbarui npm packages backend..."
        npm install
    else
        echo "⏩ SMART INSTALL: Melewati npm install Backend (package.json tidak berubah)."
    fi
    
    npx prisma generate

    if [ "`$DO_DB_SEED" = true ]; then
        echo "🌱 Memperbarui database schema & seeding..."
        npx prisma db push --accept-data-loss || echo "Prisma DB push dilewati atau gagal."
        npx prisma db seed || echo "Prisma db seed dilewati atau gagal."
    else
        echo "⏩ SMART SEED: Melewati db push & seed (skema DB & seeder tidak berubah)."
    fi

    npm run build
    cd ..
else
    echo "⏩ SMART BUILD: Melewati build Backend (Tidak ada perubahan)."
fi

# 2. Update Frontend
if [ "`$DO_BUILD_FRONTEND" = true ]; then
    echo "Memproses & Mem-build Frontend..."
    cd absenta_frontend
    if [ "`$DO_NPM_INSTALL_FRONTEND" = true ]; then
        echo "📦 Memperbarui npm packages frontend..."
        npm install
    else
        echo "⏩ SMART INSTALL: Melewati npm install Frontend (package.json tidak berubah)."
    fi
    npm run build
    cd ..
else
    echo "⏩ SMART BUILD: Melewati build Frontend (Tidak ada perubahan)."
fi

# 3. Reload PM2
echo "Memuat ulang layanan PM2..."
pm2 start absenta_backend/ecosystem.config.js || pm2 reload absenta_backend/ecosystem.config.js || pm2 start ecosystem.config.js || pm2 reload ecosystem.config.js || pm2 reload all
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
  [ -f "`$LOG_FILE" ] && [ "`$(stat -c%s "`$LOG_FILE" 2>/dev/null || echo 0)" -gt `$MAX_LOG_SIZE ] && { mv "`$LOG_FILE" "`${LOG_FILE}.1"; touch "`$LOG_FILE"; }
  echo "[`$(date '+%Y-%m-%d %H:%M:%S')] `$1" >> "`$LOG_FILE"
}

check_wireguard() {
  # Multi-Tunnel Coexistence: Auto-sanitize legacy /24 netmask -> /32 host mask
  sed -i 's/Address = \(10\.[0-9]\+\.[0-9]\+\.[0-9]\+\)\/24/Address = \1\/32/g' /etc/wireguard/et-*.conf 2>/dev/null || true
  sed -i 's/AllowedIPs = 10\.0\.0\.0\/24/AllowedIPs = 10.0.0.1\/32/g' /etc/wireguard/et-*.conf 2>/dev/null || true

  # Smart DB-Aware Query via Node.js CLI Script
  DB_STATUS_JSON=""
  if [ -f "/var/www/project-absenta/absenta_backend/dist/scripts/watchdog-sync.js" ]; then
    DB_STATUS_JSON=`$(cd /var/www/project-absenta/absenta_backend && export PATH=`$PATH:/home/asepsuryadi/.nvm/versions/node/`$(ls /home/asepsuryadi/.nvm/versions/node 2>/dev/null | tail -n 1)/bin; node dist/scripts/watchdog-sync.js 2>/dev/null || echo "")
  fi

  CONF_FILES=`$(ls /var/www/project-absenta/tunnels/*.conf /etc/wireguard/*.conf 2>/dev/null || true)
  for cfile in `$CONF_FILES; do
    [ -f "`$cfile" ] || continue
    bname=`$(basename "`$cfile")
    iface="`${bname%.conf}"
    slug="`${iface#et-}"

    if [ "`$cfile" != "/etc/wireguard/`$bname" ]; then
      cp -f "`$cfile" "/etc/wireguard/`$bname" 2>/dev/null || true
      chmod 600 "/etc/wireguard/`$bname" 2>/dev/null || true
    fi

    # Cek apakah status di DB sengaja 'inactive' / 'expired'
    IS_INACTIVE=0
    if [ -n "`$DB_STATUS_JSON" ]; then
      if echo "`$DB_STATUS_JSON" | grep -q "\"`$slug\":\"inactive\"" || echo "`$DB_STATUS_JSON" | grep -q "\"`$slug\":\"expired\""; then
        IS_INACTIVE=1
      fi
    fi

    if [ "`$IS_INACTIVE" -eq 1 ]; then
      # User sengaja menonaktifkan di UI -> Pastikan interface DOWN di kernel Linux
      if ip link show "`$iface" 2>/dev/null | grep -q "UP"; then
        log "⏸️ User menonaktifkan `$iface di DB -> Mematikan interface Linux Kernel..."
        wg-quick down "`$iface" 2>/dev/null || true
        systemctl disable "wg-quick@`$iface" 2>/dev/null || true
      fi
    else
      # User mengaktifkan di DB -> Pastikan interface UP dan auto-recover jika terputus
      systemctl is-enabled "wg-quick@`$iface" &>/dev/null || systemctl enable "wg-quick@`$iface" 2>/dev/null || true
      if ! ip link show "`$iface" 2>/dev/null | grep -q "UP"; then
        log "⚠️  WireGuard `$iface DOWN - mencoba restore..."
        wg-quick up "`$iface" 2>/dev/null || systemctl restart "wg-quick@`$iface" 2>/dev/null || true
        sleep 3
        if ip link show "`$iface" 2>/dev/null | grep -q "UP"; then
          log "✅ WireGuard `$iface UP kembali"
        else
          log "❌ WireGuard `$iface gagal UP"
        fi
      else
        LAST_HS=`$(wg show "`$iface" latest-handshakes 2>/dev/null | awk '{print `$2}' | head -1)
        if [ -n "`$LAST_HS" ] && [ "`$LAST_HS" != "0" ]; then
          DIFF=`$(( `$(date +%s) - LAST_HS ))
          if [ "`$DIFF" -gt "`$STALE_HANDSHAKE_SECS" ]; then
            log "⚠️  WireGuard `$iface stale `${DIFF}s - reconnect..."
            ping -c 3 -W 5 "`$ET_PEER_IP" &>/dev/null || true
            sleep 5
            log "🔄 WireGuard reconnect"
          fi
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
COUNTER=`$(cat "`$COUNTER_FILE" 2>/dev/null || echo 0)
COUNTER=`$((COUNTER + 1))
echo "`$COUNTER" > "`$COUNTER_FILE"
if [ "`$COUNTER" -ge 10 ]; then
  echo "0" > "`$COUNTER_FILE"
  WG_STATUS=`$(ip link show type wireguard 2>/dev/null | grep -q "UP" && echo "UP" || echo "DOWN")
  log "📊 STATUS: WG=`$WG_STATUS, Caddy=`$(systemctl is-active caddy 2>/dev/null), PM2=`$(pgrep -f pm2 &>/dev/null && echo running || echo dead)"
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
echo "   QUICK UPDATE ABSENTA VPS SELESAI SUKSES!  "
echo "============================================="
"@
} else {
    $updateScript = @"
set -e
echo "==== Memulai Update Cepat Server Lisensi ===="
cd /var/www/$TARGET_SUBDIR

# ─── Helper: jalankan sudo dengan atau tanpa password ─────────────────────────
# Aman untuk NOPASSWD server maupun server yang pakai password
SUDO_PASS_VAL='$SUDO_PASS'
run_sudo() {
    if [ -n "`$SUDO_PASS_VAL" ]; then
        echo "`$SUDO_PASS_VAL" | sudo -S "`$@" 2>/dev/null || sudo "`$@" 2>/dev/null || true
    else
        sudo "`$@" 2>/dev/null || true
    fi
}

# Pastikan kepemilikan folder milik user agar git, npm, scp tidak EACCES
run_sudo chown -R ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR

# Stop Caddy terlebih dahulu agar tidak serve versi lama saat proses update
echo "Menghentikan Caddy sementara..."
run_sudo systemctl stop caddy

OLD_COMMIT=`$(git rev-parse HEAD 2>/dev/null || echo "")

echo "Menarik kode terbaru dari branch master..."
git fetch origin master
git reset --hard origin/master

# ─── Smart Build: Tentukan komponen yang perlu diproses ───────────────────────
DO_NPM_INSTALL=true
DO_BUILD=true
DO_PRISMA_PUSH=true
CHANGED_FILES=""

if [ -n "`$OLD_COMMIT" ]; then
    CHANGED_FILES=`$(git diff --name-only `$OLD_COMMIT origin/master 2>/dev/null || echo "")
fi

if [ -n "`$OLD_COMMIT" ] && [ -n "`$CHANGED_FILES" ]; then
    HAS_PKG=`$(echo "`$CHANGED_FILES" | grep -E '^package\.json|^package-lock\.json' || echo "")
    HAS_SRC=`$(echo "`$CHANGED_FILES" | grep -E '^src/' || echo "")
    HAS_PRISMA=`$(echo "`$CHANGED_FILES" | grep -E '^prisma/' || echo "")

    if [ -z "`$HAS_PKG" ]; then
        echo "⚡ SMART INSTALL: package.json tidak berubah. Melewati npm install!"
        DO_NPM_INSTALL=false
    fi

    if [ -z "`$HAS_SRC" ] && [ -z "`$HAS_PRISMA" ]; then
        echo "⚡ SMART BUILD: Tidak ada perubahan pada src/ & prisma/. Melewati build!"
        DO_BUILD=false
        DO_PRISMA_PUSH=false
    fi

    if [ -z "`$HAS_PRISMA" ]; then
        echo "⏩ SMART PRISMA: Schema prisma tidak berubah. Melewati prisma db push!"
        DO_PRISMA_PUSH=false
    fi
fi

# 1. npm install (jika diperlukan)
if [ "`$DO_NPM_INSTALL" = true ]; then
    echo "📦 Memperbarui npm packages..."
    npm install --production=false
else
    echo "⏩ SMART INSTALL: Melewati npm install (package.json tidak berubah)."
fi

# 2. Prisma generate & db push (jika schema berubah)
# prisma generate selalu dijalankan — ringan dan pastikan Prisma Client sinkron
npx prisma generate
if [ "`$DO_PRISMA_PUSH" = true ]; then
    echo "🗄️ Melakukan prisma db push (schema update ke database produksi)..."
    npx prisma db push --accept-data-loss || echo "⚠️ Prisma db push dilewati atau sudah up-to-date."
else
    echo "⏩ SMART PRISMA: Melewati prisma db push (schema tidak berubah)."
fi

# 3. Build TypeScript -> dist/
if [ "`$DO_BUILD" = true ]; then
    echo "🔨 Kompilasi TypeScript (npm run build)..."
    export ENABLE_OBFUSCATE='$Obfuscate'
    npm run build
    echo "✅ Build selesai. Entry point: dist/server.js"
else
    echo "⏩ SMART BUILD: Melewati build TypeScript (tidak ada perubahan src/)."
fi

# 4. Reload PM2 — beberapa fallback agar tidak crash
echo "Memuat ulang layanan PM2 Server Lisensi..."
pm2 reload ecosystem.config.js \
    || pm2 restart ecosystem.config.js \
    || pm2 start ecosystem.config.js \
    || pm2 reload all \
    || echo "⚠️ PM2 reload gagal - periksa proses PM2 secara manual"
pm2 save || true

# Simpan status PM2 terbaru
pm2 save || true


# 5. Jalankan kembali Caddy (non-fatal — Caddy mungkin tidak terpakai di semua setup)
echo "Menjalankan kembali Caddy..."
run_sudo systemctl start caddy
run_sudo systemctl enable caddy

echo "============================================="
echo "   QUICK UPDATE LISENSI VPS SELESAI SUKSES!  "
echo "============================================="
"@
}

# =============================================================================
# MODE: LOCAL BUILD + SCP / SKIP BUILD (VPS spek kecil atau fast upload)
# =============================================================================
if ($BUILD_MODE -eq "local" -or $BUILD_MODE -eq "skip") {

    # Auto-detect path project lokal
    $LOCAL_PROJECT = $LocalProjectPath
    if ([string]::IsNullOrWhiteSpace($LOCAL_PROJECT)) {
        if ($IS_SERVER_LISENSI) {
            $LOCAL_PROJECT = Join-Path (Split-Path $PSScriptRoot -Parent) "Project-Server-Lisensi"
        } else {
            $LOCAL_PROJECT = Join-Path (Split-Path $PSScriptRoot -Parent) "Project Absenta"
        }
    }

    if (-not (Test-Path $LOCAL_PROJECT)) {
        Write-Host "[ERROR] Path project lokal tidak ditemukan: $LOCAL_PROJECT" -ForegroundColor Red
        Write-Host "Gunakan parameter -LocalProjectPath untuk menentukan path yang benar." -ForegroundColor Yellow
        Remove-Item -Path $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
        Stop-Transcript
        exit 1
    }

    Show-Header "Local Build / SCP Mode ($BUILD_MODE)"
    Show-Log "Path project lokal: $LOCAL_PROJECT" "Cyan"

    try {
        if ($BUILD_MODE -eq "skip") {
            Show-Log "⚡ [SKIP BUILD] Melewati kompilasi lokal secara manual. Menggunakan folder dist/ eksisting..." "Yellow"
        } else {
            # ------------------------------------------------------------------
            # STEP 1: Git pull lokal
            # ------------------------------------------------------------------
            Show-Log "[1/5] Git pull kode terbaru di lokal..." "Yellow"
            $savedPref = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            & git -C $LOCAL_PROJECT fetch origin main --quiet 2>$null
            $fetchCode = $LASTEXITCODE
            & git -C $LOCAL_PROJECT reset --hard origin/main
            $resetCode = $LASTEXITCODE
            $ErrorActionPreference = $savedPref
            if ($fetchCode -ne 0) { throw "Git fetch lokal gagal (exit $fetchCode)." }
            if ($resetCode -ne 0) { throw "Git reset --hard lokal gagal (exit $resetCode)." }
            Show-Log "✅ Git pull lokal selesai." "Green"

            if ($IS_ABSENTA) {
                $LOCAL_BACKEND = Join-Path $LOCAL_PROJECT "absenta_backend"
                $LOCAL_FRONTEND = Join-Path $LOCAL_PROJECT "absenta_frontend"

                # ------------------------------------------------------------------
                # STEP 2: npm install lokal
                # ------------------------------------------------------------------
                Show-Log "[2/5] npm install lokal (absenta_backend & absenta_frontend)..." "Yellow"
                $savedPrefNpm = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                & npm install --prefix $LOCAL_BACKEND --production=false
                & npm install --prefix $LOCAL_FRONTEND --production=false
                $ErrorActionPreference = $savedPrefNpm

                # ------------------------------------------------------------------
                # STEP 3: prisma generate lokal
                # ------------------------------------------------------------------
                Show-Log "[3/5] Prisma generate lokal (absenta_backend)..." "Yellow"
                $savedPref2 = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                try {
                    $prismaBin = Join-Path $LOCAL_BACKEND "node_modules\.bin\prisma.cmd"
                    if (Test-Path $prismaBin) {
                        & $prismaBin generate --schema="$LOCAL_BACKEND\prisma\schema.prisma"
                    } else {
                        & npm exec --prefix $LOCAL_BACKEND -- prisma generate --schema="$LOCAL_BACKEND\prisma\schema.prisma"
                    }
                } catch {
                    Show-Log "⚠️ Prisma generate lokal dilewati (file query_engine sedang digunakan oleh dev server). Prisma Client Linux akan di-generate otomatis di VPS." "Yellow"
                }
                $ErrorActionPreference = $savedPref2

                # ------------------------------------------------------------------
                # STEP 4: Build Backend & Frontend
                # ------------------------------------------------------------------
                Show-Log "[4/5] Kompilasi Backend & Frontend lokal (npm run build)..." "Yellow"
                $savedPrefBuild = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                $env:ENABLE_OBFUSCATE = if ($Obfuscate -eq "Y" -or $Obfuscate -eq "true" -or $Obfuscate -eq "1") { "Y" } else { "N" }
                & npm run --prefix $LOCAL_BACKEND build
                $bCode = $LASTEXITCODE
                & npm run --prefix $LOCAL_FRONTEND build
                $fCode = $LASTEXITCODE
                $ErrorActionPreference = $savedPrefBuild
                if ($bCode -ne 0 -or $fCode -ne 0) { throw "npm run build lokal (Backend/Frontend) gagal." }
            } else {
                # ------------------------------------------------------------------
                # STEP 2: npm install lokal (Server Lisensi)
                # ------------------------------------------------------------------
                Show-Log "[2/5] npm install lokal..." "Yellow"
                $savedPrefNpm = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                & npm install --prefix $LOCAL_PROJECT --production=false
                $npmCode = $LASTEXITCODE
                $ErrorActionPreference = $savedPrefNpm
                if ($npmCode -ne 0) { throw "npm install lokal gagal (exit $npmCode)." }

                # ------------------------------------------------------------------
                # STEP 3: prisma generate lokal
                # ------------------------------------------------------------------
                Show-Log "[3/5] Prisma generate lokal..." "Yellow"
                $savedPref2 = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                $prismaBin = Join-Path $LOCAL_PROJECT "node_modules\.bin\prisma.cmd"
                if (Test-Path $prismaBin) {
                    & $prismaBin generate --schema="$LOCAL_PROJECT\prisma\schema.prisma"
                } else {
                    & npm exec --prefix $LOCAL_PROJECT -- prisma generate --schema="$LOCAL_PROJECT\prisma\schema.prisma"
                }
                $prismaCode = $LASTEXITCODE
                $ErrorActionPreference = $savedPref2

                # ------------------------------------------------------------------
                # STEP 4: TypeScript build lokal
                # ------------------------------------------------------------------
                Show-Log "[4/5] Kompilasi TypeScript lokal (npm run build)..." "Yellow"
                $savedPrefBuild = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                & npm run --prefix $LOCAL_PROJECT build
                $buildCode = $LASTEXITCODE
                $ErrorActionPreference = $savedPrefBuild
                if ($buildCode -ne 0) { throw "npm run build lokal gagal (exit $buildCode)." }
            }
            Show-Log "✅ Build TypeScript & Frontend React lokal selesai." "Green"
        }

        # ------------------------------------------------------------------
        # STEP 5: SCP dist/ ke VPS
        # ------------------------------------------------------------------
        Show-Log "[5/5] Upload dist/ ke VPS ($NEW_IP)..." "Yellow"
        $chownCmd = "if [ -n '$SUDO_PASS' ]; then echo '$SUDO_PASS' | sudo -S chown -R ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR 2>/dev/null || true; else sudo chown -R ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR 2>/dev/null || true; fi"
        & ssh -i "$SAFE_NEW_KEY" -o StrictHostKeyChecking=no "${NEW_USER}@${NEW_IP}" $chownCmd

        if ($IS_ABSENTA) {
            $LOCAL_BACKEND_DIST = Join-Path $LOCAL_PROJECT "absenta_backend\dist"
            $LOCAL_FRONTEND_DIST = Join-Path $LOCAL_PROJECT "absenta_frontend\dist"

            if (-not (Test-Path $LOCAL_BACKEND_DIST) -and -not (Test-Path $LOCAL_FRONTEND_DIST)) {
                throw "Folder dist/ Backend ($LOCAL_BACKEND_DIST) maupun Frontend ($LOCAL_FRONTEND_DIST) tidak ditemukan. Harap jalankan npm run build manual di absenta_backend / absenta_frontend terlebih dahulu."
            }

            if (Test-Path $LOCAL_BACKEND_DIST) {
                Show-Log "📦 Uploading absenta_backend/dist..." "Cyan"
                & scp -i "$SAFE_NEW_KEY" -O -o StrictHostKeyChecking=no -r "$LOCAL_BACKEND_DIST" "${NEW_USER}@${NEW_IP}:/var/www/${TARGET_SUBDIR}/absenta_backend/"
                if ($LASTEXITCODE -ne 0) { throw "SCP upload absenta_backend/dist ke VPS gagal." }
            }

            if (Test-Path $LOCAL_FRONTEND_DIST) {
                Show-Log "📦 Uploading absenta_frontend/dist..." "Cyan"
                & scp -i "$SAFE_NEW_KEY" -O -o StrictHostKeyChecking=no -r "$LOCAL_FRONTEND_DIST" "${NEW_USER}@${NEW_IP}:/var/www/${TARGET_SUBDIR}/absenta_frontend/"
                if ($LASTEXITCODE -ne 0) { throw "SCP upload absenta_frontend/dist ke VPS gagal." }
            }
        } else {
            $LOCAL_DIST = Join-Path $LOCAL_PROJECT "dist"
            $LOCAL_PUBLIC = Join-Path $LOCAL_PROJECT "public"
            if (-not (Test-Path $LOCAL_DIST)) { throw "Folder dist/ tidak ditemukan: $LOCAL_DIST. Harap jalankan npm run build manual terlebih dahulu." }

            if (Test-Path $LOCAL_PUBLIC) {
                & scp -i "$SAFE_NEW_KEY" -O -o StrictHostKeyChecking=no -r "$LOCAL_DIST" "$LOCAL_PUBLIC" "${NEW_USER}@${NEW_IP}:/var/www/${TARGET_SUBDIR}/"
            } else {
                & scp -i "$SAFE_NEW_KEY" -O -o StrictHostKeyChecking=no -r "$LOCAL_DIST" "${NEW_USER}@${NEW_IP}:/var/www/${TARGET_SUBDIR}/"
            }
            if ($LASTEXITCODE -ne 0) { throw "SCP upload dist/ ke VPS gagal." }
        }
        Show-Log "✅ Upload dist/ ke VPS selesai." "Green"

        # ------------------------------------------------------------------
        # STEP REMOTE: Finalisasi ringan di VPS (npm install, prisma, pm2 reload)
        # ------------------------------------------------------------------
        Show-Log "Menjalankan finalisasi di VPS..." "Yellow"
        $remoteScript = @"
set -e
echo "==== Local Build Mode: Finalisasi di VPS ===="

# Pindah ke folder backend jika ini Project Absenta monorepo
if [ -d "/var/www/$TARGET_SUBDIR/absenta_backend" ]; then
    cd /var/www/$TARGET_SUBDIR/absenta_backend
else
    cd /var/www/$TARGET_SUBDIR
fi

# ─── Helper sudo (sama seperti remote build) ───────────────────────────────
SUDO_PASS_VAL='$SUDO_PASS'
run_sudo() {
    if [ -n "$SUDO_PASS_VAL" ]; then
        echo "$SUDO_PASS_VAL" | sudo -S "$@" 2>/dev/null || sudo "$@" 2>/dev/null || true
    else
        sudo "$@" 2>/dev/null || true
    fi
}

# Pastikan izin folder /var/www/$TARGET_SUBDIR milik user
run_sudo chown -R ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR

echo "Menghentikan Caddy sementara..."
run_sudo systemctl stop caddy

if [ -f "package.json" ]; then
    echo "📦 npm install (production only - tanpa build)..."
    npm install --production=false
fi

if [ -f "prisma/schema.prisma" ]; then
    echo "🔄 Prisma generate (untuk Linux platform)..."
    npx prisma generate

    echo "🗄️ Prisma db push (sinkronisasi schema ke database produksi)..."
    npx prisma db push --accept-data-loss || echo "⚠️ Prisma db push dilewati atau sudah up-to-date."
fi

echo "🔁 Reload PM2 Aplikasi..."
if [ -f "ecosystem.config.js" ]; then
    pm2 reload ecosystem.config.js || pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js || pm2 reload all
else
    pm2 reload all || true
fi

# Simpan status PM2 terbaru
pm2 save || true

echo "Menjalankan kembali Caddy..."
run_sudo systemctl start caddy
run_sudo systemctl enable caddy

echo "================================================"
echo " LOCAL BUILD + SCP UPDATE SELESAI SUKSES! 🚀   "
echo "================================================"
"@
        Run-RemoteScript -ScriptContent $remoteScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP
        Show-Log "✅ Quick Update (Local Build Mode) berhasil!" "Green"


    } catch {
        Show-Log "❌ Error pada Local Build Mode: $_" "Red"
    } finally {
        Remove-Item -Path $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
        Stop-Transcript
    }

} else {
    # =============================================================================
    # MODE: REMOTE BUILD (default — build terjadi di VPS)
    # =============================================================================
    try {
        Run-RemoteScript -ScriptContent $updateScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP
        Show-Log "Quick Update berhasil dijalankan di VPS remote!" "Green"
    } catch {
        Show-Log "Error saat menjalankan Quick Update remote: $_" "Red"
    } finally {
        Remove-Item -Path $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
        Stop-Transcript
    }
}

if (-not $Silent) {
    Write-Host ""
    Read-Host "Tekan [ENTER] untuk kembali..."
}
