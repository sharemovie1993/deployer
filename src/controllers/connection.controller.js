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

function handleCheckDomainConfig(req, res, parsedUrl) {
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
        'echo "===CHECK_DOMAIN_START===";',
        'if [ -f "/var/www/project-absenta/absenta_backend/.env" ]; then',
        '    echo "APP_URL:$(grep -E \'^APP_URL=\' /var/www/project-absenta/absenta_backend/.env | cut -d\'=\' -f2-)";',
        '    echo "MAIN_DOMAIN:$(grep -E \'^MAIN_DOMAIN=\' /var/www/project-absenta/absenta_backend/.env | cut -d\'=\' -f2-)";',
        '    echo "EASY_TUNNEL_BASE_DOMAIN:$(grep -E \'^EASY_TUNNEL_BASE_DOMAIN=\' /var/www/project-absenta/absenta_backend/.env | cut -d\'=\' -f2-)";',
        '    echo "PUBLIC_DOMAIN_BASE:$(grep -E \'^PUBLIC_DOMAIN_BASE=\' /var/www/project-absenta/absenta_backend/.env | cut -d\'=\' -f2-)";',
        '    echo "TENANT_BASE_DOMAIN:$(grep -E \'^TENANT_BASE_DOMAIN=\' /var/www/project-absenta/absenta_backend/.env | cut -d\'=\' -f2-)";',
        '    echo "FRONTEND_URL:$(grep -E \'^FRONTEND_URL=\' /var/www/project-absenta/absenta_backend/.env | cut -d\'=\' -f2-)";',
        '    echo "LICENSE_KEY:$(grep -E \'^LICENSE_KEY=\' /var/www/project-absenta/absenta_backend/.env | cut -d\'=\' -f2-)";',
        '    echo "LICENSE_SERVER_URL:$(grep -E \'^LICENSE_SERVER_URL=\' /var/www/project-absenta/absenta_backend/.env | cut -d\'=\' -f2-)";',
        'fi;',
        'if [ -f "/var/www/project-absenta/absenta_frontend/.env" ]; then',
        '    echo "VITE_MAIN_DOMAIN:$(grep -E \'^VITE_MAIN_DOMAIN=\' /var/www/project-absenta/absenta_frontend/.env | cut -d\'=\' -f2-)";',
        'fi;',
        'if [ -d "/var/www/project-absenta/absenta_backend" ]; then',
        '    cd /var/www/project-absenta/absenta_backend;',
        '    node -e "const { PrismaClient } = require(\'@prisma/client\'); const prisma = new PrismaClient(); prisma.tenant.findFirst({ where: { id: { not: \'system\' } }, select: { name: true, subdomain: true, custom_domain: true } }).then(t => { if (t) { console.log(\'TENANT_NAME:\' + (t.name || \'\')); console.log(\'TENANT_SUBDOMAIN:\' + (t.subdomain || \'\')); console.log(\'TENANT_CUSTOM_DOMAIN:\' + (t.custom_domain || \'\')); } }).catch(() => {}).finally(() => prisma.\\$disconnect());" 2>/dev/null;',
        'fi;',
        'echo "===CHECK_DOMAIN_END===";'
    ].join(' ');

    executeSshCommand({
        rawKeyPath: rawKey,
        user: preset.vpsUser || 'asepsuryadi',
        ip: preset.vpsIp,
        command: remoteCmd,
        timeoutMs: 12000
    }).then(result => {
        if (!result.success || !result.stdout.includes('===CHECK_DOMAIN_START===')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: result.stderr || 'Gagal terhubung ke VPS untuk membaca konfigurasi .env.'
            }));
            return;
        }

        const parse = (key) => {
            const m = result.stdout.match(new RegExp(key + ':(.*)'));
            return m ? m[1].trim() : '';
        };

        const configData = {
            appUrl: parse('APP_URL'),
            mainDomain: parse('MAIN_DOMAIN'),
            easyTunnelBaseDomain: parse('EASY_TUNNEL_BASE_DOMAIN'),
            publicDomainBase: parse('PUBLIC_DOMAIN_BASE'),
            tenantBaseDomain: parse('TENANT_BASE_DOMAIN'),
            frontendUrl: parse('FRONTEND_URL'),
            viteMainDomain: parse('VITE_MAIN_DOMAIN'),
            licenseKey: parse('LICENSE_KEY'),
            licenseServerUrl: parse('LICENSE_SERVER_URL'),
            tenantName: parse('TENANT_NAME'),
            tenantSubdomain: parse('TENANT_SUBDOMAIN'),
            tenantCustomDomain: parse('TENANT_CUSTOM_DOMAIN')
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            data: configData,
            ...configData
        }));
    }).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: err.message }));
    });
}

module.exports = {
    handleTestConnection,
    handleFixPortConflict,
    handleCheckDomainConfig
};
