let logEventSource = null;
let logLineCount = 0;

function populateLogTargetPresets(callback) {
    const select = document.getElementById('log-target-preset');
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
        .catch(err => {
            console.error('Gagal mengambil data preset untuk log monitor:', err);
            renderSelectOptions([]);
        });
    }
}

// Auto populate preset dropdown saat halaman selesai dimuat
document.addEventListener('DOMContentLoaded', () => {
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
        startPm2LogStreamUI(presetId, appName || 'all');
    });
}
