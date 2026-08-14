#!/bin/bash
# ==============================================================================
# Script Pemasangan & Konfigurasi Coturn STUN/TURN Relay Server for Absenta
# ==============================================================================

set -e

TURN_PORT=3478
TURNS_PORT=5349
MIN_PORT=49152
MAX_PORT=65535
# 0. Ambil secret eksisting jika script dijalankan ulang (Idempotent)
EXISTING_SECRET=""
if [ -f /etc/turnserver.conf ]; then
  EXISTING_SECRET=$(grep "^static-auth-secret=" /etc/turnserver.conf 2>/dev/null | cut -d'=' -f2 | tr -d ' ' || true)
fi

REALM="${TURN_REALM:-absenta.id}"
SECRET_KEY="${TURN_SECRET:-${EXISTING_SECRET:-$(openssl rand -hex 32)}}"
LISTENING_IP=$(hostname -I | awk '{print $1}')
PUBLIC_IP=$(curl -s4 https://api.ipify.org || echo "${LISTENING_IP}")

echo "======================================================================"
echo "  PEMASANGAN COTURN STUN/TURN RELAY SERVER FOR ABSENTA VIDEO MEETING"
echo "======================================================================"
echo "  - IP Server Publik : ${PUBLIC_IP}"
echo "  - Listening IP     : ${LISTENING_IP}"
echo "  - Port STUN/TURN   : ${TURN_PORT} (UDP/TCP)"
echo "  - Port TURNS       : ${TURNS_PORT} (UDP/TCP)"
echo "  - Port Relay Media : ${MIN_PORT}:${MAX_PORT} (UDP)"
echo "  - Realm            : ${REALM}"
echo "======================================================================"

# 1. Update Repository & Install Coturn
echo "📥 Menginstall paket coturn..."
apt-get update -yqq
apt-get install -yqq coturn

# 2. Aktifkan Coturn di /etc/default/coturn
echo "⚙️ Mengaktifkan daemon Coturn di /etc/default/coturn..."
mkdir -p /etc/default
cat <<EOF > /etc/default/coturn
TURNSERVER_ENABLED=1
EOF

# 3. Backup konfigurasi lama jika ada
if [ -f /etc/turnserver.conf ]; then
  cp /etc/turnserver.conf /etc/turnserver.conf.bak.$(date +%F_%T)
fi

# 4. Buat file konfigurasi /etc/turnserver.conf yang hardened & optimal
echo "📝 Menulis konfigurasi /etc/turnserver.conf..."
cat <<EOF > /etc/turnserver.conf
# ==========================================================
# Coturn Server Configuration for Absenta Virtual Meeting
# ==========================================================
listening-port=${TURN_PORT}
tls-listening-port=${TURNS_PORT}

# External IP NAT mapping
external-ip=${PUBLIC_IP}/${LISTENING_IP}

# Relay Port Allocation for WebRTC Video/Audio
min-port=${MIN_PORT}
max-port=${MAX_PORT}

# Security & Authentication (Time-Limited Long-Term Credentials)
use-auth-secret
static-auth-secret=${SECRET_KEY}
realm=${REALM}

# Hardening & Anti-Abuse Controls
fingerprint
lt-cred-mech
stale-nonce=600
no-multicast-peers
no-cli
no-loopback-peers
no-tcp-relay

# Logging
log-file=/var/log/coturn/turnserver.log
simple-log
verbose
EOF

# 5. Siapkan direktori log dan permission
mkdir -p /var/log/coturn
touch /var/log/coturn/turnserver.log
chmod 644 /etc/turnserver.conf
chown -R turnserver:turnserver /var/log/coturn /etc/turnserver.conf 2>/dev/null || true

# 6. Konfigurasi Firewall UFW
if command -v ufw >/dev/null 2>&1; then
  echo "🛡️ Membuka port di UFW Firewall..."
  ufw allow ${TURN_PORT}/tcp || true
  ufw allow ${TURN_PORT}/udp || true
  ufw allow ${TURNS_PORT}/tcp || true
  ufw allow ${TURNS_PORT}/udp || true
  ufw allow ${MIN_PORT}:${MAX_PORT}/udp || true
fi

# 7. Hardening Systemd Auto-Restart & Auto-Start Saat Reboot
echo "🛡️ Memasang Systemd Auto-Restart & Auto-Start untuk Coturn..."
mkdir -p /etc/systemd/system/coturn.service.d
cat <<EOF > /etc/systemd/system/coturn.service.d/restart.conf
[Service]
Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=10
EOF

echo "🟢 Memulai service coturn..."
systemctl unmask coturn 2>/dev/null || true
systemctl daemon-reload
systemctl enable coturn
systemctl restart coturn

# 8. Output Credentials untuk Backend Absenta (.env)
echo "======================================================================"
echo "🎉 PEMASANGAN COTURN SELESAI & SERVICE AKTIF!"
echo "======================================================================"
echo "Tambahkan konfigurasi berikut ke file .env di absenta_backend:"
echo ""
echo "COTURN_ENABLED=true"
echo "COTURN_DOMAIN=${PUBLIC_IP}"
echo "COTURN_PORT=${TURN_PORT}"
echo "COTURN_SECRET=${SECRET_KEY}"
echo "======================================================================"
