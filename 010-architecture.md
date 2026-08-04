# ARCHITECTURE

Installer Controller (Local OS):
- **Launcher**: Mulai Installer Absenta.bat (Batch launcher dengan VBScript wrapper untuk eksekusi tersembunyi).
- **Backend Service**: installer.js (Node.js HTTP Server tanpa dependensi eksternal).
- **Frontend GUI**: Antarmuka berbasis HTML/CSS/JS glassmorphic dengan Outfit font.

Deployment Execution Engine:
- **Language**: PowerShell (PS Scripting Core).
- **Target OS**: Linux (Remote VPS via SSH) & Windows (Local On-Premise via local powershell).

Architecture Patterns:
- **Hidden Background Initialization**: Penggunaan script VBScript (`.launch.vbs`) agar proses backend `node installer.js` dapat berjalan senyap sebagai background process di sistem operasi Windows operator tanpa jendela command prompt hitam.
- **Server-Sent Events (SSE) Log Pipe**: Menyajikan endpoint `/api/stream-install` yang memancarkan log asinkron. Ketika proses deployment dimulai, backend men-spawn subprocess `powershell.exe` dengan argumen parameter instalasi. Keluaran stream log (`stdout` & `stderr`) ditangkap baris-demi-baris dan dipancarkan ke browser secara instan menggunakan standard event-stream protocol.
- **Port Collision Resolver**: Mendeteksi port `8080` lokal yang sudah terpakai, lalu secara dinamis mencari port luang berikutnya secara rekursif (`8080 + n`) dan menuliskan URL aktif ke file sementara `.installer_url` untuk dibaca oleh batch browser launcher.
- **File System Permissions Restricter**: Secara programatik membatasi hak milik file SSH private key (.pem) menggunakan utilitas `icacls` di Windows dan `chmod 600` di Linux sebelum melakukan koneksi SSH demi kepatuhan protokol keamanan OpenSSH.
- **TCP Socket Reachability Check**: Menjalankan ping TCP soket (`net.Socket`) berdurasi timeout 4 detik ke port database target (PostgreSQL/Redis) untuk meminimalkan kegagalan instalasi akibat kesalahan firewall/ip.

Workflow Sequence:
1. Double click `Mulai Installer Absenta.bat` $\rightarrow$ VBScript dijalankan $\rightarrow$ Server `installer.js` up di port kosong.
2. Batch membuka default browser ke URL installer $\rightarrow$ User mengisi parameter (OS, IP SSH, PEM, DB, Lisensi).
3. GUI memvalidasi Lisensi & SSH IP ke API server lisensi pusat.
4. Klik *Mulai Deployment* $\rightarrow$ Server memicu script PowerShell remote (`deploy-absenta-remote.ps1`) $\rightarrow$ Log dikirim via SSE $\rightarrow$ Pemasangan selesai $\rightarrow$ Server mati secara otomatis (`process.exit`).
