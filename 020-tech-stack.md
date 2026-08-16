# TECH STACK

## Backend (Server Lokal)

| Teknologi | Peran |
|-----------|-------|
| **Node.js (LTS v18+)** | Runtime server lokal `installer.js`. Menggunakan built-in modules (`http`, `fs`, `path`, `child_process`, `node:sqlite`) — tanpa dependensi eksternal (zero `npm install`). |
| **node:sqlite (Built-in)** | Penyimpanan preset konfigurasi deployment ke `presets.db` menggunakan SQLite native Node.js. |
| **PowerShell (v5.1+)** | Scripting engine utama untuk eksekusi provisioning server, koneksi SSH remote, dan konfigurasi layanan di Linux/Windows. |
| **VBScript (Windows Host)** | Wrapper untuk menjalankan `node installer.js` sebagai hidden background process di Windows tanpa jendela terminal. |

## Frontend GUI

| Teknologi | Peran |
|-----------|-------|
| **HTML5** | Satu file `public/index.html` berisi semua view/panel yang di-toggle via JavaScript. |
| **Vanilla CSS3** | Stylesheet glassmorphic premium (`public/css/style.css`) — dark mode, gradient, micro-animations. |
| **Vanilla JavaScript (ES6+)** | Modular per fitur di `public/js/` — navigasi, form handling, SSE client, fetch API calls. |
| **Google Fonts (Outfit & Fira Code)** | Tipografi antarmuka grafis dan terminal log. |
| **EventSource (SSE Client)** | Menerima stream log deployment real-time dari server via `GET /api/stream-*`. |

## Security & Communication

| Teknologi | Peran |
|-----------|-------|
| **OpenSSH Client** | Transmisi perintah remote terenkripsi dari Windows ke VPS Linux. |
| **icacls (Windows)** | Mengamankan permission file SSH key `.pem` sebelum koneksi SSH. |
| **chmod (Linux)** | Ekuivalen `icacls` di sisi Linux remote. |
| **HTTPS (Node.js native)** | Proxy call ke API server lisensi pusat (`api.absenta.id`). |
| **TCP Socket Check** | `net.Socket` ping ke port DB/SSH untuk validasi koneksi sebelum deployment. |

## Target Stack yang Dipasang di VPS

| Komponen | Peran di Server Target |
|----------|----------------------|
| **Node.js & PM2** | Runtime aplikasi & process manager cluster mode |
| **PostgreSQL** | Database relasional utama Absenta |
| **Redis** | Cache memory in-process / embedded |
| **Caddy Server** | Reverse proxy dengan auto-SSL (Let's Encrypt / Cloudflare DNS) |
| **WireGuard** | VPN tunnel untuk koneksi aman antar-node |

## PowerShell Deployment Scripts

| Script | Target | Fungsi |
|--------|--------|--------|
| `deploy-absenta-remote.ps1` | VPS Linux (SSH) | Full stack deploy: PostgreSQL, Redis, Node.js, PM2, Caddy |
| `deploy-cluster-remote.ps1` | Multi-VM Linux | Deploy terdistribusi ke beberapa node |
| `deploy-onprem-windows.ps1` | Windows Lokal | Instalasi on-premise intranet sekolah |
| `deploy-licensing-remote.ps1` | VPS Lisensi | Update server lisensi pusat |
| `deploy-general-remote.ps1` | VPS Linux | Deploy proyek umum |
| `deploy-remote-linux.ps1` | VPS Linux | Universal remote deployer |
| `deploy-manager.ps1` | Windows (interaktif) | Entry point menu terpusat |
| `easy-hardening.ps1` | VPS Linux | Firewall, SSH hardening, user provisioning |
| `easy-migrate.ps1` | VPS Linux | Sinkronisasi skema Prisma DB |
| `easy-purge.ps1` | VPS Linux | Pembersihan cache & log |
| `easy-resize.ps1` | VPS Linux | Pembesaran partisi disk |
| `easy-swap.ps1` | VPS Linux | Penskalaan swap memory |
| `easy-tuning.ps1` | VPS Linux | Optimasi kernel & sysctl |
| `easy-update-remote.ps1` | VPS Linux | Quick update kode aplikasi |
| `easy-update-config.ps1` | VPS Linux | Update konfigurasi `.env` |
| `easy-setup-ssh.ps1` | VPS Linux | Provisioning SSH key baru |
| `easy-seed-wilayah-remote.ps1` | VPS Linux | Seed data wilayah Indonesia |
| `easy-tunnel-fix.ps1` | VPS Linux | Perbaikan tunnel WireGuard |
