const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, exec } = require('child_process');
const { getPresets, savePresets } = require('./preset-store');
const { handleStreamQuickUpdate, handleStreamInstall } = require('./sse');

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

    if (pathname === '/api/watchdog-status' && req.method === 'GET') {
        handleWatchdogStatus(req, res, parsedUrl);
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
    const sshCmd = `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${user}@${ip} "echo SSH_OK"`;
    exec(sshCmd, (err, stdout) => {
        if (err || !stdout.includes('SSH_OK')) {
            callback(false, `Koneksi SSH Gagal ke ${user}@${ip}. Pastikan IP, user, dan file Key benar.`);
        } else {
            callback(true, `Koneksi SSH SUKSES ke ${user}@${ip}! Server siap dipasang.`);
        }
    });
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
        'ALL_IPS=$(ip -4 addr show 2>/dev/null | awk \'/inet / {print $NF "=>" $2}\' | tr \'\\n\' \',\' | sed \'s/,$//\')',
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

module.exports = {
    handleRequest
};

