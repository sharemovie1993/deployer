@echo off
TITLE Global Deployment Manager
echo ===================================================
echo     MEMULAI GLOBAL DEPLOYMENT MANAGER...
echo ===================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-manager.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Terjadi kesalahan saat menjalankan deployer.
    pause
)
