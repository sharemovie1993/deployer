// public/js/health.js - System & Worker Health Matrix UI for IT Admins

function populateHealthPresetDropdown(callback) {
    const select = document.getElementById('health-target-preset');
    if (!select) return;

    const renderSelectOptions = (presets) => {
        const currentValue = select.value;
        let html = '<option value="local">💻 Server Windows Lokal (Localhost)</option>';
        if (Array.isArray(presets) && presets.length > 0) {
            presets.forEach(p => {
                const pName = p.name || ('Server ' + p.vpsIp);
                const projLabel = p.project === 'licensing' ? '[Server Lisensi]' : '[Project Absenta]';
                html += `<option value="${p.id}">🌐 ${pName} (${p.vpsIp}) ${projLabel}</option>`;
            });
        }
        select.innerHTML = html;
        if (currentValue) select.value = currentValue;
        if (typeof callback === 'function') callback();
    };

    if (typeof globalPresets !== 'undefined' && Array.isArray(globalPresets) && globalPresets.length > 0) {
        renderSelectOptions(globalPresets);
    } else {
        fetch('/api/presets')
        .then(res => res.json())
        .then(res => {
            if (res.success && res.data) {
                if (typeof globalPresets !== 'undefined') {
                    globalPresets = res.data;
                }
                renderSelectOptions(res.data);
            } else {
                renderSelectOptions([]);
            }
        })
        .catch(() => renderSelectOptions([]));
    }
}

function renderSvgDonut(percent, color, size = 95, strokeWidth = 9, label = '', sublabel = '') {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

    return `
        <div style="position: relative; width: ${size}px; height: ${size}px; margin: 0 auto;">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);">
                <circle cx="${size/2}" cy="${size/2}" r="${radius}" stroke="rgba(255,255,255,0.06)" stroke-width="${strokeWidth}" fill="transparent" />
                <circle cx="${size/2}" cy="${size/2}" r="${radius}" stroke="${color}" stroke-width="${strokeWidth}" fill="transparent"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" style="transition: stroke-dashoffset 0.8s ease;" />
            </svg>
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
                <div style="font-size: 15px; font-weight: 800; color: #fff; line-height: 1.1;">${percent}%</div>
                ${label ? `<div style="font-size: 9px; font-weight: 600; color: var(--text-muted); margin-top: 2px;">${label}</div>` : ''}
                ${sublabel ? `<div style="font-size: 8px; color: rgba(255,255,255,0.5);">${sublabel}</div>` : ''}
            </div>
        </div>
    `;
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
        const cpu = res.cpu || {};

        let html = '';

        // Calculate Worker Online Rate %
        const onlineWorkersCount = workers.filter(w => w.status === 'online').length;
        const workerHealthPct = workers.length > 0 ? Math.round((onlineWorkersCount / workers.length) * 100) : 100;

        // RAM, Disk, & CPU %
        const ramPct = ram.total_mb > 0 ? Math.round((ram.used_mb / ram.total_mb) * 100) : 0;
        const diskPct = parseInt(disk.usage_pct || '0', 10);
        const cpuPct = Math.min(100, Math.max(0, cpu.usage_pct || 0));

        // SECTION 1: VISUAL DONUT & PIE CHARTS MINI GRID (1 ROW 5 COLUMNS)
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px;">';

        // 1. Worker Health Donut Chart
        const workerColor = workerHealthPct === 100 ? '#34d399' : workerHealthPct > 70 ? '#fbbf24' : '#f87171';
        html += `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 14px; padding: 14px 10px; text-align: center; display: flex; flex-direction: column; justify-content: space-between;">
                <div style="font-weight: 700; font-size: 12.5px; color: #fff; margin-bottom: 8px;">⚙️ Worker Services</div>
                ${renderSvgDonut(workerHealthPct, workerColor, 95, 9, `${onlineWorkersCount}/${workers.length} Online`)}
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 8px;">
                    Worker PM2 Daemon
                </div>
            </div>
        `;

        // 2. Total CPU Usage Donut Chart
        const cpuColor = cpuPct < 60 ? '#f59e0b' : cpuPct < 85 ? '#fbbf24' : '#f87171';
        html += `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 14px; padding: 14px 10px; text-align: center; display: flex; flex-direction: column; justify-content: space-between;">
                <div style="font-weight: 700; font-size: 12.5px; color: #fff; margin-bottom: 8px;">⚡ Total CPU Load</div>
                ${renderSvgDonut(cpuPct, cpuColor, 95, 9, `${cpuPct}% CPU`, 'Processor')}
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 8px;">
                    Beban System
                </div>
            </div>
        `;

        // 3. RAM Memory Donut Chart
        const ramColor = ramPct < 70 ? '#60a5fa' : ramPct < 90 ? '#fbbf24' : '#f87171';
        html += `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 14px; padding: 14px 10px; text-align: center; display: flex; flex-direction: column; justify-content: space-between;">
                <div style="font-weight: 700; font-size: 12.5px; color: #fff; margin-bottom: 8px;">💾 RAM Memory</div>
                ${renderSvgDonut(ramPct, ramColor, 95, 9, `${ram.used_mb || 0} MB`, `Bebas: ${ram.free_mb || 0} MB`)}
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 8px;">
                    Total: ${ram.total_mb || 0} MB
                </div>
            </div>
        `;

        // 4. Disk Storage Donut Chart
        const diskColor = diskPct < 75 ? '#a78bfa' : diskPct < 90 ? '#fbbf24' : '#f87171';
        html += `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 14px; padding: 14px 10px; text-align: center; display: flex; flex-direction: column; justify-content: space-between;">
                <div style="font-weight: 700; font-size: 12.5px; color: #fff; margin-bottom: 8px;">💽 Disk Root</div>
                ${renderSvgDonut(diskPct, diskColor, 95, 9, `${diskPct}% Terpakai`, 'Partisi Root')}
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 8px;">
                    Status: <span style="color:#34d399; font-weight: 600;">Healthy</span>
                </div>
            </div>
        `;

        // 5. Reverse Proxy Caddy Control Card
        const caddyBadge = caddy.active ? '<span class="badge badge-success" style="font-size:10px; padding: 2px 6px;">● RUNNING</span>' : '<span class="badge badge-error" style="font-size:10px; padding: 2px 6px;">🔴 DOWN</span>';
        html += `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 14px; padding: 14px 10px; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-weight: 700; font-size: 12.5px; color: #fff;">🛡️ Proxy Caddy</div>
                        ${caddyBadge}
                    </div>
                    <div style="font-size: 10.5px; color: var(--text-muted); line-height: 1.5; margin-bottom: 8px;">
                        <div>Listener: ${caddy.ports_bound ? '<span style="color:#34d399;">✅ 80 & 443</span>' : '<span style="color:#fbbf24;">⚠️ Active</span>'}</div>
                        <div>Health API: ${res.backend_http_code === '200' ? '<span style="color:#34d399;">HTTP 200</span>' : `<span style="color:#fbbf24;">Code ${res.backend_http_code}</span>`}</div>
                    </div>
                </div>
                <button class="btn btn-secondary" style="width: 100%; justify-content: center; padding: 5px 8px; font-size: 10.5px; border-color: rgba(52,211,153,0.4); color: #34d399;" onclick="restartServiceUI('caddy')">🔄 Restart Caddy</button>
            </div>
        `;

        html += '</div>'; // end top grid

          // SECTION 2: WORKER MEMORY ALLOCATION BAR GRAPH CHART
        if (workers.length > 0) {
            const totalRamMb = ram.total_mb > 0 ? ram.total_mb : 11921;
            const maxScaleMb = Math.max(1500, Math.max(...workers.map(w => w.memory_mb || 0)));

            html += `
                <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px; margin-top: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <h3 style="font-size: 15px; font-weight: 700; color: #fff; margin: 0;">📊 Alokasi Memori RAM Worker</h3>
                            <p style="font-size: 11.5px; color: var(--text-muted); margin: 2px 0 0 0;">Skala Batas Aman Process: ${maxScaleMb} MB | Total RAM Server: ${totalRamMb} MB</p>
                        </div>
                        <div style="font-size: 11px; display: flex; gap: 12px; flex-wrap: wrap;">
                            <span style="color: #34d399;">🟢 Normal (&lt;500MB)</span>
                            <span style="color: #fbbf24;">🟡 Warning (&gt;500MB)</span>
                            <span style="color: #f87171;">🔴 High (&gt;1000MB)</span>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
            `;

            workers.forEach(w => {
                const memMb = w.memory_mb || 0;
                const barWidthPct = Math.min(100, Math.round((memMb / maxScaleMb) * 100));
                const sysRamPct = (Math.round((memMb / totalRamMb) * 1000) / 10).toFixed(1);

                let statusDot = '🟢';
                let barColor = '#34d399';
                if (memMb > 1000) {
                    statusDot = '🔴';
                    barColor = '#f87171';
                } else if (memMb > 500) {
                    statusDot = '🟡';
                    barColor = '#fbbf24';
                } else {
                    barColor = w.name.includes('redis') ? '#34d399' : w.name.includes('wa') ? '#a78bfa' : w.name.includes('web') ? '#fbbf24' : '#60a5fa';
                }

                html += `
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                            <span style="color: #fff; font-weight: 600;">${w.name} <span style="color: var(--text-muted); font-size: 11px;">(#${w.pm_id})</span></span>
                            <span style="font-family: monospace; font-weight: 600;">
                                <span style="color: #fff;">${memMb} MB</span> 
                                <span style="color: var(--text-muted); font-weight: 400; font-size: 11px;">(${sysRamPct}%)</span>
                                &nbsp;${statusDot}
                            </span>
                        </div>
                        <div style="background: rgba(255,255,255,0.06); height: 8px; border-radius: 4px; overflow: hidden;">
                            <div style="width: ${barWidthPct}%; background: ${barColor}; height: 100%; border-radius: 4px; transition: width 0.6s ease;"></div>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        }

        // SECTION 2: PM2 PROCESSES HEALTH MATRIX TABLE
        html += `
            <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px; margin-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h3 style="font-size: 16px; font-weight: 700; color: #fff; margin: 0;">⚙️ Matrix PM2 Worker Processes (${workers.length} Layanan)</h3>
                        <p style="font-size: 12px; color: var(--text-muted); margin: 4px 0 0 0;">Status kesehatan real-time seluruh worker backend/frontend PM2</p>
                    </div>
                    <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 12px; border-color: rgba(167,139,250,0.4); color: #a78bfa;" onclick="restartServiceUI('all')">⚡ Restart Semua Worker PM2</button>
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
                                <th style="padding: 10px; text-align: right;">Aksi IT Admin</th>
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
                    const sec = w.uptime_sec;
                    if (sec < 60) {
                        uptimeStr = `${sec} detik`;
                    } else if (sec < 3600) {
                        const mins = Math.floor(sec / 60);
                        const secs = sec % 60;
                        uptimeStr = `${mins} mnt ${secs} dtk`;
                    } else if (sec < 86400) {
                        const hrs = Math.floor(sec / 3600);
                        const mins = Math.floor((sec % 3600) / 60);
                        uptimeStr = `${hrs} jam ${mins} mnt`;
                    } else {
                        const days = Math.floor(sec / 86400);
                        const hrs = Math.floor((sec % 86400) / 3600);
                        uptimeStr = `${days} hari ${hrs} jam`;
                    }
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
                        <td style="padding: 12px 10px; text-align: right;">
                            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="restartServiceUI('${w.name}')">🔄 Restart</button>
                        </td>
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

function restartServiceUI(serviceName) {
    const select = document.getElementById('health-target-preset');
    if (!select) return;
    const presetId = select.value;

    if (!confirm(`Apakah Anda yakin ingin melakukan restart layanan '${serviceName}' pada server ini?`)) return;

    const display = document.getElementById('health-matrix-display');
    if (display) display.innerHTML = `<div style="color: #fbbf24; font-family: monospace; text-align: center; padding: 30px;">⏳ Melakukan restart layanan '${serviceName}'...</div>`;

    fetch('/api/restart-service?id=' + encodeURIComponent(presetId) + '&service=' + encodeURIComponent(serviceName))
    .then(r => r.json())
    .then(res => {
        if (res.success) {
            alert(`✅ ${res.message}`);
            refreshHealthMatrixUI();
        } else {
            alert(`❌ Gagal restart: ${res.message}`);
            refreshHealthMatrixUI();
        }
    })
    .catch(err => {
        alert('❌ Error koneksi: ' + err.message);
        refreshHealthMatrixUI();
    });
}
