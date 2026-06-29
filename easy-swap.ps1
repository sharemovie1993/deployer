# easy-swap.ps1 - Skrip Konfigurasi SWAP Linux VPS Jarak Jauh
# Berfungsi mengaktifkan 4GB SWAP Space secara remote via SSH

$ErrorActionPreference = "Stop"

$LOG_FILE = "$PSScriptRoot\swap-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force | Out-Null

function Show-Log {
    param ([string]$Message, $Color = "Cyan")
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

Show-Header "SETUP SWAP SERVER LINUX (REMOTE)"
Write-Host "Script ini akan mengonfigurasi SWAP Space sebesar 4GB di VPS secara remote."
Write-Host "Membantu mencegah crash karena Out of Memory (OOM) saat kompilasi." -ForegroundColor Green
Write-Host "----------------------------------------------------------"

$TARGET_IP = (Read-Host "Masukkan IP VPS Target (Contoh: 103.129.148.127)").Trim()
$TARGET_USER = "asepsuryadi"

if ([string]::IsNullOrWhiteSpace($TARGET_IP)) {
    Write-Host "Error: IP Target tidak boleh kosong!" -ForegroundColor Red
    Stop-Transcript
    exit
}

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

$SUDO_PASS = (Read-Host "Masukkan password sudo VPS Anda [g1g1G1NGSUL*!2]").Trim()
if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "g1g1G1NGSUL*!2" }

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_KEY = Join-Path $env:TEMP "safe-swap-key.pem"
Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $KEY_FILE | Set-Content -Path $SAFE_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_KEY -AclObject $acl

$SSH_NEW = "ssh -i `"$SAFE_KEY`" -o StrictHostKeyChecking=no ${TARGET_USER}@${TARGET_IP}"
$SCP_NEW = "scp -i `"$SAFE_KEY`" -o StrictHostKeyChecking=no"

function Run-RemoteScript {
    param([string]$ScriptContent, [string]$SSHCmd, [string]$SCPCmd, [string]$TargetUser, [string]$TargetIP)
    $tempScript = "$env:TEMP\remote_script.sh"
    $ScriptContent = $ScriptContent -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($tempScript, $ScriptContent)
    Invoke-Expression "$SCPCmd `"$tempScript`" ${TargetUser}@${TargetIP}:/tmp/remote_script.sh"
    $runCmd = "$SSHCmd `"bash /tmp/remote_script.sh`""
    Invoke-Expression $runCmd
    if ($LASTEXITCODE -ne 0) {
        throw "Eksekusi script remote gagal dengan Exit Code $LASTEXITCODE"
    }
}

Show-Log "Menghubungkan ke VPS ($TARGET_IP) untuk konfigurasi SWAP..."

$swapScriptPath = Join-Path $PSScriptRoot "setup-swap.sh"
if (-not (Test-Path $swapScriptPath)) {
    throw "Skrip setup-swap.sh tidak ditemukan di $PSScriptRoot"
}

# 1. SCP berkas setup-swap.sh ke /tmp/setup-swap.sh di VPS
Show-Log "Menyalin skrip konfigurasi SWAP ke VPS..."
$localScriptPath = "$env:TEMP\setup-swap-temp.sh"
$scriptContent = Get-Content -Path $swapScriptPath -Raw
$scriptContent = $scriptContent -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($localScriptPath, $scriptContent)

Invoke-Expression "$SCP_NEW `"$localScriptPath`" ${TARGET_USER}@${TARGET_IP}:/tmp/setup-swap.sh"
if ($LASTEXITCODE -ne 0) {
    throw "Gagal menyalin berkas setup-swap.sh ke VPS target."
}

# 2. Jalankan secara remote menggunakan sudo
Show-Log "Menjalankan skrip setup SWAP di VPS..."
$runCmd = "$SSH_NEW `"echo '$SUDO_PASS' | sudo -S bash /tmp/setup-swap.sh auto`""
Invoke-Expression $runCmd
if ($LASTEXITCODE -ne 0) {
    throw "Eksekusi script remote gagal dengan Exit Code $LASTEXITCODE"
}

Show-Header "SETUP SWAP SELESAI"
Show-Log "Konfigurasi SWAP Space dinamis berhasil diaktifkan secara remote!" "Green"
Write-Host ""
Write-Host "Seluruh jalannya proses ini telah dicatat di berkas log:" -ForegroundColor Yellow
Write-Host " -> $LOG_FILE" -ForegroundColor Cyan
Write-Host ""
Stop-Transcript
Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
