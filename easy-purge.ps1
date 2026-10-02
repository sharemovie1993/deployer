param(
    [string]$TargetIP = "",
    [string]$TargetUser = "",
    [string]$KeyPath = "",
    [string]$SudoPass = "",
    [string]$PurgeMode = "1",
    [switch]$Silent
)

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
        [string]$PEMKey,
        [string]$SudoPass
    )
    # Tulis script tanpa BOM agar bash Linux tidak error pada shebang #!/bin/bash
    $tmpFile = Join-Path $env:TEMP "remote_purge_script.sh"
    $ScriptContent = $ScriptContent -replace "`r`n", "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($tmpFile, $ScriptContent, $utf8NoBom)

    Show-Log "Mengunggah script ke ${TargetUser}@${TargetIP}..." "Gray"
    & scp -i "$PEMKey" -o StrictHostKeyChecking=no -o LogLevel=ERROR "$tmpFile" "${TargetUser}@${TargetIP}:/tmp/remote_purge_script.sh" 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        throw "Upload script ke VPS gagal (exit code $LASTEXITCODE)"
    }

    Show-Log "Menjalankan script di ${TargetUser}@${TargetIP} sebagai root..." "Gray"
    $oldEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & ssh -i "$PEMKey" -o StrictHostKeyChecking=no -o LogLevel=ERROR "${TargetUser}@${TargetIP}" "echo '$SudoPass' | sudo -S -p '' bash /tmp/remote_purge_script.sh" 2>&1 | ForEach-Object {
            $line = $_.ToString()
            if ($line -notmatch "\[sudo\] password for") {
                Write-Host $line
            }
        }
    } finally {
        $ErrorActionPreference = $oldEAP
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Eksekusi script remote purge gagal (exit code $LASTEXITCODE)"
    }
}


Show-Header "FACTORY RESET VPS BARU (PURGE)"
Write-Host "PERINGATAN KERAS:" -ForegroundColor Red -Bold
Write-Host "Opsi ini akan MENGHAPUS BERSIH seluruh ekosistem Server Lisensi di VPS Anda." -ForegroundColor Red
Write-Host "Ini mencakup Node.js, PM2, WireGuard, Caddy, Database, dan Folder /var/www." -ForegroundColor Red
Write-Host "Tindakan ini sangat berguna jika Anda ingin memulai dari kertas kosong (100% fresh)." -ForegroundColor Yellow
Write-Host ""

if ($Silent) {
    if ([string]::IsNullOrWhiteSpace($TargetIP)) {
        throw "TargetIP wajib disertakan saat mode Silent!"
    }
    $targetIP = $TargetIP.Trim()
    $NEW_IP = $targetIP

    # Deteksi preset jika ada
    $matchedPreset = $null
    $presetsPath = Join-Path $PSScriptRoot "presets.json"
    if (Test-Path $presetsPath) {
        try {
            $allPresets = Get-Content $presetsPath -Raw | ConvertFrom-Json
            $matchedPreset = $allPresets | Where-Object { $_.vpsIp -eq $targetIP } | Select-Object -First 1
        } catch {}
    }

    # Tentukan user
    if (-not [string]::IsNullOrWhiteSpace($TargetUser)) {
        $NEW_USER = $TargetUser.Trim()
    } elseif ($matchedPreset -and -not [string]::IsNullOrWhiteSpace($matchedPreset.vpsUser)) {
        $NEW_USER = $matchedPreset.vpsUser.Trim()
    } else {
        $NEW_USER = "asep"
    }

    # Tentukan SSH Key
    if (-not [string]::IsNullOrWhiteSpace($KeyPath) -and (Test-Path $KeyPath)) {
        $PEM_KEY = $KeyPath
    } elseif ($matchedPreset -and -not [string]::IsNullOrWhiteSpace($matchedPreset.vpsKeyPath) -and (Test-Path $matchedPreset.vpsKeyPath)) {
        $PEM_KEY = $matchedPreset.vpsKeyPath
    } elseif ($matchedPreset -and $matchedPreset.sshKeyChoice -eq "ls-key.pem" -and (Test-Path (Join-Path $PSScriptRoot "ls-key.pem"))) {
        $PEM_KEY = Join-Path $PSScriptRoot "ls-key.pem"
    } else {
        $PEM_KEY = Join-Path $PSScriptRoot "nginxonly.pem"
    }

    if (-not (Test-Path $PEM_KEY)) {
        throw "Error: File SSH Key tidak ditemukan di '$PEM_KEY'"
    }

    # Tentukan Sudo Password
    if (-not [string]::IsNullOrWhiteSpace($SudoPass)) {
        $SUDO_PASS = $SudoPass.Trim()
    } elseif ($matchedPreset -and -not [string]::IsNullOrWhiteSpace($matchedPreset.vpsSudoPass)) {
        $SUDO_PASS = $matchedPreset.vpsSudoPass.Trim()
    } else {
        $SUDO_PASS = "1"
    }

    $purgeMode = if ($PurgeMode -eq "2") { "2" } else { "1" }
    
    # Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
    $SAFE_KEY = "$env:TEMP\purge-key-safe.pem"
    Copy-Item $PEM_KEY $SAFE_KEY -Force
    icacls $SAFE_KEY /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):F" /q | Out-Null

} else {
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

    # Deteksi otomatis dari presets.json jika ada
    $matchedPreset = $null
    $presetsPath = Join-Path $PSScriptRoot "presets.json"
    if (Test-Path $presetsPath) {
        try {
            $allPresets = Get-Content $presetsPath -Raw | ConvertFrom-Json
            $matchedPreset = $allPresets | Where-Object { $_.vpsIp -eq $targetIP } | Select-Object -First 1
        } catch {}
    }

    $defaultKeyChoice = "1"
    if ($matchedPreset -and $matchedPreset.sshKeyChoice -eq "ls-key.pem") { $defaultKeyChoice = "2" }

    Write-Host ""
    Write-Host "Pilih SSH Key untuk VPS tersebut:"
    Write-Host " 1) nginxonly.pem"
    Write-Host " 2) ls-key.pem"
    Write-Host " 3) Input path file .pem manual..."
    $keyChoice = Read-Host "Pilih opsi [1-3] (Default: $defaultKeyChoice)"
    if ([string]::IsNullOrWhiteSpace($keyChoice)) { $keyChoice = $defaultKeyChoice }

    if ($keyChoice -eq "1") { 
        $PEM_KEY = Join-Path $PSScriptRoot "nginxonly.pem" 
    } elseif ($keyChoice -eq "2") { 
        $PEM_KEY = Join-Path $PSScriptRoot "ls-key.pem" 
    } elseif ($keyChoice -eq "3") {
        $PEM_KEY = Read-Host "Masukkan path lengkap file .pem"
    } else {
        $PEM_KEY = Join-Path $PSScriptRoot "nginxonly.pem"
    }

    if (-not (Test-Path $PEM_KEY)) {
        Write-Host "Error: File SSH Key tidak ditemukan di '$PEM_KEY'" -ForegroundColor Red
        exit
    }

    $NEW_IP = $targetIP
    $defaultUser = if ($matchedPreset -and -not [string]::IsNullOrWhiteSpace($matchedPreset.vpsUser)) { $matchedPreset.vpsUser } else { "asep" }
    $NEW_USER = (Read-Host "Masukkan username SSH VPS [$defaultUser]").Trim()
    if ([string]::IsNullOrWhiteSpace($NEW_USER)) { $NEW_USER = $defaultUser }

    # Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
    $SAFE_KEY = "$env:TEMP\purge-key-safe.pem"
    Copy-Item $PEM_KEY $SAFE_KEY -Force
    icacls $SAFE_KEY /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):F" /q | Out-Null

    $defaultSudoPass = if ($matchedPreset -and -not [string]::IsNullOrWhiteSpace($matchedPreset.vpsSudoPass)) { $matchedPreset.vpsSudoPass } else { "1" }
    $SUDO_PASS = (Read-Host "Masukkan password sudo VPS Anda [$defaultSudoPass]").Trim()
    if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = $defaultSudoPass }

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
}

Show-Log "Memulai proses pembersihan $(if ($purgeMode -eq '2') {'TOTAL'} else {'Standar'}) ke VPS ($NEW_IP)..." "Yellow"

$varWwwCleanup = if ($purgeMode -eq "2") {
    @"
echo 'Menghapus SELURUH isi /var/www (Total Wipe)...'
rm -rf /var/www/*
rm -rf /var/www/.[!.]*
echo 'Total wipe /var/www selesai.'
"@
} else {
    @"
echo 'Menghapus direktori app Absenta di /var/www...'
rm -rf /var/www/licensing-server
rm -rf /var/www/absenta.id
rm -rf /var/www/project-absenta
echo 'Hapus direktori spesifik selesai.'
"@
}

$purgeScript = @"
#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo '[1/8] Membatalkan seluruh layanan PM2 dan proses Node.js...'
killall -9 node pm2 caddy postgres redis-server minio turnserver 2>/dev/null || true
pkill -9 -f 'caddy|minio|redis|postgres|turnserver|pm2' 2>/dev/null || true
npm uninstall -g pm2 2>/dev/null || true
rm -rf /root/.pm2 /home/*/.pm2 || true

echo '[2/8] Menghentikan dan membersihkan layanan WireGuard dan Caddy...'
systemctl stop wg-quick@wg0 caddy --no-block 2>/dev/null || true
systemctl disable wg-quick@wg0 caddy 2>/dev/null || true

echo '[3/8] Mencopot paket instalasi (Caddy, WireGuard, Node.js)...'
apt-get purge -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" caddy wireguard nodejs npm 2>/dev/null || true
apt-get autoremove -y 2>/dev/null || true

echo '[4/8] Membersihkan direktori aplikasi di /var/www...'
$varWwwCleanup

echo '[5/8] Menghapus total konfigurasi sistem & sisa file Caddy/SSL...'
rm -rf /etc/wireguard /etc/caddy /var/lib/caddy /var/log/caddy || true
rm -rf /tmp/caddy* /tmp/Caddyfile* /tmp/caddy_base.txt /tmp/caddy_absenta_block.conf || true
rm -f /usr/local/bin/sync-ssl.sh /etc/cron.daily/sync-ssl /tmp/sync-ssl* || true
rm -rf /etc/apt/sources.list.d/nodesource.list /etc/apt/sources.list.d/caddy* || true

echo '[6/8] Membersihkan custom systemd services...'
systemctl stop minio redis postgresql redis-server coturn turnserver --no-block 2>/dev/null || true
systemctl disable minio redis postgresql redis-server coturn turnserver 2>/dev/null || true
for SVC in pm2 pm2-root pm2-asep pm2-asepsuryadi; do
    systemctl stop "`$SVC" --no-block 2>/dev/null || true
    systemctl disable "`$SVC" 2>/dev/null || true
    rm -f "/etc/systemd/system/`$SVC.service" "/etc/systemd/system/multi-user.target.wants/`$SVC.service" 2>/dev/null || true
done
rm -f /etc/systemd/system/pm2*.service /etc/systemd/system/multi-user.target.wants/pm2*.service || true
rm -f /etc/systemd/system/minio.service /etc/systemd/system/redis.service /etc/systemd/system/turnserver.service 2>/dev/null || true

echo '[7/8] Menghapus paket database (Postgres, Redis, Coturn, MinIO)...'
which debconf-set-selections >/dev/null 2>&1 && echo 'postgresql-14 postgresql-14/postrm_purge_data boolean true' | debconf-set-selections 2>/dev/null || true
which debconf-set-selections >/dev/null 2>&1 && echo 'postgresql-common postgresql-common/postrm_purge_data boolean true' | debconf-set-selections 2>/dev/null || true
for pkg in 'postgresql*' 'redis-server' 'redis-tools' 'coturn'; do
    apt-get purge -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" `$pkg 2>/dev/null || true
done
apt-get autoremove --purge -y 2>/dev/null || true
rm -f /usr/local/bin/minio /usr/local/bin/mc /tmp/setup-minio.sh /tmp/minio_offline /tmp/mc_offline 2>/dev/null || true
rm -rf /var/lib/redis /var/lib/postgresql /etc/redis /etc/postgresql /var/lib/minio /etc/minio /var/log/redis /var/log/postgresql || true
rm -rf /tmp/*absenta* /tmp/ssl* || true

echo '[8/8] Memperbarui daemon systemd...'
systemctl daemon-reload

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
echo -n 'Caddy: '
systemctl is-active caddy 2>/dev/null || echo 'tidak aktif'
echo -n 'Custom systemd sisa: '
ls /etc/systemd/system/pm2*.service /etc/systemd/system/minio.service /etc/systemd/system/redis.service 2>/dev/null || echo '(tidak ada)'
echo 'Selesai!'
exit 0
"@

try {
    Run-RemoteScript -ScriptContent $purgeScript -TargetUser $NEW_USER -TargetIP $NEW_IP -PEMKey $SAFE_KEY -SudoPass $SUDO_PASS
    Show-Header "FACTORY RESET SELESAI"
    Write-Host "[PURGE_COMPLETE] Semua konfigurasi dan file yang terkait dengan Server Lisensi telah dilenyapkan." -ForegroundColor Green
    Write-Host "VPS Anda kini sudah kembali seperti Kertas Kosong." -ForegroundColor Green
} catch {
    Show-Log "Error: $_" "Red"
    Write-Host "[PURGE_FAILED] Eksekusi factory reset gagal: $_" -ForegroundColor Red
}

Write-Host ""
Stop-Transcript
if (-not $Silent) {
    Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
}


