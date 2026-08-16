let logEventSource = null;
let logLineCount = 0;

function populateLogTargetApps(presetId, selectedApp, callback) {
    const appSelect = document.getElementById('log-target-app');
    if (!appSelect) return;

    const targetPreset = presetId || document.getElementById('log-target-preset')?.value || 'local';
    const currentVal = selectedApp || appSelect.value || 'all';

    appSelect.innerHTML = `
        <option value="all">🌐 SEMUA Aplikasi (Gabungan PM2)</option>
        <option value="" disabled>⌛ Mengambil daftar PM2 dari server...</option>
    `;

    fetch(`/api/pm2-list?id=${encodeURIComponent(targetPreset)}`)
        .then(res => res.json())
        .then(res => {
            let html = '<option value="all">🌐 SEMUA Aplikasi (Gabungan PM2)</option>';
            const rawList = res.data || res.apps || [];
            if (res.success && Array.isArray(rawList) && rawList.length > 0) {
                rawList.forEach(w => {
                    const name = typeof w === 'string' ? w : w.name;
                    const statusIcon = (typeof w === 'object' && w.status === 'online') ? '🟢' : (typeof w === 'object' && w.status === 'stopped' ? '🔴' : '⚙️');
                    const memInfo = (typeof w === 'object' && w.memory_mb) ? ` (${w.memory_mb} MB)` : '';
                    html += `<option value="${name}">${statusIcon} ${name}${memInfo}</option>`;
                });
            } else {
                html += '<option value="" disabled>⚠️ Tidak ada proses PM2 terdeteksi di server ini</option>';
            }

            html += `
                <option value="caddy">🛡️ Reverse Proxy Caddy</option>
                <option value="custom">✏️ Nama/ID Aplikasi Kustom...</option>
            `;

            appSelect.innerHTML = html;
            if (currentVal && Array.from(appSelect.options).some(o => o.value === currentVal)) {
                appSelect.value = currentVal;
            } else {
                appSelect.value = 'all';
            }
            toggleCustomLogAppInput();
            if (typeof callback === 'function') callback();
        })
        .catch(err => {
            console.error('Gagal mengambil daftar PM2 untuk target aplikasi:', err);
            let html = '<option value="all">🌐 SEMUA Aplikasi (Gabungan PM2)</option>';
            html += '<option value="" disabled>⚠️ Gagal membaca daftar PM2 dari server</option>';
            html += `
                <option value="caddy">🛡️ Reverse Proxy Caddy</option>
                <option value="custom">✏️ Nama/ID Aplikasi Kustom...</option>
            `;
            appSelect.innerHTML = html;
            if (currentVal) appSelect.value = currentVal;
            toggleCustomLogAppInput();
            if (typeof callback === 'function') callback();
        });
}

function onLogTargetPresetChange() {
    const selectPreset = document.getElementById('log-target-preset') || document.getElementById('logs-preset-select');
    const presetId = selectPreset ? selectPreset.value : 'local';
    window.activePresetId = presetId;
    populateLogTargetApps(presetId);
}

function populateLogTargetPresets(callback) {
    const select = document.getElementById('log-target-preset') || document.getElementById('logs-preset-select');
    if (!select) return;

    if (typeof window.populatePresetDropdown === 'function') {
        window.populatePresetDropdown(select, { includeLocal: true });
        if (window.activePresetId && select.querySelector(`option[value="${window.activePresetId}"]`)) {
            select.value = window.activePresetId;
        }
        if (select.value) {
            populateLogTargetApps(select.value, null, callback);
        }
    } else {
        fetch('/api/presets')
        .then(res => res.json())
        .then(res => {
            if (res.success && Array.isArray(res.data)) {
                let html = '<option value="local">💻 Server Windows Lokal (Localhost)</option>';
                res.data.forEach(p => {
                    const pName = p.name || ('Server ' + p.vpsIp);
                    const projLabel = p.project === 'licensing' ? '[Server Lisensi]' : '[Project Absenta]';
                    html += `<option value="${p.id}">🌐 ${pName} (${p.vpsIp}) ${projLabel}</option>`;
                });
                select.innerHTML = html;
                if (window.activePresetId && select.querySelector(`option[value="${window.activePresetId}"]`)) {
                    select.value = window.activePresetId;
                }
                if (select.value) {
                    populateLogTargetApps(select.value, null, callback);
                }
            }
        });
    }
}

// Auto populate preset dropdown & bind change event listener saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('log-target-preset') || document.getElementById('logs-preset-select');
    if (select) {
        select.addEventListener('change', () => {
            onLogTargetPresetChange();
        });
    }
    populateLogTargetPresets();
});

function toggleCustomLogAppInput() {
    const appSelect = document.getElementById('log-target-app');
    const customGroup = document.getElementById('log-custom-app-group');
    if (appSelect && customGroup) {
        customGroup.style.display = appSelect.value === 'custom' ? 'block' : 'none';
    }
}

function startPm2LogStreamUI(targetPresetId, targetApp) {
    stopPm2LogStreamUI();

    const presetId = targetPresetId || document.getElementById('log-target-preset')?.value || 'local';
    let appName = targetApp || document.getElementById('log-target-app')?.value || 'all';

    if (appName === 'custom') {
        const customInput = document.getElementById('log-custom-app-name')?.value?.trim();
        appName = customInput || 'all';
    }

    const startBtn = document.getElementById('btn-start-log-stream');
    const stopBtn = document.getElementById('btn-stop-log-stream');
    const termTitle = document.getElementById('log-terminal-title');
    const container = document.getElementById('log-terminal-output');

    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-flex';
    if (container) {
        container.innerHTML = '';
        logLineCount = 0;
        updateLogLineCounter();
    }

    if (termTitle) {
        termTitle.innerHTML = `bash - streaming pm2 logs (${presetId === 'local' ? 'Localhost' : 'Remote VPS'}) [App: ${appName}]`;
    }

    const url = `/api/stream-pm2-logs?id=${encodeURIComponent(presetId)}&app=${encodeURIComponent(appName)}&lines=100`;
    logEventSource = new EventSource(url);

    logEventSource.onmessage = function(event) {
        const line = event.data;
        appendLogLineToTerminal(line);
    };

    logEventSource.onerror = function(err) {
        console.warn('Log SSE Connection closed or error:', err);
        appendLogLineToTerminal('[INFO] Aliran log terhenti.');
        stopPm2LogStreamUI();
    };
}

function stopPm2LogStreamUI() {
    if (logEventSource) {
        logEventSource.close();
        logEventSource = null;
    }

    const startBtn = document.getElementById('btn-start-log-stream');
    const stopBtn = document.getElementById('btn-stop-log-stream');
    if (startBtn) startBtn.style.display = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
}

function appendLogLineToTerminal(line) {
    const container = document.getElementById('log-terminal-output');
    const autoscroll = document.getElementById('log-autoscroll-check')?.checked;
    if (!container) return;

    logLineCount++;
    updateLogLineCounter();

    const div = document.createElement('div');
    div.style.fontFamily = "'Fira Code', monospace";
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordBreak = 'break-all';

    // Highlight error/warn
    if (line.includes('error') || line.includes('ERROR') || line.includes('Err') || line.includes('❌')) {
        div.style.color = '#f87171';
    } else if (line.includes('warn') || line.includes('WARN') || line.includes('⚠️')) {
        div.style.color = '#fbbf24';
    } else if (line.includes('[LOG_STREAM_START]') || line.includes('Memulai Stream')) {
        div.style.color = '#a78bfa';
        div.style.fontWeight = 'bold';
    } else {
        div.style.color = '#6ee7b7';
    }

    div.textContent = line;
    container.appendChild(div);

    if (autoscroll) {
        container.scrollTop = container.scrollHeight;
    }
}

function clearLogTerminalUI() {
    const container = document.getElementById('log-terminal-output');
    if (container) {
        container.innerHTML = '<div style="color: var(--text-muted); padding: 10px;">Terminal dibersihkan.</div>';
    }
    logLineCount = 0;
    updateLogLineCounter();
}

function updateLogLineCounter() {
    const counter = document.getElementById('log-lines-counter');
    if (counter) {
        counter.innerText = `${logLineCount} baris`;
    }
}

function flushPm2LogsFromUI() {
    const presetId = document.getElementById('log-target-preset')?.value || 'local';
    if (!confirm('Apakah Anda yakin ingin membersihkan seluruh log PM2 (pm2 flush)?')) return;

    fetch(`/api/flush-pm2-logs?id=${encodeURIComponent(presetId)}`)
    .then(r => r.json())
    .then(res => {
        alert(res.message);
        clearLogTerminalUI();
    })
    .catch(err => alert('Gagal flush log: ' + err.message));
}

function openLogMonitorForPreset(presetId, appName) {
    if (typeof switchAppMode === 'function') {
        switchAppMode('logs');
    }
    populateLogTargetPresets(() => {
        const selectPreset = document.getElementById('log-target-preset');
        if (selectPreset) {
            selectPreset.value = presetId;
        }
        populateLogTargetApps(presetId, appName || 'all', () => {
            startPm2LogStreamUI(presetId, appName || 'all');
        });
    });
}
