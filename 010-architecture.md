# ARCHITECTURE

## Komponen Backend (Node.js)

### Entry Point
- **`installer.js`**: Bootstrap server HTTP Node.js. Mendeteksi port kosong mulai dari `8080` secara rekursif, menulis URL aktif ke `active_url.txt`, lalu memuat `src/routes.js`.

### Routing Layer
- **`src/routes.js`**: Router tunggal yang memetakan semua path HTTP ke handler yang sesuai. Mem-parse URL, menentukan method, dan mendelegasikan ke controller atau SSE handler.

### Controller Layer (`src/controllers/`)
Setiap controller menangani satu domain fungsionalitas:

| File | Tanggung Jawab |
|------|----------------|
| `installer.controller.js` | `handleSaveConfig` — simpan params wizard ke `global.installParams`; `handleVerifyLicense` — verifikasi & metadata lisensi; `handleTestDb` — tes koneksi PostgreSQL/Redis |
| `connection.controller.js` | `handleTestSsh` — tes koneksi SSH ke VPS target |
| `health.controller.js` | `handleGetHealth` — query PM2, server metrics, tunnel WireGuard |
| `preset.controller.js` | `handleListPresets`, `handleSavePreset`, `handleDeletePreset` — CRUD preset ke SQLite |
| `tunnel.controller.js` | `handleTunnelActions` — kelola koneksi WireGuard tunnel |

### SSE Streaming Layer (`src/sse.js`)
Menangani semua endpoint Server-Sent Events yang men-spawn subprocess PowerShell dan meneruskan stdout/stderr ke browser baris-demi-baris:

| Fungsi | Endpoint | Script yang Dipanggil |
|--------|----------|----------------------|
| `handleStreamInstall` | `/api/stream-install` | `deploy-absenta-remote.ps1` (Linux) / `deploy-onprem-windows.ps1` (Windows) |
| `handleStreamClusterInstall` | `/api/stream-cluster-install` | `deploy-cluster-remote.ps1` |
| `handleStreamQuickUpdate` | `/api/stream-quick-update` | `easy-update-remote.ps1` |
| `handleStreamSeedWilayah` | `/api/stream-seed-wilayah` | `easy-seed-wilayah-remote.ps1` |
| `handleStreamSetupSsh` | `/api/stream-setup-ssh` | `easy-setup-ssh.ps1` |
| `handleStreamPm2Logs` | `/api/stream-pm2-logs` | SSH remote `pm2 logs` |

### Preset Store (`src/preset-store.js`)
Abstraksi SQLite menggunakan Node.js built-in `node:sqlite`. Menyimpan preset konfigurasi deployment ke `presets.db` di root proyek.

### SSH Helper (`src/ssh-helper.js`)
Helper untuk membentuk argumen SSH dengan benar, mengamankan permission file `.pem` via `icacls`, dan men-spawn subprocess SSH.

---

## Komponen Frontend (Static Web GUI)

### `public/index.html`
Satu file HTML monolitik yang berisi seluruh view/panel dalam bentuk `<div>` yang di-toggle visibilitasnya. Tidak ada routing client-side framework — navigasi dikendalikan oleh JavaScript murni.

### `public/css/style.css`
Stylesheet premium dengan desain glassmorphic, dark mode, dan micro-animations. Menggunakan Google Fonts (Outfit & Fira Code).

### `public/js/` — Modul JavaScript per Fitur

| File | Fitur yang Dikendalikan |
|------|------------------------|
| `app.js` | Mode switching (Install/Maintenance), navigasi tab, shared utility functions |
| `wizard.js` | Full Setup Wizard 6 langkah (OS selection, SSH config, domain, DB, license, summary) |
| `presets.js` | Quick Deploy via preset, CRUD form preset, SSE log viewer preset |
| `preset-picker.js` | Dropdown picker preset (digunakan di beberapa view) |
| `cluster.js` | Multi-VM Cluster Deploy: input node IPs, SSE log stream cluster |
| `health.js` | Health dashboard: status PM2, server metrics, PM2 process list, reload/restart actions |
| `logs.js` | PM2 log streaming viewer via SSE |

---

## Pola Arsitektur

### Hidden Background Initialization
`Mulai Installer Absenta.bat` menggunakan VBScript wrapper (`.launch.vbs`) agar `node installer.js` berjalan sebagai background process Windows tanpa jendela terminal hitam yang mengganggu.

### Server-Sent Events (SSE) Log Pipe
Setiap deployment dieksekusi sebagai subprocess `powershell.exe` yang di-spawn oleh Node.js. Output `stdout` dan `stderr` ditangkap via `process.stdout.on('data')` dan dipancarkan ke browser menggunakan format `data: <line>\n\n`.

### Global Config Store
Wizard menyimpan konfigurasi via `POST /api/save-config` ke `global.installParams`. SSE handler membaca `global.installParams` saat stream dimulai untuk mendapatkan parameter deployment yang benar.

### Port Collision Resolver
`installer.js` mendeteksi port `8080` yang terpakai, lalu secara rekursif mencoba `8080+n` sampai menemukan port kosong, dan menulisnya ke `active_url.txt` untuk dibaca oleh batch launcher browser.

### Fail-Early Validation
Validasi koneksi SSH, ketersediaan port DB, dan pengecekan lisensi diselesaikan di wizard *sebelum* deployment dimulai — mencegah kegagalan di tengah-tengah proses.

---

## Alur Sequence Deployment

```
[Batch Launcher]
  → VBScript spawn node installer.js (hidden window)
  → Buka browser ke http://localhost:8080

[Browser → Wizard]
  Step 1: Pilih OS target, isi SSH params
  Step 2: Isi domain & port
  Step 3: Isi DB URL + test koneksi
  Step 4: Isi license key + verifikasi
  Step 5: Review summary
  Step 6: [Mulai Deploy] → POST /api/save-config → GET /api/stream-install (SSE)

[Server → PowerShell]
  spawn powershell.exe -File deploy-absenta-remote.ps1 -Silent [params...]
  stdout/stderr → SSE stream → browser

[Browser]
  Tampilkan log real-time → [INSTALL_COMPLETE] ✓
```
