let globalPresets = [];

// State aktif: preset server yang terakhir diakses di Multi-Preset
// Digunakan oleh Health Monitor dan Log Monitor untuk default ke server ini
window.activePresetId = null;

function loadPresets() {
    if (typeof window.fetchSharedPresets === 'function') {
        window.fetchSharedPresets(true).then(presets => {
            globalPresets = presets;
            renderPresetsGrid(presets);
            if (typeof populateLogTargetPresets === 'function') {
                populateLogTargetPresets();
            }
        });
    } else {
        fetch('/api/presets')
        .then(res => res.json())
        .then(res => {
            if (res.success && res.data) {
                globalPresets = res.data;
                renderPresetsGrid(res.data);
            }
        });
    }
}

function testConnection(presetId) {
    const p = globalPresets.find(item => item.id === presetId);
    if (!p) return;

    const btn = document.getElementById('conn-btn-' + presetId);
    const panel = document.getElementById('conn-panel-' + presetId);
    const content = document.getElementById('conn-content-' + presetId);
    if (!btn || !panel || !content) return;

    // Toggle — klik lagi saat sudah terbuka tutup panel
    if (panel.style.display === 'block' && !btn.disabled) {
        panel.style.display = 'none';
        btn.innerHTML = '🔌 Uji Koneksi';
        return;
    }

    panel.style.display = 'block';
    content.innerHTML = '<span style="color:#6ee7b7;font-family:monospace;">⏳ Menghubungkan via SSH ke ' + p.vpsIp + '...</span>';
    btn.disabled = true;
    btn.innerHTML = '⏳ Menguji...';

    fetch('/api/test-connection?id=' + encodeURIComponent(presetId))
        .then(r => r.json())
        .then(res => {
            btn.disabled = false;
            if (!res.success) {
                btn.innerHTML = '❌ Gagal';
                btn.style.color = '#f87171';
                btn.style.borderColor = 'rgba(239,68,68,0.4)';
                content.innerHTML =
                    '<div style="color:#f87171;font-weight:600;">❌ ' + (res.offline ? 'VPS Offline / Tidak Terjangkau' : 'Koneksi Gagal') + '</div>' +
                    '<div style="color:var(--text-muted);margin-top:4px;font-size:11px;font-family:monospace;">' + (res.message || '') + '</div>';
                setTimeout(() => { btn.innerHTML = '🔌 Uji Koneksi'; btn.style.color=''; btn.style.borderColor=''; }, 4000);
                return;
            }

            btn.innerHTML = '✅ ' + res.latency_ms + 'ms';
            btn.style.color = '#34d399';
            btn.style.borderColor = 'rgba(52,211,153,0.5)';
            btn.style.background = 'rgba(52,211,153,0.12)';

            const latColor = res.latency_ms < 100 ? '#34d399' : res.latency_ms < 300 ? '#fbbf24' : '#f87171';
            const caddyOk = res.caddy === 'active';
            const pm2Lines = res.pm2 && res.pm2 !== 'N/A'
                ? res.pm2.split(',').filter(Boolean).map(s => {
                    const [name, status] = s.split(':');
                    const ok = status === 'online';
                    return '<span style="display:inline-block;margin-right:8px;color:' + (ok ? '#34d399' : '#f87171') + ';">' +
                        (ok ? '●' : '○') + ' ' + (name || s) + '</span>';
                }).join('') : '<span style="color:var(--text-muted);">N/A</span>';

            content.innerHTML =
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:11.5px;">' +
                    '<div>⚡ Latency: <strong style="color:' + latColor + ';">' + res.latency_ms + ' ms</strong></div>' +
                    '<div>⏱️ Uptime: <strong style="color:#6ee7b7;">' + res.uptime + '</strong></div>' +
                    '<div>🧠 RAM: <strong style="color:#a78bfa;">' + res.ram + '</strong></div>' +
                    '<div>💾 Disk: <strong style="color:#38bdf8;">' + res.disk + '</strong></div>' +
                    '<div>🌐 Caddy: <strong style="color:' + (caddyOk ? '#34d399' : '#f87171') + ';">' + (caddyOk ? 'active ✅' : res.caddy + ' ⚠️') + '</strong></div>' +
                '</div>' +
                '<div style="margin-top:8px;font-size:11px;">📦 PM2: ' + pm2Lines + '</div>';

            setTimeout(() => { btn.innerHTML = '🔌 Uji Koneksi'; btn.style.color=''; btn.style.borderColor=''; btn.style.background=''; }, 8000);
        })
        .catch(err => {
            btn.disabled = false;
            btn.innerHTML = '🔌 Uji Koneksi';
            content.innerHTML = '<div style="color:#f87171;">❌ Error: ' + err.message + '</div>';
        });
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
        const projName = p.project === 'licensing' ? 'Server Lisensi (VPS)' : (p.project === 'undangan' ? 'Undangan Digital (Studio)' : (p.project === 'rekber' ? 'Rekening Bersama (B-Pay)' : 'Project Absenta (Full Stack)'));
        const projBadgeClass = p.project === 'licensing' ? 'badge-blue' : (p.project === 'undangan' ? 'badge-blue' : (p.project === 'rekber' ? 'badge-blue' : 'badge-purple'));
        const keyName = p.sshKeyChoice || 'nginxonly.pem';
        const pName = p.name || ('Server ' + p.vpsIp);
        const pUser = p.vpsUser || 'asepsuryadi';
        const safeId = p.id;

        const buildBadgeText = p.buildMode === 'skip' ? '🚀 Skip Build' : (p.buildMode === 'local' ? '🖥️ Local Build' : '☁️ Remote Build');
        const buildBadgeColor = p.buildMode === 'skip' ? '#fbbf24' : (p.buildMode === 'local' ? '#34d399' : '#60a5fa');
        const buildBadgeRgb = p.buildMode === 'skip' ? '251,191,36' : (p.buildMode === 'local' ? '52,211,153' : '59,130,246');

        const obfBadgeText = p.obfuscate === 'Y' ? '🛡️ Obfuscate: On' : '⚡ Obfuscate: Off';
        const obfBadgeColor = p.obfuscate === 'Y' ? '#a78bfa' : '#94a3b8';
        const obfBadgeRgb = p.obfuscate === 'Y' ? '167,139,250' : '148,163,184';

        html += '<div class="preset-card" id="pcard-' + safeId + '">' +
            '<div>' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">' +
                    '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                        '<span class="badge ' + projBadgeClass + '">' + projName + '</span>' +
                        '<span class="badge" style="background:rgba(' + buildBadgeRgb + ',0.12);color:' + buildBadgeColor + ';border:1px solid rgba(' + buildBadgeRgb + ',0.3);font-size:10px;">' + buildBadgeText + '</span>' +
                        '<span class="badge" style="background:rgba(' + obfBadgeRgb + ',0.12);color:' + obfBadgeColor + ';border:1px solid rgba(' + obfBadgeRgb + ',0.3);font-size:10px;">' + obfBadgeText + '</span>' +
                    '</div>' +
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
                '<div id="conn-panel-' + safeId + '" style="display:none; margin-top: 10px; background: rgba(10,30,20,0.7); border: 1px solid rgba(52,211,153,0.25); border-radius: 10px; padding: 12px; font-size: 12px;">' +
                    '<div id="conn-content-' + safeId + '" style="color: var(--text-muted);">Menghubungkan...</div>' +
                '</div>' +
            '</div>' +
            '<div style="margin-top: 20px; border-top: 1px solid var(--glass-border); padding-top: 16px; display: flex; flex-direction: column; gap: 8px;">' +
                '<button class="btn btn-primary" style="width: 100%; justify-content: center; padding: 12px; font-size: 14px; font-weight: 700;" onclick="runQuickUpdatePreset(\'' + safeId + '\')">⚡ Quick Update Sekarang</button>' +
                '<div style="display: flex; gap: 6px; flex-wrap: wrap;">' +
                    '<button id="conn-btn-' + safeId + '" class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(52,211,153,0.4); color: #34d399; background: rgba(52,211,153,0.08);" onclick="testConnection(\'' + safeId + '\')">🔌 Uji Koneksi</button>' +
                    '<button id="watchdog-btn-' + safeId + '" class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px;" onclick="checkWatchdogStatus(\'' + safeId + '\')">🛡️ Status Watchdog</button>' +
                    '<button id="audit-btn-' + safeId + '" class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(52,211,153,0.4); color: #34d399; background: rgba(52,211,153,0.08);" onclick="auditTunnelPreset(\'' + safeId + '\')">🌐 Audit Lisensi</button>' +
                    '<button id="tunnel-fix-btn-' + safeId + '" class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(251,191,36,0.4); color: #fbbf24; background: rgba(251,191,36,0.08);" onclick="fixTunnelPreset(\'' + safeId + '\')">🔧 Perbaiki Tunnel</button>' +
                    '<button class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(59,130,246,0.4); color: #60a5fa; background: rgba(59,130,246,0.08);" onclick="openHealthMatrixForPreset(\'' + safeId + '\')">🩺 System Health</button>' +
                    '<button class="btn btn-secondary" style="flex: 1; min-width: 110px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(167,139,250,0.4); color: #a78bfa; background: rgba(167,139,250,0.08);" onclick="openLogMonitorForPreset(\'' + safeId + '\')">📜 Log PM2</button>' +
                    '<button class="btn btn-secondary" style="flex: 1; min-width: 130px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(16,185,129,0.4); color: #34d399; background: rgba(16,185,129,0.08);" onclick="runSeedWilayahPreset(\'' + safeId + '\')">🌐 Seed Full Wilayah</button>' +
                    '<button class="btn btn-secondary" style="flex: 1; min-width: 120px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(56,189,248,0.4); color: #38bdf8; background: rgba(56,189,248,0.08);" onclick="openDomainModal(\'' + safeId + '\')">🌐 Ganti Domain</button>' +
                    '<button class="btn btn-secondary" style="flex: 1; min-width: 120px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(244,114,182,0.4); color: #f472b6; background: rgba(244,114,182,0.08);" onclick="openTuningModal(\'' + safeId + '\')">🚀 Tuning Server</button>' +
                    '<button class="btn btn-secondary" style="flex: 1; min-width: 120px; justify-content: center; padding: 8px; font-size: 11.5px; border-color: rgba(14,165,233,0.4); color: #38bdf8; background: rgba(14,165,233,0.08);" onclick="openIopsModal(\'' + safeId + '\')">⚡ IOPS Checker</button>' +
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
            inputSudo.value = p.vpsSudoPass || '';
            inputCustomKey.value = p.vpsKeyPath || '';
            const selBuildMode = document.getElementById('preset-modal-buildmode');
            if (selBuildMode) selBuildMode.value = p.buildMode || 'remote';
            const selObfuscate = document.getElementById('preset-modal-obfuscate');
            if (selObfuscate) selObfuscate.value = p.obfuscate || 'N';
        }
    } else {
        title.innerText = '➕ Tambah Preset Server';
        inputId.value = '';
        inputName.value = '';
        inputIp.value = '10.10.10.99';
        inputUser.value = 'asepsuryadi';
        selectProj.value = 'absenta';
        selectKey.value = 'nginxonly.pem';
        inputSudo.value = '';
        inputCustomKey.value = '';
        const selBuildMode = document.getElementById('preset-modal-buildmode');
        if (selBuildMode) selBuildMode.value = 'remote';
        const selObfuscate = document.getElementById('preset-modal-obfuscate');
        if (selObfuscate) selObfuscate.value = 'N';
    }

    togglePresetCustomKey();
    toggleBuildModeField();
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
    // Clear custom key path when switching away from custom
    if (keyChoice !== 'custom') {
        const customKeyInput = document.getElementById('preset-modal-customkey');
        if (customKeyInput) customKeyInput.value = '';
    }
}

function toggleBuildModeField() {
    const buildModeGroup = document.getElementById('preset-buildmode-group');
    if (buildModeGroup) {
        buildModeGroup.style.display = 'block';
    }
}

function browseSSHKeyFile() {
    const btn = document.getElementById('browse-key-btn');
    const input = document.getElementById('preset-modal-customkey');
    if (!btn || !input) return;

    // Visual feedback — loading state
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '⏳ Membuka...';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    fetch('/api/browse-file?filter=pem&title=Pilih%20SSH%20Key%20File%20(.pem)')
        .then(r => r.json())
        .then(res => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            btn.style.opacity = '1';

            if (res.success && res.path) {
                input.value = res.path;
                input.style.color = 'var(--text-main)';
                // Flash green to indicate success
                input.style.border = '1px solid rgba(52,211,153,0.6)';
                setTimeout(() => { input.style.border = ''; }, 2000);
            } else if (res.success && !res.path) {
                // User cancelled — no-op
            } else {
                alert('Gagal membuka dialog file: ' + (res.message || 'Error tidak diketahui'));
            }
        })
        .catch(err => {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            btn.style.opacity = '1';
            alert('Error koneksi saat membuka file picker: ' + err.message);
        });
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
    const buildModeEl = document.getElementById('preset-modal-buildmode');
    const buildMode = buildModeEl ? buildModeEl.value : 'remote';
    const obfuscateEl = document.getElementById('preset-modal-obfuscate');
    const obfuscate = obfuscateEl ? obfuscateEl.value : 'N';

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
        vpsSudoPass: vpsSudoPass || '',
        vpsKeyPath: sshKeyChoice === 'custom' ? customKey : '',
        buildMode: buildMode || 'local',
        obfuscate: obfuscate || 'N'
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
    const timerBadge = document.getElementById('quick-update-timer');
    const progressBar = document.getElementById('quick-progress-fill');
    const percentText = document.getElementById('quick-progress-percent');
    const statusText = document.getElementById('quick-progress-status');
    const consoleContainer = document.getElementById('quick-terminal-logs');

    if (!consoleSection) return;

    // Reset Stopwatch Timer
    if (window.quickUpdateTimerInterval) {
        clearInterval(window.quickUpdateTimerInterval);
    }
    const updateStartTime = Date.now();
    
    function formatDuration(ms) {
        const totalSecs = Math.floor(ms / 1000);
        if (totalSecs < 60) {
            return totalSecs + ' Detik';
        }
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return mins + ' Menit ' + secs + ' Detik';
    }

    function formatDurationShort(ms) {
        const totalSecs = Math.floor(ms / 1000);
        if (totalSecs < 60) {
            return totalSecs + 's';
        }
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
    const p = globalPresets.find(item => item.id === presetId);
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

        const ram = d.ram_usage || '0%';
        const disk = d.disk_usage || '0%';
        const uptime = d.uptime || '0m';
        const latency = d.latency || 'N/A';

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
            '<div style="display:flex;gap:8px;margin-bottom:10px;font-size:11px;background:rgba(0,0,0,0.2);padding:6px 10px;border-radius:6px;justify-content:space-between;">' +
                '<span style="color:#a78bfa;">🧠 RAM: <strong>' + ram + '</strong></span>' +
                '<span style="color:#38bdf8;">💾 Disk: <strong>' + disk + '</strong></span>' +
                '<span style="color:#6ee7b7;">⏱️ Latency: <strong>' + latency + '</strong></span>' +
            '</div>' +
            '<div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:8px 10px;border:1px solid rgba(255,255,255,0.05);margin-bottom:10px;">' +
                '<div style="font-size:11px;font-weight:700;color:#38bdf8;margin-bottom:6px;display:flex;justify-content:space-between;">' +
                    '<span>🌐 Interface & Alamat IP:</span>' +
                    (wgHs ? '<span style="color:#6ee7b7;font-size:10.5px;font-weight:normal;">⏱️ Handshake: ' + wgHs + '</span>' : '') +
                '</div>' +
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

                html += `<div style="margin-top: 8px; display: flex; justify-content: flex-end;">
                    <button class="btn btn-secondary btn-sm" style="border-color: rgba(239,68,68,0.5); color: #f87171; background: rgba(239,68,68,0.15); font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 6px; cursor: pointer;" onclick="removeSelectedTunnelPreset('${presetId}', '${t.interface_name}')">🔌 Copot Interface ${t.interface_name}</button>
                </div>`;
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

function removeSelectedTunnelPreset(presetId, iface) {
    if (!confirm(`Apakah Anda yakin ingin MENCOPOT & MEMATIKAN interface WireGuard "${iface}" dari server ini?\n\nInterface ini akan dimatikan (down) dan file konfigurasinya akan dihapus dari VPS.`)) {
        return;
    }
    const content = document.getElementById('watchdog-content-' + presetId);
    if (content) {
        content.innerHTML = `<div style="color: #f87171; font-family: monospace;">⏳ Mencopot & mematikan interface WireGuard ${iface} di VPS...</div>`;
    }

    fetch('/api/remove-selected-tunnel?id=' + encodeURIComponent(presetId) + '&iface=' + encodeURIComponent(iface))
    .then(async r => {
        const text = await r.text();
        let res;
        try {
            res = JSON.parse(text);
        } catch (e) {
            throw new Error(`Server merespon (${r.status}): ${text.slice(0, 150)}... Silakan restart aplikasi Deployer.`);
        }
        return res;
    })
    .then(res => {
        if (res.success) {
            alert('✅ Berhasil Copot Interface!\n\n' + res.message);
            checkWatchdogStatus(presetId);
        } else {
            alert('❌ Gagal mencopot interface: ' + res.message);
        }
    })
    .catch(err => {
        alert('❌ Error: ' + err.message);
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

function cancelCurrentQuickUpdate() {
    const presetId = window.activePresetId;
    if (!confirm('Apakah Anda yakin ingin membatalkan & menghentikan secara paksa proses build / update ini?')) return;

    fetch('/api/quick-update/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: presetId })
    })
    .then(r => r.json())
    .then(res => {
        if (window.currentQuickUpdateEventSource) {
            window.currentQuickUpdateEventSource.close();
            window.currentQuickUpdateEventSource = null;
        }
        if (window.quickUpdateTimerInterval) {
            clearInterval(window.quickUpdateTimerInterval);
        }

        const statusBadge = document.getElementById('quick-update-status-badge');
        const timerBadge = document.getElementById('quick-update-timer');
        const statusText = document.getElementById('quick-progress-status');
        const consoleContainer = document.getElementById('quick-terminal-logs');

        if (statusBadge) {
            statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
            statusBadge.style.color = '#f87171';
            statusBadge.innerHTML = '🛑 Dibatalkan';
        }
        if (timerBadge) {
            timerBadge.style.background = 'rgba(239, 68, 68, 0.2)';
            timerBadge.style.color = '#f87171';
            timerBadge.innerHTML = '⏱️ Dihentikan';
        }
        if (statusText) {
            statusText.innerHTML = 'Proses dihentikan oleh pengguna. 🛑';
        }

        if (consoleContainer) {
            const span = document.createElement('span');
            span.style.color = 'var(--error)';
            span.style.fontWeight = 'bold';
            span.appendChild(document.createTextNode('\n=============================================\n  PROSES DIBATALKAN & DIBERHENTIKAN PAKSA! (Force Stop)\n=============================================\n'));
            consoleContainer.appendChild(span);
            consoleContainer.scrollTop = consoleContainer.scrollHeight;
        }
    })
    .catch(err => {
        alert('Error membatalkan proses: ' + err.message);
    });
}

// ============================================================
// GUIDED DOMAIN & SUBDOMAIN SWITCHER
// ============================================================

let currentDomainEventSource = null;

function openDomainModal(presetId) {
    console.log('[DomainModal] openDomainModal triggered for presetId:', presetId);
    let p = (globalPresets || []).find(item => item.id === presetId);
    if (!p && Array.isArray(window.globalPresets)) {
        p = window.globalPresets.find(item => item.id === presetId);
    }

    const backdrop = document.getElementById('domain-modal-backdrop');
    if (!backdrop) {
        console.error('[DomainModal] Error: Element #domain-modal-backdrop tidak ditemukan di DOM!');
        alert('Komponen modal domain tidak ditemukan di halaman. Silakan refresh halaman browser Anda.');
        return;
    }

    if (!p) {
        // Fallback: fetch presets if array was empty
        fetch('/api/presets')
            .then(res => res.json())
            .then(res => {
                if (res.success && res.data) {
                    globalPresets = res.data;
                    const found = globalPresets.find(item => item.id === presetId);
                    if (found) {
                        openDomainModal(presetId);
                    } else {
                        alert('Preset server tidak ditemukan (ID: ' + presetId + ')');
                    }
                }
            })
            .catch(err => {
                alert('Gagal mengambil data preset: ' + err.message);
            });
        return;
    }

    const badge = document.getElementById('domain-modal-server-badge');
    const inputPresetId = document.getElementById('domain-modal-preset-id');
    const formArea = document.getElementById('domain-modal-form-area');
    const terminalArea = document.getElementById('domain-modal-terminal-area');
    const applyBtn = document.getElementById('domain-modal-apply-btn');
    const linkBtn = document.getElementById('domain-modal-open-link-btn');

    if (inputPresetId) inputPresetId.value = p.id;
    if (badge) badge.innerHTML = 'Target Server: <strong>' + (p.name || p.vpsIp) + '</strong> (' + p.vpsIp + ') &nbsp;|&nbsp; Proyek: <strong>' + (p.project || 'absenta') + '</strong>';

    // Reset fields
    const oldSubInput = document.getElementById('domain-modal-old-subdomain');
    const newSubInput = document.getElementById('domain-modal-new-subdomain');
    const baseDomInput = document.getElementById('domain-modal-base-domain');
    const customDomInput = document.getElementById('domain-modal-custom-domain');

    if (oldSubInput) oldSubInput.value = '';
    if (newSubInput) newSubInput.value = '';
    if (baseDomInput) baseDomInput.value = 'absenta.id';
    if (customDomInput) customDomInput.value = '';

    if (formArea) formArea.style.display = 'block';
    if (terminalArea) terminalArea.style.display = 'none';
    if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.innerHTML = '🚀 Terapkan Pembaruan Domain';
    }
    if (linkBtn) linkBtn.style.display = 'none';

    updateDomainPreview();
    backdrop.style.display = 'flex';
    console.log('[DomainModal] Modal successfully opened. Running pre-check...');

    // Automatically run pre-check on VPS config
    runDomainPrecheck(p.id);
}

async function runDomainPrecheck(presetId) {
    if (!presetId) {
        presetId = document.getElementById('domain-modal-preset-id')?.value;
    }
    if (!presetId) return;

    const badge = document.getElementById('domain-precheck-status-badge');
    const content = document.getElementById('domain-precheck-content');

    if (badge) {
        badge.innerText = '⏳ Memeriksa...';
        badge.style.background = 'rgba(59,130,246,0.15)';
        badge.style.color = '#60a5fa';
        badge.style.borderColor = 'rgba(59,130,246,0.3)';
    }

    if (content) {
        content.innerHTML = `
            <div style="text-align: center; padding: 8px 0; color: #94a3b8;">
                <span class="spinner" style="width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #60a5fa; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 6px;"></span>
                Sedang membaca .env backend, .env frontend, dan database tenant di VPS...
            </div>
        `;
    }

    try {
        const res = await fetch('/api/check-domain-config?id=' + encodeURIComponent(presetId));
        const json = await res.json();

        if (!json.success) {
            throw new Error(json.message || 'Gagal membaca konfigurasi dari VPS.');
        }

        const d = json.data || json;

        if (badge) {
            badge.innerText = '✅ Terverifikasi';
            badge.style.background = 'rgba(52,211,153,0.15)';
            badge.style.color = '#34d399';
            badge.style.borderColor = 'rgba(52,211,153,0.3)';
        }

        const activeSub = d.tenantSubdomain || '-';
        const tenantName = d.tenantName || '-';
        const appUrl = d.appUrl || '-';
        const frontendUrl = d.frontendUrl || '-';
        const viteMain = d.viteMainDomain || '-';
        const licKey = d.licenseKey || '-';
        const customDom = d.tenantCustomDomain || '';

        if (content) {
            content.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-top: 4px;">
                    <div style="background: rgba(30,41,59,0.7); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                        <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Subdomain Aktif (DB)</div>
                        <div style="font-family: 'Fira Code', monospace; font-size: 13px; font-weight: 700; color: #34d399; margin-top: 2px;">
                            ${activeSub} <span style="font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(52,211,153,0.2); color: #34d399; font-weight: normal;">Aktif</span>
                        </div>
                    </div>
                    <div style="background: rgba(30,41,59,0.7); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                        <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Nama Tenant (DB)</div>
                        <div style="font-size: 12px; font-weight: 600; color: #f1f5f9; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${tenantName}">
                            ${tenantName}
                        </div>
                    </div>
                    <div style="background: rgba(30,41,59,0.7); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                        <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">APP_URL (Backend .env)</div>
                        <div style="font-family: 'Fira Code', monospace; font-size: 11px; color: #93c5fd; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${appUrl}">
                            ${appUrl}
                        </div>
                    </div>
                    <div style="background: rgba(30,41,59,0.7); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                        <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">FRONTEND_URL (Backend .env)</div>
                        <div style="font-family: 'Fira Code', monospace; font-size: 11px; color: #93c5fd; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${frontendUrl}">
                            ${frontendUrl}
                        </div>
                    </div>
                    <div style="background: rgba(30,41,59,0.7); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                        <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Base Domain (Frontend .env)</div>
                        <div style="font-family: 'Fira Code', monospace; font-size: 11px; color: #cbd5e1; margin-top: 2px;">
                            ${viteMain}
                        </div>
                    </div>
                    <div style="background: rgba(30,41,59,0.7); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                        <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">License Key</div>
                        <div style="font-family: 'Fira Code', monospace; font-size: 11px; color: #c4b5fd; margin-top: 2px;">
                            ${licKey}
                        </div>
                    </div>
                </div>
                <div style="margin-top: 8px; font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 5px;">
                    <span>💡</span> Subdomain Lama & Base Domain di bawah telah diisi otomatis dari konfigurasi aktif ini.
                </div>
            `;
        }

        // Auto populate fields
        const oldSubInput = document.getElementById('domain-modal-old-subdomain');
        const baseDomInput = document.getElementById('domain-modal-base-domain');
        const customDomInput = document.getElementById('domain-modal-custom-domain');

        if (oldSubInput && d.tenantSubdomain) {
            oldSubInput.value = d.tenantSubdomain;
        }

        const detectedBaseDomain = d.mainDomain || d.easyTunnelBaseDomain || d.tenantBaseDomain || d.viteMainDomain || 'absenta.id';
        if (baseDomInput) {
            baseDomInput.value = detectedBaseDomain;
        }

        if (customDomInput && customDom) {
            customDomInput.value = customDom;
        }

        updateDomainPreview();

    } catch (err) {
        console.error('[DomainPrecheck] Error:', err);
        if (badge) {
            badge.innerText = '❌ Gagal Precheck';
            badge.style.background = 'rgba(239,68,68,0.15)';
            badge.style.color = '#f87171';
            badge.style.borderColor = 'rgba(239,68,68,0.3)';
        }
        if (content) {
            content.innerHTML = `
                <div style="color: #f87171; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; padding: 10px 12px; font-size: 12px;">
                    ⚠️ Gagal membaca konfigurasi VPS: ${err.message || 'Koneksi SSH timeout atau error.'}
                    <div style="margin-top: 6px; font-size: 11px; color: #fca5a5;">
                        Anda tetap dapat mengisi formulir secara manual jika ingin melanjutkan pergantian domain.
                    </div>
                </div>
            `;
        }
    }
}

function closeDomainModal() {
    if (currentDomainEventSource) {
        currentDomainEventSource.close();
        currentDomainEventSource = null;
    }
    const backdrop = document.getElementById('domain-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
}

function updateDomainPreview() {
    const newSub = (document.getElementById('domain-modal-new-subdomain')?.value || '').trim();
    const baseDom = (document.getElementById('domain-modal-base-domain')?.value || 'absenta.id').trim();
    const customDom = (document.getElementById('domain-modal-custom-domain')?.value || '').trim();
    const previewEl = document.getElementById('domain-modal-preview-url');

    if (!previewEl) return;

    if (customDom) {
        previewEl.innerText = 'https://' + customDom;
    } else if (newSub) {
        previewEl.innerText = 'https://' + newSub + '.' + baseDom;
    } else {
        previewEl.innerText = 'https://[subdomain].' + baseDom;
    }
}

function startDomainUpdateStream() {
    const presetId = document.getElementById('domain-modal-preset-id')?.value;
    const oldSub = (document.getElementById('domain-modal-old-subdomain')?.value || '').trim();
    const newSub = (document.getElementById('domain-modal-new-subdomain')?.value || '').trim();
    const baseDom = (document.getElementById('domain-modal-base-domain')?.value || 'absenta.id').trim();
    const customDom = (document.getElementById('domain-modal-custom-domain')?.value || '').trim();

    if (!newSub && !customDom) {
        alert('Mohon isi Subdomain Baru (misal: demo) atau Custom Domain Penuh!');
        return;
    }

    const formArea = document.getElementById('domain-modal-form-area');
    const terminalArea = document.getElementById('domain-modal-terminal-area');
    const terminal = document.getElementById('domain-stream-terminal');
    const statusText = document.getElementById('domain-stream-status');
    const spinner = document.getElementById('domain-stream-spinner');
    const linkBtn = document.getElementById('domain-modal-open-link-btn');

    if (formArea) formArea.style.display = 'none';
    if (terminalArea) terminalArea.style.display = 'block';
    if (terminal) terminal.textContent = 'Memulai inisialisasi koneksi stream SSE ke server...\n';
    if (statusText) {
        statusText.innerText = '⏳ Menghubungkan ke VPS target...';
        statusText.style.color = '#60a5fa';
    }
    if (spinner) spinner.style.display = 'inline-block';
    if (linkBtn) linkBtn.style.display = 'none';

    const targetUrl = customDom ? customDom : (newSub ? (newSub + '.' + baseDom) : baseDom);

    const streamUrl = '/api/stream-update-domain?id=' + encodeURIComponent(presetId) +
        '&oldSubdomain=' + encodeURIComponent(oldSub) +
        '&newSubdomain=' + encodeURIComponent(newSub) +
        '&baseDomain=' + encodeURIComponent(baseDom) +
        '&customDomain=' + encodeURIComponent(customDom);

    if (currentDomainEventSource) {
        currentDomainEventSource.close();
    }

    currentDomainEventSource = new EventSource(streamUrl);

    currentDomainEventSource.onmessage = function(e) {
        const line = e.data;
        if (!line) return;

        if (terminal) {
            terminal.textContent += line + '\n';
            terminal.scrollTop = terminal.scrollHeight;
        }

        if (line.includes('[DOMAIN_UPDATE_COMPLETE]')) {
            if (statusText) {
                statusText.innerText = '✅ Pembaruan Domain Berhasil!';
                statusText.style.color = '#34d399';
            }
            if (spinner) spinner.style.display = 'none';
            if (linkBtn) {
                linkBtn.href = 'https://' + targetUrl;
                linkBtn.style.display = 'inline-flex';
                linkBtn.innerText = '🌐 Buka https://' + targetUrl + ' ↗';
            }
            currentDomainEventSource.close();
            currentDomainEventSource = null;
        } else if (line.includes('[DOMAIN_UPDATE_FAILED]')) {
            if (statusText) {
                statusText.innerText = '❌ Pembaruan Domain Gagal!';
                statusText.style.color = '#f87171';
            }
            if (spinner) spinner.style.display = 'none';
            currentDomainEventSource.close();
            currentDomainEventSource = null;
        }
    };

    currentDomainEventSource.onerror = function() {
        if (terminal) {
            terminal.textContent += '\n[SSE INFO] Aliran log selesai atau terputus.\n';
        }
        if (spinner) spinner.style.display = 'none';
        if (currentDomainEventSource) {
            currentDomainEventSource.close();
            currentDomainEventSource = null;
        }
    };
}

window.openDomainModal = openDomainModal;
window.closeDomainModal = closeDomainModal;
window.updateDomainPreview = updateDomainPreview;
window.startDomainUpdateStream = startDomainUpdateStream;
window.runDomainPrecheck = runDomainPrecheck;

// =========================================================================
// TUNING SERVER MODAL & SSE STREAMING HANDLER
// =========================================================================
let currentTuningEventSource = null;

function openTuningModal(presetId) {
    let p = globalPresets.find(item => String(item.id) === String(presetId));
    if (!p && window.sharedPresets && Array.isArray(window.sharedPresets)) {
        p = window.sharedPresets.find(item => String(item.id) === String(presetId));
    }
    if (!p) {
        console.warn('[TuningModal] Preset not found in globalPresets for ID:', presetId);
        p = { id: presetId, vpsIp: 'Target Server', vpsUser: 'asepsuryadi', name: 'Server ' + presetId };
    }

    const backdrop = document.getElementById('tuning-modal-backdrop');
    const inputPresetId = document.getElementById('tuning-modal-preset-id');
    const targetInfo = document.getElementById('tuning-modal-target-info');
    const formArea = document.getElementById('tuning-modal-form-area');
    const terminalArea = document.getElementById('tuning-modal-terminal-area');
    const terminal = document.getElementById('tuning-stream-terminal');
    const applyBtn = document.getElementById('tuning-modal-apply-btn');

    if (!backdrop) {
        console.error('[TuningModal] #tuning-modal-backdrop element not found in DOM.');
        alert('Modal tuning belum terpasang di DOM. Harap refresh halaman.');
        return;
    }

    if (inputPresetId) inputPresetId.value = p.id;
    if (targetInfo) targetInfo.innerText = `${p.vpsIp} (${p.vpsUser || 'asepsuryadi'}) - ${p.name || 'Server'}`;
    if (formArea) formArea.style.display = 'block';
    if (terminalArea) terminalArea.style.display = 'none';
    if (terminal) terminal.textContent = '';
    if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.innerHTML = '🚀 Jalankan Tuning Server Sekarang';
    }

    backdrop.style.display = 'flex';

    // Otomatis jalankan inspeksi / pre-check kondisi parameter sistem saat modal dibuka
    runTuningPrecheck(p.id);
}

async function runTuningPrecheck(presetId) {
    if (!presetId) {
        presetId = document.getElementById('tuning-modal-preset-id')?.value;
    }
    if (!presetId) return;

    const badge = document.getElementById('tuning-precheck-badge');
    const content = document.getElementById('tuning-precheck-content');

    if (badge) {
        badge.innerText = '⏳ Memeriksa...';
        badge.style.background = 'rgba(59,130,246,0.15)';
        badge.style.color = '#60a5fa';
        badge.style.borderColor = 'rgba(59,130,246,0.3)';
    }

    if (content) {
        content.innerHTML = `
            <div style="text-align: center; padding: 10px 0; color: #94a3b8;">
                <span class="spinner" style="width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #f472b6; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 6px;"></span>
                Sedang membaca parameter kernel sysctl, conntrack, memory, dan limits di VPS...
            </div>
        `;
    }

    try {
        const res = await fetch('/api/audit-hardening-tuning?id=' + encodeURIComponent(presetId));
        const json = await res.json();

        if (!json.success || !json.tuning) {
            throw new Error(json.message || 'Gagal membaca metrik tuning dari VPS.');
        }

        const t = json.tuning;
        const s = t.sysctl || {};
        const mem = t.memory || {};
        const tz = t.timezone || {};
        const pg = t.absentaConfig?.postgres || {};
        const rd = t.absentaConfig?.redis || {};

        // Evaluasi Kriteria Parameter
        const isConntrackOk = (s.conntrackMax || 0) >= 262144;
        const isBbrOk = (s.congestionControl || '').toLowerCase() === 'bbr';
        const isSomaxOk = (s.somaxconn || 0) >= 32768;
        const isTwReuseOk = (s.tcpTwReuse || 0) === 1;
        const isIpFwdOk = (s.ipForward || 0) === 1;
        const isLimitsOk = t.limits?.passed === true;
        const isDockerOk = t.docker?.configured === true;
        const isPgOk = pg.configured === true;
        const isRdOk = rd.configured === true;
        const isNtpOk = tz.clockSynced === true || tz.ntpActive === true;

        const checks = [isConntrackOk, isBbrOk, isSomaxOk, isTwReuseOk, isIpFwdOk, isLimitsOk, isDockerOk, (isPgOk && isRdOk), isNtpOk];
        const passedCount = checks.filter(Boolean).length;
        const totalChecks = checks.length;
        const isFullyTuned = passedCount === totalChecks;

        if (badge) {
            if (isFullyTuned) {
                badge.innerText = `✅ Optimal (${passedCount}/${totalChecks})`;
                badge.style.background = 'rgba(52,211,153,0.15)';
                badge.style.color = '#34d399';
                badge.style.borderColor = 'rgba(52,211,153,0.3)';
            } else {
                badge.innerText = `⚠️ Perlu Tuning (${passedCount}/${totalChecks} Optimal)`;
                badge.style.background = 'rgba(251,191,36,0.15)';
                badge.style.color = '#fbbf24';
                badge.style.borderColor = 'rgba(251,191,36,0.3)';
            }
        }

        const renderItem = (label, currentVal, isOk, expectedVal) => `
            <div style="background: rgba(30,41,59,0.7); padding: 7px 10px; border-radius: 8px; border: 1px solid ${isOk ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">${label}</div>
                    <div style="font-family: 'Fira Code', monospace; font-size: 11.5px; font-weight: 600; color: ${isOk ? '#34d399' : '#f87171'}; margin-top: 1px;">
                        ${currentVal}
                    </div>
                </div>
                <div>
                    <span style="font-size: 9.5px; padding: 2px 6px; border-radius: 4px; font-weight: 700; ${isOk ? 'background: rgba(52,211,153,0.2); color: #34d399;' : 'background: rgba(239,68,68,0.2); color: #f87171;'}">
                        ${isOk ? 'Optimal ✅' : 'Default (Perlu Tuning) ⚠️'}
                    </span>
                </div>
            </div>
        `;

        if (content) {
            content.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin-top: 2px;">
                    ${renderItem('1. WireGuard Conntrack', s.conntrackMax ? s.conntrackMax.toLocaleString() + ' sesi' : 'Default (~65k)', isConntrackOk, '524.288')}
                    ${renderItem('2. TCP Congestion Control', (s.congestionControl || 'cubic').toUpperCase(), isBbrOk, 'BBR')}
                    ${renderItem('3. Socket Queue (SOMAXCONN)', s.somaxconn ? s.somaxconn.toLocaleString() : '128', isSomaxOk, '65.535')}
                    ${renderItem('4. TCP Timewait Reuse', s.tcpTwReuse === 1 ? '1 (Aktif)' : '0 (Off)', isTwReuseOk, '1')}
                    ${renderItem('5. IP Packet Forwarding', s.ipForward === 1 ? '1 (Aktif)' : '0 (Off)', isIpFwdOk, '1')}
                    ${renderItem('6. Security File Limits (NOFILE)', isLimitsOk ? '65k - 1M' : '1024 (Default)', isLimitsOk, '65.536')}
                    ${renderItem('7. Postgres DB & Redis Config', isPgOk && isRdOk ? 'Terkonfigurasi Adaptif' : 'Default Bawaan', isPgOk && isRdOk, 'Adaptive')}
                    ${renderItem('8. Docker Log Rotation', isDockerOk ? '50MB x 5 file' : 'Default (Tanpa Limit)', isDockerOk, '50MB x 5')}
                    ${renderItem('9. NTP Clock Sync & Timezone', tz.name ? `${tz.name} (${isNtpOk ? 'Synced' : 'Not Synced'})` : 'UTC', isNtpOk, 'Synced')}
                </div>
                <div style="margin-top: 8px; font-size: 11px; color: ${isFullyTuned ? '#34d399' : '#fbbf24'}; display: flex; align-items: center; gap: 5px;">
                    <span>${isFullyTuned ? '✅' : '💡'}</span> 
                    ${isFullyTuned ? 'Semua parameter kernel & sistem pada VPS ini sudah dalam kondisi 100% optimal!' : 'Parameter bertanda merah di atas akan otomatis dioptimasi saat Anda mengklik tombol jalankan tuning di bawah.'}
                </div>
            `;
        }

        // Auto select timezone if detected
        const tzSelect = document.getElementById('tuning-modal-timezone');
        if (tzSelect && tz.name) {
            const matchOption = Array.from(tzSelect.options).find(o => o.value === tz.name || tz.name.includes(o.value));
            if (matchOption) tzSelect.value = matchOption.value;
        }

    } catch (err) {
        console.error('[TuningPrecheck] Error:', err);
        if (badge) {
            badge.innerText = '❌ Gagal Precheck';
            badge.style.background = 'rgba(239,68,68,0.15)';
            badge.style.color = '#f87171';
            badge.style.borderColor = 'rgba(239,68,68,0.3)';
        }
        if (content) {
            content.innerHTML = `
                <div style="color: #f87171; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; padding: 10px 12px; font-size: 12px;">
                    ⚠️ Gagal membaca parameter VPS: ${err.message || 'Koneksi SSH timeout atau error.'}
                    <div style="margin-top: 6px; font-size: 11px; color: #fca5a5;">
                        Anda tetap dapat melanjutkan tuning server secara langsung.
                    </div>
                </div>
            `;
        }
    }
}

function closeTuningModal() {
    const backdrop = document.getElementById('tuning-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';

    if (currentTuningEventSource) {
        currentTuningEventSource.close();
        currentTuningEventSource = null;
    }
}

function startTuningStream() {
    const presetId = document.getElementById('tuning-modal-preset-id')?.value;
    const role = document.getElementById('tuning-modal-role')?.value || 'all-in-one';
    const tz = document.getElementById('tuning-modal-timezone')?.value || 'Asia/Jakarta';

    if (!presetId) {
        alert('ID Preset tidak valid.');
        return;
    }

    const formArea = document.getElementById('tuning-modal-form-area');
    const terminalArea = document.getElementById('tuning-modal-terminal-area');
    const terminal = document.getElementById('tuning-stream-terminal');
    const statusText = document.getElementById('tuning-stream-status');
    const spinner = document.getElementById('tuning-stream-spinner');

    if (formArea) formArea.style.display = 'none';
    if (terminalArea) terminalArea.style.display = 'block';
    if (terminal) terminal.textContent = 'Memulai inisialisasi koneksi SSE stream tuning kernel ke VPS...\n';
    if (statusText) {
        statusText.innerText = '⏳ Menghubungkan & menjalankan skrip tuning remote...';
        statusText.style.color = '#f472b6';
    }
    if (spinner) spinner.style.display = 'inline-block';

    const streamUrl = '/api/stream-tuning?id=' + encodeURIComponent(presetId) +
        '&tz=' + encodeURIComponent(tz) +
        '&role=' + encodeURIComponent(role);

    if (currentTuningEventSource) {
        currentTuningEventSource.close();
    }

    currentTuningEventSource = new EventSource(streamUrl);

    currentTuningEventSource.onmessage = function(e) {
        const line = e.data;
        if (!line) return;

        if (terminal) {
            terminal.textContent += line + '\n';
            terminal.scrollTop = terminal.scrollHeight;
        }

        if (line.includes('[TUNING_COMPLETE]') || line.includes('TUNING SISTEM SELESAI') || line.includes('BERHASIL SELESAI')) {
            if (statusText) {
                statusText.innerText = '✅ Tuning Kernel & Sistem Berhasil Selesai!';
                statusText.style.color = '#34d399';
            }
            if (spinner) spinner.style.display = 'none';
            currentTuningEventSource.close();
            currentTuningEventSource = null;

            // Otomatis refresh hasil pre-check
            runTuningPrecheck(presetId);
        } else if (line.includes('[TUNING_FAILED]') || line.includes('ERROR:')) {
            if (statusText) {
                statusText.innerText = '❌ Proses Tuning Mengalami Kendala!';
                statusText.style.color = '#f87171';
            }
            if (spinner) spinner.style.display = 'none';
            currentTuningEventSource.close();
            currentTuningEventSource = null;
        }
    };

    currentTuningEventSource.onerror = function() {
        if (terminal) {
            terminal.textContent += '\n[SSE INFO] Aliran log selesai atau terputus.\n';
        }
        if (spinner) spinner.style.display = 'none';
        if (currentTuningEventSource) {
            currentTuningEventSource.close();
            currentTuningEventSource = null;
        }
    };
}

window.openTuningModal = openTuningModal;
window.closeTuningModal = closeTuningModal;
window.startTuningStream = startTuningStream;
window.runTuningPrecheck = runTuningPrecheck;

// ==========================================
// IOPS CHECKER & STORAGE BENCHMARK
// ==========================================
let currentIopsPresetId = null;

function openIopsModal(presetId) {
    currentIopsPresetId = presetId;
    const modal = document.getElementById('iops-modal-backdrop');
    const targetLabel = document.getElementById('iops-target-server-label');
    const diskLabel = document.getElementById('iops-target-disk-label');
    const resultContainer = document.getElementById('iops-result-container');
    const loadingContainer = document.getElementById('iops-loading-container');

    if (!modal) return;

    const p = globalPresets.find(item => item.id === presetId);
    if (p) {
        if (targetLabel) targetLabel.innerText = (p.name || 'Server VPS') + ' (' + (p.vpsUser || 'asep') + '@' + (p.vpsIp || '10.10.10.116') + ')';
    } else {
        if (targetLabel) targetLabel.innerText = presetId || '10.10.10.116';
    }

    if (diskLabel) diskLabel.innerText = 'Hardware Disk: Memuat data info storage...';
    if (resultContainer) resultContainer.style.display = 'none';
    if (loadingContainer) loadingContainer.style.display = 'none';

    modal.style.display = 'flex';

    // Otomatis jalankan benchmark saat modal dibuka
    runIopsBenchmark();
}

function closeIopsModal() {
    const modal = document.getElementById('iops-modal-backdrop');
    if (modal) modal.style.display = 'none';
}

function runIopsBenchmark() {
    const presetId = currentIopsPresetId;
    const btn = document.getElementById('iops-run-btn');
    const loadingContainer = document.getElementById('iops-loading-container');
    const resultContainer = document.getElementById('iops-result-container');
    const diskLabel = document.getElementById('iops-target-disk-label');

    if (loadingContainer) loadingContainer.style.display = 'block';
    if (resultContainer) resultContainer.style.display = 'none';
    if (btn) {
        btn.disabled = true;
        btn.innerText = '⏳ Sedang Benchmark (5s)...';
    }

    const apiUrl = '/api/benchmark-iops?id=' + encodeURIComponent(presetId || '');

    fetch(apiUrl)
        .then(res => res.json())
        .then(data => {
            if (loadingContainer) loadingContainer.style.display = 'none';
            if (btn) {
                btn.disabled = false;
                btn.innerText = '⚡ Jalankan Uji IOPS (5 Detik)';
            }

            if (!data.success) {
                alert('Gagal menjalankan benchmark IOPS: ' + (data.message || 'Unknown error'));
                return;
            }

            // Disk info update
            if (diskLabel && data.server) {
                const cleanDisk = data.server.diskInfo || 'Standard Linux SSD';
                diskLabel.innerText = '💽 Drive: ' + cleanDisk;
            }

            // Populate Metrics
            const m = data.metrics || {};
            const e = data.evaluation || {};

            const totalEl = document.getElementById('iops-val-total');
            if (totalEl) totalEl.innerText = (m.totalIops || 0).toLocaleString('id-ID');

            const badgeGrade = document.getElementById('iops-badge-grade');
            if (badgeGrade) {
                badgeGrade.innerText = 'GRADE ' + (data.grade || 'C') + ' • ' + (data.rating || 'Standard');
                badgeGrade.style.color = data.badgeColor || '#38bdf8';
                badgeGrade.style.borderColor = data.badgeColor || '#38bdf8';
                badgeGrade.style.background = (data.badgeColor || '#38bdf8') + '22';
            }

            const readEl = document.getElementById('iops-val-read');
            if (readEl) readEl.innerText = (m.readIops || 0).toLocaleString('id-ID');

            const writeEl = document.getElementById('iops-val-write');
            if (writeEl) writeEl.innerText = (m.writeIops || 0).toLocaleString('id-ID');

            const latEl = document.getElementById('iops-val-latency');
            if (latEl) latEl.innerText = (m.avgLatMs || 0) + ' ms';

            const tpEl = document.getElementById('iops-val-throughput');
            if (tpEl) tpEl.innerText = (m.totalThroughputMb || 0) + ' MB/s';

            // Populate Scenario Evaluations
            const s = data.scenarios || {};

            // 1. Guru
            const guruStatus = document.getElementById('iops-guru-status');
            const guruDesc = document.getElementById('iops-guru-desc');
            if (s.guru) {
                if (guruStatus) {
                    guruStatus.innerText = s.guru.status;
                    guruStatus.style.color = data.badgeColor || '#10b981';
                }
                if (guruDesc) guruDesc.innerText = s.guru.description;
            }

            // 2. Siswa
            const siswaStatus = document.getElementById('iops-siswa-status');
            const siswaDesc = document.getElementById('iops-siswa-desc');
            if (s.siswa) {
                if (siswaStatus) {
                    siswaStatus.innerText = s.siswa.status;
                    siswaStatus.style.color = data.badgeColor || '#10b981';
                }
                if (siswaDesc) siswaDesc.innerText = s.siswa.description;
            }

            // 3. Ortu
            const ortuStatus = document.getElementById('iops-ortu-status');
            const ortuDesc = document.getElementById('iops-ortu-desc');
            if (s.ortu) {
                if (ortuStatus) {
                    ortuStatus.innerText = s.ortu.status;
                    ortuStatus.style.color = data.badgeColor || '#10b981';
                }
                if (ortuDesc) ortuDesc.innerText = s.ortu.description;
            }

            // 4. Terminal RFID
            const termStatus = document.getElementById('iops-terminal-status');
            const termDesc = document.getElementById('iops-terminal-desc');
            if (s.terminal) {
                if (termStatus) {
                    termStatus.innerText = s.terminal.status;
                    termStatus.style.color = data.badgeColor || '#10b981';
                }
                if (termDesc) termDesc.innerText = s.terminal.description;
            }

            // 5. SaaS Multi-Tenant
            const saasStatus = document.getElementById('iops-saas-status');
            const saasDesc = document.getElementById('iops-saas-desc');
            if (s.saas) {
                if (saasStatus) {
                    saasStatus.innerText = s.saas.status;
                    saasStatus.style.color = data.badgeColor || '#10b981';
                }
                if (saasDesc) saasDesc.innerText = s.saas.description;
            }

            // Simpan data metrik terkini & jalankan kalkulator kapasitas
            lastIopsMetrics = data.metrics || {};
            lastIopsGrade = data.grade || 'C';
            calculateServerCapacity();

            if (resultContainer) resultContainer.style.display = 'flex';
        })
        .catch(err => {
            if (loadingContainer) loadingContainer.style.display = 'none';
            if (btn) {
                btn.disabled = false;
                btn.innerText = '⚡ Jalankan Uji IOPS (5 Detik)';
            }
            alert('Terjadi kesalahan jaringan/server saat benchmark IOPS: ' + err.message);
        });
}

// State untuk kalkulator kapasitas
let lastIopsMetrics = { totalIops: 60000, readIops: 40000, writeIops: 20000, avgLatMs: 1.0 };
let lastIopsGrade = 'S';

function calculateServerCapacity() {
    const elSiswa = document.getElementById('calc-input-siswa');
    const elGuru = document.getElementById('calc-input-guru');
    const elOrtu = document.getElementById('calc-input-ortu');

    const elMaxCap = document.getElementById('calc-val-max-capacity');
    const elPeakNeed = document.getElementById('calc-val-peak-needed');
    const elLoadPct = document.getElementById('calc-val-load-percent');
    const elVerdict = document.getElementById('calc-val-verdict-tag');
    const elBarLabel = document.getElementById('calc-bar-label');
    const elLoadBar = document.getElementById('calc-load-bar');
    const elRecBox = document.getElementById('calc-recommendation-box');
    const elRecTitle = document.getElementById('calc-recommendation-title');
    const elRecDesc = document.getElementById('calc-recommendation-desc');

    if (!elSiswa || !elGuru) return;

    const jmlSiswa = Math.max(0, parseInt(elSiswa.value, 10) || 0);
    const jmlGuru = Math.max(0, parseInt(elGuru.value, 10) || 0);
    const jmlOrtu = jmlSiswa; // 1:1 rasio orang tua

    if (elOrtu) {
        elOrtu.value = jmlOrtu.toLocaleString('id-ID') + ' Akun Wali Murid';
    }

    // 1. Hitung Estimasi Peak Concurrent Request Sekolah
    // - Siswa aktif di jam sibuk pagi/rekap: 25%
    // - Orang tua aktif terima notifikasi & buka app di jam masuk: 40%
    // - Guru submit sesi KBM serentak saat pergantian jam: 100%
    // - Tapping RFID background load: diakomodir dalam concurrency
    const peakSiswa = Math.round(jmlSiswa * 0.25);
    const peakOrtu = Math.round(jmlOrtu * 0.40);
    const peakGuru = Math.round(jmlGuru * 1.0);
    const totalPeakNeeded = Math.max(10, peakSiswa + peakOrtu + peakGuru);

    // 2. Hitung Kapasitas Maksimal Server Berdasarkan Hasil Audit IOPS & Latensi
    const totalIops = lastIopsMetrics.totalIops || 2000;
    const avgLatMs = lastIopsMetrics.avgLatMs || 25.0;

    let maxSafeCapacity = 300; // default minimum
    if (totalIops >= 25000 || (totalIops >= 15000 && avgLatMs <= 3.0)) {
        // Grade S: Enterprise NVMe / High-End SSD (Dell T40 + Samsung EVO)
        maxSafeCapacity = Math.round(Math.min(10000, totalIops * 0.11)); // ~6.500 - 8.000 user
    } else if (totalIops >= 8000) {
        // Grade A: Fast Dedicated SSD
        maxSafeCapacity = Math.round(totalIops * 0.14); // ~1.200 - 3.000 user
    } else if (totalIops >= 2500) {
        // Grade B: Standard Cloud SSD VPS
        maxSafeCapacity = Math.round(totalIops * 0.18); // ~500 - 1.200 user
    } else if (totalIops >= 1000) {
        // Grade C: Budget Cloud VPS (Biznet Lisensi)
        maxSafeCapacity = Math.round(Math.max(200, totalIops * 0.22)); // ~250 - 400 user
    } else {
        // Grade D: Slow Disk / HDD
        maxSafeCapacity = Math.round(Math.max(80, totalIops * 0.15)); // < 150 user
    }

    // 3. Hitung Persentase Utilisasi Beban
    const loadPercent = parseFloat(((totalPeakNeeded / maxSafeCapacity) * 100).toFixed(1));

    if (elMaxCap) elMaxCap.innerText = '~' + maxSafeCapacity.toLocaleString('id-ID') + ' Concurrent';
    if (elPeakNeed) elPeakNeed.innerText = '~' + totalPeakNeeded.toLocaleString('id-ID') + ' Concurrent';
    if (elLoadPct) elLoadPct.innerText = loadPercent + '%';

    // 4. Visualisasi & Rekomendasi
    if (elLoadBar) {
        elLoadBar.style.width = Math.min(100, loadPercent) + '%';
    }
    if (elBarLabel) {
        elBarLabel.innerText = loadPercent + '% dari Total Kapasitas Maksimal I/O';
    }

    if (loadPercent <= 50) {
        // Sangat Lega
        const schoolsCount = Math.floor(maxSafeCapacity / Math.max(1, totalPeakNeeded));
        if (elVerdict) {
            elVerdict.innerText = 'SANGAT LEGA (Zero Lag)';
            elVerdict.style.color = '#10b981';
        }
        if (elLoadPct) elLoadPct.style.color = '#10b981';
        if (elLoadBar) elLoadBar.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
        if (elRecBox) {
            elRecBox.style.background = 'rgba(16,185,129,0.08)';
            elRecBox.style.borderColor = 'rgba(16,185,129,0.25)';
        }
        if (elRecTitle) {
            elRecTitle.innerText = '✅ Rekomendasi: Server Sangat Ideal untuk Beban Sekolah Ini';
            elRecTitle.style.color = '#34d399';
        }
        if (elRecDesc) {
            elRecDesc.innerHTML = 'Server ini mampu menampung hingga <strong>~' + maxSafeCapacity.toLocaleString('id-ID') + ' Concurrent User</strong>, sedangkan kebutuhan puncak sekolah Anda hanya <strong>~' + totalPeakNeeded.toLocaleString('id-ID') + ' Concurrent User</strong> (hanya menyerap <strong>' + loadPercent + '%</strong> kapasitas I/O).<br/>' +
                '💡 <em>Kapasitas Multi-Tenant: Server ini sanggup menampung hingga <strong>' + schoolsCount + ' sekolah</strong> dengan skala yang sama secara bersamaan (SaaS Ready).</em>';
        }
    } else if (loadPercent <= 80) {
        // Ideal & Stabil
        if (elVerdict) {
            elVerdict.innerText = 'IDEAL & STABIL (Standar Produksi)';
            elVerdict.style.color = '#38bdf8';
        }
        if (elLoadPct) elLoadPct.style.color = '#38bdf8';
        if (elLoadBar) elLoadBar.style.background = 'linear-gradient(90deg, #0284c7, #38bdf8)';
        if (elRecBox) {
            elRecBox.style.background = 'rgba(56,189,248,0.08)';
            elRecBox.style.borderColor = 'rgba(56,189,248,0.25)';
        }
        if (elRecTitle) {
            elRecTitle.innerText = '✔️ Rekomendasi: Server Memenuhi Standar Produksi Sekolah';
            elRecTitle.style.color = '#38bdf8';
        }
        if (elRecDesc) {
            elRecDesc.innerHTML = 'Server ini beroperasi stabil pada beban <strong>' + loadPercent + '%</strong> saat jam sibuk masuk sekolah. Response time database PostgreSQL dan Redis cache berada pada rentang optimal.';
        }
    } else if (loadPercent <= 100) {
        // Batas Maksimum
        if (elVerdict) {
            elVerdict.innerText = 'MENDEKATI BATAS (Waspada Jam Puncak)';
            elVerdict.style.color = '#f59e0b';
        }
        if (elLoadPct) elLoadPct.style.color = '#f59e0b';
        if (elLoadBar) elLoadBar.style.background = 'linear-gradient(90deg, #d97706, #f59e0b)';
        if (elRecBox) {
            elRecBox.style.background = 'rgba(245,158,11,0.08)';
            elRecBox.style.borderColor = 'rgba(245,158,11,0.25)';
        }
        if (elRecTitle) {
            elRecTitle.innerText = '⚠️ Rekomendasi: Utilisasi Tinggi pada Jam Puncak';
            elRecTitle.style.color = '#fbbf24';
        }
        if (elRecDesc) {
            elRecDesc.innerHTML = 'Kebutuhan puncak sekolah Anda (<strong>~' + totalPeakNeeded.toLocaleString('id-ID') + ' user</strong>) menyerap <strong>' + loadPercent + '%</strong> daya tampung storage (maks <strong>~' + maxSafeCapacity.toLocaleString('id-ID') + ' user</strong>). Saat 55 kelas submit bersamaan dalam 1-2 menit, mungkin terjadi antrean query selama 1-2 detik.';
        }
    } else {
        // Overload
        if (elVerdict) {
            elVerdict.innerText = 'OVERLOAD (Disk I/O Bottleneck)';
            elVerdict.style.color = '#ef4444';
        }
        if (elLoadPct) elLoadPct.style.color = '#ef4444';
        if (elLoadBar) elLoadBar.style.background = 'linear-gradient(90deg, #dc2626, #ef4444)';
        if (elRecBox) {
            elRecBox.style.background = 'rgba(239,68,68,0.08)';
            elRecBox.style.borderColor = 'rgba(239,68,68,0.25)';
        }
        if (elRecTitle) {
            elRecTitle.innerText = '❌ Rekomendasi: Server Tidak Mencukupi untuk Beban Ini';
            elRecTitle.style.color = '#f87171';
        }
        if (elRecDesc) {
            elRecDesc.innerHTML = 'Kapasitas maksimal server ini hanya <strong>~' + maxSafeCapacity.toLocaleString('id-ID') + ' Concurrent User</strong>, sedangkan estimasi beban puncak sekolah Anda mencapai <strong>~' + totalPeakNeeded.toLocaleString('id-ID') + ' Concurrent User</strong> (Beban <strong>' + loadPercent + '%</strong>).<br/>' +
                '🚨 <em>Saran: Tingkatkan storage ke SSD Dedicated NVMe atau pisahkan database PostgreSQL ke server tersendiri untuk menghindari error 504 Gateway Timeout.</em>';
        }
    }
}

window.openIopsModal = openIopsModal;
window.closeIopsModal = closeIopsModal;
window.runIopsBenchmark = runIopsBenchmark;
window.calculateServerCapacity = calculateServerCapacity;



