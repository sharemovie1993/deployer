#!/bin/bash

# setup-swap.sh
# Skrip otomatis untuk membuat dan mengaktifkan 4GB SWAP Space di Linux.
# Harus dijalankan dengan hak akses root atau sudo.

set -e

# Warna output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}==========================================================${NC}"
echo -e "${YELLOW}         AUTOMATIC 4GB SWAP CONFIGURATION FOR LINUX       ${NC}"
echo -e "${CYAN}==========================================================${NC}"

# 1. Pastikan dijalankan sebagai root/sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Harap jalankan script ini dengan sudo atau sebagai root!${NC}"
    echo -e "Contoh: sudo ./setup-swap.sh"
    exit 1
fi

# 2. Cek apakah swap sudah aktif
CURRENT_SWAP=$(swapon --show --noheadings)
if [ ! -z "$CURRENT_SWAP" ]; then
    echo -e "${GREEN}SWAP saat ini sudah aktif di sistem:${NC}"
    swapon --show
    echo -e "\n${YELLOW}Apakah Anda ingin tetap membuat swap tambahan sebesar 4GB? (y/N)${NC}"
    read -p "Pilihan: " confirm_add
    if [[ ! "$confirm_add" =~ ^[yY]$ ]]; then
        echo -e "${GREEN}Proses dibatalkan. SWAP yang ada tetap dipertahankan.${NC}"
        exit 0
    fi
fi

SWAP_PATH="/swapfile"

# Jika file swap sudah ada sebelumnya, hapus/matikan dulu untuk menghindari error
if [ -f "$SWAP_PATH" ]; then
    echo -e "${YELLOW}Menemukan berkas swap lama di $SWAP_PATH. Menonaktifkan...${NC}"
    swapoff "$SWAP_PATH" || true
    rm -f "$SWAP_PATH"
fi

# 3. Membuat file swap sebesar 4GB
echo -e "\n${YELLOW}[1/4] Membuat berkas swap sebesar 4GB di $SWAP_PATH...${NC}"
# Menggunakan fallocate (cepat) atau dd (fallback) jika fallocate tidak didukung sistem file
if fallocate -l 4G "$SWAP_PATH" 2>/dev/null; then
    echo -e "${GREEN}Berkas swap berhasil dibuat menggunakan fallocate.${NC}"
else
    echo -e "fallocate tidak didukung. Mencoba membuat menggunakan dd (proses ini membutuhkan waktu 10-30 detik)..."
    dd if=/dev/zero of="$SWAP_PATH" bs=1M count=4096 status=progress
    echo -e "${GREEN}Berkas swap berhasil dibuat menggunakan dd.${NC}"
fi

# 4. Mengatur hak akses aman
echo -e "\n${YELLOW}[2/4] Mengatur hak akses berkas (chmod 600)...${NC}"
chmod 600 "$SWAP_PATH"
echo -e "${GREEN}Hak akses berhasil diatur.${NC}"

# 5. Format berkas menjadi swap area
echo -e "\n${YELLOW}[3/4] Melakukan format berkas swap...${NC}"
mkswap "$SWAP_PATH"
echo -e "${GREEN}Format swap selesai.${NC}"

# 6. Mengaktifkan swap
echo -e "\n${YELLOW}[4/4] Mengaktifkan SWAP Space...${NC}"
swapon "$SWAP_PATH"
echo -e "${GREEN}SWAP berhasil diaktifkan!${NC}"

# 7. Daftarkan secara permanen di /etc/fstab agar tetap aktif setelah reboot
if ! grep -q "$SWAP_PATH" /etc/fstab; then
    echo -e "\nMendaftarkan swap ke /etc/fstab agar permanen..."
    echo "$SWAP_PATH none swap sw 0 0" >> /etc/fstab
    echo -e "${GREEN}Swap berhasil didaftarkan secara permanen.${NC}"
else
    echo -e "\nSwap sudah terdaftar di /etc/fstab (dilewati)."
fi

echo -e "\n${GREEN}==========================================================${NC}"
echo -e "${GREEN}              KONFIGURASI SWAP BERHASIL!                  ${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo -e "Status memori sistem saat ini:"
free -h
echo -e "=========================================================="
