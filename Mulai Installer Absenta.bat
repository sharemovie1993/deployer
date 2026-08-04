@echo off
title Absenta Setup Wizard Launcher

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

:: Hapus file sementara active_url.txt jika ada
if exist active_url.txt del active_url.txt

:: Matikan proses node lama yang berjalan pada port 8080-8085 jika ada
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080 :8081 :8082 :8083 :8084 :8085"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Jalankan installer.js di latar belakang
start /B node installer.js >nul 2>&1

:: Tunggu 2 detik untuk memastikan server siap
ping 127.0.0.1 -n 3 >nul

:: Buka browser secara otomatis ke URL server yang aktif
if exist active_url.txt (
    set /p INSTALLER_URL=<active_url.txt
) else (
    set INSTALLER_URL=http://localhost:8080
)

echo Membuka %INSTALLER_URL% di browser...
start %INSTALLER_URL%

:: Hapus file VBS launcher sementara
if exist .launch.vbs del .launch.vbs

exit
