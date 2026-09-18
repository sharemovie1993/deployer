# deploy-absenta-remote.ps1 - Skrip Deploy Project Absenta Terisolasi (VPS Linux)
# Hanya untuk men-deploy Project Absenta (Full Stack) secara remote via SSH

param (
    [string]$TargetIP = "",
    [string]$TargetUser = "asep",
    [string]$KeyPath = "",
    [string]$SudoPass = "",
    [string]$DeployScenario = "hybrid",
    [string]$TargetDomain = "",
    [string]$BackendPort = "3003",
    [string]$FrontendPort = "5175",
    [string]$sslScenario = "internal",
    [string]$cfToken = "",
    [string]$DbUrl = "postgresql://postgres:123123123@localhost:5432/absensi",
    [string]$RedisMode = "N",
    [string]$RedisUrl = "redis://localhost:6379",
    [string]$LicenseKey = "",
    [string]$TunnelBaseDomain = "absenta.id",
    [string]$LicenseServerUrl = "https://api.absenta.id",
    [string]$NodeName = "absenta-node-1",
    [string]$InstallPostgres = "",
    [string]$InstallMinio = "Y",
    [string]$InstallCoturn = "Y",
    [string]$DefaultTimezone = "Asia/Jakarta",
    [switch]$Silent = $false
)

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "deploy-absenta-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}


# Helper to read values from local .env files for 1-touch deploy suggestion
function Get-EnvValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$DefaultValue = ""
    )
    if (Test-Path $Path) {
        $lines = Get-Content $Path
        foreach ($line in $lines) {
            $line = $line.Trim()
            if ($line.StartsWith("#") -or $line -notmatch "=") { continue }
            $parts = $line -split '=', 2
            $k = $parts[0].Trim()
            $v = $parts[1].Trim()
            if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
            elseif ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
            if ($k -eq $Key) { return $v }
        }
    }
    return $DefaultValue
}

function Show-Header {
    param([string]$Title)
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "                DEPLOYER - PROJECT ABSENTA (FULL STACK)                   " -ForegroundColor Yellow
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " -> $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

# ============================================================
# DPKG LOCK CLEARANCE & APT PROCESS KILLERS
# ============================================================
function Clear-DpkgLock {
    param([string]$KeyPath, [string]$TargetUser, [string]$TargetIP, [string]$SudoPass)
    Show-Log "Memeriksa status dpkg lock..." "Yellow"

    $checkScript = @"
set +e
echo "=== DPKG LOCK CHECK ==="
if [ -f /var/lib/dpkg/lock-frontend ]; then echo "Lock file: /var/lib/dpkg/lock-frontend"; fi
if [ -f /var/lib/dpkg/lock ]; then echo "Lock file: /var/lib/dpkg/lock"; fi
if [ -f /var/lib/apt/lists/lock ]; then echo "Lock file: /var/lib/apt/lists/lock"; fi
if [ -f /var/cache/apt/archives/lock ]; then echo "Lock file: /var/cache/apt/archives/lock"; fi

LOCK_PIDS=`$(ps aux | awk '/apt-get|dpkg|aptitude/ && !/awk/ {print `$2}' | tr '\n' ' ')
if [ -n "`$LOCK_PIDS" ]; then
    echo "Proses apt/dpkg yang aktif: `$LOCK_PIDS"
    echo "AKTIF"
else
    echo "TIDAK_AKTIF"
fi
"@

    $tempScript = "$env:TEMP\dpkg_check.sh"
    $checkScript | Out-File -FilePath $tempScript -Encoding utf8 -Force
    & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/dpkg_check.sh" 2>$null
    $checkResult = & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/dpkg_check.sh"
    Remove-Item $tempScript -Force -ErrorAction SilentlyContinue

    if ($checkResult -contains "AKTIF") {
        Show-Log "Dpkg lock aktif! Mencoba membersihkan..." "Yellow"
        $clearScript = @"
set -e
echo '$SudoPass' | sudo -S rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null || true
echo '$SudoPass' | sudo -S rm -rf /var/lib/dpkg/*.old 2>/dev/null || true
echo '$SudoPass' | sudo -S dpkg --configure -a 2>/dev/null || true
echo "DPKG lock berhasil dibersihkan."
"@
        $tempClearScript = "$env:TEMP\dpkg_clear.sh"
        $clearScript | Out-File -FilePath $tempClearScript -Encoding utf8 -Force
        & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempClearScript" "${TargetUser}@${TargetIP}:/tmp/dpkg_clear.sh" 2>$null
        $clearResult = & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/dpkg_clear.sh"
        Remove-Item $tempClearScript -Force -ErrorAction SilentlyContinue
        Show-Log "Hasil: $clearResult" "Gray"
        return $LASTEXITCODE -eq 0
    }
    Show-Log "Dpkg lock tidak aktif, melanjutkan..." "Green"
    return $true
}

function Kill-AptProcesses {
    param([string]$KeyPath, [string]$TargetUser, [string]$TargetIP, [string]$SudoPass)
    Show-Log "Memeriksa proses apt/dpkg yang stuck..." "Yellow"

    $killScript = @"
set -e
echo "=== KILL APT STUCK PROCESSES ==="
STUCK_PIDS=`$(ps aux | grep -E 'apt-get|dpkg|aptitude' | grep -v grep | awk '{print `$2}')
if [ -n "`$STUCK_PIDS" ]; then
    echo "Membunuh proses stuck: `$STUCK_PIDS"
    echo '$SudoPass' | sudo -S kill -9 `$STUCK_PIDS 2>/dev/null || true
    sleep 2
else
    echo "Tidak ada proses apt/dpkg yang stuck."
fi

REMAINING=`$(ps aux | grep -E 'apt-get|dpkg' | grep -v grep | wc -l)
if [ "`$REMAINING" -eq 0 ]; then
    echo "VERIFIED_CLEAN"
else
    echo "MASIH_TERSISA: `$REMAINING"
fi
"@

    $tempScript = "$env:TEMP\kill_apt.sh"
    $killScript | Out-File -FilePath $tempScript -Encoding utf8 -Force
    & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/kill_apt.sh" 2>$null
    $killResult = & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/kill_apt.sh"
    Remove-Item $tempScript -Force -ErrorAction SilentlyContinue

    if ($killResult -match "VERIFIED_CLEAN") {
        Show-Log "Semua proses apt stuck berhasil dibersihkan!" "Green"
        return $true
    }
    return $false
}

function Invoke-AutoFixAptLocks {
    param([string]$KeyPath, [string]$TargetUser, [string]$TargetIP, [string]$SudoPass)
    for ($i = 1; $i -le 3; $i++) {
        Show-Log "Upaya $i - Membersihkan apt locks..." "Yellow"
        $killed = Kill-AptProcesses -KeyPath $KeyPath -TargetUser $TargetUser -TargetIP $TargetIP -SudoPass $SudoPass
        $cleared = Clear-DpkgLock -KeyPath $KeyPath -TargetUser $TargetUser -TargetIP $TargetIP -SudoPass $SudoPass
        if ($killed -and $cleared) { return $true }
        Start-Sleep -Seconds 3
    }
    return $false
}

# ============================================================
# FASE INPUT & KONFIGURASI KONEKSI
# ============================================================
if ($Silent) {
    $NEW_IP = $TargetIP
    $NEW_USER = $TargetUser
    $NEW_KEY_SOURCE = $KeyPath
    $SUDO_PASS = $SudoPass
    $preDeployChoice = "1"
    
    if ([string]::IsNullOrWhiteSpace($NEW_IP)) {
        Write-Host "IP VPS tidak boleh kosong!" -ForegroundColor Red
        exit
    }
    if (-not (Test-Path $NEW_KEY_SOURCE)) {
        Write-Host "Error: File SSH Key tidak ditemukan di '$NEW_KEY_SOURCE'" -ForegroundColor Red
        exit
    }
} else {
    Show-Header "Konfigurasi Koneksi VPS Target"
    $NEW_IP = (Read-Host "Masukkan IP VPS Target (Contoh: 10.10.10.163)").Trim()
    $inputUser = (Read-Host "Masukkan Username VPS [Default: asep]").Trim()
    $NEW_USER = if ([string]::IsNullOrWhiteSpace($inputUser)) { "asep" } else { $inputUser }

    if ([string]::IsNullOrWhiteSpace($NEW_IP)) {
        Write-Host "IP VPS tidak boleh kosong!" -ForegroundColor Red
        exit
    }

    Write-Host "Pilih SSH Key:"
    Write-Host " 1) nginxonly.pem"
    Write-Host " 2) ls-key.pem"
    Write-Host " 3) Input path file manual..."
    $newKeyChoice = Read-Host "Pilih [1-3] (Default: 1)"
    if ($newKeyChoice -eq "2") { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "ls-key.pem" }
    elseif ($newKeyChoice -eq "3") { $NEW_KEY_SOURCE = Read-Host "Masukkan path absolut file .pem" }
    else { $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "nginxonly.pem" }

    if (-not (Test-Path $NEW_KEY_SOURCE)) {
        Write-Host "Error: File SSH Key tidak ditemukan di '$NEW_KEY_SOURCE'" -ForegroundColor Red
        exit
    }

    $SUDO_PASS = (Read-Host "Masukkan password sudo VPS [g1g1G1NGSUL*!2]").Trim()
    if ([string]::IsNullOrWhiteSpace($SUDO_PASS)) { $SUDO_PASS = "g1g1G1NGSUL*!2" }

    # Bersihkan Locks (Opsional)
    Write-Host "`nOpsi Perbaikan Dpkg/Apt Locks:"
    Write-Host " 1) Lanjutkan ke Deploy (Default)"
    Write-Host " 2) Bersihkan locks terlebih dahulu"
    Write-Host " 3) Bersihkan + Lanjutkan Deploy"
    $preDeployChoice = Read-Host "Pilih [1-3]"
}

# Perbaiki permission SSH Key agar Windows OpenSSH tidak memblokirnya
$SAFE_NEW_KEY = "$env:TEMP\absenta-deploy-key.pem"
Remove-Item $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $NEW_KEY_SOURCE | Set-Content -Path $SAFE_NEW_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_NEW_KEY -AclObject $acl

if ($preDeployChoice -eq "2" -or $preDeployChoice -eq "3") {
    Show-Header "Membersihkan Dpkg/Apt Locks"
    $fixed = Invoke-AutoFixAptLocks -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP -SudoPass $SUDO_PASS
    if ($fixed) {
        Show-Log "Apt locks berhasil dibersihkan!" "Green"
    } else {
        Write-Host "Peringatan: Gagal membersihkan apt locks sepenuhnya. Melanjutkan dengan risiko..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
    if ($preDeployChoice -eq "2") {
        Stop-Transcript
        Read-Host "Selesai. Tekan [ENTER] untuk keluar..."
        exit
    }
}

# ============================================================
# FASE PARAMETER SPESIFIK PROJECT ABSENTA
# ============================================================
Show-Header "Parameter Project Absenta (Full Stack)"

$localEnvPath = Join-Path $PSScriptRoot "..\Project Absenta\absenta_backend\.env"
$defaultBPort = Get-EnvValue -Path $localEnvPath -Key "PORT" -DefaultValue "3003"
$defaultDbUrl = Get-EnvValue -Path $localEnvPath -Key "DATABASE_URL" -DefaultValue "postgresql://postgres:123123123@localhost:5432/absensi"
$defaultRedisUrl = Get-EnvValue -Path $localEnvPath -Key "REDIS_URL" -DefaultValue "redis://localhost:6379"
$defaultLicenseKey = Get-EnvValue -Path $localEnvPath -Key "LICENSE_KEY" -DefaultValue ""
$defaultLicenseServerUrl = Get-EnvValue -Path $localEnvPath -Key "LICENSE_SERVER_URL" -DefaultValue "https://api.absenta.id"
$defaultTunnelBaseDomain = Get-EnvValue -Path $localEnvPath -Key "EASY_TUNNEL_BASE_DOMAIN" -DefaultValue "absenta.id"
$defaultDomain = Get-EnvValue -Path $localEnvPath -Key "MAIN_DOMAIN" -DefaultValue "absenta.id"
$defaultNodeName = Get-EnvValue -Path $localEnvPath -Key "NODE_NAME" -DefaultValue "node-$($NEW_IP.Replace('.', '-'))"

if ($Silent) {
    $DEPLOY_SCENARIO = $DeployScenario
    $TARGET_DOMAIN = $TargetDomain
    $B_PORT = $BackendPort
    $F_PORT = $FrontendPort
    $SSL_SCENARIO = $sslScenario
    $CF_TOKEN = $cfToken
    $DB_URL = $DbUrl
    $INSTALL_POSTGRES = if ($InstallPostgres) { $InstallPostgres } else { if ($DbUrl.Contains("localhost") -or $DbUrl.Contains("127.0.0.1")) { "Y" } else { "N" } }
    $INSTALL_REDIS = $RedisMode
    $REDIS_URL = $RedisUrl
    $INSTALL_MINIO = if ($InstallMinio) { $InstallMinio } else { "Y" }
    $INSTALL_COTURN = if ($InstallCoturn) { $InstallCoturn } else { "Y" }
    $TUNNEL_BASE_DOMAIN = $TunnelBaseDomain
    $LICENSE_SERVER_URL = $LicenseServerUrl
    $LICENSE_KEY = $LicenseKey
} else {
    Write-Host "Pilih Skenario Deployment:"
    Write-Host " 1) SaaS / Cloud (Akses via Domain Publik, contoh: https://app.absenta.id)"
    Write-Host " 2) Hybrid (Lokal Sekolah + Caddy Proxy, contoh: http://10.10.10.163)"
    $scenarioChoice = Read-Host "Pilih [1-2] (Default: 1)"

    $DEPLOY_SCENARIO = "saas"
    if ($scenarioChoice -eq "2") {
        $DEPLOY_SCENARIO = "hybrid"
    }

    if ($DEPLOY_SCENARIO -eq "saas") {
        $TARGET_DOMAIN = (Read-Host "Masukkan Domain Utama Platform SaaS [$defaultDomain]").Trim()
        if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) { $TARGET_DOMAIN = $defaultDomain }
    } else {
        $suggestedDomain = if (-not [string]::IsNullOrWhiteSpace($defaultDomain) -and $defaultDomain -ne "localhost") { $defaultDomain } else { $NEW_IP }
        $TARGET_DOMAIN = (Read-Host "Masukkan Domain / IP Akses Hybrid [$suggestedDomain]").Trim()
        if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) { $TARGET_DOMAIN = $suggestedDomain }
    }

    $B_PORT = (Read-Host "Masukkan Port Backend [$defaultBPort]").Trim()
    if ([string]::IsNullOrWhiteSpace($B_PORT)) { $B_PORT = $defaultBPort }

    $F_PORT = (Read-Host "Masukkan Port Frontend [5175]").Trim()
    if ([string]::IsNullOrWhiteSpace($F_PORT)) { $F_PORT = "5175" }
    $SSL_SCENARIO = "1"
    $CF_TOKEN = ""
    if ($DEPLOY_SCENARIO -eq "saas" -or $DEPLOY_SCENARIO -eq "hybrid") {
        Write-Host "`nPilih Skenario SSL Caddy lokal:" -ForegroundColor White
        Write-Host " 1) SSL Internal / Self-Signed (Caddy local CA, default)" -ForegroundColor White
        Write-Host " 2) Sinkronisasi Sertifikat dari Server Lisensi (Otomatis via VPN)" -ForegroundColor White
        Write-Host " 3) Cloudflare DNS-01 Challenge (Manual)" -ForegroundColor White
        $sslChoice = Read-Host "Pilih [1-3] (Default: 1)"
        if ($sslChoice -eq "2") {
            $SSL_SCENARIO = "sync"
        } elseif ($sslChoice -eq "3") {
            $SSL_SCENARIO = "cloudflare"
            $CF_TOKEN = (Read-Host "Masukkan Cloudflare API Token (untuk SSL DNS Challenge)").Trim()
        } else {
            $SSL_SCENARIO = "internal"
        }
    }

    Write-Host "`nPilih Skenario Database PostgreSQL:" -ForegroundColor White
    Write-Host " 1) Database Eksternal (Gunakan database terpisah / cloud / VM lain)" -ForegroundColor White
    Write-Host " 2) Database Internal (Instal secara lokal di VPS ini)" -ForegroundColor White
    $dbChoice = Read-Host "Pilih [1-2] (Default: 1)"

    $INSTALL_POSTGRES = "N"
    if ($dbChoice -eq "2") {
        $INSTALL_POSTGRES = "Y"
        $suggestedDbUrl = "postgresql://postgres:123123123@localhost:5432/absensi"
    } else {
        $suggestedDbUrl = $defaultDbUrl
    }
    $DB_URL = (Read-Host "Masukkan DATABASE_URL PostgreSQL [$suggestedDbUrl]").Trim()
    if ([string]::IsNullOrWhiteSpace($DB_URL)) { $DB_URL = $suggestedDbUrl }
    $INSTALL_REDIS = (Read-Host "Apakah Anda ingin memasang Redis Server secara otomatis? [y/N]").Trim()
    if ([string]::IsNullOrWhiteSpace($INSTALL_REDIS)) { $INSTALL_REDIS = "N" }

    $REDIS_URL = "redis://localhost:6379"
    if ($INSTALL_REDIS -eq "n" -or $INSTALL_REDIS -eq "N") {
        $REDIS_URL = (Read-Host "Masukkan REDIS_URL [$defaultRedisUrl]").Trim()
        if ([string]::IsNullOrWhiteSpace($REDIS_URL)) { $REDIS_URL = $defaultRedisUrl }
    }

    $INSTALL_MINIO = (Read-Host "Apakah Anda ingin memasang/memastikan MinIO S3 Storage aktif? [Y/n]").Trim()
    if ([string]::IsNullOrWhiteSpace($INSTALL_MINIO)) { $INSTALL_MINIO = "Y" }

    $INSTALL_COTURN = (Read-Host "Apakah Anda ingin memasang/memastikan Coturn STUN/TURN Relay aktif? [Y/n]").Trim()
    if ([string]::IsNullOrWhiteSpace($INSTALL_COTURN)) { $INSTALL_COTURN = "Y" }

    $TUNNEL_BASE_DOMAIN = (Read-Host "Masukkan Base Domain Easy Tunnel [$defaultTunnelBaseDomain]").Trim()
    if ([string]::IsNullOrWhiteSpace($TUNNEL_BASE_DOMAIN)) { $TUNNEL_BASE_DOMAIN = $defaultTunnelBaseDomain }

    $LICENSE_SERVER_URL = (Read-Host "Masukkan URL Server Lisensi [$defaultLicenseServerUrl]").Trim()
    if ([string]::IsNullOrWhiteSpace($LICENSE_SERVER_URL)) { $LICENSE_SERVER_URL = $defaultLicenseServerUrl }

    $LICENSE_KEY = ""
    $inputLic = (Read-Host "Masukkan Kunci Lisensi Absenta (Ketik 'new' jika ingin registrasi baru) [$defaultLicenseKey]").Trim()
    if ($inputLic -eq 'new' -or $inputLic -eq 'NEW') {
        $inputLic = ""
        $defaultLicenseKey = ""
    }
    if (-not [string]::IsNullOrWhiteSpace($inputLic)) {
        $LICENSE_KEY = $inputLic
    } else {
        if ($defaultLicenseKey) {
            $LICENSE_KEY = $defaultLicenseKey
        } else {
            $requestNew = Read-Host "Belum punya lisensi? Ingin registrasi sekarang? [y/N]"
        if ($requestNew -eq 'y' -or $requestNew -eq 'Y') {
            $schoolName = ""
            while ([string]::IsNullOrWhiteSpace($schoolName)) {
                $schoolName = (Read-Host "Masukkan Nama Sekolah / Instansi").Trim()
                if ([string]::IsNullOrWhiteSpace($schoolName)) {
                    Write-Host "Nama sekolah wajib diisi!" -ForegroundColor Red
                }
            }

            $whatsappNo = ""
            while ([string]::IsNullOrWhiteSpace($whatsappNo)) {
                $whatsappNo = (Read-Host "Masukkan Nomor WhatsApp Anda (untuk menerima Kunci Lisensi via WA)").Trim()
                if ([string]::IsNullOrWhiteSpace($whatsappNo)) {
                    Write-Host "Nomor WhatsApp wajib diisi!" -ForegroundColor Red
                }
            }

            $regSuccess = $false
            while (-not $regSuccess) {
                $slugInput = (Read-Host "Masukkan Subdomain/Slug yang diinginkan (contoh 'smp4' untuk smp4.absenta.id, atau ketik 'exit' untuk batal)").Trim().ToLower()
                if ([string]::IsNullOrWhiteSpace($slugInput)) {
                    Write-Host "Subdomain wajib diisi!" -ForegroundColor Red
                    continue
                }
                if ($slugInput -eq 'exit') {
                    Write-Host "Registrasi dibatalkan." -ForegroundColor Yellow
                    break
                }

                # Clean human error: strip base domain suffix if input (e.g. demo.absenta.id -> demo)
                $tunnelBaseDomainToCheck = if ($TUNNEL_BASE_DOMAIN) { $TUNNEL_BASE_DOMAIN } else { $defaultTunnelBaseDomain }
                $baseDomainCheck = "." + $tunnelBaseDomainToCheck.ToLower().Trim()
                if ($slugInput.EndsWith($baseDomainCheck)) {
                    $slugInput = $slugInput.Substring(0, $slugInput.Length - $baseDomainCheck.Length)
                }

                $licenseServerCheck = if ($LICENSE_SERVER_URL) { $LICENSE_SERVER_URL } else { $defaultLicenseServerUrl }
                Write-Host "Menghubungi server lisensi untuk mendaftarkan subdomain '$slugInput.absenta.id'..." -ForegroundColor Cyan
                try {
                    $regBody = @{
                        school_name = $schoolName
                        wa_number = $whatsappNo
                        requested_slug = $slugInput
                    }
                    $response = Invoke-RestMethod -Uri "$licenseServerCheck/api/license/request-local-free" -Method Post -Body ($regBody | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 15
                    
                    if ($response.success) {
                        $LICENSE_KEY = $response.license_key
                        Write-Host "Registrasi Berhasil!" -ForegroundColor Green
                        Write-Host "Lisensi Anda: $LICENSE_KEY" -ForegroundColor Green
                        Write-Host "[INFO] Kunci Lisensi dan rincian domain telah dikirimkan ke WhatsApp Anda ($whatsappNo). Silakan cek pesan masuk Anda." -ForegroundColor Green
                        $regSuccess = $true
                        
                        # Set default domain and scenario for next steps
                        $DEPLOY_SCENARIO = "hybrid"
                        $TARGET_DOMAIN = "$slugInput.$TUNNEL_BASE_DOMAIN"
                    } else {
                        Write-Host "[ERROR] $($response.message)" -ForegroundColor Red
                    }
                } catch {
                    $errMsg = $_.Exception.Message
                    if ($_.Exception.Response) {
                        try {
                            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                            $respText = $reader.ReadToEnd()
                            $errBody = ConvertFrom-Json $respText
                            if ($errBody.message) { $errMsg = $errBody.message }
                        } catch {}
                    }
                    Write-Host "[ERROR] Gagal melakukan registrasi: $errMsg" -ForegroundColor Red
                    Write-Host "Silakan masukkan subdomain alternatif." -ForegroundColor Yellow
                }
            }
        }
    }
}
}

if ($Silent) {
    if ([string]::IsNullOrWhiteSpace($NodeName)) {
        $NODE_NAME = $defaultNodeName
    } else {
        $NODE_NAME = $NodeName
    }
    $DEFAULT_TIMEZONE = if ($DefaultTimezone) { $DefaultTimezone } else { "Asia/Jakarta" }
} else {
    $NODE_NAME = (Read-Host "Masukkan Identitas Node (NODE_NAME) [$defaultNodeName]").Trim()
    if ([string]::IsNullOrWhiteSpace($NODE_NAME)) { $NODE_NAME = $defaultNodeName }

    Write-Host "`n[Konfigurasi Zona Waktu Platform]" -ForegroundColor Cyan
    Write-Host "Fungsi : Menentukan basis waktu operasional platform & job global (backup DB, billing, dsb)." -ForegroundColor DarkGray
    Write-Host "Catatan: Presensi KBM sekolah tetap otomatis mengikuti zona waktu lokal masing-masing sekolah." -ForegroundColor DarkGray
    Write-Host "Pilih Zona Waktu Operasional Platform (DEFAULT_TIMEZONE):" -ForegroundColor White
    Write-Host " 1) Asia/Jakarta (WIB - Indonesia Barat, UTC+7) [Default]" -ForegroundColor Gray
    Write-Host " 2) Asia/Makassar (WITA - Indonesia Tengah, UTC+8)" -ForegroundColor Gray
    Write-Host " 3) Asia/Jayapura (WIT - Indonesia Timur, UTC+9)" -ForegroundColor Gray
    Write-Host " 4) Asia/Singapore (Singapura / Malaysia, UTC+8)" -ForegroundColor Gray
    Write-Host " 5) Input manual zona waktu IANA (contoh: Australia/Sydney, Europe/London)..." -ForegroundColor Gray
    $tzChoice = Read-Host "Pilih [1-5] (Default: 1)"
    $DEFAULT_TIMEZONE = "Asia/Jakarta"
    if ($tzChoice -eq "2") { $DEFAULT_TIMEZONE = "Asia/Makassar" }
    elseif ($tzChoice -eq "3") { $DEFAULT_TIMEZONE = "Asia/Jayapura" }
    elseif ($tzChoice -eq "4") { $DEFAULT_TIMEZONE = "Asia/Singapore" }
    elseif ($tzChoice -eq "5") {
        $customTz = (Read-Host "Masukkan Zona Waktu IANA [Asia/Jakarta]").Trim()
        if (-not [string]::IsNullOrWhiteSpace($customTz)) { $DEFAULT_TIMEZONE = $customTz }
    }
}

# ─── VALIDASI DOMAIN & LISENSI ONLINE (Hybrid Only) ───
if ($DEPLOY_SCENARIO -eq "hybrid") {
    Write-Host "Menghubungi server lisensi untuk memvalidasi domain dan lisensi..." -ForegroundColor Cyan
    $shouldExit = $false
    $errMessage = ""
    try {
        if ([string]::IsNullOrWhiteSpace($LICENSE_KEY)) {
            $errMessage = "Lisensi wajib diisi untuk skenario Hybrid!"
            $shouldExit = $true
        } else {
            $validateUrl = "$LICENSE_SERVER_URL/api/license/check/$LICENSE_KEY"
            try {
                $valRes = Invoke-RestMethod -Uri $validateUrl -Method Get -TimeoutSec 10
                
                $isActive = $valRes.data.is_active
                if ($isActive -eq $null) { $isActive = $valRes.data.isActive }
                $status = $valRes.data.status

                if ($valRes.success -ne $true -or $isActive -ne 1 -or $status -ne 'active') {
                    $errMessage = "Kunci lisensi tidak valid atau tidak aktif!"
                    $shouldExit = $true
                } else {
                    $expectedSlug = $valRes.data.requested_slug
                    if ($expectedSlug -eq $null) { $expectedSlug = $valRes.data.requestedSlug }
                    
                    $TARGET_DOMAIN = "$expectedSlug.$TUNNEL_BASE_DOMAIN"
                    Write-Host "Validasi berhasil! Lisensi aktif untuk domain '$TARGET_DOMAIN'." -ForegroundColor Green
                }
            } catch {
                if ($_.Exception.Response) {
                    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                    $respText = $reader.ReadToEnd()
                    try {
                        $errJson = ConvertFrom-Json $respText
                        if ($errJson.message) {
                            $errMessage = "Validasi Gagal: $($errJson.message)"
                            $shouldExit = $true
                        }
                    } catch {}
                }
                if (-not $shouldExit) {
                    Write-Host "[WARNING] Gagal memvalidasi secara online (Koneksi bermasalah): $($_.Exception.Message)" -ForegroundColor Yellow
                    if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) {
                        while ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) {
                            $TARGET_DOMAIN = (Read-Host "Masukkan Domain Publik Akses Sekolah (karena offline, contoh 'demo.absenta.id')").Trim().ToLower()
                        }
                    }
                    Write-Host "Melanjutkan instalasi dengan asumsi konfigurasi benar..." -ForegroundColor Yellow
                }
            }
        }
    } catch {
        Write-Host "[WARNING] Terjadi kesalahan saat mencoba memvalidasi: $($_.Exception.Message)" -ForegroundColor Yellow
        if ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) {
            while ([string]::IsNullOrWhiteSpace($TARGET_DOMAIN)) {
                $TARGET_DOMAIN = (Read-Host "Masukkan Domain Publik Akses Sekolah (karena offline, contoh 'demo.absenta.id')").Trim().ToLower()
            }
        }
        Write-Host "Melanjutkan instalasi dengan asumsi konfigurasi benar..." -ForegroundColor Yellow
    }

    if ($shouldExit) {
        Write-Host "[ERROR] $errMessage" -ForegroundColor Red
        if (-not $Silent) {
            Read-Host "Tekan [ENTER] untuk keluar..."
        }
        Exit 1
    }
}

$SCHEME = "https"
if ($TARGET_DOMAIN -match "^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$") {
    $SCHEME = "http"
}
$BACKEND_API_URL = "${SCHEME}://${TARGET_DOMAIN}/api"
$BACKEND_APP_URL = "${SCHEME}://${TARGET_DOMAIN}"
$BACKEND_FRONTEND_URL = "${SCHEME}://${TARGET_DOMAIN}"
$FRONTEND_API_BASE_URL = "/api"

$REPO_URL = "https://github.com/sharemovie1993/Project-Absenta.git"
$TARGET_SUBDIR = "project-absenta"

function Run-RemoteScript {
    param([string]$ScriptContent, [string]$KeyPath, [string]$TargetUser, [string]$TargetIP)
    $tempScript = "$env:TEMP\remote_script.sh"
    $ScriptContent = $ScriptContent -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($tempScript, $ScriptContent)
    & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/remote_script.sh"
    if ($LASTEXITCODE -ne 0) { throw "Gagal menyalin script ke VPS menggunakan SCP." }
    & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/remote_script.sh"
    if ($LASTEXITCODE -ne 0) { throw "Eksekusi script remote gagal dengan Exit Code $LASTEXITCODE" }
}

# ============================================================
# FASE 1: PROVISIONING & INSTALASI INSTANS
# ============================================================
Show-Header "FASE 1: PROVISIONING VPS TARGET"
Show-Log "Menginstal dependensi sistem di VPS ($NEW_IP)..." "Yellow"

$DB_NAME = "absensi"
$DB_USER = "postgres"
$DB_PASS = "123123123"
try {
    $cleanDbUrl = $DB_URL
    if ($cleanDbUrl.StartsWith("[")) { $cleanDbUrl = $cleanDbUrl.Substring(1) }
    if ($cleanDbUrl.EndsWith("]")) { $cleanDbUrl = $cleanDbUrl.Substring(0, $cleanDbUrl.Length - 1) }
    $uri = [System.Uri]$cleanDbUrl
    $parsedDbName = $uri.AbsolutePath.TrimStart('/')
    if ($parsedDbName -match "^([^?#/]+)") {
        $parsedDbName = $Matches[1]
    }
    if ($parsedDbName) {
        $DB_NAME = $parsedDbName
    }
    if ($uri.UserInfo) {
        $uParts = $uri.UserInfo -split ':', 2
        if ($uParts.Length -ge 1 -and -not [string]::IsNullOrWhiteSpace($uParts[0])) { $DB_USER = $uParts[0] }
        if ($uParts.Length -ge 2 -and -not [string]::IsNullOrWhiteSpace($uParts[1])) { $DB_PASS = $uParts[1] }
    }
} catch {}

$provisionScript = @"
set -e
# Cepat clear locks
echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock 2>/dev/null || true
echo '$SUDO_PASS' | sudo -S dpkg --configure -a 2>/dev/null || true

echo '$SUDO_PASS' | sudo -S apt-get update -y || {
    echo "APT UPDATE GAGAL - Melakukan force clear..."
    echo '$SUDO_PASS' | sudo -S kill -9 `$(ps aux | grep -E 'apt|dpkg' | grep -v grep | awk '{print `$2}') 2>/dev/null || true
    sleep 1
    echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock-* /var/lib/apt/lists/lock 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S dpkg --configure -a
    echo '$SUDO_PASS' | sudo -S apt-get update -y
}
echo '$SUDO_PASS' | sudo -S apt-get install -y curl git tar ufw build-essential wireguard openresolv python3

# Install Node 20
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh
    echo '$SUDO_PASS' | sudo -S -E bash /tmp/nodesource_setup.sh
    rm -f /tmp/nodesource_setup.sh
    echo '$SUDO_PASS' | sudo -S apt-get install -y nodejs
fi

# Install PM2
if ! command -v pm2 &>/dev/null; then
    echo '$SUDO_PASS' | sudo -S npm install -g pm2
fi

# Install Caddy
if [ -f /tmp/caddy_offline ]; then
    echo '$SUDO_PASS' | sudo -S apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' -o /tmp/caddy-gpg.key
    echo '$SUDO_PASS' | sudo -S gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/caddy-gpg.key 2>/dev/null || true
    rm -f /tmp/caddy-gpg.key
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /tmp/caddy-stable.list
    echo '$SUDO_PASS' | sudo -S cp /tmp/caddy-stable.list /etc/apt/sources.list.d/caddy-stable.list
    rm -f /tmp/caddy-stable.list
    echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S apt-get update -y
    echo '$SUDO_PASS' | sudo -S apt-get install -y caddy
    echo '$SUDO_PASS' | sudo -S systemctl stop caddy || true
    echo '$SUDO_PASS' | sudo -S cp /tmp/caddy_offline /usr/bin/caddy
    echo '$SUDO_PASS' | sudo -S chmod +x /usr/bin/caddy
else
    if ! command -v caddy &>/dev/null; then
        echo '$SUDO_PASS' | sudo -S apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' -o /tmp/caddy-gpg.key
        echo '$SUDO_PASS' | sudo -S gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/caddy-gpg.key 2>/dev/null || true
        rm -f /tmp/caddy-gpg.key
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /tmp/caddy-stable.list
        echo '$SUDO_PASS' | sudo -S cp /tmp/caddy-stable.list /etc/apt/sources.list.d/caddy-stable.list
        rm -f /tmp/caddy-stable.list
        echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S apt-get update -y
        echo '$SUDO_PASS' | sudo -S apt-get install -y caddy
    fi
fi

if [ ! -f /etc/caddy/Caddyfile ]; then
    echo '$SUDO_PASS' | sudo -S touch /etc/caddy/Caddyfile
fi
echo '$SUDO_PASS' | sudo -S chmod 666 /etc/caddy/Caddyfile

# Opsi Instalasi PostgreSQL
if [[ "$INSTALL_POSTGRES" =~ ^[yY]$ ]]; then
    echo "Menginstal PostgreSQL..."
    echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S apt-get install -y postgresql postgresql-contrib
    echo '$SUDO_PASS' | sudo -S systemctl enable postgresql 2>/dev/null
    echo '$SUDO_PASS' | sudo -S systemctl start postgresql
    cd / && echo '$SUDO_PASS' | sudo -u postgres psql -c "ALTER USER $DB_USER PASSWORD '$DB_PASS';" || true
    if ! echo '$SUDO_PASS' | sudo -u postgres psql -t -A -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
        echo '$SUDO_PASS' | sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"
    fi

    # Terapkan tuning PostgreSQL jika file konfigurasi Absenta tersedia
    if [ -f /etc/absenta/config/postgresql.conf ]; then
        for conf_dir in /etc/postgresql/*/main/conf.d; do
            if [ -d "`$conf_dir" ]; then
                echo '$SUDO_PASS' | sudo -S cp /etc/absenta/config/postgresql.conf "`$conf_dir/99-absenta-tuning.conf"
                echo '$SUDO_PASS' | sudo -S chown -R postgres:postgres "`$conf_dir/99-absenta-tuning.conf"
                echo '$SUDO_PASS' | sudo -S chmod 644 "`$conf_dir/99-absenta-tuning.conf"
                echo '$SUDO_PASS' | sudo -S systemctl restart postgresql
                echo "✓ Konfigurasi Tuning PostgreSQL berhasil di-link ke `$conf_dir/99-absenta-tuning.conf \u0026 PostgreSQL di-restart!"
            fi
        done
    fi
fi

# Opsi Instalasi Redis
if [[ "$INSTALL_REDIS" =~ ^[yY]$ ]]; then
    echo "Menginstal Redis Server..."
    echo '$SUDO_PASS' | sudo -S rm -f /var/lib/dpkg/lock* 2>/dev/null || true
    echo '$SUDO_PASS' | sudo -S apt-get install -y redis-server
    echo '$SUDO_PASS' | sudo -S systemctl enable redis-server 2>/dev/null
    echo '$SUDO_PASS' | sudo -S systemctl start redis-server

    # Terapkan tuning Redis jika file konfigurasi Absenta tersedia
    if [ -f /etc/absenta/config/redis.conf ] && [ -f /etc/redis/redis.conf ]; then
        if ! grep -q "include /etc/absenta/config/redis.conf" /etc/redis/redis.conf; then
            echo "" | echo '$SUDO_PASS' | sudo -S tee -a /etc/redis/redis.conf > /dev/null
            echo "# Project Absenta Production Redis Tuning" | echo '$SUDO_PASS' | sudo -S tee -a /etc/redis/redis.conf > /dev/null
            echo "include /etc/absenta/config/redis.conf" | echo '$SUDO_PASS' | sudo -S tee -a /etc/redis/redis.conf > /dev/null
            echo '$SUDO_PASS' | sudo -S systemctl restart redis-server 2>/dev/null || echo '$SUDO_PASS' | sudo -S systemctl restart redis 2>/dev/null || true
            echo "✓ Konfigurasi Tuning Redis berhasil di-include ke /etc/redis/redis.conf \u0026 Redis di-restart!"
        fi
    fi
fi

# ============================================================
# Opsi Pemasangan MinIO Self-Hosted S3 Storage Server
# ============================================================
if [[ "$INSTALL_MINIO" =~ ^[yY]$ ]]; then
    echo "Memeriksa status MinIO S3 Storage Server..."
    if [ ! -f /usr/local/bin/minio ] || [ `$(`wc -c < /usr/local/bin/minio 2>/dev/null || echo 0) -lt 1000000 ]; then
        echo "MinIO belum terpasang atau binary tidak valid. Menjalankan pemasangan MinIO..."
        if [ -f /tmp/setup-minio.sh ]; then
            chmod +x /tmp/setup-minio.sh
            echo '$SUDO_PASS' | sudo -S bash /tmp/setup-minio.sh || true
        fi
    elif ! systemctl is-active --quiet minio 2>/dev/null; then
        echo "MinIO terpasang namun layanannya belum aktif. Mengaktifkan minio.service..."
        echo '$SUDO_PASS' | sudo -S systemctl daemon-reload 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S systemctl enable minio 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S systemctl restart minio 2>/dev/null || true
    else
        echo "✓ MinIO S3 Storage sudah terpasang dan aktif."
    fi
fi

# ============================================================
# Opsi Pemasangan Coturn STUN/TURN Relay Server
# ============================================================
if [[ "$INSTALL_COTURN" =~ ^[yY]$ ]]; then
    echo "Memeriksa status Coturn STUN/TURN Relay Server..."
    if ! command -v turnserver &>/dev/null && [ ! -f /usr/bin/turnserver ]; then
        echo "Coturn belum terpasang. Menjalankan pemasangan Coturn..."
        if [ -f /tmp/setup-coturn.sh ]; then
            chmod +x /tmp/setup-coturn.sh
            echo '$SUDO_PASS' | sudo -S bash /tmp/setup-coturn.sh || true
        fi
    elif ! systemctl is-active --quiet coturn 2>/dev/null; then
        echo "Coturn terpasang namun layanannya belum aktif. Mengaktifkan coturn.service..."
        echo '$SUDO_PASS' | sudo -S systemctl unmask coturn 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S systemctl daemon-reload 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S systemctl enable coturn 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S systemctl restart coturn 2>/dev/null || true
    else
        echo "✓ Coturn STUN/TURN Relay Server sudah terpasang dan aktif."
    fi
fi

# Konfigurasi Sysctl Forwarding & Sudo Passwordless untuk WireGuard
echo '$SUDO_PASS' | sudo -S sysctl -w net.ipv4.ip_forward=1
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
    echo "net.ipv4.ip_forward=1" > /tmp/sysctl_ipf.conf
    echo '$SUDO_PASS' | sudo -S sh -c "cat /tmp/sysctl_ipf.conf >> /etc/sysctl.conf"
    rm -f /tmp/sysctl_ipf.conf
fi
echo "$NEW_USER ALL=(ALL) NOPASSWD: /usr/bin/wg-quick, /usr/bin/wg, /usr/sbin/wg-quick, /usr/sbin/wg" > /tmp/90-wireguard
echo '$SUDO_PASS' | sudo -S cp /tmp/90-wireguard /etc/sudoers.d/90-wireguard
echo '$SUDO_PASS' | sudo -S chown root:root /etc/sudoers.d/90-wireguard
echo '$SUDO_PASS' | sudo -S chmod 440 /etc/sudoers.d/90-wireguard
rm -f /tmp/90-wireguard

echo '$SUDO_PASS' | sudo -S mkdir -p /var/www/$TARGET_SUBDIR
echo '$SUDO_PASS' | sudo -S chown ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR
echo 'Provisioning dasar selesai.'
"@

$LOCAL_CADDY = Join-Path $PSScriptRoot "caddy-bin\caddy"
if (Test-Path $LOCAL_CADDY) {
    Show-Log "Menyalin Caddy offline lokal ke VPS..." "Yellow"
    & scp -i "$SAFE_NEW_KEY" -o StrictHostKeyChecking=no "$LOCAL_CADDY" "${NEW_USER}@${NEW_IP}:/tmp/caddy_offline"
}

$LOCAL_MINIO = Join-Path $PSScriptRoot "setup-minio.sh"
if (Test-Path $LOCAL_MINIO) {
    Show-Log "Menyalin script setup MinIO S3 ke VPS..." "Yellow"
    & scp -i "$SAFE_NEW_KEY" -o StrictHostKeyChecking=no "$LOCAL_MINIO" "${NEW_USER}@${NEW_IP}:/tmp/setup-minio.sh"
}

$LOCAL_MINIO_BIN = Join-Path $PSScriptRoot "minio-bin\minio"
if (Test-Path $LOCAL_MINIO_BIN) {
    Show-Log "Menyalin binary offline MinIO ke VPS..." "Yellow"
    & scp -i "$SAFE_NEW_KEY" -o StrictHostKeyChecking=no "$LOCAL_MINIO_BIN" "${NEW_USER}@${NEW_IP}:/tmp/minio_offline"
}

$LOCAL_MC_BIN = Join-Path $PSScriptRoot "minio-bin\mc"
if (Test-Path $LOCAL_MC_BIN) {
    Show-Log "Menyalin binary offline MinIO Client (mc) ke VPS..." "Yellow"
    & scp -i "$SAFE_NEW_KEY" -o StrictHostKeyChecking=no "$LOCAL_MC_BIN" "${NEW_USER}@${NEW_IP}:/tmp/mc_offline"
}

$LOCAL_COTURN = Join-Path $PSScriptRoot "setup-coturn.sh"
if (Test-Path $LOCAL_COTURN) {
    Show-Log "Menyalin script setup Coturn STUN/TURN ke VPS..." "Yellow"
    & scp -i "$SAFE_NEW_KEY" -o StrictHostKeyChecking=no "$LOCAL_COTURN" "${NEW_USER}@${NEW_IP}:/tmp/setup-coturn.sh"
}

Run-RemoteScript -ScriptContent $provisionScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP
Show-Log "Provisioning VPS selesai." "Green"

# ============================================================
# FASE 2: CLONE, ENV SETUP, NPM INSTALL, BUILD & START
# ============================================================
Show-Header "FASE 2: SETUP PROJECT ABSENTA & CLONE"
Show-Log "Mengambil kode terbaru dan mengompilasi Project Absenta..." "Yellow"

$setupScript = @"
set -e
mkdir -p /var/www/$TARGET_SUBDIR
exec > >(tee -a /tmp/deploy_absenta.log) 2>&1
echo "=== MEMULAI REMOTE DEPLOYMENT ABSENTA - `$(date) ==="

# Hentikan PM2 dan Caddy terlebih dahulu agar proses redeployment bersih dan lancar
echo "Menghentikan PM2 daemon dan layanan web server Caddy..."
pm2 kill || true
echo '$SUDO_PASS' | sudo -S systemctl stop caddy || true

# Kloning/Update Repo
if [ ! -d "/var/www/$TARGET_SUBDIR/.git" ]; then
    echo '$SUDO_PASS' | sudo -S rm -rf /var/www/$TARGET_SUBDIR || true
    echo '$SUDO_PASS' | sudo -S mkdir -p /var/www/$TARGET_SUBDIR
    echo '$SUDO_PASS' | sudo -S chown -R ${NEW_USER}:${NEW_USER} /var/www/$TARGET_SUBDIR
    git clone $REPO_URL /var/www/$TARGET_SUBDIR
else
    cd /var/www/$TARGET_SUBDIR
    git fetch origin
    git reset --hard origin/main || git reset --hard origin/master
fi

cd /var/www/$TARGET_SUBDIR

# Backend Setup
cp absenta_backend/.env.example absenta_backend/.env || true
sed -i "s|^PORT=.*|PORT=$B_PORT|g" absenta_backend/.env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|g" absenta_backend/.env
if grep -q "^NODE_NAME=" absenta_backend/.env; then
    sed -i "s|^NODE_NAME=.*|NODE_NAME=$NODE_NAME|g" absenta_backend/.env
else
    echo "NODE_NAME=$NODE_NAME" >> absenta_backend/.env
fi
sed -i "s|^REDIS_MODE=.*|REDIS_MODE=single|g" absenta_backend/.env
sed -i "s|^REDIS_URL=.*|REDIS_URL=$REDIS_URL|g" absenta_backend/.env
sed -i "s|^LICENSE_SERVER_URL=.*|LICENSE_SERVER_URL=$LICENSE_SERVER_URL|g" absenta_backend/.env
sed -i "s|^LICENSE_KEY=.*|LICENSE_KEY=$LICENSE_KEY|g" absenta_backend/.env
sed -i "s|^EASY_TUNNEL_BASE_DOMAIN=.*|EASY_TUNNEL_BASE_DOMAIN=$TUNNEL_BASE_DOMAIN|g" absenta_backend/.env
sed -i "s|^API_URL=.*|API_URL=$BACKEND_API_URL|g" absenta_backend/.env
sed -i "s|^APP_URL=.*|APP_URL=$BACKEND_APP_URL|g" absenta_backend/.env
sed -i "s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=$BACKEND_APP_URL|g" absenta_backend/.env
sed -i "s|^PUBLIC_INVOICE_BASE_URL=.*|PUBLIC_INVOICE_BASE_URL=$BACKEND_APP_URL|g" absenta_backend/.env
sed -i "s|^PUBLIC_APP_SCHEME=.*|PUBLIC_APP_SCHEME=$SCHEME|g" absenta_backend/.env
sed -i "s|^PUBLIC_DOMAIN_BASE=.*|PUBLIC_DOMAIN_BASE=$TARGET_DOMAIN|g" absenta_backend/.env
sed -i "s|^MAIN_DOMAIN=.*|MAIN_DOMAIN=$TARGET_DOMAIN|g" absenta_backend/.env
sed -i "s|^TENANT_BASE_DOMAIN=.*|TENANT_BASE_DOMAIN=$TARGET_DOMAIN|g" absenta_backend/.env
sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=$BACKEND_FRONTEND_URL|g" absenta_backend/.env
if grep -q "^DEPLOY_SCENARIO=" absenta_backend/.env; then
    sed -i "s|^DEPLOY_SCENARIO=.*|DEPLOY_SCENARIO=$DEPLOY_SCENARIO|g" absenta_backend/.env
else
    echo "DEPLOY_SCENARIO=$DEPLOY_SCENARIO" >> absenta_backend/.env
fi
if grep -q "^DEFAULT_TIMEZONE=" absenta_backend/.env; then
    sed -i "s|^DEFAULT_TIMEZONE=.*|DEFAULT_TIMEZONE=$DEFAULT_TIMEZONE|g" absenta_backend/.env
else
    echo "DEFAULT_TIMEZONE=$DEFAULT_TIMEZONE" >> absenta_backend/.env
fi

# Pastikan JWT_SECRET terisi minimal 32 karakter (Production Hardened)
EXISTING_JWT=`$(grep "^JWT_SECRET=" absenta_backend/.env 2>/dev/null | cut -d'=' -f2- | tr -d ' ' || true)
if [ -z "`$EXISTING_JWT" ] || [ `$(echo -n "`$EXISTING_JWT" | wc -c) -lt 32 ] || [ "`$EXISTING_JWT" = "your-super-secret-jwt-key-here" ]; then
    SECURE_JWT=`$(openssl rand -hex 32)
    if grep -q "^JWT_SECRET=" absenta_backend/.env; then
        sed -i "s|^JWT_SECRET=.*|JWT_SECRET=`$SECURE_JWT|g" absenta_backend/.env
    else
        echo "JWT_SECRET=`$SECURE_JWT" >> absenta_backend/.env
    fi
fi

# MinIO S3 Storage Configuration
if command -v minio &>/dev/null || [ -f /usr/local/bin/minio ] || [ -f /etc/systemd/system/minio.service ]; then
    sed -i "s|^S3_ENDPOINT=.*|S3_ENDPOINT=http://127.0.0.1:9000|g" absenta_backend/.env 2>/dev/null || true
    sed -i "s|^S3_BUCKET=.*|S3_BUCKET=absenta-storage|g" absenta_backend/.env 2>/dev/null || true
    sed -i "s|^S3_ACCESS_KEY=.*|S3_ACCESS_KEY=minioadmin|g" absenta_backend/.env 2>/dev/null || true
    sed -i "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=minioadmin|g" absenta_backend/.env 2>/dev/null || true
    sed -i "s|^S3_FORCE_PATH_STYLE=.*|S3_FORCE_PATH_STYLE=true|g" absenta_backend/.env 2>/dev/null || true
    if ! grep -q "^S3_ENDPOINT=" absenta_backend/.env; then
        echo "" >> absenta_backend/.env
        echo "# MinIO S3 Storage" >> absenta_backend/.env
        echo "S3_ENDPOINT=http://127.0.0.1:9000" >> absenta_backend/.env
        echo "S3_BUCKET=absenta-storage" >> absenta_backend/.env
        echo "S3_ACCESS_KEY=minioadmin" >> absenta_backend/.env
        echo "S3_SECRET_KEY=minioadmin" >> absenta_backend/.env
        echo "S3_FORCE_PATH_STYLE=true" >> absenta_backend/.env
    fi
fi

# Coturn STUN/TURN Relay Configuration
if [ -f /etc/turnserver.conf ]; then
    COTURN_EXT_SEC=`$(grep "^static-auth-secret=" /etc/turnserver.conf 2>/dev/null | cut -d'=' -f2 | tr -d ' ' || true)
    if [ ! -z "`$COTURN_EXT_SEC" ]; then
        sed -i "s|^COTURN_ENABLED=.*|COTURN_ENABLED=true|g" absenta_backend/.env 2>/dev/null || true
        sed -i "s|^COTURN_PORT=.*|COTURN_PORT=3478|g" absenta_backend/.env 2>/dev/null || true
        sed -i "s|^COTURN_DOMAIN=.*|COTURN_DOMAIN=$TARGET_DOMAIN|g" absenta_backend/.env 2>/dev/null || true
        sed -i "s|^COTURN_SECRET=.*|COTURN_SECRET=`$COTURN_EXT_SEC|g" absenta_backend/.env 2>/dev/null || true
        if ! grep -q "^COTURN_ENABLED=" absenta_backend/.env; then
            echo "" >> absenta_backend/.env
            echo "# Coturn STUN/TURN Relay" >> absenta_backend/.env
            echo "COTURN_ENABLED=true" >> absenta_backend/.env
            echo "COTURN_PORT=3478" >> absenta_backend/.env
            echo "COTURN_DOMAIN=$TARGET_DOMAIN" >> absenta_backend/.env
            echo "COTURN_SECRET=`$COTURN_EXT_SEC" >> absenta_backend/.env
        fi
    fi
fi

# Frontend Setup
cp absenta_frontend/.env.example absenta_frontend/.env || true
sed -i "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=$FRONTEND_API_BASE_URL|g" absenta_frontend/.env
sed -i "s|^VITE_PROXY_TARGET=.*|VITE_PROXY_TARGET=http://localhost:$B_PORT|g" absenta_frontend/.env
sed -i "s|^PORT=.*|PORT=$F_PORT|g" absenta_frontend/.env
if grep -q "^VITE_MAIN_DOMAIN=" absenta_frontend/.env; then
    sed -i "s|^VITE_MAIN_DOMAIN=.*|VITE_MAIN_DOMAIN=$TARGET_DOMAIN|g" absenta_frontend/.env
else
    echo "VITE_MAIN_DOMAIN=$TARGET_DOMAIN" >> absenta_frontend/.env
fi
if grep -q "^VITE_DEPLOY_SCENARIO=" absenta_frontend/.env; then
    sed -i "s|^VITE_DEPLOY_SCENARIO=.*|VITE_DEPLOY_SCENARIO=$DEPLOY_SCENARIO|g" absenta_frontend/.env
else
    echo "VITE_DEPLOY_SCENARIO=$DEPLOY_SCENARIO" >> absenta_frontend/.env
fi

# Install & Build Backend
cd absenta_backend
node -e '
const fs = require("fs");
if (fs.existsSync("package.json")) {
    const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
    if (p.dependencies && p.dependencies["redis-memory-server"]) {
        delete p.dependencies["redis-memory-server"];
    }
    if (p.devDependencies && p.devDependencies["redis-memory-server"]) {
        delete p.devDependencies["redis-memory-server"];
    }
    if (!p.dependencies) p.dependencies = {};
    p.dependencies["zod"] = "^3.23.8";
    if (!p.overrides) p.overrides = {};
    p.overrides["zod"] = "^3.23.8";
    fs.writeFileSync("package.json", JSON.stringify(p, null, 2));
}
' || true

npm install --ignore-scripts
npm install zod@3.23.8 --save-exact --ignore-scripts || true
npx prisma generate
npm rebuild bcrypt 2>/dev/null || true
npx prisma db push --skip-generate || echo "Prisma DB push dilewati atau gagal."
npx prisma db seed || echo "Prisma DB seed dilewati atau gagal."
npm run build

# Install & Build Frontend
cd ../absenta_frontend
npm install
npm run build

# PM2 Start
cd ..
pm2 delete ecosystem.config.js || true
pm2 start ecosystem.config.js --update-env
echo '$SUDO_PASS' | sudo -S env PATH=`${PATH}:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || \
echo '$SUDO_PASS' | sudo -S env PATH=`${PATH}:/usr/local/bin pm2 startup systemd -u $NEW_USER --hp /home/$NEW_USER 2>/dev/null || true
pm2 save

# # Configure Caddyfile
if [ "$DEPLOY_SCENARIO" != "local" ]; then
    echo "=== MENGONFIGURASI CADDY WEB SERVER & REVERSE PROXY ==="
    echo '$SUDO_PASS' | sudo -S mkdir -p /etc/caddy /etc/caddy/ssl
    echo '$SUDO_PASS' | sudo -S chown -R ${NEW_USER}:${NEW_USER} /etc/caddy/ssl || true

    # 1. Sinkronisasi SSL jika skenario sync dipilih
    if [ "$SSL_SCENARIO" = "sync" ]; then
        echo "Mengunduh sertifikat SSL dari Server Lisensi ($LICENSE_SERVER_URL)..."
        cat << 'EOF_SYNC_SSL' > /tmp/sync-ssl.sh
#!/bin/bash
echo "=== SINKRONISASI SSL DARI SERVER LISENSI ==="
mkdir -p /etc/caddy/ssl
if curl -s -f "LICENSE_SERVER_URL_PLACEHOLDER/api/public/download-ssl?domain=TARGET_DOMAIN_PLACEHOLDER&license_key=LICENSE_KEY_PLACEHOLDER" -o /tmp/ssl_response.json && grep -q '"success":true' /tmp/ssl_response.json; then
    node -e "const data = require('/tmp/ssl_response.json'); const fs = require('fs'); fs.writeFileSync('/etc/caddy/ssl/cert.pem', data.cert); fs.writeFileSync('/etc/caddy/ssl/key.pem', data.key);"
    echo "Sertifikat SSL berhasil disinkronkan!"
    echo '$SUDO_PASS' | sudo -S systemctl reload caddy 2>/dev/null || echo '$SUDO_PASS' | sudo -S systemctl restart caddy 2>/dev/null || true
else
    echo "Gagal mengunduh sertifikat SSL dari Server Lisensi."
    cat /tmp/ssl_response.json 2>/dev/null || true
fi
rm -f /tmp/ssl_response.json
EOF_SYNC_SSL

        sed -i "s|TARGET_DOMAIN_PLACEHOLDER|$TARGET_DOMAIN|g" /tmp/sync-ssl.sh
        sed -i "s|LICENSE_KEY_PLACEHOLDER|$LICENSE_KEY|g" /tmp/sync-ssl.sh
        sed -i "s|LICENSE_SERVER_URL_PLACEHOLDER|$LICENSE_SERVER_URL|g" /tmp/sync-ssl.sh
        echo '$SUDO_PASS' | sudo -S cp /tmp/sync-ssl.sh /usr/local/bin/sync-ssl.sh
        echo '$SUDO_PASS' | sudo -S chmod +x /usr/local/bin/sync-ssl.sh
        
        # Jalankan sekali untuk mendapatkan sertifikat awal
        /usr/local/bin/sync-ssl.sh || true
        
        # Jadwalkan cron harian
        echo '#!/bin/bash' > /tmp/sync-ssl-cron
        echo '/usr/local/bin/sync-ssl.sh >/dev/null 2>&1' >> /tmp/sync-ssl-cron
        echo '$SUDO_PASS' | sudo -S cp /tmp/sync-ssl-cron /etc/cron.daily/sync-ssl
        echo '$SUDO_PASS' | sudo -S chmod +x /etc/cron.daily/sync-ssl
        rm -f /tmp/sync-ssl-cron
    fi

    # 2. Susun blok konfigurasi Caddy Absenta
    if [ -z "$TARGET_DOMAIN" ] || [[ "$TARGET_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        HOST_DEF=":80"
        if [ ! -z "$TARGET_DOMAIN" ]; then
            HOST_DEF="http://$TARGET_DOMAIN, http://:80"
        fi
        cat << EOF_CADDY > /tmp/caddy_absenta_block.conf
$HOST_DEF {
    reverse_proxy /api/* 127.0.0.1:$B_PORT
    reverse_proxy /socket.io/* 127.0.0.1:$B_PORT
    reverse_proxy /absenta-storage/* 127.0.0.1:9000
    reverse_proxy 127.0.0.1:$F_PORT
    encode gzip zstd
}
EOF_CADDY
    else
        cat << EOF_CADDY > /tmp/caddy_absenta_block.conf
http://$TARGET_DOMAIN, http://*.$TARGET_DOMAIN, http://:80 {
    reverse_proxy /api/* 127.0.0.1:$B_PORT
    reverse_proxy /socket.io/* 127.0.0.1:$B_PORT
    reverse_proxy /absenta-storage/* 127.0.0.1:9000
    reverse_proxy 127.0.0.1:$F_PORT
    encode gzip zstd
}

https://$TARGET_DOMAIN, https://*.$TARGET_DOMAIN {
    reverse_proxy /api/* 127.0.0.1:$B_PORT
    reverse_proxy /socket.io/* 127.0.0.1:$B_PORT
    reverse_proxy /absenta-storage/* 127.0.0.1:9000
    reverse_proxy 127.0.0.1:$F_PORT
    encode gzip zstd
EOF_CADDY

        if [ "$SSL_SCENARIO" = "sync" ] || [ -f /etc/caddy/ssl/cert.pem ]; then
            echo "    tls /etc/caddy/ssl/cert.pem /etc/caddy/ssl/key.pem" >> /tmp/caddy_absenta_block.conf
        elif [ "$SSL_SCENARIO" = "cloudflare" ] && [ ! -z "$CF_TOKEN" ]; then
            cat << EOF_CF >> /tmp/caddy_absenta_block.conf
    tls {
        dns cloudflare $CF_TOKEN
    }
EOF_CF
        else
            echo "    tls internal" >> /tmp/caddy_absenta_block.conf
        fi
        echo "}" >> /tmp/caddy_absenta_block.conf
    fi

    # 3. Merger Caddyfile multi-app cerdas
    echo "Menggabungkan konfigurasi Caddyfile dengan Smart Multi-App Merger..."
    echo '$SUDO_PASS' | sudo -S cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak 2>/dev/null || true

    echo '$SUDO_PASS' | sudo -S python3 -c "
import os, re

caddy_file = '/etc/caddy/Caddyfile'
content = ''
if os.path.exists(caddy_file):
    try:
        with open(caddy_file, 'r') as f:
            content = f.read()
    except Exception:
        content = ''

# Bersihkan template default ubuntu (:80 dengan /usr/share/caddy)
if '/usr/share/caddy' in content:
    content = re.sub(r':80\s*\{[^}]*root\s+\*\s+/usr/share/caddy[^}]*file_server[^}]*\}', '', content, flags=re.DOTALL)

# Hapus blok lama absenta
content = re.sub(r'# === BEGIN PROJECT: absenta ===.*?# === END PROJECT: absenta ===\n?', '', content, flags=re.DOTALL).strip()

# Pastikan header global auto_https off terpasang jika belum ada
if 'auto_https' not in content:
    header = '{\n    auto_https off\n}\n\n'
    content = header + content.lstrip()

with open('/tmp/caddy_base.txt', 'w') as f:
    f.write(content.strip() + '\n\n' if content.strip() else '')
" 2>/dev/null || true

    {
        cat /tmp/caddy_base.txt 2>/dev/null || true
        echo "# === BEGIN PROJECT: absenta ==="
        cat /tmp/caddy_absenta_block.conf
        echo ""
        echo "# === END PROJECT: absenta ==="
    } > /tmp/Caddyfile.merged

    echo '$SUDO_PASS' | sudo -S cp /tmp/Caddyfile.merged /etc/caddy/Caddyfile
    echo '$SUDO_PASS' | sudo -S rm -f /tmp/caddy_base.txt /tmp/caddy_absenta_block.conf /tmp/Caddyfile.merged 2>/dev/null || true

    echo "Validasi konfigurasi Caddyfile Multi-App..."
    if echo '$SUDO_PASS' | sudo -S caddy validate --config /etc/caddy/Caddyfile; then
        echo "✅ Validasi Caddyfile Multi-App BERHASIL!"
        echo '$SUDO_PASS' | sudo -S systemctl enable caddy 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S systemctl reload caddy 2>/dev/null || echo '$SUDO_PASS' | sudo -S systemctl restart caddy 2>/dev/null || true
    else
        echo "⚠️ Validasi Caddyfile gagal, memulihkan backup..."
        echo '$SUDO_PASS' | sudo -S cp /etc/caddy/Caddyfile.bak /etc/caddy/Caddyfile 2>/dev/null || true
        echo '$SUDO_PASS' | sudo -S systemctl restart caddy 2>/dev/null || true
    fi
fi
"@

Run-RemoteScript -ScriptContent $setupScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP

# ============================================================
# FASE 3: VERIFIKASI AKHIR
# ============================================================
Show-Header "VERIFIKASI STATUS LAYANAN"
Show-Log "Memeriksa status layanan Absenta..." "Yellow"

$verifyScript = @'
echo -e "\n=========================================================================="
echo -e "                 STATUS LAYANAN ABSENTA PADA VPS TARGET"
echo -e "=========================================================================="

echo -e "\n---> STATUS PROSES PM2:"
pm2 status

echo -e "\n---> STATUS WEB SERVER CADDY:"
if systemctl is-active --quiet caddy; then
    echo -e 'Status Caddy: \033[1;32mRUNNING (ACTIVE)\033[0m'
else
    echo -e 'Status Caddy: \033[1;31mFAILED (INACTIVE)\033[0m'
    echo -e "\n[LOG DETAIL KESALAHAN CADDY TERBARU]:"
    systemctl status caddy --no-pager -n 10
fi
echo -e "==========================================================================\n"
'@

Run-RemoteScript -ScriptContent $verifyScript -KeyPath $SAFE_NEW_KEY -TargetUser $NEW_USER -TargetIP $NEW_IP

Show-Header "DEPLOY SELESAI!"
Show-Log "Project Absenta berhasil di-deploy ke domain: $TARGET_DOMAIN!" "Green"
Write-Host ""
Show-Log "Log deploy disimpan di: $LOG_FILE" "Cyan"
Write-Host ""

Stop-Transcript
if (-not $Silent) {
    Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
}
