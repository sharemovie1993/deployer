const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, exec } = require('child_process');
const { getPresets, savePresets } = require('./preset-store');
const { handleStreamQuickUpdate, handleStreamInstall, handleStreamClusterInstall, handleStreamSetupSsh, handleStreamPm2Logs } = require('./sse');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

let installParams = {};

function handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Static Files Handler
    if (pathname === '/' || pathname === '/index.html') {
        serveFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html');
        return;
    }
    if (pathname.startsWith('/css/')) {
        serveFile(res, path.join(PUBLIC_DIR, pathname), 'text/css');
        return;
    }
    if (pathname.startsWith('/js/')) {
        serveFile(res, path.join(PUBLIC_DIR, pathname), 'application/javascript');
        return;
    }

    // API Routes
    if (pathname === '/api/presets' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: getPresets() }));
        return;
    }

    if (pathname === '/api/presets' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const presets = getPresets();
                if (data.id) {
                    const idx = presets.findIndex(p => p.id === data.id);
                    if (idx !== -1) presets[idx] = { ...presets[idx], ...data };
                    else presets.push(data);
                } else {
                    data.id = 'preset-' + Date.now();
                    presets.push(data);
                }
                savePresets(presets);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, data: presets }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });
        return;
    }

    if (pathname === '/api/presets' && req.method === 'DELETE') {
        const id = parsedUrl.searchParams.get('id');
        let presets = getPresets();
        presets = presets.filter(p => p.id !== id);
        savePresets(presets);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: presets }));
        return;
    }

    if (pathname === '/api/stream-quick-update' && req.method === 'GET') {
        handleStreamQuickUpdate(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/stream-cluster-install' && req.method === 'GET') {
        handleStreamClusterInstall(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/stream-setup-ssh' && req.method === 'GET') {
        handleStreamSetupSsh(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/watchdog-status' && req.method === 'GET') {
        handleWatchdogStatus(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/stream-pm2-logs' && req.method === 'GET') {
        handleStreamPm2Logs(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/flush-pm2-logs' && (req.method === 'GET' || req.method === 'POST')) {
        handleFlushPm2Logs(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/audit-tunnels' && (req.method === 'GET' || req.method === 'POST')) {
        handleAuditTunnels(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/server-health' && (req.method === 'GET' || req.method === 'POST')) {
        handleServerHealth(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/restart-service' && (req.method === 'GET' || req.method === 'POST')) {
        handleRestartService(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/clean-ghost-tunnels' && (req.method === 'GET' || req.method === 'POST')) {
        handleCleanGhostTunnels(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/fix-tunnels' && (req.method === 'GET' || req.method === 'POST')) {
        handleFixTunnels(req, res, parsedUrl);
        return;
    }

    if (pathname === '/api/stream-install' && req.method === 'GET') {
        handleStreamInstall(req, res, installParams);
        return;
    }

    if (pathname === '/api/test-db' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                testDbConnection(data.dbUrl, (err, success, message) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success, message: err ? err.message : message }));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
            }
        });
        return;
    }

    if (pathname === '/api/test-ssh' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                testSshConnection(data, (success, message) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success, message }));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
            }
        });
        return;
    }

    if (pathname === '/api/save-config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                installParams = JSON.parse(body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
            }
        });
        return;
    }

    if (pathname === '/api/test-cluster-nodes' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString('utf8'); });
        req.on('end', () => {
            try {
                const data = body.trim() ? JSON.parse(body) : {};
                testClusterNodes(data, (results) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, nodes: results }));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON: ' + e.message }));
            }
        });
        return;
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
}

function serveFile(res, filePath, contentType) {
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`File ${path.basename(filePath)} not found.`);
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf8');
        }
    });
}

function testDbConnection(dbUrl, callback) {
    if (!dbUrl) return callback(null, false, 'DB URL kosong');
    try {
        const u = new URL(dbUrl);
        const host = u.hostname || 'localhost';
        const port = u.port || '5432';
        const net = require('net');
        const socket = new net.Socket();
        socket.setTimeout(4000);
        socket.on('connect', () => {
            socket.destroy();
            callback(null, true, `Port DB ${port} di ${host} TERBUKA & Merespon!`);
        });
        socket.on('error', (err) => {
            callback(err, false, `Port DB ${port} di ${host} TIDAK BISA DIJANGKAU: ${err.message}`);
        });
        socket.on('timeout', () => {
            socket.destroy();
            callback(null, false, `Koneksi ke DB ${host}:${port} TIMEOUT (4d)`);
        });
        socket.connect(Number(port), host);
    } catch (e) {
        callback(e, false, 'Format Database URL tidak valid: ' + e.message);
    }
}

function testSshConnection(data, callback) {
    const ip = data.vpsIp;
    const user = data.vpsUser || 'asepsuryadi';
    const keyPath = data.vpsKeyPath || path.join(__dirname, '..', 'nginxonly.pem');

    if (!ip) return callback(false, 'IP VPS belum diisi.');

    if (process.platform === 'win32') {
        const fixCmd = `icacls "${keyPath}" /inheritance:r /grant:r "%USERNAME%:R"`;
        exec(fixCmd, () => runSshTest(ip, user, keyPath, callback));
    } else {
        exec(`chmod 600 "${keyPath}"`, () => runSshTest(ip, user, keyPath, callback));
    }
}

function runSshTest(ip, user, keyPath, callback) {
    const sshCmd = `ssh -i "${keyPath}" -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${user}@${ip} "echo SSH_OK"`;
    exec(sshCmd, (err, stdout) => {
        if (err || !stdout.includes('SSH_OK')) {
            callback(false, `Koneksi SSH Gagal ke ${user}@${ip}. Pastikan IP, user, dan file Key benar.`);
        } else {
            callback(true, `Koneksi SSH SUKSES ke ${user}@${ip}! Server siap dipasang.`);
        }
    });
}

function testClusterNodes(data, callback) {
    const apiNodes = (data.apiNodes || '10.10.10.99').split(',').map(s => s.trim()).filter(Boolean);
    const waNode = (data.waNode || '10.10.10.99').trim();
    const lbNode = (data.loadBalancerNode || '10.10.10.99').trim();
    const dbNode = (data.dbNode || '10.10.10.99').trim();
    const user = data.targetUser || 'asepsuryadi';
    const ROOT_DIR = path.join(__dirname, '..');
    const rawKey = (data.keyPath || '').trim();
    const keyPath = path.isAbsolute(rawKey) ? rawKey : path.join(ROOT_DIR, rawKey || 'nginxonly.pem');

    const ipRolesMap = new Map();
    const addRole = (ip, role) => {
        if (!ip) return;
        if (!ipRolesMap.has(ip)) ipRolesMap.set(ip, []);
        ipRolesMap.get(ip).push(role);
    };

    apiNodes.forEach((ip, idx) => addRole(ip, `API Worker Node ${idx + 1}`));
    addRole(waNode, 'Singleton WA Daemon Node');
    addRole(lbNode, 'Edge Router / Load Balancer Node');
    addRole(dbNode, 'DB & Redis Node');

    const uniqueIps = Array.from(ipRolesMap.keys());

    if (process.platform === 'win32') {
        const fixCmd = `icacls "${keyPath}" /inheritance:r /grant:r "%USERNAME%:R"`;
        exec(fixCmd, () => runSequentialSshCheck(uniqueIps, ipRolesMap, user, keyPath, callback));
    } else {
        exec(`chmod 600 "${keyPath}"`, () => runSequentialSshCheck(uniqueIps, ipRolesMap, user, keyPath, callback));
    }
}

function runSequentialSshCheck(uniqueIps, ipRolesMap, user, keyPath, callback) {
    const results = [];
    let index = 0;

    function checkNext() {
        if (index >= uniqueIps.length) {
            return callback(results);
        }
        const ip = uniqueIps[index];
        const roles = ipRolesMap.get(ip).join(', ');
        const sshCmd = `ssh -i "${keyPath}" -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${user}@${ip} "echo SSH_OK"`;

        exec(sshCmd, (err, stdout) => {
            if (err || !stdout.includes('SSH_OK')) {
                results.push({ role: roles, ip, status: 'offline', message: `❌ SSH Gagal / Timeout ke ${user}@${ip}` });
            } else {
                results.push({ role: roles, ip, status: 'online', message: `🟢 TERHUBUNG (SSH Port 22 OK)` });
            }
            index++;
            checkNext();
        });
    }

    checkNext();
}

function handleWatchdogStatus(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan' }));
        return;
    }

    const fs = require('fs');
    let effectiveKey = (preset.vpsKeyPath && fs.existsSync(preset.vpsKeyPath))
        ? preset.vpsKeyPath
        : path.join(__dirname, '..', 'nginxonly.pem');

    const ip = preset.vpsIp;
    const user = preset.vpsUser || 'asepsuryadi';
    const sudoPass = (preset.vpsSudoPass || '1');

    // Script bash — output key=value per baris, log di-wrap dengan delimiter
    const checkScript = [
        'WG_IFACES=$( (ip link show type wireguard 2>/dev/null | grep -oP \'^\\d+: \\K[^\:]+\'; ls /var/www/project-absenta/tunnels/*.conf /etc/wireguard/*.conf 2>/dev/null | xargs -n1 basename 2>/dev/null | sed \'s/\\.conf$//\') | sort -u | tr \'\\n\' \',\' | sed \'s/,$//\' )',
        'WG_STATUS=$([ -n "$(ip link show type wireguard 2>/dev/null)" ] && echo "UP" || echo "DOWN")',
        'WG_HS=$(wg show all latest-handshakes 2>/dev/null | awk \'BEGIN{r=""}{if($2+0>0){ago=systime()-$2+0;if(ago<60){r=ago"s lalu"}else if(ago<3600){r=int(ago/60)"m lalu"}else{r="STALE"}}}END{print r}\')',
        'CADDY=$(systemctl is-active caddy 2>/dev/null || echo "unknown")',
        'PM2=$(pgrep -c -f "PM2" 2>/dev/null | awk \'{if($1+0>0) print "running"; else print "dead"}\')',
        `TIMER=$(echo '${sudoPass}' | sudo -S systemctl is-active absenta-tunnel-watchdog.timer 2>/dev/null || echo "not-installed")`,
        'ALL_IPS=$(ip -o -4 addr show 2>/dev/null | awk \'{print $2 "=>" $4}\' | tr \'\\n\' \',\' | sed \'s/,$//\')',
        'echo "WG_IFACES=$WG_IFACES"',
        'echo "WG_STATUS=$WG_STATUS"',
        'echo "WG_HS=$WG_HS"',
        'echo "CADDY=$CADDY"',
        'echo "PM2=$PM2"',
        'echo "TIMER=$TIMER"',
        'echo "ALL_IPS=$ALL_IPS"',
        'echo "LOG_BEGIN"',
        'tail -4 /var/log/absenta-tunnel-watchdog.log 2>/dev/null || true',
        'echo "LOG_END"',
    ].join('\n') + '\n';

    // Gunakan spawn + stdin pipe — satu koneksi SSH, andal di Windows
    const { spawn } = require('child_process');
    const sshArgs = [
        '-i', effectiveKey,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=10',
        '-o', 'BatchMode=yes',
        `${user}@${ip}`,
        'bash'
    ];

    let stdout = '';
    let stderr = '';
    let responded = false;

    const proc = spawn('ssh', sshArgs, { windowsHide: true });

    // Timeout 18 detik
    const timer = setTimeout(() => {
        if (!responded) {
            responded = true;
            proc.kill();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: `Timeout koneksi ke ${ip}`, offline: true }));
        }
    }, 18000);

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', (code) => {
        clearTimeout(timer);
        if (responded) return;
        responded = true;

        if (code !== 0 && !stdout.trim()) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: `SSH gagal (exit ${code}): ${stderr.trim().split('\n').pop() || 'tidak ada output'}`,
                offline: true
            }));
            return;
        }

        // Parse output key=value per baris
        const lines = stdout.split('\n');
        const kv = {};
        const logLines = [];
        let inLog = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === 'LOG_BEGIN') { inLog = true; continue; }
            if (trimmed === 'LOG_END')   { inLog = false; continue; }
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
            wg_ifaces:    kv['WG_IFACES']  || '',
            wg_status:    kv['WG_STATUS']   || 'DOWN',
            wg_handshake: kv['WG_HS']       || '',
            caddy:        kv['CADDY']        || 'unknown',
            pm2:          kv['PM2']          || 'dead',
            timer:        kv['TIMER']        || 'not-installed',
            all_ips:      kv['ALL_IPS']      || '',
            last_log:     logLines.slice(-4).join('|'),
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data }));
    });

    proc.on('error', (err) => {
        clearTimeout(timer);
        if (responded) return;
        responded = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: `SSH error: ${err.message}`, offline: true }));
    });

    // Kirim script via stdin
    proc.stdin.write(checkScript);
    proc.stdin.end();
}

function handleFixTunnels(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const p = presets.find(item => item.id === presetId);

    if (!p) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const ip = p.vpsIp;
    const user = p.vpsUser || 'asepsuryadi';
    const sudoPass = p.vpsSudoPass || '1';
    const keyChoice = p.sshKeyChoice || 'nginxonly.pem';
    const keyPath = keyChoice === 'custom'
        ? p.vpsKeyPath
        : path.join(__dirname, '..', keyChoice);

    if (!fs.existsSync(keyPath)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: `SSH Key file '${keyChoice}' tidak ditemukan.` }));
        return;
    }

    const safeKeyPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'tunnel-fix-key-safe.pem');
    try {
        fs.copyFileSync(keyPath, safeKeyPath);
    } catch (e) {}

    const scriptText = [
        '# Matikan interface bentrok jika ada >1 interface et-*',
        'UP_IFACES=$(ip link show | grep -o "et-[a-zA-Z0-9-]*" | sort -u)',
        'IFACE_COUNT=$(echo "$UP_IFACES" | grep -c "^et-" || echo 0)',
        'if [ "$IFACE_COUNT" -gt 1 ]; then',
        '  LATEST_IFACE=$(echo "$UP_IFACES" | tail -n 1)',
        '  for old_if in $UP_IFACES; do',
        '    if [ "$old_if" != "$LATEST_IFACE" ]; then',
        '      echo "' + sudoPass + '" | sudo -S wg-quick down "$old_if" 2>/dev/null || true',
        '      echo "' + sudoPass + '" | sudo -S systemctl disable "wg-quick@$old_if" 2>/dev/null || true',
        '      echo "' + sudoPass + '" | sudo -S rm -f "/etc/wireguard/$old_if.conf" "/var/www/project-absenta/tunnels/$old_if.conf" 2>/dev/null || true',
        '    fi',
        '  done',
        'fi',
        'echo "PASS=' + sudoPass + '"',
        'if [ -d "/var/www/project-absenta/tunnels" ]; then echo "' + sudoPass + '" | sudo -S chmod 600 /var/www/project-absenta/tunnels/*.conf 2>/dev/null || true; fi',
        'if [ -d "/etc/wireguard" ]; then echo "' + sudoPass + '" | sudo -S chmod 600 /etc/wireguard/*.conf 2>/dev/null || true; fi',
        'if command -v ufw >/dev/null 2>&1; then',
        '  echo "' + sudoPass + '" | sudo -S ufw allow 443/tcp 2>/dev/null || true',
        '  echo "' + sudoPass + '" | sudo -S ufw allow 80/tcp 2>/dev/null || true',
        '  echo "' + sudoPass + '" | sudo -S ufw allow 3001/tcp 2>/dev/null || true',
        '  echo "' + sudoPass + '" | sudo -S ufw allow 51820/udp 2>/dev/null || true',
        'fi',
        'echo "FIX_COMPLETE=1"',
        'echo "WG_IFACES=$(ip link show type wireguard 2>/dev/null | grep -oE \"et-[a-zA-Z0-9_-]+\" || true)"'
    ].join('\n') + '\n';

    const sshArgs = [
        '-i', safeKeyPath,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=10',
        '-o', 'BatchMode=yes',
        `${user}@${ip}`,
        'bash'
    ];

    const proc = spawn('ssh', sshArgs, { windowsHide: true });
    let stdout = '';
    let responded = false;

    const timer = setTimeout(() => {
        if (!responded) {
            responded = true;
            proc.kill();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: `Timeout perbaikan ke ${ip}` }));
        }
    }, 18000);

    proc.stdout.on('data', d => { stdout += d.toString(); });

    proc.on('close', (code) => {
        clearTimeout(timer);
        if (responded) return;
        responded = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: code === 0,
            message: code === 0 ? 'Izin file (chmod 600) & Firewall UFW berhasil diperbaiki!' : 'Perbaikan gagal.',
            output: stdout
        }));
    });

    proc.on('error', err => {
        clearTimeout(timer);
        if (responded) return;
        responded = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: `SSH error: ${err.message}` }));
    });

    proc.stdin.write(scriptText);
    proc.stdin.end();
}

function handleFlushPm2Logs(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');

    if (presetId && presetId !== 'local') {
        const presets = getPresets();
        const preset = presets.find(p => p.id === presetId);
        if (!preset) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
            return;
        }

        const keyPath = preset.vpsKeyPath || path.join(__dirname, '..', preset.sshKeyChoice || 'nginxonly.pem');
        const user = preset.vpsUser || 'asepsuryadi';
        const ip = preset.vpsIp;

        const sshArgs = [
            '-i', keyPath,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=10',
            `${user}@${ip}`,
            'pm2 flush'
        ];

        const proc = spawn('ssh', sshArgs, { windowsHide: true });
        let stdout = '';
        proc.stdout.on('data', d => stdout += d.toString());
        proc.on('close', (code) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: code === 0,
                message: code === 0 ? `Log PM2 di VPS ${ip} berhasil dibersihkan (pm2 flush).` : 'Gagal pm2 flush di VPS.'
            }));
        });
    } else {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'pm2.cmd' : 'pm2';
        const proc = spawn(cmd, ['flush'], { windowsHide: true, shell: isWin });
        proc.on('close', (code) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: code === 0,
                message: code === 0 ? 'Log PM2 lokal berhasil dibersihkan (pm2 flush).' : 'Gagal pm2 flush lokal.'
            }));
        });
    }
}

function handleAuditTunnels(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const p = presets.find(item => item.id === presetId);

    if (!p && presetId !== 'local') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const isLocal = !p || presetId === 'local';
    const ip = isLocal ? '127.0.0.1' : p.vpsIp;
    const user = isLocal ? '' : (p.vpsUser || 'asepsuryadi');
    const keyChoice = isLocal ? '' : (p.sshKeyChoice || 'nginxonly.pem');
    const keyPath = isLocal ? '' : (keyChoice === 'custom' ? p.vpsKeyPath : path.join(__dirname, '..', keyChoice));

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
    ].join('\n') + '\n';

    let proc;
    if (isLocal && process.platform === 'win32') {
        const psCmd = `
            Get-ChildItem -Path "d:\\BarayaProject\\Project Absenta\\tunnels\\*.conf","C:\\Program Files\\WireGuard\\Data\\Configurations\\*.conf" -ErrorAction SilentlyContinue | ForEach-Object {
                $ifName = $_.BaseName
                $svc = Get-Service -Name "WireGuardTunnel$ifName" -ErrorAction SilentlyContinue
                $status = if ($svc -and $svc.Status -eq 'Running') { 'UP' } else { 'DOWN' }
                $enabled = if ($svc) { 'enabled' } else { 'disabled' }
                $confStr = Get-Content $_.FullName -ErrorAction SilentlyContinue | Out-String
                $keyMatch = [regex]::Match($confStr, 'LicenseKey\\s*=\\s*(\\S+)')
                $licKey = if ($keyMatch.Success) { $keyMatch.Groups[1].Value } else { '' }
                $ipMatch = [regex]::Match($confStr, 'Address\\s*=\\s*(\\S+)')
                $vpnIp = if ($ipMatch.Success) { $ipMatch.Groups[1].Value } else { '' }
                "AUDIT_ITEM|$ifName|$status|$enabled|$licKey|$vpnIp|0"
            }
        `;
        proc = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], { windowsHide: true });
    } else {
        const safeKeyPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'audit-key-safe.pem');
        try { fs.copyFileSync(keyPath, safeKeyPath); } catch (e) {}
        const sshArgs = [
            '-i', safeKeyPath,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=10',
            '-o', 'BatchMode=yes',
            `${user}@${ip}`,
            'bash'
        ];
        proc = spawn('ssh', sshArgs, { windowsHide: true });
    }

    let stdout = '';
    let responded = false;
    const timer = setTimeout(() => {
        if (responded) return;
        responded = true;
        try { proc.kill(); } catch (e) {}
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Audit SSH timeout (15 detik).' }));
    }, 15000);

    if (proc.stdout) proc.stdout.on('data', d => stdout += d.toString());
    if (proc.stderr) proc.stderr.on('data', d => stdout += d.toString());

    proc.on('close', async (code) => {
        clearTimeout(timer);
        if (responded) return;
        responded = true;

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
                        const fetchRes = await fetch(`https://api.absenta.id/api/license/easy-tunnel/validate/${encodeURIComponent(licenseKey)}`, { signal: AbortSignal.timeout(5000) });
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

    if (proc.stdin) {
        proc.stdin.write(scriptText);
        proc.stdin.end();
    }
}

function handleCleanGhostTunnels(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const p = presets.find(item => item.id === presetId);

    if (!p && presetId !== 'local') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const isLocal = !p || presetId === 'local';
    const ip = isLocal ? '127.0.0.1' : p.vpsIp;
    const user = isLocal ? '' : (p.vpsUser || 'asepsuryadi');
    const sudoPass = isLocal ? '' : (p.vpsSudoPass || '1');
    const keyChoice = isLocal ? '' : (p.sshKeyChoice || 'nginxonly.pem');
    const keyPath = isLocal ? '' : (keyChoice === 'custom' ? p.vpsKeyPath : path.join(__dirname, '..', keyChoice));

    const scriptText = [
        'echo "=== PEMBERSIHAN TUNNEL GHOST & STALE ==="',
        'UP_IFACES=$(ip link show | grep -o "et-[a-zA-Z0-9-]*" | sort -u)',
        'IFACE_COUNT=$(echo "$UP_IFACES" | grep -c "^et-" || echo 0)',
        'CLEANED=0',
        'if [ "$IFACE_COUNT" -gt 1 ]; then',
        '  LATEST_IFACE=$(echo "$UP_IFACES" | tail -n 1)',
        '  for old_if in $UP_IFACES; do',
        '    if [ "$old_if" != "$LATEST_IFACE" ]; then',
        '      echo "🧹 Mematikan interface kernel & systemd: $old_if"',
        '      echo "' + sudoPass + '" | sudo -S ip link delete "$old_if" 2>/dev/null || true',
        '      echo "' + sudoPass + '" | sudo -S wg-quick down "$old_if" 2>/dev/null || true',
        '      echo "' + sudoPass + '" | sudo -S systemctl disable "wg-quick@$old_if" 2>/dev/null || true',
        '      echo "' + sudoPass + '" | sudo -S rm -f "/etc/wireguard/$old_if.conf" "/var/www/project-absenta/tunnels/$old_if.conf" 2>/dev/null || true',
        '      CLEANED=$((CLEANED + 1))',
        '    fi',
        '  done',
        'fi',
        'echo "CLEANUP_COUNT=$CLEANED"'
    ].join('\n') + '\n';

    let proc;
    if (isLocal && process.platform === 'win32') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Pembersihan lokal Windows selesai.' }));
        return;
    } else {
        const safeKeyPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'clean-key-safe.pem');
        try { fs.copyFileSync(keyPath, safeKeyPath); } catch (e) {}
        const sshArgs = [
            '-i', safeKeyPath,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=10',
            '-o', 'BatchMode=yes',
            `${user}@${ip}`,
            'bash'
        ];
        proc = spawn('ssh', sshArgs, { windowsHide: true });
    }

    let stdout = '';
    let responded = false;
    const timer = setTimeout(() => {
        if (responded) return;
        responded = true;
        try { proc.kill(); } catch (e) {}
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Pembersihan SSH timeout (15 detik).' }));
    }, 15000);

    if (proc.stdout) proc.stdout.on('data', d => stdout += d.toString());
    if (proc.stderr) proc.stderr.on('data', d => stdout += d.toString());

    proc.on('close', (code) => {
        clearTimeout(timer);
        if (responded) return;
        responded = true;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: code === 0,
            message: code === 0 ? 'Pembersihan tunnel bentrok/ghost di server VPS berhasil dijalankan!' : 'Gagal menjalankan pembersihan di VPS.',
            raw_output: stdout
        }));
    });

    if (proc.stdin) {
        proc.stdin.write(scriptText);
        proc.stdin.end();
    }
}

function handleServerHealth(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const p = presets.find(item => item.id === presetId);

    if (!p && presetId !== 'local') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const isLocal = !p || presetId === 'local';
    const ip = isLocal ? '127.0.0.1' : p.vpsIp;
    const user = isLocal ? '' : (p.vpsUser || 'asepsuryadi');
    const sudoPass = isLocal ? '' : (p.vpsSudoPass || '1');
    const keyChoice = isLocal ? '' : (p.sshKeyChoice || 'nginxonly.pem');
    const keyPath = isLocal ? '' : (keyChoice === 'custom' ? p.vpsKeyPath : path.join(__dirname, '..', keyChoice));

    const scriptText = [
        'echo "=== CADDY_STATUS ==="',
        'systemctl is-active caddy 2>/dev/null || echo "inactive"',
        'echo "=== CADDY_LISTEN ==="',
        'echo "' + sudoPass + '" | sudo -S ss -tulpn 2>/dev/null | grep caddy || ss -tulpn 2>/dev/null | grep -E ":(443|80)\\b" || true',
        'echo "=== RAM_INFO ==="',
        'free -m 2>/dev/null || true',
        'echo "=== DISK_INFO ==="',
        'df -h / 2>/dev/null || true',
        'echo "=== CPU_INFO ==="',
        'top -bn1 2>/dev/null | grep "Cpu(s)" || true',
        'echo "=== BACKEND_HTTP ==="',
        'curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://127.0.0.1:3003/ || echo "000"',
        'echo ""',
        'echo "=== PM2_JSON ==="',
        'pm2 jlist 2>/dev/null || echo "[]"',
        'echo "=== END_PM2 ==="'
    ].join('\n') + '\n';

    let proc;
    if (isLocal && process.platform === 'win32') {
        const psCmd = `
            $pm2 = pm2 jlist 2>$null
            if (-not $pm2) { $pm2 = '[]' }
            Write-Host "=== PM2_JSON ==="
            Write-Host $pm2
            Write-Host "=== END_PM2 ==="
        `;
        proc = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], { windowsHide: true });
    } else {
        const safeKeyPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'health-key-safe.pem');
        try { fs.copyFileSync(keyPath, safeKeyPath); } catch (e) {}
        const sshArgs = [
            '-i', safeKeyPath,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=10',
            '-o', 'BatchMode=yes',
            `${user}@${ip}`,
            'bash'
        ];
        proc = spawn('ssh', sshArgs, { windowsHide: true });
    }

    let stdout = '';
    let responded = false;
    const timer = setTimeout(() => {
        if (responded) return;
        responded = true;
        try { proc.kill(); } catch (e) {}
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Health SSH timeout (15 detik).' }));
    }, 15000);

    if (proc.stdout) proc.stdout.on('data', d => stdout += d.toString());
    if (proc.stderr) proc.stderr.on('data', d => stdout += d.toString());

    proc.on('close', (code) => {
        clearTimeout(timer);
        if (responded) return;
        responded = true;

        const caddyActive = stdout.includes('=== CADDY_STATUS ===\nactive') || stdout.includes('=== CADDY_STATUS ===\r\nactive');
        const caddyPorts = stdout.includes(':443') || stdout.includes(':80');
        const backendCodeMatch = stdout.match(/=== BACKEND_HTTP ===\s*(\d+)/);
        const backendCode = backendCodeMatch ? backendCodeMatch[1] : '000';

        let pm2Processes = [];
        const pm2Match = stdout.match(/=== PM2_JSON ===\s*([\s\S]*?)\s*=== END_PM2 ===/);
        if (pm2Match && pm2Match[1]) {
            try {
                const rawJson = JSON.parse(pm2Match[1].trim());
                pm2Processes = rawJson.map(p => ({
                    name: p.name,
                    pm_id: p.pm_id,
                    status: p.pm2_env ? p.pm2_env.status : 'unknown',
                    restarts: p.pm2_env ? p.pm2_env.restart_time : 0,
                    memory_mb: p.monit ? Math.round((p.monit.memory || 0) / (1024 * 1024)) : 0,
                    cpu_percent: p.monit ? p.monit.cpu || 0 : 0,
                    uptime_sec: p.pm2_env && p.pm2_env.pm_uptime ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000) : 0
                }));
            } catch (e) {}
        }

        let ramSummary = { total_mb: 0, used_mb: 0, free_mb: 0 };
        const ramMatch = stdout.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/);
        if (ramMatch) {
            ramSummary = { total_mb: parseInt(ramMatch[1]), used_mb: parseInt(ramMatch[2]), free_mb: parseInt(ramMatch[3]) };
        }

        let diskSummary = { usage_pct: '0%' };
        const diskMatch = stdout.match(/\/\s*[\r\n].*?(\d+%\s*\/)/) || stdout.match(/(\d+%)\s+\//);
        if (diskMatch) {
            diskSummary = { usage_pct: diskMatch[1] };
        }

        let totalCpuPct = 0;
        const cpuMatch = stdout.match(/%Cpu\(s\):\s*([\d\.,]+)\s+us,\s*([\d\.,]+)\s+sy.*?([\d\.,]+)\s+id/);
        if (cpuMatch) {
            const idle = parseFloat(cpuMatch[3].replace(',', '.'));
            totalCpuPct = Math.max(0, Math.round((100 - idle) * 10) / 10);
        } else if (pm2Processes.length > 0) {
            totalCpuPct = Math.round(pm2Processes.reduce((acc, p) => acc + (p.cpu_percent || 0), 0) * 10) / 10;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            server_ip: ip,
            caddy: {
                active: caddyActive,
                ports_bound: caddyPorts
            },
            backend_http_code: backendCode,
            pm2_workers: pm2Processes,
            ram: ramSummary,
            disk: diskSummary,
            cpu: {
                usage_pct: totalCpuPct
            },
            raw_output: stdout
        }));
    });

    if (proc.stdin) {
        proc.stdin.write(scriptText);
        proc.stdin.end();
    }
}

function handleRestartService(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const serviceName = parsedUrl.searchParams.get('service') || 'all';
    const presets = getPresets();
    const p = presets.find(item => item.id === presetId);

    if (!p && presetId !== 'local') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const isLocal = !p || presetId === 'local';
    const ip = isLocal ? '127.0.0.1' : p.vpsIp;
    const user = isLocal ? '' : (p.vpsUser || 'asepsuryadi');
    const sudoPass = isLocal ? '' : (p.vpsSudoPass || '1');
    const keyChoice = isLocal ? '' : (p.sshKeyChoice || 'nginxonly.pem');
    const keyPath = isLocal ? '' : (keyChoice === 'custom' ? p.vpsKeyPath : path.join(__dirname, '..', keyChoice));

    let restartCmd = '';
    if (serviceName === 'caddy') {
        restartCmd = `echo "${sudoPass}" | sudo -S systemctl restart caddy`;
    } else if (serviceName === 'all') {
        restartCmd = `pm2 restart all && pm2 save`;
    } else {
        restartCmd = `pm2 restart "${serviceName}" && pm2 save`;
    }

    let proc;
    if (isLocal && process.platform === 'win32') {
        const psCmd = serviceName === 'caddy' ? `Restart-Service -Name caddy -ErrorAction SilentlyContinue` : `pm2 restart ${serviceName}`;
        proc = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], { windowsHide: true });
    } else {
        const safeKeyPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'restart-key-safe.pem');
        try { fs.copyFileSync(keyPath, safeKeyPath); } catch (e) {}
        const sshArgs = [
            '-i', safeKeyPath,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=10',
            '-o', 'BatchMode=yes',
            `${user}@${ip}`,
            'bash'
        ];
        proc = spawn('ssh', sshArgs, { windowsHide: true });
    }

    let stdout = '';
    let responded = false;
    const timer = setTimeout(() => {
        if (responded) return;
        responded = true;
        try { proc.kill(); } catch (e) {}
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Restart SSH timeout (15 detik).' }));
    }, 15000);

    if (proc.stdout) proc.stdout.on('data', d => stdout += d.toString());
    if (proc.stderr) proc.stderr.on('data', d => stdout += d.toString());

    proc.on('close', (code) => {
        clearTimeout(timer);
        if (responded) return;
        responded = true;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: code === 0,
            message: code === 0 ? `Layanan '${serviceName}' berhasil di-restart di server ${ip}.` : `Gagal restart layanan '${serviceName}'.`,
            raw_output: stdout
        }));
    });

    if (proc.stdin) {
        proc.stdin.write(restartCmd + '\n');
        proc.stdin.end();
    }
}

module.exports = {
    handleRequest
};

