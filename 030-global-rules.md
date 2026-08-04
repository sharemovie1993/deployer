# GLOBAL RULES

Execution Security Rules:
- **Execution Policy Override**: Eksekusi skrip PowerShell wajib menggunakan parameter `-ExecutionPolicy Bypass` untuk menghindari pemblokiran kebijakan Windows Scripting Host default.
- **PEM File Restricter Policy**: Sebelum melakukan koneksi SSH, skrip wajib mencabut pewarisan perizinan (*disable inheritance*) pada file PEM (`ls-key.pem`) dan memberikan hak akses penuh hanya untuk akun pengguna aktif saat ini.
- **Fail-Early Validation**: Validasi koneksi SSH, ketersediaan port PostgreSQL/Redis, dan pengecekan lisensi wajib diselesaikan di awal wizard (sebelum mengklik tombol pasang) demi mencegah kegagalan di tengah-tengah deployment.

Scripting & Automation Conventions:
- **No-Interaction Deployment (Silent Mode)**: Seluruh skrip deployment (`deploy-absenta-remote.ps1`, `deploy-onprem-windows.ps1`) wajib mendukung parameter `-Silent` agar dapat dieksekusi secara otomatis dari script wrapper atau server GUI tanpa meminta input manual di tengah jalan.
- **PM2 Service Standardization**: Penamaan aplikasi di VPS wajib seragam, yaitu `absenta-backend` dan `absenta-frontend` di bawah monitoring PM2.
- **Dynamic Configuration Sync**: File `.env` yang dibuat di server target wajib dibentuk secara dinamis berdasarkan parameter masukan dari installer (lisensi, port, DB URL) dan dilarang menggunakan berkas `.env` statis hasil salinan mentah.
