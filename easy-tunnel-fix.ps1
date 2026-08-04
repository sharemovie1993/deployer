$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "easy-tunnel-fix-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
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

Show-Header "PERBAIKAN & PEMBERSIHAN TEROWONGAN EASY TUNNEL REMOTE"
Write-Host "Alat ini akan memeriksa, membersihkan rute konflik, mengamankan izin 0600," -ForegroundColor White
Write-Host "dan memastikan firewall VPS tidak memblokir koneksi WireGuard." -ForegroundColor White
Write-Host ""

$targetIP = (Read-Host "Masukkan IP VPS Target (Contoh: 10.10.10.99 atau 103.196.155.87) [Default: 10.10.10.99]").Trim()
if ([string]::IsNullOrWhiteSpace($targetIP)) { $targetIP = "10.10.10.99" }

Write-Host ""
Write-Host "Pilih SSH Key untuk VPS tersebut:"
Write-Host " 1) nginxonly.pem (Rekomendasi untuk VPS Lokal 10.10.10.99)"
Write-Host " 2) ls-key.pem (Rekomendasi untuk VPS Public 103.196.155.87)"
Write-Host " 3) Input path file .pem manual..."
$keyChoice = Read-Host "Pilih opsi [1-3] (Default: 1)"

if ([string]::IsNullOrWhiteSpace($keyChoice) -or $keyChoice -eq "1") { 
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

$NEW_USER = "asepsuryadi"

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_KEY = "$env:TEMP\tunnel-fix-key-safe.pem"
Copy-Item $PEM_KEY $SAFE_KEY -Force
icacls $SAFE_KEY /inheritance:r /grant:r "$($env:USERDOMAIN)\$($env:USERNAME):F" /q

$SUDO_PASS = (Read-Host "Masukkan password sudo VPS Anda [Default: 1]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "1" }

Show-Log "Memulai inspeksi & perbaikan terowongan ke VPS ($targetIP)..." "Yellow"

$remoteScript = @"
echo "=========================================================="
echo "      DIAGNOSA & PEMBERSIHAN TEROWONGAN WIREGUARD"
echo "=========================================================="
echo "1. Memeriksa interface WireGuard yang terpasang di kernel Linux..."
WG_IFACES=\$(ip link show type wireguard 2>/dev/null | grep -oE 'et-[a-zA-Z0-9_-]+' || true)

if [ -z "\$WG_IFACES" ]; then
    echo "ℹ️  Tidak ada interface WireGuard Easy Tunnel (et-*) yang aktif."
else
    echo "🔍 Interface Easy Tunnel Terdeteksi:"
    echo "\$WG_IFACES"
    echo ""
    echo "Detail Handshake & Lalu Lintas:"
    for ifc in \$WG_IFACES; do
        echo "----------------------------------------------------------"
        echo "Interface: \$ifc"
        echo "$SUDO_PASS" | sudo -S wg show "\$ifc" 2>/dev/null || echo "Gagal membaca status \$ifc"
    done
fi

echo ""
echo "2. Memeriksa & mengamankan file konfigurasi (chmod 600)..."
if [ -d "/var/www/project-absenta/tunnels" ]; then
    echo "$SUDO_PASS" | sudo -S chmod 600 /var/www/project-absenta/tunnels/*.conf 2>/dev/null || true
    echo "✅ Permissions /var/www/project-absenta/tunnels/*.conf diset ke 0600."
fi
if [ -d "/etc/wireguard" ]; then
    echo "$SUDO_PASS" | sudo -S chmod 600 /etc/wireguard/*.conf 2>/dev/null || true
    echo "✅ Permissions /etc/wireguard/*.conf diset ke 0600."
fi

echo ""
echo "3. Memeriksa & melonggarkan Firewall UFW untuk trafik WireGuard..."
if command -v ufw >/dev/null 2>&1; then
    echo "$SUDO_PASS" | sudo -S ufw allow 51820/udp 2>/dev/null || true
    echo "$SUDO_PASS" | sudo -S ufw allow 443/tcp 2>/dev/null || true
    echo "$SUDO_PASS" | sudo -S ufw allow 80/tcp 2>/dev/null || true
    echo "$SUDO_PASS" | sudo -S ufw allow 3001/tcp 2>/dev/null || true
    echo "$SUDO_PASS" | sudo -S ufw allow 3000/tcp 2>/dev/null || true
    echo "✅ Aturan UFW diperbarui."
fi

echo ""
echo "4. Pengujian konektivitas internal ke Server Lisensi (10.0.0.1)..."
ping -c 3 10.0.0.1 2>&1 || echo "⚠️  Tidak dapat me-ping 10.0.0.1 (Koneksi VPN belum aktif)."

echo ""
echo "=========================================================="
echo "      PROSES INSPEKSI & PERBAIKAN SELESAI"
echo "=========================================================="
"@

$tmpFile = Join-Path $env:TEMP "remote_tunnel_fix.sh"
$remoteScript | Out-File -FilePath $tmpFile -Encoding utf8

$scpCmd = "scp -i `"$SAFE_KEY`" -o StrictHostKeyChecking=no `"$tmpFile`" ${NEW_USER}@${targetIP}:/tmp/remote_tunnel_fix.sh"
Invoke-Expression $scpCmd

$SSH_CMD = "ssh -i `"$SAFE_KEY`" -o StrictHostKeyChecking=no ${NEW_USER}@${targetIP}"
$runCmd = "$SSH_CMD `"bash /tmp/remote_tunnel_fix.sh`""
Invoke-Expression $runCmd

Show-Log "Perbaikan selesai!" "Green"
Write-Host ""
$manageOption = Read-Host "Apakah Anda ingin mematikan interface EasyTunnel tertentu secara manual? [y/N]"
if ($manageOption -eq "y" -or $manageOption -eq "Y") {
    $ifcToStop = (Read-Host "Masukkan nama interface yang ingin dimatikan (Contoh: et-smp4)").Trim()
    if (-not [string]::IsNullOrWhiteSpace($ifcToStop)) {
        Show-Log "Mematikan interface $ifcToStop..." "Yellow"
        Invoke-Expression "$SSH_CMD `"echo '$SUDO_PASS' | sudo -S wg-quick down '$ifcToStop' 2>/dev/null || true`""
        Show-Log "Interface $ifcToStop berhasil dimatikan." "Green"
    }
}

Stop-Transcript
Write-Host ""
Read-Host "Tekan [ENTER] untuk kembali ke menu..."
