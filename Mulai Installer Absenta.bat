@echo off
title Absenta Setup Wizard Launcher
echo ===================================================
echo     ABSENTA SETUP WIZARD - LAUNCHER LOKAL
echo ===================================================
echo.

:: Periksa apakah Node.js terpasang
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js tidak ditemukan di laptop Anda!
    echo Harap instal Node.js terlebih dahulu sebelum melanjutkan.
    echo.
    echo Membuka halaman resmi pengunduhan Node.js...
    start https://nodejs.org/id/download/
    echo.
    pause
    exit
)

:: Hapus file sementara .installer_url jika sudah ada dari sesi sebelumnya
if exist .installer_url del .installer_url

:: Jalankan server installer di latar belakang (minimized)
echo Memulai server instalasi lokal...
start "Absenta Installer Server" /min node installer.js

:: Tunggu sebentar untuk memastikan server mulai mendeteksi port
timeout /t 2 /nobreak >nul

:: Buka browser secara otomatis ke port default atau port dinamis jika terdeteksi dari logs
if exist .installer_url (
    set /p INSTALLER_URL=<.installer_url
) else (
    set INSTALLER_URL=http://localhost:8080
)

echo Membuka browser default ke: %INSTALLER_URL%
start %INSTALLER_URL%

echo.
echo ===================================================
echo  SETUP WIZARD SUDAH BERJALAN DI BROWSER ANDA!
echo  Silakan selesaikan instalasi melalui browser.
echo  PENTING: Jangan tutup terminal ini hingga selesai!
echo ===================================================
echo.
pause
