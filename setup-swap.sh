#!/bin/bash

# setup-swap.sh
# Skrip otomatis untuk membuat dan mengaktifkan SWAP Space secara dinamis di Linux.
# Skrip ini mendeteksi kapasitas RAM fisik, SWAP yang ada, dan ruang disk kosong secara pintar.
# Harus dijalankan dengan hak akses root atau sudo.

set -e

# Warna output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}==========================================================${NC}"
echo -e "${YELLOW}         SMART AUTOMATIC SWAP CONFIGURATION FOR LINUX     ${NC}"
echo -e "${CYAN}==========================================================${NC}"

# 1. Pastikan dijalankan sebagai root/sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Harap jalankan script ini dengan sudo atau sebagai root!${NC}"
    echo -e "Contoh: sudo ./setup-swap.sh"
    exit 1
fi

# 2. Deteksi Spesifikasi Sistem
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
TOTAL_SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
FREE_DISK_MB=$(df -m / | awk 'NR==2 {print $4}')

# Konversi ke GB untuk tampilan
TOTAL_RAM_GB=$(awk "BEGIN {printf \"%.1f\", $TOTAL_RAM_MB / 1024}")
TOTAL_SWAP_GB=$(awk "BEGIN {printf \"%.1f\", $TOTAL_SWAP_MB / 1024}")
FREE_DISK_GB=$(awk "BEGIN {printf \"%.1f\", $FREE_DISK_MB / 1024}")

echo -e "Spesifikasi Server Terdeteksi:"
echo -e " - RAM Fisik       : ${GREEN}${TOTAL_RAM_GB} GB${NC} (${TOTAL_RAM_MB} MB)"
echo -e " - SWAP Aktif      : ${GREEN}${TOTAL_SWAP_GB} GB${NC} (${TOTAL_SWAP_MB} MB)"
echo -e " - Ruang Disk (/)  : ${GREEN}${FREE_DISK_GB} GB${NC} (${FREE_DISK_MB} MB free)"
echo -e "----------------------------------------------------------"

# 3. Kalkulasi Rekomendasi Pintar
# Target total memori (RAM + SWAP) adalah 8GB (8192MB) agar aman kompilasi NodeJS
TARGET_TOTAL_MB=8192
REC_SWAP_MB=0
DISK_CRITICAL=false

if [ $TOTAL_RAM_MB -ge $TARGET_TOTAL_MB ]; then
    # Jika RAM fisik sudah >= 8GB, secara umum tidak butuh swap tambahan untuk build
    REC_SWAP_MB=0
else
    # Butuh swap = Target - RAM yang ada
    REC_SWAP_MB=$((TARGET_TOTAL_MB - TOTAL_RAM_MB))
    
    # Berikan batas aman minimal 2GB swap dan maksimal 8GB swap
    if [ $REC_SWAP_MB -lt 2048 ]; then
        REC_SWAP_MB=2048
    elif [ $REC_SWAP_MB -gt 8192 ]; then
        REC_SWAP_MB=8192
    fi
fi

# Batasi ukuran SWAP agar menyisakan minimal 3GB disk kosong untuk sistem
MIN_FREE_DISK_LIMIT_MB=3072
SAFE_SWAP_LIMIT_MB=$((FREE_DISK_MB - MIN_FREE_DISK_LIMIT_MB))

if [ $SAFE_SWAP_LIMIT_MB -le 0 ]; then
    echo -e "${RED}Peringatan: Ruang disk kosong sangat kritis (${FREE_DISK_GB} GB)!${NC}"
    echo -e "Tidak aman untuk membuat SWAP baru."
    REC_SWAP_MB=0
    DISK_CRITICAL=true
elif [ $REC_SWAP_MB -gt $SAFE_SWAP_LIMIT_MB ]; then
    echo -e "${YELLOW}Peringatan: Disk terbatas. Mengurangi ukuran SWAP rekomendasi ke batas aman...${NC}"
    REC_SWAP_MB=$SAFE_SWAP_LIMIT_MB
    # Batas bawah absolut agar tidak membuat swap terlalu kecil
    if [ $REC_SWAP_MB -lt 1024 ]; then
        REC_SWAP_MB=1024
    fi
fi

REC_SWAP_GB=$(awk "BEGIN {printf \"%.1f\", $REC_SWAP_MB / 1024}")

# 4. Tentukan Ukuran SWAP Akhir
INPUT_GB=$1
FINAL_SWAP_MB=0

if [ ! -z "$INPUT_GB" ] && [ "$INPUT_GB" != "auto" ]; then
    # Jika dipanggil dengan parameter manual (contoh: ./setup-swap.sh 4)
    FINAL_SWAP_MB=$((INPUT_GB * 1024))
    echo -e "Menggunakan ukuran kustom dari argumen: ${GREEN}${INPUT_GB} GB${NC}"
else
    # Deteksi shell interaktif vs otomatis (non-interaktif)
    INTERACTIVE=false
    if [ -t 0 ]; then
        INTERACTIVE=true
    fi

    if [ "$DISK_CRITICAL" = true ]; then
        echo -e "${RED}Pembuatan SWAP dilewati secara otomatis untuk mencegah disk penuh (Disk Full).${NC}"
        exit 0
    elif [ "$REC_SWAP_MB" -eq 0 ]; then
        echo -e "${GREEN}Memori sistem Anda sudah memadai (RAM >= 8GB).${NC}"
        if [ "$INTERACTIVE" = true ]; then
            read -p "Apakah Anda tetap ingin membuat SWAP baru secara paksa? (y/N): " force_swap
            if [[ "$force_swap" =~ ^[yY]$ ]]; then
                read -p "Masukkan ukuran SWAP baru (dalam GB, contoh: 4): " custom_gb
                FINAL_SWAP_MB=$((custom_gb * 1024))
            else
                echo -e "Selesai. Melewati pembuatan SWAP."
                exit 0
            fi
        else
            echo -e "Melewati pembuatan SWAP secara otomatis."
            exit 0
        fi
    else
        echo -e "Rekomendasi ukuran SWAP baru: ${GREEN}${REC_SWAP_GB} GB${NC}"
        
        if [ "$INTERACTIVE" = true ]; then
            read -p "Buat SWAP sebesar ${REC_SWAP_GB} GB? [Y/n] (Atau ketik angka GB kustom): " user_choice
            if [ -z "$user_choice" ] || [[ "$user_choice" =~ ^[yY]$ ]]; then
                FINAL_SWAP_MB=$REC_SWAP_MB
            elif [[ "$user_choice" =~ ^[0-9]+$ ]]; then
                FINAL_SWAP_MB=$((user_choice * 1024))
            else
                echo -e "Proses dibatalkan."
                exit 0
            fi
        else
            # Jika non-interaktif, pakai rekomendasi otomatis hasil kalkulasi pintar
            echo -e "Menjalankan secara otomatis (Non-Interaktif). Memakai ukuran rekomendasi: ${REC_SWAP_GB} GB."
            FINAL_SWAP_MB=$REC_SWAP_MB
        fi
    fi
fi

# Validasi akhir batas disk sebelum mulai menulis
if [ $FINAL_SWAP_MB -gt $FREE_DISK_MB ]; then
    echo -e "${RED}Error: Ukuran SWAP ($((FINAL_SWAP_MB/1024)) GB) melebihi sisa disk kosong (${FREE_DISK_GB} GB)!${NC}"
    exit 1
fi

SWAP_PATH="/swapfile"

# 5. Eksekusi Pembuatan SWAP
if [ -f "$SWAP_PATH" ]; then
    echo -e "\n${YELLOW}Menonaktifkan berkas swap lama di $SWAP_PATH...${NC}"
    swapoff "$SWAP_PATH" || true
    rm -f "$SWAP_PATH"
fi

echo -e "\n${YELLOW}[1/4] Membuat berkas swap sebesar $((FINAL_SWAP_MB)) MB di $SWAP_PATH...${NC}"
if fallocate -l "${FINAL_SWAP_MB}M" "$SWAP_PATH" 2>/dev/null; then
    echo -e "${GREEN}Berkas swap berhasil dibuat menggunakan fallocate.${NC}"
else
    echo -e "fallocate tidak didukung. Mencoba membuat menggunakan dd (mungkin memakan waktu)..."
    dd if=/dev/zero of="$SWAP_PATH" bs=1M count="$FINAL_SWAP_MB" status=progress
    echo -e "${GREEN}Berkas swap berhasil dibuat menggunakan dd.${NC}"
fi

echo -e "\n${YELLOW}[2/4] Mengatur hak akses berkas (chmod 600)...${NC}"
chmod 600 "$SWAP_PATH"

echo -e "\n${YELLOW}[3/4] Melakukan format berkas swap...${NC}"
mkswap "$SWAP_PATH"

echo -e "\n${YELLOW}[4/4] Mengaktifkan SWAP Space...${NC}"
swapon "$SWAP_PATH"
echo -e "${GREEN}SWAP berhasil diaktifkan!${NC}"

# Daftarkan secara permanen di /etc/fstab
if ! grep -q "$SWAP_PATH" /etc/fstab; then
    echo -e "\nMendaftarkan swap ke /etc/fstab agar permanen..."
    echo "$SWAP_PATH none swap sw 0 0" >> /etc/fstab
    echo -e "${GREEN}Swap berhasil terdaftar secara permanen.${NC}"
else
    echo -e "\nSwap sudah terdaftar di /etc/fstab (dilewati)."
fi

echo -e "\n${GREEN}==========================================================${NC}"
echo -e "${GREEN}              KONFIGURASI SWAP BERHASIL!                  ${NC}"
echo -e "${GREEN}==========================================================${NC}"
free -h
echo -e "=========================================================="
