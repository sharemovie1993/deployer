# CURRENT STATE

## Completed

### GUI & Backend
- **Modular Backend Architecture**: `installer.js` (entry point) → `src/routes.js` (router) → `src/controllers/` (5 controller per domain) → `src/sse.js` (streaming handler) → `src/preset-store.js` (SQLite) → `src/ssh-helper.js` (SSH utility).
- **Full Setup Wizard (6 Tahap)**: Wizard web interaktif untuk konfigurasi instalasi penuh — pilih OS, SSH params, domain & port, DB URL, license key, hingga eksekusi deployment dengan SSE log real-time.
- **Quick Deploy via Preset**: Sistem preset tersimpan di SQLite — simpan, pilih, dan deploy ulang konfigurasi server dalam satu klik.
- **Multi-VM Cluster Deploy**: Panel untuk mendeploy ke beberapa node VPS sekaligus dengan SSE log stream.
- **Server Health & PM2 Monitor**: Dashboard real-time status PM2 processes, server metrics, dan health tunnel WireGuard.
- **PM2 Log Viewer**: Streaming log PM2 live dari server target via SSE.
- **License Verification**: Verifikasi lisensi ke `api.absenta.id` dengan tampilan metadata lengkap (nama sekolah, domain, status, expiry).
- **SSH Connection Test**: Validasi koneksi SSH ke server target sebelum deployment.
- **DB Connection Test**: Validasi koneksi PostgreSQL / Redis (mendukung format URL string maupun object host:port).
- **Hidden Window Launcher**: `Mulai Installer Absenta.bat` menggunakan VBScript wrapper untuk inisialisasi server lokal secara senyap tanpa jendela terminal.
- **Port Collision Resolver**: Auto-detect port kosong mulai dari `8080`.

### PowerShell Scripts
- **`deploy-absenta-remote.ps1`**: Full stack deploy ke VPS Linux via SSH (PostgreSQL, Redis, Node.js, PM2, Caddy, SSL).
- **`deploy-cluster-remote.ps1`**: Deploy multi-node cluster.
- **`deploy-onprem-windows.ps1`**: Instalasi lokal Windows on-premise.
- **`deploy-licensing-remote.ps1`**: Update server lisensi pusat.
- **`easy-hardening.ps1`**: Hardening server (firewall, user, SSH config).
- **`easy-migrate.ps1`**: Sinkronisasi skema Prisma & tunnel repair.
- **`easy-purge.ps1`**: Pembersihan cache & log sampah harian.
- **`easy-resize.ps1`** + **`setup-resize.sh`**: Pembesaran partisi disk.
- **`easy-swap.ps1`** + **`setup-swap.sh`**: Penskalaan memori virtual swap.
- **`easy-setup-ssh.ps1`** + **`setup-ssh.sh`**: Provisioning SSH key ke server baru.
- **`easy-seed-wilayah-remote.ps1`**: Seed data wilayah Indonesia ke DB.
- **`easy-tunnel-fix.ps1`**: Perbaikan tunnel WireGuard multi-server.
- **`easy-update-remote.ps1`**: Quick update kode aplikasi di VPS.
- **`easy-update-config.ps1`**: Update konfigurasi `.env` di VPS.
- **`easy-tuning.ps1`**: Optimasi performa kernel & sysctl.

### Tests
- **Regression Test Suite** (`tests/regression-test.js`): 16+ test case mencakup health API, preset CRUD, SSH test, DB test, license verify, dan SSE stream endpoints.

## In Progress
- Tidak ada

## Current Focus
- Stabilisasi fitur Full Setup Wizard untuk target Linux Remote.
- Dokumentasi disesuaikan dengan arsitektur modular terkini.

## Next Task
- Packaging deployer untuk distribusi ke teknisi/operator sekolah.
- Evaluasi strategi distribusi: bundle `absenta_dist.tar.gz` atau download-on-demand via license server.
