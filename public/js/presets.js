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
        const projName = p.project === 'licensing' ? 'Server Lisensi (VPS)' : 'Project Absenta (Full Stack)';
        const projBadgeClass = p.project === 'licensing' ? 'badge-blue' : 'badge-purple';
        const keyName = p.sshKeyChoice || 'nginxonly.pem';
        const pName = p.name || ('Server ' + p.vpsIp);
        const pUser = p.vpsUser || 'asepsuryadi';
        const safeId = p.id;

        html += '<div class="preset-card" id="pcard-' + safeId + '">' +
            '<div>' +
                '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">' +
                    '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                        '<span class="badge ' + projBadgeClass + '">' + projName + '</span>' +
                        (p.project === 'licensing' ? '<span class="badge" style="background:rgba(' + (p.buildMode === 'local' ? '52,211,153' : '59,130,246') + ',0.12);color:' + (p.buildMode === 'local' ? '#34d399' : '#60a5fa') + ';border:1px solid rgba(' + (p.buildMode === 'local' ? '52,211,153' : '59,130,246') + ',0.3);font-size:10px;">' + (p.buildMode === 'local' ? '🖥️ Local Build' : '☁️ Remote Build') + '</span>' : '') +
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
        buildMode: buildMode || 'local'
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

    const eventSource = new EventSource('/api/stream-quick-update?id=' + encodeURIComponent(presetId));

    eventSource.onmessage = function(event) {
        const line = event.data;

        if (line === '[UPDATE_COMPLETE]') {
            eventSource.close();
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

        const ram = d.ram_usage || '0%';
        const disk = d.disk_usage || '0%';
        const uptime = d.uptime || '0m';
        const latency = d.latency || 'N/A';

        content.innerHTML =
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' +
                '<div>' + dot(wgOk) + 'WireGuard: ' + badge(wgOk, 'UP', 'DOWN') + '</div>' +
                '<div>' + dot(caddyOk) + 'Caddy: ' + badge(caddyOk, 'active', 'mati') + '</div>' +
                '<div>' + dot(pm2Ok) + 'PM2: ' + badge(pm2Ok, 'running', 'mati') + '</div>' +
                '<div>' + dot(timerOk) + 'Watchdog: ' + badge(timerOk, 'aktif', 'belum pasang') + '</div>' +
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
