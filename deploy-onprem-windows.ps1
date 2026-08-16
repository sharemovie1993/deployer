# Wizard Instalasi & Deployment - Project Absenta
# Untuk Windows PowerShell

param (
    [string]$BackendPort = "3003",
    [string]$FrontendPort = "5175",
    [string]$DeployMode = "", # "saas" or "local"
    [string]$ServerDomain = "", # e.g. "api.absenta.id" or "192.168.1.10"
    [string]$NodeName = "",
    [switch]$Silent = $false
)

$ErrorActionPreference = "Stop"

# Mengonfigurasi ExecutionPolicy agar berkas script global npm (seperti PM2) dapat berjalan
try {
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force -ErrorAction SilentlyContinue
} catch {}

function Show-Header {
    param([string]$StepTitle)
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "             WIZARD INSTALASI & DEPLOYMENT - PROJECT ABSENTA             " -ForegroundColor Yellow -Bold
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($StepTitle) {
        Write-Host " [Langkah] $StepTitle" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

function Install-CaddyLocal {
    param (
        [string]$Domain,
        [string]$FPort,
        [string]$BPort,
        [string]$SSLEmail = "",
        [string]$CFToken = "",
        [string]$DeployScenario = "hybrid",
        [string]$SSLScenario = "internal"
    )
    
    Show-Header "Setup Reverse Proxy Lokal (Caddy)"
    
    # ZERO TOUCH: Otomatis deteksi dan hentikan konflik port 80/443
    Write-Host "Memeriksa konflik port 80/443..." -ForegroundColor Cyan
    $conflictingService = Get-Service -Name "Apache24", "W3SVC" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }
    if ($conflictingService) {
        foreach ($svc in $conflictingService) {
            Write-Host "Menentukan layanan konflik: $($svc.DisplayName). Menghentikan otomatis..." -ForegroundColor Yellow
            Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
            Set-Service -Name $svc.Name -StartupType Disabled -ErrorAction SilentlyContinue
        }
    }

    # Jika port 80 masih terpakai oleh proses lain (bukan service)
    $port80Owner = Get-NetTCPConnection -LocalPort 80 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue
    if ($port80Owner) {
        Write-Host "Port 80 dikuasai oleh PID $port80Owner. Menghentikan proses..." -ForegroundColor Yellow
        Stop-Process -Id $port80Owner -Force -ErrorAction SilentlyContinue
    }

    # Pastikan protokol TLS 1.2 diaktifkan agar proses download tidak diblokir oleh TLS versi lama
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    Write-Host "Memeriksa Caddy... " -NoNewline
    # Cari di PATH global sistem terlebih dahulu
    $caddyPath = Get-Command caddy -ErrorAction SilentlyContinue
    # Jika tidak ada di PATH, cari di folder instalasi lokal ($PSScriptRoot\caddy.exe)
    if (-not $caddyPath -and (Test-Path "$PSScriptRoot\caddy.exe")) {
        $caddyPath = "$PSScriptRoot\caddy.exe"
    }

    $isCustomCaddy = $false
    if ($caddyPath) {
        try {
            $modules = & $caddyPath list-modules
            if ($modules -match "dns.providers.cloudflare") { $isCustomCaddy = $true }
        } catch {
            $caddyPath = $null
        }
    }

    $dest = "$PSScriptRoot\caddy.exe"
    $needCloudflare = ($SSLScenario -eq "cloudflare" -and -not [string]::IsNullOrWhiteSpace($CFToken))

    if ($needCloudflare) {
        if ($isCustomCaddy) {
            Write-Host "OK (Menggunakan Caddy + Cloudflare yang sudah ada)" -ForegroundColor Green
        } else {
            # Periksa apakah file caddy.exe lokal sebenarnya sudah ada dan mendukung cloudflare
            if (Test-Path $dest) {
                try {
                    $localModules = & $dest list-modules
                    if ($localModules -match "dns.providers.cloudflare") {
                        $isCustomCaddy = $true
                        $caddyPath = $dest
                    }
                } catch {}
            }

            if ($isCustomCaddy) {
                Write-Host "OK (Menggunakan Caddy + Cloudflare lokal)" -ForegroundColor Green
            } else {
                Write-Host "BUTUH VERSI CLOUDFLARE" -ForegroundColor Yellow
                Write-Host "Mengunduh Caddy dengan Cloudflare Plugin..." -ForegroundColor Cyan
                $url = "https://caddyserver.com/api/download?os=windows&arch=amd64&p=github.com%2Fcaddy-dns%2Fcloudflare"
                
                # Hentikan service Caddy terlebih dahulu agar file caddy.exe tidak terkunci saat ditimpa
                sc.exe stop Caddy 2>&1 | Out-Null
                Start-Sleep -Seconds 1
                
                Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $dest
                $caddyPath = $dest
                Write-Host "Caddy Custom berhasil diunduh ke $dest" -ForegroundColor Green
            }
        }
    } else {
        if ($caddyPath) {
            Write-Host "OK (Menggunakan Caddy yang sudah ada)" -ForegroundColor Green
        } else {
            Write-Host "TIDAK DITEMUKAN" -ForegroundColor Yellow
            Write-Host "Mengunduh Caddy standar..." -ForegroundColor Cyan
            $url = "https://caddyserver.com/api/download?os=windows&arch=amd64"
            
            Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $dest
            $caddyPath = $dest
            Write-Host "Caddy standar berhasil diunduh ke $dest" -ForegroundColor Green
        }
    }

    # Buat Caddyfile cerdas
    Write-Host "Membuat konfigurasi Caddyfile..." -ForegroundColor Cyan
    $tlsConfig = "tls internal"
    
    if ($SSLScenario -eq "sync") {
        $sslDir = "$PSScriptRoot\ssl"
        if (-not (Test-Path $sslDir)) { New-Item -ItemType Directory -Path $sslDir | Out-Null }
        $tlsConfig = "tls `"$sslDir\cert.pem`" `"$sslDir\key.pem`""
        
        # Create sync-ssl.ps1
        $syncScriptContent = @"
`$sslDir = `"$sslDir`"
`$url = `"$LicenseServer/api/public/download-ssl?domain=$Domain&license_key=$licenseKey`"
try {
    `$resp = Invoke-RestMethod -Uri `$url -Method Get
    if (`$resp.success) {
        `$resp.cert | Set-Content `"`$sslDir\cert.pem`" -NoNewline
        `$resp.key | Set-Content `"`$sslDir\key.pem`" -NoNewline
        Restart-Service -Name Caddy -Force
    }
} catch {}
"@
        $syncScriptContent | Set-Content "$PSScriptRoot\sync-ssl.ps1" -Encoding utf8
        
        # Run sync once immediately to fetch initial certs
        try {
            & "$PSScriptRoot\sync-ssl.ps1"
        } catch {}
        
        # Register scheduled task
        try {
            $action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument "-NoProfile -WindowStyle Hidden -File `"$PSScriptRoot\sync-ssl.ps1`""
            $trigger = New-ScheduledTaskTrigger -Daily -At 3am
            Register-ScheduledTask -TaskName "Absenta SSL Sync" -Action $action -Trigger $trigger -User "NT AUTHORITY\SYSTEM" -Force
        } catch {
            $cmd = "schtasks /create /tn `"Absenta SSL Sync`" /tr `"powershell.exe -NoProfile -WindowStyle Hidden -File '$PSScriptRoot\sync-ssl.ps1'`" /sc daily /st 03:00 /ru SYSTEM /f"
            Invoke-Expression $cmd
        }
    } elseif ($SSLScenario -eq "cloudflare" -and -not [string]::IsNullOrWhiteSpace($CFToken)) {
        # Bersihkan token dari karakter yang tidak diinginkan (seperti titik dua di depan)
        $cleanToken = $CFToken.Trim().TrimStart(':').Trim()
        $tlsConfig = "tls {
        dns cloudflare $cleanToken
    }"
    } elseif (-not [string]::IsNullOrWhiteSpace($SSLEmail)) {
        $tlsConfig = "email $SSLEmail"
    }

    $hosts = $Domain
    if ($DeployScenario -eq "saas" -and ($SSLScenario -eq "cloudflare" -and -not [string]::IsNullOrWhiteSpace($CFToken))) {
        $hosts = "$Domain, *.$Domain"
    }

    $caddyfileContent = ""

    if ($DeployScenario -eq "hybrid") {
        # Blok HTTP Port 80 khusus untuk menerima traffic lokal IP & tunnel (tanpa TLS)
        $caddyfileContent += @"
http://:80 {
    # Forward API requests to Backend
    reverse_proxy /api/* localhost:$BPort

    # WebSocket Support (socket.io)
    reverse_proxy /socket.io/* localhost:$BPort {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
    }

    # Forward everything else to Frontend
    reverse_proxy /* localhost:$FPort

    # Optimization
    encode gzip zstd
}

"@
    }

    # Blok Utama untuk Domain dengan SSL/TLS
    $caddyfileContent += @"
$hosts {
    # Forward API requests to Backend
    reverse_proxy /api/* localhost:$BPort

    # WebSocket Support (socket.io)
    reverse_proxy /socket.io/* localhost:$BPort {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
    }

    # Forward everything else to Frontend
    reverse_proxy /* localhost:$FPort

    # Optimization
    encode gzip zstd
    
    # SSL Configuration
    $tlsConfig
}
"@
    $caddyfileContent | Set-Content "$PSScriptRoot\Caddyfile" -Encoding utf8

    # Install as Service (Windows Native approach)
    Write-Host "Mendaftarkan Caddy sebagai Windows Service..." -ForegroundColor Cyan
    try {
        $binPath = "`"$caddyPath`" run --config `"$PSScriptRoot\Caddyfile`""
        sc.exe stop Caddy 2>&1 | Out-Null
        sc.exe delete Caddy 2>&1 | Out-Null
        sc.exe create Caddy binPath= $binPath start= auto DisplayName= "Absenta Reverse Proxy (Caddy)"
        sc.exe start Caddy
        
        if ([string]::IsNullOrWhiteSpace($CFToken)) {
            # ZERO TOUCH SSL: Import Root CA secara native ke Windows Store (Hanya untuk Internal SSL)
            Write-Host "Menginstal Sertifikat Root Caddy ke Windows Trusted Store..." -ForegroundColor Cyan
            $caddyDataDir = "$env:AppData\Caddy"
            $systemCertPath = "C:\Windows\System32\config\systemprofile\AppData\Roaming\Caddy\pki\authorities\local\root.crt"
            $userCertPath = "$caddyDataDir\pki\authorities\local\root.crt"
            
            $finalCertPath = ""
            if (Test-Path $userCertPath) { $finalCertPath = $userCertPath }
            elseif (Test-Path $systemCertPath) { $finalCertPath = $systemCertPath }

            if (-not [string]::IsNullOrWhiteSpace($finalCertPath)) {
                Import-Certificate -FilePath $finalCertPath -CertStoreLocation Cert:\LocalMachine\Root -ErrorAction SilentlyContinue
                Import-Certificate -FilePath $finalCertPath -CertStoreLocation Cert:\CurrentUser\Root -ErrorAction SilentlyContinue
                certutil.exe -user -pulse | Out-Null
                Write-Host "Sertifikat berhasil diimpor!" -ForegroundColor Green
            }
        } else {
            Write-Host "Menggunakan Cloudflare DNS Challenge. Sertifikat resmi akan segera terbit otomatis." -ForegroundColor Green
        }
        
        Write-Host "Caddy Service & SSL berhasil dikonfigurasi!" -ForegroundColor Green
    } catch {
        Write-Host "Peringatan: Gagal mengotomatisasi service Caddy." -ForegroundColor Yellow
    }
}

# ----------------------------------------------------
# LANGKAH 0: Selamat Datang / Welcome Screen
# ----------------------------------------------------
Show-Header
Write-Host "Selamat datang di Wizard Deployment Project Absenta." -ForegroundColor White
Write-Host "Wizard ini akan memandu Anda melakukan deployment backend dan frontend secara otomatis." -ForegroundColor White
Write-Host ""
Write-Host "Proses ini mencakup:"
Write-Host " 1. Pemeriksaan Prasyarat Sistem (Node.js, NPM, PM2)"
Write-Host " 2. Konfigurasi Skenario (SaaS vs Lokal Sekolah)"
Write-Host " 3. Instalasi Dependensi & Inisialisasi Database (Prisma)"
Write-Host " 4. Kompilasi Kode (Backend & Frontend)"
Write-Host " 5. Menjalankan Layanan (PM2 Mode Cluster)"
Write-Host ""

if (-not $Silent) {
    Write-Host "Tekan [Y] untuk melanjutkan, atau tombol lain untuk keluar."
    $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    if ($key.Character -ne 'y' -and $key.Character -ne 'Y') {
        Write-Host "Instalasi dibatalkan oleh pengguna." -ForegroundColor Red
        Exit
    }
}

# ----------------------------------------------------
# LANGKAH 1: Pemeriksaan Prasyarat Sistem
# ----------------------------------------------------
Show-Header "1 / 5 - Pemeriksaan Prasyarat Sistem"
$hasNode = $false
$hasPM2 = $false

Write-Host "Memeriksa Node.js... " -NoNewline
try {
    $nodeVer = node -v
    Write-Host "OK ($nodeVer)" -ForegroundColor Green
    $hasNode = $true
} catch {
    Write-Host "BELUM TERPASANG" -ForegroundColor Yellow
    Exit
}

Write-Host "Memeriksa PM2... " -NoNewline
$pm2Path = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2Path) {
    Write-Host "OK (Terpasang)" -ForegroundColor Green
    $hasPM2 = $true
} else {
    Write-Host "BELUM TERPASANG" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Pemeriksaan prasyarat selesai!" -ForegroundColor Green
if (-not $Silent) { Read-Host "Tekan [ENTER] untuk melanjutkan ke konfigurasi skenario..." }

# ----------------------------------------------------
# LANGKAH 2: Konfigurasi SkenARIO & Port
# ----------------------------------------------------
$LicenseServer = "https://api.absenta.id"
$finalDomain = "your-domain.id"
$finalScheme = "https"
$deployScenario = "saas" # default
$nodeName = "absenta-node-1"
$dbUrl = "postgresql://postgres:123123123@localhost:5432/absensi"
$existingLicense = ""
$existingCFToken = ""
$existingDBUrl = ""
$existingNodeName = ""

if (Test-Path "absenta_backend/.env") {
    $envContent = Get-Content "absenta_backend/.env"
    foreach ($line in $envContent) {
        if ($line -match "^LICENSE_KEY=(.*)") {
            $existingLicense = $Matches[1].Trim()
        }
        elseif ($line -match "^CLOUDFLARE_API_TOKEN=(.*)") {
            $existingCFToken = $Matches[1].Trim()
        }
        elseif ($line -match "^DATABASE_URL=(.*)") {
            $existingDBUrl = $Matches[1].Trim()
        }
        elseif ($line -match "^NODE_NAME=(.*)") {
            $existingNodeName = $Matches[1].Trim()
        }
    }
}
if ($existingDBUrl) { $dbUrl = $existingDBUrl }
if ($existingNodeName) { $nodeName = $existingNodeName }

if (-not $Silent) {
    $confirmed = $false
    while (-not $confirmed) {
        Show-Header "2 / 5 - Konfigurasi Server Lokal"

        # ─── BAGIAN A: Jaringan, Port & SSL (Network & SSL) ──────────────────────────
        Write-Host "[BAGIAN A: Jaringan, Port & SSL]" -ForegroundColor Cyan
        Write-Host "Pilih Skenario Deployment:" -ForegroundColor White
        Write-Host " 1. SaaS / Cloud (Akses via Domain Publik, e.g. https://app.absenta.id)"
        Write-Host " 2. Hybrid (Lokal Sekolah + Reverse Proxy VPS via Caddy/Nginx)"
        $scenarioChoice = Read-Host "Pilih [1/2] (Default: 1)"
        
        $deployScenario = "saas"
        if ($scenarioChoice -eq "2") { 
            $deployScenario = "hybrid"
            $finalScheme = "https" # Biasanya VPS pakai SSL
        }

        # 1. Domain / Host
        if ($deployScenario -eq "saas") {
            $inputDomain = Read-Host "Masukkan Domain Utama (misal: platform.com) [$finalDomain]"
            if (-not [string]::IsNullOrWhiteSpace($inputDomain)) { $finalDomain = $inputDomain }
        } else {
            $finalDomain = ""
        }

        # 2. Protokol
        $inputScheme = Read-Host "Gunakan Protokol (http/https) [$finalScheme]"
        if (-not [string]::IsNullOrWhiteSpace($inputScheme)) { $finalScheme = $inputScheme }
        
        # 3. LAN IP (Untuk akses lokal di skenario Hybrid)
        if ($deployScenario -eq "hybrid") {
            $lanIp = Read-Host "Masukkan IP LAN Server (akses bypass VPS) [192.168.1.10]"
            if ([string]::IsNullOrWhiteSpace($lanIp)) { $lanIp = "192.168.1.10" }
        } else {
            $lanIp = $finalDomain
        }

        # 4. Ports
        $inputBPort = Read-Host "Port Backend [$BackendPort]"
        if (-not [string]::IsNullOrWhiteSpace($inputBPort)) { $BackendPort = $inputBPort }
        
        $inputFPort = Read-Host "Port Frontend [$FrontendPort]"
        if (-not [string]::IsNullOrWhiteSpace($inputFPort)) { $FrontendPort = $inputFPort }

        # ─── BAGIAN B: Database & Redis (Storage) ──────────────────────────────────
        Write-Host "`n[BAGIAN B: Database & Redis]" -ForegroundColor Cyan
        $defaultDBUrl = "postgresql://postgres:123123123@localhost:5432/absensi"
        if ($existingDBUrl) { $defaultDBUrl = $existingDBUrl }
        $inputDb = Read-Host "Masukkan DATABASE_URL [$defaultDBUrl]"
        if (-not [string]::IsNullOrWhiteSpace($inputDb)) { 
            $dbUrl = $inputDb.Trim() 
        } else {
            $dbUrl = $defaultDBUrl
        }
        if ($dbUrl.StartsWith("[")) { $dbUrl = $dbUrl.Substring(1) }
        if ($dbUrl.EndsWith("]")) { $dbUrl = $dbUrl.Substring(0, $dbUrl.Length - 1) }

        Write-Host "Pilih Mode Redis:" -ForegroundColor Gray
        Write-Host " 1. Built-in (Embedded) - Rekomendasi"
        Write-Host " 2. Eksternal (Laragon/Single)"
        $redisChoice = Read-Host "Pilih [1/2] (Default: 1)"
        if ($redisChoice -eq "2") { 
            $redisMode = "single" 
            $redisUrl = Read-Host "Masukkan Redis URL [redis://localhost:6379]"
            if ([string]::IsNullOrWhiteSpace($redisUrl)) { $redisUrl = "redis://localhost:6379" }
        } else { 
            $redisMode = "embedded"
            $redisUrl = "redis://localhost:6379"
        }

        # ─── BAGIAN C: SSL Configuration ──────────────────────────────────
        Write-Host "`n[BAGIAN C: SSL Configuration]" -ForegroundColor Cyan
        $sslEmail = ""
        $cfToken = ""
        $sslScenario = "internal"
        if ($deployScenario -eq "hybrid" -or $deployScenario -eq "saas") {
            if ($deployScenario -eq "saas") {
                Write-Host "Opsi SSL SaaS (Memerlukan Cloudflare DNS Challenge untuk Wildcard SSL):" -ForegroundColor Gray
                Write-Host " 1. Cloudflare DNS Challenge (Sertifikat Resmi Wildcard - Rekomendasi)"
                Write-Host " 2. SSL Let's Encrypt Standar (Hanya Domain Utama - Tanpa Subdomain)"
                $sslChoice = Read-Host "Pilih [1/2] (Default: 1)"
                
                if ($sslChoice -eq "2") {
                    $sslScenario = "letsencrypt"
                    $inputEmail = Read-Host "Email untuk SSL Let's Encrypt"
                    if (-not [string]::IsNullOrWhiteSpace($inputEmail)) { $sslEmail = $inputEmail }
                } else {
                    $sslScenario = "cloudflare"
                    $cfPrompt = "Masukkan Cloudflare API Token Anda"
                    if ($existingCFToken) { $cfPrompt += " (Kosongkan untuk menggunakan yang sudah ada: $existingCFToken)" }
                    $inputCF = Read-Host $cfPrompt
                    if ([string]::IsNullOrWhiteSpace($inputCF)) {
                        $cfToken = $existingCFToken
                    } else {
                        $cfToken = $inputCF.Trim()
                    }
                }
            } else {
                Write-Host "Opsi SSL Lokal (Hybrid):" -ForegroundColor Gray
                Write-Host " 1. SSL Internal (Bawaan Caddy - CA Lokal)"
                Write-Host " 2. Sinkronisasi Sertifikat dari Server Lisensi (Otomatis via VPN - Rekomendasi)"
                Write-Host " 3. Cloudflare DNS Challenge (Sertifikat Resmi - Manual)"
                $sslChoice = Read-Host "Pilih [1-3] (Default: 2)"
                
                if ($sslChoice -eq "1") {
                    $sslScenario = "internal"
                    $inputEmail = Read-Host "Email untuk SSL Let's Encrypt (Kosongkan untuk SSL Internal)"
                    if (-not [string]::IsNullOrWhiteSpace($inputEmail)) { $sslEmail = $inputEmail }
                } elseif ($sslChoice -eq "3") {
                    $sslScenario = "cloudflare"
                    $cfPrompt = "Masukkan Cloudflare API Token Anda"
                    if ($existingCFToken) { $cfPrompt += " (Kosongkan untuk menggunakan yang sudah ada: $existingCFToken)" }
                    $inputCF = Read-Host $cfPrompt
                    if ([string]::IsNullOrWhiteSpace($inputCF)) {
                        $cfToken = $existingCFToken
                    } else {
                        $cfToken = $inputCF.Trim()
                    }
                } else {
                    $sslScenario = "sync"
                }
            }
        }

        # ─── BAGIAN D: Lisensi & Tunnel (License & Integration) ─────────────────────────
        Write-Host "`n[BAGIAN D: Lisensi & Tunnel]" -ForegroundColor Cyan
        $licPrompt = "Masukkan Kunci Lisensi"
        if ($existingLicense) { 
            $licPrompt += " (Ketik 'new' jika ingin registrasi baru) [$existingLicense]" 
        } else {
            $licPrompt += " (Kosongkan jika ingin registrasi baru)"
        }
        $inputLic = (Read-Host $licPrompt).Trim()
        if ($inputLic -eq 'new' -or $inputLic -eq 'NEW') {
            $inputLic = ""
            $existingLicense = ""
        }
        if (-not [string]::IsNullOrWhiteSpace($inputLic)) { 
            $licenseKey = $inputLic
        } else { 
            if ($existingLicense) {
                $licenseKey = $existingLicense
            } else {
                $licenseKey = "" 
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
                        $baseDomainCheck = ".absenta.id"
                        if ($slugInput.EndsWith($baseDomainCheck)) {
                            $slugInput = $slugInput.Substring(0, $slugInput.Length - $baseDomainCheck.Length)
                        }

                        Write-Host "Menghubungi server lisensi untuk mendaftarkan subdomain '$slugInput.absenta.id'..." -ForegroundColor Cyan
                        try {
                            $regBody = @{
                                school_name = $schoolName
                                wa_number = $whatsappNo
                                requested_slug = $slugInput
                            }
                            $response = Invoke-RestMethod -Uri "$LicenseServer/api/license/request-local-free" -Method Post -Body ($regBody | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 15
                            
                            if ($response.success) {
                                $licenseKey = $response.license_key
                                Write-Host "Registrasi Berhasil!" -ForegroundColor Green
                                Write-Host "Lisensi Anda: $licenseKey" -ForegroundColor Green
                                Write-Host "[INFO] Kunci Lisensi dan rincian domain telah dikirimkan ke WhatsApp Anda ($whatsappNo). Silakan cek pesan masuk Anda." -ForegroundColor Green
                                $regSuccess = $true
                                
                                # Set default domain and scenario for next steps
                                $deployScenario = "hybrid"
                                $finalDomain = "$slugInput.absenta.id"
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

        # ─── BAGIAN E: Identitas Node (Node Identity) ───────────────────────────────
        Write-Host "`n[BAGIAN E: Identitas Node]" -ForegroundColor Cyan
        $defaultNodeName = "absenta-node-1"
        if ($existingNodeName) {
            $defaultNodeName = $existingNodeName
        } else {
            $localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch "^127\." } | Select-Object -First 1 -ExpandProperty IPAddress -ErrorAction SilentlyContinue)
            if ($localIp) {
                $defaultNodeName = "node-" + $localIp.Replace(".", "-")
            }
        }
        $nodeNamePrompt = "Masukkan Identitas Node (NODE_NAME) [$defaultNodeName]"
        $inputNode = (Read-Host $nodeNamePrompt).Trim()
        if ([string]::IsNullOrWhiteSpace($inputNode)) {
            $nodeName = $defaultNodeName
        } else {
            $nodeName = $inputNode
        }

        Write-Host "`n--- RINGKASAN KONFIGURASI ---" -ForegroundColor Yellow
        Write-Host " - Skenario       : $deployScenario"
        Write-Host " - Domain/Host    : $finalDomain"
        Write-Host " - Protokol       : $finalScheme"
        Write-Host " - IP LAN (Local) : $lanIp"
        Write-Host " - Port Backend   : $BackendPort"
        Write-Host " - Port Frontend  : $FrontendPort"
        Write-Host " - DB Target      : $dbUrl"
        Write-Host " - Redis Mode     : $redisMode"
        Write-Host " - License Key    : $(if($licenseKey){$licenseKey}else{'Tidak Ada'})"
        Write-Host " - Node Identity  : $nodeName"
        Write-Host "-----------------------------" -ForegroundColor Yellow
        if ($deployScenario -eq "hybrid" -or $deployScenario -eq "saas") {
            if ($deployScenario -eq "hybrid") {
                Write-Host " INFO: Frontend akan dikonfigurasi menggunakan domain VPS ($finalDomain)" -ForegroundColor Cyan
                Write-Host "       Backend akan mengizinkan akses dari domain VPS DAN IP Lokal ($lanIp)" -ForegroundColor Cyan
            } else {
                Write-Host " INFO: Skenario SaaS terpusat. Caddy akan dikonfigurasi untuk melayani domain utama ($finalDomain) dan seluruh subdomain (*.$finalDomain)" -ForegroundColor Cyan
            }
            $setupCaddy = Read-Host " Apakah Anda ingin memasang/update Reverse Proxy (Caddy) lokal? [Y/n]"
        }
        Write-Host ""
        $confKey = Read-Host "Apakah sudah benar? [Y/n]"
        if ($confKey -eq 'n' -or $confKey -eq 'N') {
            # Loop again
        } else {
            if ($deployScenario -eq "hybrid") {
                Write-Host "Menghubungi server lisensi untuk memvalidasi domain dan lisensi..." -ForegroundColor Cyan
                try {
                    if ([string]::IsNullOrWhiteSpace($licenseKey)) {
                        Write-Host "[ERROR] Lisensi wajib diisi untuk skenario Hybrid!" -ForegroundColor Red
                        $confirmed = $false
                        Read-Host "Tekan [ENTER] untuk mengulangi konfigurasi..."
                        continue
                    }
                    
                    $validateUrl = "$LicenseServer/api/license/check/$licenseKey"
                    $valRes = Invoke-RestMethod -Uri $validateUrl -Method Get -TimeoutSec 10
                    
                    $isActive = $valRes.data.is_active
                    if ($isActive -eq $null) { $isActive = $valRes.data.isActive }
                    $status = $valRes.data.status

                    if ($valRes.success -ne $true -or $isActive -ne 1 -or $status -ne 'active') {
                        Write-Host "[ERROR] Kunci lisensi tidak valid atau tidak aktif!" -ForegroundColor Red
                        $confirmed = $false
                        Read-Host "Tekan [ENTER] untuk mengulangi konfigurasi..."
                        continue
                    }
                    
                    $expectedSlug = $valRes.data.requested_slug
                    if ($expectedSlug -eq $null) { $expectedSlug = $valRes.data.requestedSlug }
                    
                    $finalDomain = "$expectedSlug.absenta.id"
                    Write-Host "Validasi berhasil! Lisensi aktif untuk domain '$finalDomain'." -ForegroundColor Green

                    # Option for custom domain
                    $useCustom = (Read-Host "Apakah Anda ingin menggunakan custom domain sekolah sendiri (seperti absen.smkn1.sch.id)? [y/N]").Trim()
                    if ($useCustom -eq 'y' -or $useCustom -eq 'Y') {
                        $customDom = (Read-Host "Masukkan Custom Domain Anda").Trim().ToLower()
                        if (-not [string]::IsNullOrWhiteSpace($customDom)) {
                            $finalDomain = $customDom
                            Write-Host "Domain utama diatur ke custom domain: $finalDomain" -ForegroundColor Green
                        }
                    }
                    $confirmed = $true
                } catch {
                    Write-Host "[WARNING] Gagal memvalidasi secara online: $($_.Exception.Message)" -ForegroundColor Yellow
                    if ([string]::IsNullOrWhiteSpace($finalDomain)) {
                        while ([string]::IsNullOrWhiteSpace($finalDomain)) {
                            $finalDomain = (Read-Host "Masukkan Domain Publik Akses Sekolah (karena offline, contoh 'demo.absenta.id')").Trim().ToLower()
                        }
                    }
                    Write-Host "Melanjutkan instalasi dengan asumsi konfigurasi benar..." -ForegroundColor Yellow
                    $confirmed = $true
                }
            } else {
                $confirmed = $true
            }
        }
    }
} else {
    # Logic for Silent mode parameters
    if (-not [string]::IsNullOrWhiteSpace($ServerDomain)) { $finalDomain = $ServerDomain }
    if (-not [string]::IsNullOrWhiteSpace($DeployMode)) { $deployScenario = $DeployMode }
    if (-not [string]::IsNullOrWhiteSpace($NodeName)) { $nodeName = $NodeName }
}

# ----------------------------------------------------
# LANGKAH Tambahan: Setup Caddy (Hybrid/SaaS)
# ----------------------------------------------------
if (($deployScenario -eq "hybrid" -or $deployScenario -eq "saas") -and ($setupCaddy -eq 'y' -or $setupCaddy -eq 'Y' -or [string]::IsNullOrWhiteSpace($setupCaddy))) {
    Install-CaddyLocal -Domain $finalDomain -FPort $FrontendPort -BPort $BackendPort -SSLEmail $sslEmail -CFToken $cfToken -DeployScenario $deployScenario -SSLScenario $sslScenario
}
# Hitung Main Domain (misal: app.absenta.id -> absenta.id)
$calculatedMainDomain = $finalDomain
$domainParts = $finalDomain.Split('.')
if ($domainParts.Count -ge 3) {
    # Jika ada 3 bagian atau lebih (misal app.absenta.id), ambil 2 bagian terakhir sebagai main domain
    $calculatedMainDomain = "$($domainParts[-2]).$($domainParts[-1])"
}

if (-not (Test-Path "absenta_backend/.env")) { Copy-Item "absenta_backend/.env.example" "absenta_backend/.env" }
$backendEnv = Get-Content "absenta_backend/.env"
$newBackendEnv = @()
$writtenKeys = @{}

foreach ($line in $backendEnv) {
    if ($line -match "^([^=]+)=(.*)$") {
        $key = $Matches[1].Trim()
        if ($writtenKeys.ContainsKey($key)) {
            continue
        }
        $writtenKeys[$key] = $true

        if ($key -eq "PORT") { $newBackendEnv += "PORT=$BackendPort" }
        elseif ($key -eq "DATABASE_URL") { $newBackendEnv += "DATABASE_URL=$dbUrl" }
        elseif ($key -eq "REDIS_MODE") { $newBackendEnv += "REDIS_MODE=$redisMode" }
        elseif ($key -eq "REDIS_URL") { $newBackendEnv += "REDIS_URL=$redisUrl" }
        elseif ($key -eq "API_URL") { $newBackendEnv += "API_URL=${finalScheme}://$finalDomain/api" }
        elseif ($key -eq "APP_URL") { $newBackendEnv += "APP_URL=${finalScheme}://$finalDomain" }
        elseif ($key -eq "PUBLIC_APP_URL") { $newBackendEnv += "PUBLIC_APP_URL=${finalScheme}://$finalDomain" }
        elseif ($key -eq "PUBLIC_INVOICE_BASE_URL") { $newBackendEnv += "PUBLIC_INVOICE_BASE_URL=${finalScheme}://$finalDomain" }
        elseif ($key -eq "PUBLIC_APP_SCHEME") { $newBackendEnv += "PUBLIC_APP_SCHEME=$finalScheme" }
        elseif ($key -eq "PUBLIC_DOMAIN_BASE") { $newBackendEnv += "PUBLIC_DOMAIN_BASE=$finalDomain" }
        elseif ($key -eq "MAIN_DOMAIN") { $newBackendEnv += "MAIN_DOMAIN=$calculatedMainDomain" }
        elseif ($key -eq "TENANT_BASE_DOMAIN") { $newBackendEnv += "TENANT_BASE_DOMAIN=$calculatedMainDomain" }
        elseif ($key -eq "FRONTEND_URL") { $newBackendEnv += "FRONTEND_URL=${finalScheme}://$finalDomain" }
        elseif ($key -eq "ALLOWED_LAN_IP") { $newBackendEnv += "ALLOWED_LAN_IP=$lanIp" }
        elseif ($key -eq "LICENSE_KEY") { $newBackendEnv += "LICENSE_KEY=$licenseKey" }
        elseif ($key -eq "CLOUDFLARE_API_TOKEN") { $newBackendEnv += "CLOUDFLARE_API_TOKEN=$cfToken" }
        elseif ($key -eq "DEPLOY_SCENARIO") { $newBackendEnv += "DEPLOY_SCENARIO=$deployScenario" }
        elseif ($key -eq "NODE_NAME") { $newBackendEnv += "NODE_NAME=$nodeName" }
        else { $newBackendEnv += $line }
    } else {
        $newBackendEnv += $line
    }
}
# Pastikan variabel kritikal tertulis jika tidak ada di example
if (-not $writtenKeys.ContainsKey("DATABASE_URL")) { $newBackendEnv += "DATABASE_URL=$dbUrl" }
if (-not $writtenKeys.ContainsKey("LICENSE_KEY")) { $newBackendEnv += "LICENSE_KEY=$licenseKey" }
if (-not $writtenKeys.ContainsKey("CLOUDFLARE_API_TOKEN")) { $newBackendEnv += "CLOUDFLARE_API_TOKEN=$cfToken" }
if (-not $writtenKeys.ContainsKey("MAIN_DOMAIN")) { $newBackendEnv += "MAIN_DOMAIN=$calculatedMainDomain" }
if (-not $writtenKeys.ContainsKey("DEPLOY_SCENARIO")) { $newBackendEnv += "DEPLOY_SCENARIO=$deployScenario" }
if (-not $writtenKeys.ContainsKey("NODE_NAME")) { $newBackendEnv += "NODE_NAME=$nodeName" }
$newBackendEnv | Set-Content "absenta_backend/.env"

if (-not (Test-Path "absenta_frontend/.env")) { Copy-Item "absenta_frontend/.env.example" "absenta_frontend/.env" }
# Frontend VITE_API_BASE_URL must be absolute for local deployments without a proxy like Caddy/Nginx
$frontendEnv = Get-Content "absenta_frontend/.env"
$newFrontendEnv = @()
$fPortFound = $false
$proxyTargetFound = $false

foreach ($line in $frontendEnv) {
    if ($line -match "^VITE_API_BASE_URL=") { 
        # Hybrid/SaaS scenario: Use relative path '/api' to prevent CORS issues and support dynamic subdomains
        $newFrontendEnv += "VITE_API_BASE_URL=/api"
    }
    elseif ($line -match "^VITE_PROXY_TARGET=") { 
        $newFrontendEnv += "VITE_PROXY_TARGET=http://localhost:$BackendPort"
        $proxyTargetFound = $true
    }
    elseif ($line -match "^VITE_SOCKET_URL=") { $newFrontendEnv += "VITE_SOCKET_URL=" }
    elseif ($line -match "^PORT=") { 
        $newFrontendEnv += "PORT=$FrontendPort"
        $fPortFound = $true
    }
    else { $newFrontendEnv += $line }
}
if (-not $fPortFound) { $newFrontendEnv += "PORT=$FrontendPort" }
if (-not $proxyTargetFound) { $newFrontendEnv += "VITE_PROXY_TARGET=http://localhost:$BackendPort" }
$newFrontendEnv | Set-Content "absenta_frontend/.env"

Write-Host "Info: Konfigurasi .env berhasil diperbarui untuk target ${finalScheme}://$finalDomain." -ForegroundColor Gray

# ----------------------------------------------------
# LANGKAH 3: Instalasi Dependensi & Database
# ----------------------------------------------------
Show-Header "3 / 5 - Instalasi Dependensi & Database"
Write-Host "Menginstal dependensi dan sinkronisasi database... (Mungkin memakan waktu)" -ForegroundColor Yellow
Push-Location absenta_backend
npm install --quiet
Write-Host "Sinkronisasi skema database..." -ForegroundColor Cyan
npx prisma generate
npx prisma db push --accept-data-loss

Write-Host "Migrasi data tenant (subdomain)..." -ForegroundColor Cyan
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.tenant.findMany({ where: { subdomain: null, domain: { not: null } } }).then(ts => Promise.all(ts.map(t => p.tenant.update({ where: { id: t.id }, data: { subdomain: t.domain.includes('.') ? t.domain.split('.')?.[0] : t.domain } })))).then(() => { console.log('Migrasi selesai.'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
Pop-Location

Push-Location absenta_frontend
npm install --quiet
Pop-Location

# ----------------------------------------------------
# LANGKAH 4: Kompilasi (Build)
# ----------------------------------------------------
Show-Header "4 / 5 - Kompilasi Kode (Build)"
Write-Host "Membangun Backend & Frontend..." -ForegroundColor Yellow

$buildFailed = $false

Write-Host "1. Membangun Backend (TSC)..." -ForegroundColor Cyan
Push-Location absenta_backend
$env:NODE_OPTIONS = "--max-old-space-size=4096"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" -ForegroundColor Red
    Write-Host " GAGAL: Kompilasi Backend bermasalah!" -ForegroundColor Red -Bold
    Write-Host " Proses deployment dihentikan seketika untuk keamanan." -ForegroundColor Yellow
    Write-Host "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" -ForegroundColor Red
    Pop-Location
    if (-not $Silent) { Read-Host "Tekan [ENTER] untuk keluar..." }
    Exit 1
}
Pop-Location

Write-Host "2. Membangun Frontend (Vite)..." -ForegroundColor Cyan
Push-Location absenta_frontend
$env:NODE_OPTIONS = "--max-old-space-size=4096"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" -ForegroundColor Red
    Write-Host " GAGAL: Kompilasi Frontend bermasalah!" -ForegroundColor Red -Bold
    Write-Host " Proses deployment dihentikan seketika untuk keamanan." -ForegroundColor Yellow
    Write-Host "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!" -ForegroundColor Red
    Pop-Location
    if (-not $Silent) { Read-Host "Tekan [ENTER] untuk keluar..." }
    Exit 1
}
Pop-Location

# ----------------------------------------------------
# LANGKAH 5: Jalankan Layanan
# ----------------------------------------------------
Show-Header "5 / 5 - Jalankan Layanan"
if ($hasPM2) {
    Write-Host "Menjalankan PM2 Mode Cluster..." -ForegroundColor Yellow
    & pm2 delete ecosystem.config.js 2>&1 | Out-Null
    & pm2 start ecosystem.config.js --update-env
    & pm2 save
} else {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd absenta_backend; npm start"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd absenta_frontend; npm run preview -- --port $FrontendPort --host 0.0.0.0"
}

Show-Header "Selesai!"
Write-Host "Project Absenta berhasil di-deploy!" -ForegroundColor Green
Write-Host "Akses URL: ${finalScheme}://$finalDomain"
if (-not $Silent) { Read-Host "Tekan [ENTER] untuk keluar..." }
