#!/bin/bash

# setup-ssh.sh
# Script untuk menginstal SSH, mengonfigurasi autentikasi key, dan membuat key pair baru di Linux.
# Harus dijalankan dengan hak akses root atau sudo.

set -e

# Warna output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}==========================================================${NC}"
echo -e "${YELLOW}           SSH SETUP & DEPLOYMENT SCRIPT FOR LINUX        ${NC}"
echo -e "${CYAN}==========================================================${NC}"

# 1. Pastikan dijalankan sebagai root/sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Harap jalankan script ini dengan sudo atau sebagai root!${NC}"
    echo -e "Contoh: sudo ./setup-ssh.sh"
    exit 1
fi

# Mendapatkan user asli yang menjalankan sudo
if [ ! -z "$SUDO_USER" ]; then
    REAL_USER=$SUDO_USER
    REAL_HOME=$(eval echo ~$SUDO_USER)
else
    REAL_USER=$USER
    REAL_HOME=$HOME
fi

echo -e "User Target: ${GREEN}$REAL_USER${NC} (Home: $REAL_HOME)"

# 2. Deteksi OS & Instal OpenSSH Server jika belum ada
echo -e "\n${YELLOW}[1/4] Memeriksa instalasi OpenSSH Server...${NC}"
if ! command -v sshd &> /dev/null; then
    echo -e "OpenSSH Server belum terpasang. Memulai instalasi..."
    if [ -f /etc/debian_version ]; then
        apt-get update -y
        apt-get install -y openssh-server
    elif [ -f /etc/redhat-release ] || [ -f /etc/system-release ]; then
        yum install -y openssh-server
    else
        echo -e "${RED}OS tidak didukung secara otomatis. Silakan instal openssh-server secara manual.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}OpenSSH Server sudah terpasang.${NC}"
fi

# Pastikan service SSH berjalan dan aktif saat boot
echo -e "Memastikan SSH Service berjalan..."
if systemctl is-active --quiet sshd; then
    systemctl enable sshd &> /dev/null
    echo -e "${GREEN}SSH Service aktif dan berjalan.${NC}"
elif systemctl is-active --quiet ssh; then
    systemctl enable ssh &> /dev/null
    echo -e "${GREEN}SSH Service aktif dan berjalan.${NC}"
else
    # Coba jalankan
    systemctl start sshd || systemctl start ssh
    systemctl enable sshd || systemctl enable ssh
    echo -e "${GREEN}SSH Service berhasil dijalankan dan diaktifkan.${NC}"
fi

# 3. Konfigurasi SSH Daemon
echo -e "\n${YELLOW}[2/4] Mengonfigurasi sshd_config...${NC}"
SSHD_CONFIG="/etc/ssh/sshd_config"

# Pastikan PubkeyAuthentication aktif
if grep -q "^#\?PubkeyAuthentication" "$SSHD_CONFIG"; then
    sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' "$SSHD_CONFIG"
else
    echo "PubkeyAuthentication yes" >> "$SSHD_CONFIG"
fi

# Pastikan AuthorizedKeysFile mengarah ke .ssh/authorized_keys
if grep -q "^#\?AuthorizedKeysFile" "$SSHD_CONFIG"; then
    sed -i 's/^#\?AuthorizedKeysFile.*/AuthorizedKeysFile .ssh\/authorized_keys .ssh\/authorized_keys2/' "$SSHD_CONFIG"
else
    echo "AuthorizedKeysFile .ssh/authorized_keys .ssh/authorized_keys2" >> "$SSHD_CONFIG"
fi

echo -e "${GREEN}Konfigurasi sshd_config diperbarui.${NC}"

# 4. Buat folder .ssh dan file authorized_keys
echo -e "\n${YELLOW}[3/4] Menyiapkan direktori SSH untuk user '$REAL_USER'...${NC}"
SSH_DIR="$REAL_HOME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"
touch "$AUTH_KEYS"

# 5. Impor Kunci yang Ada & Pembuatan Kunci Baru
echo -e "\n${YELLOW}[4/4] Mengatur Kunci SSH (Key Management)...${NC}"

# A. Jika ada file .pem bawaan di repositori (cloned folder), impor public key-nya
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXISTING_PEM_FOUND=false

for pem_file in "$SCRIPT_DIR"/nginxonly.pem "$SCRIPT_DIR"/ls-key.pem; do
    if [ -f "$pem_file" ]; then
        echo -e "Menemukan file key bawaan: ${CYAN}$(basename "$pem_file")${NC}"
        # Set permission agar ssh-keygen tidak komplain
        chmod 600 "$pem_file"
        
        # Ekstrak public key
        PUB_KEY=$(ssh-keygen -y -f "$pem_file" 2>/dev/null || true)
        if [ ! -z "$PUB_KEY" ]; then
            if ! grep -qF "$PUB_KEY" "$AUTH_KEYS"; then
                echo "$PUB_KEY" >> "$AUTH_KEYS"
                echo -e "${GREEN}Public key dari $(basename "$pem_file") berhasil ditambahkan ke authorized_keys.${NC}"
            else
                echo -e "Public key dari $(basename "$pem_file") sudah ada di authorized_keys (dilewati)."
            fi
            EXISTING_PEM_FOUND=true
        else
            echo -e "${RED}Gagal mengekstrak public key dari $(basename "$pem_file").${NC}"
        fi
    fi
done

# B. Selalu buat Key Pair Baru khusus untuk server ini
NEW_KEY_NAME="vps-deployer-key"
NEW_KEY_PATH="$SCRIPT_DIR/$NEW_KEY_NAME.pem"

if [ ! -f "$NEW_KEY_PATH" ]; then
    echo -e "\nMembuat SSH Key Pair baru khusus server ini..."
    ssh-keygen -t rsa -b 4096 -f "$SCRIPT_DIR/$NEW_KEY_NAME" -N "" -q
    mv "$SCRIPT_DIR/$NEW_KEY_NAME" "$NEW_KEY_PATH"
    chmod 600 "$NEW_KEY_PATH"
    
    # Tambahkan public key baru ke authorized_keys
    cat "$NEW_KEY_PATH.pub" >> "$AUTH_KEYS"
    
    echo -e "${GREEN}SSH Key Pair baru berhasil dibuat:${NC}"
    echo -e " - Private Key: ${CYAN}$NEW_KEY_PATH${NC}"
    echo -e " - Public Key : ${CYAN}$NEW_KEY_PATH.pub${NC}"
    echo -e "   (Public key telah otomatis ditambahkan ke authorized_keys)"
else
    echo -e "SSH Key Pair baru '${NEW_KEY_NAME}.pem' sudah ada di folder repositori."
fi

# C. Atur Hak Akses File SSH agar aman
chmod 700 "$SSH_DIR"
chmod 600 "$AUTH_KEYS"
chown -R "$REAL_USER":"$REAL_USER" "$SSH_DIR"

# Jika file pub/pem dibuat sebagai root, ubah pemiliknya ke user asli agar bisa di-pull/read
chown "$REAL_USER":"$REAL_USER" "$NEW_KEY_PATH" 2>/dev/null || true
chown "$REAL_USER":"$REAL_USER" "$NEW_KEY_PATH.pub" 2>/dev/null || true

# 6. Restart Layanan SSH untuk menerapkan konfigurasi
echo -e "\n${YELLOW}Memuat ulang layanan SSH...${NC}"
if systemctl restart sshd &>/dev/null; then
    echo -e "${GREEN}Layanan SSHD berhasil dimuat ulang.${NC}"
elif systemctl restart ssh &>/dev/null; then
    echo -e "${GREEN}Layanan SSH berhasil dimuat ulang.${NC}"
else
    echo -e "${RED}Gagal merestart layanan SSH. Silakan restart manual.${NC}"
fi

echo -e "\n${GREEN}==========================================================${NC}"
echo -e "${GREEN}               SELESAI - SSH SIAP DIGUNAKAN                ${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo -e "Untuk menghubungkan dari Windows menggunakan key pair baru ini:"
echo -e "1. Salin berkas private key dari Linux ke Windows:"
echo -e "   Path Linux: ${CYAN}$NEW_KEY_PATH${NC}"
echo -e "2. Jalankan perintah di PowerShell Windows Anda:"
echo -e "   ${CYAN}ssh -i .\\$NEW_KEY_NAME.pem ${REAL_USER}@<IP_VPS>${NC}"
echo -e "=========================================================="
