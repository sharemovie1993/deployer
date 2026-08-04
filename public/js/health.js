// public/js/health.js - System & Worker Health Matrix UI for IT Admins

function populateHealthPresetDropdown() {
    const select = document.getElementById('health-target-preset');
    if (!select) return;

    let html = '<option value="local">💻 Server Windows Lokal (Localhost)</option>';
    if (window.globalPresets && Array.isArray(window.globalPresets)) {
        window.globalPresets.forEach(p => {
            html += `<option value="${p.id}">🌐 Server ${p.name || p.vpsIp} (${p.vpsIp})</option>`;
        });
    }
    select.innerHTML = html;
}

function refreshHealthMatrixUI() {
    const select = document.getElementById('health-target-preset');
    const display = document.getElementById('health-matrix-display');
    if (!select || !display) return;

    const presetId = select.value;
    display.innerHTML = '<div style="color: #6ee7b7; font-family: monospace; text-align: center; padding: 30px;">⏳ Memindai kesehatan Caddy, PM2 workers, dan sistem...</div>';

    fetch('/api/server-health?id=' + encodeURIComponent(presetId))
    .then(r => r.json())
    .then(res => {
        if (!res.success) {
            display.innerHTML = `<div style="color: #f87171; text-align: center; padding: 30px;">❌ Gagal memuat diagnosa health: ${res.message}</div>`;
            return;
        }

        const caddy = res.caddy || {};
        const workers = res.pm2_workers || [];
        const ram = res.ram || {};
        const disk = res.disk || {};

        let html = '';

        // SECTION 1: SYSTEM RESOURCES & CADDY PROXY SUMMARY
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">';

        // Caddy Card
        const caddyBadge = caddy.active ? '<span class="badge badge-success">● RUNNING</span>' : '<span class="badge badge-error">🔴 DOWN</span>';
        html += `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="font-weight: 700; font-size: 15px; color: #fff;">🛡️ Reverse Proxy Caddy</div>
                    ${caddyBadge}
                </div>
                <div style="font-size: 12px; color: var(--text-muted); line-height: 1.6;">
                    <div>Port Listener: ${caddy.ports_bound ? '✅ Port 80 & 443' : '⚠️ Tidak Terdeteksi'}</div>
                    <div>Health API Backend: ${res.backend_http_code === '200' ? '<span style="color:#34d399;">HTTP 200 OK</span>' : `<span style="color:#fbbf24;">Code ${res.backend_http_code}</span>`}</div>
                </div>
            </div>
        `;

        // RAM & Memory Card
        const ramPct = ram.total_mb > 0 ? Math.round((ram.used_mb / ram.total_mb) * 100) : 0;
        html += `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="font-weight: 700; font-size: 15px; color: #fff;">💾 Memory RAM</div>
                    <span class="badge badge-info">${ramPct}% Used</span>
                </div>
                <div style="font-size: 12px; color: var(--text-muted); line-height: 1.6;">
                    <div>Total RAM: ${ram.total_mb || '-'} MB</div>
                    <div>Terpakai: ${ram.used_mb || '-'} MB (Bebas: ${ram.free_mb || '-'} MB)</div>
                </div>
            </div>
        `;

        // Disk Storage Card
        html += `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div style="font-weight: 700; font-size: 15px; color: #fff;">💽 Disk Storage (Root)</div>
                    <span class="badge badge-info">${disk.usage_pct || '0%'} Used</span>
                </div>
                <div style="font-size: 12px; color: var(--text-muted); line-height: 1.6;">
                    <div>Penggunaan Disk Root: ${disk.usage_pct || '0%'}</div>
                    <div>Status Media: <span style="color:#34d399;">Healthy</span></div>
                </div>
            </div>
        `;

        html += '</div>'; // end grid

        // SECTION 2: PM2 PROCESSES HEALTH MATRIX TABLE
        html += `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px; margin-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div>
                        <h3 style="font-size: 16px; font-weight: 700; color: #fff; margin: 0;">⚙️ Matrix PM2 Worker Processes (${workers.length} Layanan)</h3>
                        <p style="font-size: 12px; color: var(--text-muted); margin: 4px 0 0 0;">Status kesehatan real-time seluruh worker backend/frontend PM2</p>
                    </div>
                </div>
        `;

        if (workers.length === 0) {
            html += '<div style="color: var(--text-muted); text-align: center; padding: 20px;">Tidak ada proses PM2 yang berjalan di server ini.</div>';
        } else {
            html += `
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--glass-border); color: var(--text-muted); font-size: 11px; text-transform: uppercase;">
                                <th style="padding: 10px;">Nama Worker</th>
                                <th style="padding: 10px;">ID</th>
                                <th style="padding: 10px;">Status</th>
                                <th style="padding: 10px;">CPU %</th>
                                <th style="padding: 10px;">Memory (RAM)</th>
                                <th style="padding: 10px;">Restarts</th>
                                <th style="padding: 10px;">Uptime</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            workers.forEach(w => {
                const isOnline = w.status === 'online';
                const statusBadge = isOnline ? '<span style="background: rgba(16,185,129,0.2); color: #34d399; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">🟢 ONLINE</span>' :
                                    w.status === 'stopped' ? '<span style="background: rgba(239,68,68,0.2); color: #f87171; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">🔴 STOPPED</span>' :
                                    '<span style="background: rgba(251,191,36,0.2); color: #fbbf24; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">🟡 ' + (w.status || 'ERROR').toUpperCase() + '</span>';

                let uptimeStr = '-';
                if (w.uptime_sec > 0) {
                    const hrs = Math.floor(w.uptime_sec / 3600);
                    const mins = Math.floor((w.uptime_sec % 3600) / 60);
                    uptimeStr = `${hrs}j ${mins}m`;
                }

                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 12px 10px; font-weight: 600; color: #fff;">${w.name}</td>
                        <td style="padding: 12px 10px; color: var(--text-muted); font-family: monospace;">#${w.pm_id}</td>
                        <td style="padding: 12px 10px;">${statusBadge}</td>
                        <td style="padding: 12px 10px; font-family: monospace;">${w.cpu_percent}%</td>
                        <td style="padding: 12px 10px; font-family: monospace; color: #a78bfa;">${w.memory_mb} MB</td>
                        <td style="padding: 12px 10px; font-family: monospace; color: ${w.restarts > 5 ? '#f87171' : 'inherit'};">${w.restarts}x</td>
                        <td style="padding: 12px 10px; color: var(--text-muted);">${uptimeStr}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }

        html += '</div>';

        display.innerHTML = html;
    })
    .catch(err => {
        display.innerHTML = `<div style="color: #f87171; text-align: center; padding: 30px;">❌ Error koneksi: ${err.message}</div>`;
    });
}
