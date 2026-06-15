# Centralized Deployment Manager (Global Deployer)
# Untuk Windows PowerShell
# Berfungsi memanggil skrip deploy internal masing-masing proyek

$ErrorActionPreference = "Stop"

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
    },
    @{
        ID = 2
        Name = "absenta_backend"
        RepoUrl = "https://github.com/sharemovie1993/absenta_backend.git"
        DefaultDir = "C:\apps\absenta-backend"
        HasDeployScript = $false
    },
    @{
        ID = 3
        Name = "absenta_frontend"
        RepoUrl = "https://github.com/sharemovie1993/absenta_frontend.git"
        DefaultDir = "C:\apps\absenta-frontend"
        HasDeployScript = $false
    },
    @{
        ID = 4
        Name = "gform-orkestrator"
        RepoUrl = "https://github.com/sharemovie1993/gform-orkestrator.git"
        DefaultDir = "C:\apps\gform-orkestrator"
        HasDeployScript = $false
    },
    @{
        ID = 5
        Name = "Project-POS"
        RepoUrl = "https://github.com/sharemovie1993/Project-POS.git"
        DefaultDir = "C:\apps\project-pos"
        HasDeployScript = $false
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
    Write-Host " 1) Deploy / Update Proyek dari GitHub"
    Write-Host " 2) Lihat Status Layanan PM2 (Global)"
    Write-Host " 3) Keluar"
    Write-Host "==========================================================================" -ForegroundColor Cyan
    $choice = Read-Host "Pilih opsi [1-3]"

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
                Write-Host "Saat ini hanya 'Project Yatim' yang memiliki skrip deploy internal." -ForegroundColor Yellow
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
            if (Test-Path $installDir) {
                Write-Host "Folder target sudah ada. Memperbarui kode via git pull..." -ForegroundColor Yellow
                Push-Location $installDir
                try {
                    git fetch origin
                    git reset --hard origin/main
                    Write-Host "Kode berhasil diperbarui ke versi terbaru!" -ForegroundColor Green
                } catch {
                    Write-Host "Gagal melakukan pembaruan git. Pastikan folder tersebut adalah repositori git yang valid." -ForegroundColor Red
                    Pop-Location
                    Wait-Key
                    continue
                }
                Pop-Location
            } else {
                Write-Host "Folder target tidak ditemukan. Melakukan git clone..." -ForegroundColor Yellow
                New-Item -ItemType Directory -Force -Path $installDir | Out-Null
                try {
                    git clone --depth 1 $selectedProj.RepoUrl $installDir
                    Write-Host "Clone sukses!" -ForegroundColor Green
                } catch {
                    Write-Host "Gagal mengkloning repositori dari GitHub!" -ForegroundColor Red
                    Wait-Key
                    continue
                }
            }

            # Panggil skrip deploy internal proyek
            Write-Host ""
            Write-Host "Menjalankan skrip deploy internal (deploy.ps1) pada proyek target..." -ForegroundColor Cyan
            Push-Location $installDir
            if (Test-Path "deploy.ps1") {
                try {
                    # Panggil skrip deploy dengan Bypass policy
                    & powershell -NoProfile -ExecutionPolicy Bypass -File .\deploy.ps1
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
            Show-Header "Status Layanan PM2"
            $pm2Path = Get-Command pm2 -ErrorAction SilentlyContinue
            if ($pm2Path) {
                & pm2 status
            } else {
                Write-Host "PM2 tidak terpasang di sistem ini." -ForegroundColor Red
            }
            Wait-Key
        }

        "3" {
            Write-Host "Keluar dari Deployer. Sampai jumpa!" -ForegroundColor Green
            Exit
        }

        Default {
            Write-Host "Pilihan tidak valid!" -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
}
