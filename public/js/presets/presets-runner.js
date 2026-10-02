// =============================================================================
// ABSENTA DEPLOYER - PRESETS RUNNER & BATCH ORCHESTRATION MODULE
// Menangani eksekusi SSE update, seed wilayah, watchdog status, fix tunnels, domain & tuning stream.
// =============================================================================

function runQuickUpdatePreset(presetId) {
    const p = (window.globalPresets || []).find(item => item.id === presetId);
    if (!p) return;

    window.activePresetId = presetId;

    const wdPanel = document.getElementById('watchdog-panel-' + presetId);
    if (wdPanel) wdPanel.style.display = 'none';

    const consoleSection = document.getElementById('quick-update-console-section');
    const title = document.getElementById('quick-update-target-title');
    const statusBadge = document.getElementById('quick-update-status-badge');
    const timerBadge = document.getElementById('quick-update-timer');
    const progressBar = document.getElementById('quick-progress-fill');
    const percentText = document.getElementById('quick-progress-percent');
    const statusText = document.getElementById('quick-progress-status');
    const consoleContainer = document.getElementById('quick-terminal-logs');

    if (!consoleSection) return;

    if (window.quickUpdateTimerInterval) {
        clearInterval(window.quickUpdateTimerInterval);
    }
    const updateStartTime = Date.now();
    
    function formatDuration(ms) {
        const totalSecs = Math.floor(ms / 1000);
        if (totalSecs < 60) return totalSecs + ' Detik';
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return mins + ' Menit ' + secs + ' Detik';
    }

    function formatDurationShort(ms) {
        const totalSecs = Math.floor(ms / 1000);
        if (totalSecs < 60) return totalSecs + 's';
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return mins + 'm ' + secs + 's';
    }

    if (timerBadge) {
        timerBadge.style.display = 'inline-block';
        timerBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        timerBadge.style.color = '#34d399';
        timerBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        timerBadge.innerHTML = '⏱️ 0s';
    }

    window.quickUpdateTimerInterval = setInterval(() => {
        const elapsed = Date.now() - updateStartTime;
        if (timerBadge) {
            timerBadge.innerHTML = '⏱️ ' + formatDurationShort(elapsed);
        }
    }, 1000);

    consoleSection.style.display = 'block';
    title.innerHTML = '⚡ Sedang Melakukan Quick Update: ' + p.name + ' (' + p.vpsIp + ')';
    statusBadge.className = 'badge badge-purple';
    statusBadge.innerHTML = 'Memproses...';
    
    progressBar.style.width = '5%';
    percentText.innerHTML = '5%';
    statusText.innerHTML = 'Menghubungkan via SSH...';
    consoleContainer.innerHTML = '>> Memulai aliran log Quick Update remote untuk ' + p.vpsIp + '...\n';

    if (window.currentQuickUpdateEventSource) {
        window.currentQuickUpdateEventSource.close();
    }
    const eventSource = new EventSource('/api/stream-quick-update?id=' + encodeURIComponent(presetId));
    window.currentQuickUpdateEventSource = eventSource;

    eventSource.onmessage = function(event) {
        const line = event.data;

        if (line === '[UPDATE_COMPLETE]') {
            eventSource.close();
            window.currentQuickUpdateEventSource = null;
            if (window.quickUpdateTimerInterval) {
                clearInterval(window.quickUpdateTimerInterval);
            }
            const totalElapsed = Date.now() - updateStartTime;
            const durationFormatted = formatDuration(totalElapsed);
            const durationShort = formatDurationShort(totalElapsed);

            progressBar.style.width = '100%';
            percentText.innerHTML = '100%';
            statusText.innerHTML = 'Quick Update Selesai Sukses dalam ' + durationFormatted + '! 🎉';
            statusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
            statusBadge.style.color = '#34d399';
            statusBadge.innerHTML = '✅ Sukses';

            if (timerBadge) {
                timerBadge.style.background = 'rgba(16, 185, 129, 0.25)';
                timerBadge.innerHTML = '⏱️ Selesai (' + durationShort + ')';
            }
            
            const span = document.createElement('span');
            span.style.color = 'var(--success)';
            span.style.fontWeight = 'bold';
            span.appendChild(document.createTextNode('\n=============================================\n  QUICK UPDATE SELESAI SAKSES! (Durasi: ' + durationFormatted + ')\n=============================================\n'));
            consoleContainer.appendChild(span);
            consoleContainer.scrollTop = consoleContainer.scrollHeight;
            return;
        }

        if (line.startsWith('[UPDATE_FAILED]')) {
            eventSource.close();
            if (window.quickUpdateTimerInterval) {
                clearInterval(window.quickUpdateTimerInterval);
            }
            const totalElapsed = Date.now() - updateStartTime;
            const durationFormatted = formatDuration(totalElapsed);

            statusText.innerHTML = 'Quick Update Gagal setelah ' + durationFormatted + '! ❌';
            statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
            statusBadge.style.color = '#f87171';
            statusBadge.innerHTML = '❌ Gagal';

            if (timerBadge) {
                timerBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                timerBadge.style.color = '#f87171';
                timerBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                timerBadge.innerHTML = '⏱️ Gagal';
            }
            
            const span = document.createElement('span');
            span.style.color = 'var(--error)';
            span.appendChild(document.createTextNode('\n[ERROR] ' + line + ' (Total Waktu: ' + durationFormatted + ')\n'));
            consoleContainer.appendChild(span);
            consoleContainer.scrollTop = consoleContainer.scrollHeight;
            return;
        }

        const isError = line.startsWith('[ERROR]');
        const span = document.createElement('span');
        if (isError) span.style.color = 'var(--error)';
        span.appendChild(document.createTextNode(line + '\n'));
        consoleContainer.appendChild(span);
        consoleContainer.scrollTop = consoleContainer.scrollHeight;

        if (line.includes('Local Build Mode') || line.includes('[1/5]') || line.includes('Git pull')) {
            progressBar.style.width = '10%';
            percentText.innerHTML = '10%';
            statusText.innerHTML = 'Git pull kode terbaru di lokal...';
        } else if (line.includes('[2/5]') || line.includes('npm install lokal')) {
            progressBar.style.width = '25%';
            percentText.innerHTML = '25%';
            statusText.innerHTML = 'npm install lokal...';
        } else if (line.includes('[3/5]') || line.includes('Prisma generate lokal')) {
            progressBar.style.width = '40%';
            percentText.innerHTML = '40%';
            statusText.innerHTML = 'Prisma generate lokal...';
        } else if (line.includes('[4/5]') || line.includes('Kompilasi TypeScript lokal')) {
            progressBar.style.width = '55%';
            percentText.innerHTML = '55%';
            statusText.innerHTML = '🔨 Kompilasi TypeScript di PC lokal...';
        } else if (line.includes('[5/5]') || line.includes('Upload dist/')) {
            progressBar.style.width = '72%';
            percentText.innerHTML = '72%';
            statusText.innerHTML = '📤 Upload dist/ ke VPS via SCP...';
        } else if (line.includes('Finalisasi di VPS') || line.includes('npm install (production')) {
            progressBar.style.width = '85%';
            percentText.innerHTML = '85%';
            statusText.innerHTML = 'Finalisasi ringan di VPS...';
        } else if (line.includes('Backend') || line.includes('Memproses Backend')) {
            progressBar.style.width = '35%';
            percentText.innerHTML = '35%';
            statusText.innerHTML = 'Memproses & Kompilasi Backend...';
        } else if (line.includes('Frontend') || line.includes('Memproses Frontend')) {
            progressBar.style.width = '65%';
            percentText.innerHTML = '65%';
            statusText.innerHTML = 'Memproses & Build Frontend...';
        } else if (line.includes('Watchdog') || line.includes('watchdog')) {
            progressBar.style.width = '88%';
            percentText.innerHTML = '88%';
            statusText.innerHTML = 'Memasang Watchdog Auto-Recovery...';
        } else if (line.includes('PM2') || line.includes('ecosystem')) {
            progressBar.style.width = '80%';
            percentText.innerHTML = '80%';
            statusText.innerHTML = 'Memuat Ulang PM2 & Restart Services...';
        }
    };

    eventSource.onerror = function(err) {
        eventSource.close();
        if (window.quickUpdateTimerInterval) {
            clearInterval(window.quickUpdateTimerInterval);
        }
        statusText.innerHTML = 'Koneksi stream terputus.';
        console.log('SSE Quick Update Error:', err);
    };

    consoleSection.scrollIntoView({ behavior: 'smooth' });
}

function runSeedWilayahPreset(presetId) {
    window.activePresetId = presetId;
    const p = (window.globalPresets || []).find(item => item.id === presetId);
    if (!p) {
        alert('Preset tidak ditemukan!');
        return;
    }

    if (!confirm(`Apakah Anda yakin ingin memicu Seeder Full Wilayah Indonesia (~91.600 Record) ke server ${p.name} (${p.vpsIp})?`)) {
        return;
    }

    const consoleSection = document.getElementById('quick-update-console-section');
    const title = document.getElementById('quick-update-target-title');
    const statusBadge = document.getElementById('quick-update-status-badge');
    const progressBar = document.getElementById('quick-progress-fill');
    const percentText = document.getElementById('quick-progress-percent');
    const statusText = document.getElementById('quick-progress-status');
    const consoleContainer = document.getElementById('quick-terminal-logs');
    const timerBadge = document.getElementById('quick-update-timer');

    if (!consoleSection || !consoleContainer) return;

    if (window.quickUpdateTimerInterval) {
        clearInterval(window.quickUpdateTimerInterval);
    }
    const updateStartTime = Date.now();
    if (timerBadge) {
        timerBadge.style.display = 'inline-block';
        timerBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        timerBadge.style.color = '#6ee7b7';
        timerBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        timerBadge.innerHTML = '⏱️ 0s';
    }
    window.quickUpdateTimerInterval = setInterval(() => {
        const elapsed = Date.now() - updateStartTime;
        if (timerBadge) {
            timerBadge.innerHTML = '⏱️ ' + formatDurationShort(elapsed);
        }
    }, 1000);

    consoleSection.style.display = 'block';
    title.innerHTML = '🌐 Sedang Melakukan Seeder Full Wilayah: ' + p.name + ' (' + p.vpsIp + ')';
    statusBadge.className = 'badge badge-purple';
    statusBadge.innerHTML = 'Memproses Seeder...';
    
    progressBar.style.width = '5%';
    percentText.innerHTML = '5%';
    statusText.innerHTML = 'Menghubungkan via SSH ke VPS...';
    consoleContainer.innerHTML = '>> Memulai aliran log Seeder Full Wilayah remote untuk ' + p.vpsIp + '...\n';

    if (window.currentQuickUpdateEventSource) {
        window.currentQuickUpdateEventSource.close();
    }
    const eventSource = new EventSource('/api/stream-seed-wilayah?id=' + encodeURIComponent(presetId));
    window.currentQuickUpdateEventSource = eventSource;

    let isSeederFinished = false;

    eventSource.onmessage = function(event) {
        const line = event.data;

        if (line.includes('[SEED_COMPLETE]') || line.includes('SELESAI SUKSES') || line.includes('Seed selesai!')) {
            isSeederFinished = true;
            eventSource.close();
            window.currentQuickUpdateEventSource = null;
            if (window.quickUpdateTimerInterval) {
                clearInterval(window.quickUpdateTimerInterval);
            }
            const totalElapsed = Date.now() - updateStartTime;
            const durationFormatted = formatDuration(totalElapsed);
            const durationShort = formatDurationShort(totalElapsed);

            progressBar.style.width = '100%';
            percentText.innerHTML = '100%';
            statusText.innerHTML = 'Seeder Full Wilayah Indonesia Selesai Sukses dalam ' + durationFormatted + '! 🎉';
            statusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
            statusBadge.style.color = '#34d399';
            statusBadge.innerHTML = '✅ Sukses';

            if (timerBadge) {
                timerBadge.style.background = 'rgba(16, 185, 129, 0.25)';
                timerBadge.innerHTML = '⏱️ Selesai (' + durationShort + ')';
            }
            
            const span = document.createElement('span');
            span.style.color = 'var(--success)';
            span.style.fontWeight = 'bold';
            span.appendChild(document.createTextNode('\n=============================================\n  SEEDER FULL WILAYAH INDONESIA SELESAI SAKSES! (Durasi: ' + durationFormatted + ')\n=============================================\n'));
            consoleContainer.appendChild(span);
            consoleContainer.scrollTop = consoleContainer.scrollHeight;
            return;
        }

        if (line.startsWith('[SEED_FAILED]')) {
            isSeederFinished = true;
            eventSource.close();
            if (window.quickUpdateTimerInterval) {
                clearInterval(window.quickUpdateTimerInterval);
            }
            const totalElapsed = Date.now() - updateStartTime;
            const durationFormatted = formatDuration(totalElapsed);

            statusText.innerHTML = 'Seeder Wilayah Gagal setelah ' + durationFormatted + '! ❌';
            statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
            statusBadge.style.color = '#f87171';
            statusBadge.innerHTML = '❌ Gagal';

            if (timerBadge) {
                timerBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                timerBadge.style.color = '#f87171';
                timerBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                timerBadge.innerHTML = '⏱️ Gagal';
            }
            
            const span = document.createElement('span');
            span.style.color = 'var(--error)';
            span.appendChild(document.createTextNode('\n[ERROR] ' + line + ' (Total Waktu: ' + durationFormatted + ')\n'));
            consoleContainer.appendChild(span);
            consoleContainer.scrollTop = consoleContainer.scrollHeight;
            return;
        }

        const div = document.createElement('div');
        if (line.includes('1/4 Memproses Data Provinsi') || line.includes('Policy Engine')) {
            div.style.color = '#6ee7b7';
            div.style.fontWeight = 'bold';
            progressBar.style.width = '25%';
            percentText.innerHTML = '25%';
            statusText.innerHTML = 'Memproses Data Baseline & Provinsi...';
        } else if (line.includes('2/4 Memproses Data Kabupaten') || line.includes('Global System Config')) {
            div.style.color = '#6ee7b7';
            div.style.fontWeight = 'bold';
            progressBar.style.width = '50%';
            percentText.innerHTML = '50%';
            statusText.innerHTML = 'Memproses Data Kabupaten/Kota...';
        } else if (line.includes('3/4 Memproses Data Kecamatan') || line.includes('Seeding Global Mapel')) {
            div.style.color = '#6ee7b7';
            div.style.fontWeight = 'bold';
            progressBar.style.width = '75%';
            percentText.innerHTML = '75%';
            statusText.innerHTML = 'Memproses Data Kecamatan...';
        } else if (line.includes('4/4 Memproses Data Kelurahan') || line.includes('Global Topik')) {
            div.style.color = '#6ee7b7';
            div.style.fontWeight = 'bold';
            progressBar.style.width = '90%';
            percentText.innerHTML = '90%';
            statusText.innerHTML = 'Memproses Data Kelurahan/Desa...';
        } else if (line.includes('Memulai Remote Full') || line.includes('Mengunggah script')) {
            progressBar.style.width = '15%';
            percentText.innerHTML = '15%';
            statusText.innerHTML = 'Menghubungkan & Mengirim Script SSH...';
        } else if (line.startsWith('[ERROR]')) {
            div.style.color = '#f87171';
        } else if (line.includes('✅')) {
            div.style.color = '#34d399';
            div.style.fontWeight = 'bold';
        } else {
            div.style.color = 'var(--text-main)';
        }

        div.appendChild(document.createTextNode(line));
        consoleContainer.appendChild(div);
        consoleContainer.scrollTop = consoleContainer.scrollHeight;
    };

    eventSource.onerror = function(err) {
        eventSource.close();
        if (window.quickUpdateTimerInterval) {
            clearInterval(window.quickUpdateTimerInterval);
        }
        if (!isSeederFinished) {
            statusText.innerHTML = '⚡ Seeder Berjalan di Background VPS (Memproses data kecamatan & desa...';
            statusBadge.style.background = 'rgba(167, 139, 250, 0.2)';
            statusBadge.style.color = '#a78bfa';
            statusBadge.innerHTML = '⏳ Memproses...';
        }
        console.log('SSE Seeder Status:', err);
    };

    consoleSection.scrollIntoView({ behavior: 'smooth' });
}

function checkWatchdogStatus(presetId) {
    window.activePresetId = presetId;
    const panel = document.getElementById('watchdog-panel-' + presetId);
    const content = document.getElementById('watchdog-content-' + presetId);
    const btn = document.getElementById('watchdog-btn-' + presetId);
    if (!panel || !content) return;

    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        btn.innerHTML = '🛡️ Cek Status Watchdog';
        return;
    }

    panel.style.display = 'block';
    btn.innerHTML = '⏳ Mengambil status...';
    btn.disabled = true;
    content.innerHTML = '<span style="color: #a78bfa;">⏳ Menghubungkan ke server via SSH...</span>';

    fetch('/api/watchdog-status?id=' + encodeURIComponent(presetId))
    .then(r => r.json())
    .then(res => {
        btn.innerHTML = '🔄 Refresh Status';
        btn.disabled = false;

        if (!res.success) {
            const offline = res.offline;
            content.innerHTML = '<div style="color: #f87171;">❌ ' + (offline ? 'Server offline / SSH gagal' : res.message) + '</div>';
            return;
        }

        const d = res.data;
        const wgOk = d.wg_status === 'UP';
        const caddyOk = d.caddy === 'active';
        const pm2Ok = d.pm2 === 'running';
        const timerOk = d.timer === 'active';

        const dot = (ok) => '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (ok ? '#10b981' : '#ef4444') + ';margin-right:6px;"></span>';
        const badge = (ok, yes, no) => '<span style="font-weight:600;color:' + (ok ? '#34d399' : '#f87171') + ';">' + (ok ? yes : no) + '</span>';

        const logs = d.last_log
            ? d.last_log.split('|').filter(l => l.trim()).slice(-4).map(l =>
                '<div style="font-family:\'Fira Code\',monospace;font-size:11px;color:' +
                (l.includes('⚠️') || l.includes('❌') ? '#fbbf24' : '#6ee7b7') +
                ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
                l.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
            ).join('')
            : '<div style="color:var(--text-muted);font-size:11px;">Belum ada log</div>';

        const ipList = d.all_ips
            ? d.all_ips.split(',').filter(Boolean).map(item => {
                const parts = item.split('=>');
                const iface = parts[0] || '';
                const ipAddr = parts[1] || '';
                const isWg = iface.startsWith('et-') || iface.startsWith('wg');
                const icon = iface === 'lo' ? '🏠' : (isWg ? '🔒' : '🌐');
                const color = isWg ? '#a78bfa' : '#38bdf8';
                const removeBtn = (iface.startsWith('et-') || iface.startsWith('wg'))
                    ? '<button onclick="removeSelectedTunnelPreset(\'' + presetId + '\', \'' + iface + '\')" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.35);padding:1px 6px;border-radius:4px;font-size:10px;font-weight:bold;cursor:pointer;margin-left:6px;" title="Copot & Mematikan interface WireGuard ' + iface + '">🔌 Copot</button>'
                    : '';
                return '<div style="font-family:\'Fira Code\',monospace;font-size:11.5px;display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px dashed rgba(255,255,255,0.05);">' +
                    '<span style="color:' + color + ';font-weight:600;">' + icon + ' ' + iface + '</span>' +
                    '<div style="display:flex;align-items:center;">' +
                        '<span style="color:#6ee7b7;font-weight:500;">' + ipAddr + '</span>' +
                        removeBtn +
                    '</div>' +
                '</div>';
            }).join('')
            : '<div style="font-size:11px;color:var(--text-muted);">Tidak ada IP terdeteksi</div>';

        const minioOk = d.minio === 'active';
        const minioPortOk = d.minio_port && d.minio_port.includes('ONLINE');
        const coturnOk = d.coturn === 'active';
        const coturnPortOk = d.coturn_port && d.coturn_port.includes('ONLINE');

        content.innerHTML =
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' +
                '<div>' + dot(wgOk) + 'WireGuard: ' + badge(wgOk, 'UP', 'DOWN') + '</div>' +
                '<div>' + dot(caddyOk) + 'Caddy: ' + badge(caddyOk, 'active', 'mati') + '</div>' +
                '<div>' + dot(pm2Ok) + 'PM2: ' + badge(pm2Ok, 'running', 'mati') + '</div>' +
                '<div>' + dot(timerOk) + 'Watchdog: ' + badge(timerOk, 'aktif', 'belum pasang') + '</div>' +
            '</div>' +
            '<div style="margin-bottom:8px;background:rgba(16,185,129,0.08);padding:7px 10px;border-radius:8px;border:1px solid rgba(16,185,129,0.25);display:flex;justify-content:space-between;align-items:center;font-size:12px;">' +
                '<span>📦 <strong>MinIO S3 Storage</strong>: ' + badge(minioOk, 'Active (Systemd)', 'Inactive (Mati)') + '</span>' +
                '<span style="font-size:11px;font-weight:bold;color:' + (minioPortOk ? '#34d399' : '#f87171') + ';">' + (d.minio_port || 'OFFLINE') + '</span>' +
            '</div>' +
            '<div style="margin-bottom:10px;background:rgba(14,113,235,0.08);padding:7px 10px;border-radius:8px;border:1px solid rgba(14,113,235,0.25);display:flex;justify-content:space-between;align-items:center;font-size:12px;">' +
                '<span>📹 <strong>Coturn STUN/TURN</strong>: ' + badge(coturnOk, 'Active (Systemd)', 'Inactive (Mati)') + '</span>' +
                '<span style="font-size:11px;font-weight:bold;color:' + (coturnPortOk ? '#38bdf8' : '#f87171') + ';">' + (d.coturn_port || 'OFFLINE') + '</span>' +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:8px 10px;border:1px solid rgba(255,255,255,0.05);margin-bottom:10px;">' +
                '<div style="font-size:11px;font-weight:700;color:#38bdf8;margin-bottom:6px;">🌐 Interface & Alamat IP:</div>' +
                ipList +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:8px 10px;border:1px solid rgba(255,255,255,0.05);margin-bottom:10px;">' +
                '<div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">📋 Log Watchdog Terakhir:</div>' +
                logs +
            '</div>' +
            '<div style="display:flex;gap:6px;margin-top:8px;">' +
                '<button onclick="fixTunnelPreset(\'' + presetId + '\')" class="btn btn-secondary btn-sm" style="flex:1;font-size:11px;">🔧 Auto-Fix /32 Netmask</button>' +
                '<button onclick="auditTunnelPreset(\'' + presetId + '\')" class="btn btn-primary btn-sm" style="flex:1;font-size:11px;">🌐 Audit Lisensi</button>' +
            '</div>';
    })
    .catch(err => {
        btn.innerHTML = '🛡️ Cek Status Watchdog';
        btn.disabled = false;
        content.innerHTML = '<div style="color: #f87171;">❌ Error: ' + err.message + '</div>';
    });
}

function fixTunnelPreset(presetId) {
    const btn = document.getElementById('tunnel-fix-btn-' + presetId);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Memperbaiki...';
    }

    fetch('/api/fix-tunnels?id=' + encodeURIComponent(presetId))
    .then(r => r.json())
    .then(res => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🔧 Perbaiki Tunnel';
        }
        if (res.success) {
            alert('✅ Perbaikan Berhasil!\n\n' + res.message + '\n\nOutput:\n' + (res.output || '').trim());
        } else {
            alert('❌ Perbaikan Gagal:\n\n' + res.message + '\n\nOutput:\n' + (res.output || '').trim());
        }
    })
    .catch(err => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🔧 Perbaiki Tunnel';
        }
        alert('❌ Error koneksi: ' + err.message);
    });
}

function auditTunnelPreset(presetId) {
    window.activePresetId = presetId;
    const btn = document.getElementById('audit-btn-' + presetId);
    const content = document.getElementById('watchdog-content-' + presetId);
    const panel = document.getElementById('watchdog-panel-' + presetId);

    if (panel) panel.style.display = 'block';
    if (btn) {
        btn.disabled = true;
        btn.innerText = '⏳ Auditing...';
    }
    if (content) {
        content.innerHTML = '<div style="color: #6ee7b7; font-family: monospace;">⏳ Memindai interface WireGuard & status lisensi online...</div>';
    }

    fetch('/api/audit-tunnels?id=' + encodeURIComponent(presetId))
    .then(r => r.json())
    .then(res => {
        if (btn) {
            btn.disabled = false;
            btn.innerText = '🌐 Audit Lisensi';
        }
        if (!res.success) {
            if (content) content.innerHTML = '<span style="color: #f87171;">❌ Gagal audit: ' + (res.message || 'Error') + '</span>';
            return;
        }

        let html = '<div style="font-size: 12px; line-height: 1.5;">';
        html += `<div style="margin-bottom: 8px; font-weight: bold; color: #a78bfa;">Terdeteksi ${res.tunnels_count} Terowongan WireGuard di Server ${res.server_ip}:</div>`;

        if (!res.tunnels || res.tunnels.length === 0) {
            html += '<div style="color: var(--text-muted);">Tidak ada interface WireGuard (et-*) yang terpasang di server ini.</div>';
        } else {
            res.tunnels.forEach(t => {
                const isUp = t.is_up;
                const sysEnabled = t.systemd_enabled;
                const lic = t.license_data;
                const isExpired = lic ? lic.expired : false;
                const hsSec = t.handshake_sec || 0;

                let badge = isExpired ? '<span style="background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.4); padding: 2px 8px; border-radius: 4px; font-weight: bold;">⛔ KEDALUWARSA</span>' :
                            (isUp && hsSec > 0) ? '<span style="background: rgba(16,185,129,0.2); color: #34d399; border: 1px solid rgba(16,185,129,0.4); padding: 2px 8px; border-radius: 4px; font-weight: bold;">● TERHUBUNG & AKTIF</span>' :
                            isUp ? '<span style="background: rgba(251,191,36,0.2); color: #fbbf24; border: 1px solid rgba(251,191,36,0.4); padding: 2px 8px; border-radius: 4px; font-weight: bold;">🟡 INTERFACE UP (BELUM HANDSHAKE)</span>' :
                            '<span style="background: rgba(100,116,139,0.2); color: #94a3b8; border: 1px solid rgba(100,116,139,0.4); padding: 2px 8px; border-radius: 4px;">⚪ NONAKTIF (DOWN)</span>';

                html += '<div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px; margin-bottom: 8px;">';
                html += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
                html += `<div><strong style="color: #fff; font-size: 13px;">et-${t.slug}</strong> ${t.vpn_ip ? `<span style="color: var(--text-muted); font-size: 11px; margin-left: 6px;">(${t.vpn_ip})</span>` : ''}</div> ${badge}`;
                html += `</div>`;
                html += `<div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">Systemd Service: ${sysEnabled ? '<span style="color: #34d399;">✅ Enabled</span>' : '<span style="color: #94a3b8;">⚪ Disabled</span>'}</div>`;

                if (lic) {
                    html += `<div style="color: #6ee7b7; font-size: 11px; margin-top: 2px;">Institusi/Sekolah: <strong>${lic.school_name || '-'}</strong></div>`;
                }

                html += `<div style="margin-top: 8px; display: flex; justify-content: flex-end;">
                    <button class="btn btn-secondary btn-sm" style="border-color: rgba(239,68,68,0.5); color: #f87171; background: rgba(239,68,68,0.15); font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 6px; cursor: pointer;" onclick="removeSelectedTunnelPreset('${presetId}', '${t.interface_name}')">🔌 Copot Interface ${t.interface_name}</button>
                </div>`;
                html += '</div>';
            });
        }
        html += '</div>';

        if (content) content.innerHTML = html;
    })
    .catch(err => {
        if (btn) {
            btn.disabled = false;
            btn.innerText = '🌐 Audit Lisensi';
        }
        if (content) content.innerHTML = '<span style="color: #f87171;">❌ Gagal audit: ' + err.message + '</span>';
    });
}

function removeSelectedTunnelPreset(presetId, iface) {
    if (!confirm(`Apakah Anda yakin ingin MENCOPOT & MEMATIKAN interface WireGuard "${iface}" dari server ini?`)) {
        return;
    }

    fetch('/api/remove-selected-tunnel?id=' + encodeURIComponent(presetId) + '&iface=' + encodeURIComponent(iface))
    .then(r => r.json())
    .then(res => {
        if (res.success) {
            alert('✅ Berhasil Copot Interface!\n\n' + res.message);
            checkWatchdogStatus(presetId);
        } else {
            alert('❌ Gagal mencopot interface: ' + res.message);
        }
    })
    .catch(err => alert('❌ Error: ' + err.message));
}

function openHealthMatrixForPreset(presetId) {
    window.activePresetId = presetId;
    if (typeof switchAppMode === 'function') {
        switchAppMode('health');
    }
    setTimeout(() => {
        const select = document.getElementById('health-target-preset');
        if (select) select.value = presetId;
        if (typeof refreshHealthMatrixUI === 'function') refreshHealthMatrixUI();
    }, 80);
}

function openLogMonitorForPreset(presetId) {
    window.activePresetId = presetId;
    if (typeof switchAppMode === 'function') {
        switchAppMode('logs');
    }
    setTimeout(() => {
        const select = document.getElementById('log-target-preset');
        if (select) select.value = presetId;
        if (typeof startLogStream === 'function') startLogStream();
    }, 80);
}

// Global Export
window.runQuickUpdatePreset = runQuickUpdatePreset;
window.runSeedWilayahPreset = runSeedWilayahPreset;
window.checkWatchdogStatus = checkWatchdogStatus;
window.fixTunnelPreset = fixTunnelPreset;
window.auditTunnelPreset = auditTunnelPreset;
window.removeSelectedTunnelPreset = removeSelectedTunnelPreset;
window.openHealthMatrixForPreset = openHealthMatrixForPreset;
window.openLogMonitorForPreset = openLogMonitorForPreset;
