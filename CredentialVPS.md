# Absenta Ecosystem - Kredensial & Prosedur Deployment VPS

## 1. Deployer Terpusat
- **Lokasi Project**: `D:\BarayaProject\deployer`
- **Quick Deploy Script**:
  - `quick-deploy-licensing.bat` -> 1-klik langsung kompilasi di lokal & deploy ke VPS Server Lisensi (`103.196.155.87`).
  - `run.bat` -> Menu `[2] Quick Update` -> `[3] VPS Linux Remote` -> `[2] Server Lisensi` (PILIH MODE: `local`).

---

## 2. VPS Public (Server Lisensi Central & Gateway)
- **Lokasi Project**: `D:\BarayaProject\Project-Server-Lisensi`
- **Akun SSH**:
  - **IP**: `103.196.155.87`
  - **Domain**: `absenta.id` / `api.absenta.id`
  - **User**: `asepsuryadi`
  - **SSH Key**: `ls-key.pem`
  - **Remote Directory**: `/var/www/licensing-server`

> [!IMPORTANT]
> **ATURAN MUTLAK SERVER LISENSI: WAJIB BUILD DI LOKAL!**
> DILARANG menjalankan `npm run build` (`tsc` / `vite build`) langsung di dalam VPS.
> Kompilasi di dalam VPS memicu lonjakan CPU 100% (CPU Spike) yang mengakibatkan server hang/down. Seluruh proses kompilasi TypeScript dan Vite panel HARUS diselesaikan di komputer lokal, lalu hasilnya diunggah via SCP ke VPS.

### Prosedur Deploy Server Lisensi:
- **Cara 1 (1-Klik Otomatis - Recommended)**:
  Buka folder `D:\BarayaProject\Project-Server-Lisensi`, double-click:
  ```cmd
  deploy.bat
  ```
  *(Atau jalankan `npm run deploy` di terminal)*.
- **Cara 2 (PowerShell Langsung)**:
  ```powershell
  npm run deploy:fast
  # atau
  powershell -ExecutionPolicy Bypass -File .\deploy-fast.ps1
  ```
- **Alur yang Dijalankan `deploy-fast.ps1`**:
  1. Melakukan `npm run build` TypeScript Backend (`dist/`) di PC lokal.
  2. Melakukan build Vite Platform Panel (`public/`) di PC lokal.
  3. Mengompresi paket release ke `release_dist.tar.gz`.
  4. Mengunggah ke VPS via SCP menggunakan `ls-key.pem`.
  5. Ekstrak di VPS `/var/www/licensing-server` dan restart `pm2 restart licensing-server` (Zero CPU load di VPS!).

---

## 3. VPS Lokal (Server Produksi Platform Absenta - SMKN 1 PLD)
- **Lokasi Project**: `D:\BarayaProject\Project Absenta`
- **Akun SSH**:
  - **IP**: `10.10.10.99`
  - **Domain**: `smkn1pld.absenta.id`
  - **User**: `asep`
  - **Password**: `1`
  - **SSH Key**: `nginxonly.pem`

---

## 4. VPS Lokal (Server Produksi Platform Absenta - Demo & Staging)
- **Lokasi Project**: `D:\BarayaProject\Project Absenta`
- **Akun SSH**:
  - **IP**: `10.10.10.116`
  - **Domain**: `demo.absenta.id`
  - **User**: `asep`
  - **Password**: `1`
  - **SSH Key**: `nginxonly.pem`
- **Quick Deploy Script**:
  - Push commit ke GitHub `origin/main`
  - Pull dan build di server lokal:
    ```bash
    ssh -i nginxonly.pem asep@10.10.10.116 "cd /var/www/project-absenta && git pull origin main && cd absenta_backend && npm run build && cd ../absenta_frontend && npm run build && pm2 reload all"
    ```
