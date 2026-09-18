# easy-check-tuning.ps1 - Skrip Pengecekan Hasil Tuning Linux Absenta
# Menghubungkan via SSH dan memverifikasi status sysctl, limits, config postgresql/redis, timezone, dsb.

param (
    [string]$TargetIP,
    [string]$TargetUser,
    [string]$KeyFile
)

$ErrorActionPreference = "Stop"

function Show-Header {
    param ($Title)
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "      $Title" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Cyan
}

Show-Header "INSPEKSI STATUS TUNING LINUX (REMOTE)"

if ([string]::IsNullOrWhiteSpace($TargetIP)) {
    $TargetIP = (Read-Host "Masukkan IP VPS Target [Default: 10.10.10.99]").Trim()
    if ([string]::IsNullOrWhiteSpace($TargetIP)) { $TargetIP = "10.10.10.99" }
}

if ([string]::IsNullOrWhiteSpace($TargetUser)) {
    $inputUser = (Read-Host "Masukkan Username VPS Target [Default: asep]").Trim()
    $TargetUser = if ([string]::IsNullOrWhiteSpace($inputUser)) { "asep" } else { $inputUser }
}

if ([string]::IsNullOrWhiteSpace($KeyFile)) {
    Write-Host "`nPilih SSH Key untuk VPS tersebut:"
    Write-Host " 1) nginxonly.pem"
    Write-Host " 2) ls-key.pem"
    Write-Host " 3) Input path file manual..."
    $keyChoice = Read-Host "Pilih opsi [1-3] (Default: 1)"

    if ([string]::IsNullOrWhiteSpace($keyChoice) -or $keyChoice -eq "1") { $KeyFile = Join-Path $PSScriptRoot "nginxonly.pem" }
    elseif ($keyChoice -eq "2") { $KeyFile = Join-Path $PSScriptRoot "ls-key.pem" }
    elseif ($keyChoice -eq "3") { $KeyFile = (Read-Host "Masukkan path absolut file .pem").Trim() }
    else { throw "Pilihan key tidak valid." }
}

if (-not (Test-Path $KeyFile)) {
    throw "SSH Key tidak ditemukan di: $KeyFile"
}

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_KEY = Join-Path $env:TEMP ("safe-check-" + [System.IO.Path]::GetFileName($KeyFile))
Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $KeyFile | Set-Content -Path $SAFE_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_KEY -AclObject $acl

Write-Host "`nMenghubungkan ke ${TargetUser}@${TargetIP}..." -ForegroundColor Cyan

$remoteCommands = @"
echo '==================== 1. KERNEL SYSCTL ===================='
sysctl fs.file-max vm.swappiness vm.overcommit_memory net.core.somaxconn net.ipv4.tcp_tw_reuse net.ipv4.ip_local_port_range
echo ''
echo '==================== 2. LIMITS (NOFILE / NPROC) ===================='
cat /etc/security/limits.d/99-absenta-limits.conf 2>/dev/null || echo 'Belum ada /etc/security/limits.d/99-absenta-limits.conf'
echo ''
echo '==================== 3. ABSENTA GENERATED CONFIGS ===================='
ls -la /etc/absenta/config/ 2>/dev/null || echo 'Direktori /etc/absenta/config/ tidak ditemukan'
if [ -f /etc/absenta/config/postgresql.conf ]; then
    echo '--- /etc/absenta/config/postgresql.conf (head 15) ---'
    head -n 15 /etc/absenta/config/postgresql.conf
fi
if [ -f /etc/absenta/config/redis.conf ]; then
    echo '--- /etc/absenta/config/redis.conf ---'
    cat /etc/absenta/config/redis.conf
fi
echo ''
echo '==================== 4. POSTGRESQL & REDIS LINK STATUS ===================='
ls -la /etc/postgresql/*/main/conf.d/ 2>/dev/null || echo 'Belum ada service postgresql di path standar'
grep -i 'absenta' /etc/redis/redis.conf 2>/dev/null || echo 'Belum ada include absenta di /etc/redis/redis.conf'
echo ''
echo '==================== 5. DOCKER DAEMON CONFIG ===================='
cat /etc/docker/daemon.json 2>/dev/null || echo 'Belum ada /etc/docker/daemon.json'
echo ''
echo '==================== 6. TIME & TIMEZONE ===================='
timedatectl
echo ''
echo '==================== 7. MEMORY & SWAP ===================='
free -h
swapon --show
"@

& ssh -i "$SAFE_KEY" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "$remoteCommands"

Write-Host "`nPengecekan server selesai." -ForegroundColor Green
