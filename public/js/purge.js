/**
 * purge.js - Client-Side Controller untuk Factory Reset VPS (Zero-Residue Purge)
 * Menghubungkan Web GUI Deployer ke easy-purge.ps1 via Server-Sent Events (SSE).
 */

let purgeEventSource = null;
let currentPurgeKey = null;

async function openPurgeModal(preselectedPresetId) {
    const modal = document.getElementById('purge-modal-backdrop');
    if (!modal) return;

    // Reset UI State
    document.getElementById('purge-modal-form-area').style.display = 'block';
    document.getElementById('purge-modal-terminal-area').style.display = 'none';
    document.getElementById('purge-stream-terminal').textContent = '';
    document.getElementById('purge-confirm-text').value = '';
    
    const execBtn = document.getElementById('purge-execute-btn');
    execBtn.disabled = true;
    execBtn.style.opacity = '0.5';
    execBtn.style.cursor = 'not-allowed';

    modal.style.display = 'flex';

    // Populate Preset Selector
    await populatePurgePresets(preselectedPresetId);

    // Default mode 1
    onPurgeModeSelect('1');
}

function openPurgeModalForCurrentServer() {
    const currentId = window.currentSelectedPresetId || null;
    openPurgeModal(currentId);
}

function closePurgeModal() {
    const modal = document.getElementById('purge-modal-backdrop');
    if (modal) modal.style.display = 'none';
    if (purgeEventSource) {
        purgeEventSource.close();
        purgeEventSource = null;
    }
}

async function populatePurgePresets(preselectedId) {
    const select = document.getElementById('purge-modal-preset-select');
    if (!select) return;

    select.innerHTML = '<option value="">Memuat daftar server...</option>';

    try {
        let presets = window.globalPresets;
        if (!presets || !Array.isArray(presets) || presets.length === 0) {
            const res = await fetch('/api/presets');
            const json = await res.json();
            presets = json.data || json.presets || [];
            window.globalPresets = presets;
        }

        let html = '<option value="">-- Pilih Server dari Preset --</option>';
        presets.forEach(p => {
            const isSel = (preselectedId && p.id === preselectedId) ? 'selected' : '';
            html += `<option value="${p.id}" ${isSel}>${p.name || p.vpsIp} (${p.vpsIp}) - ${p.project || 'absenta'}</option>`;
        });
        html += '<option value="custom">✏️ Masukkan IP & Kredensial Manual...</option>';
        select.innerHTML = html;

        if (preselectedId) {
            select.value = preselectedId;
            onPurgePresetChange();
        } else {
            // Default target 10.10.10.116 if available
            const default116 = presets.find(p => p.vpsIp === '10.10.10.116');
            if (default116) {
                select.value = default116.id;
                onPurgePresetChange();
            } else if (presets.length > 0) {
                select.value = presets[0].id;
                onPurgePresetChange();
            }
        }
    } catch (e) {
        console.error('Error populating purge presets:', e);
        select.innerHTML = '<option value="custom">✏️ Masukkan IP & Kredensial Manual</option>';
    }
}

function onPurgePresetChange() {
    const select = document.getElementById('purge-modal-preset-select');
    const selectedId = select ? select.value : '';

    if (!selectedId || selectedId === 'custom') {
        // Keep inputs editable
        return;
    }

    const presets = window.globalPresets || [];
    const matched = presets.find(p => p.id === selectedId);
    if (matched) {
        document.getElementById('purge-modal-ip').value = matched.vpsIp || '';
        document.getElementById('purge-modal-user').value = matched.vpsUser || 'asep';
        document.getElementById('purge-modal-sudo').value = matched.vpsSudoPass || '1';
        
        const keySelect = document.getElementById('purge-modal-key');
        if (matched.sshKeyChoice === 'ls-key.pem') {
            keySelect.value = 'ls-key.pem';
        } else {
            keySelect.value = 'nginxonly.pem';
        }
    }
}

function onPurgeModeSelect(mode) {
    const label1 = document.getElementById('purge-mode-label-1');
    const label2 = document.getElementById('purge-mode-label-2');

    if (mode === '2') {
        if (label1) {
            label1.style.background = 'rgba(30,41,59,0.4)';
            label1.style.borderColor = 'rgba(255,255,255,0.08)';
        }
        if (label2) {
            label2.style.background = 'rgba(239,68,68,0.12)';
            label2.style.borderColor = 'rgba(239,68,68,0.6)';
        }
    } else {
        if (label1) {
            label1.style.background = 'rgba(59,130,246,0.12)';
            label1.style.borderColor = 'rgba(59,130,246,0.6)';
        }
        if (label2) {
            label2.style.background = 'rgba(30,41,59,0.4)';
            label2.style.borderColor = 'rgba(255,255,255,0.08)';
        }
    }
}

function onPurgeConfirmInput() {
    const input = document.getElementById('purge-confirm-text');
    const execBtn = document.getElementById('purge-execute-btn');
    if (!input || !execBtn) return;

    if (input.value.trim() === 'HAPUS') {
        execBtn.disabled = false;
        execBtn.style.opacity = '1';
        execBtn.style.cursor = 'pointer';
        execBtn.style.background = '#ef4444';
        execBtn.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.4)';
    } else {
        execBtn.disabled = true;
        execBtn.style.opacity = '0.5';
        execBtn.style.cursor = 'not-allowed';
        execBtn.style.background = '#dc2626';
        execBtn.style.boxShadow = 'none';
    }
}

function appendPurgeTerminalLine(line) {
    const terminal = document.getElementById('purge-stream-terminal');
    if (!terminal) return;

    const div = document.createElement('div');
    div.style.lineHeight = '1.6';
    div.style.marginBottom = '2px';

    if (line.includes('[ERROR]') || line.includes('[WARN]') || line.includes('FAILED') || line.includes('gagal')) {
        div.style.color = '#f87171';
    } else if (line.includes('[PURGE_COMPLETE]') || line.includes('selesai') || line.includes('sukses') || line.includes('berhasil') || line.includes('Selesai!')) {
        div.style.color = '#34d399';
    } else if (line.includes('[START]') || line.includes('===') || line.includes('Menghapus')) {
        div.style.color = '#fbbf24';
    } else {
        div.style.color = '#e2e8f0';
    }

    div.textContent = line;
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
}

function startPurgeStream() {
    const ip = (document.getElementById('purge-modal-ip').value || '').trim();
    const user = (document.getElementById('purge-modal-user').value || 'asep').trim();
    const key = document.getElementById('purge-modal-key').value || 'nginxonly.pem';
    const sudoPass = (document.getElementById('purge-modal-sudo').value || '1').trim();
    
    const modeRadio = document.querySelector('input[name="purge-mode-radio"]:checked');
    const mode = modeRadio ? modeRadio.value : '1';

    if (!ip) {
        alert('Alamat IP VPS target tidak boleh kosong!');
        return;
    }

    const select = document.getElementById('purge-modal-preset-select');
    const presetId = (select && select.value && select.value !== 'custom') ? select.value : '';

    currentPurgeKey = presetId || `purge-${ip}`;

    // Switch view to terminal
    document.getElementById('purge-modal-form-area').style.display = 'none';
    document.getElementById('purge-modal-terminal-area').style.display = 'block';

    const statusEl = document.getElementById('purge-stream-status');
    const spinner = document.getElementById('purge-stream-spinner');
    if (statusEl) statusEl.textContent = `Menghubungkan ke ${user}@${ip} untuk Factory Reset...`;
    if (spinner) spinner.style.display = 'inline-block';

    let url = `/api/stream-factory-reset?mode=${encodeURIComponent(mode)}&`;
    if (presetId) {
        url += `id=${encodeURIComponent(presetId)}`;
    } else {
        url += `ip=${encodeURIComponent(ip)}&user=${encodeURIComponent(user)}&key=${encodeURIComponent(key)}&sudoPass=${encodeURIComponent(sudoPass)}`;
    }

    if (purgeEventSource) purgeEventSource.close();
    purgeEventSource = new EventSource(url);

    purgeEventSource.onmessage = function(event) {
        const line = event.data;
        if (!line) return;
        appendPurgeTerminalLine(line);

        if (line.includes('[PURGE_COMPLETE]')) {
            if (purgeEventSource) {
                purgeEventSource.close();
                purgeEventSource = null;
            }
            if (spinner) spinner.style.display = 'none';
            if (statusEl) {
                statusEl.textContent = '✨ Factory Reset Berhasil! Server telah kembali ke status kertas kosong.';
                statusEl.style.color = '#34d399';
            }
        } else if (line.includes('[PURGE_FAILED]')) {
            if (purgeEventSource) {
                purgeEventSource.close();
                purgeEventSource = null;
            }
            if (spinner) spinner.style.display = 'none';
            if (statusEl) {
                statusEl.textContent = '❌ Factory Reset Gagal! Silakan cek log di bawah.';
                statusEl.style.color = '#f87171';
            }
        }
    };

    purgeEventSource.onerror = function() {
        if (purgeEventSource) {
            purgeEventSource.close();
            purgeEventSource = null;
        }
        if (spinner) spinner.style.display = 'none';
        appendPurgeTerminalLine('⚠️ [Koneksi Stream Berakhir / Terputus]');
    };
}

async function cancelCurrentPurge() {
    if (!currentPurgeKey) return;
    try {
        await fetch(`/api/factory-reset/cancel?key=${encodeURIComponent(currentPurgeKey)}`, { method: 'POST' });
        appendPurgeTerminalLine('🛑 Perintah pembatalan Factory Reset telah dikirim.');
    } catch (e) {
        appendPurgeTerminalLine('⚠️ Gagal mengirim perintah pembatalan: ' + e.message);
    }
}
