const { getPresets } = require('../preset-store');
const { executeSshCommand } = require('../ssh-helper');

function handleAuditTunnels(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset && presetId !== 'local') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const isLocal = !preset || presetId === 'local';
    const ip = isLocal ? '127.0.0.1' : preset.vpsIp;
    const user = isLocal ? '' : (preset.vpsUser || 'asepsuryadi');
    const rawKey = isLocal ? '' : (preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem');

    const scriptText = [
        'ALL_IFACES=$( (ip link show type wireguard 2>/dev/null | grep -o "et-[a-zA-Z0-9-]*" ; ls /etc/wireguard/et-*.conf /var/www/project-absenta/tunnels/et-*.conf 2>/dev/null | sed "s/.*\\///;s/\\.conf//" ) | sort -u )',
        'for iface in $ALL_IFACES; do',
        '  [ -n "$iface" ] || continue',
        '  conf=""',
        '  if [ -f "/var/www/project-absenta/tunnels/${iface}.conf" ]; then',
        '    conf="/var/www/project-absenta/tunnels/${iface}.conf"',
        '  elif [ -f "/etc/wireguard/${iface}.conf" ]; then',
        '    conf="/etc/wireguard/${iface}.conf"',
        '  fi',
        '  ',
        '  is_up="DOWN"',
        '  if ip link show "$iface" 2>/dev/null | grep -q "UP"; then',
        '    is_up="UP"',
        '  fi',
        '  ',
        '  is_enabled="disabled"',
        '  if systemctl is-enabled "wg-quick@$iface" 2>/dev/null | grep -q "enabled"; then',
        '    is_enabled="enabled"',
        '  fi',
        '  ',
        '  lic_key=""',
        '  vpn_ip=""',
        '  if [ -n "$conf" ]; then',
        '    lic_key=$(grep -iE "LicenseKey" "$conf" 2>/dev/null | head -1 | awk -F"=" "{print \\$2}" | xargs || true)',
        '    vpn_ip=$(grep -iE "Address" "$conf" 2>/dev/null | head -1 | awk -F"=" "{print \\$2}" | xargs || true)',
        '  fi',
        '  ',
        '  hs=$(sudo wg show "$iface" latest-handshakes 2>/dev/null | awk "{print \\$2}" | head -1 || echo "0")',
        '  ',
        '  echo "AUDIT_ITEM|${iface}|${is_up}|${is_enabled}|${lic_key}|${vpn_ip}|${hs}"',
        'done'
    ].join('\n');

    executeSshCommand({
        rawKeyPath: rawKey,
        user,
        ip,
        command: scriptText,
        timeoutMs: 15000
    }).then(async (result) => {
        const stdout = result.stdout || '';
        const items = [];
        const lines = stdout.split('\n');
        const processedIfaces = new Set();

        for (const line of lines) {
            if (line.startsWith('AUDIT_ITEM|')) {
                const parts = line.trim().split('|');
                const ifName = parts[1];
                if (!ifName || processedIfaces.has(ifName)) continue;
                processedIfaces.add(ifName);

                const slug = ifName.replace(/^et-/, '');
                const isUp = parts[2] === 'UP';
                const isEnabled = parts[3] === 'enabled';
                const licenseKey = parts[4] || '';
                const vpnIp = parts[5] || '';
                const hsSec = parseInt(parts[6] || '0', 10);

                let licenseData = null;
                if (licenseKey) {
                    try {
                        const fetchRes = await fetch(`https://api.absenta.id/api/license/easy-tunnel/validate/${encodeURIComponent(licenseKey)}`, { signal: AbortSignal.timeout(4000) });
                        const json = await fetchRes.json();
                        if (json.success) licenseData = json.data;
                    } catch (e) {}
                }

                items.push({
                    slug,
                    interface_name: ifName,
                    is_up: isUp,
                    systemd_enabled: isEnabled,
                    license_key: licenseKey,
                    vpn_ip: vpnIp,
                    handshake_sec: hsSec,
                    license_data: licenseData
                });
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            server_ip: ip,
            tunnels_count: items.length,
            tunnels: items,
            raw_output: stdout
        }));
    });
}

function handleFixTunnels(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const rawKey = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
    const sudoPass = preset.vpsSudoPass || '1';

    const fixCmd = [
        '# Auto-sanitize netmask /24 ke /32 pada semua file .conf WireGuard',
        'echo "' + sudoPass + '" | sudo -S sed -i -E "s|Address = ([0-9.]+)/24|Address = \\1/32|g" /etc/wireguard/et-*.conf /var/www/project-absenta/tunnels/et-*.conf 2>/dev/null || true',
        'if [ -d "/var/www/project-absenta/tunnels" ]; then echo "' + sudoPass + '" | sudo -S chmod 600 /var/www/project-absenta/tunnels/*.conf 2>/dev/null || true; fi',
        'if [ -d "/etc/wireguard" ]; then echo "' + sudoPass + '" | sudo -S chmod 600 /etc/wireguard/*.conf 2>/dev/null || true; fi',
        'if command -v ufw >/dev/null 2>&1; then',
        '  echo "' + sudoPass + '" | sudo -S ufw allow 443/tcp 2>/dev/null || true',
        '  echo "' + sudoPass + '" | sudo -S ufw allow 80/tcp 2>/dev/null || true',
        '  echo "' + sudoPass + '" | sudo -S ufw allow 3001/tcp 2>/dev/null || true',
        '  echo "' + sudoPass + '" | sudo -S ufw allow 51820/udp 2>/dev/null || true',
        'fi',
        'echo "FIX_COMPLETE=1"'
    ].join('\n');

    executeSshCommand({
        rawKeyPath: rawKey,
        user: preset.vpsUser || 'asepsuryadi',
        ip: preset.vpsIp,
        command: fixCmd,
        timeoutMs: 15000
    }).then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: result.success,
            message: 'Sanitasi netmask /32 & perbaikan tunnel WireGuard selesai.',
            stdout: result.stdout
        }));
    });
}

function handleCleanGhostTunnels(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const rawKey = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
    const sudoPass = preset.vpsSudoPass || '1';

    const cleanCmd = [
        'for iface in $(ip link show type wireguard 2>/dev/null | grep -oE "et-[a-zA-Z0-9_-]+"); do',
        '  if [ ! -f "/etc/wireguard/${iface}.conf" ] && [ ! -f "/var/www/project-absenta/tunnels/${iface}.conf" ]; then',
        '    echo "' + sudoPass + '" | sudo -S wg-quick down "$iface" 2>/dev/null || true',
        '    echo "' + sudoPass + '" | sudo -S ip link delete "$iface" 2>/dev/null || true',
        '  fi',
        'done',
        'echo "CLEAN_GHOST_COMPLETE=1"'
    ].join('\n');

    executeSshCommand({
        rawKeyPath: rawKey,
        user: preset.vpsUser || 'asepsuryadi',
        ip: preset.vpsIp,
        command: cleanCmd,
        timeoutMs: 15000
    }).then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: result.success,
            message: 'Pembersihan interface ghost WireGuard selesai.',
            stdout: result.stdout
        }));
    });
}

function handleRemoveSelectedTunnel(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const iface = parsedUrl.searchParams.get('iface');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset || !iface) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Parameter preset atau interface WireGuard tidak valid.' }));
        return;
    }

    const rawKey = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
    const sudoPass = preset.vpsSudoPass || '1';

    const removeCmd = [
        `echo '${sudoPass}' | sudo -S wg-quick down ${iface} 2>/dev/null || true`,
        `echo '${sudoPass}' | sudo -S ip link delete ${iface} 2>/dev/null || true`,
        `echo '${sudoPass}' | sudo -S rm -f /etc/wireguard/${iface}.conf /var/www/project-absenta/tunnels/${iface}.conf 2>/dev/null || true`,
        `echo "REMOVE_IFACE_COMPLETE=1"`
    ].join('\n');

    executeSshCommand({
        rawKeyPath: rawKey,
        user: preset.vpsUser || 'asepsuryadi',
        ip: preset.vpsIp,
        command: removeCmd,
        timeoutMs: 15000
    }).then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: result.success,
            message: `Penghapusan interface WireGuard ${iface} selesai.`,
            stdout: result.stdout
        }));
    });
}

function handleWatchdogStatus(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const rawKey = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
    const sudoPass = preset.vpsSudoPass || '1';

    const checkScript = [
        'WG_IFACES=$( (ip link show type wireguard 2>/dev/null | grep -oP \'^\\d+: \\K[^\:]+\'; ls /var/www/project-absenta/tunnels/*.conf /etc/wireguard/*.conf 2>/dev/null | xargs -n1 basename 2>/dev/null | sed \'s/\\.conf$//\') | sort -u | tr \'\\n\' \',\' | sed \'s/,$//\' )',
        'WG_STATUS=$([ -n "$(ip link show type wireguard 2>/dev/null)" ] && echo "UP" || echo "DOWN")',
        'WG_HS=$(wg show all latest-handshakes 2>/dev/null | awk \'BEGIN{r=""}{if($2+0>0){ago=systime()-$2+0;if(ago<60){r=ago"s lalu"}else if(ago<3600){r=int(ago/60)"m lalu"}else{r="STALE"}}}END{print r}\')',
        'CADDY=$(systemctl is-active caddy 2>/dev/null || echo "unknown")',
        'PM2=$(pgrep -c -f "PM2" 2>/dev/null | awk \'{if($1+0>0) print "running"; else print "dead"}\')',
        `TIMER=$(echo '${sudoPass}' | sudo -S systemctl is-active absenta-tunnel-watchdog.timer 2>/dev/null || echo "not-installed")`,
        'MINIO=$(systemctl is-active minio 2>/dev/null || echo "unknown")',
        'MINIO_PORT=$((ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null) | grep -q ":9000" && echo "ONLINE (Port 9000)" || echo "OFFLINE (Port 9000)")',
        'COTURN=$(systemctl is-active coturn 2>/dev/null || echo "unknown")',
        'COTURN_PORT=$((ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null) | grep -q ":3478" && echo "ONLINE (Port 3478)" || echo "OFFLINE (Port 3478)")',
        'ALL_IPS=$(ip -o -4 addr show 2>/dev/null | awk \'{print $2 "=>" $4}\' | tr \'\\n\' \',\' | sed \'s/,$//\')',
        'RAM_USAGE=$(free -m 2>/dev/null | awk \'/Mem:/{printf "%.0f%%", $3/$2*100}\')',
        'DISK_USAGE=$(df -h / 2>/dev/null | awk \'END{print $5}\')',
        'UPTIME=$(uptime -p 2>/dev/null | sed "s/up //")',
        'LATVAL=$(ping -c 1 -W 2 10.0.0.1 2>/dev/null | grep -o "time=[0-9.]*" | head -n 1 | cut -d= -f2)',
        'LATENCY=$([ -n "$LATVAL" ] && echo "${LATVAL}ms" || echo "N/A")',
        'echo "WG_IFACES=$WG_IFACES"',
        'echo "WG_STATUS=$WG_STATUS"',
        'echo "WG_HS=$WG_HS"',
        'echo "CADDY=$CADDY"',
        'echo "PM2=$PM2"',
        'echo "TIMER=$TIMER"',
        'echo "MINIO=$MINIO"',
        'echo "MINIO_PORT=$MINIO_PORT"',
        'echo "COTURN=$COTURN"',
        'echo "COTURN_PORT=$COTURN_PORT"',
        'echo "ALL_IPS=$ALL_IPS"',
        'echo "RAM_USAGE=$RAM_USAGE"',
        'echo "DISK_USAGE=$DISK_USAGE"',
        'echo "UPTIME=$UPTIME"',
        'echo "LATENCY=$LATENCY"',
        'echo "LOG_BEGIN"',
        'tail -15 /var/log/absenta-tunnel-watchdog.log 2>/dev/null || true',
        'echo "LOG_END"'
    ].join('\n');

    executeSshCommand({
        rawKeyPath: rawKey,
        user: preset.vpsUser || 'asepsuryadi',
        ip: preset.vpsIp,
        command: checkScript,
        timeoutMs: 18000
    }).then(result => {
        if (!result.success && !result.stdout.trim()) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: `SSH gagal: ${result.stderr.trim().split('\n').pop() || 'tidak ada output'}`,
                offline: true
            }));
            return;
        }

        const lines = result.stdout.split('\n');
        const kv = {};
        const logLines = [];
        let inLog = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === 'LOG_BEGIN') { inLog = true; continue; }
            if (trimmed === 'LOG_END') { inLog = false; continue; }
            if (inLog) {
                if (trimmed) logLines.push(trimmed);
                continue;
            }
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
                const key = trimmed.slice(0, eqIdx);
                const val = trimmed.slice(eqIdx + 1);
                kv[key] = val;
            }
        }

        const data = {
            wg_ifaces: kv['WG_IFACES'] || '',
            wg_status: kv['WG_STATUS'] || 'DOWN',
            wg_handshake: kv['WG_HS'] || '',
            caddy: kv['CADDY'] || 'unknown',
            pm2: kv['PM2'] || 'dead',
            timer: kv['TIMER'] || 'not-installed',
            minio: kv['MINIO'] || 'unknown',
            minio_port: kv['MINIO_PORT'] || 'OFFLINE (Port 9000)',
            coturn: kv['COTURN'] || 'unknown',
            coturn_port: kv['COTURN_PORT'] || 'OFFLINE (Port 3478)',
            all_ips: kv['ALL_IPS'] || '',
            ram_usage: kv['RAM_USAGE'] || '0%',
            disk_usage: kv['DISK_USAGE'] || '0%',
            uptime: kv['UPTIME'] || 'unknown',
            latency: kv['LATENCY'] || 'N/A',
            last_log: logLines.join('\n')
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data }));
    });
}

module.exports = {
    handleAuditTunnels,
    handleFixTunnels,
    handleCleanGhostTunnels,
    handleRemoveSelectedTunnel,
    handleWatchdogStatus
};
