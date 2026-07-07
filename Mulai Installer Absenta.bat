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

:: Hapus file sementara .installer_url jika sudah ada dari sesi sebelumnya
if exist .installer_url del .installer_url

:: Buat script VBS sementara untuk menjalankan node secara tersembunyi (hidden window)
echo Set WshShell = CreateObject("WScript.Shell") > .launch.vbs
echo WshShell.Run "node installer.js", 0, false >> .launch.vbs

:: Jalankan script VBS
wscript .launch.vbs

:: Tunggu 2 detik untuk memastikan server mulai mendeteksi port
timeout /t 2 /nobreak >nul

:: Buka browser secara otomatis ke port default atau port dinamis jika terdeteksi dari logs
if exist .installer_url (
    set /p INSTALLER_URL=<.installer_url
) else (
    set INSTALLER_URL=http://localhost:8080
)

start %INSTALLER_URL%

:: Hapus file VBS launcher sementara
del .launch.vbs

exit
