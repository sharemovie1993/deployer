const fs = require('fs');
const path = require('path');

const { handleGetPresets, handleSavePreset, handleDeletePreset } = require('./controllers/preset.controller');
const { handleTestConnection, handleFixPortConflict } = require('./controllers/connection.controller');
const { handleServerHealth, handlePm2List, handleRestartService, handleFlushPm2Logs } = require('./controllers/health.controller');
const { handleAuditTunnels, handleFixTunnels, handleCleanGhostTunnels, handleRemoveSelectedTunnel, handleWatchdogStatus } = require('./controllers/tunnel.controller');
const { handleBrowseFile, handleTestSsh, handleTestDb, handleVerifyLicense, handleSaveConfig, handleTestClusterNodes } = require('./controllers/installer.controller');

const {
    handleStreamQuickUpdate,
    handleStreamSeedWilayah,
    handleStreamInstall,
    handleStreamUndanganInstall,
    handleStreamClusterInstall,
    handleStreamSetupSsh,
    handleStreamPm2Logs,
    cancelProcess
} = require('./sse');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function serveFile(res, filePath, contentType) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

function handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Static Files Handler
    if (pathname === '/' || pathname === '/index.html') {
        serveFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html');
        return;
    }
    if (pathname.startsWith('/css/')) {
        serveFile(res, path.join(PUBLIC_DIR, pathname), 'text/css');
        return;
    }
    if (pathname.startsWith('/js/')) {
        serveFile(res, path.join(PUBLIC_DIR, pathname), 'application/javascript');
        return;
    }

    // 1. Preset Management API
    if (pathname === '/api/presets' && req.method === 'GET') return handleGetPresets(req, res);
    if (pathname === '/api/presets' && req.method === 'POST') return handleSavePreset(req, res);
    if (pathname === '/api/presets' && req.method === 'DELETE') return handleDeletePreset(req, res, parsedUrl);

    // 2. SSH Connection & Port Resolution
    if (pathname === '/api/test-connection' && req.method === 'GET') return handleTestConnection(req, res, parsedUrl);
    if (pathname === '/api/fix-port-conflict' && req.method === 'GET') return handleFixPortConflict(req, res, parsedUrl);

    // 3. System Health & PM2 Management
    if (pathname === '/api/server-health' && (req.method === 'GET' || req.method === 'POST')) return handleServerHealth(req, res, parsedUrl);
    if (pathname === '/api/pm2-list' && (req.method === 'GET' || req.method === 'POST')) return handlePm2List(req, res, parsedUrl);
    if (pathname === '/api/restart-service' && (req.method === 'GET' || req.method === 'POST')) return handleRestartService(req, res, parsedUrl);
    if (pathname === '/api/flush-pm2-logs' && (req.method === 'GET' || req.method === 'POST')) return handleFlushPm2Logs(req, res, parsedUrl);

    // 4. WireGuard Tunnel Tools & Watchdog
    if (pathname === '/api/watchdog-status' && (req.method === 'GET' || req.method === 'POST')) return handleWatchdogStatus(req, res, parsedUrl);
    if (pathname === '/api/audit-tunnels' && (req.method === 'GET' || req.method === 'POST')) return handleAuditTunnels(req, res, parsedUrl);
    if (pathname === '/api/fix-tunnels' && (req.method === 'GET' || req.method === 'POST')) return handleFixTunnels(req, res, parsedUrl);
    if (pathname === '/api/clean-ghost-tunnels' && (req.method === 'GET' || req.method === 'POST')) return handleCleanGhostTunnels(req, res, parsedUrl);
    if (pathname === '/api/remove-selected-tunnel' && (req.method === 'GET' || req.method === 'POST')) return handleRemoveSelectedTunnel(req, res, parsedUrl);

    // 5. Installer Wizard Tools
    if (pathname === '/api/browse-file' && req.method === 'GET') return handleBrowseFile(req, res, parsedUrl);
    if (pathname === '/api/test-ssh' && req.method === 'POST') return handleTestSsh(req, res);
    if (pathname === '/api/test-db' && req.method === 'POST') return handleTestDb(req, res);
    if (pathname === '/api/verify-license' && req.method === 'POST') return handleVerifyLicense(req, res);
    if (pathname === '/api/save-config' && req.method === 'POST') return handleSaveConfig(req, res);
    if (pathname === '/api/test-cluster-nodes' && req.method === 'POST') return handleTestClusterNodes(req, res);

    // 6. SSE Real-Time Stream Handlers
    if (pathname === '/api/stream-quick-update' && req.method === 'GET') return handleStreamQuickUpdate(req, res, parsedUrl);
    if (pathname === '/api/stream-seed-wilayah' && req.method === 'GET') return handleStreamSeedWilayah(req, res, parsedUrl);
    if (pathname === '/api/stream-install' && req.method === 'GET') return handleStreamInstall(req, res, global.installParams || {});
    if (pathname === '/api/stream-undangan-install' && req.method === 'GET') return handleStreamUndanganInstall(req, res, global.installParams || {});
    if (pathname === '/api/stream-cluster-install' && req.method === 'GET') return handleStreamClusterInstall(req, res, parsedUrl);
    if (pathname === '/api/stream-setup-ssh' && req.method === 'GET') return handleStreamSetupSsh(req, res, parsedUrl);
    if (pathname === '/api/stream-pm2-logs' && req.method === 'GET') return handleStreamPm2Logs(req, res, parsedUrl);

    if (pathname === '/api/quick-update/cancel' && req.method === 'POST') {
        const presetId = parsedUrl.searchParams.get('id');
        cancelProcess(presetId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Proses pembatalan dikirim.' }));
        return;
    }

    // 404 Fallback
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: `Rute API '${pathname}' tidak ditemukan.` }));
}

module.exports = {
    handleRequest
};
