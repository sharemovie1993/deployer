const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getPresets } = require('./preset-store');
const { createSafeKeyFile, cleanupSafeKey, getSshArgs } = require('./ssh-helper');

const ROOT_DIR = path.join(__dirname, '..');
const activeProcesses = new Map();

function cancelProcess(id) {
    if (!id) {
        // Kill all active spawned processes if no id specified
        let stopped = 0;
        for (const [pId, proc] of activeProcesses.entries()) {
            try {
                if (process.platform === 'win32') {
                    execSync(`taskkill /pid ${proc.pid} /T /F`);
                } else {
                    proc.kill('SIGKILL');
                }
                stopped++;
            } catch (e) {}
            activeProcesses.delete(pId);
        }
        return stopped > 0;
    }

    const proc = activeProcesses.get(id);
    if (!proc) return false;

    try {
        if (process.platform === 'win32') {
            execSync(`taskkill /pid ${proc.pid} /T /F`);
        } else {
            proc.kill('SIGKILL');
        }
    } catch (e) {
        console.error('Error canceling process:', e.message);
    }
    activeProcesses.delete(id);
    return true;
}

function handleStreamQuickUpdate(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    if (!preset) {
        res.write(`data: [UPDATE_FAILED] Preset dengan ID ${presetId} tidak ditemukan.\n\n`);
        res.end();
        return;
    }

    // Cancel any existing running update process for this preset
    cancelProcess(presetId);

    const keyPath = createSafeKeyFile(preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem');
    const buildMode = preset.buildMode || 'remote'; // 'remote', 'local', atau 'skip'
    const obfuscateMode = preset.obfuscate || 'N'; // 'N' = Trial & Error (Off), 'Y' = Proteksi HKI (On)
    const psArgs = [
        '-ExecutionPolicy', 'Bypass',
        '-File', path.join(ROOT_DIR, 'easy-update-remote.ps1'),
        '-Silent',
        '-TargetIP', preset.vpsIp || '',
        '-TargetUser', preset.vpsUser || 'asepsuryadi',
        '-KeyPath', keyPath,
        '-SudoPass', preset.vpsSudoPass || '',
        '-Project', preset.project || 'absenta',
        '-BuildMode', buildMode,
        '-Obfuscate', obfuscateMode
    ];

    const projectLabel = preset.project === 'licensing' ? 'Server Lisensi' : (preset.project === 'undangan' ? 'Project Undangan Digital' : 'Project Absenta');
    const buildModeLabel = buildMode === 'skip'
        ? '🚀 Skip Build (Upload dist/ eksisting via SCP)'
        : buildMode === 'local'
            ? '🖥️ Local Build + SCP ke VPS'
            : '☁️ Remote Build di VPS';
    const obfLabel = obfuscateMode === 'Y' ? '🛡️ Aktif (Proteksi HKI Rilis)' : '⚡ Nonaktif (Build Cepat Trial & Error)';
    const logMsg = `[QUICK_UPDATE] Memulai Quick Update ke Server Target: ${preset.name} (${preset.vpsIp})\nProyek: ${projectLabel}\nMode Build: ${buildModeLabel}\nObfuscation (Pengacakan): ${obfLabel}\nCommand: powershell.exe ${psArgs.join(' ')}\n\n`;
    res.write(`data: ${logMsg.replace(/\n/g, '\ndata: ')}\n\n`);


    // Heartbeat every 10s to keep HTTP connection alive during long remote builds
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 10000);

    const psProcess = spawn('powershell.exe', psArgs);
    activeProcesses.set(presetId, psProcess);

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
        clearInterval(heartbeat);
        activeProcesses.delete(presetId);
        if (code === 0) {
            res.write(`data: [UPDATE_COMPLETE]\n\n`);
        } else {
            res.write(`data: [UPDATE_FAILED] dengan exit code: ${code}\n\n`);
        }
        res.end();
    });

    req.on('close', () => {
        clearInterval(heartbeat);
    });
}

function handleStreamSeedWilayah(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    if (!preset) {
        res.write(`data: [SEED_FAILED] Preset dengan ID ${presetId} tidak ditemukan.\n\n`);
        res.end();
        return;
    }

    cancelProcess(presetId);

    const keyPath = createSafeKeyFile(preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem');
    const psArgs = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', path.join(ROOT_DIR, 'easy-seed-wilayah-remote.ps1'),
        '-TargetIP', preset.vpsIp,
        '-TargetUser', preset.vpsUser || 'asepsuryadi',
        '-KeyPath', keyPath,
        '-SudoPass', preset.vpsSudoPass || '',
        '-Project', preset.project || 'absenta',
        '-Silent'
    ];

    const logMsg = `[SEED_WILAYAH] Memulai Remote Seed Full Wilayah Indonesia ke Server Target: ${preset.name} (${preset.vpsIp})...`;
    console.log(logMsg);
    res.write(`data: ${logMsg}\n\n`);

    const psProcess = spawn('powershell.exe', psArgs, { windowsHide: true });
    activeProcesses.set(presetId, psProcess);

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 10000);

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
        clearInterval(heartbeat);
        activeProcesses.delete(presetId);
        if (code === 0) {
            res.write(`data: [SEED_COMPLETE] Sinkronisasi data wilayah Indonesia selesai!\n\n`);
        } else {
            res.write(`data: [SEED_FAILED] dengan exit code: ${code}\n\n`);
        }
        res.end();
    });

    req.on('close', () => {
        clearInterval(heartbeat);
    });
}

function handleStreamInstall(req, res, installParams) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const targetOS = installParams.targetOS || 'linux';
    let psArgs = [];

    if (targetOS === 'linux') {
        psArgs = [
            '-ExecutionPolicy', 'Bypass',
            '-File', path.join(ROOT_DIR, 'deploy-absenta-remote.ps1'),
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
            '-SchoolName', installParams.schoolName || '',
            '-AdminEmail', installParams.adminEmail || ''
        ];
    } else {
        // Windows on-premise: deploy-onprem-windows.ps1
        const onpremScript = path.join(ROOT_DIR, 'deploy-onprem-windows.ps1');
        psArgs = [
            '-ExecutionPolicy', 'Bypass',
            '-File', onpremScript,
            '-Silent',
            '-BackendPort', installParams.backendPort || '3003',
            '-FrontendPort', installParams.frontendPort || '5175',
            '-ServerDomain', installParams.targetDomain || 'localhost',
            '-DeployMode', installParams.deployScenario || 'local',
            '-NodeName', installParams.schoolName || 'absenta-node-1'
        ];
    }

    const logMsg = `[START] Memulai Deployment ke OS: ${targetOS.toUpperCase()}\nCommand: powershell.exe ${psArgs.join(' ')}\n\n`;
    res.write(`data: ${logMsg.replace(/\n/g, '\ndata: ')}\n\n`);

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 10000);

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
        clearInterval(heartbeat);
        if (code === 0) {
            res.write(`data: [INSTALL_COMPLETE]\n\n`);
        } else {
            res.write(`data: [INSTALL_FAILED] dengan exit code: ${code}\n\n`);
        }
        res.end();
    });

    req.on('close', () => {
        clearInterval(heartbeat);
    });
}

function handleStreamClusterInstall(req, res, parsedUrl) {
    const apiNodes = (parsedUrl.searchParams.get('apiNodes') || '10.10.10.99').split(',').map(s => s.trim()).filter(Boolean);
    const waNode = parsedUrl.searchParams.get('waNode') || '10.10.10.99';
    const loadBalancerNode = parsedUrl.searchParams.get('loadBalancerNode') || '10.10.10.99';
    const dbNode = parsedUrl.searchParams.get('dbNode') || '10.10.10.99';
    const targetUser = parsedUrl.searchParams.get('targetUser') || 'asepsuryadi';
    const keyPath = parsedUrl.searchParams.get('keyPath') || path.join(ROOT_DIR, 'nginxonly.pem');
    const sudoPass = parsedUrl.searchParams.get('sudoPass') || '1';

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const psArgs = [
        '-ExecutionPolicy', 'Bypass',
        '-File', path.join(ROOT_DIR, 'deploy-cluster-remote.ps1'),
        '-Silent',
        '-ApiNodes', apiNodes.join(','),
        '-WaNode', waNode,
        '-LoadBalancerNode', loadBalancerNode,
        '-DbNode', dbNode,
        '-TargetUser', targetUser,
        '-KeyPath', keyPath,
        '-SudoPass', sudoPass
    ];

    const logMsg = `[CLUSTER_DEPLOY] Memulai Multi-Node Cluster Deployment...\nAPI Nodes: ${apiNodes.join(', ')}\nWA Node: ${waNode}\nLoad Balancer: ${loadBalancerNode}\nDB Node: ${dbNode}\n\n`;
    res.write(`data: ${logMsg.replace(/\n/g, '\ndata: ')}\n\n`);

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 10000);

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
        clearInterval(heartbeat);
        if (code === 0) {
            res.write(`data: [INSTALL_COMPLETE]\n\n`);
        } else {
            res.write(`data: [INSTALL_FAILED] dengan exit code: ${code}\n\n`);
        }
        res.end();
    });

    req.on('close', () => {
        clearInterval(heartbeat);
    });
}

function handleStreamSetupSsh(req, res, parsedUrl) {
    const targetIp = parsedUrl.searchParams.get('targetIp') || '';
    const targetUser = parsedUrl.searchParams.get('targetUser') || 'asepsuryadi';
    const password = parsedUrl.searchParams.get('password') || '';

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const psArgs = [
        '-ExecutionPolicy', 'Bypass',
        '-File', path.join(ROOT_DIR, 'easy-setup-ssh.ps1'),
        '-Silent',
        '-TargetIP', targetIp,
        '-TargetUser', targetUser,
        '-Password', password
    ];

    const logMsg = `[SETUP_SSH] Memulai Registrasi SSH Key ke VPS: ${targetUser}@${targetIp}...\n\n`;
    res.write(`data: ${logMsg.replace(/\n/g, '\ndata: ')}\n\n`);

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 10000);

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
        clearInterval(heartbeat);
        if (code === 0) {
            res.write(`data: [INSTALL_COMPLETE]\n\n`);
        } else {
            res.write(`data: [INSTALL_FAILED] dengan exit code: ${code}\n\n`);
        }
        res.end();
    });

    req.on('close', () => {
        clearInterval(heartbeat);
    });
}

function handleStreamPm2Logs(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const appName = parsedUrl.searchParams.get('app') || 'all';
    const linesCount = parsedUrl.searchParams.get('lines') || '100';

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    let proc;

    if (presetId && presetId !== 'local') {
        const presets = getPresets();
        const preset = presets.find(p => p.id === presetId);
        if (!preset) {
            res.write(`data: [ERROR] Preset server dengan ID ${presetId} tidak ditemukan.\n\n`);
            res.end();
            return;
        }

        const keyPath = createSafeKeyFile(preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem');
        const user = preset.vpsUser || 'asepsuryadi';
        const ip = preset.vpsIp;

        const logTarget = (appName && appName !== 'all') ? appName : '';
        const remoteCmd = `pm2 logs ${logTarget} --lines ${linesCount} --raw`.trim();

        res.write(`data: 📜 Memulai Stream Log Remote VPS via SSH: ${user}@${ip}\n`);
        res.write(`data: 📌 Target Aplikasi: ${appName === 'all' ? 'SEMUA Aplikasi (Gabungan)' : appName}\n\n`);

        const sshArgs = [
            '-i', keyPath,
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=10',
            `${user}@${ip}`,
            remoteCmd
        ];

        proc = spawn('ssh', sshArgs, { windowsHide: true });

        const cleanupKey = () => {
            if (keyPath && keyPath.includes('agy_key_') && fs.existsSync(keyPath)) {
                try { fs.unlinkSync(keyPath); } catch (e) {}
            }
        };

        proc.on('close', (code) => {
            cleanupKey();
        });

        req.on('close', () => {
            cleanupKey();
        });
    } else {
        res.write(`data: 📜 Membaca Log PM2 Lokal (Windows)...\n`);
        res.write(`data: 📌 Target Aplikasi: ${appName === 'all' ? 'SEMUA Aplikasi (Gabungan)' : appName}\n\n`);

        const pm2Args = ['logs'];
        if (appName && appName !== 'all') {
            pm2Args.push(appName);
        }
        pm2Args.push('--lines', linesCount, '--raw');

        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'pm2.cmd' : 'pm2';
        proc = spawn(cmd, pm2Args, { windowsHide: true, shell: isWin });
    }

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 10000);

    proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                res.write(`data: ${line.trim()}\n\n`);
            }
        });
    });

    proc.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                res.write(`data: ${line.trim()}\n\n`);
            }
        });
    });

    proc.on('close', (code) => {
        clearInterval(heartbeat);
        res.write(`data: [LOG_STREAM_END] Sesi stream log dihentikan.\n\n`);
        res.end();
    });

    req.on('close', () => {
        clearInterval(heartbeat);
        try { proc.kill(); } catch (e) {}
    });
}

function handleStreamUndanganInstall(req, res, installParams) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const keyPath = installParams.vpsKeyPath ? createSafeKeyFile(installParams.vpsKeyPath) : (installParams.sshKeyChoice ? createSafeKeyFile(installParams.sshKeyChoice) : '');
    const psArgs = [
        '-ExecutionPolicy', 'Bypass',
        '-File', path.join(ROOT_DIR, 'deploy-undangan-remote.ps1'),
        '-Silent',
        '-TargetIP', installParams.vpsIp || '',
        '-TargetUser', installParams.vpsUser || 'asepsuryadi',
        '-KeyPath', keyPath,
        '-SudoPass', installParams.vpsSudoPass || '',
        '-TargetDomain', installParams.targetDomain || installParams.vpsIp || '',
        '-BackendPort', installParams.backendPort || '4001',
        '-LicenseServerUrl', installParams.licenseServerUrl || 'https://api.absenta.id',
        '-JwtSecret', installParams.jwtSecret || 'super-secret-jwt-key-undangan-digital-2026',
        '-DbUrl', installParams.dbUrl || 'file:./dev.db',
        '-sslScenario', installParams.sslScenario || 'auto',
        '-cfToken', installParams.cfToken || ''
    ];

    const logMsg = `[START] Memulai Deployment Project Undangan Digital ke Linux VPS (${installParams.vpsIp})\nCommand: powershell.exe ${psArgs.join(' ')}\n\n`;
    res.write(`data: ${logMsg.replace(/\n/g, '\ndata: ')}\n\n`);

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 10000);

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
        clearInterval(heartbeat);
        if (keyPath) cleanupSafeKey(keyPath);
        if (code === 0) {
            res.write(`data: [INSTALL_COMPLETE]\n\n`);
        } else {
            res.write(`data: [INSTALL_FAILED] dengan exit code: ${code}\n\n`);
        }
        res.end();
    });

    req.on('close', () => {
        clearInterval(heartbeat);
        if (keyPath) cleanupSafeKey(keyPath);
    });
}

module.exports = {
    handleStreamQuickUpdate,
    handleStreamSeedWilayah,
    handleStreamInstall,
    handleStreamUndanganInstall,
    handleStreamClusterInstall,
    handleStreamSetupSsh,
    handleStreamPm2Logs,
    cancelProcess
};
