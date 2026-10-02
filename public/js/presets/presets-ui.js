// =============================================================================
// ABSENTA DEPLOYER - PRESETS UI & MODAL MANAGEMENT MODULE (MASTER-DETAIL)
// Menangani tampilan inventory list server, focused server workspace, & modal CRUD.
// =============================================================================

window.currentSelectedPresetId = null;

function loadPresets() {
    if (typeof window.fetchSharedPresets === 'function') {
        window.fetchSharedPresets(true).then(presets => {
            window.globalPresets = presets;
            renderPresetsGrid(presets);
            if (typeof populateLogTargetPresets === 'function') {
                populateLogTargetPresets();
            }
            // Jika ada server yang sedang dibuka di workspace, refresh datanya
            if (window.currentSelectedPresetId) {
                const refreshed = presets.find(item => item.id === window.currentSelectedPresetId);
                if (refreshed) {
                    selectPresetServer(window.currentSelectedPresetId);
                } else {
                    showPresetsListView();
                }
            }
        });
    } else {
        fetch('/api/presets')
        .then(res => res.json())
        .then(res => {
            if (res.success && res.data) {
                window.globalPresets = res.data;
                renderPresetsGrid(res.data);
            }
        });
    }
}

function filterPresetsList() {
    const searchInput = document.getElementById('preset-search-input');
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const presets = window.globalPresets || [];

    if (!query) {
        renderPresetsGrid(presets);
        return;
    }

    const filtered = presets.filter(p => {
        const name = (p.name || '').toLowerCase();
        const ip = (p.vpsIp || '').toLowerCase();
        const user = (p.vpsUser || '').toLowerCase();
        const project = (p.project || '').toLowerCase();
        return name.includes(query) || ip.includes(query) || user.includes(query) || project.includes(query);
    });

    renderPresetsGrid(filtered);
}

function showPresetsListView() {
    const inventorySec = document.getElementById('presets-inventory-section');
    const workspaceSec = document.getElementById('presets-workspace-section');
    if (inventorySec) inventorySec.style.display = 'block';
    if (workspaceSec) workspaceSec.style.display = 'none';
    window.currentSelectedPresetId = null;
}

function selectPresetServer(presetId) {
    const p = (window.globalPresets || []).find(item => item.id === presetId);
    if (!p) return;

    window.currentSelectedPresetId = presetId;

    const inventorySec = document.getElementById('presets-inventory-section');
    const workspaceSec = document.getElementById('presets-workspace-section');
    if (inventorySec) inventorySec.style.display = 'none';
    if (workspaceSec) workspaceSec.style.display = 'block';

    // Populate Hero Spec
    const pName = p.name || ('Server ' + p.vpsIp);
    const projName = p.project === 'licensing' ? 'Server Lisensi (VPS)' : (p.project === 'undangan' ? 'Undangan Digital' : (p.project === 'rekber' ? 'Rekening Bersama' : 'Project Absenta'));
    const projBadgeClass = p.project === 'licensing' ? 'badge-blue' : (p.project === 'undangan' ? 'badge-blue' : (p.project === 'rekber' ? 'badge-blue' : 'badge-purple'));

    const buildBadgeText = p.buildMode === 'skip' ? '🚀 Skip Build' : (p.buildMode === 'local' ? '🖥️ Local Build' : '☁️ Remote Build');
    const buildBadgeColor = p.buildMode === 'skip' ? '#fbbf24' : (p.buildMode === 'local' ? '#34d399' : '#60a5fa');
    const buildBadgeRgb = p.buildMode === 'skip' ? '251,191,36' : (p.buildMode === 'local' ? '52,211,153' : '59,130,246');

    const obfBadgeText = p.obfuscate === 'Y' ? '🛡️ Obfuscate: On' : '⚡ Obfuscate: Off';
    const obfBadgeColor = p.obfuscate === 'Y' ? '#a78bfa' : '#94a3b8';
    const obfBadgeRgb = p.obfuscate === 'Y' ? '167,139,250' : '148,163,184';

    const breadcrumbEl = document.getElementById('ws-breadcrumb-server-name');
    if (breadcrumbEl) breadcrumbEl.innerText = pName;

    const serverNameEl = document.getElementById('ws-server-name');
    if (serverNameEl) serverNameEl.innerText = pName;

    const serverIpEl = document.getElementById('ws-server-ip');
    if (serverIpEl) serverIpEl.innerText = p.vpsIp;

    const serverUserEl = document.getElementById('ws-server-user');
    if (serverUserEl) serverUserEl.innerText = p.vpsUser || 'asepsuryadi';

    const serverKeyEl = document.getElementById('ws-server-key');
    if (serverKeyEl) serverKeyEl.innerText = p.sshKeyChoice || 'nginxonly.pem';

    const projBadgeEl = document.getElementById('ws-project-badge');
    if (projBadgeEl) {
        projBadgeEl.className = 'badge ' + projBadgeClass;
        projBadgeEl.innerText = projName;
    }

    const buildBadgeEl = document.getElementById('ws-buildmode-badge');
    if (buildBadgeEl) {
        buildBadgeEl.innerText = buildBadgeText;
        buildBadgeEl.style.background = 'rgba(' + buildBadgeRgb + ',0.15)';
        buildBadgeEl.style.color = buildBadgeColor;
        buildBadgeEl.style.borderColor = 'rgba(' + buildBadgeRgb + ',0.3)';
    }

    const obfBadgeEl = document.getElementById('ws-obfuscate-badge');
    if (obfBadgeEl) {
        obfBadgeEl.innerText = obfBadgeText;
        obfBadgeEl.style.background = 'rgba(' + obfBadgeRgb + ',0.15)';
        obfBadgeEl.style.color = obfBadgeColor;
        obfBadgeEl.style.borderColor = 'rgba(' + obfBadgeRgb + ',0.3)';
    }

    // Reset temporary feedback panels
    const connPanel = document.getElementById('ws-conn-panel');
    if (connPanel) connPanel.style.display = 'none';

    const watchdogPanel = document.getElementById('ws-watchdog-panel');
    if (watchdogPanel) watchdogPanel.style.display = 'none';

    const pingBtn = document.getElementById('ws-ping-btn');
    if (pingBtn) {
        pingBtn.innerHTML = '🔌 Tes Koneksi Live';
        pingBtn.disabled = false;
        pingBtn.style.color = '#34d399';
        pingBtn.style.borderColor = 'rgba(52,211,153,0.4)';
    }

    // Scroll workspace into view smoothly
    workspaceSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPresetsGrid(presets) {
    const grid = document.getElementById('presets-grid-container');
    const countBadge = document.getElementById('presets-count-badge');
    if (!grid) return;

    const totalCount = (presets || []).length;
    if (countBadge) {
        countBadge.innerText = totalCount + ' Server Terdaftar';
    }

    if (!presets || presets.length === 0) {
        grid.innerHTML = '<div style="text-align: center; padding: 50px 20px; background: rgba(30,41,59,0.3); border: 1px dashed var(--glass-border); border-radius: 16px; color: var(--text-muted);">' +
            '<div style="font-size: 32px; margin-bottom: 10px;">🔍</div>' +
            '<div style="font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 6px;">Tidak ada server yang cocok</div>' +
            '<div style="font-size: 13px;">Belum ada server tersimpan atau kata kunci pencarian tidak ditemukan.</div>' +
            '</div>';
        return;
    }

    let html = '';
    presets.forEach(p => {
        const projName = p.project === 'licensing' ? 'Server Lisensi' : (p.project === 'undangan' ? 'Undangan Studio' : (p.project === 'rekber' ? 'Rekber Gateway' : 'Project Absenta'));
        const projBadgeClass = p.project === 'licensing' ? 'badge-blue' : (p.project === 'undangan' ? 'badge-blue' : (p.project === 'rekber' ? 'badge-blue' : 'badge-purple'));
        const projIcon = p.project === 'licensing' ? '🔑' : (p.project === 'undangan' ? '💌' : (p.project === 'rekber' ? '💳' : '🏫'));
        
        const pName = p.name || ('Server ' + p.vpsIp);
        const pUser = p.vpsUser || 'asepsuryadi';
        const keyName = p.sshKeyChoice || 'nginxonly.pem';
        const safeId = p.id;

        const buildBadgeText = p.buildMode === 'skip' ? '🚀 Skip' : (p.buildMode === 'local' ? '🖥️ Local' : '☁️ Remote');
        const buildBadgeColor = p.buildMode === 'skip' ? '#fbbf24' : (p.buildMode === 'local' ? '#34d399' : '#60a5fa');
        const buildBadgeRgb = p.buildMode === 'skip' ? '251,191,36' : (p.buildMode === 'local' ? '52,211,153' : '59,130,246');

        html += '<div class="server-row-card" onclick="selectPresetServer(\'' + safeId + '\')">' +
            '<div class="server-row-identity">' +
                '<div class="server-avatar-icon">' + projIcon + '</div>' +
                '<div class="server-row-meta">' +
                    '<div class="server-row-name">' +
                        '<span>' + pName + '</span>' +
                        '<span class="badge ' + projBadgeClass + '" style="font-size: 10.5px; padding: 2px 8px;">' + projName + '</span>' +
                    '</div>' +
                    '<div class="server-row-sub">' +
                        '<span style="color: #34d399; font-weight: 700;">●</span> ' + p.vpsIp + ' &nbsp;|&nbsp; 👤 ' + pUser + ' &nbsp;|&nbsp; 🔑 ' + keyName +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="server-row-badges">' +
                '<span class="badge" style="background:rgba(' + buildBadgeRgb + ',0.12);color:' + buildBadgeColor + ';border:1px solid rgba(' + buildBadgeRgb + ',0.3);font-size:11px;">' + buildBadgeText + '</span>' +
                (p.obfuscate === 'Y' ? '<span class="badge" style="background:rgba(167,139,250,0.12);color:#a78bfa;border:1px solid rgba(167,139,250,0.3);font-size:11px;">🛡️ Obfuscated</span>' : '') +
            '</div>' +

            '<div class="server-row-actions" onclick="event.stopPropagation()">' +
                '<button class="btn btn-primary" type="button" style="padding: 8px 16px; font-size: 12.5px; font-weight: 700; display: flex; align-items: center; gap: 6px;" onclick="selectPresetServer(\'' + safeId + '\')">' +
                    '⚡ Kelola Server →' +
                '</button>' +
                '<button class="btn-action-inline" title="Edit Data Server" style="padding: 7px 10px; font-size: 12px;" onclick="openPresetModal(\'' + safeId + '\')">✏️</button>' +
                '<button class="btn-action-inline" title="Hapus Server" style="padding: 7px 10px; font-size: 12px; border-color: rgba(239,68,68,0.5); color: #f87171; background: rgba(239,68,68,0.12);" onclick="deletePreset(\'' + safeId + '\')">🗑️</button>' +
            '</div>' +
        '</div>';
    });
    grid.innerHTML = html;
}

// =============================================================================
// WORKSPACE SPECIFIC ACTIONS & DIAGNOSTICS
// =============================================================================

function testWorkspaceConnection() {
    const presetId = window.currentSelectedPresetId;
    if (!presetId) return;

    const btn = document.getElementById('ws-ping-btn');
    const panel = document.getElementById('ws-conn-panel');
    const content = document.getElementById('ws-conn-content');
    if (!panel || !content) return;

    panel.style.display = 'block';
    content.innerHTML = '<span style="color:#6ee7b7;font-family:monospace;">⏳ Menghubungkan via SSH & menguji latency...</span>';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Menguji...';
    }

    fetch('/api/test-connection?id=' + encodeURIComponent(presetId))
        .then(r => r.json())
        .then(res => {
            if (btn) btn.disabled = false;
            if (!res.success) {
                if (btn) {
                    btn.innerHTML = '❌ Gagal';
                    btn.style.color = '#f87171';
                }
                content.innerHTML =
                    '<div style="color:#f87171;font-weight:700;">❌ ' + (res.offline ? 'VPS Offline / Tidak Terjangkau' : 'Koneksi Gagal') + '</div>' +
                    '<div style="color:var(--text-muted);margin-top:4px;font-size:12px;font-family:monospace;">' + (res.message || '') + '</div>';
                return;
            }

            if (btn) {
                btn.innerHTML = '✅ ' + res.latency_ms + 'ms';
                btn.style.color = '#34d399';
            }

            const latColor = res.latency_ms < 100 ? '#34d399' : res.latency_ms < 300 ? '#fbbf24' : '#f87171';
            const caddyOk = res.caddy === 'active';
            const pm2Lines = res.pm2 && res.pm2 !== 'N/A'
                ? res.pm2.split(',').filter(Boolean).map(s => {
                    const [name, status] = s.split(':');
                    const ok = status === 'online';
                    return '<span style="display:inline-block;margin-right:10px;color:' + (ok ? '#34d399' : '#f87171') + ';">' +
                        (ok ? '●' : '○') + ' ' + (name || s) + '</span>';
                }).join('') : '<span style="color:var(--text-muted);">N/A</span>';

            content.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:8px;">' +
                    '<div style="font-weight:700;color:#34d399;">✅ Koneksi SSH & System Health Berhasil Divalidasi</div>' +
                    '<button onclick="document.getElementById(\'ws-conn-panel\').style.display=\'none\'" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;">✕ Tutup</button>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px;font-size:12px;">' +
                    '<div>⚡ Latency: <strong style="color:' + latColor + ';">' + res.latency_ms + ' ms</strong></div>' +
                    '<div>⏱️ Uptime: <strong style="color:#6ee7b7;">' + res.uptime + '</strong></div>' +
                    '<div>🧠 RAM: <strong style="color:#a78bfa;">' + res.ram + '</strong></div>' +
                    '<div>💾 Disk: <strong style="color:#38bdf8;">' + res.disk + '</strong></div>' +
                    '<div>🌐 Caddy SSL: <strong style="color:' + (caddyOk ? '#34d399' : '#f87171') + ';">' + (caddyOk ? 'active ✅' : res.caddy + ' ⚠️') + '</strong></div>' +
                '</div>' +
                '<div style="margin-top:10px;font-size:12px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">📦 PM2 Services: ' + pm2Lines + '</div>';
        })
        .catch(err => {
            if (btn) btn.disabled = false;
            content.innerHTML = '<div style="color:#f87171;">❌ Error: ' + err.message + '</div>';
        });
}

function checkWorkspaceWatchdog() {
    const presetId = window.currentSelectedPresetId;
    if (!presetId) return;

    const panel = document.getElementById('ws-watchdog-panel');
    const content = document.getElementById('ws-watchdog-content');
    if (!panel || !content) return;

    panel.style.display = 'block';
    content.innerHTML = '<span style="color:#a78bfa;font-family:monospace;">⏳ Mengambil status daemon watchdog di VPS...</span>';

    fetch('/api/watchdog-status?id=' + encodeURIComponent(presetId))
        .then(r => r.json())
        .then(res => {
            if (!res.success) {
                content.innerHTML = '<div style="color:#f87171;">❌ ' + (res.message || 'Gagal mengambil status watchdog') + '</div>';
                return;
            }
            content.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                    '<div style="color:#e2e8f0;font-size:12.5px;">Status Timer Watchdog: <strong style="color:#34d399;">' + (res.timerStatus || 'Active') + '</strong></div>' +
                    '<button onclick="document.getElementById(\'ws-watchdog-panel\').style.display=\'none\'" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;">✕ Tutup</button>' +
                '</div>' +
                '<pre style="background:#090d16;padding:10px;border-radius:8px;font-family:\'Fira Code\',monospace;font-size:11.5px;color:#a5f3fc;overflow-x:auto;max-height:180px;line-height:1.5;">' + (res.logs || res.message || 'Daemon aktif normal.') + '</pre>';
        })
        .catch(err => {
            content.innerHTML = '<div style="color:#f87171;">❌ Error: ' + err.message + '</div>';
        });
}

function auditWorkspaceTunnel() {
    if (window.currentSelectedPresetId && typeof auditTunnelPreset === 'function') {
        auditTunnelPreset(window.currentSelectedPresetId);
    }
}

function fixWorkspaceTunnel() {
    if (window.currentSelectedPresetId && typeof fixTunnelPreset === 'function') {
        fixTunnelPreset(window.currentSelectedPresetId);
    }
}

function runWorkspaceQuickUpdate() {
    if (window.currentSelectedPresetId && typeof runQuickUpdatePreset === 'function') {
        runQuickUpdatePreset(window.currentSelectedPresetId);
    }
}

function openWorkspaceDomainModal() {
    if (window.currentSelectedPresetId && typeof openDomainModal === 'function') {
        openDomainModal(window.currentSelectedPresetId);
    }
}

function runWorkspaceSeedWilayah() {
    if (window.currentSelectedPresetId && typeof runSeedWilayahPreset === 'function') {
        runSeedWilayahPreset(window.currentSelectedPresetId);
    }
}

function openWorkspaceHealth() {
    if (window.currentSelectedPresetId && typeof openHealthMatrixForPreset === 'function') {
        openHealthMatrixForPreset(window.currentSelectedPresetId);
    }
}

function openWorkspaceLogs() {
    if (window.currentSelectedPresetId && typeof openLogMonitorForPreset === 'function') {
        openLogMonitorForPreset(window.currentSelectedPresetId);
    }
}

function openWorkspaceTuning() {
    if (window.currentSelectedPresetId && typeof openTuningModal === 'function') {
        openTuningModal(window.currentSelectedPresetId);
    }
}

function openWorkspaceIops() {
    if (window.currentSelectedPresetId && typeof openIopsModal === 'function') {
        openIopsModal(window.currentSelectedPresetId);
    }
}

function editCurrentSelectedPreset() {
    if (window.currentSelectedPresetId) {
        openPresetModal(window.currentSelectedPresetId);
    }
}

function deleteCurrentSelectedPreset() {
    if (window.currentSelectedPresetId) {
        deletePreset(window.currentSelectedPresetId);
    }
}

// =============================================================================
// PRESET MODAL CRUD OPERATIONS
// =============================================================================

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
        const p = (window.globalPresets || []).find(item => item.id === presetId);
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
                input.style.border = '1px solid rgba(52,211,153,0.6)';
                setTimeout(() => { input.style.border = ''; }, 2000);
            } else if (res.success && !res.path) {
                // User cancelled
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
            if (window.currentSelectedPresetId === id) {
                showPresetsListView();
            }
            loadPresets();
        }
    });
}

// Global Export
window.loadPresets = loadPresets;
window.filterPresetsList = filterPresetsList;
window.showPresetsListView = showPresetsListView;
window.selectPresetServer = selectPresetServer;
window.renderPresetsGrid = renderPresetsGrid;
window.testWorkspaceConnection = testWorkspaceConnection;
window.checkWorkspaceWatchdog = checkWorkspaceWatchdog;
window.auditWorkspaceTunnel = auditWorkspaceTunnel;
window.fixWorkspaceTunnel = fixWorkspaceTunnel;
window.runWorkspaceQuickUpdate = runWorkspaceQuickUpdate;
window.openWorkspaceDomainModal = openWorkspaceDomainModal;
window.runWorkspaceSeedWilayah = runWorkspaceSeedWilayah;
window.openWorkspaceHealth = openWorkspaceHealth;
window.openWorkspaceLogs = openWorkspaceLogs;
window.openWorkspaceTuning = openWorkspaceTuning;
window.openWorkspaceIops = openWorkspaceIops;
window.editCurrentSelectedPreset = editCurrentSelectedPreset;
window.deleteCurrentSelectedPreset = deleteCurrentSelectedPreset;
window.openPresetModal = openPresetModal;
window.closePresetModal = closePresetModal;
window.togglePresetCustomKey = togglePresetCustomKey;
window.toggleBuildModeField = toggleBuildModeField;
window.browseSSHKeyFile = browseSSHKeyFile;
window.savePresetSubmit = savePresetSubmit;
window.deletePreset = deletePreset;
