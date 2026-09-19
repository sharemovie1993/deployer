const { getPresets } = require('../preset-store');
const { executeSshCommand } = require('../ssh-helper');

function parseFioJson(stdout) {
    try {
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error('Format output JSON fio tidak ditemukan');
        }

        const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
        const data = JSON.parse(jsonStr);
        const job = data.jobs && data.jobs[0] ? data.jobs[0] : null;

        if (!job) {
            throw new Error('Data job fio kosong');
        }

        const readIops = Math.round(job.read.iops || 0);
        const writeIops = Math.round(job.write.iops || 0);
        const totalIops = readIops + writeIops;

        const readBwKBs = job.read.bw_bytes ? (job.read.bw_bytes / 1024 / (job.read.runtime / 1000 || 1)) : (job.read.bw || 0);
        const writeBwKBs = job.write.bw_bytes ? (job.write.bw_bytes / 1024 / (job.write.runtime / 1000 || 1)) : (job.write.bw || 0);

        const readThroughputMb = parseFloat((readBwKBs / 1024).toFixed(2));
        const writeThroughputMb = parseFloat((writeBwKBs / 1024).toFixed(2));
        const totalThroughputMb = parseFloat(((readBwKBs + writeBwKBs) / 1024).toFixed(2));

        let readLatMs = 0;
        if (job.read.lat_ns && job.read.lat_ns.mean) {
            readLatMs = parseFloat((job.read.lat_ns.mean / 1000000).toFixed(2));
        } else if (job.read.lat && job.read.lat.mean) {
            readLatMs = parseFloat((job.read.lat.mean / 1000).toFixed(2));
        }

        let writeLatMs = 0;
        if (job.write.lat_ns && job.write.lat_ns.mean) {
            writeLatMs = parseFloat((job.write.lat_ns.mean / 1000000).toFixed(2));
        } else if (job.write.lat && job.write.lat.mean) {
            writeLatMs = parseFloat((job.write.lat.mean / 1000).toFixed(2));
        }

        const avgLatMs = parseFloat(((readLatMs + writeLatMs) / (readLatMs > 0 && writeLatMs > 0 ? 2 : 1)).toFixed(2));

        let grade = 'C';
        let rating = 'Standard';
        let badgeColor = '#f59e0b';
        let singleInstanceStatus = 'CUKUP';
        let singleInstanceDesc = 'Cukup untuk 10-30 kelas. Untuk 55 kelas serentak disarankan tuning buffer.';
        let saasStatus = 'TERBATAS';
        let saasDesc = 'Hanya cocok untuk 1-2 sekolah kecil. Potensi I/O wait tinggi pada jam sibuk.';

        if (totalIops >= 25000 || (totalIops >= 15000 && avgLatMs <= 3.0)) {
            grade = 'S';
            rating = 'Enterprise Superfast (NVMe / High-End SSD)';
            badgeColor = '#10b981';
            singleInstanceStatus = 'SANGAT PRIMA (100% Recommended)';
            singleInstanceDesc = 'Sangat sanggup melayani 55+ kelas & ribuan tapping RFID serentak tanpa antrean I/O (Disk Latency ultra rendah).';
            saasStatus = 'ENTERPRISE READY (Multi-Tenant)';
            saasDesc = 'Sangat siap melayani 15-30+ sekolah / puluhan ribu siswa aktif serentak (SaaS High Load & CBT Ready).';
        } else if (totalIops >= 8000) {
            grade = 'A';
            rating = 'Very Good (Fast Dedicated SSD)';
            badgeColor = '#3b82f6';
            singleInstanceStatus = 'SANGAT SIAP (Recommended)';
            singleInstanceDesc = 'Lancar jaya untuk 55 kelas absensi sesi pergantian jam & database PostgreSQL write traffic.';
            saasStatus = 'SIAP (5-10 Sekolah)';
            saasDesc = 'Mampu melayani 5 hingga 10 sekolah skala menengah dengan latensi database stabil.';
        } else if (totalIops >= 2500) {
            grade = 'B';
            rating = 'Good (Standard Cloud SSD / Fast VPS)';
            badgeColor = '#06b6d4';
            singleInstanceStatus = 'SIAP (Standar Produksi)';
            singleInstanceDesc = 'Memenuhi standar minimum produksi untuk 55 kelas. Disarankan PostgreSQL shared_buffers & WAL di-tuning.';
            saasStatus = 'CUKUP (2-4 Sekolah)';
            saasDesc = 'Cukup untuk 2-4 tenant sekolah. Monitor I/O wait jika ada jadwal absensi yang bersamaan persis.';
        } else if (totalIops >= 1000) {
            grade = 'C';
            rating = 'Minimum Entry (Budget Cloud VPS)';
            badgeColor = '#f59e0b';
            singleInstanceStatus = 'MINIMUM (Perlu Monitoring I/O)';
            singleInstanceDesc = 'Bisa jalan, namun jika 55 kelas submit serentak dalam 3 menit, query database mungkin mengalami delay antrean 1-3 detik.';
            saasStatus = 'TIDAK DIREKOMENDASIKAN (Multi-Tenant)';
            saasDesc = 'Tidak disarankan untuk multi-tenant SaaS karena throughput disk akan menjadi bottleneck utama.';
        } else {
            grade = 'D';
            rating = 'Critical / Bottleneck (Slow Disk / HDD / Shared VPS Throttle)';
            badgeColor = '#ef4444';
            singleInstanceStatus = 'TIDAK DIREKOMENDASIKAN';
            singleInstanceDesc = 'Risiko tinggi request timeout 504 saat 55 kelas membuka sesi absensi serentak karena disk I/O queue overload.';
            saasStatus = 'TIDAK LAYAK';
            saasDesc = 'Disk storage terlalu lambat untuk arsitektur SaaS.';
        }

        return {
            success: true,
            grade,
            rating,
            badgeColor,
            metrics: {
                readIops,
                writeIops,
                totalIops,
                readThroughputMb,
                writeThroughputMb,
                totalThroughputMb,
                readLatMs,
                writeLatMs,
                avgLatMs
            },
            evaluation: {
                singleInstance: {
                    status: singleInstanceStatus,
                    description: singleInstanceDesc
                },
                saas: {
                    status: saasStatus,
                    description: saasDesc
                }
            }
        };
    } catch (e) {
        return {
            success: false,
            error: e.message
        };
    }
}

function parseDiskInfo(stdout) {
    const diskMatch = stdout.match(/--- DISK_INFO ---\s*([\s\S]*?)\s*--- FIO_RESULT ---/);
    const diskRaw = diskMatch ? diskMatch[1].trim() : '';
    return diskRaw;
}

function handleBenchmarkIops(req, res, parsedUrl) {
    let presetId = parsedUrl.searchParams.get('id');
    let targetIp = parsedUrl.searchParams.get('ip');
    let targetUser = parsedUrl.searchParams.get('user');
    let keyChoice = parsedUrl.searchParams.get('key');
    let sudoPass = parsedUrl.searchParams.get('sudoPass') || '1';

    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);

    if (preset) {
        targetIp = preset.vpsIp;
        targetUser = preset.vpsUser || 'asep';
        keyChoice = preset.vpsKeyPath || preset.sshKeyChoice || 'nginxonly.pem';
        sudoPass = preset.vpsSudoPass || '1';
    } else if (!targetIp) {
        targetIp = '10.10.10.116';
        targetUser = 'asepsuryadi';
        keyChoice = 'nginxonly.pem';
    }

    const testFile = '/tmp/absenta_iops_bench_' + Math.floor(Math.random() * 10000) + '.dat';

    const benchScript = [
        'export DEBIAN_FRONTEND=noninteractive',
        'if ! which fio >/dev/null 2>&1; then',
        '  echo ' + sudoPass + ' | sudo -S apt-get update -qq >/dev/null 2>&1',
        '  echo ' + sudoPass + ' | sudo -S apt-get install -y -qq fio >/dev/null 2>&1',
        'fi',
        'echo --- DISK_INFO ---',
        'lsblk -d -o NAME,MODEL,SIZE,ROTA,TYPE 2>/dev/null || df -h /',
        'echo --- FIO_RESULT ---',
        'fio --name=iops_test --ioengine=libaio --iodepth=32 --rw=randrw --rwmixread=70 --bs=4k --direct=1 --size=64M --numjobs=2 --runtime=5 --time_based --group_reporting --output-format=json --filename=' + testFile + ' 2>/dev/null',
        'rm -f ' + testFile + ' 2>/dev/null',
        'echo --- BENCH_END ---'
    ].join('\n');

    executeSshCommand({
        rawKeyPath: keyChoice,
        user: targetUser,
        ip: targetIp,
        command: benchScript,
        timeoutMs: 40000
    }).then(result => {
        if (!result.success) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: 'Gagal menjalankan benchmark di ' + targetUser + '@' + targetIp + ': ' + (result.stderr || 'Timeout')
            }));
            return;
        }

        const stdout = result.stdout || '';
        const diskInfo = parseDiskInfo(stdout);
        const parsedFio = parseFioJson(stdout);

        if (!parsedFio.success) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: 'Gagal memproses hasil benchmark FIO: ' + parsedFio.error,
                rawOutput: stdout
            }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            server: {
                presetId: preset ? preset.id : null,
                presetName: preset ? preset.name : (targetUser + '@' + targetIp),
                ip: targetIp,
                user: targetUser,
                diskInfo: diskInfo
            },
            ...parsedFio,
            timestamp: new Date().toISOString()
        }));
    }).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            message: 'Terjadi error saat benchmark IOPS: ' + err.message
        }));
    });
}

module.exports = {
    handleBenchmarkIops
};
