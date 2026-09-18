// public/js/audit.js - Hardening & Tuning Audit Client Controller

function populateAuditPresetDropdown(callback) {
    const select = document.getElementById('audit-target-preset');
    if (!select) {
        if (typeof callback === 'function') callback();
        return;
    }

    fetch('/api/presets')
    .then(res => res.json())
    .then(res => {
        if (res.success && Array.isArray(res.data)) {
            let html = '';
            res.data.forEach(p => {
                const pName = p.name || ('Server ' + p.vpsIp);
                html += `<option value="${p.id}" data-ip="${p.vpsIp}" data-user="${p.vpsUser || 'asep'}" data-key="${p.vpsKeyPath || p.sshKeyChoice || 'nginxonly.pem'}" data-sudo="${p.vpsSudoPass || '1'}">🌐 ${pName} (${p.vpsIp})</option>`;
            });
            html += `<option value="custom">⚙️ Input Parameter Manual (IP / User / Key)...</option>`;
            select.innerHTML = html;

            if (window.activePresetId && select.querySelector(`option[value="${window.activePresetId}"]`)) {
                select.value = window.activePresetId;
            }
        }
        toggleCustomAuditInputs();
        if (typeof callback === 'function') callback();
    })
    .catch(() => {
        if (typeof callback === 'function') callback();
    });
}

function toggleCustomAuditInputs() {
    const select = document.getElementById('audit-target-preset');
    const customGroup = document.getElementById('audit-custom-inputs-row');
    if (!select || !customGroup) return;

    if (select.value === 'custom') {
        customGroup.style.display = 'flex';
    } else {
        customGroup.style.display = 'none';
    }
}

let activeAuditPreset = null;

function runAuditUI() {
    const select = document.getElementById('audit-target-preset');
    const display = document.getElementById('audit-matrix-display');
    if (!select || !display) return;

    let url = '/api/audit-hardening-tuning?';
    if (select.value === 'custom') {
        const ip = (document.getElementById('audit-custom-ip')?.value || '').trim();
        const user = (document.getElementById('audit-custom-user')?.value || 'asep').trim();
        const key = (document.getElementById('audit-custom-key')?.value || 'nginxonly.pem').trim();
        const sudoPass = (document.getElementById('audit-custom-sudo')?.value || '1').trim();

        if (!ip) {
            alert('Silakan masukkan Alamat IP VPS target.');
            return;
        }
        url += `ip=${encodeURIComponent(ip)}&user=${encodeURIComponent(user)}&key=${encodeURIComponent(key)}&sudoPass=${encodeURIComponent(sudoPass)}`;
        activeAuditPreset = { ip, user, key, sudoPass };
    } else {
        url += `id=${encodeURIComponent(select.value)}`;
        const selectedOpt = select.options[select.selectedIndex];
        activeAuditPreset = {
            id: select.value,
            ip: selectedOpt?.getAttribute('data-ip') || '',
            user: selectedOpt?.getAttribute('data-user') || 'asep',
            key: selectedOpt?.getAttribute('data-key') || 'nginxonly.pem',
            sudoPass: selectedOpt?.getAttribute('data-sudo') || '1'
        };
    }

    display.innerHTML = `
        <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 16px; padding: 40px; text-align: center;">
            <div style="font-size: 28px; margin-bottom: 12px; animation: spin 2s linear infinite;">⏳</div>
            <div style="color: #6ee7b7; font-weight: 600; font-size: 15px;">Sedang mengaudit parameter keamanan & kernel server secara langsung via SSH...</div>
            <div style="color: var(--text-muted); font-size: 12px; margin-top: 6px;">Memeriksa UFW, Fail2ban, SSHD config, Sysctl, Limits, Docker, Redis, dan PostgreSQL</div>
        </div>
    `;

    fetch(url)
    .then(r => r.json())
    .then(res => {
        if (!res.success) {
            display.innerHTML = `
                <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 16px; padding: 30px; text-align: center; color: #f87171;">
                    <div style="font-size: 26px; margin-bottom: 8px;">❌</div>
                    <div style="font-weight: 700; font-size: 15px;">Audit Gagal</div>
                    <div style="font-size: 13px; margin-top: 6px;">${res.message || 'Koneksi ke server terputus'}</div>
                </div>
            `;
            return;
        }

        renderAuditResults(res);
    })
    .catch(err => {
        display.innerHTML = `
            <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 16px; padding: 30px; text-align: center; color: #f87171;">
                <div style="font-size: 26px; margin-bottom: 8px;">❌</div>
                <div style="font-weight: 700; font-size: 15px;">Error Komunikasi API</div>
                <div style="font-size: 13px; margin-top: 6px;">${err.message}</div>
            </div>
        `;
    });
}

function renderAuditResults(data) {
    const display = document.getElementById('audit-matrix-display');
    if (!display) return;

    const h = data.hardening || {};
    const t = data.tuning || {};
    const s = data.server || {};

    const hScore = h.score || 0;
    const tScore = t.score || 0;

    const hBadgeColor = hScore >= 75 ? '#34d399' : (hScore >= 50 ? '#fbbf24' : '#f87171');
    const hBadgeBg = hScore >= 75 ? 'rgba(52,211,153,0.15)' : (hScore >= 50 ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)');
    const hStatusText = hScore >= 75 ? '✅ AMAN (HARDENED)' : (hScore >= 50 ? '⚠️ SEBAGIAN (PARTIAL)' : '🔴 RENTAN (VULNERABLE)');

    const tBadgeColor = tScore >= 80 ? '#34d399' : (tScore >= 50 ? '#fbbf24' : '#f87171');
    const tBadgeBg = tScore >= 80 ? 'rgba(52,211,153,0.15)' : (tScore >= 50 ? 'rgba(251,191,36,0.15)' : 'rgba(239,68,68,0.15)');
    const tStatusText = tScore >= 80 ? '🚀 OPTIMAL (TUNED)' : (tScore >= 50 ? '⚠️ SEBAGIAN (PARTIAL)' : '⏳ BELUM DI-TUNING');

    let html = `
        <!-- TOP SUMMARY CARDS -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
            
            <!-- CARD 1: HARDENING -->
            <div style="background: rgba(15,23,42,0.7); border: 1px solid var(--glass-border); border-radius: 16px; padding: 22px; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="font-weight: 700; font-size: 16px; color: #fff;">🛡️ Keamanan (Hardening)</div>
                        <span style="background: ${hBadgeBg}; color: ${hBadgeColor}; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px;">${hStatusText}</span>
                    </div>

                    <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px;">
                        <span style="font-size: 36px; font-weight: 800; color: #fff;">${hScore}%</span>
                        <span style="font-size: 12px; color: var(--text-muted);">Tingkat Kepatuhan Produksi</span>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12.5px;">
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
                            <span>UFW Firewall:</span>
                            <span>${h.ufw?.active ? '✅ Aktif (Default Deny)' : '❌ Nonaktif / Belum diset'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
                            <span>Fail2Ban (Brute-Force):</span>
                            <span>${h.fail2ban?.active ? '✅ Aktif (Jail SSH on)' : (h.fail2ban?.installed ? '⚠️ Terpasang tapi mati' : '❌ Belum Terpasang')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
                            <span>SSH Password Login:</span>
                            <span>${h.ssh?.passwordAuthDisabled ? '✅ Dinonaktifkan (Wajib Key)' : '❌ Masih Diizinkan'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding-bottom: 4px;">
                            <span>Tunnel & Service Watchdog:</span>
                            <span>${h.watchdog?.active ? '✅ Aktif (Auto-Recovery)' : '❌ Nonaktif'}</span>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--glass-border);">
                    <button class="btn btn-primary" onclick="applyHardeningFromUI()" style="width: 100%; justify-content: center; padding: 10px; font-size: 13px;">
                        🛡️ ${hScore < 100 ? 'Terapkan Hardening Sekarang' : 'Jalankan Ulang Hardening'}
                    </button>
                </div>
            </div>

            <!-- CARD 2: TUNING -->
            <div style="background: rgba(15,23,42,0.7); border: 1px solid var(--glass-border); border-radius: 16px; padding: 22px; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div style="font-weight: 700; font-size: 16px; color: #fff;">⚡ Performa (Kernel Tuning)</div>
                        <span style="background: ${tBadgeBg}; color: ${tBadgeColor}; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px;">${tStatusText}</span>
                    </div>

                    <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px;">
                        <span style="font-size: 36px; font-weight: 800; color: #fff;">${tScore}%</span>
                        <span style="font-size: 12px; color: var(--text-muted);">Tingkat Optimalisasi Beban Tinggi</span>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12.5px;">
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
                            <span>Kernel Sysctl:</span>
                            <span>${t.sysctl?.passed ? '✅ Optimal (File-max 2M, Swappiness 10)' : '⚠️ Standar OS (Perlu tuning)'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
                            <span>Limits File Descriptors:</span>
                            <span>${t.limits?.passed ? '✅ 65536 / 1048576' : '⚠️ Standar (1024 / rendah)'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
                            <span>Docker Daemon Config:</span>
                            <span>${t.docker?.configured ? '✅ Log-rotation & Live-restore ON' : '⚠️ Belum dikonfigurasi'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding-bottom: 4px;">
                            <span>Postgres & Redis Config:</span>
                            <span>${t.absentaConfig?.postgres?.configured ? '✅ Tersedia & Dikalkulasi' : '⚠️ Belum dibuat'}</span>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--glass-border);">
                    <button class="btn btn-secondary" onclick="applyTuningFromUI()" style="width: 100%; justify-content: center; padding: 10px; font-size: 13px; border-color: rgba(52,211,153,0.4); color: #34d399;">
                        ⚡ ${tScore < 100 ? 'Terapkan Tuning Performa Sekarang' : 'Terapkan Ulang Tuning'}
                    </button>
                </div>
            </div>

        </div>

        <!-- DETAILED METRICS PANEL -->
        <div style="background: rgba(15,23,42,0.6); border: 1px solid var(--glass-border); border-radius: 16px; padding: 22px; margin-top: 16px;">
            <h3 style="font-size: 15px; font-weight: 700; color: #fff; margin: 0 0 14px 0;">📋 Rincian Parameter Sistem di Server (${s.user}@${s.ip})</h3>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; font-size: 12.5px;">
                
                <div style="background: rgba(0,0,0,0.3); border-radius: 10px; padding: 14px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-weight: 700; color: #a78bfa; margin-bottom: 8px;">🌐 Port Terbuka Firewall (UFW)</div>
                    <div style="line-height: 1.6; color: var(--text-muted);">
                        ${(h.ufw?.ports && h.ufw.ports.length > 0) ? h.ufw.ports.map(p => `<span style="display:inline-block; background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; margin:2px; color:#fff; font-family:monospace;">${p}</span>`).join(' ') : 'Tidak ada aturan UFW khusus.'}
                    </div>
                </div>

                <div style="background: rgba(0,0,0,0.3); border-radius: 10px; padding: 14px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-weight: 700; color: #60a5fa; margin-bottom: 8px;">💾 Memori & Swap Aktif</div>
                    <div style="line-height: 1.7; color: var(--text-muted);">
                        <div>Total RAM: <strong style="color:#fff;">${t.memory?.ramTotalMb || 0} MB</strong></div>
                        <div>Terpakai: <strong style="color:#fff;">${t.memory?.ramUsedMb || 0} MB</strong></div>
                        <div>Swap Terpasang: <strong style="color:${t.memory?.swapActive ? '#34d399' : '#f87171'};">${t.memory?.swapTotalMb || 0} MB</strong> (${t.memory?.swapActive ? 'Aktif' : 'Tidak Ada Swap'})</div>
                    </div>
                </div>

                <div style="background: rgba(0,0,0,0.3); border-radius: 10px; padding: 14px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-weight: 700; color: #34d399; margin-bottom: 8px;">⏰ Waktu & NTP Server</div>
                    <div style="line-height: 1.7; color: var(--text-muted);">
                        <div>Zona Waktu: <strong style="color:#fff;">${t.timezone?.name || 'UTC'}</strong></div>
                        <div>Sinkronisasi NTP: <strong style="color:${t.timezone?.ntpActive ? '#34d399' : '#fbbf24'};">${t.timezone?.ntpActive ? 'Aktif' : 'Mati'}</strong></div>
                        <div>System Clock: <strong style="color:${t.timezone?.clockSynced ? '#34d399' : '#fbbf24'};">${t.timezone?.clockSynced ? 'Synchronized' : 'Not Sync'}</strong></div>
                    </div>
                </div>

                <div style="background: rgba(0,0,0,0.3); border-radius: 10px; padding: 14px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-weight: 700; color: #fbbf24; margin-bottom: 8px;">📦 Konfigurasi Database & Cache Absenta</div>
                    <div style="line-height: 1.7; color: var(--text-muted);">
                        <div>PostgreSQL Shared Buffers: <strong style="color:#fff;">${t.absentaConfig?.postgres?.sharedBuffers || '-'}</strong></div>
                        <div>PostgreSQL Max Conn: <strong style="color:#fff;">${t.absentaConfig?.postgres?.maxConnections || '-'}</strong></div>
                        <div>Redis Max Memory: <strong style="color:#fff;">${t.absentaConfig?.redis?.maxMemory || '-'}</strong></div>
                    </div>
                </div>

            </div>
        </div>
    `;

    display.innerHTML = html;
}

let auditEventSource = null;

function applyHardeningFromUI() {
    if (!activeAuditPreset || !activeAuditPreset.ip) {
        alert('Silakan jalankan audit terlebih dahulu.');
        return;
    }

    if (!confirm(`Terapkan Hardening Keamanan Lengkap ke server ${activeAuditPreset.user}@${activeAuditPreset.ip}?\n\nTindakan:\n- Mengaktifkan UFW Firewall (port 22, 80, 443, 51820, TURN)\n- Memasang Fail2Ban untuk proteksi SSH brute-force\n- Menonaktifkan otentikasi login password SSH (wajib SSH Key)\n- Memasang Watchdog Auto-Recovery WireGuard & Services`)) {
        return;
    }

    openAuditStreamModal('🛡️ Menerapkan Hardening Keamanan Server...');
    const terminal = document.getElementById('audit-stream-terminal');
    terminal.innerHTML = '<div style="color:#6ee7b7;">[INIT] Memulai proses hardening jarak jauh...</div>';

    let url = '/api/stream-hardening?';
    if (activeAuditPreset.id) {
        url += `id=${encodeURIComponent(activeAuditPreset.id)}`;
    } else {
        url += `ip=${encodeURIComponent(activeAuditPreset.ip)}&user=${encodeURIComponent(activeAuditPreset.user)}&key=${encodeURIComponent(activeAuditPreset.key)}&sudoPass=${encodeURIComponent(activeAuditPreset.sudoPass)}`;
    }

    if (auditEventSource) auditEventSource.close();
    auditEventSource = new EventSource(url);

    auditEventSource.onmessage = function(event) {
        const line = event.data;
        appendAuditTerminalLine(line);

        if (line.includes('[HARDENING_COMPLETE]')) {
            auditEventSource.close();
            appendAuditTerminalLine('✨ Hardening selesai! Menjalankan audit ulang otomatis dalam 3 detik...');
            setTimeout(() => {
                closeAuditStreamModal();
                runAuditUI();
            }, 3000);
        } else if (line.includes('[HARDENING_FAILED]')) {
            auditEventSource.close();
            appendAuditTerminalLine('❌ Hardening gagal. Periksa log di atas.');
        }
    };

    auditEventSource.onerror = function() {
        auditEventSource.close();
        appendAuditTerminalLine('⚠️ Koneksi stream terputus.');
    };
}

function applyTuningFromUI() {
    if (!activeAuditPreset || !activeAuditPreset.ip) {
        alert('Silakan jalankan audit terlebih dahulu.');
        return;
    }

    const tzChoice = prompt('Pilih Zona Waktu Server:\n1 = UTC (Cloud SaaS Multi-Tenant)\n2 = Asia/Jakarta (WIB)\n3 = Asia/Makassar (WITA)\n4 = Asia/Jayapura (WIT)\n\nMasukkan 1, 2, 3, atau 4 [Default: 2]:', '2');
    let chosenTz = 'Asia/Jakarta';
    if (tzChoice === '1') chosenTz = 'UTC';
    else if (tzChoice === '3') chosenTz = 'Asia/Makassar';
    else if (tzChoice === '4') chosenTz = 'Asia/Jayapura';

    openAuditStreamModal('⚡ Menerapkan Kernel & System Tuning...');
    const terminal = document.getElementById('audit-stream-terminal');
    terminal.innerHTML = `<div style="color:#6ee7b7;">[INIT] Memulai tuning sistem (Zona Waktu: ${chosenTz})...</div>`;

    let url = '/api/stream-tuning?tz=' + encodeURIComponent(chosenTz) + '&';
    if (activeAuditPreset.id) {
        url += `id=${encodeURIComponent(activeAuditPreset.id)}`;
    } else {
        url += `ip=${encodeURIComponent(activeAuditPreset.ip)}&user=${encodeURIComponent(activeAuditPreset.user)}&key=${encodeURIComponent(activeAuditPreset.key)}&sudoPass=${encodeURIComponent(activeAuditPreset.sudoPass)}`;
    }

    if (auditEventSource) auditEventSource.close();
    auditEventSource = new EventSource(url);

    auditEventSource.onmessage = function(event) {
        const line = event.data;
        appendAuditTerminalLine(line);

        if (line.includes('[TUNING_COMPLETE]')) {
            auditEventSource.close();
            appendAuditTerminalLine('✨ Tuning selesai! Menjalankan audit ulang otomatis dalam 3 detik...');
            setTimeout(() => {
                closeAuditStreamModal();
                runAuditUI();
            }, 3000);
        } else if (line.includes('[TUNING_FAILED]')) {
            auditEventSource.close();
            appendAuditTerminalLine('❌ Tuning gagal. Periksa log di atas.');
        }
    };

    auditEventSource.onerror = function() {
        auditEventSource.close();
        appendAuditTerminalLine('⚠️ Koneksi stream terputus.');
    };
}

function openAuditStreamModal(title) {
    const modal = document.getElementById('audit-stream-modal');
    const titleEl = document.getElementById('audit-stream-modal-title');
    if (titleEl) titleEl.textContent = title || 'Proses Sedang Berjalan...';
    if (modal) modal.style.display = 'flex';
}

function closeAuditStreamModal() {
    const modal = document.getElementById('audit-stream-modal');
    if (modal) modal.style.display = 'none';
    if (auditEventSource) {
        auditEventSource.close();
        auditEventSource = null;
    }
}

function appendAuditTerminalLine(line) {
    const terminal = document.getElementById('audit-stream-terminal');
    if (!terminal) return;
    const div = document.createElement('div');
    div.style.lineHeight = '1.6';
    div.style.marginBottom = '2px';
    if (line.includes('[ERROR]') || line.includes('[WARN]') || line.includes('FAILED')) {
        div.style.color = '#f87171';
    } else if (line.includes('[COMPLETE]') || line.includes('sukses') || line.includes('berhasil')) {
        div.style.color = '#34d399';
    } else if (line.includes('[START]') || line.includes('===')) {
        div.style.color = '#fbbf24';
    } else {
        div.style.color = '#e2e8f0';
    }
    div.textContent = line;
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
}
