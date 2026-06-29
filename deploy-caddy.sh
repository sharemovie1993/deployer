#!/bin/bash
# deploy-caddy.sh
# Script to install and configure Caddy Server locally on the VPS, replacing Nginx

set -e

echo -e "\e[36m[CADDY] Memulai instalasi dan konfigurasi Caddy Server secara lokal di VPS...\e[0m"

# 1. Install Caddy
echo -e "\e[33m[CADDY] 1. Mengunduh dan memasang Caddy Server...\e[0m"
sudo apt-get update
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy

# 2. Stop and disable Nginx to free ports 80/443
echo -e "\e[33m[CADDY] 2. Menghentikan dan menonaktifkan layanan Nginx...\e[0m"
sudo systemctl stop nginx || true
sudo systemctl disable nginx || true

# 3. Create placeholder Caddyfile with write permissions so sync-caddy can run
echo -e "\e[33m[CADDY] 3. Membuat file Caddyfile kosong dan mengatur hak akses...\e[0m"
sudo touch /etc/caddy/Caddyfile
sudo chown root:root /etc/caddy/Caddyfile
sudo chmod 666 /etc/caddy/Caddyfile

# 4. Trigger first Caddy file synchronization
echo -e "\e[33m[CADDY] 4. Sinkronisasi rute dan generate Caddyfile dari database...\e[0m"
if [ -d "/var/www/licensing-server" ]; then
    cd /var/www/licensing-server
    sudo node scripts/sync-caddy.js
else
    echo -e "\e[33m[WARNING] Folder /var/www/licensing-server tidak ditemukan. Sinkronisasi dilewati.\e[0m"
fi

# 5. Enable and start Caddy
echo -e "\e[33m[CADDY] 5. Menyalakan dan mengaktifkan layanan Caddy...\e[0m"
sudo systemctl enable caddy
sudo systemctl start caddy

echo -e "\e[32m[CADDY] MIGRASI & INSTALASI CADDY GATEWAY BERHASIL & LIVE!\e[0m"
