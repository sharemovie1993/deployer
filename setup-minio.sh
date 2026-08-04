#!/bin/bash
# ==============================================================================
# Script Pemasangan & Konfigurasi MinIO Self-Hosted S3 Storage Server for Absenta
# ==============================================================================

set -e

MINIO_DATA_DIR="/var/www/minio-data"
MINIO_CONSOLE_PORT=9001
MINIO_API_PORT=9000
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"
BUCKET_NAME="${S3_BUCKET:-absenta-storage}"

echo "======================================================================"
echo "  PEMASANGAN MINIO SELF-HOSTED S3 STORAGE SERVER FOR ABSENTA ON-PREM"
echo "======================================================================"

# 1. Unduh Binary MinIO jika belum ada
if [ ! -f /usr/local/bin/minio ]; then
  echo "📥 Mengunduh binary MinIO Server..."
  curl -sSL "https://dl.min.io/server/minio/release/linux-amd64/minio" -o /usr/local/bin/minio
  chmod +x /usr/local/bin/minio
  echo "✅ Binary MinIO berhasil diunduh ke /usr/local/bin/minio"
fi

# 2. Unduh MinIO Client (mc) untuk manajemen & backup
if [ ! -f /usr/local/bin/mc ]; then
  echo "📥 Mengunduh MinIO Client (mc)..."
  curl -sSL "https://dl.min.io/client/mc/release/linux-amd64/mc" -o /usr/local/bin/mc
  chmod +x /usr/local/bin/mc
  echo "✅ MinIO Client (mc) berhasil diunduh."
fi

# 3. Buat Folder Data MinIO
mkdir -p "$MINIO_DATA_DIR"

# 4. Buat Systemd Service File (/etc/systemd/system/minio.service)
cat <<EOF > /etc/systemd/system/minio.service
[Unit]
Description=MinIO S3 Storage Server for Absenta
Documentation=https://docs.min.io
After=network.target

[Service]
Type=simple
User=root
Group=root
Environment="MINIO_ROOT_USER=${MINIO_USER}"
Environment="MINIO_ROOT_PASSWORD=${MINIO_PASS}"
ExecStart=/usr/local/bin/minio server ${MINIO_DATA_DIR} --console-address ":${MINIO_CONSOLE_PORT}" --address ":${MINIO_API_PORT}"
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# 5. Reload systemd & Aktifkan Service MinIO
systemctl daemon-reload
systemctl enable minio
systemctl restart minio
echo "🟢 Service MinIO berhasil diaktifkan & dijalankan."

# Wait for MinIO to start up
sleep 3

# 6. Konfigurasi Client mc & Buat Bucket Otomatis
echo "📦 Inisialisasi Bucket '${BUCKET_NAME}' di MinIO..."
/usr/local/bin/mc alias set local http://127.0.0.1:${MINIO_API_PORT} "${MINIO_USER}" "${MINIO_PASS}" --api s3v4 || true
/usr/local/bin/mc mb local/"${BUCKET_NAME}" --ignore-existing || true
/usr/local/bin/mc anonymous set download local/"${BUCKET_NAME}" || true
echo "✅ Bucket '${BUCKET_NAME}' siap digunakan!"

# 7. Buat Script 1-Click Backup untuk Admin Sekolah
cat <<EOF > /usr/local/bin/absenta-backup-minio
#!/bin/bash
BACKUP_DEST=\${1:-/var/www/backups/minio}
echo "📦 Memulai Backup Data Storage MinIO ke \${BACKUP_DEST}..."
mkdir -p "\${BACKUP_DEST}"
/usr/local/bin/mc mirror local/${BUCKET_NAME} "\${BACKUP_DEST}"
echo "✅ Backup Storage MinIO Selesai! Berkas tersimpan di \${BACKUP_DEST}."
EOF
chmod +x /usr/local/bin/absenta-backup-minio

echo "======================================================================"
echo "🎉 PEMASANGAN MINIO SELF-HOSTED SELESAI!"
echo "   - S3 API Endpoint : http://127.0.0.1:${MINIO_API_PORT}"
echo "   - Web Console GUI : http://<IP_SERVER>:${MINIO_CONSOLE_PORT}"
echo "   - User / Password : ${MINIO_USER} / ${MINIO_PASS}"
echo "   - Bucket          : ${BUCKET_NAME}"
echo "   - Tool Backup     : absenta-backup-minio <folder_tujuan>"
echo "======================================================================"
