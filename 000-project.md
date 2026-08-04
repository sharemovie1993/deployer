# PROJECT

Nama:
Absenta Deployer & Installer Wizard

Jenis:
Deployment Orchestration & Server Maintenance Toolset

Tujuan:
Mempermudah pemasangan ekosistem Absenta.id ke berbagai skenario server (VPS Linux Cloud Remote, Windows Lokal On-Premise) melalui wizard antarmuka grafis (GUI) yang ramah pengguna serta kumpulan skrip otomatisasi pemeliharaan server.

Target User:
- **Teknisi / Sysadmin Sekolah**: Pelaksana pemasangan aplikasi Absenta secara mandiri di jaringan sekolah.
- **Platform Deployer**: Tim teknis Absenta.id yang mengonfigurasi node-node baru atau merestart layanan di VPS.
- **Sistem Administrator**: Pengelola infrastruktur server yang melakukan optimasi harian (hardening, swap scaling, disk resizing).

Domain Utama:
- **GUI Setup Wizard (Web-based)**: Asisten pemandu langkah-demi-langkah (Wizard 6 tahap) untuk mengumpulkan parameter instalasi, melakukan tes port, dan verifikasi lisensi.
- **Remote Linux Deployer**: Skrip PowerShell `deploy-absenta-remote.ps1` yang terhubung ke VPS Linux via SSH untuk memasang stack aplikasi (PostgreSQL, Redis, PM2, Node.js, Caddy).
- **On-Premise Windows Deployer**: Skrip `deploy-onprem-windows.ps1` untuk pemasangan lokal pada server Windows intranet sekolah.
- **Central Licensing Deployer**: Skrip `deploy-licensing-remote.ps1` untuk pembaruan cepat licensing-server pusat.
- **Server Hardening & Security**: Otomatisasi konfigurasi firewall, pembuatan user SSH non-root, dan isolasi folder sistem.
- **Resource Scaling (Swap & Disk)**: Skrip instan untuk menambah memori virtual Swap dan memperbesar alokasi partisi disk server Linux tanpa restart.

Status:
Stable Toolset (Active GUI Installer)
