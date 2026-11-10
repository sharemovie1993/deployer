const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { getPresets } = require('../preset-store');
const { executeSshCommand } = require('../ssh-helper');

const BASE_PROJECTS_DIR = path.resolve(__dirname, '..', '..', '..');

/**
 * Mapping nama project ke folder lokal dan direktori VPS
 */
function getProjectPaths(projectKey) {
    const key = (projectKey || 'absenta').toLowerCase();
    switch (key) {
        case 'licensing':
            return {
                name: 'Server Lisensi',
                localDir: path.join(BASE_PROJECTS_DIR, 'Project-Server-Lisensi'),
                remoteDir: '/var/www/licensing-server'
            };
        case 'undangan':
            return {
                name: 'Project Undangan Digital',
                localDir: path.join(BASE_PROJECTS_DIR, 'Project Undangan Digital'),
                remoteDir: '/var/www/undangan-digital'
            };
        case 'rekber':
            return {
                name: 'Project Rekening Bersama',
                localDir: path.join(BASE_PROJECTS_DIR, 'Project Rekening Bersama'),
                remoteDir: '/var/www/project-rekber'
            };
        case 'absenta':
        default:
            return {
                name: 'Project Absenta',
                localDir: path.join(BASE_PROJECTS_DIR, 'Project Absenta'),
                remoteDir: '/var/www/project-absenta'
            };
    }
}

/**
 * Mengambil informasi git lokal
 */
function getLocalGitStatus(localDir) {
    if (!fs.existsSync(localDir)) {
        return {
            exists: false,
            error: `Direktori lokal tidak ditemukan: ${localDir}`
        };
    }

    try {
        const hash = execSync('git rev-parse --short HEAD', { cwd: localDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const fullHash = execSync('git rev-parse HEAD', { cwd: localDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const message = execSync('git log -1 --format=%s', { cwd: localDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const author = execSync('git log -1 --format=%an', { cwd: localDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const dateRelative = execSync('git log -1 --format=%cr', { cwd: localDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const dateIso = execSync('git log -1 --format=%cd --date=iso', { cwd: localDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const branch = execSync('git branch --show-current', { cwd: localDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'main';

        // Cek uncommitted changes
        const statusOutput = execSync('git status --porcelain', { cwd: localDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const hasUncommitted = statusOutput.length > 0;
        const uncommittedCount = hasUncommitted ? statusOutput.split('\n').filter(Boolean).length : 0;

        // Cek commit unpushed (ahead of upstream)
        let unpushedCount = 0;
        let upstream = '';
        try {
            upstream = execSync('git rev-parse --abbrev-ref @{u}', { cwd: localDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            const aheadStr = execSync('git rev-list --count @{u}..HEAD', { cwd: localDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            unpushedCount = parseInt(aheadStr, 10) || 0;
        } catch {
            // upstream mungkin belum di-track
            upstream = 'origin/' + branch;
        }

        return {
            exists: true,
            hash,
            fullHash,
            message,
            author,
            dateRelative,
            dateIso,
            branch,
            upstream,
            hasUncommitted,
            uncommittedCount,
            unpushedCount,
            isPushed: unpushedCount === 0
        };
    } catch (err) {
        return {
            exists: false,
            error: `Gagal membaca git lokal: ${err.message}`
        };
    }
}

/**
 * Mengambil informasi git remote dari VPS via SSH
 */
async function getRemoteGitStatus(preset, remoteDir, timeoutMs = 8000) {
    const rawKeyPath = preset.vps_key_path || preset.vpsKeyPath || preset.ssh_key_choice || preset.sshKeyChoice || 'nginxonly.pem';
    const user = preset.vps_user || preset.vpsUser || 'asepsuryadi';
    const ip = preset.vps_ip || preset.vpsIp;

    if (!ip) {
        return { exists: false, error: 'IP VPS tidak disetel pada preset ini.' };
    }

    // Eksekusi bash command di remote VPS
    const remoteBash = `cd ${remoteDir} 2>/dev/null && git rev-parse --short HEAD 2>/dev/null && git log -1 --format="%s" 2>/dev/null && git log -1 --format="%cr" 2>/dev/null && git branch --show-current 2>/dev/null`;

    try {
        const result = await executeSshCommand({
            rawKeyPath,
            user,
            ip,
            command: remoteBash,
            timeoutMs
        });

        if (!result.success || !result.stdout.trim()) {
            return {
                exists: false,
                error: result.stderr ? result.stderr.trim() : 'Gagal mengeksekusi git di VPS target atau folder tidak ditemukan.'
            };
        }

        const lines = result.stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) {
            return {
                exists: false,
                raw: result.stdout,
                error: 'Format respon git VPS tidak valid.'
            };
        }

        const hash = lines[0] || '';
        const message = lines[1] || '';
        const dateRelative = lines[2] || '';
        const branch = lines[3] || 'main';

        return {
            exists: true,
            hash,
            message,
            dateRelative,
            branch
        };
    } catch (err) {
        return {
            exists: false,
            error: `Koneksi SSH gagal: ${err.message}`
        };
    }
}

/**
 * Controller handler untuk GET /api/git-status?id=<presetId>&skipRemote=<boolean>
 */
async function handleGetGitStatus(req, res, parsedUrl) {
    const presetId = parsedUrl.searchParams.get('id');
    const skipRemote = parsedUrl.searchParams.get('skipRemote') === 'true';

    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId) || presets[0];

    if (!preset) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: `Preset ${presetId} tidak ditemukan.` }));
        return;
    }

    const projectInfo = getProjectPaths(preset.project);

    // 1. Ambil Git Lokal
    const localStatus = getLocalGitStatus(projectInfo.localDir);

    // 2. Ambil Git Remote (VPS)
    let remoteStatus = null;
    if (!skipRemote && preset.vpsIp || preset.vps_ip) {
        remoteStatus = await getRemoteGitStatus(preset, projectInfo.remoteDir);
    }

    // 3. Evaluasi Keselarasan (Sync State)
    let isSynced = false;
    let syncState = 'unknown'; // 'synced' | 'outdated' | 'unpushed' | 'error'
    let syncMessage = '';

    if (localStatus.exists) {
        if (localStatus.unpushedCount > 0) {
            syncState = 'unpushed';
            syncMessage = `⚠️ Ada ${localStatus.unpushedCount} commit lokal belum di-push ke GitHub!`;
        } else if (remoteStatus && remoteStatus.exists) {
            if (remoteStatus.hash === localStatus.hash) {
                isSynced = true;
                syncState = 'synced';
                syncMessage = '✅ Kode VPS sudah selaras dengan commit lokal & Git remote.';
            } else {
                syncState = 'outdated';
                syncMessage = `⚡ Kode VPS (${remoteStatus.hash}) tertinggal dari lokal (${localStatus.hash}). Siap di-Quick Update!`;
            }
        } else if (remoteStatus && !remoteStatus.exists) {
            syncState = 'vps_unreachable';
            syncMessage = `ℹ️ Status lokal siap (${localStatus.hash}). VPS tidak dapat dihubungi: ${remoteStatus.error}`;
        } else {
            syncState = 'local_only';
            syncMessage = `Status lokal aktif (${localStatus.hash}).`;
        }
    } else {
        syncState = 'error';
        syncMessage = localStatus.error;
    }

    const payload = {
        success: true,
        data: {
            preset: {
                id: preset.id,
                name: preset.name,
                ip: preset.vps_ip || preset.vpsIp,
                project: preset.project || 'absenta',
                projectName: projectInfo.name
            },
            local: localStatus,
            remote: remoteStatus,
            sync: {
                isSynced,
                syncState,
                syncMessage
            }
        }
    };

    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify(payload));
}

module.exports = {
    handleGetGitStatus,
    getLocalGitStatus,
    getRemoteGitStatus
};
