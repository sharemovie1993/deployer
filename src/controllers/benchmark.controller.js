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

        // Skenario Spesifik
        let guruStatus = 'CUKUP';
        let guruDesc = '55 Guru login & input sesi aman jika bertahap, delay ~1-2 detik saat submit bersamaan.';
        let siswaStatus = 'CUKUP';
        let siswaDesc = 'Akses portal 2.000 siswa stabil, cache Redis membantu meringankan query disk.';
        let ortuStatus = 'CUKUP';
        let ortuDesc = 'Pengecekan notifikasi 2.000+ ortu lancar, disarankan batasi polling riwayat.';
        let terminalStatus = 'AMAN';
        let terminalDesc = 'Tapping RFID 10-55 perangkat lancar dengan queue database wajar.';
        let saasStatus = 'TERBATAS';
        let saasDesc = 'Hanya cocok untuk 1-2 sekolah kecil. Tidak disarankan multi-tenant skala besar.';

        if (totalIops >= 25000 || (totalIops >= 15000 && avgLatMs <= 3.0)) {
            grade = 'S';
            rating = 'Enterprise Superfast (NVMe / High-End SSD)';
            badgeColor = '#10b981';
            
            guruStatus = 'SANGAT INSTAN (Zero Delay)';
            guruDesc = '55 Guru buka sesi & update 2.000 status siswa serentak dalam 1 menit selesai tanpa ada I/O lock (<10ms).';
            
            siswaStatus = 'SANGAT PRIMA';
            siswaDesc = '2.000 - 5.000 Siswa login & buka portal akademik bersamaan tanpa antrean disk.';
            
            ortuStatus = 'SANGAT PRIMA';
            ortuDesc = '3.000+ Orang tua menerima & memantau notifikasi real-time saat jam masuk tanpa latency.';
            
            terminalStatus = 'ULTRA CEPAT';
            terminalDesc = '55 Perangkat RFID tapping serentak (30-50 tap/detik) tercatat instan di PostgreSQL direct write.';
            
            saasStatus = 'ENTERPRISE READY (Multi-Tenant)';
            saasDesc = 'Sangat siap untuk 15-30+ Sekolah / 25.000+ Siswa aktif serentak (CBT & High Load Ready).';

        } else if (totalIops >= 8000) {
            grade = 'A';
            rating = 'Very Good (Fast Dedicated SSD)';
            badgeColor = '#3b82f6';

            guruStatus = 'SANGAT SIAP';
            guruDesc = '55 Guru membuka sesi & submit absensi lancar jaya dengan response time < 50ms.';

            siswaStatus = 'SANGAT SIAP';
            siswaDesc = '2.000 Siswa login lancar, session JWT di Redis dan query database terlayani cepat.';

            ortuStatus = 'SANGAT SIAP';
            ortuDesc = '2.000+ Ortu cek presensi serentak di pagi hari terlayani dengan throughput stabil.';

            terminalStatus = 'SANGAT CEPAT';
            terminalDesc = 'Tapping RFID dari puluhan terminal tersimpan tanpa lag ke storage.';

            saasStatus = 'SIAP (5-10 Sekolah)';
            saasDesc = 'Mampu melayani 5 hingga 10 sekolah skala menengah dengan latensi database stabil.';

        } else if (totalIops >= 2500) {
            grade = 'B';
            rating = 'Good (Standard Cloud SSD / Fast VPS)';
            badgeColor = '#06b6d4';

            guruStatus = 'SIAP (Standar)';
            guruDesc = '55 Guru submit absensi sesi KBM aman. Disarankan PostgreSQL shared_buffers dioptimalkan.';

            siswaStatus = 'SIAP';
            siswaDesc = '1.000 - 2.000 Siswa login normal. Cache Redis sangat membantu menekan disk read.';

            ortuStatus = 'SIAP';
            ortuDesc = 'Ortu memantau kehadiran siswa dengan response time wajar (~100-200ms).';

            terminalStatus = 'SIAP';
            terminalDesc = 'Tapping RFID berjalan normal untuk alur gerbang sekolah harian.';

            saasStatus = 'CUKUP (2-4 Sekolah)';
            saasDesc = 'Cukup untuk 2-4 tenant sekolah. Monitor I/O wait jika jadwal KBM bersamaan persis.';

        } else if (totalIops >= 1000) {
            grade = 'C';
            rating = 'Minimum Entry (Budget Cloud VPS)';
            badgeColor = '#f59e0b';

            guruStatus = 'MINIMUM (Delay Ringan)';
            guruDesc = 'Jika 55 guru submit serentak dalam 3 menit, query database bisa antre 1-3 detik.';

            siswaStatus = 'CUKUP';
            siswaDesc = 'Siswa login lancar jika tersebar, namun rawan lambat jika ribuan siswa buka bersamaan.';

            ortuStatus = 'CUKUP';
            ortuDesc = 'Notifikasi terkirim namun rekap presensi di aplikasi wali murid bisa delay beberapa detik.';

            terminalStatus = 'CUKUP (Prioritas Buffer)';
            terminalDesc = 'Aman untuk 10 terminal, namun perlu antrean buffer jika lonjakan tapping sangat padat.';

            saasStatus = 'TIDAK DIREKOMENDASIKAN';
            saasDesc = 'Tidak disarankan untuk multi-tenant SaaS karena write disk akan menjadi bottleneck utama.';

        } else {
            grade = 'D';
            rating = 'Critical / Bottleneck (Slow Disk / HDD / Shared Throttle)';
            badgeColor = '#ef4444';

            guruStatus = 'RISIKO TINGGI (504 Timeout)';
            guruDesc = 'Risiko tinggi request timeout 504 saat 55 guru membuka sesi absensi serentak karena I/O queue overload.';

            siswaStatus = 'RAWAN ERROR';
            siswaDesc = 'Login massal siswa dapat menyebabkan antrean database terkunci (lock contention).';

            ortuStatus = 'DELAY TINGGI';
            ortuDesc = 'Notifikasi dan monitoring ortu mengalami antrean panjang.';

            terminalStatus = 'RAWAN PENDING';
            terminalDesc = 'Tapping RFID rawan pending atau delay verifikasi kartu di terminal.';

            saasStatus = 'TIDAK LAYAK';
            saasDesc = 'Disk storage terlalu lambat untuk arsitektur SaaS produksi.';
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
            scenarios: {
                guru: {
                    title: '👨‍🏫 Guru Login & Input Sesi KBM (55 Kelas Serentak)',
                    status: guruStatus,
                    description: guruDesc
                },
                siswa: {
                    title: '🎓 Siswa Login & Akses Portal Rekap (~2.000 Siswa)',
                    status: siswaStatus,
                    description: siswaDesc
                },
                ortu: {
                    title: '👨‍👩‍👦 Orang Tua (Ortu) Login & Pantau Notifikasi (~2.000+ Ortu)',
                    status: ortuStatus,
                    description: ortuDesc
                },
                terminal: {
                    title: '📟 Terminal RFID & Tapping Gerbang Masuk (10 - 55 Perangkat)',
                    status: terminalStatus,
                    description: terminalDesc
                },
                saas: {
                    title: '🌐 Platform SaaS Multi-Tenant (Multi-Sekolah / Puluhan Ribu Siswa)',
                    status: saasStatus,
                    description: saasDesc
                }
            },
            evaluation: {
                singleInstance: {
                    status: totalIops >= 8000 ? 'SANGAT PRIMA (100% Recommended)' : totalIops >= 2500 ? 'SIAP (Standar Produksi)' : 'MINIMUM (Perlu Monitoring)',
                    description: totalIops >= 8000 ? 'Sangat sanggup melayani 55+ kelas, 2.000 siswa, ribuan ortu & terminal serentak.' : 'Cukup untuk 10-30 kelas. Untuk 55 kelas serentak disarankan tuning buffer.'
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
