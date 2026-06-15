# Centralized Deployment Manager (Global Deployer)
# Untuk Windows PowerShell
# Dapat men-deploy beberapa proyek berbeda secara terpusat

$ErrorActionPreference = "Stop"

# Daftar Proyek yang Terdaftar
$PROJECTS = @(
    @{
        ID = 1
        Name = "Project Yatim (Mustahiq Care)"
        RepoUrl = "https://github.com/sharemovie1993/Project-Yatim.git"
        DefaultDir = "C:\apps\project-yatim"
        DefaultBackendPort = "5002"
        DefaultFrontendPort = "5174"
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

# Loop Utama
while ($true) {
    Show-Header "Menu Utama"
    Write-Host " 1) Deploy / Update Proyek dari GitHub"
    Write-Host " 2) Lihat Status Layanan (PM2)"
    Write-Host " 3) Restart Layanan Proyek"
    Write-Host " 4) Matikan / Hentikan Layanan Proyek"
    Write-Host " 5) Keluar"
    Write-Host "==========================================================================" -ForegroundColor Cyan
    $choice = Read-Host "Pilih opsi [1-5]"

    switch ($choice) {
        "1" {
            # --- DEPLOY / UPDATE PROYEK ---
            Show-Header "Pilih Proyek Yang Ingin Di-deploy"
            foreach ($p in $PROJECTS) {
                Write-Host " $($p.ID)) $($p.Name)" -ForegroundColor White
                Write-Host "    Repo: $($p.RepoUrl)" -ForegroundColor Gray
            }
            Write-Host ""
            $pId = Read-Host "Pilih nomor proyek"
            $selectedProj = $PROJECTS | Where-Object { $_.ID -eq $pId }

            if ($null -eq $selectedProj) {
                Write-Host "Nomor proyek tidak valid!" -ForegroundColor Red
                Wait-Key
                continue
            }

            Show-Header "Konfigurasi Target - $($selectedProj.Name)"
            $installDir = Read-Host "Masukkan folder instalasi target [$($selectedProj.DefaultDir)]"
            if ([string]::IsNullOrWhiteSpace($installDir)) { $installDir = $selectedProj.DefaultDir }

            $backendPort = Read-Host "Masukkan Port Backend [$($selectedProj.DefaultBackendPort)]"
            if ([string]::IsNullOrWhiteSpace($backendPort)) { $backendPort = $selectedProj.DefaultBackendPort }

            $frontendPort = Read-Host "Masukkan Port Frontend [$($selectedProj.DefaultFrontendPort)]"
            if ([string]::IsNullOrWhiteSpace($frontendPort)) { $frontendPort = $selectedProj.DefaultFrontendPort }

            $licenseUrl = Read-Host "Masukkan URL Server Lisensi [https://api.absenta.id]"
            if ([string]::IsNullOrWhiteSpace($licenseUrl)) { $licenseUrl = "https://api.absenta.id" }

            Write-Host ""
            Write-Host "--- RINGKASAN DEPLOYMENT ---" -ForegroundColor Yellow
            Write-Host " - Proyek       : $($selectedProj.Name)"
            Write-Host " - Folder Target: $installDir"
            Write-Host " - Port Backend : $backendPort"
            Write-Host " - Port Frontend: $frontendPort"
            Write-Host " - Server Lisensi: $licenseUrl"
            Write-Host "----------------------------" -ForegroundColor Yellow
            Write-Host ""
            $confirm = Read-Host "Apakah Anda yakin ingin memulai proses deployment? [Y/n]"
            if ($confirm -eq "n" -or $confirm -eq "N") {
                Write-Host "Deployment dibatalkan." -ForegroundColor Red
                Wait-Key
                continue
            }

            # Mulai Checkout
            Show-Header "Sedang Memproses - $($selectedProj.Name)"
            
            # Cek Git & Node
            Write-Host "Memeriksa Git..." -NoNewline
            try { git --version | Out-Null; Write-Host " OK" -ForegroundColor Green } catch {
                Write-Host " GAGAL" -ForegroundColor Red
                Write-Host "Git harus terpasang di sistem!" -ForegroundColor Red
                Wait-Key
                continue
            }

            Write-Host "Memeriksa Node.js..." -NoNewline
            try { node -v | Out-Null; Write-Host " OK" -ForegroundColor Green } catch {
                Write-Host " GAGAL" -ForegroundColor Red
                Write-Host "Node.js harus terpasang di sistem!" -ForegroundColor Red
                Wait-Key
                continue
            }

            # Cek Folder Target & Clone
            if (Test-Path $installDir) {
                Write-Host "Folder target sudah ada. Memperbarui kode via git pull..." -ForegroundColor Yellow
                Push-Location $installDir
                try {
                    git fetch origin
                    git reset --hard origin/main
                    Write-Host "Kode berhasil diperbarui ke versi terbaru!" -ForegroundColor Green
                } catch {
                    Write-Host "Gagal melakukan git pull. Pastikan folder tersebut adalah repositori git yang valid." -ForegroundColor Red
                    Pop-Location
                    Wait-Key
                    continue
                }
                Pop-Location
            } else {
                Write-Host "Folder target tidak ada. Melakukan git clone..." -ForegroundColor Yellow
                New-Item -ItemType Directory -Force -Path $installDir | Out-Null
                try {
                    git clone --depth 1 $selectedProj.RepoUrl $installDir
                    Write-Host "Clone sukses!" -ForegroundColor Green
                } catch {
                    Write-Host "Gagal mengkloning repositori!" -ForegroundColor Red
                    Wait-Key
                    continue
                }
            }

            # Menulis file konfigurasi di folder target
            Write-Host "Menulis berkas konfigurasi (.env)..." -ForegroundColor Yellow
            $backendEnv = @"
PORT=$backendPort
DATABASE_URL="file:./dev.db"
"@
            $backendEnv | Out-File -FilePath "$installDir\backend\.env" -Encoding utf8 -Force

            $rootEnv = @"
EXPO_PUBLIC_LICENSE_SERVER_URL=$licenseUrl
"@
            $rootEnv | Out-File -FilePath "$installDir\.env" -Encoding utf8 -Force

            $frontendEnv = @"
VITE_BACKEND_PORT=$backendPort
"@
            $frontendEnv | Out-File -FilePath "$installDir\frontend\.env" -Encoding utf8 -Force

            # Jalankan instalasi dependensi
            Write-Host "Menginstal paket dependensi npm... Mohon tunggu..." -ForegroundColor Yellow
            Push-Location $installDir
            npm run install-all
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Gagal menginstal dependensi." -ForegroundColor Red
                Pop-Location
                Wait-Key
                continue
            }

            # DB Push SQLite
            Write-Host "Menginisialisasi Database SQLite (Prisma DB Push)..." -ForegroundColor Yellow
            Push-Location backend
            npx prisma db push --accept-data-loss
            Pop-Location

            # Build Frontend
            Write-Host "Mengompilasi Frontend (Vite Build)..." -ForegroundColor Yellow
            Push-Location frontend
            npm run build
            Pop-Location

            # Jalankan PM2
            Write-Host "Mendaftarkan dan menjalankan layanan di PM2..." -ForegroundColor Yellow
            $pm2Path = Get-Command pm2 -ErrorAction SilentlyContinue
            if ($pm2Path) {
                & pm2 delete "mustahiq-backend" 2>$null | Out-Null
                & pm2 delete "mustahiq-frontend" 2>$null | Out-Null

                Push-Location backend
                & pm2 start src/server.js --name "mustahiq-backend"
                Pop-Location

                Push-Location frontend
                & pm2 start npm --name "mustahiq-frontend" -- run preview -- --port $frontendPort --host 0.0.0.0
                Pop-Location

                & pm2 save
                Write-Host "Sukses dijalankan di PM2!" -ForegroundColor Green
                Write-Host "Aplikasi Anda aktif di:" -ForegroundColor Green
                Write-Host " - Frontend Web: http://localhost:$frontendPort"
                Write-Host " - Backend API : http://localhost:$backendPort/api/health"
            } else {
                Write-Host "PM2 tidak ditemukan. Menjalankan layanan secara manual di window terminal terpisah..." -ForegroundColor Yellow
                Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $installDir\backend; Title Mustahiq-Backend; npm start"
                Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $installDir\frontend; Title Mustahiq-Frontend; npm run preview -- --port $frontendPort --host 0.0.0.0"
                Write-Host "Layanan diluncurkan di terminal terpisah!" -ForegroundColor Green
            }

            Pop-Location
            Wait-Key
        }

        "2" {
            # --- LIHAT STATUS PM2 ---
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
            # --- RESTART LAYANAN ---
            Show-Header "Restart Layanan PM2"
            $pm2Path = Get-Command pm2 -ErrorAction SilentlyContinue
            if ($pm2Path) {
                & pm2 restart "mustahiq-backend" 2>$null
                & pm2 restart "mustahiq-frontend" 2>$null
                Write-Host "Layanan berhasil dimuat ulang!" -ForegroundColor Green
            } else {
                Write-Host "PM2 tidak aktif." -ForegroundColor Red
            }
            Wait-Key
        }

        "4" {
            # --- MATIKAN LAYANAN ---
            Show-Header "Hentikan Layanan PM2"
            $pm2Path = Get-Command pm2 -ErrorAction SilentlyContinue
            if ($pm2Path) {
                & pm2 stop "mustahiq-backend" 2>$null
                & pm2 stop "mustahiq-frontend" 2>$null
                Write-Host "Layanan berhasil dihentikan!" -ForegroundColor Green
            } else {
                Write-Host "PM2 tidak aktif." -ForegroundColor Red
            }
            Wait-Key
        }

        "5" {
            Write-Host "Keluar dari Deployer. Sampai jumpa!" -ForegroundColor Green
            Exit
        }

        Default {
            Write-Host "Pilihan tidak valid!" -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
}
