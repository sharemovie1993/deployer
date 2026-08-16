const { getPresets } = require('../preset-store');
const { executeSshCommand } = require('../ssh-helper');

function handleServerHealth(req, res, parsedUrl) {
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

    const checkScript = [
        'echo "=== CADDY_STATUS ==="',
        'systemctl is-active caddy 2>/dev/null || echo "inactive"',
        'echo "=== CADDY_LISTEN ==="',
        'ss -tulpn 2>/dev/null | grep caddy || true',
        'echo "=== RAM_INFO ==="',
        'free -m 2>/dev/null || true',
        'echo "=== DISK_INFO ==="',
        'df -h / 2>/dev/null || true',
        'echo "=== BACKEND_HTTP ==="',
        'curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://127.0.0.1:3003/ || echo "000"',
        'echo ""',
        'echo "=== PM2_JSON ==="',
        'pm2 jlist 2>/dev/null || echo "[]"',
        'echo "=== END_PM2 ==="'
    ].join('\n');

    executeSshCommand({
        rawKeyPath: rawKey,
        user,
        ip,
        command: checkScript,
        timeoutMs: 15000
    }).then(result => {
        const stdout = result.stdout || '';

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
        const diskMatch = stdout.match(/(\d+%)\s+\//);
        if (diskMatch) {
            diskSummary = { usage_pct: diskMatch[1] };
        }

        let totalCpuPct = 0;
        if (pm2Processes.length > 0) {
            totalCpuPct = Math.round(pm2Processes.reduce((acc, curr) => acc + (curr.cpu_percent || 0), 0));
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
}

function handlePm2List(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset || presetId === 'local') {
        const { exec } = require('child_process');
        exec('pm2 jlist', (err, stdout) => {
            if (err || !stdout) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, apps: [], data: [] }));
                return;
            }
            try {
                const list = JSON.parse(stdout);
                const data = Array.isArray(list) ? list.map(a => ({
                    name: a.name,
                    status: a.pm2_env ? a.pm2_env.status : 'online',
                    memory_mb: a.monit ? Math.round((a.monit.memory || 0) / (1024 * 1024)) : 0
                })) : [];
                const apps = data.map(a => a.name);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, apps, data }));
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, apps: [], data: [] }));
            }
        });
        return;
    }

    const rawKey = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
    executeSshCommand({
        rawKeyPath: rawKey,
        user: preset.vpsUser || 'asepsuryadi',
        ip: preset.vpsIp,
        command: 'pm2 jlist 2>/dev/null || echo "[]"',
        timeoutMs: 10000
    }).then(result => {
        try {
            const list = JSON.parse(result.stdout.trim() || '[]');
            const data = Array.isArray(list) ? list.map(a => ({
                name: a.name,
                status: a.pm2_env ? a.pm2_env.status : 'online',
                memory_mb: a.monit ? Math.round((a.monit.memory || 0) / (1024 * 1024)) : 0
            })) : [];
            const apps = data.map(a => a.name);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, apps, data }));
        } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, apps: [], data: [] }));
        }
    });
}

function handleRestartService(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const serviceName = parsedUrl.searchParams.get('service') || 'caddy';
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const rawKey = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
    const sudoPass = preset.vpsSudoPass || '1';
    const sudoPrefix = sudoPass ? `echo '${sudoPass}' | sudo -S` : 'sudo';
    let restartCmd = `${sudoPrefix} systemctl restart ${serviceName} 2>/dev/null || true`;

    if (serviceName.startsWith('pm2:')) {
        const pm2App = serviceName.replace('pm2:', '');
        restartCmd = `pm2 restart ${pm2App} 2>/dev/null || pm2 restart all`;
    }

    executeSshCommand({
        rawKeyPath: rawKey,
        user: preset.vpsUser || 'asepsuryadi',
        ip: preset.vpsIp,
        command: restartCmd,
        timeoutMs: 12000
    }).then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: result.success,
            message: `Restart ${serviceName} selesai.`
        }));
    });
}

function handleFlushPm2Logs(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset || presetId === 'local') {
        const { exec } = require('child_process');
        exec('pm2 flush', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Log PM2 lokal berhasil dibersihkan.' }));
        });
        return;
    }

    const rawKey = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
    executeSshCommand({
        rawKeyPath: rawKey,
        user: preset.vpsUser || 'asepsuryadi',
        ip: preset.vpsIp,
        command: 'pm2 flush 2>/dev/null || true',
        timeoutMs: 10000
    }).then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: result.success,
            message: 'Log PM2 remote VPS berhasil dibersihkan.'
        }));
    });
}

module.exports = {
    handleServerHealth,
    handlePm2List,
    handleRestartService,
    handleFlushPm2Logs
};
