const { getPresets } = require('../preset-store');
const { executeSshCommand } = require('../ssh-helper');

function parseAuditOutput(stdout) {
    // 1. Hardening - UFW
    const ufwMatch = stdout.match(/--- UFW ---\s*([\s\S]*?)\s*--- FAIL2BAN ---/);
    const ufwRaw = ufwMatch ? ufwMatch[1].trim() : '';
    const ufwActive = ufwRaw.includes('Status: active');
    const ufwDefaultDeny = ufwRaw.includes('deny (incoming)');
    const ufwPorts = [];
    if (ufwActive) {
        const lines = ufwRaw.split('\n');
        lines.forEach(l => {
            const m = l.match(/^([0-9a-zA-Z:\/]+)\s+ALLOW IN/);
            if (m && !ufwPorts.includes(m[1])) {
                ufwPorts.push(m[1]);
            }
        });
    }

    // 2. Hardening - Fail2Ban
    const f2bMatch = stdout.match(/--- FAIL2BAN ---\s*([\s\S]*?)\s*--- SSH ---/);
    const f2bRaw = f2bMatch ? f2bMatch[1].trim() : '';
    const f2bInstalled = !f2bRaw.includes('not_installed');
    const f2bActive = f2bInstalled && f2bRaw.includes('active') && !f2bRaw.includes('inactive');
    const f2bSshdJail = f2bActive && !f2bRaw.includes('sshd_jail_down');

    // 3. Hardening - SSH
    const sshMatch = stdout.match(/--- SSH ---\s*([\s\S]*?)\s*--- WATCHDOG ---/);
    const sshRaw = sshMatch ? sshMatch[1].trim().toLowerCase() : '';
    const sshPassDisabled = sshRaw.includes('passwordauthentication no') && !sshRaw.includes('passwordauthentication yes');
    const sshRootProhibit = sshRaw.includes('permitrootlogin prohibit-password') || 
                            sshRaw.includes('permitrootlogin no') || 
                            sshRaw.includes('permitrootlogin without-password');
    const sshPubkeyEnabled = sshRaw.includes('pubkeyauthentication yes') || !sshRaw.includes('pubkeyauthentication no');

    // 4. Hardening - Watchdog
    const wdMatch = stdout.match(/--- WATCHDOG ---\s*([\s\S]*?)\s*--- SYSCTL ---/);
    const wdRaw = wdMatch ? wdMatch[1].trim() : '';
    const wdActive = wdRaw.includes('active') && !wdRaw.includes('inactive');

    // 5. Tuning - Sysctl
    const sysctlMatch = stdout.match(/--- SYSCTL ---\s*([\s\S]*?)\s*--- LIMITS ---/);
    const sysctlRaw = sysctlMatch ? sysctlMatch[1].trim() : '';
    const fileMaxMatch = sysctlRaw.match(/fs\.file-max\s*=\s*(\d+)/);
    const fileMax = fileMaxMatch ? parseInt(fileMaxMatch[1], 10) : 0;
    const swappinessMatch = sysctlRaw.match(/vm\.swappiness\s*=\s*(\d+)/);
    const swappiness = swappinessMatch ? parseInt(swappinessMatch[1], 10) : 60;
    const overcommitMatch = sysctlRaw.match(/vm\.overcommit_memory\s*=\s*(\d+)/);
    const overcommit = overcommitMatch ? parseInt(overcommitMatch[1], 10) : 0;
    const somaxconnMatch = sysctlRaw.match(/net\.core\.somaxconn\s*=\s*(\d+)/);
    const somaxconn = somaxconnMatch ? parseInt(somaxconnMatch[1], 10) : 128;
    const tcpTwReuseMatch = sysctlRaw.match(/net\.ipv4\.tcp_tw_reuse\s*=\s*(\d+)/);
    const tcpTwReuse = tcpTwReuseMatch ? parseInt(tcpTwReuseMatch[1], 10) : 0;

    const sysctlPassed = fileMax >= 2000000 && swappiness <= 20 && overcommit === 1 && somaxconn >= 32768 && tcpTwReuse === 1;

    // 6. Tuning - Limits
    const limitsMatch = stdout.match(/--- LIMITS ---\s*([\s\S]*?)\s*--- DOCKER_DAEMON ---/);
    const limitsRaw = limitsMatch ? limitsMatch[1].trim() : '';
    const limitsPassed = limitsRaw.includes('65536') && limitsRaw.includes('1048576');

    // 7. Tuning - Docker Daemon
    const dockerMatch = stdout.match(/--- DOCKER_DAEMON ---\s*([\s\S]*?)\s*--- POSTGRES_CONF ---/);
    const dockerRaw = dockerMatch ? dockerMatch[1].trim() : '';
    const dockerConfigured = dockerRaw.includes('max-size') && dockerRaw.includes('live-restore');

    // 8. Tuning - Postgres Conf
    const pgMatch = stdout.match(/--- POSTGRES_CONF ---\s*([\s\S]*?)\s*--- REDIS_CONF ---/);
    const pgRaw = pgMatch ? pgMatch[1].trim() : '';
    const pgConfigured = !pgRaw.includes('NO_PG_CONF') && pgRaw.includes('shared_buffers');
    const pgSharedBuffers = (pgRaw.match(/shared_buffers\s*=\s*([^\n]+)/) || [])[1] || '-';
    const pgMaxConn = (pgRaw.match(/max_connections\s*=\s*([^\n]+)/) || [])[1] || '-';

    // 9. Tuning - Redis Conf
    const redisMatch = stdout.match(/--- REDIS_CONF ---\s*([\s\S]*?)\s*--- PG_LINK ---/);
    const redisRaw = redisMatch ? redisMatch[1].trim() : '';
    const redisConfigured = !redisRaw.includes('NO_REDIS_CONF') && redisRaw.includes('maxmemory');
    const redisMaxMemory = (redisRaw.match(/maxmemory\s+([^\n]+)/) || [])[1] || '-';

    // 10. Tuning - Timezone
    const tzMatch = stdout.match(/--- TIMEZONE ---\s*([\s\S]*?)\s*--- MEMORY_SWAP ---/);
    const tzRaw = tzMatch ? tzMatch[1].trim() : '';
    const tzName = (tzRaw.match(/Time zone:\s*([^\n]+)/) || [])[1] || 'UTC';
    const ntpActive = tzRaw.includes('NTP service: active');
    const clockSynced = tzRaw.includes('System clock synchronized: yes');

    // 11. Tuning - Memory & Swap
    const memMatch = stdout.match(/--- MEMORY_SWAP ---\s*([\s\S]*?)\s*=== AUDIT_END ===/);
    const memRaw = memMatch ? memMatch[1].trim() : '';
    const memLine = (memRaw.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/) || []);
    const ramTotalMb = memLine[1] ? parseInt(memLine[1], 10) : 0;
    const ramUsedMb = memLine[2] ? parseInt(memLine[2], 10) : 0;
    const swapLine = (memRaw.match(/Swap:\s+(\d+)\s+(\d+)\s+(\d+)/) || []);
    const swapTotalMb = swapLine[1] ? parseInt(swapLine[1], 10) : 0;
    const swapUsedMb = swapLine[2] ? parseInt(swapLine[2], 10) : 0;
    const swapActive = swapTotalMb > 0;

    // Hardening Score calculation
    let hardeningPoints = 0;
    let hardeningMax = 4;
    if (ufwActive && ufwDefaultDeny) hardeningPoints++;
    if (f2bActive && f2bSshdJail) hardeningPoints++;
    if (sshPassDisabled && sshRootProhibit) hardeningPoints++;
    if (wdActive) hardeningPoints++;
    const hardeningScore = Math.round((hardeningPoints / hardeningMax) * 100);

    // Tuning Score calculation
    let tuningPoints = 0;
    let tuningMax = 6;
    if (sysctlPassed) tuningPoints++;
    if (limitsPassed) tuningPoints++;
    if (dockerConfigured) tuningPoints++;
    if (pgConfigured && redisConfigured) tuningPoints++;
    if (clockSynced || ntpActive) tuningPoints++;
    if (swapActive) tuningPoints++;
    const tuningScore = Math.round((tuningPoints / tuningMax) * 100);

    return {
        hardening: {
            score: hardeningScore,
            status: hardeningScore >= 75 ? 'SECURE' : hardeningScore >= 50 ? 'PARTIAL' : 'VULNERABLE',
            ufw: {
                active: ufwActive,
                defaultDeny: ufwDefaultDeny,
                ports: ufwPorts,
                raw: ufwRaw
            },
            fail2ban: {
                installed: f2bInstalled,
                active: f2bActive,
                sshdJail: f2bSshdJail
            },
            ssh: {
                passwordAuthDisabled: sshPassDisabled,
                rootLoginSafe: sshRootProhibit,
                pubkeyAuthEnabled: sshPubkeyEnabled
            },
            watchdog: {
                active: wdActive
            }
        },
        tuning: {
            score: tuningScore,
            status: tuningScore >= 80 ? 'OPTIMIZED' : tuningScore >= 50 ? 'PARTIAL' : 'UNTUNED',
            sysctl: {
                passed: sysctlPassed,
                fileMax,
                swappiness,
                overcommit,
                somaxconn,
                tcpTwReuse
            },
            limits: {
                passed: limitsPassed
            },
            docker: {
                configured: dockerConfigured
            },
            absentaConfig: {
                postgres: {
                    configured: pgConfigured,
                    sharedBuffers: pgSharedBuffers,
                    maxConnections: pgMaxConn
                },
                redis: {
                    configured: redisConfigured,
                    maxMemory: redisMaxMemory
                }
            },
            timezone: {
                name: tzName,
                ntpActive,
                clockSynced
            },
            memory: {
                ramTotalMb,
                ramUsedMb,
                swapTotalMb,
                swapUsedMb,
                swapActive
            }
        },
        rawOutput: stdout
    };
}

function handleAuditHardeningTuning(req, res, parsedUrl) {
    let presetId = parsedUrl.searchParams.get('id');
    let targetIp = parsedUrl.searchParams.get('ip');
    let targetUser = parsedUrl.searchParams.get('user');
    let keyChoice = parsedUrl.searchParams.get('key');
    let sudoPass = parsedUrl.searchParams.get('sudoPass') || '1';

    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (preset) {
        targetIp = preset.vpsIp;
        targetUser = preset.vpsUser || 'asep';
        keyChoice = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
        sudoPass = preset.vpsSudoPass || '1';
    } else if (!targetIp) {
        // Default to first preset or 10.10.10.99
        targetIp = '10.10.10.99';
        targetUser = 'asepsuryadi';
        keyChoice = 'nginxonly.pem';
    }

    const auditScript = [
        'echo "=== AUDIT_START ==="',
        'echo "--- UFW ---"',
        `echo "${sudoPass}" | sudo -S ufw status verbose 2>/dev/null || echo "UFW_ERROR"`,
        'echo "--- FAIL2BAN ---"',
        'systemctl is-active fail2ban 2>/dev/null || echo "inactive"',
        'which fail2ban-client 2>/dev/null || echo "not_installed"',
        `echo "${sudoPass}" | sudo -S fail2ban-client status sshd 2>/dev/null || echo "sshd_jail_down"`,
        'echo "--- SSH ---"',
        `echo "${sudoPass}" | sudo -S sshd -T 2>/dev/null | grep -iE 'passwordauthentication|permitrootlogin|pubkeyauthentication' || grep -iE 'PasswordAuthentication|PermitRootLogin' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null || true`,
        'echo "--- WATCHDOG ---"',
        'systemctl is-active absenta-tunnel-watchdog 2>/dev/null || echo "inactive"',
        'echo "--- SYSCTL ---"',
        'sysctl fs.file-max vm.swappiness vm.overcommit_memory net.core.somaxconn net.ipv4.tcp_tw_reuse 2>/dev/null || true',
        'echo "--- LIMITS ---"',
        'cat /etc/security/limits.d/99-absenta-limits.conf 2>/dev/null || echo "NO_LIMITS"',
        'echo "--- DOCKER_DAEMON ---"',
        'cat /etc/docker/daemon.json 2>/dev/null || echo "NO_DOCKER_CONFIG"',
        'echo "--- POSTGRES_CONF ---"',
        'if [ -f /etc/absenta/config/postgresql.conf ]; then head -n 25 /etc/absenta/config/postgresql.conf; else echo "NO_PG_CONF"; fi',
        'echo "--- REDIS_CONF ---"',
        'if [ -f /etc/absenta/config/redis.conf ]; then cat /etc/absenta/config/redis.conf; else echo "NO_REDIS_CONF"; fi',
        'echo "--- PG_LINK ---"',
        'ls -la /etc/postgresql/*/main/conf.d/99-absenta-tuning.conf 2>/dev/null || echo "NO_PG_LINK"',
        'echo "--- TIMEZONE ---"',
        'timedatectl 2>/dev/null || date',
        'echo "--- MEMORY_SWAP ---"',
        'free -m 2>/dev/null || true',
        'swapon --show 2>/dev/null || true',
        'echo "=== AUDIT_END ==="'
    ].join('\n');

    executeSshCommand({
        rawKeyPath: keyChoice,
        user: targetUser,
        ip: targetIp,
        command: auditScript,
        timeoutMs: 15000
    }).then(result => {
        if (!result.success) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: `Gagal menghubungkan ke ${targetUser}@${targetIp}: ${result.stderr || 'Timeout'}`
            }));
            return;
        }

        const parsed = parseAuditOutput(result.stdout || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            server: {
                ip: targetIp,
                user: targetUser,
                key: keyChoice
            },
            ...parsed
        }));
    }).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            message: `Terjadi kesalahan saat audit: ${err.message}`
        }));
    });
}

module.exports = {
    handleAuditHardeningTuning
};
