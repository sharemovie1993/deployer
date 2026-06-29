# Centralized Deployment Manager (Global Deployer)
# Untuk Windows PowerShell
# Berfungsi memanggil skrip deploy internal masing-masing proyek

$ErrorActionPreference = "Stop"

$LOG_FILE = "$PSScriptRoot\manager-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force | Out-Null

# Mengonfigurasi ExecutionPolicy agar berkas script global npm (seperti PM2) dapat berjalan
try {
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force -ErrorAction SilentlyContinue
} catch {}


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
        Name = "Caddy Gateway (Automated SSL & Reverse Proxy)"
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
    Write-Host "                  GLOBAL DEPLOYMENT MANAGER (DEPLOYER)                    " -ForegroundColor Yellow -Bold
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
    Write-Host " 1) Deploy / Update Proyek (Full Wizard)"
    Write-Host " 2) Quick Update (Hanya Pull & Build - Tanpa Wizard)"
    Write-Host " 3) Manajemen Layanan PM2 (Global)"
    Write-Host " 4) Kill Semua Proses Node.js (Emergency)"
    Write-Host " 5) Keluar"
    Write-Host " 6) Easy-Migrate Server Lisensi (VPS Lama ke VPS Baru)"
    Write-Host " 7) Factory Reset VPS Baru (Kertas Kosong / Purge)"
    Write-Host " 8) Deploy Cabang Baru (Tenant Server & Domain Baru)"
    Write-Host " 9) Server Hardening (Firewall, Fail2Ban, Keamanan SSH)"
    Write-Host " 10) Setup SWAP Space 4GB Linux (Remote)"
    Write-Host " 11) Perluas Partisi Disk Linux VM/VPS (Remote)"
    Write-Host "==========================================================================" -ForegroundColor Cyan
    $choice = Read-Host "Pilih opsi [1-11]"

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

            Write-Host ""
            Write-Host "--- RINGKASAN DEPLOYMENT ---" -ForegroundColor Yellow
            Write-Host " - Proyek       : $($selectedProj.Name)"
            Write-Host " - Folder Target: $installDir"
            Write-Host " - Aksi         : Clone & Panggil Skrip Deploy Internal"
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
                            git fetch origin
                            if ($LASTEXITCODE -ne 0) { throw "Gagal melakukan git fetch" }
                            git reset --hard origin/main
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
                        git clone --depth 1 $selectedProj.RepoUrl $installDir
                        if ($LASTEXITCODE -ne 0) { throw "Gagal melakukan git clone" }
                        Write-Host "Clone sukses!" -ForegroundColor Green
                    } catch {
                        Write-Host "Gagal mengkloning repositori dari GitHub: $_" -ForegroundColor Red
                        Wait-Key
                        continue
                    }
                }
            }

            # Panggil skrip deploy internal proyek
            Write-Host ""
            Write-Host "Menjalankan skrip deploy internal (deploy.ps1) pada proyek target..." -ForegroundColor Cyan
            Push-Location $installDir
            if (Test-Path "deploy.ps1") {
                try {
                    # Jalankan dengan RunAs Administrator agar Caddy bisa install service & trust certificate
                    $deployCmd = "Push-Location '$installDir'; & powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1; Pop-Location; Read-Host 'Selesai. Tekan ENTER...'"
                    Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $deployCmd -Verb RunAs -Wait
                    Write-Host ""
                    Write-Host "Deployment internal proyek selesai dengan sukses!" -ForegroundColor Green
                } catch {
                    Write-Host ""
                    Write-Host "Terjadi kesalahan saat menjalankan skrip deploy internal proyek." -ForegroundColor Red
                }
            } else {
                Write-Host "Error: File deploy.ps1 tidak ditemukan di dalam proyek target!" -ForegroundColor Red
            }
            Pop-Location
            
            Wait-Key
        }

        "2" {
            Show-Header "Pilih Proyek Untuk Quick Update"
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
                git fetch origin main
                git reset --hard origin/main
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

        "3" {
            while ($true) {
                Show-Header "Manajemen Layanan PM2"
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
                Write-Host " 1) Refresh / Lihat Status Terbaru"
                Write-Host " 2) Restart Semua Layanan (Restart All)"
                Write-Host " 3) Stop Semua Layanan (Stop All)"
                Write-Host " 4) Simpan Konfigurasi Saat Ini (PM2 Save)"
                Write-Host " 5) Bersihkan Log (Flush Logs)"
                Write-Host " 6) Matikan PM2 Daemon (PM2 Kill)"
                Write-Host " 7) Lihat Log Aplikasi (Real-time)"
                Write-Host " 0) Kembali ke Menu Utama"
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
                    "0" { return }
                }
            }
        }

        "4" {
            Show-Header "Emergency Kill Node.js"
            Write-Host "PERINGATAN: Ini akan mematikan paksa SEMUA proses Node.js yang berjalan di Windows." -ForegroundColor Red -Bold
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
                    & pm2 kill 2>&1 | Out-Null
                    Write-Host "PM2 Daemon dimatikan." -ForegroundColor Green
                }
            } else {
                Write-Host "Aksi dibatalkan." -ForegroundColor Gray
            }
            Wait-Key
        }

        "5" {
            Write-Host "Keluar dari program. Terima kasih." -ForegroundColor Cyan
            Stop-Transcript
            Exit
        }
        "6" {
            $migrateScript = Join-Path $PSScriptRoot "easy-migrate.ps1"
            if (Test-Path $migrateScript) {
                & $migrateScript
            } else {
                Write-Host "Script easy-migrate.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "7" {
            $purgeScript = Join-Path $PSScriptRoot "easy-purge.ps1"
            if (Test-Path $purgeScript) {
                & $purgeScript
            } else {
                Write-Host "Script easy-purge.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "8" {
            $deployScript = Join-Path $PSScriptRoot "easy-deploy.ps1"
            if (Test-Path $deployScript) {
                & $deployScript
            } else {
                Write-Host "Script easy-deploy.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "9" {
            $hardeningScript = Join-Path $PSScriptRoot "easy-hardening.ps1"
            if (Test-Path $hardeningScript) {
                & $hardeningScript
            } else {
                Write-Host "Script easy-hardening.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "10" {
            $swapScript = Join-Path $PSScriptRoot "easy-swap.ps1"
            if (Test-Path $swapScript) {
                & $swapScript
            } else {
                Write-Host "Script easy-swap.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        "11" {
            $resizeScript = Join-Path $PSScriptRoot "easy-resize.ps1"
            if (Test-Path $resizeScript) {
                & $resizeScript
            } else {
                Write-Host "Script easy-resize.ps1 tidak ditemukan di $PSScriptRoot" -ForegroundColor Red
                Wait-Key
            }
        }
        default {
            Write-Host "Pilihan tidak valid!" -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
}
