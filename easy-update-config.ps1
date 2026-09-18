# easy-update-config.ps1 - Skrip Guided Domain & Subdomain Switcher Absenta
# Mengupdate .env, PostgreSQL Tenant, Caddy Server Lisensi, dan PM2 di VPS Remote

param(
    [string]$TargetIP = "",
    [string]$TargetUser = "asepsuryadi",
    [string]$KeyPath = "",
    [string]$SudoPass = "",
    [string]$NewSubdomain = "",
    [string]$OldSubdomain = "",
    [string]$NewBaseDomain = "absenta.id",
    [string]$CustomDomain = "",
    [switch]$UpdateEnv = $true,
    [switch]$UpdateDb = $true,
    [switch]$SyncLicenseServer = $true,
    [switch]$UpdateCaddy = $true,
    [switch]$ReloadPM2 = $true,
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

$LOG_DIR = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "update-domain-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').log"
Start-Transcript -Path $LOG_FILE -Append -Force

function Show-Log {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Show-Header {
    param([string]$Title)
    if (-not $Silent) {
        Clear-Host
    }
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "        PENGATURAN DOMAIN DAN SUBDOMAIN AKSES APLIKASI ABSENTA            " -ForegroundColor Yellow -Bold
    Write-Host "==========================================================================" -ForegroundColor Cyan
    if ($Title) {
        Write-Host " -> $Title" -ForegroundColor Green
        Write-Host "--------------------------------------------------------------------------" -ForegroundColor Gray
    }
}

# 1. Mode Interaktif jika parameter TargetIP belum diisi
if ([string]::IsNullOrWhiteSpace($TargetIP)) {
    Show-Header "Persiapan Koneksi VPS Target"
    $TargetIP = (Read-Host "Masukkan IP VPS Target [10.10.10.163]").Trim()
    if ([string]::IsNullOrWhiteSpace($TargetIP)) { $TargetIP = "10.10.10.163" }
    $TargetUser = "asepsuryadi"

    Write-Host "Pilih SSH Key untuk VPS tersebut:"
    Write-Host " 1) nginxonly.pem"
    Write-Host " 2) ls-key.pem"
    Write-Host " 3) Input path file manual..."
    $newKeyChoice = Read-Host "Pilih [1-3]"
    if ($newKeyChoice -eq "1" -or [string]::IsNullOrWhiteSpace($newKeyChoice)) { $KeyPath = Join-Path $PSScriptRoot "nginxonly.pem" }
    elseif ($newKeyChoice -eq "2") { $KeyPath = Join-Path $PSScriptRoot "ls-key.pem" }
    else { $KeyPath = Read-Host "Masukkan path absolut file .pem" }

    $SudoPass = (Read-Host "Masukkan password sudo VPS Anda [g1g1G1NGSUL*!2]").Trim()
    if ([string]::IsNullOrWhiteSpace($SudoPass)) { $SudoPass = "g1g1G1NGSUL*!2" }

    Show-Header "Konfigurasi Subdomain dan Domain Baru"
    $OldSubdomain = (Read-Host "Masukkan Subdomain Lama [smkn1pld]").Trim()
    if ([string]::IsNullOrWhiteSpace($OldSubdomain)) { $OldSubdomain = "smkn1pld" }

    $NewSubdomain = (Read-Host "Masukkan Subdomain Baru [demo]").Trim()
    if ([string]::IsNullOrWhiteSpace($NewSubdomain)) { $NewSubdomain = "demo" }

    $NewBaseDomain = (Read-Host "Masukkan Base Domain [absenta.id]").Trim()
    if ([string]::IsNullOrWhiteSpace($NewBaseDomain)) { $NewBaseDomain = "absenta.id" }

    $CustomDomain = (Read-Host "Masukkan Custom Domain Penuh (Opsional, kosongkan jika pakai subdomain)").Trim()
}

if (-not (Test-Path $KeyPath)) {
    Show-Log "Error: File SSH Key tidak ditemukan di '$KeyPath'" "Red"
    Stop-Transcript
    exit 1
}

# Hitung full domain baru & lama
$OLD_FULL_DOMAIN = if ([string]::IsNullOrWhiteSpace($OldSubdomain)) { $NewBaseDomain } else { "$OldSubdomain.$NewBaseDomain" }
$NEW_FULL_DOMAIN = if (-not [string]::IsNullOrWhiteSpace($CustomDomain)) { $CustomDomain } elseif (-not [string]::IsNullOrWhiteSpace($NewSubdomain)) { "$NewSubdomain.$NewBaseDomain" } else { $NewBaseDomain }

Show-Header "Memulai Proses Pembaruan Domain"
Show-Log "Target Server        : $TargetUser@$TargetIP" "Cyan"
Show-Log "Domain/Subdomain Lama: $OLD_FULL_DOMAIN" "Yellow"
Show-Log "Domain/Subdomain Baru: $NEW_FULL_DOMAIN" "Green"
Show-Log "Base Domain          : $NewBaseDomain" "Cyan"

# Set file permission untuk Windows SSH client
$SAFE_NEW_KEY = "$env:TEMP\domain-update-key-$([guid]::NewGuid().ToString().Substring(0,8)).pem"
Remove-Item $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $KeyPath | Set-Content -Path $SAFE_NEW_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_NEW_KEY -AclObject $acl

function Run-RemoteScript {
    param([string]$ScriptContent, [string]$KeyPath, [string]$TargetUser, [string]$TargetIP)
    $tempScript = "$env:TEMP\remote_domain_update.sh"
    $ScriptContent = $ScriptContent -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($tempScript, $ScriptContent)
    
    & scp -i "$KeyPath" -o StrictHostKeyChecking=no "$tempScript" "${TargetUser}@${TargetIP}:/tmp/remote_domain_update.sh"
    if ($LASTEXITCODE -ne 0) { throw "Gagal menyalin skrip pembaruan ke VPS via SCP." }
    
    & ssh -i "$KeyPath" -o StrictHostKeyChecking=no "${TargetUser}@${TargetIP}" "bash /tmp/remote_domain_update.sh"
    if ($LASTEXITCODE -ne 0) { throw "Eksekusi pembaruan domain di remote VPS gagal." }
}

# Susun bash script yang akan dieksekusi di target VPS
$bashScript = @'
#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "   MEMULAI GUIDED DOMAIN & SUBDOMAIN SWITCHER DI VPS     "
echo "=========================================================="
echo "Waktu Mulai: $(date)"

cd /var/www/project-absenta || { echo "❌ Direktori /var/www/project-absenta tidak ditemukan!"; exit 1; }

# ------------------------------------------------------------
# 1. BACKUP .ENV
# ------------------------------------------------------------
if [ -f "absenta_backend/.env" ]; then
    BACKUP_NAME="absenta_backend/.env.bak_$(date +%Y%m%d_%H%M%S)"
    cp absenta_backend/.env "$BACKUP_NAME"
    echo "✅ [1/5] Backup absenta_backend/.env berhasil dibuat: $BACKUP_NAME"
else
    echo "❌ [1/5] File absenta_backend/.env tidak ditemukan!"
    exit 1
fi

if [ -f "absenta_frontend/.env" ]; then
    BACKUP_FE="absenta_frontend/.env.bak_$(date +%Y%m%d_%H%M%S)"
    cp absenta_frontend/.env "$BACKUP_FE"
    echo "✅ [1/5] Backup absenta_frontend/.env berhasil dibuat: $BACKUP_FE"
fi

# ------------------------------------------------------------
# 2. UPDATE VARIABEL .ENV SECARA AMAN
# ------------------------------------------------------------
echo "🔄 [2/5] Memperbarui variabel domain pada absenta_backend/.env & absenta_frontend/.env..."

update_env_var() {
    local target_file="$1"
    local key="$2"
    local val="$3"
    if grep -q "^${key}=" "$target_file"; then
        sed -i "s|^${key}=.*|${key}=${val}|g" "$target_file"
    else
        echo "${key}=${val}" >> "$target_file"
    fi
}

update_env_var "absenta_backend/.env" "MAIN_DOMAIN" "__NEW_BASE_DOMAIN__"
update_env_var "absenta_backend/.env" "EASY_TUNNEL_BASE_DOMAIN" "__NEW_BASE_DOMAIN__"
update_env_var "absenta_backend/.env" "TENANT_BASE_DOMAIN" "__NEW_BASE_DOMAIN__"
update_env_var "absenta_backend/.env" "PUBLIC_DOMAIN_BASE" "__NEW_FULL_DOMAIN__"
update_env_var "absenta_backend/.env" "APP_URL" "https://__NEW_FULL_DOMAIN__"
update_env_var "absenta_backend/.env" "FRONTEND_URL" "https://__NEW_FULL_DOMAIN__"
update_env_var "absenta_backend/.env" "PUBLIC_APP_URL" "https://__NEW_FULL_DOMAIN__"
update_env_var "absenta_backend/.env" "API_URL" "https://__NEW_FULL_DOMAIN__"
update_env_var "absenta_backend/.env" "PUBLIC_INVOICE_BASE_URL" "https://__NEW_FULL_DOMAIN__"

echo "   [Backend]  -> MAIN_DOMAIN=__NEW_BASE_DOMAIN__"
echo "   [Backend]  -> EASY_TUNNEL_BASE_DOMAIN=__NEW_BASE_DOMAIN__"
echo "   [Backend]  -> TENANT_BASE_DOMAIN=__NEW_BASE_DOMAIN__"
echo "   [Backend]  -> PUBLIC_DOMAIN_BASE=__NEW_FULL_DOMAIN__"
echo "   [Backend]  -> APP_URL=https://__NEW_FULL_DOMAIN__"
echo "   [Backend]  -> FRONTEND_URL=https://__NEW_FULL_DOMAIN__"

if [ -f "absenta_frontend/.env" ]; then
    update_env_var "absenta_frontend/.env" "VITE_MAIN_DOMAIN" "__NEW_BASE_DOMAIN__"
    echo "   [Frontend] -> VITE_MAIN_DOMAIN=__NEW_BASE_DOMAIN__"
fi

echo "✅ [2/5] Pembaruan .env backend & frontend selesai."

# ------------------------------------------------------------
# 3. UPDATE DATABASE POSTGRESQL (TENANT SUBDOMAIN)
# ------------------------------------------------------------
echo "🗄️ [3/5] Memperbarui rekaman Tenant di database PostgreSQL..."

cd absenta_backend

node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateTenant() {
    try {
        const oldSub = '__OLD_SUBDOMAIN__'.trim().toLowerCase();
        const newSub = '__NEW_SUBDOMAIN__'.trim().toLowerCase();
        const customDom = '__CUSTOM_DOMAIN__'.trim().toLowerCase();

        console.log('   Mencari tenant terkait (Subdomain lama:', oldSub || 'semua', ')...');

        let tenants = [];
        if (oldSub) {
            tenants = await prisma.tenant.findMany({
                where: { subdomain: { equals: oldSub, mode: 'insensitive' } }
            });
        }

        if (tenants.length === 0) {
            console.log('   Tenant dengan subdomain \"' + oldSub + '\" tidak ditemukan. Mengambil tenant pertama di database...');
            const first = await prisma.tenant.findFirst({ orderBy: { created_at: 'asc' } });
            if (first) {
                tenants = [first];
            }
        }

        if (tenants.length === 0) {
            console.log('   ⚠️ Tidak ada rekaman tenant di database untuk diperbarui.');
            return;
        }

        for (const t of tenants) {
            const updateData = {};
            if (newSub) updateData.subdomain = newSub;
            if (customDom) {
                updateData.custom_domain = customDom;
                updateData.custom_domain_status = 'ACTIVE';
                updateData.custom_domain_verified_at = new Date();
            }
            const res = await prisma.tenant.update({
                where: { id: t.id },
                data: updateData
            });
            console.log('   ✅ Tenant \"' + res.name + '\" berhasil diperbarui: subdomain = ' + (res.subdomain || '-') + ', custom_domain = ' + (res.custom_domain || '-'));
        }
    } catch (err) {
        console.error('   ❌ Gagal update tabel Tenant:', err.message);
    } finally {
        await prisma.\$disconnect();
    }
}
updateTenant();
" || echo "   ⚠️ Eksekusi script update tenant selesai dengan catatan."

cd /var/www/project-absenta
echo "✅ [3/5] Pembaruan database Tenant selesai."

# ------------------------------------------------------------
# 4. SINKRONISASI KE SERVER LISENSI & CLOUD GATEWAY CADDY
# ------------------------------------------------------------
echo "📡 [4/5] Melakukan sinkronisasi otomatis ke Server Lisensi (Cloud Gateway Caddy)..."

cd absenta_backend

node -e "
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const envContent = fs.readFileSync('.env', 'utf8');
const licMatch = envContent.match(/^LICENSE_KEY=(.*)$/m);
const srvMatch = envContent.match(/^LICENSE_SERVER_URL=(.*)$/m);
const licenseKey = licMatch ? licMatch[1].trim() : '';
let serverUrl = srvMatch ? srvMatch[1].trim() : 'https://api.absenta.id';

async function syncGateway() {
    if (!licenseKey) {
        console.log('   ℹ️ LICENSE_KEY tidak terpasang di .env. Melewati sinkronisasi cloud gateway.');
        return;
    }

    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, subdomain: true }
        });

        const customDomain = '__CUSTOM_DOMAIN__'.trim();
        const reqLib = serverUrl.startsWith('https') ? require('https') : require('http');

        if (customDomain) {
            console.log('   Mendaftarkan Custom Domain \"' + customDomain + '\" ke Server Lisensi...');
            try {
                const cUrl = new URL('/api/license/tunnel/custom-domain', serverUrl);
                const cPayload = JSON.stringify({ license_key: licenseKey, custom_domain: customDomain });
                const cReq = reqLib.request(cUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 12000
                }, r => {
                    console.log('   Status registrasi Custom Domain:', r.statusCode);
                });
                cReq.on('error', e => console.warn('   ⚠️ Custom domain sync warning:', e.message));
                cReq.write(cPayload);
                cReq.end();
            } catch (e) {}
        }

        console.log('   Mengirim sinyal Heartbeat untuk me-reload Caddy Server Lisensi...');
        const hUrl = new URL('/api/platform/heartbeat', serverUrl);
        const payload = JSON.stringify({
            schoolName: tenants[0] ? tenants[0].name : 'Absenta Node',
            tenants: tenants.map(t => ({ id: t.id, name: t.name, subdomain: t.subdomain })),
            appDomain: '__NEW_FULL_DOMAIN__',
            deployMode: 'hybrid',
            timestamp: new Date().toISOString()
        });

        const hReq = reqLib.request(hUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-License-Key': licenseKey
            },
            timeout: 15000
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('   ✅ Cloud Gateway Caddy di Server Lisensi BERHASIL di-reload dengan subdomain baru!');
                } else {
                    console.log('   ⚠️ Server Lisensi merespons status ' + res.statusCode + ': ' + body.substring(0, 100));
                }
            });
        });
        hReq.on('error', err => {
            console.warn('   ⚠️ Gagal menghubungkan ke Server Lisensi:', err.message);
        });
        hReq.write(payload);
        hReq.end();

    } catch (err) {
        console.error('   ❌ Gagal sinkronisasi gateway:', err.message);
    } finally {
        await prisma.\$disconnect();
    }
}
syncGateway();
" || echo "   ⚠️ Sinkronisasi gateway selesai dengan catatan."

cd /var/www/project-absenta
echo "✅ [4/5] Sinkronisasi Server Lisensi & Caddy Gateway selesai."

# ------------------------------------------------------------
# 5. UPDATE CADDY LOKAL VPS & RELOAD PM2
# ------------------------------------------------------------
echo "🔁 [5/5] Memeriksa Caddy lokal & Memuat ulang PM2..."

if [ -f "/etc/caddy/Caddyfile" ]; then
    echo "   Memeriksa /etc/caddy/Caddyfile lokal..."
    if [ ! -z "__OLD_FULL_DOMAIN__" ] && [ ! -z "__NEW_FULL_DOMAIN__" ]; then
        if grep -q "__OLD_FULL_DOMAIN__" /etc/caddy/Caddyfile 2>/dev/null; then
            echo "   Mengganti __OLD_FULL_DOMAIN__ -> __NEW_FULL_DOMAIN__ di /etc/caddy/Caddyfile..."
            echo '__SUDO_PASS__' | sudo -S sed -i "s|__OLD_FULL_DOMAIN__|__NEW_FULL_DOMAIN__|g" /etc/caddy/Caddyfile 2>/dev/null || true
            echo '__SUDO_PASS__' | sudo -S caddy validate --config /etc/caddy/Caddyfile 2>/dev/null && {
                echo '__SUDO_PASS__' | sudo -S systemctl reload caddy 2>/dev/null || echo '__SUDO_PASS__' | sudo -S caddy reload 2>/dev/null || true
                echo "   ✅ Caddy lokal berhasil divalidasi dan dimuat ulang."
            } || echo "   ⚠️ Validasi Caddy lokal gagal atau dilewati."
        fi
    fi
fi

echo "   Memuat ulang layanan PM2 agar .env baru aktif tanpa downtime..."
cd /var/www/project-absenta
pm2 reload ecosystem.config.js --update-env 2>/dev/null \
    || pm2 reload project-absenta --update-env 2>/dev/null \
    || pm2 reload absenta-backend --update-env 2>/dev/null \
    || pm2 reload all --update-env 2>/dev/null \
    || echo "   ⚠️ PM2 reload selesai atau diproses di latar belakang."

pm2 save 2>/dev/null || true

echo "=========================================================="
echo "   PENGGANTIAN DOMAIN SELESAI SAKSES! 🚀                "
echo "   Domain Baru : https://__NEW_FULL_DOMAIN__            "
echo "=========================================================="
'@

# Ganti placeholder di bash script dengan variabel PowerShell aktual
$bashScript = $bashScript.Replace('__NEW_BASE_DOMAIN__', $NewBaseDomain)
$bashScript = $bashScript.Replace('__NEW_FULL_DOMAIN__', $NEW_FULL_DOMAIN)
$bashScript = $bashScript.Replace('__OLD_FULL_DOMAIN__', $OLD_FULL_DOMAIN)
$bashScript = $bashScript.Replace('__NEW_SUBDOMAIN__', $NewSubdomain)
$bashScript = $bashScript.Replace('__OLD_SUBDOMAIN__', $OldSubdomain)
$bashScript = $bashScript.Replace('__CUSTOM_DOMAIN__', $CustomDomain)
$bashScript = $bashScript.Replace('__SUDO_PASS__', $SudoPass)

try {
    Show-Log "Menghubungkan ke VPS target ($TargetIP)..." "Yellow"
    Run-RemoteScript -ScriptContent $bashScript -KeyPath $SAFE_NEW_KEY -TargetUser $TargetUser -TargetIP $TargetIP
    Show-Log "Sukses! Domain dan konfigurasi berhasil diperbarui menjadi: https://$NEW_FULL_DOMAIN" "Green"
} catch {
    Show-Log "Terjadi kesalahan saat memperbarui domain: $_" "Red"
    if (-not $Silent) {
        Read-Host "Tekan [ENTER] untuk keluar..."
    }
    Stop-Transcript
    exit 1
} finally {
    Remove-Item -Path $SAFE_NEW_KEY -Force -ErrorAction SilentlyContinue
    Stop-Transcript
}

if (-not $Silent) {
    Write-Host ""
    Read-Host "Tekan [ENTER] untuk selesai..."
}
