const http = require('http');
const path = require('path');
const { handleRequest } = require('../src/routes');
const { getPresets } = require('../src/preset-store');

const TEST_PORT = 8899;

function request(options, bodyData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = data;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {}
                resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed, rawBody: data });
            });
        });

        req.on('error', err => reject(err));

        if (bodyData) {
            req.write(typeof bodyData === 'object' ? JSON.stringify(bodyData) : bodyData);
        }
        req.end();
    });
}

function testSseStream(pathUrl) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1', port: TEST_PORT, path: pathUrl, method: 'GET'
        }, (res) => {
            let chunk = '';
            res.on('data', d => {
                chunk += d.toString();
                if (chunk.includes('data:')) {
                    req.destroy();
                    resolve({ statusCode: res.statusCode, contentType: res.headers['content-type'], chunk });
                }
            });
        });
        req.on('error', () => resolve({ statusCode: 500, contentType: '', chunk: '' }));
        req.end();
    });
}

async function runRegressionTests() {
    console.log('\n=============================================================');
    console.log('    SKRIP UJI REGRESI AUTOMATED 100% COVERAGE (DEPLOYER API)');
    console.log('=============================================================\n');

    // 1. Start temporary test HTTP server
    const server = http.createServer(handleRequest);
    await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));
    console.log(`[INFO] Server Uji Regresi Aktif di http://127.0.0.1:${TEST_PORT}\n`);

    let passed = 0;
    let failed = 0;

    function assert(condition, testName, details = '') {
        if (condition) {
            console.log(` ✅ PASS: ${testName} ${details ? '(' + details + ')' : ''}`);
            passed++;
        } else {
            console.error(` ❌ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
            failed++;
        }
    }

    try {
        // Test 1: GET /api/presets
        const resPresets = await request({
            hostname: '127.0.0.1', port: TEST_PORT, path: '/api/presets', method: 'GET'
        });
        assert(
            resPresets.statusCode === 200 && resPresets.body.success === true && Array.isArray(resPresets.body.data),
            '1. GET /api/presets (SQLite Data Fetch)',
            `Presets: ${resPresets.body.data ? resPresets.body.data.length : 0}`
        );

        // Test 2: POST /api/presets (Create test preset)
        const testPresetId = 'reg-test-' + Date.now();
        const resCreate = await request({
            hostname: '127.0.0.1', port: TEST_PORT, path: '/api/presets', method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            id: testPresetId,
            name: 'Regression Test Server',
            vpsIp: '127.0.0.1',
            vpsUser: 'testuser',
            sshKeyChoice: 'nginxonly.pem'
        });
        assert(
            resCreate.statusCode === 200 && resCreate.body.success === true,
            '2. POST /api/presets (SQLite Create Preset)',
            `Created ID: ${testPresetId}`
        );

        // Test 3: DELETE /api/presets
        const resDelete = await request({
            hostname: '127.0.0.1', port: TEST_PORT, path: `/api/presets?id=${testPresetId}`, method: 'DELETE'
        });
        assert(
            resDelete.statusCode === 200 && resDelete.body.success === true,
            '3. DELETE /api/presets (SQLite Delete Preset)'
        );

        const presets = getPresets();
        const p10 = presets.find(p => p.vpsIp === '10.10.10.99') || presets[0];

        if (p10) {
            console.log(`\n[REMOTE TESTS] Menguji tools ke preset target: ${p10.name} (${p10.vpsIp})...\n`);

            // Test 4: GET /api/test-connection
            const resConn = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/test-connection?id=${p10.id}`, method: 'GET'
            });
            const noBadPermsConn = !JSON.stringify(resConn.body).includes('bad permissions');
            assert(
                resConn.statusCode === 200 && resConn.body.success === true && noBadPermsConn,
                '4. GET /api/test-connection (Uji Koneksi & Metrics)',
                `Latency: ${resConn.body.latency_ms || 0}ms, RAM: ${resConn.body.ram}`
            );

            // Test 5: GET /api/server-health
            const resHealth = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/server-health?id=${p10.id}`, method: 'GET'
            });
            assert(
                resHealth.statusCode === 200 && resHealth.body.success === true,
                '5. GET /api/server-health (System Health Inspection)',
                `Services: ${resHealth.body.data ? Object.keys(resHealth.body.data).join(',') : 'OK'}`
            );

            // Test 6: GET /api/pm2-list
            const resPm2List = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/pm2-list?id=${p10.id}`, method: 'GET'
            });
            assert(
                resPm2List.statusCode === 200 && (resPm2List.body.success === true || Array.isArray(resPm2List.body.apps)),
                '6. GET /api/pm2-list (Daftar Aplikasi PM2 Remote)'
            );

            // Test 7: GET /api/audit-tunnels
            const resAudit = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/audit-tunnels?id=${p10.id}`, method: 'GET'
            });
            assert(
                resAudit.statusCode === 200 && (resAudit.body.success === true || resAudit.body.interfaces !== undefined),
                '7. GET /api/audit-tunnels (WireGuard Multi-Tunnel Audit)'
            );

            // Test 8: GET /api/fix-tunnels
            const resFixTunnel = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/fix-tunnels?id=${p10.id}`, method: 'GET'
            });
            assert(
                resFixTunnel.statusCode === 200,
                '8. GET /api/fix-tunnels (WireGuard Netmask /32 Sanitizer Tool)'
            );

            // Test 9: GET /api/fix-port-conflict
            const resFixPort = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/fix-port-conflict?id=${p10.id}&port=9999`, method: 'GET'
            });
            assert(
                resFixPort.statusCode === 200,
                '9. GET /api/fix-port-conflict (Port Collision Resolver Tool)'
            );

            // Test 10: GET /api/clean-ghost-tunnels
            const resCleanGhost = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/clean-ghost-tunnels?id=${p10.id}`, method: 'GET'
            });
            assert(
                resCleanGhost.statusCode === 200,
                '10. GET /api/clean-ghost-tunnels (Clean Ghost Tunnels Tool)'
            );

            // Test 11: GET /api/watchdog-status
            const resWatchdog = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/watchdog-status?id=${p10.id}`, method: 'GET'
            });
            assert(
                resWatchdog.statusCode === 200 && resWatchdog.body.success === true,
                '11. GET /api/watchdog-status (Status Watchdog Inspection)',
                `Timer: ${resWatchdog.body.data ? resWatchdog.body.data.timer : 'N/A'}`
            );

            // Test 12: POST /api/test-cluster-nodes
            const resClusterNodes = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/test-cluster-nodes`, method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, JSON.stringify({ apiNodes: '10.10.10.99', waNode: '10.10.10.99', targetUser: 'asepsuryadi', keyPath: 'nginxonly.pem' }));
            assert(
                resClusterNodes.statusCode === 200 && resClusterNodes.body.success === true && Array.isArray(resClusterNodes.body.nodes),
                '12. POST /api/test-cluster-nodes (Multi-VM Cluster Node Connectivity Test)',
                `Nodes Tested: ${resClusterNodes.body.nodes ? resClusterNodes.body.nodes.length : 0}`
            );

            // Test 13: POST /api/test-db (Database Port Range Test)
            const resTestDb = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/test-db`, method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, JSON.stringify('postgresql://postgres:123123123@localhost:5432/absensi'));
            assert(
                resTestDb.statusCode === 200 && typeof resTestDb.body.message === 'string' && !resTestDb.body.message.includes('undefined'),
                '13. POST /api/test-db (Database Port Connection String Test)',
                `Message: ${resTestDb.body.message}`
            );

            // Test 14: POST /api/verify-license (License Verification with Rich Metadata Card)
            const resVerifyLic = await request({
                hostname: '127.0.0.1', port: TEST_PORT, path: `/api/verify-license`, method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, JSON.stringify({ licenseKey: 'ABS-C0A0-4B84-2815', schoolName: 'SaaS-Node1', adminEmail: 'admin@sekolah.sch.id' }));
            assert(
                resVerifyLic.statusCode === 200 && resVerifyLic.body.success === true && resVerifyLic.body.data && resVerifyLic.body.data.key === 'ABS-C0A0-4B84-2815',
                '14. POST /api/verify-license (Server License Verification & Metadata Details)',
                `School: ${resVerifyLic.body.data ? resVerifyLic.body.data.schoolName : 'N/A'}, Status: ${resVerifyLic.body.data ? resVerifyLic.body.data.status : 'N/A'}`
            );

            // Test 15: GET /api/stream-pm2-logs (SSE Stream PM2 Logs)
            console.log(`\n[SSE TESTS] Menguji modul streaming log SSE...`);
            const sseLogs = await testSseStream(`/api/stream-pm2-logs?id=${p10.id}&app=all&lines=5`);
            const noBadPermsSse = !sseLogs.chunk.includes('bad permissions');
            assert(
                sseLogs.statusCode === 200 && sseLogs.contentType.includes('text/event-stream') && noBadPermsSse,
                '15. GET /api/stream-pm2-logs (Real-Time PM2 Log Stream)',
                `Sanitized: ${noBadPermsSse}`
            );

            // Test 16: GET /api/stream-quick-update (SSE Stream Quick Update)
            const sseUpdate = await testSseStream(`/api/stream-quick-update?id=${p10.id}`);
            assert(
                sseUpdate.statusCode === 200 && sseUpdate.contentType.includes('text/event-stream'),
                '16. GET /api/stream-quick-update (Quick Update 1-Click Stream)'
            );
        }

    } catch (e) {
        console.error('\n❌ ERROR SAAT RUNNING REGRESSION TEST:', e.message);
        failed++;
    } finally {
        server.close();
        console.log('\n=============================================================');
        console.log(` HASIL PENGUJIAN REGRESI LENGKAP:  Passed: ${passed} | Failed: ${failed}`);
        console.log('=============================================================\n');
        process.exit(failed > 0 ? 1 : 0);
    }
}

runRegressionTests();
