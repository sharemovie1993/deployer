const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const https = require('https');
const { spawn } = require('child_process');

// Port configuration
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const URL_FILE = path.join(__dirname, '.installer_url');

// Find an available port recursively
function startServer(port) {
    const server = http.createServer(requestHandler);
    
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[INFO] Port ${port} sedang digunakan. Mencoba port ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('[ERROR] Gagal memulai server:', err);
        }
    });

    server.listen(port, '0.0.0.0', () => {
        const url = `http://localhost:${port}`;
        console.log(`\n======================================================`);
        console.log(` 👉 Installer GUI Absenta AKTIF di: ${url}`);
        console.log(`======================================================\n`);
        
        // Write the active URL to a temp file for the batch launcher
        fs.writeFileSync(URL_FILE, url, 'utf8');
    });
}

// Global variable to hold installation parameters
let installParams = {};

// HTTP Request Handler
function requestHandler(req, res) {
    // CORS headers for convenience
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Serve HTML Frontend
    if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getHtmlContent());
        return;
    }

    // 2. API: Test PostgreSQL Port Reachability
    if (pathname === '/api/test-db' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const host = data.host || 'localhost';
                const port = parseInt(data.port) || 5432;

                const socket = new net.Socket();
                socket.setTimeout(4000);

                socket.on('connect', () => {
                    socket.destroy();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: `Koneksi TCP berhasil! Port PostgreSQL (${port}) terbuka dan dapat dijangkau.` }));
                });

                socket.on('error', (err) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: `Koneksi gagal: ${err.message}. Periksa alamat host, port, atau pengaturan firewall Anda.` }));
                });

                socket.on('timeout', () => {
                    socket.destroy();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Koneksi timeout. Host tidak merespons dalam waktu 4 detik.' }));
                });

                socket.connect(port, host);
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Format data tidak valid.' }));
            }
        });
        return;
    }

    // 3. API: Register License (Proxy to Licensing Server)
    if (pathname === '/api/register-license' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const payload = JSON.stringify({
                    school_name: data.school_name,
                    wa_number: data.wa_number,
                    requested_slug: data.requested_slug
                });

                const apiReq = https.request({
                    hostname: 'api.absenta.id',
                    port: 443,
                    path: '/api/license/request-local-free',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    }
                }, (apiRes) => {
                    let apiBody = '';
                    apiRes.on('data', chunk => { apiBody += chunk; });
                    apiRes.on('end', () => {
                        res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                        res.end(apiBody);
                    });
                });

                apiReq.on('error', (e) => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: `Gagal menghubungi server lisensi: ${e.message}` }));
                });

                apiReq.write(payload);
                apiReq.end();
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Format data tidak valid.' }));
            }
        });
        return;
    }

    // 3.5. API: Check License Status (GET Proxy)
    if (pathname === '/api/check-license' && req.method === 'GET') {
        const key = parsedUrl.searchParams.get('key');
        if (!key) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Kunci lisensi wajib diisi.' }));
            return;
        }

        https.get(`https://api.absenta.id/api/license/check/${key.trim()}`, (apiRes) => {
            let apiBody = '';
            apiRes.on('data', chunk => { apiBody += chunk; });
            apiRes.on('end', () => {
                res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                res.end(apiBody);
            });
        }).on('error', (e) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: `Gagal menghubungi server lisensi: ${e.message}` }));
        });
        return;
    }

    // 3.8. API: Test SSH Connection (POST)
    if (pathname === '/api/test-ssh' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const params = JSON.parse(body);
                const ip = params.vpsIp;
                const user = params.vpsUser;
                const sudoPass = params.vpsSudoPass;
                let keyPath = params.vpsKeyPath;

                // Helper to restrict PEM file permissions for OpenSSH compatibility
                const restrictPemPermissions = (filePath) => {
                    const { execSync } = require('child_process');
                    if (process.platform === 'win32') {
                        try {
                            const currentUser = process.env.USERNAME || 'Everyone';
                            execSync(`icacls "${filePath}" /inheritance:r`);
                            execSync(`icacls "${filePath}" /grant:r "${currentUser}:R"`);
                        } catch (e) {
                            console.error(`[ERROR] Gagal mengatur icacls: ${e.message}`);
                        }
                    } else {
                        try {
                            execSync(`chmod 600 "${filePath}"`);
                        } catch (e) {
                            console.error(`[ERROR] Gagal chmod 600: ${e.message}`);
                        }
                    }
                };

                if (params.vpsKeyContent) {
                    keyPath = path.join(__dirname, 'uploaded-temp-key-test.pem');
                    fs.writeFileSync(keyPath, params.vpsKeyContent, 'utf8');
                    restrictPemPermissions(keyPath);
                }

                if (!ip || !user || !keyPath) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Alamat IP, Username, dan File Kunci wajib diisi.' }));
                    return;
                }

                const { exec } = require('child_process');

                // Check SSH connection first
                const sshCmd = `ssh -i "${keyPath}" -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes ${user}@${ip} "echo SSH_OK"`;
                
                exec(sshCmd, (err, stdout, stderr) => {
                    if (err || !stdout.includes('SSH_OK')) {
                        const errMsg = stderr || (err ? err.message : 'Koneksi timeout');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: false, 
                            message: `Koneksi SSH VPS Linux Gagal! Periksa kembali IP, Username, atau Kunci PEM. Rincian: ${errMsg.trim()}` 
                        }));
                        return;
                    }

                    // SSH works, now check Sudo password if provided
                    if (sudoPass) {
                        const sudoCmd = `echo ${sudoPass} | ssh -i "${keyPath}" -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${user}@${ip} "sudo -S -p '' echo SUDO_OK"`;
                        
                        exec(sudoCmd, (sudoErr, sudoStdout, sudoStderr) => {
                            if (sudoErr || !sudoStdout.includes('SUDO_OK')) {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: false, 
                                    message: 'Koneksi SSH berhasil terhubung, tetapi password SUDO SALAH!' 
                                }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    success: true, 
                                    message: '✅ Koneksi SSH dan Password Sudo berhasil diverifikasi! VPS siap dideploy.' 
                                }));
                            }
                        });
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            success: true, 
                            message: '✅ Koneksi SSH berhasil diverifikasi! (Password sudo tidak diuji).' 
                        }));
                    }
                });
            } catch (e) {
                console.error('[ERROR] /api/test-ssh parsing error:', e.message, 'Body:', body);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Format data tidak valid: ' + e.message + '. Body: ' + body }));
            }
        });
        return;
    }

    // 4. API: Save configuration parameters
    if (pathname === '/api/save-config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                installParams = JSON.parse(body);
                
                // If vpsKeyContent is supplied, write it to a temporary file in the deployer folder
                if (installParams.vpsKeyContent) {
                    const tempKeyPath = path.join(__dirname, 'uploaded-temp-key.pem');
                    fs.writeFileSync(tempKeyPath, installParams.vpsKeyContent, 'utf8');
                    
                    // Restrict permissions for OpenSSH compatibility on Windows/Linux
                    const { execSync } = require('child_process');
                    if (process.platform === 'win32') {
                        try {
                            const currentUser = process.env.USERNAME || 'Everyone';
                            execSync(`icacls "${tempKeyPath}" /inheritance:r`);
                            execSync(`icacls "${tempKeyPath}" /grant:r "${currentUser}:R"`);
                        } catch (e) {
                            console.error(`[ERROR] Gagal mengatur icacls tempKey: ${e.message}`);
                        }
                    } else {
                        try {
                            execSync(`chmod 600 "${tempKeyPath}"`);
                        } catch (e) {
                            console.error(`[ERROR] Gagal chmod 600: ${e.message}`);
                        }
                    }

                    installParams.vpsKeyPath = tempKeyPath;
                    console.log(`[INFO] Kunci SSH diunggah disimpan sementara ke: ${tempKeyPath}`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Format data tidak valid.' }));
            }
        });
        return;
    }

    // 5. API: Event Stream (SSE) to run the PowerShell installer and stream logs
    if (pathname === '/api/stream-install' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        // Set up parameters
        const targetOS = installParams.targetOS || 'linux';
        let psArgs = [];

        if (targetOS === 'linux') {
            // Linux Remote deployment
            psArgs = [
                '-ExecutionPolicy', 'Bypass',
                '-File', path.join(__dirname, 'deploy-absenta-remote.ps1'),
                '-Silent',
                '-TargetIP', installParams.vpsIp || '',
                '-TargetUser', installParams.vpsUser || 'asepsuryadi',
                '-KeyPath', installParams.vpsKeyPath || '',
                '-SudoPass', installParams.vpsSudoPass || '',
                '-DeployScenario', installParams.deployScenario || 'hybrid',
                '-TargetDomain', installParams.targetDomain || '',
                '-BackendPort', installParams.backendPort || '3003',
                '-FrontendPort', installParams.frontendPort || '5175',
                '-sslScenario', installParams.sslScenario || 'internal',
                '-cfToken', installParams.cfToken || '',
                '-DbUrl', installParams.dbUrl || '',
                '-InstallPostgres', installParams.postgresMode || 'Y',
                '-RedisMode', installParams.redisMode || 'N',
                '-RedisUrl', installParams.redisUrl || 'redis://localhost:6379',
                '-LicenseKey', installParams.licenseKey || '',
                '-TunnelBaseDomain', installParams.tunnelBaseDomain || 'absenta.id',
                '-LicenseServerUrl', installParams.licenseServerUrl || 'https://api.absenta.id',
                '-NodeName', installParams.nodeName || 'absenta-node-1'
            ];
        } else {
            // Windows Local deployment
            psArgs = [
                '-ExecutionPolicy', 'Bypass',
                '-File', path.join(__dirname, '..', 'Project Absenta', 'deploy-onprem-windows.ps1'),
                '-Silent',
                '-BackendPort', installParams.backendPort || '3003',
                '-FrontendPort', installParams.frontendPort || '5175',
                '-DeployMode', installParams.deployScenario || 'hybrid',
                '-ServerDomain', installParams.targetDomain || ''
            ];
        }

        const logMsg = `[INSTALLER] Memulai instalasi target OS: ${targetOS.toUpperCase()}\nCommand: powershell.exe ${psArgs.join(' ')}\n\n`;
        res.write(`data: ${logMsg.replace(/\n/g, '\ndata: ')}\n\n`);

        // Spawn PowerShell process
        const psProcess = spawn('powershell.exe', psArgs);

        psProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    res.write(`data: ${line.trim()}\n\n`);
                }
            });
        });

        psProcess.stderr.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    res.write(`data: [ERROR] ${line.trim()}\n\n`);
                }
            });
        });

        psProcess.on('close', (code) => {
            if (code === 0) {
                res.write(`data: [INSTALL_COMPLETE]\n\n`);
            } else {
                res.write(`data: [INSTALL_FAILED] dengan exit code: ${code}\n\n`);
            }
            res.end();
            
            // Auto shutdown installer server after completion
            setTimeout(() => {
                console.log('[INFO] Instalasi selesai. Mematikan server GUI...');
                process.exit(0);
            }, 5000);
        });

        return;
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
}

// Start Server detection
startServer(DEFAULT_PORT);

// HTML Template Content
function getHtmlContent() {
    return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Absenta GUI Setup Wizard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #8b5cf6;
            --primary-glow: rgba(139, 92, 246, 0.4);
            --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            --glass-bg: rgba(30, 41, 59, 0.55);
            --glass-border: rgba(255, 255, 255, 0.08);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --success: #10b981;
            --error: #ef4444;
            --warning: #f59e0b;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Outfit', sans-serif;
            transition: all 0.25s ease-in-out;
        }

        body {
            background: var(--bg-gradient);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            overflow-x: hidden;
        }

        .container {
            width: 100%;
            max-width: 850px;
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        /* Header */
        .wizard-header {
            padding: 30px 40px;
            border-bottom: 1px solid var(--glass-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .logo-section h1 {
            font-size: 24px;
            font-weight: 700;
            background: linear-gradient(to right, #a78bfa, #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .logo-section p {
            font-size: 13px;
            color: var(--text-muted);
            margin-top: 4px;
        }

        /* Step Progress Bar */
        .steps-nav {
            display: flex;
            padding: 20px 40px;
            background: rgba(15, 23, 42, 0.3);
            border-bottom: 1px solid var(--glass-border);
            justify-content: space-between;
            align-items: center;
        }

        .step-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            font-weight: 500;
            color: var(--text-muted);
            opacity: 0.6;
        }

        .step-item.active {
            color: var(--text-main);
            opacity: 1;
        }

        .step-item.active .step-num {
            background: var(--primary);
            box-shadow: 0 0 12px var(--primary-glow);
            color: white;
            border-color: var(--primary);
        }

        .step-num {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            border: 1.5px solid var(--text-muted);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
        }

        .step-line {
            flex-grow: 1;
            height: 2px;
            background: var(--glass-border);
            margin: 0 15px;
            max-width: 50px;
        }

        /* Main Form Area */
        .wizard-body {
            padding: 40px;
            min-height: 400px;
            flex-grow: 1;
        }

        .step-panel {
            display: none;
        }

        .step-panel.active {
            display: block;
            animation: fadeIn 0.4s ease-in-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        h2 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 10px;
        }

        .subtitle {
            font-size: 14px;
            color: var(--text-muted);
            margin-bottom: 30px;
        }

        /* Grid Cards Selection */
        .card-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }

        .selection-card {
            border: 2px solid var(--glass-border);
            border-radius: 16px;
            padding: 25px;
            background: rgba(30, 41, 59, 0.3);
            cursor: pointer;
            position: relative;
        }

        .selection-card:hover {
            border-color: #a78bfa;
            background: rgba(139, 92, 246, 0.05);
            transform: translateY(-2px);
        }

        .selection-card.selected {
            border-color: var(--primary);
            background: rgba(139, 92, 246, 0.12);
            box-shadow: 0 0 15px rgba(139, 92, 246, 0.15);
        }

        .card-icon {
            font-size: 32px;
            margin-bottom: 15px;
        }

        .card-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .card-desc {
            font-size: 13px;
            color: var(--text-muted);
            line-height: 1.5;
        }

        /* Form Inputs */
        .form-group {
            margin-bottom: 20px;
        }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        label {
            display: block;
            font-size: 13px;
            font-weight: 500;
            color: var(--text-muted);
            margin-bottom: 8px;
        }

        input[type="text"], input[type="password"] {
            width: 100%;
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid var(--glass-border);
            border-radius: 10px;
            padding: 12px 16px;
            color: var(--text-main);
            font-size: 14px;
        }

        input[type="text"]:focus, input[type="password"]:focus {
            border-color: var(--primary);
            outline: none;
            box-shadow: 0 0 8px var(--primary-glow);
        }

        .helper-text {
            font-size: 12px;
            color: var(--text-muted);
            margin-top: 5px;
        }

        /* Switch / Segment Controller */
        .segment-control {
            display: flex;
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid var(--glass-border);
            border-radius: 10px;
            padding: 4px;
            margin-bottom: 20px;
        }

        .segment-btn {
            flex-grow: 1;
            background: transparent;
            border: none;
            border-radius: 8px;
            padding: 10px;
            color: var(--text-muted);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
        }

        .segment-btn.active {
            background: var(--primary);
            color: white;
            box-shadow: 0 4px 10px rgba(139, 92, 246, 0.3);
        }

        /* Action Buttons */
        .wizard-footer {
            padding: 25px 40px;
            border-top: 1px solid var(--glass-border);
            display: flex;
            justify-content: space-between;
            background: rgba(15, 23, 42, 0.1);
        }

        .btn {
            padding: 12px 28px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn-secondary {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-main);
            border: 1px solid var(--glass-border);
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .btn-primary {
            background: var(--primary);
            color: white;
            box-shadow: 0 4px 12px var(--primary-glow);
        }

        .btn-primary:hover {
            background: #9d50bb;
            box-shadow: 0 4px 18px rgba(139, 92, 246, 0.5);
            transform: translateY(-1px);
        }

        .btn-primary:disabled, .btn-secondary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .btn-action-inline {
            background: rgba(139, 92, 246, 0.15);
            border: 1px solid var(--primary);
            color: #c084fc;
            font-size: 13px;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
        }

        .btn-action-inline:hover {
            background: var(--primary);
            color: white;
        }

        /* Summary List */
        .summary-box {
            background: rgba(15, 23, 42, 0.4);
            border: 1px solid var(--glass-border);
            border-radius: 14px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.03);
            font-size: 14px;
        }

        .summary-row:last-child {
            border: none;
        }

        .summary-label {
            color: var(--text-muted);
            font-weight: 500;
        }

        .summary-value {
            font-weight: 600;
            color: var(--text-main);
        }

        /* Console log output step */
        .console-container {
            background: #090d16;
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 20px;
            font-family: 'Fira Code', monospace;
            font-size: 13px;
            color: #a7f3d0;
            height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            margin-bottom: 20px;
            box-shadow: inset 0 0 10px rgba(0,0,0,0.8);
            line-height: 1.6;
        }

        .console-container [ERROR] {
            color: var(--error);
        }

        .progress-bar-container {
            width: 100%;
            height: 6px;
            background: rgba(255,255,255,0.05);
            border-radius: 3px;
            overflow: hidden;
            position: relative;
            margin-bottom: 8px;
        }

        .progress-bar-fill {
            width: 0%;
            height: 100%;
            background: linear-gradient(to right, var(--primary), #06b6d4);
            border-radius: 3px;
        }

        .progress-text-container {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: var(--text-muted);
        }

        /* Status alerts */
        .alert-box {
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
            margin-bottom: 15px;
            display: none;
        }

        .alert-box.success {
            display: block;
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid var(--success);
            color: #34d399;
        }

        .alert-box.error {
            display: block;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid var(--error);
            color: #f87171;
        }

        .alert-box.warning {
            display: block;
            background: rgba(245, 158, 11, 0.15);
            border: 1px solid var(--warning);
            color: #fbbf24;
        }

        /* Custom domain section show/hide */
        #custom-domain-section {
            display: none;
        }

    </style>
</head>
<body>

<div class="container">
    <!-- Header -->
    <div class="wizard-header">
        <div class="logo-section">
            <h1>ABSENTA SETUP WIZARD</h1>
            <p>On-Premise Deployment Manager & License Sync</p>
        </div>
        <div id="vps-status-indicator" style="font-size: 13px; color: var(--text-muted);">
            Status: <span style="color: var(--warning); font-weight: 600;">Menyiapkan parameter...</span>
        </div>
    </div>

    <!-- Step Navigator -->
    <div class="steps-nav">
        <div class="step-item active" id="step-nav-1">
            <div class="step-num">1</div> Target OS
        </div>
        <div class="step-line"></div>
        <div class="step-item" id="step-nav-2">
            <div class="step-num">2</div> Skenario
        </div>
        <div class="step-line"></div>
        <div class="step-item" id="step-nav-3">
            <div class="step-num">3</div> Database & Redis
        </div>
        <div class="step-line"></div>
        <div class="step-item" id="step-nav-4">
            <div class="step-num">4</div> Lisensi
        </div>
        <div class="step-line"></div>
        <div class="step-item" id="step-nav-5">
            <div class="step-num">5</div> Ringkasan
        </div>
        <div class="step-line"></div>
        <div class="step-item" id="step-nav-6">
            <div class="step-num">6</div> Instalasi
        </div>
    </div>

    <!-- Main Content Panels -->
    <div class="wizard-body">
        
        <!-- STEP 1: TARGET OS -->
        <div class="step-panel active" id="panel-1">
            <h2>Pilih Target Sistem Operasi</h2>
            <p class="subtitle">Tentukan di mana aplikasi Project Absenta akan dipasang.</p>
            
            <div class="card-grid">
                <div class="selection-card selected" onclick="selectTargetOS('linux')" id="os-card-linux">
                    <div class="card-icon">🐧</div>
                    <div class="card-title">Linux VPS (Remote SSH)</div>
                    <div class="card-desc">Menginstal secara remote dari laptop ini ke server Linux VPS (Ubuntu/Debian) menggunakan OpenSSH dan Kunci Private (.pem).</div>
                </div>
                <div class="selection-card" onclick="selectTargetOS('windows')" id="os-card-windows">
                    <div class="card-icon">🪟</div>
                    <div class="card-title">Windows Server (Lokal)</div>
                    <div class="card-desc">Menginstal langsung secara lokal di komputer Windows ini. Rekomendasi untuk on-premise lokal sekolah.</div>
                </div>
            </div>

            <!-- Linux Credentials fields -->
            <div id="vps-creds-fields">
                <div id="ssh-alert" class="alert-box"></div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="vps-ip">Alamat IP Target VPS Linux</label>
                        <input type="text" id="vps-ip" value="103.196.155.87" placeholder="Contoh: 103.196.155.87">
                        <span class="helper-text">IP publik VPS tujuan instalasi.</span>
                    </div>
                    <div class="form-group">
                        <label for="vps-user">Username SSH VPS</label>
                        <input type="text" id="vps-user" value="asepsuryadi" placeholder="default: asepsuryadi">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>File SSH Private Key (.pem)</label>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <label class="btn-action-inline" style="margin-bottom:0; cursor:pointer; text-align:center; white-space:nowrap;">
                                Unggah Kunci (.pem)
                                <input type="file" id="vps-key-file" accept=".pem" style="display:none;" onchange="handleKeyUpload(this)">
                            </label>
                            <input type="text" id="vps-keypath" value="D:\\BarayaProject\\deployer\\ls-key.pem" placeholder="Atau masukkan path absolut .pem" style="flex-grow: 1;">
                        </div>
                        <span class="helper-text" id="vps-key-status">Gunakan tombol unggah di atas, atau masukkan lokasi file absolut secara manual.</span>
                    </div>
                    <div class="form-group">
                        <label for="vps-sudopass">Sudo Password VPS Linux</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="password" id="vps-sudopass" value="g1g1G1NGSUL*!2" placeholder="Password untuk eksekusi sudo" style="flex-grow: 1;">
                            <button id="ssh-test-btn" class="btn-action-inline" type="button" onclick="testSSHConnection()">Tes Koneksi VPS</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- STEP 2: SCENARIO & DOMAIN -->
        <div class="step-panel" id="panel-2">
            <h2>Pilih Skenario Deployment</h2>
            <p class="subtitle">Skenario menentukan jenis perutean akses publik aplikasi.</p>

            <div class="card-grid">
                <div class="selection-card" onclick="selectScenario('saas')" id="sc-card-saas">
                    <div class="card-icon">☁️</div>
                    <div class="card-title">SaaS / Cloud Platform</div>
                    <div class="card-desc">Aplikasi diakses secara global menggunakan domain utama (e.g. app.absenta.id) untuk sekolah banyak (multi-tenant).</div>
                </div>
                <div class="selection-card selected" onclick="selectScenario('hybrid')" id="sc-card-hybrid">
                    <div class="card-icon">⚡</div>
                    <div class="card-title">Hybrid Mode (VPN + Caddy)</div>
                    <div class="card-desc">Akses publik sekolah dikelola aman via Easy-Tunnel VPN Absenta dengan subdomain unik otomatis (e.g. sekolah.absenta.id).</div>
                </div>
            </div>

            <div class="form-group" id="saas-domain-group" style="display: none;">
                <label for="saas-domain">Domain Utama SaaS</label>
                <input type="text" id="saas-domain" value="absenta.id" placeholder="Contoh: platform.com">
                <span class="helper-text">Domain utama yang akan melayani rute SaaS terpusat.</span>
            </div>
            
            <div id="hybrid-domain-info" class="alert-box warning" style="display: block;">
                <strong>INFO MODE HYBRID:</strong> Domain utama akses publik Anda akan dikonfigurasi dan divalidasi secara otomatis dari Kunci Lisensi Anda di langkah berikutnya.
            </div>
        </div>

        <!-- STEP 3: DATABASE & REDIS -->
        <div class="step-panel" id="panel-3">
            <h2>Konfigurasi Database & Redis Cache</h2>
            <p class="subtitle">Sesuaikan data kredensial akses PostgreSQL & status Redis.</p>

            <div id="db-alert" class="alert-box"></div>

            <div class="form-group">
                <label>Pasang PostgreSQL Server Secara Otomatis?</label>
                <div class="segment-control">
                    <button type="button" class="segment-btn active" onclick="setPostgresMode('Y')" id="db-btn-Y">Pasang Otomatis (Database Internal)</button>
                    <button type="button" class="segment-btn" onclick="setPostgresMode('N')" id="db-btn-N">Gunakan Eksisting / Eksternal</button>
                </div>
            </div>

            <div class="form-group">
                <label for="db-url">DATABASE_URL PostgreSQL</label>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="db-url" value="postgresql://postgres:123123123@localhost:5432/absensi" style="flex-grow: 1;">
                    <button id="db-test-btn" class="btn-action-inline" type="button" onclick="testDatabaseConnection()" style="display: none;">Tes Konektivitas</button>
                </div>
                <span class="helper-text">Skema: postgresql://[user]:[password]@[host]:[port]/[database_name]</span>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Pasang Redis Server Secara Otomatis?</label>
                    <div class="segment-control">
                        <button type="button" class="segment-btn active" onclick="setRedisMode('Y')" id="redis-btn-Y">Pasang Otomatis</button>
                        <button type="button" class="segment-btn" onclick="setRedisMode('N')" id="redis-btn-N">Gunakan Eksisting</button>
                    </div>
                </div>
                <div class="form-group" id="redis-url-group" style="opacity: 0.5; pointer-events: none;">
                    <label for="redis-url">REDIS_URL Eksternal</label>
                    <input type="text" id="redis-url" value="redis://localhost:6379" placeholder="redis://localhost:6379">
                </div>
            </div>
        </div>

        <!-- STEP 4: LICENSING -->
        <div class="step-panel" id="panel-4">
            <h2>Kunci Lisensi & Alokasi Domain</h2>
            <p class="subtitle">Validasi lisensi aktif Anda atau daftarkan subdomain gratis baru langsung.</p>

            <div id="license-alert" class="alert-box"></div>

            <div class="segment-control">
                <button type="button" class="segment-btn active" onclick="setLicenseMode('existing')" id="lic-btn-existing">Masukkan Lisensi Eksisting</button>
                <button type="button" class="segment-btn" onclick="setLicenseMode('new')" id="lic-btn-new">Daftar Subdomain Baru gratis</button>
            </div>

            <!-- Existing license key input -->
            <div id="lic-existing-form">
                <div class="form-group">
                    <label for="license-key">Kunci Lisensi Absenta (License Key)</label>
                    <input type="text" id="license-key" value="ABS-450A-7109-CA41" placeholder="Contoh: ABS-XXXX-XXXX-XXXX">
                    <span class="helper-text">Kunci lisensi 16-karakter yang Anda terima dari tim Absenta.</span>
                </div>
            </div>

            <!-- New license registration form -->
            <div id="lic-new-form" style="display: none;">
                <div class="form-row">
                    <div class="form-group">
                        <label for="reg-school">Nama Sekolah / Instansi</label>
                        <input type="text" id="reg-school" placeholder="Contoh: SMKN 1 Jakarta">
                    </div>
                    <div class="form-group">
                        <label for="reg-wa">Nomor WhatsApp Aktif</label>
                        <input type="text" id="reg-wa" placeholder="Contoh: 08123456789">
                        <span class="helper-text">Digunakan untuk mengirim arsip rincian lisensi Anda.</span>
                    </div>
                </div>
                <div class="form-group">
                    <label for="reg-slug">Subdomain / Slug Easy Tunnel yang Diinginkan</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="text" id="reg-slug" placeholder="Contoh: smkn1jkt" style="flex-grow: 1;">
                        <span style="font-weight: 600; color: var(--primary);">.absenta.id</span>
                        <button class="btn-action-inline" type="button" onclick="registerNewLicense()">Cek & Daftarkan</button>
                    </div>
                    <span class="helper-text">Gunakan hanya huruf kecil dan angka, tanpa titik atau spasi.</span>
                </div>
            </div>
        </div>

        <!-- STEP 5: SUMMARY -->
        <div class="step-panel" id="panel-5">
            <h2>Ringkasan Konfigurasi Deployment</h2>
            <p class="subtitle">Periksa seluruh isian parameter sebelum memulai proses instalasi ke mesin target.</p>

            <div class="summary-box">
                <div class="summary-row">
                    <span class="summary-label">Target Sistem Operasi</span>
                    <span class="summary-value" id="sum-target-os">-</span>
                </div>
                <div class="summary-row" id="sum-row-vps-ip">
                    <span class="summary-label">IP VPS Target</span>
                    <span class="summary-value" id="sum-vps-ip">-</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Skenario Deployment</span>
                    <span class="summary-value" id="sum-scenario">-</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Domain Publik Aplikasi</span>
                    <span class="summary-value" id="sum-domain">-</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Kredensial Database URL</span>
                    <span class="summary-value" id="sum-db-url" style="font-family: monospace; font-size:12px;">-</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Instalasi PostgreSQL</span>
                    <span class="summary-value" id="sum-postgres">-</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Instalasi Redis Cache</span>
                    <span class="summary-value" id="sum-redis">-</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Kunci Lisensi Absenta</span>
                    <span class="summary-value" id="sum-license-key">-</span>
                </div>
                <div class="summary-row" id="sum-row-school" style="display: none;">
                    <span class="summary-label">Nama Sekolah / Instansi</span>
                    <span class="summary-value" id="sum-school-name">-</span>
                </div>
                <div class="summary-row" id="sum-row-status" style="display: none;">
                    <span class="summary-label">Status Kunci Lisensi</span>
                    <span class="summary-value" id="sum-license-status">-</span>
                </div>
            </div>

            <div class="alert-box warning" style="display: block; margin-top: 15px;">
                <strong>PERINGATAN:</strong> Mengklik tombol <strong>Mulai Deployment</strong> akan mengubah konfigurasi server target dan memulai proses kompilasi kode. Pastikan koneksi internet laptop stabil.
            </div>
        </div>

        <!-- STEP 6: INSTALLATION LOGS -->
        <div class="step-panel" id="panel-6">
            <h2>Proses Deployment Sedang Berjalan...</h2>
            <p class="subtitle">Instalasi diproses di latar belakang laptop Anda. Harap pantau terminal log di bawah.</p>

            <div class="progress-bar-container">
                <div class="progress-bar-fill" id="install-progress-fill"></div>
            </div>
            <div class="progress-text-container">
                <span id="install-progress-status">Menghubungkan ke sub-proses PowerShell...</span>
                <span id="install-progress-percent">0%</span>
            </div>

            <div class="console-container" id="terminal-logs"></div>

            <div id="final-install-alert" class="alert-box"></div>
        </div>

    </div>

    <!-- Navigation Footer Buttons -->
    <div class="wizard-footer">
        <button class="btn btn-secondary" id="btn-prev" onclick="prevStep()" disabled>Sebelumnya</button>
        <button class="btn btn-primary" id="btn-next" onclick="nextStep()">Berikutnya</button>
    </div>
</div>

<script>
    // Navigation State variables
    let currentStep = 1;
    const totalSteps = 6;
    
    // Config states
    let config = {
        targetOS: 'linux',
        vpsIp: '103.196.155.87',
        vpsUser: 'asepsuryadi',
        vpsKeyPath: 'D:\\\\BarayaProject\\\\deployer\\\\ls-key.pem',
        vpsSudoPass: 'g1g1G1NGSUL*!2',
        deployScenario: 'hybrid',
        targetDomain: '',
        backendPort: '3003',
        frontendPort: '5175',
        sslScenario: 'sync', // hybrid default is sync certificate from central licensing server
        cfToken: '',
        dbUrl: 'postgresql://postgres:123123123@localhost:5432/absensi',
        postgresMode: 'Y',
        redisMode: 'Y', // Y = auto install redis, N = custom redisurl
        redisUrl: 'redis://localhost:6379',
        licenseKey: 'ABS-450A-7109-CA41',
        licenseMode: 'existing', // 'existing' or 'new'
        tunnelBaseDomain: 'absenta.id',
        licenseServerUrl: 'https://api.absenta.id',
        nodeName: 'absenta-node-1'
    };

    // SSH Key upload handler
    function handleKeyUpload(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            config.vpsKeyContent = e.target.result;
            config.vpsKeyName = file.name;
            document.getElementById('vps-keypath').value = '(Kunci Terunggah: ' + file.name + ')';
            
            const statusLabel = document.getElementById('vps-key-status');
            statusLabel.innerHTML = '✅ Terunggah Sukses: <strong>' + file.name + '</strong>';
            statusLabel.style.color = 'var(--success)';
        };
        reader.readAsText(file);
    }

    // Postgres Mode handler
    function setPostgresMode(mode) {
        config.postgresMode = mode;
        document.getElementById('db-btn-Y').classList.toggle('active', mode === 'Y');
        document.getElementById('db-btn-N').classList.toggle('active', mode === 'N');

        const dbUrlInput = document.getElementById('db-url');
        const dbTestBtn = document.getElementById('db-test-btn');
        const dbAlert = document.getElementById('db-alert');

        if (mode === 'Y') {
            dbUrlInput.value = 'postgresql://postgres:123123123@localhost:5432/absensi';
            dbTestBtn.style.display = 'none';
            dbAlert.style.display = 'none';
        } else {
            if (dbUrlInput.value === 'postgresql://postgres:123123123@localhost:5432/absensi') {
                dbUrlInput.value = 'postgresql://';
            }
            dbTestBtn.style.display = 'block';
        }
    }

    // Card Selection handlers
    function selectTargetOS(os) {
        config.targetOS = os;
        document.getElementById('os-card-linux').classList.toggle('selected', os === 'linux');
        document.getElementById('os-card-windows').classList.toggle('selected', os === 'windows');
        
        // Show/hide VPS credential fields
        document.getElementById('vps-creds-fields').style.display = os === 'linux' ? 'block' : 'none';
        
        // Auto update status indicator
        document.getElementById('vps-status-indicator').innerHTML = 'Target: <span style="color: #a78bfa; font-weight:600;">' + (os === 'linux' ? 'Linux VPS' : 'Lokal Windows') + '</span>';
    }

    function selectScenario(sc) {
        config.deployScenario = sc;
        document.getElementById('sc-card-saas').classList.toggle('selected', sc === 'saas');
        document.getElementById('sc-card-hybrid').classList.toggle('selected', sc === 'hybrid');

        // Show/hide SaaS domain field
        document.getElementById('saas-domain-group').style.display = sc === 'saas' ? 'block' : 'none';
        document.getElementById('hybrid-domain-info').style.display = sc === 'hybrid' ? 'block' : 'none';
        
        if (sc === 'hybrid') {
            config.sslScenario = 'sync'; // Hybrid mode requires license sync for tunnel SSL
        } else {
            config.sslScenario = 'internal'; // SaaS defaults to internal
        }
    }

    function setRedisMode(mode) {
        config.redisMode = mode;
        document.getElementById('redis-btn-Y').classList.toggle('active', mode === 'Y');
        document.getElementById('redis-btn-N').classList.toggle('active', mode === 'N');

        const redisUrlField = document.getElementById('redis-url-group');
        if (mode === 'N') {
            redisUrlField.style.opacity = '1';
            redisUrlField.style.pointerEvents = 'auto';
        } else {
            redisUrlField.style.opacity = '0.5';
            redisUrlField.style.pointerEvents = 'none';
        }
    }

    function setLicenseMode(mode) {
        config.licenseMode = mode;
        document.getElementById('lic-btn-existing').classList.toggle('active', mode === 'existing');
        document.getElementById('lic-btn-new').classList.toggle('active', mode === 'new');

        document.getElementById('lic-existing-form').style.display = mode === 'existing' ? 'block' : 'none';
        document.getElementById('lic-new-form').style.display = mode === 'new' ? 'block' : 'none';
    }


    // Connect DB Port Test API
    function testDatabaseConnection() {
        const dbUrlInput = document.getElementById('db-url').value;
        const alertBox = document.getElementById('db-alert');
        
        alertBox.className = 'alert-box warning';
        alertBox.innerHTML = 'Sedang melakukan uji koneksi TCP port PostgreSQL...';
        alertBox.style.display = 'block';

        // Parse host and port from postgres url
        let host = 'localhost';
        let port = '5432';

        try {
            // Regex to extract host and port from DB URL
            const matches = dbUrlInput.match(/@([^:/]+)(?::([0-9]+))?/);
            if (matches) {
                host = matches[1];
                port = matches[2] || '5432';
            }
        } catch (e) {
            console.log('Fails to parse db URL, fallback to default port 5432 test.');
        }

        fetch('/api/test-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host: host, port: port })
        })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                alertBox.className = 'alert-box success';
            } else {
                alertBox.className = 'alert-box error';
            }
            alertBox.innerHTML = res.message;
        })
        .catch(err => {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = 'Gagal menghubungi installer backend API: ' + err.message;
        });
    }

    // Connect SSH Test API
    function testSSHConnection() {
        const ip = document.getElementById('vps-ip').value.trim();
        const user = document.getElementById('vps-user').value.trim();
        const keypath = document.getElementById('vps-keypath').value.trim();
        const sudopass = document.getElementById('vps-sudopass').value;
        const alertBox = document.getElementById('ssh-alert');

        if (!ip || !user) {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = 'Alamat IP dan Username SSH wajib diisi untuk melakukan tes!';
            alertBox.style.display = 'block';
            return;
        }

        alertBox.className = 'alert-box warning';
        alertBox.innerHTML = 'Sedang melakukan uji koneksi SSH ke VPS target...';
        alertBox.style.display = 'block';
        
        document.getElementById('ssh-test-btn').disabled = true;

        fetch('/api/test-ssh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vpsIp: ip,
                vpsUser: user,
                vpsKeyPath: keypath,
                vpsKeyContent: config.vpsKeyContent || '',
                vpsSudoPass: sudopass
            })
        })
        .then(res => res.json())
        .then(res => {
            document.getElementById('ssh-test-btn').disabled = false;
            if (res.success) {
                alertBox.className = 'alert-box success';
            } else {
                alertBox.className = 'alert-box error';
            }
            alertBox.innerHTML = res.message;
        })
        .catch(err => {
            document.getElementById('ssh-test-btn').disabled = false;
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = 'Gagal menghubungi installer backend API: ' + err.message;
        });
    }

    // Register License Subdomain API
    function registerNewLicense() {
        const school = document.getElementById('reg-school').value.trim();
        const wa = document.getElementById('reg-wa').value.trim();
        const slug = document.getElementById('reg-slug').value.trim().toLowerCase();
        const alertBox = document.getElementById('license-alert');

        if (!school || !wa || !slug) {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = 'Seluruh data sekolah, nomor WA, dan subdomain wajib diisi untuk registrasi baru!';
            alertBox.style.display = 'block';
            return;
        }

        alertBox.className = 'alert-box warning';
        alertBox.innerHTML = 'Menghubungi server lisensi untuk mendaftarkan subdomain gratis...';
        alertBox.style.display = 'block';

        fetch('/api/register-license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ school_name: school, wa_number: wa, requested_slug: slug })
        })
        .then(res => res.json().then(data => ({ status: res.status, body: data })))
        .then(res => {
            if (res.body.success) {
                alertBox.className = 'alert-box success';
                alertBox.innerHTML = '<strong>Registrasi Berhasil!</strong><br>Kunci Lisensi Anda: <strong>' + res.body.license_key + '</strong><br>Subdomain dialokasikan ke <strong>' + slug + '.absenta.id</strong>.<br>Arsip lisensi dikirimkan ke WhatsApp Anda.';
                
                // Prefill license fields
                document.getElementById('license-key').value = res.body.license_key;
                config.licenseKey = res.body.license_key;
                
                // Automatically switch view to show key
                setTimeout(() => {
                    setLicenseMode('existing');
                }, 4000);
            } else {
                alertBox.className = 'alert-box error';
                alertBox.innerHTML = 'Gagal registrasi: ' + (res.body.message || 'Respons tidak valid dari server pusat.');
            }
        })
        .catch(err => {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = 'Gagal menghubungi installer backend API: ' + err.message;
        });
    }

    function showLicenseAlert(message, type) {
        const alertBox = document.getElementById('license-alert');
        alertBox.className = 'alert-box ' + type;
        alertBox.innerHTML = message;
        alertBox.style.display = 'block';
    }

    // Step navigation controller
    function updateStepUI() {
        // Toggle step nav styling
        for (let i = 1; i <= totalSteps; i++) {
            const nav = document.getElementById('step-nav-' + i);
            if (i === currentStep) {
                nav.classList.add('active');
            } else {
                nav.classList.remove('active');
            }
        }

        // Toggle panel views
        for (let i = 1; i <= totalSteps; i++) {
            const panel = document.getElementById('panel-' + i);
            if (i === currentStep) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        }

        // Configure footer button labels and disabled state
        document.getElementById('btn-prev').disabled = currentStep === 1 || currentStep === totalSteps;
        
        const nextBtn = document.getElementById('btn-next');
        if (currentStep === totalSteps - 1) {
            nextBtn.innerHTML = 'Mulai Deployment 🚀';
            nextBtn.className = 'btn btn-primary';
        } else if (currentStep === totalSteps) {
            nextBtn.style.display = 'none';
            document.getElementById('btn-prev').style.display = 'none';
        } else {
            nextBtn.innerHTML = 'Berikutnya';
            nextBtn.className = 'btn btn-primary';
            nextBtn.style.display = 'flex';
        }
    }

    function nextStep() {
        // Gather and save form values on current steps before leaving
        if (currentStep === 1) {
            config.vpsIp = document.getElementById('vps-ip').value.trim();
            config.vpsUser = document.getElementById('vps-user').value.trim();
            config.vpsKeyPath = document.getElementById('vps-keypath').value.trim();
            config.vpsSudoPass = document.getElementById('vps-sudopass').value;
        }
        else if (currentStep === 2) {
            if (config.deployScenario === 'saas') {
                config.targetDomain = document.getElementById('saas-domain').value.trim();
            }
        }
        else if (currentStep === 3) {
            config.dbUrl = document.getElementById('db-url').value.trim();
            config.redisUrl = document.getElementById('redis-url').value.trim();
        }
        else if (currentStep === 4) {
            const licenseKey = document.getElementById('license-key').value.trim();
            if (config.deployScenario === 'hybrid') {
                if (!licenseKey) {
                    showLicenseAlert('Kunci lisensi wajib diisi untuk Skenario Hybrid!', 'error');
                    return;
                }
                
                showLicenseAlert('Memverifikasi kunci lisensi ke server pusat...', 'warning');
                document.getElementById('btn-next').disabled = true;
                document.getElementById('btn-prev').disabled = true;

                fetch('/api/check-license?key=' + encodeURIComponent(licenseKey))
                .then(res => res.json())
                .then(res => {
                    document.getElementById('btn-next').disabled = false;
                    document.getElementById('btn-prev').disabled = false;

                    if (res.success && res.data) {
                        if (res.data.is_active === false) {
                            showLicenseAlert('Lisensi terdaftar namun status TIDAK AKTIF.', 'error');
                            return;
                        }
                        
                        config.licenseKey = licenseKey;
                        config.licenseDetails = res.data;
                        
                        const slug = res.data.requested_slug || res.data.requestedSlug;
                        config.targetDomain = slug + '.absenta.id';
                        
                        document.getElementById('license-alert').style.display = 'none';
                        currentStep++;
                        buildSummary();
                        updateStepUI();
                    } else {
                        showLicenseAlert('Validasi Gagal: ' + (res.message || 'Kunci lisensi tidak aktif atau tidak terdaftar!'), 'error');
                    }
                })
                .catch(err => {
                    document.getElementById('btn-next').disabled = false;
                    document.getElementById('btn-prev').disabled = false;
                    showLicenseAlert('Kesalahan sistem saat menghubungi server lisensi: ' + err.message, 'error');
                });
                return; // Pause sync navigation
            } else {
                config.licenseKey = licenseKey;
            }
        }
        else if (currentStep === 5) {
            // Summary phase completed. Save configs to backend and trigger install!
            saveConfigAndStartInstall();
            return;
        }

        currentStep++;
        if (currentStep === 5) {
            buildSummary();
        }
        updateStepUI();
    }

    function prevStep() {
        if (currentStep > 1 && currentStep < totalSteps) {
            currentStep--;
            updateStepUI();
        }
    }

    // Build Summary list content
    function buildSummary() {
        document.getElementById('sum-target-os').innerHTML = config.targetOS === 'linux' ? '🐧 Linux VPS (Remote SSH)' : '🪟 Windows Server (Lokal)';
        
        const vpsRow = document.getElementById('sum-row-vps-ip');
        if (config.targetOS === 'linux') {
            vpsRow.style.display = 'flex';
            document.getElementById('sum-vps-ip').innerHTML = config.vpsIp;
        } else {
            vpsRow.style.display = 'none';
        }

        document.getElementById('sum-scenario').innerHTML = config.deployScenario === 'saas' ? 'Cloud SaaS (Multi-Tenant)' : 'Hybrid Mode (VPN + Caddy)';
        
        let displayDomain = config.targetDomain || '(Ditentukan otomatis oleh Lisensi)';
        document.getElementById('sum-domain').innerHTML = displayDomain;
        
        document.getElementById('sum-db-url').innerHTML = config.dbUrl.replace(/:[^:@]+@/, ':******@'); // Mask password
        document.getElementById('sum-postgres').innerHTML = config.postgresMode === 'Y' ? 'Instal Otomatis (Internal)' : 'Gunakan Eksisting / Eksternal';
        document.getElementById('sum-redis').innerHTML = config.redisMode === 'Y' ? 'Instal Otomatis (Embedded)' : ('Gunakan eksisting (' + config.redisUrl + ')');
        document.getElementById('sum-license-key').innerHTML = config.licenseKey || 'Tidak ada (Hanya SaaS)';
        
        // Display fetched license details if present
        const schoolRow = document.getElementById('sum-row-school');
        const statusRow = document.getElementById('sum-row-status');
        
        if (config.deployScenario === 'hybrid' && config.licenseDetails) {
            schoolRow.style.display = 'flex';
            statusRow.style.display = 'flex';
            
            document.getElementById('sum-school-name').innerHTML = config.licenseDetails.school_name || config.licenseDetails.schoolName || '-';
            
            const isActive = (config.licenseDetails.is_active !== undefined) ? config.licenseDetails.is_active : config.licenseDetails.isActive;
            const statusText = isActive ? '✅ AKTIF' : '❌ TIDAK AKTIF';
            const statusColor = isActive ? '#10b981' : '#ef4444';
            
            document.getElementById('sum-license-status').innerHTML = '<span style="color: ' + statusColor + '; font-weight:600;">' + statusText + '</span>';
        } else {
            schoolRow.style.display = 'none';
            statusRow.style.display = 'none';
        }
    }

    // Save configurations and start stream installation
    function saveConfigAndStartInstall() {
        currentStep = 6;
        updateStepUI();

        const statusText = document.getElementById('install-progress-status');
        const percentText = document.getElementById('install-progress-percent');
        const progressBar = document.getElementById('install-progress-fill');
        const consoleContainer = document.getElementById('terminal-logs');
        const finalAlert = document.getElementById('final-install-alert');

        statusText.innerHTML = 'Menyimpan konfigurasi...';
        
        // Save config
        fetch('/api/save-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        })
        .then(res => res.json())
        .then(res => {
            if (!res.success) {
                statusText.innerHTML = 'Gagal menyimpan konfigurasi!';
                return;
            }

            statusText.innerHTML = 'Memulai proses PowerShell...';
            consoleContainer.innerHTML = '>> Menghubungkan ke log aliran instan...\\n';

            // Connect to SSE stream
            const eventSource = new EventSource('/api/stream-install');
            let progress = 5;

            eventSource.onmessage = function(event) {
                const line = event.data;

                if (line === '[INSTALL_COMPLETE]') {
                    eventSource.close();
                    progress = 100;
                    updateProgress(progress, 'Deployment Selesai Sukses! 🎉');
                    
                    finalAlert.className = 'alert-box success';
                    finalAlert.innerHTML = '<strong>Instalasi Berhasil!</strong><br>Project Absenta telah sukses terpasang pada domain target.<br>Aplikasi sudah berjalan. Halaman ini akan ditutup dalam 5 detik.';
                    return;
                }

                if (line.startsWith('[INSTALL_FAILED]')) {
                    eventSource.close();
                    updateProgress(progress, 'Deployment Gagal! ❌');
                    
                    finalAlert.className = 'alert-box error';
                    finalAlert.innerHTML = '<strong>Instalasi Gagal!</strong><br>' + line + '. Silakan periksa log terminal untuk rincian kesalahan.';
                    return;
                }

                // Append line to console log
                const isError = line.startsWith('[ERROR]');
                const span = document.createElement('span');
                if (isError) span.style.color = 'var(--error)';
                span.appendChild(document.createTextNode(line + '\\n'));
                consoleContainer.appendChild(span);
                consoleContainer.scrollTop = consoleContainer.scrollHeight;

                // Adjust progress bar values dynamically based on stages
                if (line.includes('FASE 1:')) {
                    progress = Math.max(progress, 15);
                    updateProgress(progress, 'Tahap 1: Provisioning & Apt Install...');
                } else if (line.includes('FASE 2:')) {
                    progress = Math.max(progress, 40);
                    updateProgress(progress, 'Tahap 2: Menyiapkan Proyek & Instalasi Node...');
                } else if (line.includes('FASE 3:')) {
                    progress = Math.max(progress, 65);
                    updateProgress(progress, 'Tahap 3: Menjalankan Migrasi Database...');
                } else if (line.includes('FASE 4:')) {
                    progress = Math.max(progress, 85);
                    updateProgress(progress, 'Tahap 4: Mengonfigurasi Caddy & SSL...');
                } else if (line.includes('PM2')) {
                    progress = Math.max(progress, 95);
                    updateProgress(progress, 'Tahap Akhir: Menyalakan PM2 & Verifikasi Layanan...');
                }
            };

            eventSource.onerror = function(err) {
                eventSource.close();
                statusText.innerHTML = 'Koneksi ke log stream terputus.';
                console.log('SSE Error:', err);
            };
        })
        .catch(err => {
            statusText.innerHTML = 'Gagal menyimpan konfigurasi!';
            consoleContainer.innerHTML += '[ERROR] ' + err.message + '\\n';
        });

        function updateProgress(val, label) {
            progressBar.style.width = val + '%';
            percentText.innerHTML = val + '%';
            statusText.innerHTML = label;
        }
    }

    // Auto set defaults on start
    selectTargetOS('linux');
    selectScenario('hybrid');
    setRedisMode('Y');
    setLicenseMode('existing');

</script>
</body>
</html>`;
}
