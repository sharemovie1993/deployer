# Centralized Deployment Manager (Global Deployer)
# Untuk Windows PowerShell
# Berfungsi memanggil skrip deploy internal masing-masing proyek

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "manager-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force | Out-Null

# Mengonfigurasi ExecutionPolicy agar berkas script global npm (seperti PM2) dapat berjalan
try {
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force -ErrorAction SilentlyContinue
} catch {}

function Publish-AbsentaRelease {
    Show-Header "Rilis & Publikasikan Pembaruan (CI/CD Update)"

    $ABSENTA_PATH = Resolve-Path (Join-Path $PSScriptRoot "..\Project Absenta")
    if (-not (Test-Path $ABSENTA_PATH)) {
        Write-Host "Error: Folder Project Absenta tidak ditemukan di '$ABSENTA_PATH'" -ForegroundColor Red
        return
    }

    $pkgJsonPath = Join-Path $ABSENTA_PATH "absenta_backend\package.json"
    if (-not (Test-Path $pkgJsonPath)) {
        Write-Host "Error: file package.json backend tidak ditemukan di '$pkgJsonPath'" -ForegroundColor Red
        return
    }

    # Persiapan Koneksi VPS Server Lisensi (karena dipanggil mandiri dari deploy-manager.ps1)
    Write-Host "--- Persiapan Koneksi VPS Server Lisensi ---" -ForegroundColor Yellow
    $NEW_IP = (Read-Host "Masukkan IP VPS Target [103.196.155.87]").Trim()
    if ([string]::IsNullOrWhiteSpace($NEW_IP)) { $NEW_IP = "103.196.155.87" }
    $NEW_USER = "asepsuryadi"

    Write-Host "Pilih SSH Key:"
    Write-Host " 1) nginxonly.pem"
    Write-Host " 2) ls-key.pem"
    Write-Host " 3) Input path file manual..."
    $keyChoice = Read-Host "Pilih [1-3] (Default: 2)"
    if ([string]::IsNullOrWhiteSpace($keyChoice) -or $keyChoice -eq "2") {
        $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "ls-key.pem"
    } elseif ($keyChoice -eq "1") {
        $NEW_KEY_SOURCE = Join-Path $PSScriptRoot "nginxonly.pem"
    } else {
        $NEW_KEY_SOURCE = Read-Host "Masukkan path absolut file .pem"
    }

    if (-not (Test-Path $NEW_KEY_SOURCE)) {
        Write-Host "Error: File SSH Key tidak ditemukan di '$NEW_KEY_SOURCE'" -ForegroundColor Red
        return
    }

    # Perbaiki izin akses SSH Key secara otomatis pada Windows
    Write-Host "Mengamankan izin berkas SSH Key..." -ForegroundColor Gray
    try {
        $null = icacls.exe $NEW_KEY_SOURCE /inheritance:r 2>&1
        $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $null = icacls.exe $NEW_KEY_SOURCE /grant "${currentUser}:(R,W)" 2>&1
    } catch {
        Write-Host "Peringatan: Gagal membatasi akses SSH Key secara otomatis." -ForegroundColor Yellow
    }

    # 1. Baca Versi Saat Ini
    $pkgJson = Get-Content $pkgJsonPath | ConvertFrom-Json
    $currentVer = $pkgJson.version
    Write-Host "`nVersi lokal saat ini: v$currentVer" -ForegroundColor Green

    # Auto-hitung versi patch berikutnya sebagai default
    $verParts = $currentVer -split '\.'
    $suggestedVer = "$($verParts[0]).$($verParts[1]).$([int]$verParts[2] + 1)"

    Write-Host "Saran versi berikutnya : v$suggestedVer" -ForegroundColor Yellow
    $newVer = (Read-Host "Masukkan Versi Rilis Baru [Default: $suggestedVer]").Trim()
    if ([string]::IsNullOrWhiteSpace($newVer)) { $newVer = $suggestedVer }

    # Validasi: cegah rilis ulang dengan versi yang sama
    if ($newVer -eq $currentVer) {
        Write-Host "Peringatan: Versi '$newVer' sama dengan versi lokal saat ini!" -ForegroundColor Yellow
        $confirm = (Read-Host "Lanjutkan rilis dengan versi yang sama? [y/N]").Trim().ToLower()
        if ($confirm -ne "y") {
            Write-Host "Rilis dibatalkan. Silakan masukkan nomor versi yang lebih tinggi." -ForegroundColor Red
            return
        }
    }

    $changelog = (Read-Host "Masukkan Catatan Rilis / Changelog (Contoh: Fitur presensi PKL, perbaikan minor)").Trim()
    if ([string]::IsNullOrWhiteSpace($changelog)) { $changelog = "Pembaruan rutin platform Absenta." }

    # 2. Build Frontend & Backend secara lokal
    Write-Host "`n=== [1/4] Memulai Kompilasi (Build) Lokal ===" -ForegroundColor Cyan

    Write-Host "Membangun Frontend (Vite)..." -ForegroundColor Yellow
    $frontendDir = Join-Path $ABSENTA_PATH "absenta_frontend"
    Push-Location $frontendDir
    npm run build
    Pop-Location

    Write-Host "Membangun Backend (TSC)..." -ForegroundColor Yellow
    $backendDir = Join-Path $ABSENTA_PATH "absenta_backend"
    Push-Location $backendDir
    npm run build
    Pop-Location

    # 3. Zip file build jadi
    Write-Host "`n=== [2/4] Memaketkan Hasil Kompilasi ke Zip ===" -ForegroundColor Cyan
    $tempReleaseDir = Join-Path $env:TEMP "absenta_release_package"
    if (Test-Path $tempReleaseDir) { Remove-Item -Recurse -Force $tempReleaseDir }

    New-Item -ItemType Directory -Path (Join-Path $tempReleaseDir "absenta_backend") | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $tempReleaseDir "absenta_frontend") | Out-Null

    # Salin frontend static dist
    Copy-Item -Recurse -Force (Join-Path $ABSENTA_PATH "absenta_frontend\dist") (Join-Path $tempReleaseDir "absenta_frontend\dist")

    # Salin backend tsc dist & prisma schema/migrations & package configs
    Copy-Item -Recurse -Force (Join-Path $ABSENTA_PATH "absenta_backend\dist") (Join-Path $tempReleaseDir "absenta_backend\dist")
    Copy-Item -Force (Join-Path $ABSENTA_PATH "absenta_backend\package.json") (Join-Path $tempReleaseDir "absenta_backend\package.json")
    Copy-Item -Force (Join-Path $ABSENTA_PATH "absenta_backend\package-lock.json") (Join-Path $tempReleaseDir "absenta_backend\package-lock.json")
    Copy-Item -Recurse -Force (Join-Path $ABSENTA_PATH "absenta_backend\prisma") (Join-Path $tempReleaseDir "absenta_backend\prisma")

    # Buat file zip
    $zipPath = Join-Path $env:TEMP "absenta-v$newVer.zip"
    if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
    Compress-Archive -Path "$tempReleaseDir\*" -DestinationPath $zipPath -Force
    Write-Host "Paket rilis berhasil dikompres ke: $zipPath" -ForegroundColor Green

    # 4. Unggah ke VPS
    Write-Host "`n=== [3/4] Mengunggah Paket ke Server Lisensi VPS ===" -ForegroundColor Cyan
    Write-Host "Mengirim file zip via SCP..." -ForegroundColor Yellow
    scp -i $NEW_KEY_SOURCE -o StrictHostKeyChecking=no $zipPath "${NEW_USER}@${NEW_IP}:/var/www/licensing-server/public/releases/absenta-v$newVer.zip"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Gagal mengunggah file zip ke VPS! Periksa koneksi SSH atau izin SSH Key Anda." -ForegroundColor Red
        Remove-Item -Recurse -Force $tempReleaseDir -ErrorAction SilentlyContinue
        Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
        return
    }

    # 5. Update manifest.json di VPS
    Write-Host "`n=== [4/4] Memperbarui Manifest Rilis di VPS ===" -ForegroundColor Cyan
    $manifest = [ordered]@{
      success = $true
      latest_version = $newVer
      download_url = "https://api.absenta.id/releases/absenta-v$newVer.zip"
      changelog = $changelog
      released_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    }

    $manifestJsonPath = Join-Path $env:TEMP "manifest.json"
    $escapedChangelog = $changelog.Replace("'", "\'")
    $nodeManifestCmd = "const fs = require('fs'); const file = '$manifestJsonPath'.replace(/\\/g, '/'); const manifest = { success: true, latest_version: '$newVer', download_url: 'https://api.absenta.id/releases/absenta-v$newVer.zip', changelog: '$escapedChangelog', released_at: '$( (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') )' }; fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');"
    node -e $nodeManifestCmd

    Write-Host "Mengirim file manifest.json via SCP..." -ForegroundColor Yellow
    scp -i $NEW_KEY_SOURCE -o StrictHostKeyChecking=no $manifestJsonPath "${NEW_USER}@${NEW_IP}:/var/www/licensing-server/public/releases/manifest.json"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Gagal mengunggah file manifest.json ke VPS!" -ForegroundColor Red
        Remove-Item -Recurse -Force $tempReleaseDir -ErrorAction SilentlyContinue
        Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
        Remove-Item -Force $manifestJsonPath -ErrorAction SilentlyContinue
        return
    }

    # Update package.json lokal via Node.js untuk menjaga format JSON dan quote escaping
    $nodePkgCmd = "const fs = require('fs'); const file = '$pkgJsonPath'.replace(/\\/g, '/'); let content = fs.readFileSync(file, 'utf8'); if (content.charCodeAt(0) === 0xFEFF) { content = content.slice(1); }; const pkg = JSON.parse(content); pkg.version = '$newVer'; fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8');"
    node -e $nodePkgCmd
    Write-Host "Versi lokal di package.json berhasil di-update ke v$newVer" -ForegroundColor Green

    # Clean up
    Remove-Item -Recurse -Force $tempReleaseDir
    Remove-Item -Force $zipPath
    Remove-Item -Force $manifestJsonPath

    # Commit & Push package.json ke GitHub agar deploy ulang otomatis dapat versi benar
    Write-Host "`n=== [5/5] Menyimpan Versi ke Git Repository ===" -ForegroundColor Cyan
    try {
        $backendDir = Join-Path $ABSENTA_PATH "absenta_backend"
        Push-Location $backendDir
        $gitStatus = git status --porcelain package.json 2>&1
        if ($gitStatus) {
            git add package.json | Out-Null
            git commit -m "chore(release): bump version to v$newVer" | Out-Null
            git push origin main 2>&1 | Out-Null
            Write-Host "package.json v$newVer berhasil di-commit dan di-push ke GitHub." -ForegroundColor Green
            Write-Host "   Deploy ulang via Menu 8 akan otomatis mendapatkan versi $newVer." -ForegroundColor Gray
        } else {
            Write-Host "Tidak ada perubahan package.json untuk di-commit." -ForegroundColor Yellow
        }
        Pop-Location
    } catch {
        Pop-Location -ErrorAction SilentlyContinue
        Write-Host "Gagal push ke GitHub: $_" -ForegroundColor Yellow
        Write-Host "   Lakukan 'git push' manual dari folder absenta_backend jika diperlukan." -ForegroundColor Gray
    }

    Write-Host "`nRilis v$newVer Berhasil Dipublikasikan ke Server Lisensi!" -ForegroundColor Green
    Write-Host "Sekarang seluruh server sekolah dapat mendeteksi dan mengunduh update ini secara otomatis." -ForegroundColor Gray
}


# Registrasi Seluruh Repositori Proyek dari GitHub Anda
$PROJECTS = @(
    @{
        ID = 1
        Name = "Project Yatim (Mustahiq Care)"
        RepoUrl = "https://github.com/sharemovie1993/Project-Yatim.git"
        DefaultDir = "C:\apps\project-yatim"
        HasDeployScript = $true
        HasQuickUpdate = $false
    },
    @{
        ID = 2
        Name = "Project Absenta (Full Stack)"
        RepoUrl = "https://github.com/sharemovie1993/Project-Absenta.git"
        DefaultDir = "C:\apps\project-absenta"
        HasDeployScript = $true
        HasQuickUpdate = $true
    },
    @{
        ID = 3
        Name = "Gform Scheduller (Orkestrasi Jadwal)"
        RepoUrl = "https://github.com/sharemovie1993/Project-Gform-Scheduller.git"
        DefaultDir = "C:\apps\gform-scheduller"
        HasDeployScript = $true
        HasQuickUpdate = $false
    },
    @{
        ID = 4
        Name = "gform-orkestrator"
        RepoUrl = "https://github.com/sharemovie1993/gform-orkestrator.git"
        DefaultDir = "C:\apps\gform-orkestrator"
        HasDeployScript = $false
        HasQuickUpdate = $false
    },
    @{
        ID = 5
        Name = "Project-POS"
        RepoUrl = "https://github.com/sharemovie1993/Project-POS.git"
        DefaultDir = "C:\apps\project-pos"
        HasDeployScript = $false
        HasQuickUpdate = $false
    },
    @{
        ID = 6
        Name = "Caddy Gateway (Automatic HTTPS and Reverse Proxy)"
        RepoUrl = ""
        DefaultDir = "C:\Users\SERVER-DELL\Documents\deployer\caddy-setup"
        HasDeployScript = $true
        HasQuickUpdate = $false
    },
    @{
        ID = 7
        Name = "Server Lisensi (Licensing Server VPS)"
        RepoUrl = "https://github.com/sharemovie1993/server-lisensi.git"
        DefaultDir = "C:\Users\SERVER-DELL\Documents\Project-Server-Lisensi"
        HasDeployScript = $true
        HasQuickUpdate = $false
    }
)


function Show-Header {
    param ($Title)
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "                  GLOBAL DEPLOYMENT MANAGER (DEPLOYER)                    " -ForegroundColor Yellow
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " [Menu] $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

function Wait-Key {
    Write-Host ""
    Read-Host "Tekan [ENTER] untuk kembali ke menu utama..."
}

while ($true) {
    Show-Header "Menu Utama"
    Write-Host " 🚀 [DEPLOYMENT & UPDATES]" -ForegroundColor Cyan
    Write-Host "   1) Deploy Proyek Lokal (Windows On-Premise / LAN)"
    Write-Host "   2) CI/CD Quick Update (Rilis, Pull dan Build)"
    Write-Host "   3) Deploy Proyek Remote (Linux VPS / Cloud)"
    Write-Host "   4) Migrasi Server Lisensi (VPS Lama ke VPS Baru)"
    Write-Host ""
    Write-Host " 🛠️ [SERVER MAINTENANCE & UTILITIES]" -ForegroundColor Cyan
    Write-Host "   5) Manajemen Layanan PM2 (Global)"
    Write-Host "   6) Server Hardening (Firewall, Fail2Ban, Keamanan SSH)"
    Write-Host "   7) Setup SWAP Space 4GB Linux (Remote)"
    Write-Host "   8) Perluas Partisi Disk Linux VM/VPS (Remote)"
    Write-Host "   9) Daftarkan SSH Key nginxonly.pem ke VPS (Remote)"
    Write-Host "  12) Kernel & System Tuning Produksi Absenta (Remote)"
    Write-Host "  13) 🔧 Perbaikan & Pembersihan Terowongan Easy Tunnel (Remote)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host " 🚨 [EMERGENCY & CLEANUP]" -ForegroundColor Cyan
    Write-Host "   10) Kill Semua Proses Node.js (Emergency)"
    Write-Host "   11) Factory Reset VPS Baru (Purge Kertas Kosong)"
    Write-Host ""
    Write-Host " 🚪 [EXIT]" -ForegroundColor Cyan
    Write-Host "   0) Keluar"
    Write-Host "==========================================================================" -ForegroundColor Cyan
    $choice = Read-Host "Pilih opsi [0-13]"

    switch ($choice) {
        "1" {
            Show-Header "Pilih Proyek Yang Ingin Di-deploy"
            foreach ($p in $PROJECTS) {
                $statusText = if ($p.HasDeployScript) { "[Deploy Script Tersedia]" } else { "[Deploy Script Belum Ada]" }
                $color = if ($p.HasDeployScript) { "Green" } else { "Gray" }
                Write-Host -NoNewline " $($p.ID)) $($p.Name) " -ForegroundColor White
                Write-Host $statusText -ForegroundColor $color
                Write-Host "    Repo: $($p.RepoUrl)" -ForegroundColor Gray
            }
            Write-Host ""
            $projId = Read-Host "Pilih nomor proyek"
            $selectedProj = $PROJECTS | Where-Object { $_.ID -eq $projId }

            if ($null -eq $selectedProj) {
                Write-Host "Nomor proyek tidak valid!" -ForegroundColor Red
                Wait-Key
                continue
            }

            # Validasi ketersediaan skrip deploy internal
            if (-not $selectedProj.HasDeployScript) {
                Write-Host ""
                Write-Host "Peringatan: Proyek '$($selectedProj.Name)' belum dikonfigurasi dengan skrip deploy internal." -ForegroundColor Yellow
                Wait-Key
                continue
            }

            Show-Header "Konfigurasi Target - $($selectedProj.Name)"
            $installDir = Read-Host "Masukkan folder target deployment [$($selectedProj.DefaultDir)]"
            if ([string]::IsNullOrWhiteSpace($installDir)) { $installDir = $selectedProj.DefaultDir }
            $installDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($installDir)

            Write-Host ""
            Write-Host "--- RINGKASAN DEPLOYMENT ---" -ForegroundColor Yellow
            Write-Host " - Proyek       : $($selectedProj.Name)"
            Write-Host " - Folder Target: $installDir"
            Write-Host " - Aksi         : Clone dan Panggil Skrip Deploy Internal"
            Write-Host "----------------------------" -ForegroundColor Yellow
            Write-Host ""
            $confirm = Read-Host "Mulai proses deployment? [Y/n]"
            if ($confirm -eq "n" -or $confirm -eq "N") {
                Write-Host "Deployment dibatalkan." -ForegroundColor Red
                Wait-Key
                continue
            }

            Show-Header "Sedang Memproses - $($selectedProj.Name)"

            # Cek Git
            Write-Host "Memeriksa Git... " -NoNewline
            $hasGit = $false
            try {
                git --version | Out-Null
                Write-Host "OK" -ForegroundColor Green
                $hasGit = $true
            } catch {
                Write-Host "BELUM TERPASANG" -ForegroundColor Yellow
                $hasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
                if ($hasWinget) {
                    Write-Host "Sistem mendeteksi Windows Package Manager (winget) tersedia." -ForegroundColor Cyan
                    Write-Host "Apakah Anda ingin memasang Git secara otomatis?"
                    Write-Host "Tekan [Y] untuk memasang Git, atau tombol lain untuk melewatinya."
                    $gitKey = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
                    if ($gitKey.Character -eq 'y' -or $gitKey.Character -eq 'Y') {
                        Write-Host "Memulai pemasangan Git... Mohon tunggu..." -ForegroundColor Cyan
                        Start-Process winget -ArgumentList "install Git.Git --silent --accept-package-agreements --accept-source-agreements" -Wait
                        try {
                            git --version | Out-Null
                            Write-Host "Git berhasil terpasang!" -ForegroundColor Green
                            $hasGit = $true
                        } catch {
                            Write-Host "Pemasangan selesai. Anda perlu membuka kembali terminal baru untuk menjalankan perintah git." -ForegroundColor Yellow
                            $hasGit = $true
                        }
                    }
                }

                if (-not $hasGit) {
                    Write-Host "Git harus terpasang di sistem untuk mengunduh kode!" -ForegroundColor Red
                    Wait-Key
                    continue
                }
            }

            # Clone / Pull Kode
            if ($selectedProj.RepoUrl) {
                $shouldClone = $true
                $isTargetDirExists = Test-Path $installDir

                if ($isTargetDirExists) {
                    $isGitRepo = Test-Path "$installDir\.git"
                    if ($isGitRepo) {
                        $shouldClone = $false
                        Write-Host "Folder target sudah ada dan merupakan repositori Git. Memperbarui kode via git pull..." -ForegroundColor Yellow
                        Push-Location $installDir
                        try {
                            $targetBranch = "main"
                            if ($selectedProj.Branch) { $targetBranch = $selectedProj.Branch }
                            git fetch origin
                            if ($LASTEXITCODE -ne 0) { throw "Gagal melakukan git fetch" }
                            git checkout $targetBranch
                            if ($LASTEXITCODE -ne 0) { throw "Gagal melakukan git checkout" }
                            git reset --hard origin/$targetBranch
                            if ($LASTEXITCODE -ne 0) { throw "Gagal melakukan git reset" }
                            Write-Host "Kode berhasil diperbarui ke versi terbaru!" -ForegroundColor Green
                        } catch {
                            Write-Host "Gagal melakukan pembaruan git: $_" -ForegroundColor Red
                            Pop-Location
                            Wait-Key
                            continue
                        }
                        Pop-Location
                    } else {
                        # Exists but not a git repo
                        Write-Host "Folder target sudah ada tetapi BUKAN repositori Git yang valid." -ForegroundColor Yellow
                        $cleanConfirm = Read-Host "Apakah Anda ingin menghapus isi folder tersebut untuk melakukan clone baru? [y/N]"
                        if ($cleanConfirm -eq "y" -or $cleanConfirm -eq "Y") {
                            Write-Host "Membersihkan folder target..." -ForegroundColor Yellow
                            Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
                        } else {
                            Write-Host "Deployment dibatalkan karena folder target tidak kosong dan bukan repositori Git." -ForegroundColor Red
                            Wait-Key
                            continue
                        }
                    }
                }

                if ($shouldClone) {
                    Write-Host "Melakukan git clone ke folder target..." -ForegroundColor Yellow
                    if (-not (Test-Path $installDir)) {
                        New-Item -ItemType Directory -Force -Path $installDir | Out-Null
                    }
                    try {
                        $targetBranch = "main"
                        if ($selectedProj.Branch) { $targetBranch = $selectedProj.Branch }
                        git clone -b $targetBranch --depth 1 $selectedProj.RepoUrl $installDir
                        if ($LASTEXITCODE -ne 0) { throw "Gagal melakukan git clone" }
                        Write-Host "Clone sukses!" -ForegroundColor Green
                    } catch {
                        Write-Host "Gagal mengkloning repositori dari GitHub: $_" -ForegroundColor Red
                        Wait-Key
                        continue
                    }
                }
            }

            # Panggil skrip deploy internal proyek (mendukung deploy-onprem-windows.ps1 dan fallback deploy.ps1)
            $scriptName = "deploy-onprem-windows.ps1"
            if (-not (Test-Path -Path "$installDir\$scriptName")) {
                if (Test-Path -Path "$installDir\deploy.ps1") {
                    $scriptName = "deploy.ps1"
                } else {
                    $scriptName = ""
                }
            }

            Write-Host ""
            if ($scriptName) {
                Write-Host "Menjalankan skrip deploy internal ($scriptName) pada proyek target..." -ForegroundColor Cyan
                Push-Location $installDir
                try {
                    # Salin Caddy.exe offline jika tersedia ke folder target
                    $localCaddyExe = Join-Path $PSScriptRoot "caddy-bin\caddy.exe"
                    if (Test-Path $localCaddyExe) {
                        Write-Host "Menyalin Caddy.exe offline lokal ke folder target..." -ForegroundColor Cyan
                        try {
                            Copy-Item -Path $localCaddyExe -Destination $installDir -Force -ErrorAction SilentlyContinue
                        } catch {
                            Write-Host "Catatan: caddy.exe sedang aktif dan tidak dapat ditimpa (diabaikan)." -ForegroundColor Gray
                        }
                    }

                    # Jalankan dengan RunAs Administrator agar Caddy bisa install service dan trust certificate
                    $deployCmd = "Push-Location '$installDir'; & powershell -NoProfile -ExecutionPolicy Bypass -File .\$scriptName; Pop-Location; Read-Host 'Selesai. Tekan ENTER...'"
                    Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $deployCmd -Verb RunAs -Wait
                    Write-Host ""
                    Write-Host "Deployment internal proyek selesai dengan sukses!" -ForegroundColor Green

                    # ============================================================
                    # SETUP PM2 WINDOWS SERVICE (Auto-Start setelah Reboot)
                    # ============================================================
                    Write-Host ""
                    Write-Host "--- Setup PM2 Windows Service (Auto-Start setelah Reboot) ---" -ForegroundColor Cyan
                    $hasPm2 = $null -ne (Get-Command pm2 -ErrorAction SilentlyContinue)
                    if ($hasPm2) {
                        try {
                            # Cek apakah pm2-startup sudah terpasang
                            $pm2StartupInstalled = $null -ne (Get-Command pm2-startup -ErrorAction SilentlyContinue)
                            if (-not $pm2StartupInstalled) {
                                Write-Host "Memasang pm2-startup untuk Windows Service..." -ForegroundColor Yellow
                                & npm install -g pm2-startup
                            }

                            # Install PM2 sebagai Windows Service
                            Write-Host "Mendaftarkan PM2 sebagai Windows Service..." -ForegroundColor Yellow
                            $pm2StartupCmd = "pm2-startup install; pm2 save"
                            Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $pm2StartupCmd -Verb RunAs -Wait
                            Write-Host "PM2 Windows Service berhasil didaftarkan!" -ForegroundColor Green
                            Write-Host "Layanan PM2 akan otomatis berjalan kembali setelah Windows server di-reboot." -ForegroundColor Gray
                        } catch {
                            Write-Host "Peringatan: Gagal mendaftarkan PM2 sebagai Windows Service: $_" -ForegroundColor Yellow
                            Write-Host "Anda dapat mendaftarkannya secara manual dengan perintah:" -ForegroundColor Gray
                            Write-Host "  npm install -g pm2-startup && pm2-startup install && pm2 save" -ForegroundColor Gray
                        }
                    } else {
                        Write-Host "Peringatan: PM2 tidak ditemukan. Lewati setup Windows Service." -ForegroundColor Yellow
                    }

                } catch {
                    Write-Host ""
                    Write-Host "Terjadi kesalahan saat menjalankan skrip deploy internal proyek." -ForegroundColor Red
                }
            } else {
                Write-Host "Error: File deploy-onprem-windows.ps1 tidak ditemukan di dalam proyek target!" -ForegroundColor Red
            }
            Pop-Location

            Wait-Key
        }

        "2" {
            Show-Header "Pilih Target atau Jenis Quick Update"
            Write-Host " 1) CI/CD Update (Rilis dan Publikasikan Pembaruan ke Server Lisensi)" -ForegroundColor White
            Write-Host " 2) Windows Lokal (Pull dan Build)" -ForegroundColor White
            Write-Host " 3) VPS Linux Remote (Pull dan Build)" -ForegroundColor White
            Write-Host " 4) Update Base Domain Easy-Tunnel dan Lisensi Server (Remote)" -ForegroundColor White
            Write-Host " 0) Batal" -ForegroundColor White
            Write-Host ""
            $target = Read-Host "Pilih opsi [0-4]"

            if ($target -eq "1") {
                Publish-AbsentaRelease
                Wait-Key
            }
            elseif ($target -eq "2") {
                Show-Header "Pilih Proyek Untuk Quick Update Lokal"
                $quickProjects = $PROJECTS | Where-Object { $_.HasQuickUpdate -eq $true }

                if ($quickProjects.Count -eq 0) {
                    Write-Host "Belum ada proyek yang mendukung Quick Update." -ForegroundColor Yellow
                    Wait-Key
                    continue
                }

                foreach ($p in $quickProjects) {
                    Write-Host " $($p.ID)) $($p.Name)" -ForegroundColor White
                }
                Write-Host ""
                $projId = Read-Host "Pilih nomor proyek"
                $selectedProj = $quickProjects | Where-Object { $_.ID -eq $projId }

                if ($null -eq $selectedProj) {
                    Write-Host "Nomor proyek tidak valid!" -ForegroundColor Red
                    Wait-Key
                    continue
                }

                $installDir = $selectedProj.DefaultDir
                if (-not (Test-Path $installDir)) {
                    Write-Host "Folder proyek $installDir tidak ditemukan! Lakukan Full Wizard dulu." -ForegroundColor Red
                    Wait-Key
                    continue
                }

                Write-Host "Memulai Quick Update untuk $($selectedProj.Name)..." -ForegroundColor Cyan
                Push-Location $installDir

                # Pull kode terbaru terlebih dahulu agar script quick-update.ps1 versi terbaru dimuat ke memori
                Write-Host "Menarik kode terbaru dari GitHub..." -ForegroundColor Yellow
                try {
                    $targetBranch = "main"
                    if ($selectedProj.Branch) { $targetBranch = $selectedProj.Branch }
                    git fetch origin $targetBranch
                    git checkout $targetBranch
                    git reset --hard origin/$targetBranch
                    Write-Host "Kode berhasil diperbarui!" -ForegroundColor Green
                } catch {
                    Write-Host "Gagal memperbarui kode repositori sebelum menjalankan update cepat." -ForegroundColor Red
                    Pop-Location
                    Wait-Key
                    continue
                }

                if (Test-Path "quick-update.ps1") {
                    try {
                        & powershell -NoProfile -ExecutionPolicy Bypass -File .\quick-update.ps1
                    } catch {
                        Write-Host "Terjadi kesalahan saat menjalankan quick-update.ps1." -ForegroundColor Red
                    }
                } else {
                    Write-Host "Error: File quick-update.ps1 tidak ditemukan!" -ForegroundColor Red
                }
                Pop-Location
                Wait-Key
            }
            elseif ($target -eq "3") {
                # Panggil skrip quick update remote
                & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "easy-update-remote.ps1")
            }
            elseif ($target -eq "4") {
                # Panggil skrip quick update config remote
                & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "easy-update-config.ps1")
            }
        }

        "5" {
            Show-Header "Pilih Target Manajemen PM2"
            Write-Host " 1) Windows Lokal" -ForegroundColor White
            Write-Host " 2) VPS Linux Remote" -ForegroundColor White
            Write-Host " 0) Batal" -ForegroundColor White
            Write-Host ""
            $pm2Target = Read-Host "Pilih target [0-2]"

            if ($pm2Target -eq "1") {
                while ($true) {
                    Show-Header "Manajemen Layanan PM2 (Lokal)"
                    $pm2Path = Get-Command pm2 -ErrorAction SilentlyContinue
                    if (-not $pm2Path) {
                        Write-Host "PM2 tidak terpasang di sistem ini." -ForegroundColor Red
                        Wait-Key
                        break
                    }

                    Write-Host "--- Status Saat Ini ---" -ForegroundColor Yellow
                    & pm2 status
                    Write-Host ""
                    Write-Host "Opsi Manajemen:"
                    Write-Host " 1) Refresh atau Lihat Status Terbaru"
                    Write-Host " 2) Restart Semua Layanan (Restart All)"
                    Write-Host " 3) Stop Semua Layanan (Stop All)"
                    Write-Host " 4) Simpan Konfigurasi Saat Ini (PM2 Save)"
                    Write-Host " 5) Bersihkan Log (Flush Logs)"
                    Write-Host " 6) Matikan PM2 Daemon (PM2 Kill)"
                    Write-Host " 7) Lihat Log Aplikasi (Real-time)"
                    Write-Host " 0) Kembali ke Target Selection"
                    Write-Host ""
                    $pm2Choice = Read-Host "Pilih aksi [0-7]"

                    switch ($pm2Choice) {
                        "1" { continue }
                        "2" { & pm2 restart all; Write-Host "Semua layanan berhasil di-restart." -ForegroundColor Green; Start-Sleep -Seconds 2 }
                        "3" { & pm2 stop all; Write-Host "Semua layanan berhasil dihentikan." -ForegroundColor Green; Start-Sleep -Seconds 2 }
                        "4" { & pm2 save; Write-Host "Konfigurasi PM2 berhasil disimpan." -ForegroundColor Green; Start-Sleep -Seconds 2 }
                        "5" { & pm2 flush; Write-Host "Semua log berhasil dibersihkan." -ForegroundColor Green; Start-Sleep -Seconds 2 }
                        "6" {
                            $confirmKill = Read-Host "Anda yakin ingin mematikan daemon PM2? (Layanan akan mati total) [y/N]"
                            if ($confirmKill -eq 'y' -or $confirmKill -eq 'Y') {
                                & pm2 kill
                                Write-Host "PM2 Daemon berhasil dimatikan." -ForegroundColor Green
                                Start-Sleep -Seconds 2
                                break
                            }
                        }
                        "7" {
                            Show-Header "Pilih Log Aplikasi"
                            Write-Host " 1) Lihat SEMUA Log (Gabungan)"
                            Write-Host " 2) Pilih Aplikasi Spesifik"
                            Write-Host " 0) Batal"
                            $logChoice = Read-Host "Pilih [0-2]"

                            if ($logChoice -eq "1") {
                                Write-Host "Menampilkan semua log (Tekan Ctrl+C untuk berhenti)..." -ForegroundColor Cyan
                                & pm2 logs
                            } elseif ($logChoice -eq "2") {
                                & pm2 status
                                $appName = Read-Host "Masukkan NAMA atau ID aplikasi (misal: absenta-backend:3003)"
                                if (-not [string]::IsNullOrWhiteSpace($appName)) {
                                    Write-Host "Menampilkan log untuk '$appName' (Tekan Ctrl+C untuk berhenti)..." -ForegroundColor Cyan
                                    & pm2 logs $appName --lines 50
                                }
                            }
                        }
                        "0" { break }
                    }
                }
            } elseif ($pm2Target -eq "2") {
                Show-Header "Manajemen PM2 Remote VPS"
                Write-Host "Masukkan IP VPS Target [10.10.10.163]: " -NoNewline
                $ip = (Read-Host).Trim()
                if ([string]::IsNullOrWhiteSpace($ip)) { $ip = "10.10.10.163" }

                Write-Host "Masukkan Username [asepsuryadi]: " -NoNewline
                $user = (Read-Host).Trim()
                if ([string]::IsNullOrWhiteSpace($user)) { $user = "asepsuryadi" }

                Write-Host "Pilih SSH Key:"
                Write-Host " 1) nginxonly.pem"
                Write-Host " 2) ls-key.pem"
                Write-Host " 3) Manual..."
                $keyChoice = Read-Host "Pilih [1]"
                if ([string]::IsNullOrWhiteSpace($keyChoice) -or $keyChoice -eq "1") {
                    $keyPath = Join-Path $PSScriptRoot "nginxonly.pem"
                } elseif ($keyChoice -eq "2") {
                    $keyPath = Join-Path $PSScriptRoot "ls-key.pem"
                } else {
                    $keyPath = Read-Host "Masukkan path file .pem"
                }

                if (-not (Test-Path $keyPath)) {
                    Write-Host "File SSH Key tidak ditemukan!" -ForegroundColor Red
                    Wait-Key
                    return
                }

                while ($true) {
                    Show-Header "Manajemen Layanan PM2 (Remote VPS: $ip)"
                    Write-Host "--- Status Saat Ini di VPS ---" -ForegroundColor Yellow
                    & ssh -i "$keyPath" -o StrictHostKeyChecking=no "${user}@${ip}" "pm2 status"
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "Gagal terhubung ke VPS target atau PM2 tidak terpasang di VPS." -ForegroundColor Red
                        Wait-Key
                        break
                    }

                    Write-Host ""
                    Write-Host "Opsi Manajemen Remote:"
                    Write-Host " 1) Refresh atau Lihat Status Terbaru"
                    Write-Host " 2) Restart Semua Layanan (Restart All)"
                    Write-Host " 3) Stop Semua Layanan (Stop All)"
                    Write-Host " 4) Simpan Konfigurasi PM2 (PM2 Save)"
                    Write-Host " 5) Bersihkan Log Remote (Flush Logs)"
                    Write-Host " 6) Matikan PM2 Daemon Remote (PM2 Kill)"
                    Write-Host " 7) Lihat Log Aplikasi Remote (Real-time)"
                    Write-Host " 0) Kembali ke Target Selection"
                    Write-Host ""
                    $remoteChoice = Read-Host "Pilih aksi [0-7]"

                    if ($remoteChoice -eq "0") { break }
                    elseif ($remoteChoice -eq "1") { continue }
                    elseif ($remoteChoice -eq "2") {
                        & ssh -i "$keyPath" -o StrictHostKeyChecking=no "${user}@${ip}" "pm2 restart all"
                        Write-Host "Semua layanan remote berhasil di-restart." -ForegroundColor Green
                        Start-Sleep -Seconds 2
                    }
                    elseif ($remoteChoice -eq "3") {
                        & ssh -i "$keyPath" -o StrictHostKeyChecking=no "${user}@${ip}" "pm2 stop all"
                        Write-Host "Semua layanan remote berhasil dihentikan." -ForegroundColor Green
                        Start-Sleep -Seconds 2
                    }
                    elseif ($remoteChoice -eq "4") {
                        & ssh -i "$keyPath" -o StrictHostKeyChecking=no "${user}@${ip}" "pm2 save"
                        Write-Host "Konfigurasi PM2 remote berhasil disimpan." -ForegroundColor Green
                        Start-Sleep -Seconds 2
                    }
                    elseif ($remoteChoice -eq "5") {
                        & ssh -i "$keyPath" -o StrictHostKeyChecking=no "${user}@${ip}" "pm2 flush"
                        Write-Host "Semua log remote berhasil dibersihkan." -ForegroundColor Green
                        Start-Sleep -Seconds 2
                    }
                    elseif ($remoteChoice -eq "6") {
                        $confirmKill = Read-Host "Anda yakin ingin mematikan daemon PM2 remote? [y/N]"
                        if ($confirmKill -eq 'y' -or $confirmKill -eq 'Y') {
                            & ssh -i "$keyPath" -o StrictHostKeyChecking=no "${user}@${ip}" "pm2 kill"
                            Write-Host "PM2 Daemon remote berhasil dimatikan." -ForegroundColor Green
                            Start-Sleep -Seconds 2
                        }
                    }
                    elseif ($remoteChoice -eq "7") {
                        Show-Header "Pilih Log Aplikasi Remote"
                        Write-Host " 1) Lihat SEMUA Log (Gabungan)"
                        Write-Host " 2) Lihat Log Aplikasi Spesifik"
                        Write-Host " 0) Batal"
                        $logChoice = Read-Host "Pilih [0-2]"

                        if ($logChoice -eq "1") {
                            Write-Host "Membuka log remote (Tekan Ctrl+C untuk berhenti)..." -ForegroundColor Cyan
                            & ssh -i "$keyPath" -o StrictHostKeyChecking=no "${user}@${ip}" "pm2 logs"
                        } elseif ($logChoice -eq "2") {
                            $appName = Read-Host "Masukkan nama/ID aplikasi remote (contoh: absenta-backend:3003)"
                            if (-not [string]::IsNullOrWhiteSpace($appName)) {
                                Write-Host "Membuka log aplikasi '$appName' (Tekan Ctrl+C untuk berhenti)..." -ForegroundColor Cyan
                                & ssh -i "$keyPath" -o StrictHostKeyChecking=no "${user}@${ip}" "pm2 logs $appName"
                            }
                        }
                    }
                }
            }
        }

        "10" {
            Show-Header "Emergency Kill Node.js"
            Write-Host "PERINGATAN: Ini akan mematikan paksa SEMUA proses Node.js yang berjalan di Windows." -ForegroundColor Red
            $confirmNodeKill = Read-Host "Apakah Anda yakin? [y/N]"
            if ($confirmNodeKill -eq 'y' -or $confirmNodeKill -eq 'Y') {
                Write-Host "Menghentikan semua proses node.exe..." -ForegroundColor Cyan
                try {
                    taskkill /F /IM node.exe /T 2>&1 | Out-Null
                    Write-Host "Berhasil: Semua proses Node.js telah dihentikan." -ForegroundColor Green
                } catch {
                    Write-Host "Informasi: Tidak ada proses Node.js yang ditemukan atau gagal dihentikan." -ForegroundColor Gray
                }

                # Juga tawarkan untuk mematikan PM2 jika masih ada
                $killPM2Too = Read-Host "Matikan PM2 Daemon juga? [y/N]"
                if ($killPM2Too -eq 'y' -or $killPM2Too -eq 'Y') {
                    try {
                        $oldPref = $ErrorActionPreference
                        $ErrorActionPreference = 'SilentlyContinue'
                        & pm2 kill 2>&1 | Out-Null
                        Write-Host "PM2 Daemon dimatikan." -ForegroundColor Green
                    } catch {
                        Write-Host "Informasi: PM2 Daemon sudah tidak aktif." -ForegroundColor Gray
                    } finally {
                        $ErrorActionPreference = $oldPref
                    }
                }
            } else {
                Write-Host "Aksi dibatalkan." -ForegroundColor Gray
            }
            Wait-Key
        }

        "0" {
            Write-Host "Keluar dari program. Terima kasih." -ForegroundColor Cyan
            Stop-Transcript
            Exit
        }
        "4" {
            $migrateScript = Join-Path $PSScriptRoot "easy-migrate.ps1"
            if (Test-Path $migrateScript) {
                try {
                    & $migrateScript
                } catch {
                    Write-Host "[ERROR] Gagal menjalankan easy-migrate: $_" -ForegroundColor Red
                    Wait-Key
                }
            } else {
                Write-Host "Script easy-migrate.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "11" {
            $purgeScript = Join-Path $PSScriptRoot "easy-purge.ps1"
            if (Test-Path $purgeScript) {
                try {
                    & $purgeScript
                } catch {
                    Write-Host "[ERROR] Gagal menjalankan easy-purge: $_" -ForegroundColor Red
                    Wait-Key
                }
            } else {
                Write-Host "Script easy-purge.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "3" {
            while ($true) {
                Show-Header "Deploy Proyek Remote (Linux VPS)"
                Write-Host " 1) Server Lisensi (Licensing Server)" -ForegroundColor White
                Write-Host " 2) Project Absenta (Full Stack)" -ForegroundColor White
                Write-Host " 3) Proyek Umum Lainnya (POS, Yatim, gform, dll.)" -ForegroundColor White
                Write-Host " 0) Kembali ke Menu Utama" -ForegroundColor White
                Write-Host ""
                $subChoice = Read-Host "Pilih opsi [0-3]"

                if ($subChoice -eq "0") {
                    break
                }
                elseif ($subChoice -eq "1") {
                    $script = Join-Path $PSScriptRoot "deploy-licensing-remote.ps1"
                    if (Test-Path $script) {
                        try { & $script } catch { Write-Host "[ERROR] $_" -ForegroundColor Red; Wait-Key }
                    } else {
                        Write-Host "Script deploy-licensing-remote.ps1 tidak ditemukan!" -ForegroundColor Red; Wait-Key
                    }
                    break
                }
                elseif ($subChoice -eq "2") {
                    $script = Join-Path $PSScriptRoot "deploy-absenta-remote.ps1"
                    if (Test-Path $script) {
                        try { & $script } catch { Write-Host "[ERROR] $_" -ForegroundColor Red; Wait-Key }
                    } else {
                        Write-Host "Script deploy-absenta-remote.ps1 tidak ditemukan!" -ForegroundColor Red; Wait-Key
                    }
                    break
                }
                elseif ($subChoice -eq "3") {
                    $script = Join-Path $PSScriptRoot "deploy-general-remote.ps1"
                    if (Test-Path $script) {
                        try { & $script } catch { Write-Host "[ERROR] $_" -ForegroundColor Red; Wait-Key }
                    } else {
                        Write-Host "Script deploy-general-remote.ps1 tidak ditemukan!" -ForegroundColor Red; Wait-Key
                    }
                    break
                }
            }
        }
        "6" {
            $hardeningScript = Join-Path $PSScriptRoot "easy-hardening.ps1"
            if (Test-Path $hardeningScript) {
                try {
                    & $hardeningScript
                } catch {
                    Write-Host "[ERROR] Gagal menjalankan easy-hardening: $_" -ForegroundColor Red
                    Wait-Key
                }
            } else {
                Write-Host "Script easy-hardening.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "7" {
            $swapScript = Join-Path $PSScriptRoot "easy-swap.ps1"
            if (Test-Path $swapScript) {
                try {
                    & $swapScript
                } catch {
                    Write-Host "[ERROR] Gagal menjalankan easy-swap: $_" -ForegroundColor Red
                    Wait-Key
                }
            } else {
                Write-Host "Script easy-swap.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "8" {
            $resizeScript = Join-Path $PSScriptRoot "easy-resize.ps1"
            if (Test-Path $resizeScript) {
                try {
                    & $resizeScript
                } catch {
                    Write-Host "[ERROR] Gagal menjalankan easy-resize: $_" -ForegroundColor Red
                    Wait-Key
                }
            } else {
                Write-Host "Script easy-resize.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "9" {
            $sshSetupScript = Join-Path $PSScriptRoot "easy-setup-ssh.ps1"
            if (Test-Path $sshSetupScript) {
                try {
                    & $sshSetupScript
                } catch {
                    Write-Host "[ERROR] Gagal menjalankan easy-setup-ssh: $_" -ForegroundColor Red
                    Wait-Key
                }
            } else {
                Write-Host "Script easy-setup-ssh.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "12" {
            $tuningScript = Join-Path $PSScriptRoot "easy-tuning.ps1"
            if (Test-Path $tuningScript) {
                try {
                    & $tuningScript
                } catch {
                    Write-Host "[ERROR] Gagal menjalankan easy-tuning: $_" -ForegroundColor Red
                    Wait-Key
                }
            } else {
                Write-Host "Script easy-tuning.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "13" {
            $tunnelFixScript = Join-Path $PSScriptRoot "easy-tunnel-fix.ps1"
            if (Test-Path $tunnelFixScript) {
                try {
                    & $tunnelFixScript
                } catch {
                    Write-Host "[ERROR] Gagal menjalankan easy-tunnel-fix: $_" -ForegroundColor Red
                    Wait-Key
                }
            } else {
                Write-Host "Script easy-tunnel-fix.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        default {
            Write-Host "Pilihan tidak valid!" -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
}
