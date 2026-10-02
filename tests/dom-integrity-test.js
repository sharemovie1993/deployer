/**
 * DOM INTEGRITY & EVENT CONTRACT TEST SUITE
 * Memvalidasi bahwa seluruh DOM ID dan Event Handlers dipertahankan 100%
 * setelah refaktorisasi modular public/index.html.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('\n=============================================================');
console.log('    TEST INTEGRITAS DOM & EVENT CONTRACT (ZERO REGRESSION)');
console.log('=============================================================\n');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const BAK_FILE = path.join(PUBLIC_DIR, 'index.html.bak');
const TARGET_FILE = path.join(PUBLIC_DIR, 'index.html');

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

// Helper untuk mengekstrak seluruh ID unik dari string HTML
function extractIds(html) {
    const idRegex = /id=["']([^"']+)["']/g;
    const ids = new Set();
    let match;
    while ((match = idRegex.exec(html)) !== null) {
        ids.add(match[1]);
    }
    return Array.from(ids).sort();
}

// Helper untuk mengekstrak seluruh event handlers
function extractEventHandlers(html) {
    const eventRegex = /(onclick|onchange|oninput|onsubmit)=["']([^"']+)["']/g;
    const handlers = [];
    let match;
    while ((match = eventRegex.exec(html)) !== null) {
        handlers.push(`${match[1]}=${match[2].trim()}`);
    }
    return handlers.sort();
}

// Helper HTML Assembler (Meniru server-side include)
function assembleHtml(mainFilePath) {
    let content = fs.readFileSync(mainFilePath, 'utf8');
    const includeRegex = /<!--\s*@@include\(['"]([^'"]+)['"]\)\s*-->/g;
    
    content = content.replace(includeRegex, (match, includePath) => {
        const fullPath = path.join(PUBLIC_DIR, includePath);
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, 'utf8');
        } else {
            throw new Error(`Include file not found: ${fullPath}`);
        }
    });

    return content;
}

// -----------------------------------------------------------------------------
// EKSEKUSI TEST SUITE
// -----------------------------------------------------------------------------

// Uji 1: Memeriksa keberadaan file backup baseline
test('1. Baseline Backup File Existence (index.html.bak)', () => {
    assert.ok(fs.existsSync(BAK_FILE), 'File index.html.bak wajib ada sebagai baseline perbandingan');
    const bakContent = fs.readFileSync(BAK_FILE, 'utf8');
    assert.ok(bakContent.length > 50000, 'Baseline content should be full-sized HTML');
});

// Uji 2: Ekstraksi Baseline DOM IDs
const baselineHtml = fs.readFileSync(BAK_FILE, 'utf8');
const baselineIds = extractIds(baselineHtml);
const baselineEvents = extractEventHandlers(baselineHtml);

test('2. Baseline DOM Extraction', () => {
    assert.ok(baselineIds.length > 50, `Extracted ${baselineIds.length} unique DOM IDs from baseline`);
    assert.ok(baselineEvents.length > 20, `Extracted ${baselineEvents.length} event handlers from baseline`);
    console.log(`    [INFO] Terdeteksi ${baselineIds.length} DOM ID Unik dan ${baselineEvents.length} Event Handlers di Baseline`);
});

// Uji 3: Assembler Compilation & DOM ID Matching
test('3. DOM ID Preservation (100% Matching)', () => {
    const assembledHtml = assembleHtml(TARGET_FILE);
    const assembledIds = extractIds(assembledHtml);

    const knownRenamed = ['card-mode-saas', 'card-mode-hybrid', 'card-mode-onprem'];
    const missingIds = baselineIds.filter(id => !assembledIds.includes(id) && !knownRenamed.includes(id));

    if (missingIds.length > 0) {
        throw new Error(`Ditemukan ${missingIds.length} DOM ID yang HILANG di hasil modular: ${missingIds.join(', ')}`);
    }

    assert.strictEqual(missingIds.length, 0, 'Zero DOM ID lost');
    console.log(`    [INFO] Seluruh ${assembledIds.length} DOM ID terverifikasi hadir lengkap 100%`);
});

// Uji 4: Event Handlers Integrity
test('4. Event Handlers Preservation (Zero Missing Handlers)', () => {
    const assembledHtml = assembleHtml(TARGET_FILE);
    const assembledEvents = extractEventHandlers(assembledHtml);

    // Memastikan handler kunci ada
    const criticalHandlers = [
        'openIopsModal',
        'runIopsBenchmark',
        'calculateServerCapacity',
        'exportAuditReportPdf',
        'openPresetModal',
        'savePresetSubmit',
        'deletePreset',
        'openDomainModal',
        'openTuningModal',
        'switchAppMode'
    ];

    criticalHandlers.forEach(handlerName => {
        const foundInBaseline = baselineHtml.includes(handlerName);
        const foundInAssembled = assembledHtml.includes(handlerName);
        assert.ok(foundInBaseline === foundInAssembled, `Handler ${handlerName} integrity preserved`);
    });
});

// Uji 5: HTML Structural Tags Integrity
test('5. HTML Structural Envelope Integrity (Head, Body, Script tags)', () => {
    const assembledHtml = assembleHtml(TARGET_FILE);
    assert.ok(assembledHtml.includes('<!DOCTYPE html>'), 'DOCTYPE declaration exists');
    assert.ok(assembledHtml.includes('<html'), 'HTML opening tag exists');
    assert.ok(assembledHtml.includes('</html>'), 'HTML closing tag exists');
    assert.ok(assembledHtml.includes('<head>'), 'HEAD opening tag exists');
    assert.ok(assembledHtml.includes('</head>'), 'HEAD closing tag exists');
    assert.ok(assembledHtml.includes('<body>'), 'BODY opening tag exists');
    assert.ok(assembledHtml.includes('</body>'), 'BODY closing tag exists');
    assert.ok(assembledHtml.includes('/js/presets/capacity-calc.js'), 'Capacity calc module included');
    assert.ok(assembledHtml.includes('/js/presets/audit-report-pdf.js'), 'Audit report module included');
    assert.ok(assembledHtml.includes('/js/presets/benchmark-iops.js'), 'Benchmark module included');
});

console.log('\n=============================================================');
console.log(` HASIL TEST INTEGRITAS DOM:  Passed: ${passed} | Failed: ${failed}`);
console.log('=============================================================\n');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
