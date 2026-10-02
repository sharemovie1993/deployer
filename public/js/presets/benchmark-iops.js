// =============================================================================
// ABSENTA DEPLOYER - IOPS CHECKER & STORAGE BENCHMARK MODULE
// Menangani modal benchmark IOPS, eksekusi API fio, chip hardware, & visual tier ladder.
// =============================================================================

let currentIopsPresetId = null;
let lastBenchmarkRawData = null;
let lastIopsMetrics = { totalIops: 60000, readIops: 40000, writeIops: 20000, avgLatMs: 1.0 };
let lastIopsGrade = 'S';
let lastHardwareInfo = { cpuCores: 4, cpuModel: 'Intel Xeon E-2224G', ramTotalMb: 16000, ramUsedMb: 2400, ramAvailableMb: 13600 };
let lastNetworkInfo = { pingLatencyMs: 19.5, packetLossPct: 0, measuredSpeedMbps: 135.0, status: 'SANGAT PRIMA & CEPAT', grade: 'S' };

function openIopsModal(presetId) {
    currentIopsPresetId = presetId;
    const modal = document.getElementById('iops-modal-backdrop');
    const targetLabel = document.getElementById('iops-target-server-label');
    const resultContainer = document.getElementById('iops-result-container');
    const loadingContainer = document.getElementById('iops-loading-container');
    const chipCpu = document.getElementById('iops-chip-cpu');
    const chipRam = document.getElementById('iops-chip-ram');
    const chipDisk = document.getElementById('iops-chip-disk');
    const chipLink = document.getElementById('iops-chip-link');
    const chipTunnel = document.getElementById('iops-chip-tunnel');

    if (!modal) return;

    const p = (typeof globalPresets !== 'undefined' && Array.isArray(globalPresets)) ? globalPresets.find(item => item.id === presetId) : null;
    if (p) {
        if (targetLabel) targetLabel.innerText = (p.name || 'Server VPS') + ' (' + (p.vpsUser || 'asep') + '@' + (p.vpsIp || '10.10.10.116') + ')';
    } else {
        if (targetLabel) targetLabel.innerText = presetId || '10.10.10.116';
    }

    if (chipCpu) chipCpu.innerText = '🖥️ CPU: Memuat...';
    if (chipRam) chipRam.innerText = '🧠 RAM: Memuat...';
    if (chipDisk) chipDisk.innerText = '💽 Disk: Memuat...';
    if (chipLink) chipLink.innerText = '🌐 Internet: Menguji link...';
    if (chipTunnel) chipTunnel.innerText = '🔒 Lisensi: Menguji tunnel...';

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
    const chipCpu = document.getElementById('iops-chip-cpu');
    const chipRam = document.getElementById('iops-chip-ram');
    const chipDisk = document.getElementById('iops-chip-disk');
    const chipLink = document.getElementById('iops-chip-link');

    if (loadingContainer) loadingContainer.style.display = 'block';
    if (resultContainer) resultContainer.style.display = 'none';
    if (btn) {
        btn.disabled = true;
        btn.innerText = '⏳ Sedang Benchmark (Disk & Net 5s)...';
    }

    const apiUrl = '/api/benchmark-iops?id=' + encodeURIComponent(presetId || '');

    fetch(apiUrl)
        .then(res => res.json())
        .then(data => {
            if (loadingContainer) loadingContainer.style.display = 'none';
            if (btn) {
                btn.disabled = false;
                btn.innerText = '⚡ Jalankan Uji IOPS & Jaringan (5 Detik)';
            }

            if (!data.success) {
                alert('Gagal menjalankan benchmark IOPS: ' + (data.message || 'Unknown error'));
                return;
            }

            lastBenchmarkRawData = data;

            // Hardware info chips
            if (data.server) {
                const s = data.server;
                const hw = s.hardware || {};
                lastHardwareInfo = {
                    cpuCores: hw.cpuCores || 2,
                    cpuModel: hw.cpuModel || 'Standard Processor',
                    ramTotalMb: hw.ramTotalMb || 2048,
                    ramUsedMb: hw.ramUsedMb || 512,
                    ramAvailableMb: hw.ramAvailableMb || 1536
                };

                const net = s.network || {};
                lastNetworkInfo = {
                    pingLatencyMs: net.pingLatencyMs || 20.0,
                    packetLossPct: net.packetLossPct || 0,
                    measuredSpeedMbps: net.measuredSpeedMbps || 100.0,
                    status: net.status || 'STABIL',
                    grade: net.grade || 'A'
                };

                const cleanDisk = s.diskInfo || 'Standard Linux SSD';
                if (chipDisk) chipDisk.innerText = '💽 Disk: ' + cleanDisk;
                if (chipCpu) chipCpu.innerText = '🖥️ CPU: ' + lastHardwareInfo.cpuCores + ' Core (' + lastHardwareInfo.cpuModel.split('@')[0].trim() + ')';
                if (chipRam) {
                    const ramGb = (lastHardwareInfo.ramTotalMb / 1024).toFixed(1);
                    const freeGb = (lastHardwareInfo.ramAvailableMb / 1024).toFixed(1);
                    chipRam.innerText = '🧠 RAM: ' + ramGb + ' GB (Free ~' + freeGb + ' GB)';
                }
                if (chipLink) {
                    chipLink.innerText = '🌐 Internet: ' + lastNetworkInfo.measuredSpeedMbps + ' Mbps (Ping ' + lastNetworkInfo.pingLatencyMs + 'ms' + (lastNetworkInfo.packetLossPct > 0 ? ', Loss ' + lastNetworkInfo.packetLossPct + '%' : '') + ')';
                }
                const chipTunnel = document.getElementById('iops-chip-tunnel');
                if (chipTunnel) {
                    const t = net.tunnel || {};
                    if (t.hasTunnel && (t.pingMs > 0 || t.speedMbps > 0)) {
                        const ifaceLabel = t.iface ? (t.iface + (t.clientIp ? ' • ' + t.clientIp : '')) : (t.clientIp || '10.0.0.1');
                        chipTunnel.innerText = '🔒 Lisensi (' + ifaceLabel + '): ' + t.speedMbps + ' Mbps (Ping ' + t.pingMs + 'ms)';
                        chipTunnel.style.color = '#34d399';
                    } else if (t.hasTunnel) {
                        chipTunnel.innerText = '🔒 Lisensi (' + (t.iface || 'Tunnel') + '): ' + (t.status || 'Terputus');
                        chipTunnel.style.color = '#ef4444';
                    } else {
                        chipTunnel.innerText = '🔒 Lisensi: Belum Terpasang (Offline)';
                        chipTunnel.style.color = '#94a3b8';
                    }
                }
            }

            // Populate Metrics
            const m = data.metrics || {};
            const totalEl = document.getElementById('iops-val-total');
            if (totalEl) totalEl.innerText = (m.totalIops || 0).toLocaleString('id-ID');

            const badgeGrade = document.getElementById('iops-badge-grade');
            if (badgeGrade) {
                badgeGrade.innerText = 'GRADE ' + (data.grade || 'C') + ' • ' + (data.rating || 'Standard');
                badgeGrade.style.color = data.badgeColor || '#38bdf8';
                badgeGrade.style.borderColor = data.badgeColor || '#38bdf8';
                badgeGrade.style.background = (data.badgeColor || '#38bdf8') + '22';
            }

            // Update Visual Grade Tier Ladder Active Highlight
            const activeGrade = (data.grade || 'C').toUpperCase();
            ['S', 'A', 'B', 'C', 'D'].forEach(tier => {
                const el = document.getElementById('tier-badge-' + tier);
                if (el) {
                    if (tier === activeGrade) {
                        el.style.background = (data.badgeColor || '#10b981') + '33';
                        el.style.color = data.badgeColor || '#10b981';
                        el.style.borderColor = data.badgeColor || '#10b981';
                        el.style.boxShadow = '0 0 12px ' + (data.badgeColor || '#10b981') + '66';
                        el.style.transform = 'scale(1.04)';
                        if (!el.innerHTML.includes('📍')) {
                            el.innerHTML = '📍 ' + el.innerHTML;
                        }
                    } else {
                        el.style.background = 'rgba(255,255,255,0.03)';
                        el.style.color = '#64748b';
                        el.style.borderColor = 'rgba(255,255,255,0.06)';
                        el.style.boxShadow = 'none';
                        el.style.transform = 'scale(1.0)';
                        el.innerHTML = el.innerHTML.replace('📍 ', '');
                    }
                }
            });

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

            const guruStatus = document.getElementById('iops-guru-status');
            const guruDesc = document.getElementById('iops-guru-desc');
            if (s.guru) {
                if (guruStatus) {
                    guruStatus.innerText = s.guru.status;
                    guruStatus.style.color = data.badgeColor || '#10b981';
                }
                if (guruDesc) guruDesc.innerText = s.guru.description;
            }

            const siswaStatus = document.getElementById('iops-siswa-status');
            const siswaDesc = document.getElementById('iops-siswa-desc');
            if (s.siswa) {
                if (siswaStatus) {
                    siswaStatus.innerText = s.siswa.status;
                    siswaStatus.style.color = data.badgeColor || '#10b981';
                }
                if (siswaDesc) siswaDesc.innerText = s.siswa.description;
            }

            const ortuStatus = document.getElementById('iops-ortu-status');
            const ortuDesc = document.getElementById('iops-ortu-desc');
            if (s.ortu) {
                if (ortuStatus) {
                    ortuStatus.innerText = s.ortu.status;
                    ortuStatus.style.color = data.badgeColor || '#10b981';
                }
                if (ortuDesc) ortuDesc.innerText = s.ortu.description;
            }

            const termStatus = document.getElementById('iops-terminal-status');
            const termDesc = document.getElementById('iops-terminal-desc');
            if (s.terminal) {
                if (termStatus) {
                    termStatus.innerText = s.terminal.status;
                    termStatus.style.color = data.badgeColor || '#10b981';
                }
                if (termDesc) termDesc.innerText = s.terminal.description;
            }

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
            if (typeof calculateServerCapacity === 'function') {
                calculateServerCapacity();
            }

            if (resultContainer) resultContainer.style.display = 'flex';
        })
        .catch(err => {
            if (loadingContainer) loadingContainer.style.display = 'none';
            if (btn) {
                btn.disabled = false;
                btn.innerText = '⚡ Jalankan Uji IOPS & Jaringan (5 Detik)';
            }
            alert('Terjadi kesalahan jaringan/server saat benchmark IOPS: ' + err.message);
        });
}

// Global Export
window.openIopsModal = openIopsModal;
window.closeIopsModal = closeIopsModal;
window.runIopsBenchmark = runIopsBenchmark;
