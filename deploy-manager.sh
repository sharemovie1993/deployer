#!/bin/bash

# Centralized Deployment Manager (Global Deployer)
# Untuk Linux (Ubuntu/Debian)
# Berfungsi memanggil skrip deploy internal masing-masing proyek

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
declare -A PROJ_HAS_SCRIPT

# 1. Project Yatim
PROJ_NAMES[1]="Project Yatim (Mustahiq Care)"
PROJ_REPOS[1]="https://github.com/sharemovie1993/Project-Yatim.git"
PROJ_DIRS[1]="/var/www/project-yatim"
PROJ_HAS_SCRIPT[1]=true

# 2. absenta_backend
PROJ_NAMES[2]="absenta_backend"
PROJ_REPOS[2]="https://github.com/sharemovie1993/absenta_backend.git"
PROJ_DIRS[2]="/var/www/absenta-backend"
PROJ_HAS_SCRIPT[2]=false

# 3. absenta_frontend
PROJ_NAMES[3]="absenta_frontend"
PROJ_REPOS[3]="https://github.com/sharemovie1993/absenta_frontend.git"
PROJ_DIRS[3]="/var/www/absenta-frontend"
PROJ_HAS_SCRIPT[3]=false

# 4. gform-orkestrator
PROJ_NAMES[4]="gform-orkestrator"
PROJ_REPOS[4]="https://github.com/sharemovie1993/gform-orkestrator.git"
PROJ_DIRS[4]="/var/www/gform-orkestrator"
PROJ_HAS_SCRIPT[4]=false

# 5. Project-POS
PROJ_NAMES[5]="Project-POS"
PROJ_REPOS[5]="https://github.com/sharemovie1993/Project-POS.git"
PROJ_DIRS[5]="/var/www/project-pos"
PROJ_HAS_SCRIPT[5]=false

# 6. Caddy Gateway
PROJ_NAMES[6]="Caddy Gateway (Automated SSL & Reverse Proxy)"
PROJ_REPOS[6]=""
PROJ_DIRS[6]="/var/www/caddy-setup"
PROJ_HAS_SCRIPT[6]=true

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
    echo -e " 2) Lihat Status Layanan PM2 (Global)"
    echo -e " 3) Keluar"
    echo -e "${CYAN}==========================================================================${NC}"
    read -p "Pilih menu [1-3]: " menu_choice

    case $menu_choice in
        1)
            show_header "Pilih Proyek Yang Ingin Di-deploy"
            # Loop manual sesuai ID urut dari 1 ke 6
            for id in 1 2 3 4 5 6; do
                name="${PROJ_NAMES[$id]}"
                repo="${PROJ_REPOS[$id]}"
                has_script="${PROJ_HAS_SCRIPT[$id]}"
                
                if [ "$has_script" = true ]; then
                    status_text="${GREEN}[Deploy Script Tersedia]${NC}"
                else
                    status_text="${NC}[Deploy Script Belum Ada]${NC}"
                fi

                echo -e " $id) $name $status_text"
                echo -e "    Repo: $repo"
            done
            echo ""
            read -p "Pilih nomor proyek: " p_id
            
            if [ -z "${PROJ_NAMES[$p_id]}" ]; then
                echo -e "${RED}Nomor proyek tidak valid!${NC}"
                wait_key
                continue
            fi

            # Validasi apakah proyek punya skrip deploy internal
            if [ "${PROJ_HAS_SCRIPT[$p_id]}" != true ]; then
                echo -e ""
                echo -e "${YELLOW}Peringatan: Proyek '${PROJ_NAMES[$p_id]}' belum memiliki skrip deploy internal.${NC}"
                echo -e "${YELLOW}Saat ini hanya 'Project Yatim' yang didukung.${NC}"
                wait_key
                continue
            fi

            name=${PROJ_NAMES[$p_id]}
            repo=${PROJ_REPOS[$p_id]}
            default_dir=${PROJ_DIRS[$p_id]}

            show_header "Konfigurasi Target - $name"
            read -p "Masukkan folder target deployment [$default_dir]: " install_dir
            if [ -z "$install_dir" ]; then install_dir=$default_dir; fi

            echo -e "\n${YELLOW}--- RINGKASAN DEPLOYMENT ---${NC}"
            echo -e " - Proyek       : $name"
            echo -e " - Folder Target: $install_dir"
            echo -e " - Aksi         : Clone & Panggil Skrip Deploy Internal"
            echo -e "${YELLOW}----------------------------${NC}"
            
            read -p "Mulai proses deployment? [y/N]: " confirm
            if [[ ! "$confirm" =~ ^[yY]$ ]]; then
                echo -e "${RED}Deployment dibatalkan.${NC}"
                wait_key
                continue
            fi

            # Cek Git
            if ! command -v git &> /dev/null; then
                echo -e "${RED}Error: Git belum terpasang untuk mengunduh kode!${NC}"
                wait_key
                continue
            fi

            show_header "Memproses Deployment - $name"
            if [ ! -z "$repo" ]; then
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
            else
                echo -e "${GREEN}Proyek lokal terdeteksi (tidak memerlukan Git clone/pull).${NC}"
            fi

            # Panggil skrip deploy internal
            echo -e "\n${CYAN}Menjalankan skrip deploy internal (deploy.sh) pada proyek target...${NC}"
            cd "$install_dir"
            if [ -f "deploy.sh" ]; then
                chmod +x deploy.sh
                ./deploy.sh
                echo -e "\n${GREEN}Deployment internal proyek selesai dengan sukses!${NC}"
            else
                echo -e "${RED}Error: Berkas deploy.sh tidak ditemukan di dalam proyek target!${NC}"
            fi
            cd - > /dev/null

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
            echo -e "${GREEN}Keluar dari Deployer. Sampai jumpa!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Pilihan tidak valid!${NC}"
            sleep 1
            ;;
    esac
done
