#!/bin/bash

# setup-resize.sh
# Skrip otomatis untuk melebarkan partisi root (/) di Linux setelah disk di-expand pada hypervisor.
# Mendukung partisi LVM maupun partisi standar (Non-LVM) secara dinamis.
# Harus dijalankan dengan hak akses root atau sudo.

set -e

# Warna output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}==========================================================${NC}"
echo -e "${YELLOW}         AUTOMATIC DISK PARTITION RESIZER FOR LINUX       ${NC}"
echo -e "${CYAN}==========================================================${NC}"

# 1. Pastikan dijalankan sebagai root/sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Harap jalankan script ini dengan sudo atau sebagai root!${NC}"
    echo -e "Contoh: sudo ./setup-resize.sh"
    exit 1
fi

# 2. Dapatkan device root filesystem
ROOT_DEV=$(df / | awk 'NR==2 {print $1}')
echo -e "Root filesystem terpasang di device: ${GREEN}$ROOT_DEV${NC}"
echo -e "Kapasitas sebelum pelebaran:"
df -h /
echo "----------------------------------------------------------"

# 3. Eksekusi pelebaran partisi
if [[ "$ROOT_DEV" == /dev/mapper/* ]] || [[ "$ROOT_DEV" == /dev/ubuntu-vg/* ]]; then
    echo -e "${YELLOW}[1/2] Mendeteksi partisi tipe LVM.${NC}"
    echo "Menjalankan lvextend untuk memperluas Logical Volume..."
    lvextend -l +100%FREE "$ROOT_DEV" || true
    
    echo -e "\n${YELLOW}[2/2] Menjalankan resize2fs untuk melebarkan filesystem...${NC}"
    resize2fs "$ROOT_DEV"
else
    echo -e "${YELLOW}[1/2] Mendeteksi partisi fisik standar (Non-LVM).${NC}"
    
    # Dapatkan nama partisi (misal: sda3)
    DISK_PART=$(basename "$ROOT_DEV")
    
    # Parsing nama disk induk dan nomor partisi
    if [[ "$DISK_PART" =~ ^(nvme[0-9]n[0-9]p)([0-9]+)$ ]]; then
        PARENT_DISK="/dev/${BASH_REMATCH[1]%p}"
        PART_NUM="${BASH_REMATCH[2]}"
    elif [[ "$DISK_PART" =~ ^([a-z]+)([0-9]+)$ ]]; then
        PARENT_DISK="/dev/${BASH_REMATCH[1]}"
        PART_NUM="${BASH_REMATCH[2]}"
    else
        echo -e "${RED}Error: Gagal memisahkan disk induk dan nomor partisi dari $DISK_PART${NC}"
        exit 1
    fi
    
    echo -e "Disk Induk  : ${GREEN}$PARENT_DISK${NC}"
    echo -e "No. Partisi : ${GREEN}$PART_NUM${NC}"
    
    # Pastikan growpart terinstall (cloud-guest-utils)
    if ! command -v growpart &>/dev/null; then
        echo "growpart tidak ditemukan. Menginstal cloud-guest-utils..."
        apt-get update -y && apt-get install -y cloud-guest-utils
    fi
    
    echo "Menjalankan growpart untuk melebarkan tabel partisi..."
    growpart "$PARENT_DISK" "$PART_NUM" || true
    
    echo -e "\n${YELLOW}[2/2] Menjalankan resize2fs untuk melebarkan filesystem...${NC}"
    resize2fs "$ROOT_DEV"
fi

echo -e "\n${GREEN}==========================================================${NC}"
echo -e "${GREEN}            PELEBARAN PARTISI DISK BERHASIL!              ${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo -e "Kapasitas sesudah pelebaran:"
df -h /
echo -e "=========================================================="
