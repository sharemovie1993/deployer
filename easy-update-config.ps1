# easy-update-config.ps1 - Skrip Cepat Update Konfigurasi Terowongan/Lisensi Remote
# Mengupdate LICENSE_SERVER_URL dan EASY_TUNNEL_BASE_DOMAIN di VPS tanpa perlu build ulang

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "update-config-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Show-Header {
    param([string]$Title)
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "        UPDATE BASE DOMAIN EASY-TUNNEL DAN LISENSI SERVER                 " -ForegroundColor Yellow -Bold
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " -> $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

Show-Header "Persiapan Koneksi VPS Target"

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

if (-not (Test-Path $NEW_KEY_SOURCE)) {
    Write-Host "Error: File SSH Key tidak ditemukan di '$NEW_KEY_SOURCE'" -ForegroundColor Red
    exit
}

$SUDO_PASS = (Read-Host "Masukkan password sudo VPS Anda [g1g1G1NGSUL*!2]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "g1g1G1NGSUL*!2" }

Show-Header "Konfigurasi Nilai Baru"

$NEW_LICENSE_SERVER = (Read-Host "Masukkan URL Server Lisensi Baru [https://api.absenta.id]").Trim()
if ([string]::IsNullOrWhiteSpace($NEW_LICENSE_SERVER)) { $NEW_LICENSE_SERVER = "https://api.absenta.id" }

$NEW_BASE_DOMAIN = (Read-Host "Masukkan Base Domain Easy Tunnel Baru [absenta.id]").Trim()
if ([string]::IsNullOrWhiteSpace($NEW_BASE_DOMAIN)) { $NEW_BASE_DOMAIN = "absenta.id" }

# Set key permission for Windows SSH client
$SAFE_NEW_KEY = "$env:TEMP\new-config-key.pem"
Remove-Item $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $NEW_KEY_SOURCE | Set-Content -Path $SAFE_NEW_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_NEW_KEY -AclObject $acl

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

Show-Header "Update Base Domain Easy-Tunnel dan Lisensi Server"
Show-Log "Menghubungkan ke VPS ($NEW_IP)..." "Yellow"

$updateScript = "@
set -e
echo "==== Memulai Update Base Domain & Lisensi Server ===="
cd /var/www/project-absenta

echo "Mengubah konfigurasi .env backend..."

# Update EASY_TUNNEL_BASE_DOMAIN
if grep -q "^EASY_TUNNEL_BASE_DOMAIN=" absenta_backend/.env; then
    sed -i "s|^EASY_TUNNEL_BASE_DOMAIN=.*|EASY_TUNNEL_BASE_DOMAIN=$NEW_BASE_DOMAIN|g" absenta_backend/.env
else
    echo "EASY_TUNNEL_BASE_DOMAIN=$NEW_BASE_DOMAIN" >> absenta_backend/.env
fi

# Update LICENSE_SERVER_URL
if grep -q "^LICENSE_SERVER_URL=" absenta_backend/.env; then
    sed -i "s|^LICENSE_SERVER_URL=.*|LICENSE_SERVER_URL=$NEW_LICENSE_SERVER|g" absenta_backend/.env
else
    echo "LICENSE_SERVER_URL=$NEW_LICENSE_SERVER" >> absenta_backend/.env
fi

echo "Memuat ulang PM2 untuk menerapkan perubahan..."
pm2 reload ecosystem.config.js || pm2 reload project-absenta || pm2 restart all

echo "=========================================================="
echo "   UPDATE BASE DOMAIN & LISENSI SERVER SELESAI SAKSES!    "
echo "=========================================================="
"@

try {
    Run-RemoteScript -ScriptContent $updateScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP
    Show-Log "Konfigurasi remote berhasil diperbarui!" "Green"
} catch {
    Show-Log "Error saat memperbarui konfigurasi: $_" "Red"
} finally {
    Remove-Item -Path $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
    Stop-Transcript
}

Write-Host ""
Read-Host "Tekan [ENTER] untuk selesai..."
