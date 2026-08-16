# GLOBAL RULES

## Execution Security

- **Execution Policy Override**: Semua eksekusi skrip PowerShell wajib menggunakan flag `-ExecutionPolicy Bypass` untuk menghindari pemblokiran Windows Scripting Host default.
- **PEM File Permission**: Sebelum koneksi SSH, skrip wajib mengamankan file `.pem` — cabut inheritance (`icacls /inheritance:r`) dan berikan akses hanya untuk user aktif. Di sisi Linux: `chmod 600`.
- **Fail-Early Validation**: Validasi koneksi SSH, ketersediaan port DB, dan pengecekan lisensi wajib diselesaikan di awal wizard *sebelum* deployment dimulai — untuk mencegah kegagalan di tengah proses.
- **No Fake Fallback**: Dilarang melakukan konversi atau normalisasi nama proses/aplikasi. Semua data (nama PM2, IP, port) harus ditampilkan apa adanya (raw) sesuai respons dari server target.

## Scripting & Automation Conventions

- **Silent Mode Mandatory**: Seluruh skrip deployment (`deploy-absenta-remote.ps1`, `deploy-onprem-windows.ps1`, dst.) wajib mendukung flag `-Silent` agar dapat dieksekusi otomatis dari GUI backend tanpa meminta input manual.
- **Call Operator (`&`) — Wajib untuk Native Commands**: Gunakan `& ssh ...` bukan `Invoke-Expression "ssh ..."`. Call operator menjamin output native commands ter-stream baris-demi-baris secara real-time ke SSE. `Invoke-Expression` menyebabkan buffering dan layar tampak diam (hang).
- **PM2 Naming Standard**: Nama proses di VPS harus seragam: `absenta-backend` dan `absenta-frontend`.
- **Dynamic .env Generation**: File `.env` di server target wajib dibentuk secara dinamis dari parameter installer. Dilarang menggunakan file `.env` statis hasil copy mentah.

## Log Storage

- **Log Lokal**: Semua file log lokal disimpan di folder `logs/` di root proyek (bukan langsung di root). Folder dibuat otomatis jika belum ada:
  ```powershell
  $LOG_DIR = Join-Path $PSScriptRoot "logs"
  if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
  ```
- **Gitignore**: Folder `logs/` dan file `*.log` wajib terdaftar di `.gitignore`.
- **Log Remote Linux**: Simpan log mentah dulu di `/tmp/deploy.log`, baru salin ke direktori target setelah deployment selesai. Ini mencegah log terputus akibat `rm -rf` direktori target di tengah proses.

## SSE Streaming Rules

- Setiap baris output subprocess yang tidak kosong wajib dikirim sebagai event SSE: `data: <line>\n\n`.
- Error output (`stderr`) dikirim dengan prefix: `data: [ERROR] <line>\n\n`.
- Heartbeat wajib dikirim setiap 10 detik (`': heartbeat\n\n'`) untuk mencegah koneksi SSE timeout.
- Saat subprocess selesai dengan exit code 0: kirim `data: [INSTALL_COMPLETE]\n\n`.
- Saat subprocess gagal: kirim `data: [INSTALL_FAILED] dengan exit code: <code>\n\n`.

## Config Flow (Global Install Params)

- Frontend menyimpan konfigurasi wizard via `POST /api/save-config` ke `global.installParams` di server.
- SSE handler `handleStreamInstall` membaca `global.installParams` (bukan URL query params) saat stream dimulai.
- Urutan wajib: `save-config` harus selesai sebelum SSE stream dibuka.

## Frontend Modular Rules

- Setiap fitur utama memiliki file JS tersendiri di `public/js/` — tidak dibolehkan menyatukan logika semua fitur dalam satu file.
- Navigasi antar view dikendalikan via toggle CSS `display` — bukan routing framework.
- Tidak boleh ada framework CSS (Tailwind, Bootstrap) — hanya Vanilla CSS.
