#!/bin/bash

# ==============================================================================
# setup-tuning.sh
# Skrip Tuning Kernel & System Linux Produksi - Project Absenta
# Skenario: On-Premise & SaaS Multi-Tenant (High Concurrency Attendance Rush)
# Harus dijalankan dengan hak akses root atau sudo.
# ==============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}==========================================================${NC}"
echo -e "${YELLOW}      TUNING KERNEL & SISTEM PRODUKSI ABSENTA (LINUX)     ${NC}"
echo -e "${CYAN}==========================================================${NC}"

# 1. Pastikan dijalankan sebagai root/sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Harap jalankan script ini dengan sudo atau sebagai root!${NC}"
    echo -e "Contoh: sudo ./setup-tuning.sh"
    exit 1
fi

# 2. Deteksi Spesifikasi Server
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
CPU_CORES=$(nproc)
TOTAL_RAM_GB=$(awk "BEGIN {printf \"%.1f\", $TOTAL_RAM_MB / 1024}")
HOST_NAME=$(hostname)
KERNEL_VER=$(uname -r)

echo -e "Spesifikasi Server Terdeteksi:"
echo -e " - Hostname       : ${GREEN}${HOST_NAME}${NC}"
echo -e " - Kernel         : ${GREEN}${KERNEL_VER}${NC}"
echo -e " - CPU Cores      : ${GREEN}${CPU_CORES} Cores${NC}"
echo -e " - RAM Fisik      : ${GREEN}${TOTAL_RAM_GB} GB${NC} (${TOTAL_RAM_MB} MB)"
echo -e "----------------------------------------------------------"

# 3. Kernel Sysctl Parameters Tuning (/etc/sysctl.d/99-absenta-tuning.conf)
echo -e "${CYAN}[1/5] Mengonfigurasi Parameter Kernel Sysctl...${NC}"
cat << 'EOF' > /etc/sysctl.d/99-absenta-tuning.conf
# ==============================================================================
# Absenta Production Sysctl Configuration
# Optimized for Node.js, PostgreSQL, Redis, Nginx & Docker
# ==============================================================================

# File Descriptors & Inotify Watchers
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288

# Memory Management (Optimized for PostgreSQL & Redis)
vm.swappiness = 10
vm.overcommit_memory = 1
vm.max_map_count = 262144

# High Concurrency Socket Queues (Attendance Peak 07:00 AM Rush)
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1

# TCP Socket Buffer Sizes (16MB Max)
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# TCP Keepalive for Long-Lived WebSockets
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 15
net.ipv4.tcp_keepalive_probes = 5
EOF

sysctl --system > /dev/null 2>&1
echo -e "${GREEN}✓ Sysctl kernel parameters berhasil diperbarui & dimuat!${NC}"

# 4. Security & User Limits Tuning (/etc/security/limits.d/99-absenta-limits.conf)
echo -e "${CYAN}[2/5] Mengonfigurasi Security & Open File Limits...${NC}"
cat << 'EOF' > /etc/security/limits.d/99-absenta-limits.conf
*                soft    nofile          65536
*                hard    nofile          1048576
*                soft    nproc           65536
*                hard    nproc           65536
root             soft    nofile          65536
root             hard    nofile          1048576
root             soft    nproc           65536
root             hard    nproc           65536
EOF
echo -e "${GREEN}✓ Open File & Process limits (65,536 - 1,048,576) berhasil diterapkan!${NC}"

# 5. Docker Daemon Production Tuning (/etc/docker/daemon.json)
echo -e "${CYAN}[3/5] Mengonfigurasi Docker Engine Log Rotation & Live Restore...${NC}"
mkdir -p /etc/docker
cat << 'EOF' > /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  },
  "live-restore": true,
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 1048576,
      "Soft": 65536
    }
  }
}
EOF

if command -v systemctl >/dev/null 2>&1; then
    systemctl reload docker || systemctl restart docker || true
fi
echo -e "${GREEN}✓ Docker Daemon log rotation (Max 50MB x 5) & ulimits berhasil di-tuning!${NC}"

# 6. PostgreSQL & Redis Dynamic Hardware-Adaptive Tuning
echo -e "${CYAN}[4/6] Mengonfigurasi Auto-Tuning PostgreSQL & Redis (RAM Adaptive)...${NC}"

# Calculate PostgreSQL Parameters based on TOTAL_RAM_MB
# shared_buffers = 25% of RAM (Cap at 8GB)
PG_SHARED_BUFFERS_MB=$((TOTAL_RAM_MB / 4))
if [ $PG_SHARED_BUFFERS_MB -gt 8192 ]; then
    PG_SHARED_BUFFERS_MB=8192
fi

# effective_cache_size = 75% of RAM
PG_EFFECTIVE_CACHE_MB=$((TOTAL_RAM_MB * 3 / 4))

# max_connections: Adaptive based on RAM
if [ $TOTAL_RAM_MB -ge 16000 ]; then
    PG_MAX_CONN=500
elif [ $TOTAL_RAM_MB -ge 8000 ]; then
    PG_MAX_CONN=300
else
    PG_MAX_CONN=200
fi

# Calculate Redis Parameters based on TOTAL_RAM_MB
# maxmemory = 20% of RAM
REDIS_MAX_MEM_MB=$((TOTAL_RAM_MB / 5))
if [ $REDIS_MAX_MEM_MB -lt 512 ]; then
    REDIS_MAX_MEM_MB=512
fi

mkdir -p /etc/absenta/config

cat << EOF > /etc/absenta/config/postgresql.conf
# ==============================================================================
# Absenta Production Optimized PostgreSQL Configuration
# Auto-Calculated for ${TOTAL_RAM_MB}MB RAM (${TOTAL_RAM_GB}GB) & ${CPU_CORES} CPU Cores
# ==============================================================================
max_connections = ${PG_MAX_CONN}
shared_buffers = ${PG_SHARED_BUFFERS_MB}MB
effective_cache_size = ${PG_EFFECTIVE_CACHE_MB}MB
work_mem = 32MB
maintenance_work_mem = 512MB
min_wal_size = 1GB
max_wal_size = 4GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
max_worker_processes = ${CPU_CORES}
max_parallel_workers_per_gather = 2
max_parallel_workers = ${CPU_CORES}
EOF

cat << EOF > /etc/absenta/config/redis.conf
# ==============================================================================
# Absenta Production Optimized Redis Configuration
# Auto-Calculated for ${TOTAL_RAM_MB}MB RAM (${TOTAL_RAM_GB}GB)
# ==============================================================================
maxmemory ${REDIS_MAX_MEM_MB}mb
maxmemory-policy allkeys-lru
tcp-backlog 65535
timeout 0
tcp-keepalive 300
EOF

echo -e "${GREEN}✓ Konfigurasi Postgres (Shared Buffers: ${PG_SHARED_BUFFERS_MB}MB, Conn: ${PG_MAX_CONN}) & Redis (MaxMem: ${REDIS_MAX_MEM_MB}MB, Policy: allkeys-lru) ter-generate di /etc/absenta/config/!${NC}"

# 7. Waktu & Zona Waktu (NTP Synchronization)
TARGET_TZ="${1:-UTC}"
echo -e "${CYAN}[5/6] Mengonfigurasi Zona Waktu ($TARGET_TZ) & Synchronisasi Waktu (NTP)...${NC}"
timedatectl set-timezone "$TARGET_TZ" || true
timedatectl set-ntp true || true
echo -e "${GREEN}✓ Zona waktu di-set ke $TARGET_TZ & NTP sinkronisasi aktif!${NC}"

# 8. Network Firewall Minimalis (UFW)
echo -e "${CYAN}[6/6] Mengonfigurasi Firewall UFW Minimalis...${NC}"
if command -v ufw >/dev/null 2>&1; then
    ufw allow 22/tcp >/dev/null 2>&1 || true
    ufw allow 80/tcp >/dev/null 2>&1 || true
    ufw allow 443/tcp >/dev/null 2>&1 || true
    echo "y" | ufw enable >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ UFW Firewall aktif (Port 22, 80, 443 diizinkan)!${NC}"
else
    echo -e "${YELLOW}Peringatan: UFW tidak terpasang. Melewati konfigurasi firewall.${NC}"
fi

echo -e "----------------------------------------------------------"
echo -e "${GREEN}✅ TUNING SISTEM PRODUKSI ABSENTA BERHASIL SELESAI!${NC}"
echo -e "${CYAN}Server (OS Kernel, Postgres DB, Redis Cache, Docker) Siap untuk On-Premise maupun SaaS!${NC}"
