# PROJECT

Nama:
Absenta Deployer & Maintenance Wizard

Jenis:
Deployment Orchestration & Server Maintenance Toolset

Tujuan:
Mempermudah pemasangan ekosistem Absenta.id ke berbagai skenario server (VPS Linux Cloud Remote, Windows Lokal On-Premise, Multi-VM Cluster) melalui wizard antarmuka grafis (GUI) berbasis web yang ramah pengguna, serta menyediakan kumpulan skrip otomatisasi pemeliharaan server harian.

Target User:
- **Teknisi / Sysadmin Sekolah**: Pelaksana pemasangan aplikasi Absenta secara mandiri di jaringan sekolah.
- **Platform Deployer (Tim Absenta.id)**: Tim teknis yang mengonfigurasi node-node baru atau me-restart layanan di VPS.
- **Sistem Administrator**: Pengelola infrastruktur server yang melakukan optimasi harian (hardening, swap scaling, disk resizing, log purging).

Domain Utama:
- **GUI Setup Wizard (Web-based)**: Asisten pemandu langkah-demi-langkah (6 tahap) untuk mengumpulkan parameter instalasi, melakukan tes koneksi SSH & DB, verifikasi lisensi, dan memulai deployment.
- **Quick Deploy via Preset**: Deploy ulang konfigurasi tersimpan ke server yang sudah pernah dikonfigurasi dengan satu klik.
- **Multi-VM Cluster Deploy**: Orkestrasi deployment terdistribusi ke beberapa node VPS sekaligus (API cluster, WA node, Load Balancer, DB node).
- **Remote Linux Deployer**: Skrip `deploy-absenta-remote.ps1` yang terhubung ke VPS Linux via SSH untuk memasang stack penuh (PostgreSQL, Redis, PM2, Node.js, Caddy).
- **On-Premise Windows Deployer**: Skrip `deploy-onprem-windows.ps1` untuk pemasangan lokal pada server Windows intranet sekolah.
- **Central Licensing Deployer**: Skrip `deploy-licensing-remote.ps1` untuk pembaruan server lisensi pusat.
- **Server Health & Monitoring**: Panel real-time status PM2, metrics server, dan health tunnel WireGuard.
- **Server Hardening & Maintenance**: Otomatisasi hardening firewall, swap scaling, disk resizing, log purging, migrasi DB, dan perbaikan tunnel.

Status:
Stable — Active GUI Installer (Modular Architecture)
