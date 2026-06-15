# Global Deployment Manager (Deployer)

Repositori ini berisi skrip otomatisasi deployment terpusat (**Global Deployer**) untuk men-deploy, memperbarui, dan memantau berbagai proyek web Anda langsung dari satu titik masuk (entry point). 

Proyek pertama yang terdaftar secara bawaan adalah **Project Yatim (Mustahiq Care)**.

## Fitur Utama
1. **Shallow Clone Otomatis**: Secara otomatis mengkloning kode produksi langsung dari GitHub (`depth 1`) ke direktori target yang diinginkan tanpa harus clone manual.
2. **Setup Port Dinamis**: Memandu konfigurasi port Frontend & Backend secara terisolasi.
3. **Inisialisasi Database & Build Otomatis**: Mengotomatiskan instalasi package npm, migrasi SQLite (Prisma), dan build static assets React (Vite).
4. **Manajemen Proses PM2**: Mendaftarkan, menghentikan, dan memuat ulang proses server di background secara otomatis.
5. **Konfigurasi Reverse Proxy Nginx**: Menyediakan pembuatan konfigurasi virtual host Nginx untuk menyatukan akses port di Linux.

---

## Panduan Penggunaan

### 1. Di Lingkungan Windows (PowerShell)
Buka PowerShell (disarankan Run as Administrator) di folder repositori ini, lalu jalankan:
```powershell
./deploy-manager.ps1
```

### 2. Di Lingkungan Linux (Bash)
Buka Terminal di folder repositori ini, berikan izin akses eksekusi, lalu jalankan:
```bash
chmod +x deploy-manager.sh
./deploy-manager.sh
```

---

## Cara Mendaftarkan Proyek Baru

Anda dapat menambahkan proyek baru Anda ke dalam skrip dengan mengedit berkas berikut:

### Pada `deploy-manager.ps1` (Windows):
Tambahkan entri baru ke dalam array `$PROJECTS` di bagian atas berkas:
```powershell
$PROJECTS = @(
    # Proyek yang sudah ada...
    @{
        ID = 2
        Name = "Nama Proyek Baru Anda"
        RepoUrl = "https://github.com/username/nama-repo.git"
        DefaultDir = "C:\apps\nama-proyek"
        DefaultBackendPort = "3000"
        DefaultFrontendPort = "8080"
    }
)
```

### Pada `deploy-manager.sh` (Linux):
Daftarkan metadata array asosiatif baru pada bagian inisialisasi di atas berkas:
```bash
PROJ_NAMES[2]="Nama Proyek Baru Anda"
PROJ_REPOS[2]="https://github.com/username/nama-repo.git"
PROJ_DIRS[2]="/var/www/nama-proyek"
PROJ_B_PORTS[2]="3000"
PROJ_F_PORTS[2]="8080"
```
Setelah didaftarkan, proyek baru Anda akan otomatis muncul sebagai opsi di menu utama deployer!
