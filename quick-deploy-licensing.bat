@echo off
TITLE Quick Deploy - Server Lisensi (VPS 103.196.155.87)
cd /d "%~dp0"

echo ==========================================================================
echo        QUICK DEPLOY SERVER LISENSI DARI DEPLOYER (VPS 103.196.155.87)
echo     [STANDAR WAJIB]: BUILD DI LOKAL (Mencegah Lonjakan CPU 100% VPS)
echo ==========================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0easy-update-remote.ps1" -TargetIP "103.196.155.87" -TargetUser "asepsuryadi" -KeyPath "%~dp0ls-key.pem" -Project "licensing" -BuildMode "local"
pause
