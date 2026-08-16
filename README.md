# Absenta Deployer & Maintenance Wizard

Repositori ini berisi **Absenta Deployer** — sebuah toolset orkestrasi deployment dan pemeliharaan server berbasis GUI web yang dirancang untuk memudahkan pemasangan ekosistem **Absenta.id** ke berbagai skenario infrastruktur server.

---

## Fitur Utama

1. **GUI Setup Wizard (6 Tahap)**: Antarmuka web interaktif yang memandu pengisian parameter instalasi (OS target, SSH key, Database, Lisensi), validasi koneksi, hingga eksekusi deployment satu klik.
2. **Remote Linux Deployer via SSH**: Mengorkestrasi pemasangan stack penuh (Node.js, PostgreSQL, Redis, PM2, Caddy) ke VPS Linux secara remote melalui SSH dari Windows.
3. **Multi-VM Cluster Deploy**: Mendistribusikan deployment ke beberapa node VPS sekaligus (API nodes, WA node, Load Balancer, DB node) dengan satu perintah.
4. **Preset Management**: Menyimpan konfigurasi deployment yang sering digunakan ke database lokal (SQLite) untuk digunakan ulang tanpa mengisi ulang formulir.
5. **Server Maintenance Utilities**: Kumpulan skrip otomasi untuk hardening keamanan, penskalaan swap & disk, pembersihan log, migrasi database, dan perbaikan tunnel WireGuard.
6. **SSE Real-Time Log Streaming**: Seluruh log output proses deployment dikirim secara baris-demi-baris ke browser secara langsung menggunakan Server-Sent Events.
7. **Health & PM2 Monitoring**: Panel pemantauan status server, proses PM2, dan koneksi tunnel secara real-time.
8. **License Verification**: Verifikasi dan tampilan detail metadata lisensi server langsung dari panel GUI.

---

## Cara Menjalankan

### Di Windows (Cara Termudah)
Klik ganda **`Mulai Installer Absenta.bat`** — skrip VBScript akan menjalankan server `installer.js` secara tersembunyi di latar belakang dan membuka browser secara otomatis.

### Via Command Line
```powershell
node installer.js
```
Kemudian buka browser ke: `http://localhost:8080`

> Server akan otomatis mencari port kosong mulai dari `8080` jika port tersebut sudah terpakai.

---

## Struktur Proyek

```
deployer/
├── installer.js                   # Entry point — Node.js HTTP server
├── src/                           # Backend modular
│   ├── routes.js                  # Router utama semua endpoint API
│   ├── sse.js                     # SSE streaming handler (install, cluster, update, logs)
│   ├── preset-store.js            # CRUD preset ke SQLite (presets.db)
│   ├── ssh-helper.js              # Helper spawn SSH subprocess
│   └── controllers/               # Controller per domain fitur
│       ├── installer.controller.js  # Save config, test SSH, test DB, verify license
│       ├── connection.controller.js # Test SSH & DB connection
│       ├── health.controller.js     # Status PM2, server metrics, tunnel health
│       ├── preset.controller.js     # List/save/delete preset
│       └── tunnel.controller.js     # Manajemen tunnel WireGuard
├── public/                        # Frontend GUI (disajikan sebagai static files)
│   ├── index.html                 # Satu file HTML utama (multi-view SPA)
│   ├── css/style.css              # Stylesheet glassmorphic premium
│   └── js/                        # JavaScript per modul halaman
│       ├── app.js                 # Navigation, mode switching, shared utilities
│       ├── wizard.js              # Full Setup Wizard (6 langkah)
│       ├── presets.js             # Quick Deploy & Preset management
│       ├── preset-picker.js       # Dropdown picker preset
│       ├── cluster.js             # Multi-VM Cluster Deploy
│       ├── health.js              # Server Health & PM2 monitoring
│       └── logs.js                # PM2 log streaming viewer
├── tests/                         # Regression test suite
│   └── regression-test.js
│
│   [PowerShell Deployment Scripts]
├── deploy-absenta-remote.ps1      # Deploy full stack ke VPS Linux via SSH
├── deploy-cluster-remote.ps1      # Deploy ke multi-VM cluster
├── deploy-onprem-windows.ps1      # Instalasi lokal Windows on-premise
├── deploy-licensing-remote.ps1    # Deploy/update licensing server
├── deploy-general-remote.ps1      # Deploy proyek umum via SSH
├── deploy-remote-linux.ps1        # Universal remote Linux deployer
├── deploy-manager.ps1             # Manager terpusat (entry point interaktif)
│
│   [Easy Maintenance Utilities]
├── easy-hardening.ps1             # Hardening keamanan server (firewall, user, SSH)
├── easy-migrate.ps1               # Sinkronisasi skema database Prisma
├── easy-purge.ps1                 # Pembersihan cache & log sampah
├── easy-resize.ps1                # Pembesaran partisi disk
├── easy-swap.ps1                  # Penskalaan memori virtual swap
├── easy-tuning.ps1                # Optimasi performa kernel & sysctl
├── easy-update-remote.ps1         # Quick update kode aplikasi di VPS
├── easy-update-config.ps1         # Update konfigurasi .env di VPS
├── easy-setup-ssh.ps1             # Provisioning SSH key ke server baru
├── easy-seed-wilayah-remote.ps1   # Seed data wilayah Indonesia ke DB
├── easy-tunnel-fix.ps1            # Perbaikan tunnel WireGuard multi-server
│
│   [Launcher & Config]
├── Mulai Installer Absenta.bat    # Double-click launcher (Windows)
├── run.bat                        # Alternatif launcher CLI
├── presets.db                     # Database SQLite preset lokal
└── logs/                          # Log deployment lokal (di-gitignore)
```

---

## Alur Kerja

```
[Operator/Teknisi]
      │
      ▼
Klik Mulai Installer Absenta.bat
      │
      ▼
installer.js UP di port 8080 (auto-detect port kosong)
Browser terbuka otomatis
      │
      ▼
Pilih Mode di GUI:
  ├─ [Full Setup Wizard]     → Isi 6 langkah → Mulai deploy via SSE stream
  ├─ [Quick Deploy Presets]  → Pilih preset tersimpan → Satu klik deploy
  ├─ [Multi-VM Cluster]      → Input node-node VPS → Deploy paralel
  ├─ [Server Health]         → Monitor PM2 / server metrics
  └─ [Logs]                  → Lihat log PM2 live
      │
      ▼
Backend spawn PowerShell → deploy-absenta-remote.ps1
Output log SSE → tampil real-time di browser
      │
      ▼
[INSTALL_COMPLETE] ✓
```

---

## Endpoint API

| Method | Path | Deskripsi |
|--------|------|-----------|
| `POST` | `/api/save-config` | Simpan konfigurasi wizard ke `global.installParams` |
| `POST` | `/api/test-ssh` | Tes koneksi SSH ke server target |
| `POST` | `/api/test-db` | Tes koneksi PostgreSQL/Redis |
| `POST` | `/api/verify-license` | Verifikasi & ambil detail metadata lisensi |
| `GET`  | `/api/stream-install` | SSE stream log deployment (Full Setup) |
| `GET`  | `/api/stream-cluster-install` | SSE stream log deployment cluster |
| `GET`  | `/api/stream-quick-update` | SSE stream quick update via preset |
| `GET`  | `/api/stream-seed-wilayah` | SSE stream seed data wilayah |
| `GET`  | `/api/stream-setup-ssh` | SSE stream provisioning SSH key |
| `GET`  | `/api/stream-pm2-logs` | SSE stream PM2 log viewer |
| `GET`  | `/api/health` | Ambil status PM2 & metrics server |
| `GET`  | `/api/presets` | Daftar semua preset tersimpan |
| `POST` | `/api/presets` | Simpan preset baru |
| `DELETE` | `/api/presets/:id` | Hapus preset |

---

## Konvensi Pengembangan

### Streaming Console Log
- **Wajib** gunakan call operator `&` untuk memanggil SSH/PowerShell native — bukan `Invoke-Expression` — agar output dapat di-stream baris-demi-baris.
- Seluruh stdout & stderr subprocess di-pipe ke SSE endpoint secara real-time.

### Mode Silent pada Script
Seluruh skrip deployment wajib mendukung flag `-Silent` agar dapat dieksekusi tanpa input manual dari GUI backend:
```powershell
powershell -ExecutionPolicy Bypass -File deploy-absenta-remote.ps1 -Silent -TargetIP 10.0.0.1 ...
```

### Penyimpanan Log
- Log lokal disimpan di folder `logs/` (sudah di-gitignore).
- Log remote di Linux disimpan ke `/tmp/deploy.log` terlebih dahulu sebelum dipindah ke folder target.

### Penamaan Proses PM2
Nama aplikasi di VPS harus seragam: `absenta-backend` dan `absenta-frontend`.

### SSH Key Security
Sebelum koneksi SSH, file `.pem` wajib diamankan permissionnya:
- **Windows**: `icacls` — cabut inheritance, beri akses hanya user aktif.
- **Linux**: `chmod 600`.

---

## Persyaratan Sistem (Sisi Operator/Teknisi)

| Komponen | Versi Minimum |
|----------|---------------|
| Node.js | LTS (v18+) |
| PowerShell | 5.1+ (Windows) |
| OpenSSH Client | Tersedia di Windows 10+ |
| Browser | Chrome / Edge / Firefox terbaru |
