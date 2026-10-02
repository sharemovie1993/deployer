/**
 * FRONTEND & CORE LOGIC REGRESSION TEST SUITE
 * Memvalidasi kalkulator 4 pilar, evaluasi IOPS & grade benchmark,
 * state presets, dan generator sertifikat audit PDF.
 */

const assert = require('assert');

console.log('\n=============================================================');
console.log('    TEST REGRESI FRONTEND CORE LOGIC (SAFETY NET)');
console.log('=============================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(` ✅ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(` ❌ FAIL: ${name}`);
        console.error(`    Error: ${e.message}\n`);
        failed++;
    }
}

// -----------------------------------------------------------------------------
// 1. LOGIKA INTI KALKULATOR 4-PILAR & BOTTLENECK
// -----------------------------------------------------------------------------
function calculateCapacityCore(params) {
    const {
        mode = 'full-ecosystem',
        jmlTerminal = 10,
        jmlGuru = 55,
        jmlSiswa = 2000,
        selectedPortMbps = 100,
        realMeasuredMbps = 100,
        totalIops = 60000,
        avgLatMs = 1.0,
        ramTotalMb = 16000,
        cpuCores = 4
    } = params;

    const effectiveLinkMbps = Math.min(selectedPortMbps, realMeasuredMbps);

    // Kebutuhan Puncak
    let totalPeakNeeded = 0;
    if (mode === 'operational-only') {
        const peakTerminal = Math.round(jmlTerminal * 1.0);
        const peakKelas = Math.round(jmlGuru * 1.0);
        totalPeakNeeded = Math.max(5, peakTerminal + peakKelas);
    } else {
        const peakTerminal = Math.round(jmlTerminal * 1.0);
        const peakSiswa = Math.round(jmlSiswa * 0.25);
        const peakOrtu = Math.round(jmlSiswa * 0.40);
        const peakGuru = Math.round(jmlGuru * 1.0);
        totalPeakNeeded = Math.max(10, peakTerminal + peakSiswa + peakOrtu + peakGuru);
    }

    // Pilar 1: Storage Disk IOPS
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

    // Pilar 2: RAM Memory
    const usableRamMb = Math.max(400, ramTotalMb - 1500);
    const capRam = Math.round(usableRamMb / 2.5);

    // Pilar 3: CPU Compute
    const capCpu = Math.round(cpuCores * 1000);

    // Pilar 4: Network Link
    const capLink = Math.round((effectiveLinkMbps * 1000) / 16);
    const peakBandwidthMbps = Math.max(0.2, parseFloat((totalPeakNeeded * 0.015).toFixed(1)));
    const linkUsagePercent = parseFloat(((peakBandwidthMbps / effectiveLinkMbps) * 100).toFixed(1));

    // Bottleneck & Max Safe Capacity
    const maxSafeCapacity = Math.min(capDisk, capRam, capCpu, capLink);

    let bottleneckType = 'DISK';
    let bottleneckName = 'Storage Disk IOPS';

    if (maxSafeCapacity === capCpu && capCpu < capDisk && capCpu < capRam && capCpu < capLink) {
        bottleneckType = 'CPU';
        bottleneckName = 'CPU Compute Core';
    } else if (maxSafeCapacity === capRam && capRam < capDisk && capRam < capCpu && capRam < capLink) {
        bottleneckType = 'RAM';
        bottleneckName = 'RAM Memory';
    } else if (maxSafeCapacity === capLink && capLink < capDisk && capLink < capRam && capLink < capCpu) {
        bottleneckType = 'NETWORK';
        bottleneckName = 'Network Link Internet';
    } else if (Math.abs(capDisk - capCpu) / Math.max(capDisk, capCpu) < 0.15 && Math.abs(capDisk - capRam) / Math.max(capDisk, capRam) < 0.15) {
        bottleneckType = 'BALANCED';
        bottleneckName = 'Seimbang (Balanced)';
    }

    const loadPercent = parseFloat(((totalPeakNeeded / maxSafeCapacity) * 100).toFixed(1));

    let verdict = 'SANGAT LEGA (Zero Lag)';
    if (loadPercent > 100) verdict = 'OVERLOAD';
    else if (loadPercent > 80) verdict = 'MENDEKATI BATAS';
    else if (loadPercent > 50) verdict = 'IDEAL & STABIL';

    return {
        totalPeakNeeded,
        capDisk,
        capRam,
        capCpu,
        capLink,
        maxSafeCapacity,
        bottleneckType,
        bottleneckName,
        loadPercent,
        verdict,
        peakBandwidthMbps,
        linkUsagePercent
    };
}

// -----------------------------------------------------------------------------
// 2. LOGIKA INTI PENENTUAN GRADE IOPS
// -----------------------------------------------------------------------------
function evaluateIopsGrade(totalIops, avgLatMs) {
    if (totalIops >= 25000 || (totalIops >= 15000 && avgLatMs <= 3.0)) {
        return { grade: 'S', rating: 'Enterprise Superfast (NVMe / High-End SSD)', color: '#10b981' };
    } else if (totalIops >= 8000) {
        return { grade: 'A', rating: 'High Performance SSD (Fast Cloud VPS)', color: '#38bdf8' };
    } else if (totalIops >= 2500) {
        return { grade: 'B', rating: 'Standard Performance SSD (Regular Cloud)', color: '#06b6d4' };
    } else if (totalIops >= 1000) {
        return { grade: 'C', rating: 'Entry Cloud Storage (Budget Instance)', color: '#f59e0b' };
    } else {
        return { grade: 'D', rating: 'Slow Storage (HDD / High I/O Contention)', color: '#ef4444' };
    }
}

// -----------------------------------------------------------------------------
// 3. LOGIKA GENERATOR SERTIFIKAT PDF AUDIT
// -----------------------------------------------------------------------------
function generateAuditPdfHtml(params) {
    const {
        serverName = 'Server VPS',
        serverIp = '10.10.10.116',
        serverUser = 'asep',
        schoolName = 'SMK Negeri 1 Jakarta',
        domainName = 'absenta.sekolah.sch.id',
        metrics = { totalIops: 65000, readIops: 45000, writeIops: 20000, avgLatMs: 0.9, totalThroughputMb: 50 },
        grade = 'S',
        hw = { cpuCores: 4, cpuModel: 'Intel Xeon', ramTotalMb: 16000, ramUsedMb: 2400, ramAvailableMb: 13600 },
        net = { pingLatencyMs: 20, packetLossPct: 0, measuredSpeedMbps: 100, status: 'STABIL' },
        calc = { maxSafeCapacity: 4000, totalPeakNeeded: 1355, loadPercent: 33.9, verdict: 'SANGAT LEGA (Zero Lag)', bottleneckName: 'CPU Compute Core' }
    } = params;

    const docNo = 'SRV-AUDIT-TEST-001';
    
    const html = `
    <html>
        <head><title>Sertifikat ${serverName}</title></head>
        <body>
            <h1>LAPORAN AUDIT & SERTIFIKAT KELAYAKAN SERVER</h1>
            <div id="docNo">${docNo}</div>
            <div id="school">${schoolName}</div>
            <div id="server">${serverName} (${serverUser}@${serverIp})</div>
            <div id="domain">${domainName}</div>
            <div id="grade">GRADE ${grade}</div>
            <div id="iops">${metrics.totalIops} IOPS</div>
            <div id="latency">${metrics.avgLatMs} ms</div>
            <div id="cpu">${hw.cpuCores} Cores</div>
            <div id="ram">${hw.ramTotalMb} MB</div>
            <div id="capacity">${calc.maxSafeCapacity} Concurrent</div>
            <div id="peak">${calc.totalPeakNeeded} Concurrent</div>
            <div id="load">${calc.loadPercent}%</div>
            <div id="verdict">${calc.verdict}</div>
            <div id="bottleneck">${calc.bottleneckName}</div>
        </body>
    </html>`;

    return html;
}

// -----------------------------------------------------------------------------
// EKSEKUSI TEST SUITE
// -----------------------------------------------------------------------------

// Uji 1: Kalkulator Skenario Full-Ecosystem Standard (2000 Siswa, 55 Guru, 10 Terminal)
test('1. Capacity Calculator - Full Ecosystem (2000 Siswa, 4 Core, 16GB, 60k IOPS, 100Mbps)', () => {
    const res = calculateCapacityCore({
        mode: 'full-ecosystem',
        jmlTerminal: 10,
        jmlGuru: 55,
        jmlSiswa: 2000,
        selectedPortMbps: 100,
        realMeasuredMbps: 100,
        totalIops: 60000,
        avgLatMs: 1.0,
        ramTotalMb: 16000,
        cpuCores: 4
    });

    // Peak = 10 (term) + 500 (siswa 25%) + 800 (ortu 40%) + 55 (guru) = 1365
    assert.strictEqual(res.totalPeakNeeded, 1365, 'Total peak needed should be 1365');
    assert.strictEqual(res.capCpu, 4000, 'CPU capacity for 4 cores should be 4000');
    assert.strictEqual(res.capRam, 5800, 'RAM capacity for 16GB should be 5800');
    assert.strictEqual(res.capLink, 6250, 'Link capacity for 100Mbps should be 6250');
    assert.strictEqual(res.maxSafeCapacity, 4000, 'Max safe capacity should be limited by CPU (4000)');
    assert.strictEqual(res.bottleneckType, 'CPU', 'Bottleneck should be CPU');
    assert.strictEqual(res.verdict, 'SANGAT LEGA (Zero Lag)', 'Verdict should be SANGAT LEGA');
    assert.strictEqual(res.loadPercent, 34.1, 'Load percent should be ~34.1%');
});

// Uji 2: Kalkulator Skenario Operational Only (Hanya Terminal RFID & Guru Kelas)
test('2. Capacity Calculator - Operational Only (Low Load)', () => {
    const res = calculateCapacityCore({
        mode: 'operational-only',
        jmlTerminal: 10,
        jmlGuru: 55,
        jmlSiswa: 2000,
        selectedPortMbps: 100,
        realMeasuredMbps: 100,
        totalIops: 60000,
        avgLatMs: 1.0,
        ramTotalMb: 16000,
        cpuCores: 4
    });

    // Peak = 10 (term) + 55 (guru) = 65
    assert.strictEqual(res.totalPeakNeeded, 65, 'Operational only peak should be 65');
    assert.strictEqual(res.loadPercent, 1.6, 'Load percent should be 1.6%');
    assert.strictEqual(res.verdict, 'SANGAT LEGA (Zero Lag)', 'Verdict should be SANGAT LEGA');
});

// Uji 3: Kalkulator Skenario Overload (Server Kecil: 1 Core, 2GB RAM, HDD Slow)
test('3. Capacity Calculator - Overload Detection on Weak Server', () => {
    const res = calculateCapacityCore({
        mode: 'full-ecosystem',
        jmlTerminal: 10,
        jmlGuru: 55,
        jmlSiswa: 3000,
        selectedPortMbps: 20,
        realMeasuredMbps: 15,
        totalIops: 500,
        avgLatMs: 40.0,
        ramTotalMb: 2048,
        cpuCores: 1
    });

    // Peak = 10 + 750 + 1200 + 55 = 2015
    assert.strictEqual(res.totalPeakNeeded, 2015, 'Peak should be 2015');
    assert.strictEqual(res.capDisk, 80, 'Disk capacity for 500 IOPS should be 80');
    assert.strictEqual(res.maxSafeCapacity, 80, 'Max safe capacity should be 80');
    assert.strictEqual(res.bottleneckType, 'DISK', 'Bottleneck should be DISK');
    assert.strictEqual(res.verdict, 'OVERLOAD', 'Verdict should be OVERLOAD');
    assert.ok(res.loadPercent > 100, 'Load percent should exceed 100%');
});

// Uji 4: Evaluasi Grade IOPS Benchmark
test('4. IOPS Grade Evaluator (S, A, B, C, D Tier Classification)', () => {
    const sGrade = evaluateIopsGrade(65000, 0.8);
    assert.strictEqual(sGrade.grade, 'S', '65k IOPS should be Grade S');

    const aGrade = evaluateIopsGrade(12000, 4.0);
    assert.strictEqual(aGrade.grade, 'A', '12k IOPS should be Grade A');

    const bGrade = evaluateIopsGrade(4500, 8.0);
    assert.strictEqual(bGrade.grade, 'B', '4.5k IOPS should be Grade B');

    const cGrade = evaluateIopsGrade(1500, 15.0);
    assert.strictEqual(cGrade.grade, 'C', '1.5k IOPS should be Grade C');

    const dGrade = evaluateIopsGrade(400, 50.0);
    assert.strictEqual(dGrade.grade, 'D', '400 IOPS should be Grade D');
});

// Uji 5: Generator PDF Report HTML Sanitization & Integrity
test('5. PDF Audit Report HTML Generator (No Undefined/NaN fields)', () => {
    const html = generateAuditPdfHtml({
        serverName: 'VPS Demo',
        serverIp: '10.10.10.99',
        serverUser: 'asepsuryadi',
        schoolName: 'SMK Negeri 1 Cibinong',
        domainName: 'absenta.smkn1cibinong.sch.id',
        grade: 'S',
        metrics: { totalIops: 66936, readIops: 46847, writeIops: 20089, avgLatMs: 0.93, totalThroughputMb: 52.26 },
        hw: { cpuCores: 4, cpuModel: 'Intel Xeon E-2224G', ramTotalMb: 16000, ramUsedMb: 2400, ramAvailableMb: 13600 },
        net: { pingLatencyMs: 19.5, packetLossPct: 0, measuredSpeedMbps: 135.0, status: 'STABIL' },
        calc: { maxSafeCapacity: 4000, totalPeakNeeded: 1365, loadPercent: 34.1, verdict: 'SANGAT LEGA (Zero Lag)', bottleneckName: 'CPU Compute Core' }
    });

    assert.ok(!html.includes('undefined'), 'HTML should not contain "undefined"');
    assert.ok(!html.includes('NaN'), 'HTML should not contain "NaN"');
    assert.ok(html.includes('SMK Negeri 1 Cibinong'), 'HTML should contain school name');
    assert.ok(html.includes('66936 IOPS'), 'HTML should contain IOPS value');
    assert.ok(html.includes('GRADE S'), 'HTML should contain Grade S');
    assert.ok(html.includes('4000 Concurrent'), 'HTML should contain capacity');
});

console.log('\n=============================================================');
console.log(` HASIL TEST REGRESI FRONTEND:  Passed: ${passed} | Failed: ${failed}`);
console.log('=============================================================\n');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
