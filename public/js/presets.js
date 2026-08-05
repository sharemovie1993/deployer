let globalPresets = [];

// State aktif: preset server yang terakhir diakses di Multi-Preset
// Digunakan oleh Health Monitor dan Log Monitor untuk default ke server ini
window.activePresetId = null;

function loadPresets() {
    fetch('/api/presets')
    .then(res => res.json())
    .then(res => {
        if (res.success && res.data) {
            globalPresets = res.data;
            renderPresetsGrid(res.data);
            if (typeof populateLogTargetPresets === 'function') {
                populateLogTargetPresets();
            }
        }
    })
    .catch(err => console.error('Gagal memuat preset:', err));
}

function renderPresetsGrid(presets) {
    const grid = document.getElementById('presets-grid-container');
    if (!grid) return;

    if (!presets || presets.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Belum ada preset server tersimpan. Klik <strong>➕ Tambah Preset Server</strong> di atas untuk membuat preset baru.</div>';
        return;
    }

    let html = '';
    presets.forEach(p => {
        const projName = p.project === 'licensing' ? 'Server Lisensi (VPS)' : 'Project Absenta (Full Stack)';
        const projBadgeClass = p.project === 'licensing' ? 'badge-blue' : 'badge-purple';
        const keyName = p.sshKeyChoice || 'nginxonly.pem';
        const pName = p.name || ('Server ' + p.vpsIp);
        const pUser = p.vpsUser || 'asepsuryadi';
        const safeId = p.id;

        html += '<div class="preset-card" id="pcard-' + safeId + '">' +
            '<div>' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">' +
                    '<span class="badge ' + projBadgeClass + '">' + projName + '</span>' +
                    '<div style="display: flex; gap: 6px;">' +
                        '<button class="btn-action-inline" style="padding: 5px 10px; font-size: 11px;" onclick="openPresetModal(\'' + safeId + '\')">✏️ Edit</button>' +
                        '<button class="btn-action-inline" style="padding: 5px 10px; font-size: 11px; border-color: rgba(239,68,68,0.5); color: #f87171; background: rgba(239,68,68,0.12);" onclick="deletePreset(\'' + safeId + '\')">🗑️ Hapus</button>' +
                    '</div>' +
                '</div>' +
                '<div style="font-size: 18px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">' + pName + '</div>' +
                '<div style="font-family: \'Fira Code\', monospace; font-size: 13px; color: #a78bfa; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">' +
                    '<span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; display: inline-block;"></span>' +
                    '🌐 ' + p.vpsIp + ' &nbsp;|&nbsp; 👤 ' + pUser +
                '</div>' +
                '<div style="font-size: 12.5px; color: var(--text-muted); line-height: 1.6; background: rgba(15,23,42,0.4); padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.04);">' +
                    '🔑 SSH Key: <span style="color: var(--text-main); font-weight: 600;">' + keyName + '</span><br>' +
                    '🔒 Password Sudo: <span style="color: var(--text-main); font-weight: 600;">••••••••</span>' +
                '</div>' +
                '<div id="watchdog-panel-' + safeId + '" style="display:none; margin-top: 14px; background: rgba(10,15,30,0.6); border: 1px solid rgba(167,139,250,0.2); border-radius: 12px; padding: 14px; font-size: 12.5px;">' +
                    '<div style="font-weight: 700; color: #a78bfa; margin-bottom: 10px; font-size: 13px;">🛡️ Status Watchdog</div>' +
                    '<div id="watchdog-content-' + safeId + '" style="color: var(--text-muted);">Mengambil data...</div>' +
                '</div>' +
            '</div>' +
            '<div style="margin-top: 20px; border-top: 1px solid var(--glass-border); padding-top: 16px; display: flex; flex-direction: column; gap: 8px;">' +
                '<button class="btn btn-primary" style="width: 100%; justify-content: center; padding: 12px; font-size: 14px; font-weight: 700;" onclick="runQuickUpdatePreset(\'' + safeId + '\')">⚡ Quick Update Sekarang</button>' +
                '<div style="display: flex; gap: 6px; flex-wrap: wrap;">' +
                    '<button id="watchdog-btn-' + safeId + '" class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px;" onclick="checkWatchdogStatus(\'' + safeId + '\')">🛡️ Status Watchdog</button>' +
                    '<button id="audit-btn-' + safeId + '" class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(52,211,153,0.4); color: #34d399; background: rgba(52,211,153,0.08);" onclick="auditTunnelPreset(\'' + safeId + '\')">🌐 Audit Lisensi</button>' +
                    '<button id="tunnel-fix-btn-' + safeId + '" class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(251,191,36,0.4); color: #fbbf24; background: rgba(251,191,36,0.08);" onclick="fixTunnelPreset(\'' + safeId + '\')">🔧 Perbaiki Tunnel</button>' +
                    '<button class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(59,130,246,0.4); color: #60a5fa; background: rgba(59,130,246,0.08);" onclick="openHealthMatrixForPreset(\'' + safeId + '\')">🩺 System Health</button>' +
                    '<button class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(167,139,250,0.4); color: #a78bfa; background: rgba(167,139,250,0.08);" onclick="openLogMonitorForPreset(\'' + safeId + '\')">📜 Log PM2</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    });
    grid.innerHTML = html;
}

function openPresetModal(presetId) {
    const backdrop = document.getElementById('preset-modal-backdrop');
    const title = document.getElementById('preset-modal-title');
    const inputId = document.getElementById('preset-modal-id');
    const inputName = document.getElementById('preset-modal-name');
    const inputIp = document.getElementById('preset-modal-ip');
    const inputUser = document.getElementById('preset-modal-user');
    const selectProj = document.getElementById('preset-modal-project');
    const selectKey = document.getElementById('preset-modal-keychoice');
    const inputSudo = document.getElementById('preset-modal-sudopass');
    const inputCustomKey = document.getElementById('preset-modal-customkey');

    if (!backdrop) return;

    if (presetId) {
        const p = globalPresets.find(item => item.id === presetId);
        if (p) {
            title.innerText = '✏️ Edit Preset Server';
            inputId.value = p.id;
            inputName.value = p.name || '';
            inputIp.value = p.vpsIp || '';
            inputUser.value = p.vpsUser || 'asepsuryadi';
            selectProj.value = p.project || 'absenta';
            selectKey.value = p.sshKeyChoice || 'nginxonly.pem';
            inputSudo.value = p.vpsSudoPass || '1';
            inputCustomKey.value = p.vpsKeyPath || '';
        }
    } else {
        title.innerText = '➕ Tambah Preset Server';
        inputId.value = '';
        inputName.value = '';
        inputIp.value = '10.10.10.99';
        inputUser.value = 'asepsuryadi';
        selectProj.value = 'absenta';
        selectKey.value = 'nginxonly.pem';
        inputSudo.value = '1';
        inputCustomKey.value = '';
    }

    togglePresetCustomKey();
    backdrop.style.display = 'flex';
}

function closePresetModal() {
    const backdrop = document.getElementById('preset-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
}

function togglePresetCustomKey() {
    const keyChoice = document.getElementById('preset-modal-keychoice').value;
    const customGroup = document.getElementById('preset-custom-key-group');
    if (customGroup) {
        customGroup.style.display = keyChoice === 'custom' ? 'block' : 'none';
    }
}

function savePresetSubmit() {
    const id = document.getElementById('preset-modal-id').value;
    const name = document.getElementById('preset-modal-name').value;
    const vpsIp = document.getElementById('preset-modal-ip').value;
    const vpsUser = document.getElementById('preset-modal-user').value;
    const project = document.getElementById('preset-modal-project').value;
    const sshKeyChoice = document.getElementById('preset-modal-keychoice').value;
    const vpsSudoPass = document.getElementById('preset-modal-sudopass').value;
    const customKey = document.getElementById('preset-modal-customkey').value;

    if (!vpsIp) {
        alert('Alamat IP VPS Target wajib diisi!');
        return;
    }

    const payload = {
        id: id || undefined,
        name: name || ('Server ' + vpsIp),
        vpsIp,
        vpsUser: vpsUser || 'asepsuryadi',
        project,
        sshKeyChoice,
        vpsSudoPass: vpsSudoPass || '1',
        vpsKeyPath: sshKeyChoice === 'custom' ? customKey : ''
    };

    fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(res => {
        if (res.success) {
            closePresetModal();
            loadPresets();
        } else {
            alert('Gagal menyimpan preset: ' + res.message);
        }
    })
    .catch(err => alert('Error menyimpan preset: ' + err.message));
}

function deletePreset(id) {
    if (!confirm('Apakah Anda yakin ingin menghapus preset server ini?')) return;

    fetch('/api/presets?id=' + encodeURIComponent(id), {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(res => {
        if (res.success) {
            loadPresets();
        }
    });
}

function runQuickUpdatePreset(presetId) {
    const p = globalPresets.find(item => item.id === presetId);
    if (!p) return;

    // Simpan preset aktif untuk sinkronisasi ke Health Monitor & Log Monitor
    window.activePresetId = presetId;

    // Tutup watchdog panel jika terbuka
    const wdPanel = document.getElementById('watchdog-panel-' + presetId);
    if (wdPanel) wdPanel.style.display = 'none';

    const consoleSection = document.getElementById('quick-update-console-section');
    const title = document.getElementById('quick-update-target-title');
    const statusBadge = document.getElementById('quick-update-status-badge');
    const progressBar = document.getElementById('quick-progress-fill');
    const percentText = document.getElementById('quick-progress-percent');
    const statusText = document.getElementById('quick-progress-status');
    const consoleContainer = document.getElementById('quick-terminal-logs');

    if (!consoleSection) return;

    consoleSection.style.display = 'block';
    title.innerHTML = '⚡ Sedang Melakukan Quick Update: ' + p.name + ' (' + p.vpsIp + ')';
    statusBadge.className = 'badge badge-purple';
    statusBadge.innerHTML = 'Memproses...';
    
    progressBar.style.width = '5%';
    percentText.innerHTML = '5%';
    statusText.innerHTML = 'Menghubungkan via SSH...';
    consoleContainer.innerHTML = '>> Memulai aliran log Quick Update remote untuk ' + p.vpsIp + '...\n';

    const eventSource = new EventSource('/api/stream-quick-update?id=' + encodeURIComponent(presetId));

    eventSource.onmessage = function(event) {
        const line = event.data;

        if (line === '[UPDATE_COMPLETE]') {
            eventSource.close();
            progressBar.style.width = '100%';
            percentText.innerHTML = '100%';
            statusText.innerHTML = 'Quick Update Selesai Sukses! 🎉';
            statusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
            statusBadge.style.color = '#34d399';
            statusBadge.innerHTML = '✅ Sukses';
            
            const span = document.createElement('span');
            span.style.color = 'var(--success)';
            span.style.fontWeight = 'bold';
            span.appendChild(document.createTextNode('\n=============================================\n  QUICK UPDATE SELESAI SAKSES!\n=============================================\n'));
            consoleContainer.appendChild(span);
            consoleContainer.scrollTop = consoleContainer.scrollHeight;
            return;
        }

        if (line.startsWith('[UPDATE_FAILED]')) {
            eventSource.close();
            statusText.innerHTML = 'Quick Update Gagal! ❌';
            statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
            statusBadge.style.color = '#f87171';
            statusBadge.innerHTML = '❌ Gagal';
            
            const span = document.createElement('span');
            span.style.color = 'var(--error)';
            span.appendChild(document.createTextNode('\n[ERROR] ' + line + '\n'));
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

        if (line.includes('Backend') || line.includes('Memproses Backend')) {
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
        statusText.innerHTML = 'Koneksi stream terputus.';
        console.log('SSE Quick Update Error:', err);
    };

    consoleSection.scrollIntoView({ behavior: 'smooth' });
}

function checkWatchdogStatus(presetId) {
    window.activePresetId = presetId;
    const panel = document.getElementById('watchdog-panel-' + presetId);
    const content = document.getElementById('watchdog-content-' + presetId);
    const btn = document.getElementById('watchdog-btn-' + presetId);
    if (!panel || !content) return;

    // Toggle panel
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
            content.innerHTML =
                '<div style="color: #f87171;">❌ ' + (offline ? 'Server offline / SSH gagal' : res.message) + '</div>';
            return;
        }

        const d = res.data;
        const wgOk = d.wg_status === 'UP';
        const caddyOk = d.caddy === 'active';
        const pm2Ok = d.pm2 === 'running';
        const timerOk = d.timer === 'active';

        const dot = (ok) => '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (ok ? '#10b981' : '#ef4444') + ';margin-right:6px;"></span>';
        const badge = (ok, yes, no) => '<span style="font-weight:600;color:' + (ok ? '#34d399' : '#f87171') + ';">' + (ok ? yes : no) + '</span>';

        const wgIfaces = d.wg_ifaces ? d.wg_ifaces.replace(/,+$/, '').replace(/,/g, ', ') : '-';
        const wgHs = d.wg_handshake || 'N/A';

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
                return '<div style="font-family:\'Fira Code\',monospace;font-size:11.5px;display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px dashed rgba(255,255,255,0.05);">' +
                    '<span style="color:' + color + ';font-weight:600;">' + icon + ' ' + iface + '</span>' +
                    '<span style="color:#6ee7b7;font-weight:500;">' + ipAddr + '</span>' +
                '</div>';
            }).join('')
            : '<div style="font-size:11px;color:var(--text-muted);">Tidak ada IP terdeteksi</div>';

        content.innerHTML =
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' +
                '<div>' + dot(wgOk) + 'WireGuard: ' + badge(wgOk, 'UP', 'DOWN') + '</div>' +
                '<div>' + dot(caddyOk) + 'Caddy: ' + badge(caddyOk, 'active', 'mati') + '</div>' +
                '<div>' + dot(pm2Ok) + 'PM2: ' + badge(pm2Ok, 'running', 'mati') + '</div>' +
                '<div>' + dot(timerOk) + 'Watchdog: ' + badge(timerOk, 'aktif', 'belum pasang') + '</div>' +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:8px 10px;border:1px solid rgba(255,255,255,0.05);margin-bottom:10px;">' +
                '<div style="font-size:11px;font-weight:700;color:#38bdf8;margin-bottom:6px;display:flex;justify-content:space-between;">' +
                    '<span>🌐 Interface & Alamat IP:</span>' +
                    (wgHs ? '<span style="color:#6ee7b7;font-size:10.5px;font-weight:normal;">⏱️ Handshake: ' + wgHs + '</span>' : '') +
                '</div>' +
                ipList +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:8px 10px;border:1px solid rgba(255,255,255,0.05);">' +
                '<div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">📋 Log Watchdog Terakhir:</div>' +
                logs +
            '</div>';
    })
    .catch(err => {
        btn.innerHTML = '🛡️ Cek Status Watchdog';
        btn.disabled = false;
        content.innerHTML = '<div style="color: #f87171;">❌ Error: ' + err.message + '</div>';
    });
}

function fixTunnelPreset(presetId) {
    const p = globalPresets.find(item => item.id === presetId);
    if (!p) return;

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
                    if (lic.expires_at) {
                        const exp = new Date(lic.expires_at).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
                        html += `<div style="color: ${isExpired ? '#f87171' : '#a78bfa'}; font-size: 11px;">Masa Berlaku Lisensi: ${exp} ${isExpired ? '(Telah Kedaluwarsa)' : ''}</div>`;
                    }
                } else if (t.license_key) {
                    html += `<div style="color: var(--text-muted); font-size: 11px; margin-top: 2px;">Kunci Lisensi: ${t.license_key.slice(0,8)}••••••••</div>`;
                }
                html += '</div>';
            });

            if (res.tunnels_count > 1) {
                html += `<div style="margin-top: 10px; text-align: center;">
                    <button class="btn btn-secondary" style="border-color: rgba(239,68,68,0.5); color: #f87171; background: rgba(239,68,68,0.1); width: 100%; justify-content: center; padding: 9px; font-weight: bold;" onclick="cleanGhostTunnelsPreset('${presetId}')">🧹 Bersihkan Tunnel Bentrok / Ghost Sekarang</button>
                </div>`;
            }
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

function cleanGhostTunnelsPreset(presetId) {
    if (!confirm('Apakah Anda yakin ingin mematikan & menghapus seluruh interface bentrok/ghost di server ini?')) return;
    const content = document.getElementById('watchdog-content-' + presetId);
    if (content) content.innerHTML = '<div style="color: #fbbf24; font-family: monospace;">⏳ Mematikan & membersihkan interface bentrok di VPS...</div>';

    fetch('/api/clean-ghost-tunnels?id=' + encodeURIComponent(presetId))
    .then(r => r.json())
    .then(res => {
        if (res.success) {
            alert('✅ Pembersihan Berhasil!\n\n' + res.message);
            auditTunnelPreset(presetId);
        } else {
            alert('❌ Gagal pembersihan: ' + res.message);
        }
    })
    .catch(err => {
        alert('❌ Error koneksi: ' + err.message);
    });
}

function openHealthMatrixForPreset(presetId) {
    window.activePresetId = presetId;
    if (typeof switchAppMode === 'function') {
        switchAppMode('health');
    }
    // Tunggu dropdown ter-render lalu set value
    setTimeout(() => {
        const select = document.getElementById('health-target-preset');
        if (select) select.value = presetId;
        if (typeof refreshHealthMatrixUI === 'function') refreshHealthMatrixUI();
    }, 80);
}
