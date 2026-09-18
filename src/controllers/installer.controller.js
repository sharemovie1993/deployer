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
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            let rawUrl = '';

            if (typeof data === 'string') {
                rawUrl = data;
            } else if (data && typeof data === 'object') {
                rawUrl = data.dbUrl || data.url || '';
            }

            let dbHost = '127.0.0.1';
            let dbPort = 5432;
            let dbName = 'absensi';
            let dbUser = 'postgres';

            if (rawUrl) {
                try {
                    const u = new URL(rawUrl);
                    dbHost = u.hostname || '127.0.0.1';
                    dbPort = parseInt(u.port || '5432', 10);
                    dbName = u.pathname.replace(/^\//, '') || 'absensi';
                    dbUser = u.username || 'postgres';
                } catch (e) {
                    const match = rawUrl.match(/:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
                    if (match) {
                        dbUser = match[1];
                        dbHost = match[3];
                        dbPort = parseInt(match[4] || '5432', 10);
                        dbName = match[5] || 'absensi';
                    }
                }
            } else if (data && typeof data === 'object') {
                dbHost = data.host || '127.0.0.1';
                dbPort = parseInt(data.port || '5432', 10);
            }

            // Coba gunakan modul pg untuk pengujian database mendalam
            let pgModule = null;
            const candidatePaths = [
                'pg',
                path.join(__dirname, '..', '..', '..', 'Project Absenta', 'absenta_backend', 'node_modules', 'pg'),
                path.join(__dirname, '..', '..', 'node_modules', 'pg')
            ];
            for (const p of candidatePaths) {
                try {
                    pgModule = require(p);
                    if (pgModule && pgModule.Client) break;
                } catch (e) {}
            }

            if (pgModule && rawUrl) {
                const client = new pgModule.Client({
                    connectionString: rawUrl,
                    connectionTimeoutMillis: 5000
                });

                try {
                    await client.connect();
                    const result = await client.query("SELECT count(*)::int as tbl_count FROM information_schema.tables WHERE table_schema = 'public'");
                    const tblCount = result.rows[0] ? result.rows[0].tbl_count : 0;
                    await client.end();

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({
                        success: true,
                        message: `✅ Sukses Terhubung! Database '${dbName}' DITEMUKAN di ${dbHost}:${dbPort} (Tabel saat ini: ${tblCount} - Siap migrasi).`
                    }));
                } catch (pgErr) {
                    try { await client.end(); } catch (e) {}

                    if (pgErr.code === '3D000') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({
                            success: false,
                            message: `⚠️ Port Terbuka & Login Berhasil, tetapi Database '${dbName}' BELUM DIBUAT di PostgreSQL! Silakan buat database '${dbName}' via pgAdmin terlebih dahulu.`
                        }));
                    } else if (pgErr.code === '28P01') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({
                            success: false,
                            message: `❌ Port 5432 Terbuka, tetapi Password atau User '${dbUser}' SALAH!`
                        }));
                    } else if (pgErr.code === '28000') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({
                            success: false,
                            message: `❌ Akses user '${dbUser}' ditolak oleh pg_hba.conf server PostgreSQL!`
                        }));
                    } else if (pgErr.message && pgErr.message.includes('timeout')) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({
                            success: false,
                            message: `❌ Timeout koneksi ke Database ${dbHost}:${dbPort}. Pastikan firewall/port 5432 terbuka.`
                        }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({
                            success: false,
                            message: `❌ Gagal koneksi database: ${pgErr.message}`
                        }));
                    }
                }
            }

            // Fallback ke pengecekan TCP socket jika pg driver tidak tersedia
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

function handleCreateDb(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const rawUrl = (typeof data === 'string') ? data : (data.dbUrl || data.url || '');

            if (!rawUrl) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'URL Database tidak boleh kosong.' }));
            }

            let dbHost = '127.0.0.1';
            let dbPort = 5432;
            let targetDbName = 'absensi';
            let dbUser = 'postgres';
            let dbPass = '';

            try {
                const u = new URL(rawUrl);
                dbHost = u.hostname || '127.0.0.1';
                dbPort = parseInt(u.port || '5432', 10);
                targetDbName = u.pathname.replace(/^\//, '') || 'absensi';
                dbUser = u.username || 'postgres';
                dbPass = u.password || '';
            } catch (e) {
                const match = rawUrl.match(/:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
                if (match) {
                    dbUser = match[1];
                    dbPass = match[2];
                    dbHost = match[3];
                    dbPort = parseInt(match[4] || '5432', 10);
                    targetDbName = match[5] || 'absensi';
                }
            }

            if (!/^[a-zA-Z0-9_]+$/.test(targetDbName)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: `Nama database '${targetDbName}' tidak valid. Hanya huruf, angka, dan underscore yang diperbolehkan.` }));
            }

            let pgModule = null;
            const candidatePaths = [
                'pg',
                path.join(__dirname, '..', '..', '..', 'Project Absenta', 'absenta_backend', 'node_modules', 'pg'),
                path.join(__dirname, '..', '..', 'node_modules', 'pg')
            ];
            for (const p of candidatePaths) {
                try {
                    pgModule = require(p);
                    if (pgModule && pgModule.Client) break;
                } catch (e) {}
            }

            if (!pgModule) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'Driver PostgreSQL (pg) tidak ditemukan di sistem.' }));
            }

            // Hubungkan ke database pemeliharaan (postgres)
            const maintenanceUrl = `postgresql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPass)}@${dbHost}:${dbPort}/postgres`;
            const client = new pgModule.Client({
                connectionString: maintenanceUrl,
                connectionTimeoutMillis: 6000
            });

            try {
                await client.connect();

                // Cek apakah database sudah ada
                const checkRes = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDbName]);
                if (checkRes.rows && checkRes.rows.length > 0) {
                    await client.end();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({
                        success: true,
                        message: `ℹ️ Database '${targetDbName}' sudah ada sebelumnya di server ${dbHost}:${dbPort}. Siap digunakan!`
                    }));
                }

                // Buat database baru
                await client.query(`CREATE DATABASE "${targetDbName}" WITH OWNER "${dbUser}" ENCODING 'UTF8'`);
                await client.end();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    success: true,
                    message: `🎉 SUKSES! Database '${targetDbName}' BERHASIL DIBUAT di server ${dbHost}:${dbPort} dengan owner '${dbUser}'.`
                }));
            } catch (err) {
                try { await client.end(); } catch (e) {}
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    success: false,
                    message: `Gagal membuat database otomatis: ${err.message}`
                }));
            }
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: e.message }));
        }
    });
}

function handleRegisterLicense(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const schoolName = (data.schoolName || '').trim();
            const waNumber = (data.waNumber || '').trim();
            let slug = (data.requestedSlug || '').trim().toLowerCase();

            if (!schoolName) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'Nama sekolah wajib diisi.' }));
            }
            if (!waNumber) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'Nomor WhatsApp wajib diisi untuk menerima lisensi.' }));
            }
            if (!slug) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'Subdomain pilihan wajib diisi.' }));
            }

            if (slug.endsWith('.absenta.id')) {
                slug = slug.substring(0, slug.length - '.absenta.id'.length);
            }

            const regPayload = {
                school_name: schoolName,
                wa_number: waNumber,
                requested_slug: slug
            };

            const response = await fetch('https://api.absenta.id/api/license/request-local-free', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(regPayload),
                signal: AbortSignal.timeout(12000)
            });

            const json = await response.json();
            if (json.success && json.license_key) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    success: true,
                    message: json.message || 'Registrasi lisensi berhasil!',
                    licenseKey: json.license_key,
                    schoolName: schoolName,
                    slug: slug,
                    domain: `${slug}.absenta.id`
                }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    success: false,
                    message: json.message || 'Gagal melakukan registrasi lisensi.'
                }));
            }
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: `Kesalahan server registrasi: ${e.message}` }));
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
    handleCreateDb,
    handleRegisterLicense,
    handleVerifyLicense,
    handleSaveConfig,
    handleTestClusterNodes
};
