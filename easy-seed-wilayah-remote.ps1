# easy-seed-wilayah-remote.ps1 - Skrip Remote Seed Full Wilayah Indonesia via SSH
# Memulai dan memantau seeder full wilayah Indonesia (~91.600 record) di VPS Target

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
$LOG_FILE = Join-Path $LOG_DIR "seed-wilayah-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

Show-Log "Memulai Remote Full Territory Seeding di VPS Target ($TargetIP)..." "Yellow"

if ([string]::IsNullOrWhiteSpace($TargetIP)) { $TargetIP = "10.10.10.99" }
if ([string]::IsNullOrWhiteSpace($KeyPath)) { $KeyPath = Join-Path $PSScriptRoot "nginxonly.pem" }

if (-not (Test-Path $KeyPath)) {
    Write-Host "Error: File SSH Key tidak ditemukan di '$KeyPath'" -ForegroundColor Red
    exit 1
}

# Set key permission for Windows SSH client
$SAFE_KEY = "$env:TEMP\seed-wilayah-key.pem"
Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $KeyPath | Set-Content -Path $SAFE_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_KEY -AclObject $acl

$remoteCommand = @"
export PATH=`${PATH}:/usr/local/bin:/usr/bin:/bin
if [ -d "`$HOME/.nvm/versions/node" ]; then
    NODE_BIN=`$(ls -td "`$HOME/.nvm/versions/node"/* 2>/dev/null | head -n 1)/bin
    if [ -d "`$NODE_BIN" ]; then
        export PATH="`$NODE_BIN:`${PATH}"
    fi
fi
if [ -f "`$HOME/.nvm/nvm.sh" ]; then
    source "`$HOME/.nvm/nvm.sh" 2>/dev/null || true
fi

echo "=========================================================================="
echo "🌐 MEMULAI SEEDER FULL WILAYAH INDONESIA SE-INDONESIA (~91.600 RECORD)"
echo "=========================================================================="

TARGET_DIR=""
if [ -d "/var/www/project-absenta/absenta_backend" ]; then
    TARGET_DIR="/var/www/project-absenta/absenta_backend"
elif [ -d "/var/www/absenta/absenta_backend" ]; then
    TARGET_DIR="/var/www/absenta/absenta_backend"
elif [ -d "/var/www/project-absenta" ]; then
    TARGET_DIR="/var/www/project-absenta"
fi

if [ -z "`$TARGET_DIR" ]; then
    echo "❌ ERROR: Folder proyek absenta_backend tidak ditemukan di /var/www/!"
    exit 1
fi

cd "`$TARGET_DIR"
echo "📍 Directory Proyek: `$TARGET_DIR"

if [ -f src/scripts/seed_full_wilayah.ts ]; then
    echo "🌱 Menjalankan seed_full_wilayah.ts via ts-node..."
    npx ts-node -r tsconfig-paths/register src/scripts/seed_full_wilayah.ts
elif [ -f dist/scripts/seed_full_wilayah.js ]; then
    echo "🌱 Menjalankan seed_full_wilayah.js via node dist..."
    node -r tsconfig-paths/register dist/scripts/seed_full_wilayah.js
else
    echo "🌱 Menjalankan fallback npx prisma db seed..."
    npx prisma db seed
fi
"@

$tempScript = "$env:TEMP\seed_wilayah_remote.sh"
$remoteCommand = $remoteCommand -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($tempScript, $remoteCommand)

Show-Log "Mengunggah script seeder ke VPS..." "Cyan"
& scp -i "$SAFE_KEY" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/seed_wilayah_remote.sh"

Show-Log "Eksekusi Seeder Berjalan di VPS (Real-time Stream)..." "Green"
& ssh -i "$SAFE_KEY" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/seed_wilayah_remote.sh"

if ($LASTEXITCODE -eq 0) {
    Show-Log "✅ SINKRONISASI FULL DATA WILAYAH INDONESIA SELESAI SUKSES!" "Green"
} else {
    Show-Log "❌ SINKRONISASI WILAYAH GAGAL DENGAN EXIT CODE: $LASTEXITCODE" "Red"
    exit $LASTEXITCODE
}
