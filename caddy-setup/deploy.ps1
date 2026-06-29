# deploy.ps1 (Caddy Gateway Setup)
# Script to install and configure Caddy Server on VPS, replacing Nginx

$ErrorActionPreference = "Stop"
$VPS_IP = "103.129.148.127"
$VPS_USER = "asepsuryadi"
$PEM_KEY = "../nginxonly.pem"

Write-Host "[CADDY] Memulai instalasi dan konfigurasi Caddy Server di VPS..." -ForegroundColor Cyan

try {
    # 1. Install Caddy on VPS
    Write-Host "[CADDY] 1. Mengunduh dan memasang Caddy Server di Ubuntu/Debian VPS..." -ForegroundColor Yellow
    $installCmd = "sudo apt-get update && sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl && " +
                  "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && " +
                  "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list && " +
                  "sudo apt-get update && sudo apt-get install -y caddy"
    ssh -i $PEM_KEY -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" $installCmd
    if ($LASTEXITCODE -ne 0) { throw "Instalasi Caddy di VPS gagal!" }

    # 2. Stop and disable Nginx to free ports 80/443
    Write-Host "[CADDY] 2. Menghentikan dan menonaktifkan layanan Nginx..." -ForegroundColor Yellow
    $nginxStopCmd = "sudo systemctl stop nginx && sudo systemctl disable nginx"
    ssh -i $PEM_KEY -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" $nginxStopCmd
    if ($LASTEXITCODE -ne 0) { throw "Gagal menghentikan layanan Nginx!" }

    # 3. Create placeholder Caddyfile with write permissions so sync-caddy can run
    Write-Host "[CADDY] 3. Membuat file Caddyfile kosong dan mengatur hak akses..." -ForegroundColor Yellow
    $caddyfilePrep = "sudo touch /etc/caddy/Caddyfile && sudo chown root:root /etc/caddy/Caddyfile && sudo chmod 666 /etc/caddy/Caddyfile"
    ssh -i $PEM_KEY -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" $caddyfilePrep
    if ($LASTEXITCODE -ne 0) { throw "Gagal menyiapkan berkas /etc/caddy/Caddyfile!" }

    # 4. Trigger first Caddy file synchronization
    Write-Host "[CADDY] 4. Sinkronisasi rute dan generate Caddyfile dari database..." -ForegroundColor Yellow
    $syncCmd = "cd /var/www/licensing-server && sudo node scripts/sync-caddy.js"
    ssh -i $PEM_KEY -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" $syncCmd
    if ($LASTEXITCODE -ne 0) { throw "Sinkronisasi Caddyfile dinamis gagal!" }

    # 5. Enable and start Caddy
    Write-Host "[CADDY] 5. Menyalakan dan mengaktifkan layanan Caddy..." -ForegroundColor Yellow
    $caddyStartCmd = "sudo systemctl enable caddy && sudo systemctl start caddy"
    ssh -i $PEM_KEY -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" $caddyStartCmd
    if ($LASTEXITCODE -ne 0) { throw "Gagal memulai layanan Caddy!" }

    Write-Host "[CADDY] MIGRASI & INSTALASI CADDY GATEWAY BERHASIL & LIVE!" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
    exit 1
}
