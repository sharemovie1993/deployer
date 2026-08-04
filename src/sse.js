const { spawn } = require('child_process');
const path = require('path');
const { getPresets } = require('./preset-store');

const ROOT_DIR = path.join(__dirname, '..');

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

    const keyPath = preset.vpsKeyPath || path.join(ROOT_DIR, 'nginxonly.pem');
    const psArgs = [
        '-ExecutionPolicy', 'Bypass',
        '-File', path.join(ROOT_DIR, 'easy-update-remote.ps1'),
        '-Silent',
        '-TargetIP', preset.vpsIp || '',
        '-TargetUser', preset.vpsUser || 'asepsuryadi',
        '-KeyPath', keyPath,
        '-SudoPass', preset.vpsSudoPass || '',
        '-Project', preset.project || 'absenta'
    ];

    const logMsg = `[QUICK_UPDATE] Memulai Quick Update ke Server Target: ${preset.name} (${preset.vpsIp})\nProyek: ${preset.project === 'licensing' ? 'Server Lisensi' : 'Project Absenta'}\nCommand: powershell.exe ${psArgs.join(' ')}\n\n`;
    res.write(`data: ${logMsg.replace(/\n/g, '\ndata: ')}\n\n`);

    // Heartbeat every 10s to keep HTTP connection alive during long remote builds
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
        psArgs = [
            '-ExecutionPolicy', 'Bypass',
            '-File', path.join(ROOT_DIR, 'deploy-onprem-windows.ps1'),
            '-Silent',
            '-TargetDomain', installParams.targetDomain || 'localhost',
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

module.exports = {
    handleStreamQuickUpdate,
    handleStreamInstall,
    handleStreamClusterInstall
};
