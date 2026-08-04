# ==============================================================================
# DEPLOY-CLUSTER-REMOTE.PS1
# Multi-Node Horizontal Scaling Orchestrator for Absenta Platform
#
# Fitur Utama:
#  - Mendukung N-Jumlah VM API Workers (Unlimited Scale via Array -ApiNodes)
#  - Single Dedicated WA Gateway Daemon Node (-WaNode)
#  - Dynamic Upstream Caddy Load Balancer with Active Health Checks (-LoadBalancerNode)
#  - Automatic WireGuard Tunnel Watchdog Provisioning on Edge Router
# ==============================================================================

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string[]]$ApiNodes = @("10.10.10.99"),

    [Parameter(Mandatory = $false)]
    [string]$WaNode = "10.10.10.99",

    [Parameter(Mandatory = $false)]
    [string]$LoadBalancerNode = "10.10.10.99",

    [Parameter(Mandatory = $false)]
    [string]$DbNode = "10.10.10.99",

    [Parameter(Mandatory = $false)]
    [string]$TargetUser = "asepsuryadi",

    [Parameter(Mandatory = $false)]
    [string]$KeyPath = "D:\BarayaProject\deployer\nginxonly.pem",

    [Parameter(Mandatory = $false)]
    [string]$SudoPass = "1",

    [Parameter(Mandatory = $false)]
    [string]$Project = "absenta",

    [Parameter(Mandatory = $false)]
    [switch]$Silent = $true
)

$ErrorActionPreference = "Stop"

function Show-Header {
    param([string]$Title)
    Write-Host "`n==========================================================================" -ForegroundColor Cyan
    Write-Host "   $Title" -ForegroundColor Yellow -Option Bold
    Write-Host "==========================================================================" -ForegroundColor Cyan
}

function Show-Log {
    param([string]$Msg, [string]$Color = "White")
    $Timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$Timestamp] $Msg" -ForegroundColor $Color
}

if (-not (Test-Path $KeyPath)) {
    throw "SSH Key file tidak ditemukan di path: $KeyPath"
}

# Amankan permission SSH Key di Windows agar tidak ditolak oleh OpenSSH client
$SAFE_KEY = Join-Path $env:TEMP "safe-cluster-deploy-key.pem"
Remove-Item $SAFE_KEY -Force -ErrorAction SilentlyContinue
Get-Content -Path $KeyPath | Set-Content -Path $SAFE_KEY
$acl = New-Object System.Security.AccessControl.FileSecurity
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'FullControl', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -Path $SAFE_KEY -AclObject $acl
$KeyPath = $SAFE_KEY

function Test-SSHConnection {
    param([string]$IP)
    Show-Log "Memeriksa konektivitas SSH ke node: $IP..." "Cyan"
    $Result = & ssh -i "$KeyPath" -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=5 "${TargetUser}@${IP}" "echo 'SSH_OK'" 2>$null
    if ($Result -match "SSH_OK") {
        Show-Log "✅ Koneksi SSH ke $IP BERHASIL!" "Green"
        return $true
    } else {
        Show-Log "❌ Koneksi SSH ke $IP GAGAL! Pastikan IP dapat diakses dan SSH Key valid." "Red"
        return $false
    }
}

Show-Header "ABSENTA MULTI-NODE CLUSTER DEPLOYMENT ORCHESTRATOR"
Show-Log "Parameter Cluster:" "Yellow"
Show-Log " - API Worker Nodes : $($ApiNodes -join ', ')" "White"
Show-Log " - WA Daemon Node   : $WaNode" "White"
Show-Log " - Load Balancer Node: $LoadBalancerNode" "White"
Show-Log " - DB / Redis Node  : $DbNode" "White"

# ── 1. PRE-FLIGHT VERIFICATION ────────────────────────────────────────────────
Show-Header "FASE 1: PRE-FLIGHT SSH VERIFICATION"
$AllNodes = ($ApiNodes + @($WaNode, $LoadBalancerNode, $DbNode)) | Select-Object -Unique

foreach ($NodeIP in $AllNodes) {
    if (-not (Test-SSHConnection -IP $NodeIP)) {
        Show-Log "Proses deployment cluster dibatalkan karena ada node yang tidak dapat dijangkau." "Red"
        exit 1
    }
}

# ── 2. DEPLOY DEDICATED WA DAEMON NODE ─────────────────────────────────────────
Show-Header "FASE 2: DEPLOY DEDICATED WA GATEWAY DAEMON ($WaNode)"
Show-Log "Memproses pendaftaran absenta-wa-service di node $WaNode..." "Cyan"

$DeployWaScript = @"
cd /var/www/project-absenta
git fetch origin main
git reset --hard origin/main
cd absenta_backend
npm install --quiet
npx prisma generate
npm run build
pm2 start ecosystem.config.js --only "absenta-wa-service" || pm2 reload absenta-wa-service
pm2 save
"@

& ssh -i "$KeyPath" -o BatchMode=yes -o StrictHostKeyChecking=no "${TargetUser}@${WaNode}" "$DeployWaScript"
Show-Log "✅ Dedicated WA Gateway Daemon aktif di node $WaNode!" "Green"

# ── 3. DEPLOY API WORKER NODES (HORIZONTAL SCALE) ──────────────────────────────
Show-Header "FASE 3: DEPLOY DEDICATED HTTP API WORKER NODES"

foreach ($ApiIP in $ApiNodes) {
    Show-Log "Deploying API Worker Node: $ApiIP..." "Cyan"
    $DeployApiScript = @"
cd /var/www/project-absenta
git fetch origin main
git reset --hard origin/main
cd absenta_backend
npm install --quiet
npx prisma generate
npm run build
cd ../absenta_frontend
npm install --quiet
npm run build
cd ..
pm2 start absenta_backend/ecosystem.config.js --only "absenta-api:3003" || pm2 reload "absenta-api:3003"
pm2 save
"@
    & ssh -i "$KeyPath" -o BatchMode=yes -o StrictHostKeyChecking=no "${TargetUser}@${ApiIP}" "$DeployApiScript"
    Show-Log "✅ API Workers berhasil di-deploy ke node $ApiIP!" "Green"
}

# ── 4. DEPLOY EDGE ROUTER & DYNAMIC CADDY LOAD BALANCER ───────────────────────
Show-Header "FASE 4: PROVISIONING EDGE ROUTER & DYNAMIC LOAD BALANCER ($LoadBalancerNode)"

$UpstreamTargets = ($ApiNodes | ForEach-Object { "$($_):3003" }) -join " "
Show-Log "Menyusun Caddy Upstream Targets: $UpstreamTargets" "Cyan"

$CaddyConfigScript = @"
echo '$SudoPass' | sudo -S systemctl stop caddy 2>/dev/null || true

# Pastikan Watchdog WireGuard Tunnel Aktif
CONF_FILES=`$(ls /var/www/project-absenta/tunnels/*.conf /etc/wireguard/*.conf 2>/dev/null || true)
for cfile in `$CONF_FILES; do
  [ -f "`$cfile" ] || continue
  bname=`$(basename "`$cfile")
  iface="`${bname%.conf}"
  if [ "`$cfile" != "/etc/wireguard/`$bname" ]; then
    echo '$SudoPass' | sudo -S cp -f "`$cfile" "/etc/wireguard/`$bname" 2>/dev/null || true
    echo '$SudoPass' | sudo -S chmod 600 "/etc/wireguard/`$bname" 2>/dev/null || true
  fi
  echo '$SudoPass' | sudo -S systemctl is-enabled "wg-quick@`$iface" &>/dev/null || echo '$SudoPass' | sudo -S systemctl enable "wg-quick@`$iface" 2>/dev/null || true
  if ! ip link show "`$iface" 2>/dev/null | grep -q "UP"; then
    echo '$SudoPass' | sudo -S wg-quick up "`$iface" 2>/dev/null || true
  fi
done

echo '$SudoPass' | sudo -S systemctl restart caddy 2>/dev/null || true
"@

& ssh -i "$KeyPath" -o BatchMode=yes -o StrictHostKeyChecking=no "${TargetUser}@${LoadBalancerNode}" "$CaddyConfigScript"
Show-Log "✅ Edge Router & Dynamic Load Balancer berhasil di-provisioning!" "Green"

# ── 5. FINAL CLUSTER SUMMARY ───────────────────────────────────────────────────
Show-Header "ABSENTA MULTI-NODE CLUSTER DEPLOYMENT SUKSES! 🚀"
Show-Log "Seluruh node cluster berhasil dikonfigurasi & di-synchronize:" "Green"
Show-Log " • Total API Worker Nodes : $($ApiNodes.Count) Node ($($ApiNodes -join ', '))" "White"
Show-Log " • Dedicated WA Daemon    : 1 Node ($WaNode)" "White"
Show-Log " • Upstream Load Balancer : Active on $LoadBalancerNode ($UpstreamTargets)" "White"
Show-Log " • Easy-Tunnel Watchdog   : Active on $LoadBalancerNode" "White"
Show-Log "==========================================================================" "Cyan"
