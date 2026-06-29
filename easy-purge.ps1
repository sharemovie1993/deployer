$ErrorActionPreference = "Stop"

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
        [string]$SSHCmd,
        [string]$TargetUser,
        [string]$TargetIP,
        [string]$PEMKey
    )
    $tmpFile = Join-Path $env:TEMP "remote_purge_script.sh"
    $ScriptContent | Out-File -FilePath $tmpFile -Encoding utf8
    
    $scpCmd = "scp -i `"$PEMKey`" -o StrictHostKeyChecking=no `"$tmpFile`" ${TargetUser}@${TargetIP}:/tmp/remote_purge_script.sh"
    Invoke-Expression $scpCmd
    
    $runCmd = "$SSHCmd `"bash /tmp/remote_purge_script.sh`""
    Invoke-Expression $runCmd
    if ($LASTEXITCODE -ne 0) {
        throw "Eksekusi script remote purge gagal dengan Exit Code $LASTEXITCODE"
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

$SUDO_PASS = "g1g1G1NGSUL*!2"

Show-Log "Memulai proses pembersihan total ke VPS ($NEW_IP)..." "Yellow"

$purgeScript = @"
set -e
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

echo 'Menghapus direktori dan file konfigurasi...'
echo '$SUDO_PASS' | sudo -S rm -rf /var/www/licensing-server
echo '$SUDO_PASS' | sudo -S rm -rf /var/www/absenta.id
echo '$SUDO_PASS' | sudo -S rm -rf /etc/wireguard
echo '$SUDO_PASS' | sudo -S rm -rf /etc/caddy
echo '$SUDO_PASS' | sudo -S rm -rf /etc/apt/sources.list.d/nodesource.list || true

echo 'Selesai!'
"@

Run-RemoteScript -ScriptContent $purgeScript -SSHCmd $SSH_NEW -TargetUser $NEW_USER -TargetIP $NEW_IP -PEMKey $SAFE_KEY

Show-Header "FACTORY RESET SELESAI"
Write-Host "Semua konfigurasi dan file yang terkait dengan Server Lisensi telah dilenyapkan." -ForegroundColor Green
Write-Host "VPS Anda kini sudah kembali seperti Kertas Kosong." -ForegroundColor Green
Write-Host ""
Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
