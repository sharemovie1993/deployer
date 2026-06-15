#!/bin/bash

# Centralized Deployment Manager (Global Deployer)
# Untuk Linux (Ubuntu/Debian)
# Dapat men-deploy beberapa proyek berbeda secara terpusat

# Color variables
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Metadata Proyek Terdaftar
declare -A PROJ_NAMES
declare -A PROJ_REPOS
declare -A PROJ_DIRS
declare -A PROJ_B_PORTS
declare -A PROJ_F_PORTS

# Registrasi Project Yatim
PROJ_NAMES[1]="Project Yatim (Mustahiq Care)"
PROJ_REPOS[1]="https://github.com/sharemovie1993/Project-Yatim.git"
PROJ_DIRS[1]="/var/www/project-yatim"
PROJ_B_PORTS[1]="5002"
PROJ_F_PORTS[1]="5174"

function show_header() {
    clear
    echo -e "${CYAN}==========================================================================${NC}"
    echo -e "${CYAN}                  GLOBAL DEPLOYMENT MANAGER (DEPLOYER)                    ${NC}"
    echo -e "${CYAN}==========================================================================${NC}"
    if [ ! -z "$1" ]; then
        echo -e "${GREEN} [Menu] $1${NC}"
        echo -e "${CYAN}--------------------------------------------------------------------------${NC}"
    fi
}

function wait_key() {
    echo ""
    read -p "Tekan [ENTER] untuk kembali ke menu utama..." temp
}

while true; do
    show_header "Menu Utama"
    echo -e " 1) Deploy / Update Proyek dari GitHub"
    echo -e " 2) Lihat Status Layanan (PM2)"
    echo -e " 3) Restart Layanan Proyek"
    echo -e " 4) Hentikan / Matikan Layanan Proyek"
    echo -e " 5) Buat Konfigurasi Nginx untuk Proyek"
    echo -e " 6) Keluar"
    echo -e "${CYAN}==========================================================================${NC}"
    read -p "Pilih menu [1-6]: " menu_choice

    case $menu_choice in
        1)
            show_header "Pilih Proyek Yang Ingin Di-deploy"
            for id in "${!PROJ_NAMES[@]}"; do
                echo -e " $id) ${PROJ_NAMES[$id]}"
                echo -e "    Repo: ${PROJ_REPOS[$id]}"
            done
            echo ""
            read -p "Pilih nomor proyek: " p_id
            
            if [ -z "${PROJ_NAMES[$p_id]}" ]; then
                echo -e "${RED}Nomor proyek tidak valid!${NC}"
                wait_key
                continue
            fi

            name=${PROJ_NAMES[$p_id]}
            repo=${PROJ_REPOS[$p_id]}
            default_dir=${PROJ_DIRS[$p_id]}
            default_b_port=${PROJ_B_PORTS[$p_id]}
            default_f_port=${PROJ_F_PORTS[$p_id]}

            show_header "Konfigurasi Target - $name"
            read -p "Masukkan folder instalasi target [$default_dir]: " install_dir
            if [ -z "$install_dir" ]; then install_dir=$default_dir; fi

            read -p "Masukkan Port Backend [$default_b_port]: " backend_port
            if [ -z "$backend_port" ]; then backend_port=$default_b_port; fi

            read -p "Masukkan Port Frontend [$default_f_port]: " frontend_port
            if [ -z "$frontend_port" ]; then frontend_port=$default_f_port; fi

            read -p "Masukkan URL Server Lisensi [https://api.absenta.id]: " license_url
            if [ -z "$license_url" ]; then license_url="https://api.absenta.id"; fi

            echo -e "\n${YELLOW}--- RINGKASAN DEPLOYMENT ---${NC}"
            echo -e " - Proyek       : $name"
            echo -e " - Folder Target: $install_dir"
            echo -e " - Port Backend : $backend_port"
            echo -e " - Port Frontend: $frontend_port"
            echo -e " - Server Lisensi: $license_url"
            echo -e "${YELLOW}----------------------------${NC}"
            
            read -p "Apakah Anda yakin ingin memulai deployment? [y/N]: " confirm
            if [[ ! "$confirm" =~ ^[yY]$ ]]; then
                echo -e "${RED}Deployment dibatalkan.${NC}"
                wait_key
                continue
            fi

            # Cek Tools
            if ! command -v git &> /dev/null; then
                echo -e "${RED}Error: Git belum terpasang!${NC}"
                wait_key
                continue
            fi
            if ! command -v node &> /dev/null; then
                echo -e "${RED}Error: Node.js belum terpasang!${NC}"
                wait_key
                continue
            fi

            # Proses Folder & Clone
            show_header "Memproses Deployment - $name"
            if [ -d "$install_dir" ]; then
                echo -e "${YELLOW}Folder target sudah ada. Memperbarui kode via git fetch & reset...${NC}"
                cd "$install_dir"
                git fetch origin
                git reset --hard origin/main
                cd - > /dev/null
            else
                echo -e "${YELLOW}Folder target tidak ada. Membuat folder dan mengkloning...${NC}"
                sudo mkdir -p "$install_dir"
                sudo chown -R $USER:$USER "$install_dir"
                git clone --depth 1 "$repo" "$install_dir"
            fi

            # Menulis file lingkungan (.env)
            echo -e "${YELLOW}Menulis file konfigurasi (.env)...${NC}"
            echo "PORT=$backend_port" > "$install_dir/backend/.env"
            echo "DATABASE_URL=\"file:./dev.db\"" >> "$install_dir/backend/.env"
            echo "EXPO_PUBLIC_LICENSE_SERVER_URL=$license_url" > "$install_dir/.env"
            echo "VITE_BACKEND_PORT=$backend_port" > "$install_dir/frontend/.env"

            # NPM install
            echo -e "${YELLOW}Menginstal paket npm dependensi...${NC}"
            cd "$install_dir"
            npm run install-all

            # Prisma DB Push
            echo -e "${YELLOW}Menjalankan migrasi database SQLite (Prisma)...${NC}"
            cd backend
            npx prisma db push --accept-data-loss
            cd ..

            # Frontend Build
            echo -e "${YELLOW}Mengompilasi Frontend (Vite Build)...${NC}"
            cd frontend
            npm run build
            cd ..

            # PM2 Setup
            if command -v pm2 &> /dev/null; then
                echo -e "${YELLOW}Mendaftarkan layanan ke PM2...${NC}"
                pm2 delete "mustahiq-backend" 2>/dev/null || true
                pm2 delete "mustahiq-frontend" 2>/dev/null || true

                cd backend
                pm2 start src/server.js --name "mustahiq-backend"
                cd ../frontend
                pm2 start npm --name "mustahiq-frontend" -- run preview -- --port $frontend_port --host 0.0.0.0
                cd ..
                
                pm2 save
                echo -e "${GREEN}Sukses men-deploy dan menjalankan layanan di PM2!${NC}"
                pm2 status
            else
                echo -e "${YELLOW}PM2 tidak ditemukan. Jalankan manual menggunakan:${NC}"
                echo -e " - Backend: cd $install_dir/backend && npm start"
                echo -e " - Frontend: cd $install_dir/frontend && npm run preview -- --port $frontend_port --host 0.0.0.0"
            fi
            
            wait_key
            ;;
        2)
            show_header "Status PM2"
            if command -v pm2 &> /dev/null; then
                pm2 status
            else
                echo -e "${RED}PM2 tidak terpasang.${NC}"
            fi
            wait_key
            ;;
        3)
            show_header "Restart Layanan PM2"
            if command -v pm2 &> /dev/null; then
                pm2 restart "mustahiq-backend" 2>/dev/null || true
                pm2 restart "mustahiq-frontend" 2>/dev/null || true
                echo -e "${GREEN}Layanan berhasil direstart!${NC}"
            else
                echo -e "${RED}PM2 tidak terpasang.${NC}"
            fi
            wait_key
            ;;
        4)
            show_header "Hentikan Layanan PM2"
            if command -v pm2 &> /dev/null; then
                pm2 stop "mustahiq-backend" 2>/dev/null || true
                pm2 stop "mustahiq-frontend" 2>/dev/null || true
                echo -e "${GREEN}Layanan dihentikan!${NC}"
            else
                echo -e "${RED}PM2 tidak terpasang.${NC}"
            fi
            wait_key
            ;;
        5)
            show_header "Pembuatan Konfigurasi Nginx"
            read -p "Masukkan Domain/IP Server Anda (contoh: yatim.absenta.id): " domain_name
            if [ -z "$domain_name" ]; then domain_name="localhost"; fi

            echo -e "\n${YELLOW}Berikut template konfigurasi Nginx:${NC}"
            echo -e "--------------------------------------------------------"
            cat <<EOF
server {
    listen 80;
    server_name $domain_name;

    location / {
        proxy_pass http://localhost:$frontend_port;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:$backend_port/api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
            echo -e "--------------------------------------------------------"
            wait_key
            ;;
        6)
            echo -e "${GREEN}Keluar dari Deployer. Sampai jumpa!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Pilihan tidak valid!${NC}"
            sleep 1
            ;;
    esac
done
