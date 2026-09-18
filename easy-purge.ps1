$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "purge-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force | Out-Null

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Show-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "      $Title" -ForegroundColor Yellow -Bold
    Write-Host "==========================================================" -ForegroundColor Cyan
}

function Run-RemoteScript {
    param(
        [string]$ScriptContent,
        [string]$TargetUser,
        [string]$TargetIP,
        [string]$PEMKey
    )
    # Tulis script tanpa BOM agar bash Linux tidak error pada shebang #!/bin/bash
    $tmpFile = Join-Path $env:TEMP "remote_purge_script.sh"
    $ScriptContent = $ScriptContent -replace "`r`n", "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tmpFile, $ScriptContent, $utf8NoBom)

    Show-Log "Mengunggah script ke ${TargetUser}@${TargetIP}..." "Gray"
    $scpOut = & scp -i "$PEMKey" -o StrictHostKeyChecking=no -o LogLevel=ERROR "$tmpFile" "${TargetUser}@${TargetIP}:/tmp/remote_purge_script.sh" 2>&1
    $scpExit = $LASTEXITCODE
    $scpOut | ForEach-Object { Write-Host $_ }
    if ($scpExit -ne 0) {
        throw "Upload script ke VPS gagal (exit code $scpExit)"
    }

    Show-Log "Menjalankan script di ${TargetUser}@${TargetIP}..." "Gray"
    $sshOut = & ssh -i "$PEMKey" -o StrictHostKeyChecking=no -o LogLevel=ERROR "${TargetUser}@${TargetIP}" "bash /tmp/remote_purge_script.sh" 2>&1
    $sshExit = $LASTEXITCODE
    $sshOut | ForEach-Object { Write-Host $_ }
    if ($sshExit -ne 0) {
        throw "Eksekusi script remote purge gagal (exit code $sshExit)"
    }
}


Show-Header "FACTORY RESET VPS BARU (PURGE)"
Write-Host "PERINGATAN KERAS:" -ForegroundColor Red -Bold
Write-Host "Opsi ini akan MENGHAPUS BERSIH seluruh ekosistem Server Lisensi di VPS Anda." -ForegroundColor Red
Write-Host "Ini mencakup Node.js, PM2, WireGuard, Caddy, Database, dan Folder /var/www." -ForegroundColor Red
Write-Host "Tindakan ini sangat berguna jika Anda ingin memulai dari kertas kosong (100% fresh)." -ForegroundColor Yellow
Write-Host ""

$targetIP = (Read-Host "Masukkan IP VPS yang ingin di-reset (Contoh: 103.129.148.127)").Trim()
if ([string]::IsNullOrWhiteSpace($targetIP)) {
    Write-Host "IP tidak boleh kosong!" -ForegroundColor Red
    exit
}

$confirm = Read-Host "Ketik 'HAPUS' (huruf besar) untuk mengonfirmasi reset VPS [$targetIP]"
if ($confirm -cne 'HAPUS') {
    Write-Host "Operasi dibatalkan. Mengamankan sistem Anda." -ForegroundColor Green
    Read-Host "Tekan [ENTER] untuk kembali..."
    exit
}

Write-Host ""
Write-Host "Pilih SSH Key untuk VPS tersebut:"
Write-Host " 1) nginxonly.pem"
Write-Host " 2) ls-key.pem"
Write-Host " 3) Input path file .pem manual..."
$keyChoice = Read-Host "Pilih opsi [1-3]"

if ($keyChoice -eq "1") { 
    $PEM_KEY = Join-Path $PSScriptRoot "nginxonly.pem" 
} elseif ($keyChoice -eq "2") { 
    $PEM_KEY = Join-Path $PSScriptRoot "ls-key.pem" 
} elseif ($keyChoice -eq "3") {
    $PEM_KEY = Read-Host "Masukkan path lengkap file .pem"
} else {
    Write-Host "Pilihan tidak valid, dibatalkan." -ForegroundColor Red
    exit
}

if (-not (Test-Path $PEM_KEY)) {
    Write-Host "Error: File SSH Key tidak ditemukan di '$PEM_KEY'" -ForegroundColor Red
    exit
}

$NEW_IP = $targetIP
$NEW_USER = "asepsuryadi"

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_KEY = "$env:TEMP\purge-key-safe.pem"
Copy-Item $PEM_KEY $SAFE_KEY -Force
icacls $SAFE_KEY /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):F" /q

$SSH_NEW = "ssh -i `"$SAFE_KEY`" -o StrictHostKeyChecking=no ${NEW_USER}@${NEW_IP}"

$SUDO_PASS = (Read-Host "Masukkan password sudo VPS Anda [g1g1G1NGSUL*!2]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "g1g1G1NGSUL*!2" }

# --- Pilihan mode pembersihan ---
Write-Host ""
Write-Host "Pilih Mode Pembersihan:" -ForegroundColor Yellow
Write-Host " 1) Standar  - Hapus hanya app Absenta (licensing-server, absenta.id, project-absenta, WireGuard, Caddy, Node.js)"
Write-Host " 2) Total    - Hapus SEMUA isi /var/www tanpa terkecuali + semua di atas"
Write-Host "              (termasuk minio-data, undangan-digital, dan folder lainnya)"
$purgeMode = Read-Host "Pilih [1/2] (Default: 1)"
if ([string]::IsNullOrWhiteSpace($purgeMode)) { $purgeMode = "1" }

if ($purgeMode -eq "2") {
    Write-Host ""
    Write-Host "PERINGATAN TOTAL WIPE:" -ForegroundColor Red
    Write-Host "Seluruh isi /var/www akan dihapus permanen termasuk minio-data, undangan-digital, dll." -ForegroundColor Red
    $confirmTotal = Read-Host "Ketik 'TOTAL' (huruf besar) untuk konfirmasi"
    if ($confirmTotal -cne 'TOTAL') {
        Write-Host "Total wipe dibatalkan. Melanjutkan dengan mode Standar..." -ForegroundColor Yellow
        $purgeMode = "1"
    }
}

Show-Log "Memulai proses pembersihan $(if ($purgeMode -eq '2') {'TOTAL'} else {'Standar'}) ke VPS ($NEW_IP)..." "Yellow"

$varWwwCleanup = if ($purgeMode -eq "2") {
    @"
echo 'Menghapus SELURUH isi /var/www (Total Wipe)...'
echo '$SUDO_PASS' | sudo -S rm -rf /var/www/*
echo '$SUDO_PASS' | sudo -S rm -rf /var/www/.[!.]*
echo 'Total wipe /var/www selesai.'
"@
} else {
    @"
echo 'Menghapus direktori app Absenta di /var/www...'
echo '$SUDO_PASS' | sudo -S rm -rf /var/www/licensing-server
echo '$SUDO_PASS' | sudo -S rm -rf /var/www/absenta.id
echo '$SUDO_PASS' | sudo -S rm -rf /var/www/project-absenta
echo 'Hapus direktori spesifik selesai.'
"@
}

$purgeScript = @"
#!/bin/bash
# Tidak pakai set -e agar command not found tidak abort script
# Semua command sudah menggunakan || true untuk toleransi error

echo 'Membatalkan seluruh layanan PM2 dan proses Node.js...'
pm2 kill || true
echo '$SUDO_PASS' | sudo -S pm2 kill || true
killall -9 node || true
echo '$SUDO_PASS' | sudo -S npm uninstall -g pm2 || true
echo '$SUDO_PASS' | sudo -S rm -rf /root/.pm2 /home/$NEW_USER/.pm2 || true

echo 'Menghentikan layanan sistem WireGuard dan Caddy...'
echo '$SUDO_PASS' | sudo -S systemctl stop wg-quick@wg0 || true
echo '$SUDO_PASS' | sudo -S systemctl disable wg-quick@wg0 || true
echo '$SUDO_PASS' | sudo -S systemctl stop caddy || true

echo 'Mencopot paket instalasi (Caddy, WireGuard, Node.js)...'
echo '$SUDO_PASS' | sudo -S apt-get purge -y caddy wireguard nodejs npm || true
echo '$SUDO_PASS' | sudo -S apt-get autoremove -y || true

$varWwwCleanup


echo 'Menghapus konfigurasi sistem...'
echo '$SUDO_PASS' | sudo -S rm -rf /etc/wireguard
echo '$SUDO_PASS' | sudo -S rm -rf /etc/caddy
echo '$SUDO_PASS' | sudo -S rm -rf /etc/apt/sources.list.d/nodesource.list || true

echo 'Membersihkan custom systemd services...'
for SVC in pm2-asepsuryadi minio redis postgresql redis-server; do
    echo '$SUDO_PASS' | sudo -S systemctl stop \$SVC 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S systemctl disable \$SVC 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S rm -f /etc/systemd/system/\${SVC}.service
done
echo '$SUDO_PASS' | sudo -S bash -c "echo 'postgresql-14 postgresql-14/postrm_purge_data boolean true' | debconf-set-selections" 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S bash -c "DEBIAN_FRONTEND=noninteractive apt-get purge -y 'postgresql*' redis-server redis minio 2>/dev/null || true"
echo '$SUDO_PASS' | sudo -S apt-get autoremove -y 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S rm -rf /var/lib/redis /var/lib/postgresql /etc/redis /etc/postgresql || true
echo '$SUDO_PASS' | sudo -S systemctl daemon-reload

echo ''
echo '=== Verifikasi Akhir ==='
echo -n 'Sisa isi /var/www: '
ls /var/www 2>/dev/null || echo '(kosong)'
echo -n 'Node.js: '
node -v 2>/dev/null || echo 'tidak terinstall'
echo -n 'PM2: '
pm2 -v 2>/dev/null || echo 'tidak terinstall'
echo -n 'PostgreSQL: '
systemctl is-active postgresql 2>/dev/null || echo 'tidak aktif'
echo -n 'Redis: '
systemctl is-active redis-server 2>/dev/null || echo 'tidak aktif'
echo -n 'MinIO: '
systemctl is-active minio 2>/dev/null || echo 'tidak aktif'
echo -n 'Custom systemd sisa: '
ls /etc/systemd/system/pm2*.service /etc/systemd/system/minio.service /etc/systemd/system/redis.service 2>/dev/null || echo '(tidak ada)'
echo 'Selesai!'
exit 0
"@

try {
    Run-RemoteScript -ScriptContent $purgeScript -TargetUser $NEW_USER -TargetIP $NEW_IP -PEMKey $SAFE_KEY
} catch {
    Show-Log "Peringatan: $_" "Yellow"
    Show-Log "Purge mungkin tidak sepenuhnya bersih, namun proses tetap dilanjutkan." "Yellow"
}

Show-Header "FACTORY RESET SELESAI"
Write-Host "Semua konfigurasi dan file yang terkait dengan Server Lisensi telah dilenyapkan." -ForegroundColor Green
Write-Host "VPS Anda kini sudah kembali seperti Kertas Kosong." -ForegroundColor Green
Write-Host ""
Stop-Transcript
Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."

