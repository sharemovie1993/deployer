# TECH STACK

Installer Core:
- **Node.js (LTS)**: Lingkungan runtime eksekusi server lokal `installer.js`.
- **PowerShell (v5.1+)**: Scripting engine utama untuk eksekusi alur penyediaan server (*provisioning*) dan penyalinan berkas di Linux / Windows.
- **VBScript (Windows Host)**: Skrip shell bawaan Windows untuk mengaktifkan jendela tersembunyi (*headless window execution*).

GUI Frontend:
- **HTML5 & Vanilla CSS3**: Kerangka dan tata letak desain UI premium.
- **Vanilla JavaScript (ES6)**: Handler interaksi, penanganan event navigation, request fetch API, dan koneksi client SSE (`EventSource`).
- **Google Fonts (Outfit & Fira Code)**: Sumber tipografi antarmuka grafis dan terminal log.

Security & Communication:
- **OpenSSH client**: Untuk transmisi perintah remote terenkripsi dari Windows ke Linux VPS.
- **icacls (Windows Utility)**: Mengatur hak akses file keamanan kunci privat PEM (`ls-key.pem`).
- **chmod (Unix Utility)**: Mengubah hak akses PEM di sistem operasi Linux.
- **http & https (Node.js Native Modules)**: Komunikasi web server lokal dan proxy call ke server lisensi pusat.

Target Deployment Packages (Sistem yang dipasang di VPS):
- **Node.js & PM2**: Engine aplikasi dan manager process Absenta.
- **PostgreSQL**: Database relational sekolah.
- **Redis Server**: Cache memory untuk kecepatan sistem.
- **Caddy Server**: Web server reverse proxy otomatis SSL.
