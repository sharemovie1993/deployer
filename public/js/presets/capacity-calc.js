// =============================================================================
// ABSENTA DEPLOYER - 4-PILLAR CAPACITY CALCULATOR MODULE
// Menghitung daya tampung concurrent user berdasarkan Disk IOPS, RAM, CPU, & Network.
// =============================================================================

function onScenarioModeChange() {
    const elMode = document.getElementById('calc-scenario-mode');
    const elDesc = document.getElementById('calc-scenario-desc');
    const elOrtu = document.getElementById('calc-input-ortu');
    const elSiswa = document.getElementById('calc-input-siswa');

    if (!elMode) return;

    const mode = elMode.value;
    const jmlSiswa = Math.max(0, parseInt(elSiswa ? elSiswa.value : 2000, 10) || 0);

    if (mode === 'operational-only') {
        if (elDesc) elDesc.innerText = 'Mode Internal Sekolah: Hanya melayani perangkat RFID di gerbang & petugas/guru di setiap kelas. Siswa & Orang Tua tidak login.';
        if (elOrtu) elOrtu.value = 'Nonaktif (Internal Only)';
    } else {
        if (elDesc) elDesc.innerText = 'Mode Lengkap: Melayani tapping RFID gerbang, sesi absensi kelas, serta login serentak seluruh Siswa, Guru, dan Orang Tua.';
        if (elOrtu) elOrtu.value = jmlSiswa.toLocaleString('id-ID') + ' Akun Ortu';
    }
}

function calculateServerCapacity() {
    const elMode = document.getElementById('calc-scenario-mode');
    const elLink = document.getElementById('calc-input-link');
    const elTerminal = document.getElementById('calc-input-terminal');
    const elGuru = document.getElementById('calc-input-guru');
    const elSiswa = document.getElementById('calc-input-siswa');
    const elOrtu = document.getElementById('calc-input-ortu');

    // 4 Pilar Elements
    const elCapDisk = document.getElementById('calc-cap-disk');
    const elCapDiskSub = document.getElementById('calc-cap-disk-sub');
    const elCapRam = document.getElementById('calc-cap-ram');
    const elCapRamSub = document.getElementById('calc-cap-ram-sub');
    const elCapCpu = document.getElementById('calc-cap-cpu');
    const elCapCpuSub = document.getElementById('calc-cap-cpu-sub');
    const elCapLink = document.getElementById('calc-cap-link');
    const elCapLinkSub = document.getElementById('calc-cap-link-sub');
    const elChipLink = document.getElementById('iops-chip-link');
    const elBottleneckBadge = document.getElementById('calc-val-bottleneck-badge');

    // Summary Elements
    const elMaxCap = document.getElementById('calc-val-max-capacity');
    const elMaxSub = document.getElementById('calc-val-max-sub');
    const elPeakNeed = document.getElementById('calc-val-peak-needed');
    const elLoadPct = document.getElementById('calc-val-load-percent');
    const elVerdict = document.getElementById('calc-val-verdict-tag');
    const elBarLabel = document.getElementById('calc-bar-label');
    const elLoadBar = document.getElementById('calc-load-bar');
    const elRecBox = document.getElementById('calc-recommendation-box');
    const elRecTitle = document.getElementById('calc-recommendation-title');
    const elRecDesc = document.getElementById('calc-recommendation-desc');

    if (!elGuru || !elSiswa) return;

    const mode = elMode ? elMode.value : 'full-ecosystem';
    const jmlTerminal = Math.max(1, parseInt(elTerminal ? elTerminal.value : 10, 10) || 10);
    const jmlGuru = Math.max(1, parseInt(elGuru.value, 10) || 55);
    const jmlSiswa = Math.max(0, parseInt(elSiswa.value, 10) || 2000);

    // Kecepatan port link riil
    const selectedPortMbps = parseInt(elLink ? elLink.value : 100, 10) || 100;
    const realMeasuredMbps = (typeof lastNetworkInfo !== 'undefined' && lastNetworkInfo.measuredSpeedMbps) ? lastNetworkInfo.measuredSpeedMbps : selectedPortMbps;
    const effectiveLinkMbps = Math.min(selectedPortMbps, realMeasuredMbps);

    if (elChipLink && typeof lastNetworkInfo !== 'undefined') {
        elChipLink.innerText = '🌐 Net: ' + realMeasuredMbps + ' Mbps (Ping ' + lastNetworkInfo.pingLatencyMs + 'ms' + (lastNetworkInfo.packetLossPct > 0 ? ', Loss ' + lastNetworkInfo.packetLossPct + '%' : '') + ')';
    }

    // 1. Hitung Kebutuhan Puncak (Peak Concurrent Needed)
    let totalPeakNeeded = 0;
    let modeText = '';

    if (mode === 'operational-only') {
        const peakTerminal = Math.round(jmlTerminal * 1.0);
        const peakKelas = Math.round(jmlGuru * 1.0);
        totalPeakNeeded = Math.max(5, peakTerminal + peakKelas);
        modeText = 'Operational Only (' + jmlTerminal + ' Terminal + ' + jmlGuru + ' Kelas)';
        if (elOrtu) elOrtu.value = 'Nonaktif (Internal Only)';
    } else {
        const peakTerminal = Math.round(jmlTerminal * 1.0);
        const peakSiswa = Math.round(jmlSiswa * 0.25);
        const peakOrtu = Math.round(jmlSiswa * 0.40);
        const peakGuru = Math.round(jmlGuru * 1.0);
        totalPeakNeeded = Math.max(10, peakTerminal + peakSiswa + peakOrtu + peakGuru);
        modeText = 'Full Ecosystem (' + jmlSiswa.toLocaleString('id-ID') + ' Siswa & Ortu)';
        if (elOrtu) elOrtu.value = jmlSiswa.toLocaleString('id-ID') + ' Akun Ortu';
    }

    // 2. Multi-Faktor 4 Pilar Kapasitas Komponen Server
    const metrics = (typeof lastIopsMetrics !== 'undefined') ? lastIopsMetrics : { totalIops: 2000, avgLatMs: 25.0 };
    const hw = (typeof lastHardwareInfo !== 'undefined') ? lastHardwareInfo : { cpuCores: 2, ramTotalMb: 2048, ramAvailableMb: 1536 };
    const net = (typeof lastNetworkInfo !== 'undefined') ? lastNetworkInfo : { pingLatencyMs: 20.0, packetLossPct: 0 };

    // A. Pilar 1: Storage Disk IOPS & Latency
    const totalIops = metrics.totalIops || 2000;
    const avgLatMs = metrics.avgLatMs || 25.0;
    let capDisk = 300;

    if (totalIops >= 25000 || (totalIops >= 15000 && avgLatMs <= 3.0)) {
        capDisk = Math.round(Math.min(12000, totalIops * 0.11));
    } else if (totalIops >= 8000) {
        capDisk = Math.round(totalIops * 0.14);
    } else if (totalIops >= 2500) {
        capDisk = Math.round(totalIops * 0.18);
    } else if (totalIops >= 1000) {
        capDisk = Math.round(Math.max(200, totalIops * 0.22));
    } else {
        capDisk = Math.round(Math.max(80, totalIops * 0.15));
    }

    // B. Pilar 2: RAM Memory
    const ramTotalMb = hw.ramTotalMb || 2048;
    const usableRamMb = Math.max(400, ramTotalMb - 1500);
    const capRam = Math.round(usableRamMb / 2.5);

    // C. Pilar 3: CPU Compute Core
    const cpuCores = hw.cpuCores || 2;
    const capCpu = Math.round(cpuCores * 1000);

    // D. Pilar 4: Network Link Bandwidth
    const capLink = Math.round((effectiveLinkMbps * 1000) / 16);
    const peakBandwidthMbps = Math.max(0.2, parseFloat((totalPeakNeeded * 0.015).toFixed(1)));
    const linkUsagePercent = parseFloat(((peakBandwidthMbps / effectiveLinkMbps) * 100).toFixed(1));

    // E. Hukum Rantai Terlemah (Bottleneck Identifier - 4 Pilar)
    const maxSafeCapacity = Math.min(capDisk, capRam, capCpu, capLink);

    let bottleneckType = 'DISK';
    let bottleneckName = 'Storage Disk IOPS';
    let bottleneckDetail = totalIops.toLocaleString('id-ID') + ' IOPS (' + avgLatMs + ' ms)';
    let bottleneckAdvice = 'Upgrade storage ke NVMe SSD atau optimalkan shared_buffers.';

    if (maxSafeCapacity === capCpu && capCpu < capDisk && capCpu < capRam && capCpu < capLink) {
        bottleneckType = 'CPU';
        bottleneckName = 'CPU Compute Core';
        bottleneckDetail = cpuCores + ' Cores';
        bottleneckAdvice = 'Tambah jumlah core CPU VPS atau terapkan clustering PM2.';
    } else if (maxSafeCapacity === capRam && capRam < capDisk && capRam < capCpu && capRam < capLink) {
        bottleneckType = 'RAM';
        bottleneckName = 'RAM Memory';
        bottleneckDetail = (ramTotalMb / 1024).toFixed(1) + ' GB RAM';
        bottleneckAdvice = 'Tambah kapasitas RAM server minimal 8-16 GB.';
    } else if (maxSafeCapacity === capLink && capLink < capDisk && capLink < capRam && capLink < capCpu) {
        bottleneckType = 'NETWORK';
        bottleneckName = 'Network Link Internet';
        bottleneckDetail = 'Uji Riil ' + effectiveLinkMbps + ' Mbps (Peak butuh ~' + peakBandwidthMbps + ' Mbps)';
        bottleneckAdvice = 'Bandwidth link internet sekolah sedang tercekik pada jam sibuk. Pisahkan jalur internet WiFi dan server atau upgrade paket ISP.';
    } else if (Math.abs(capDisk - capCpu) / Math.max(capDisk, capCpu) < 0.15 && Math.abs(capDisk - capRam) / Math.max(capDisk, capRam) < 0.15) {
        bottleneckType = 'BALANCED';
        bottleneckName = 'Seimbang (Balanced)';
        bottleneckDetail = 'Disk, RAM, CPU & Link proporsional';
        bottleneckAdvice = 'Konfigurasi hardware dan link internet sudah sangat optimal.';
    }

    // Update 4-Pilar UI Elements
    if (elCapDisk) elCapDisk.innerText = '~' + capDisk.toLocaleString('id-ID') + ' User';
    if (elCapDiskSub) elCapDiskSub.innerText = totalIops.toLocaleString('id-ID') + ' IOPS (' + avgLatMs + 'ms)';

    if (elCapRam) elCapRam.innerText = '~' + capRam.toLocaleString('id-ID') + ' User';
    if (elCapRamSub) elCapRamSub.innerText = (ramTotalMb / 1024).toFixed(1) + ' GB RAM';

    if (elCapCpu) elCapCpu.innerText = '~' + capCpu.toLocaleString('id-ID') + ' User';
    if (elCapCpuSub) elCapCpuSub.innerText = cpuCores + ' CPU Cores';

    if (elCapLink) elCapLink.innerText = '~' + capLink.toLocaleString('id-ID') + ' User';
    if (elCapLinkSub) elCapLinkSub.innerText = 'Uji ' + realMeasuredMbps + ' Mbps (Ping ' + net.pingLatencyMs + 'ms)';

    if (elBottleneckBadge) {
        if (bottleneckType === 'BALANCED') {
            elBottleneckBadge.innerText = '⚖️ Hardware & Link Seimbang';
            elBottleneckBadge.style.color = '#10b981';
            elBottleneckBadge.style.borderColor = 'rgba(16,185,129,0.3)';
            elBottleneckBadge.style.background = 'rgba(16,185,129,0.15)';
        } else {
            elBottleneckBadge.innerText = '⚠️ Pembatas: ' + bottleneckName;
            elBottleneckBadge.style.color = '#f59e0b';
            elBottleneckBadge.style.borderColor = 'rgba(245,158,11,0.3)';
            elBottleneckBadge.style.background = 'rgba(245,158,11,0.15)';
        }
    }

    // 3. Hitung Persentase Utilisasi Beban
    const loadPercent = parseFloat(((totalPeakNeeded / maxSafeCapacity) * 100).toFixed(1));

    if (elMaxCap) elMaxCap.innerText = '~' + maxSafeCapacity.toLocaleString('id-ID') + ' Concurrent';
    if (elMaxSub) elMaxSub.innerText = 'Dibatasi: ' + bottleneckName;
    if (elPeakNeed) elPeakNeed.innerText = '~' + totalPeakNeeded.toLocaleString('id-ID') + ' Concurrent';
    if (elLoadPct) elLoadPct.innerText = loadPercent + '%';

    // 4. Visualisasi & Rekomendasi
    if (elLoadBar) {
        elLoadBar.style.width = Math.min(100, loadPercent) + '%';
    }
    if (elBarLabel) {
        elBarLabel.innerText = loadPercent + '% dari Batas Aman Terpadu (' + bottleneckName + ')';
    }

    let netWarning = '';
    if (net.packetLossPct > 0) {
        netWarning = '<br/>⚠️ <strong>Perhatian Jaringan:</strong> Terdeteksi <strong>' + net.packetLossPct + '% Packet Loss</strong> pada link internet saat pengujian! Ini menandakan ada jitter/gangguan koneksi pada jam sibuk.';
    } else if (net.pingLatencyMs > 80) {
        netWarning = '<br/>⚠️ <strong>Latensi Jaringan Tinggi:</strong> Ping internet mencapai <strong>' + net.pingLatencyMs + ' ms</strong>. Waspadai delay loading pada jam puncak.';
    }

    if (loadPercent <= 50) {
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
            elRecTitle.innerText = '✅ Rekomendasi: Server & Jaringan Sangat Ideal untuk Kebutuhan Ini';
            elRecTitle.style.color = '#34d399';
        }
        if (elRecDesc) {
            if (mode === 'operational-only') {
                elRecDesc.innerHTML = 'Pada mode <strong>Operational Only</strong>, server hanya menangani <strong>' + jmlTerminal + ' Terminal RFID</strong> & <strong>' + jmlGuru + ' Kelas KBM</strong> (puncak hanya <strong>~' + totalPeakNeeded + ' Concurrent</strong> / Bandwidth <strong>~' + peakBandwidthMbps + ' Mbps</strong>).<br/>' +
                    'Server ini menggunakan hanya <strong>' + loadPercent + '%</strong> dari batas aman (<strong>~' + maxSafeCapacity.toLocaleString('id-ID') + ' user</strong> dibatasi oleh <em>' + bottleneckName + '</em>). Sanggup menampung hingga <strong>' + schoolsCount + ' sekolah</strong> dengan skala yang sama!' + netWarning;
            } else {
                elRecDesc.innerHTML = 'Pada mode <strong>Full Ecosystem</strong>, kebutuhan puncak (' + jmlSiswa.toLocaleString('id-ID') + ' Siswa + Ortu + Guru) hanya menyerap <strong>' + loadPercent + '%</strong> kapasitas server (<strong>~' + maxSafeCapacity.toLocaleString('id-ID') + ' Concurrent</strong>).<br/>' +
                    '🌐 <em>Hasil Uji Link Riil: <strong>' + realMeasuredMbps + ' Mbps</strong> (Ping ' + net.pingLatencyMs + 'ms). Kebutuhan puncak menyerap <strong>~' + peakBandwidthMbps + ' Mbps</strong> (' + linkUsagePercent + '%). Sangat longgar!</em>' + netWarning;
            }
        }
    } else if (loadPercent <= 80) {
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
            elRecDesc.innerHTML = 'Server ini beroperasi stabil pada beban <strong>' + loadPercent + '%</strong> saat jam sibuk masuk sekolah (Batas aman: <strong>~' + maxSafeCapacity.toLocaleString('id-ID') + ' User</strong>, faktor pembatas: <em>' + bottleneckName + '</em>).<br/>' +
                '🌐 <em>Hasil Uji Link Riil: <strong>' + realMeasuredMbps + ' Mbps</strong> (Ping ' + net.pingLatencyMs + 'ms, Kebutuhan puncak: ~' + peakBandwidthMbps + ' Mbps).</em>' + netWarning;
        }
    } else if (loadPercent <= 100) {
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
            elRecDesc.innerHTML = 'Kebutuhan puncak (' + modeText + ') menyerap <strong>' + loadPercent + '%</strong> daya tampung server (maks <strong>~' + maxSafeCapacity.toLocaleString('id-ID') + ' user</strong>, peak bandwidth: <strong>~' + peakBandwidthMbps + ' Mbps</strong>).<br/>' +
                '🔍 <strong>Bottleneck Utama:</strong> <em>' + bottleneckName + ' (' + bottleneckDetail + ')</em>.<br/>' +
                '💡 <em>Saran: ' + bottleneckAdvice + '</em>' + netWarning;
        }
    } else {
        if (elVerdict) {
            elVerdict.innerText = 'OVERLOAD (' + bottleneckName + ' Bottleneck)';
            elVerdict.style.color = '#ef4444';
        }
        if (elLoadPct) elLoadPct.style.color = '#ef4444';
        if (elLoadBar) elLoadBar.style.background = 'linear-gradient(90deg, #dc2626, #ef4444)';
        if (elRecBox) {
            elRecBox.style.background = 'rgba(239,68,68,0.08)';
            elRecBox.style.borderColor = 'rgba(239,68,68,0.25)';
        }
        if (elRecTitle) {
            elRecTitle.innerText = '❌ Rekomendasi: Kapasitas Tidak Mencukupi untuk Beban Ini';
            elRecTitle.style.color = '#f87171';
        }
        if (elRecDesc) {
            elRecDesc.innerHTML = 'Kapasitas maksimal terpadu server ini hanya <strong>~' + maxSafeCapacity.toLocaleString('id-ID') + ' Concurrent User</strong> (dibatasi oleh <strong>' + bottleneckName + '</strong>), sedangkan estimasi beban puncak skenario Anda mencapai <strong>~' + totalPeakNeeded.toLocaleString('id-ID') + ' Concurrent User</strong> (Peak Bandwidth: <strong>~' + peakBandwidthMbps + ' Mbps</strong>).<br/>' +
                '🚨 <strong>Solusi Upgrade:</strong> ' + bottleneckAdvice + ' Atau gunakan skenario <strong>Operational Only</strong> untuk menghemat resource.' + netWarning;
        }
    }
}

// Global Export
window.calculateServerCapacity = calculateServerCapacity;
window.onScenarioModeChange = onScenarioModeChange;
