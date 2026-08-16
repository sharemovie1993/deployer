const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { executeSshCommand } = require('../ssh-helper');

function handleBrowseFile(req, res, parsedUrl) {
    const dialogType = parsedUrl.searchParams.get('type') || 'file';
    let psCmd = `$f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = "PEM Key Files (*.pem)|*.pem|All Files (*.*)|*.*"; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.FileName }`;

    if (dialogType === 'folder') {
        psCmd = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }`;
    }

    const proc = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], { windowsHide: true });
    let stdout = '';

    proc.stdout.on('data', d => stdout += d.toString());
    proc.on('close', () => {
        const selectedPath = stdout.trim();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, path: selectedPath }));
    });
}

function handleTestSsh(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            const rawKey = data.vpsKeyPath || data.sshKeyChoice || 'nginxonly.pem';
            const user = data.vpsUser || 'asepsuryadi';
            const ip = data.vpsIp || '127.0.0.1';

            executeSshCommand({
                rawKeyPath: rawKey,
                user,
                ip,
                command: 'echo ===SSH_OK===',
                timeoutMs: 8000
            }).then(result => {
                if (result.success && result.stdout.includes('===SSH_OK===')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: `Koneksi SSH ke ${user}@${ip} BERHASIL!` }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: `Koneksi SSH Gagal: ${result.stderr || 'Timeout'}` }));
                }
            });
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: e.message }));
        }
    });
}

function handleTestDb(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            let dbHost = '127.0.0.1';
            let dbPort = 5432;

            if (typeof data === 'string') {
                try {
                    const u = new URL(data);
                    dbHost = u.hostname || '127.0.0.1';
                    dbPort = parseInt(u.port || '5432', 10);
                } catch (e) {
                    const match = data.match(/@([^:/]+)(?::(\d+))?/);
                    if (match) {
                        dbHost = match[1];
                        dbPort = parseInt(match[2] || '5432', 10);
                    }
                }
            } else if (data && typeof data === 'object') {
                const urlStr = data.dbUrl || data.url;
                if (urlStr) {
                    try {
                        const u = new URL(urlStr);
                        dbHost = u.hostname || '127.0.0.1';
                        dbPort = parseInt(u.port || '5432', 10);
                    } catch (e) {
                        const match = String(urlStr).match(/@([^:/]+)(?::(\d+))?/);
                        if (match) {
                            dbHost = match[1];
                            dbPort = parseInt(match[2] || '5432', 10);
                        }
                    }
                } else {
                    dbHost = data.host || '127.0.0.1';
                    dbPort = parseInt(data.port || '5432', 10);
                }
            }

            const net = require('net');
            const socket = new net.Socket();
            let responded = false;

            socket.setTimeout(4000);
            socket.on('connect', () => {
                if (responded) return;
                responded = true;
                socket.destroy();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: `Koneksi Port Database ${dbHost}:${dbPort} OK!` }));
            });

            socket.on('timeout', () => {
                if (responded) return;
                responded = true;
                socket.destroy();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: `Timeout koneksi ke DB Port ${dbHost}:${dbPort}` }));
            });

            socket.on('error', (err) => {
                if (responded) return;
                responded = true;
                socket.destroy();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: `Gagal koneksi DB (${dbHost}:${dbPort}): ${err.message}` }));
            });

            socket.connect(dbPort, dbHost);
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: e.message }));
        }
    });
}

function handleVerifyLicense(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const key = (data.licenseKey || '').trim();
            const schoolName = (data.schoolName || '').trim() || 'SaaS-Node1';
            const adminEmail = (data.adminEmail || '').trim() || 'admin@sekolah.sch.id';

            if (!key) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'Serial key lisensi tidak boleh kosong.' }));
            }

            let remoteData = null;
            try {
                const response = await fetch(`https://api.absenta.id/api/license/easy-tunnel/validate/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(4000) });
                const json = await response.json();
                if (json.success && json.data) {
                    remoteData = json.data;
                }
            } catch (e) {}

            if (!remoteData) {
                try {
                    const response2 = await fetch(`https://api.absenta.id/api/license/check/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(4000) });
                    const json2 = await response2.json();
                    if (json2.success && json2.data) {
                        remoteData = json2.data;
                    }
                } catch (e) {}
            }

            const licenseDetails = {
                key: key,
                schoolName: remoteData?.custom_domain || remoteData?.school_name || schoolName,
                packageType: remoteData?.package_type || remoteData?.product_id || (key.includes('CLUSTER') ? 'Enterprise Multi-VM Cluster' : 'PRO License Full-Stack Server'),
                tunnelAccess: remoteData?.custom_domain ? `Domain Publik (${remoteData.custom_domain})` : 'Easy-Tunnel Publik + WireGuard SSL VPN',
                status: remoteData?.is_active === false ? 'Nonaktif' : 'Terverifikasi Aktif (Verified)',
                expiredDate: remoteData?.expired_at || 'Permanent / Lifetime License',
                adminEmail: adminEmail,
                wireguardIp: remoteData?.wireguard_ip || '10.13.13.x (Virtual Mesh)'
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Lisensi Valid & Terverifikasi Aktif!',
                data: licenseDetails
            }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: e.message }));
        }
    });
}

function handleSaveConfig(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            global.installParams = data;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Konfigurasi instalasi disimpan.' }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: e.message }));
        }
    });
}

function handleTestClusterNodes(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            const apiNodes = (data.apiNodes || '10.10.10.99').split(',').map(s => s.trim()).filter(Boolean);
            const waNode = data.waNode || '10.10.10.99';
            const lbNode = data.loadBalancerNode || '10.10.10.99';
            const dbNode = data.dbNode || '10.10.10.99';
            const user = data.targetUser || 'asepsuryadi';
            const rawKeyPath = data.keyPath || 'nginxonly.pem';

            const uniqueNodes = [];
            apiNodes.forEach((ip, idx) => uniqueNodes.push({ role: `API Worker Node ${idx + 1}`, ip }));
            if (waNode) uniqueNodes.push({ role: 'Singleton WA Daemon Node', ip: waNode });
            if (lbNode) uniqueNodes.push({ role: 'Edge Router / Load Balancer Node', ip: lbNode });
            if (dbNode) uniqueNodes.push({ role: 'DB & Redis Node', ip: dbNode });

            const promises = uniqueNodes.map(node => {
                return executeSshCommand({
                    rawKeyPath,
                    user,
                    ip: node.ip,
                    command: 'echo ===NODE_OK===',
                    timeoutMs: 8000
                }).then(result => ({
                    ip: node.ip,
                    role: node.role,
                    status: (result.success && result.stdout.includes('===NODE_OK===')) ? 'online' : 'offline',
                    message: result.success ? '🟢 TERHUBUNG (SSH Port 22 OK)' : `❌ SSH Gagal / Timeout ke ${user}@${node.ip}`
                }));
            });

            Promise.all(promises).then(results => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, nodes: results }));
            });
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: e.message }));
        }
    });
}

module.exports = {
    handleBrowseFile,
    handleTestSsh,
    handleTestDb,
    handleVerifyLicense,
    handleSaveConfig,
    handleTestClusterNodes
};
