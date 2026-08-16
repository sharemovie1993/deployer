const { getPresets } = require('../preset-store');
const { executeSshCommand } = require('../ssh-helper');

function handleTestConnection(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const rawKey = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
    const remoteCmd = [
        'START_MS=$(date +%s%3N);',
        'echo "===CONN_OK===";',
        'echo "uptime:$(uptime -p 2>/dev/null || uptime)";',
        'echo "ram:$(free -h 2>/dev/null | awk \'NR==2{print $3\"/\"$2}\' || echo N/A)";',
        'echo "disk:$(df -h / 2>/dev/null | awk \'NR==2{print $3\"/\"$2}\' || echo N/A)";',
        'echo "caddy:$(systemctl is-active caddy 2>/dev/null || echo unknown)";',
        'echo "pm2:$(pm2 list --no-color 2>/dev/null | grep -E \'online|stopped|errored\' | awk \'{print $4":"$18}\' | tr \'\\n\' \',\' || echo N/A)";',
        'END_MS=$(date +%s%3N);',
        'echo "latency_ms:$((END_MS - START_MS))";'
    ].join(' ');

    const startTime = Date.now();
    executeSshCommand({
        rawKeyPath: rawKey,
        user: preset.vpsUser || 'asepsuryadi',
        ip: preset.vpsIp,
        command: remoteCmd,
        timeoutMs: 10000
    }).then(result => {
        const totalMs = Date.now() - startTime;
        if (!result.success || !result.stdout.includes('===CONN_OK===')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                offline: true,
                message: result.stderr ? `SSH gagal: ${result.stderr.trim().split('\n')[0]}` : 'Koneksi timeout (8 detik). VPS tidak dapat dijangkau.'
            }));
            return;
        }

        const parse = (key) => {
            const m = result.stdout.match(new RegExp(key + ':(.+)'));
            return m ? m[1].trim() : 'N/A';
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            latency_ms: totalMs,
            uptime: parse('uptime'),
            ram: parse('ram'),
            disk: parse('disk'),
            caddy: parse('caddy'),
            pm2: parse('pm2')
        }));
    });
}

function handleFixPortConflict(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const port = parsedUrl.searchParams.get('port') || '5001';
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Preset tidak ditemukan.' }));
        return;
    }

    const rawKey = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
    const sudoPass = preset.vpsSudoPass || '';
    const sudoPrefix = sudoPass ? 'echo "' + sudoPass + '" | sudo -S' : 'sudo';

    const fixCmd = [
        'echo "=== CEK PORT ' + port + ' ==="',
        'PID_ON_PORT=$(' + sudoPrefix + ' fuser ' + port + '/tcp 2>/dev/null || echo "")',
        'if [ -n "$PID_ON_PORT" ]; then',
        '  echo "Port ' + port + ' dipakai PID: $PID_ON_PORT — membebaskan..."',
        '  ' + sudoPrefix + ' fuser -k ' + port + '/tcp 2>/dev/null || true',
        '  sleep 2',
        '  echo "Port ' + port + ' berhasil dibebaskan."',
        'else',
        '  echo "Port ' + port + ' sudah luang / aman."',
        'fi',
        'systemctl is-active caddy 2>/dev/null || true',
        'echo "PORT_FIX_COMPLETE=1"'
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
            message: result.stdout || result.stderr
        }));
    });
}

module.exports = {
    handleTestConnection,
    handleFixPortConflict
};
