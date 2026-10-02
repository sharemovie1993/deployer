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
                    title: '🎓 Siswa Login & Akses Rekap (~2.000 Siswa)',
                    status: siswaStatus,
                    description: siswaDesc
                },
                ortu: {
                    title: '👨‍👩‍👦 Orang Tua (Ortu) Login & Notifikasi (~2.000+ Ortu)',
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

function parseHardwareInfo(stdout) {
    let cpuCores = 2;
    let cpuModel = 'Standard CPU';
    let ramTotalMb = 2048;
    let ramUsedMb = 512;
    let ramAvailableMb = 1536;

    // CPU Cores
    const coresMatch = stdout.match(/CPU_CORES:\s*(\d+)/);
    if (coresMatch) {
        cpuCores = parseInt(coresMatch[1], 10) || 2;
    }

    // CPU Model
    const modelMatch = stdout.match(/CPU_MODEL:\s*([^\r\n]+)/);
    if (modelMatch && modelMatch[1].trim()) {
        cpuModel = modelMatch[1].trim();
    }

    // RAM Free -m
    const memSectionMatch = stdout.match(/--- MEM_INFO ---\s*([\s\S]*?)\s*--- DISK_INFO ---/);
    if (memSectionMatch) {
        const memText = memSectionMatch[1];
        // Format free -m: Mem: total used free shared buff/cache available
        const memLineMatch = memText.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
        if (memLineMatch) {
            ramTotalMb = parseInt(memLineMatch[1], 10);
            ramUsedMb = parseInt(memLineMatch[2], 10);
            ramAvailableMb = parseInt(memLineMatch[6], 10);
        } else {
            const totalKb = memText.match(/MemTotal:\s+(\d+)/);
            const availKb = memText.match(/MemAvailable:\s+(\d+)/);
            if (totalKb) ramTotalMb = Math.round(parseInt(totalKb[1], 10) / 1024);
            if (availKb) ramAvailableMb = Math.round(parseInt(availKb[1], 10) / 1024);
        }
    }

    return {
        cpuCores,
        cpuModel,
        ramTotalMb,
        ramUsedMb,
        ramAvailableMb
    };
}

function parseNetworkTest(stdout) {
    let pingLatencyMs = 20.0;
    let packetLossPct = 0;
    let measuredSpeedMbps = 100.0;
    let iface = 'eth0';
    let status = 'STABIL & CEPAT';
    let grade = 'A';

    // 1. Iface
    const ifaceMatch = stdout.match(/IFACE:\s*([^\r\n]+)/);
    if (ifaceMatch && ifaceMatch[1].trim()) {
        iface = ifaceMatch[1].trim();
    }

    // 2. Parse Public Ping
    const pingSection = stdout.match(/--- NET_PING ---\s*([\s\S]*?)\s*--- NET_SPEED ---/);
    if (pingSection) {
        const pingText = pingSection[1];
        const rttMatch = pingText.match(/rtt min\/avg\/max\/mdev =\s*[\d\.]+\/([\d\.]+)\//);
        if (rttMatch) {
            pingLatencyMs = parseFloat(parseFloat(rttMatch[1]).toFixed(1));
        }
        const lossMatch = pingText.match(/(\d+)%\s+packet loss/);
        if (lossMatch) {
            packetLossPct = parseInt(lossMatch[1], 10);
        }
    }

    // 3. Parse Public Speed
    const speedBytesMatch = stdout.match(/SPEED_BYTES:\s*([\d\.]+)/);
    if (speedBytesMatch) {
        const bytesPerSec = parseFloat(speedBytesMatch[1]) || 0;
        if (bytesPerSec > 0) {
            measuredSpeedMbps = parseFloat(((bytesPerSec * 8) / 1000000).toFixed(1));
        }
    }

    // 4. Parse Tunnel to Server Lisensi
    let tunnelIface = '';
    let tunnelClientIp = '';
    let tunnelGwIp = '10.0.0.1';
    let tunnelPingMs = 0;
    let tunnelSpeedMbps = 0;
    let tunnelStatus = 'Belum Terpasang (Offline)';
    let hasTunnel = false;

    const tIfaceMatch = stdout.match(/TUNNEL_IFACE:\s*([^\r\n]+)/);
    if (tIfaceMatch && tIfaceMatch[1].trim() && tIfaceMatch[1].trim() !== 'NONE') {
        tunnelIface = tIfaceMatch[1].trim();
        hasTunnel = true;
    }

    const tClientIpMatch = stdout.match(/TUNNEL_CLIENT_IP:\s*([^\r\n]+)/);
    if (tClientIpMatch && tClientIpMatch[1].trim()) {
        tunnelClientIp = tClientIpMatch[1].trim();
    }

    const tGwIpMatch = stdout.match(/TUNNEL_GW_IP:\s*([^\r\n]+)/);
    if (tGwIpMatch && tGwIpMatch[1].trim()) {
        tunnelGwIp = tGwIpMatch[1].trim();
    }

    if (hasTunnel) {
        const tunnelPingMatch = stdout.match(/TUNNEL_PING_MS:\s*([\d\.]+)/);
        const tunnelHttpMatch = stdout.match(/TUNNEL_HTTP_CODE:\s*(\d+)/);
        if (tunnelPingMatch && tunnelHttpMatch && tunnelHttpMatch[1] === '200') {
            tunnelPingMs = parseFloat((parseFloat(tunnelPingMatch[1]) * 1000).toFixed(1));
            tunnelStatus = 'ONLINE & CEPAT';
        } else {
            tunnelStatus = 'TERPUTUS (Unreachable)';
        }

        const tunnelSpeedMatch = stdout.match(/TUNNEL_SPEED_BYTES:\s*([\d\.]+)/);
        if (tunnelSpeedMatch) {
            const tBytes = parseFloat(tunnelSpeedMatch[1]) || 0;
            if (tBytes > 0) {
                tunnelSpeedMbps = parseFloat(((tBytes * 8) / 1000000).toFixed(1));
            }
        }
    }

    // 5. Network Evaluation Status
    if (packetLossPct > 5 || pingLatencyMs > 200) {
        status = 'BURUK (Packet Loss / Kongesti)';
        grade = 'D';
    } else if (pingLatencyMs > 90 || packetLossPct > 0) {
        status = 'WASPADA (Latensi Jam Sibuk)';
        grade = 'C';
    } else if (measuredSpeedMbps >= 50 && pingLatencyMs <= 35) {
        status = 'SANGAT PRIMA & CEPAT';
        grade = 'S';
    } else {
        status = 'STABIL & NORMAL';
        grade = 'A';
    }

    return {
        iface,
        pingLatencyMs,
        packetLossPct,
        measuredSpeedMbps,
        tunnel: {
            hasTunnel,
            iface: tunnelIface,
            clientIp: tunnelClientIp,
            gwIp: tunnelGwIp,
            pingMs: tunnelPingMs,
            speedMbps: tunnelSpeedMbps,
            status: tunnelStatus
        },
        status,
        grade
    };
}

function parseDiskInfo(stdout) {
    const diskMatch = stdout.match(/--- DISK_INFO ---\s*([\s\S]*?)\s*--- FIO_RESULT ---/);
    const diskRaw = diskMatch ? diskMatch[1].trim() : '';
    
    // Parse baris demi baris, abaikan loop, ram, sr
    const lines = diskRaw.split('\n').map(l => l.trim()).filter(Boolean);
    const diskParts = [];
    let rootUsage = '';

    lines.forEach(line => {
        if (line.startsWith('Root:')) {
            rootUsage = line;
            return;
        }
        if (line.includes('NAME') || line.startsWith('loop') || line.startsWith('sr') || line.startsWith('ram')) {
            return;
        }
        // Contoh: sda 132G QEMU HARDDISK atau nvme0n1 500G Samsung SSD
        diskParts.push(line);
    });

    let formatted = diskParts.join(' | ');
    if (rootUsage) {
        formatted += (formatted ? ' • ' : '') + rootUsage;
    }
    return formatted || 'Disk: Standard Production SSD';
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
        targetUser = 'asep';
        keyChoice = 'nginxonly.pem';
    }

    const testFile = '/tmp/absenta_iops_bench_' + Math.floor(Math.random() * 10000) + '.dat';

    const benchScript = [
        'export DEBIAN_FRONTEND=noninteractive',
        'if ! which fio >/dev/null 2>&1; then',
        '  if which apt-get >/dev/null 2>&1; then',
        '    echo ' + sudoPass + ' | sudo -S apt-get update -qq >/dev/null 2>&1',
        '    echo ' + sudoPass + ' | sudo -S apt-get install -y -qq fio >/dev/null 2>&1',
        '  elif which yum >/dev/null 2>&1; then',
        '    echo ' + sudoPass + ' | sudo -S yum install -y -q fio >/dev/null 2>&1',
        '  elif which dnf >/dev/null 2>&1; then',
        '    echo ' + sudoPass + ' | sudo -S dnf install -y -q fio >/dev/null 2>&1',
        '  fi',
        'fi',
        'echo --- HARDWARE_INFO ---',
        'echo CPU_CORES: $(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 2)',
        'echo CPU_MODEL: $(grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs || echo "Standard Processor")',
        'echo --- MEM_INFO ---',
        'free -m 2>/dev/null || cat /proc/meminfo',
        'echo --- NET_INFO ---',
        'DEFAULT_IFACE=$(ip route 2>/dev/null | awk \'/default/ {print $5}\' | head -n1)',
        'echo "IFACE: ${DEFAULT_IFACE:-eth0}"',
        'echo --- NET_PING ---',
        'ping -c 3 -W 2 1.1.1.1 2>/dev/null || ping -c 3 -W 2 8.8.8.8 2>/dev/null || echo "PING_FAILED"',
        'echo --- NET_SPEED ---',
        'curl -s -w "SPEED_BYTES: %{speed_download}\\nTIME_TOTAL: %{time_total}\\nHTTP_CODE: %{http_code}\\n" -o /dev/null --max-time 4 "https://speed.cloudflare.com/__down?bytes=10000000" 2>/dev/null || echo "SPEED_FAILED"',
        'echo --- TUNNEL_TEST ---',
        'WG_IFACE=$( (ip link show type wireguard 2>/dev/null | grep -o "et-[a-zA-Z0-9-]*" ; ls /etc/wireguard/et-*.conf /var/www/project-absenta/tunnels/et-*.conf 2>/dev/null | sed "s/.*\\///;s/\\.conf//" ) | sort -u | head -n1 || true )',
        'if [ -z "$WG_IFACE" ]; then',
        '  WG_IFACE=$(ip -o link show 2>/dev/null | grep -oE "(et-[a-zA-Z0-9_-]+|wg[0-9]+)" | head -n1 || true)',
        'fi',
        'if [ -n "$WG_IFACE" ] && ip link show "$WG_IFACE" 2>/dev/null | grep -q "UP"; then',
        '  WG_CLIENT_IP=$(ip -o -4 addr show "$WG_IFACE" 2>/dev/null | awk \'{print $4}\' | cut -d/ -f1 | head -n1 || true)',
        '  WG_GW_IP="10.0.0.1"',
        '  echo "TUNNEL_IFACE: $WG_IFACE"',
        '  echo "TUNNEL_CLIENT_IP: $WG_CLIENT_IP"',
        '  echo "TUNNEL_GW_IP: $WG_GW_IP"',
        '  curl --interface "$WG_IFACE" -s -w "TUNNEL_PING_MS: %{time_total}\\nTUNNEL_HTTP_CODE: %{http_code}\\n" -o /dev/null --max-time 3 "http://${WG_GW_IP}:5001/api/speedtest/ping" 2>/dev/null || echo "TUNNEL_PING_FAILED"',
        '  curl --interface "$WG_IFACE" -s -w "TUNNEL_SPEED_BYTES: %{speed_download}\\nTUNNEL_TIME: %{time_total}\\n" -o /dev/null --max-time 4 "http://${WG_GW_IP}:5001/api/speedtest/download?sizeMb=5" 2>/dev/null || echo "TUNNEL_SPEED_FAILED"',
        'else',
        '  echo "TUNNEL_IFACE: NONE"',
        '  echo "TUNNEL_STATUS: NO_TUNNEL"',
        'fi',
        'echo --- DISK_INFO ---',
        'lsblk -dn -e 7,11 -o NAME,SIZE,MODEL 2>/dev/null || df -h /',
        'df -h / 2>/dev/null | awk \'NR==2 {print "Root: " $3 " / " $2 " (" $5 " terpakai)"}\'',
        'echo --- FIO_RESULT ---',
        'if which fio >/dev/null 2>&1; then',
        '  fio --name=iops_test --ioengine=libaio --iodepth=32 --rw=randrw --rwmixread=70 --bs=4k --direct=1 --size=64M --numjobs=2 --runtime=5 --time_based --group_reporting --output-format=json --filename=' + testFile + ' 2>/dev/null',
        '  rm -f ' + testFile + ' 2>/dev/null',
        'else',
        '  echo FIO_NOT_INSTALLED',
        'fi',
        'echo --- BENCH_END ---'
    ].join('\n');

    executeSshCommand({
        rawKeyPath: keyChoice,
        user: targetUser,
        ip: targetIp,
        command: benchScript,
        timeoutMs: 45000
    }).then(result => {
        if (!result.success) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: 'Gagal menghubungkan ke ' + targetUser + '@' + targetIp + ': ' + (result.stderr || 'Timeout')
            }));
            return;
        }

        const stdout = result.stdout || '';
        const diskInfo = parseDiskInfo(stdout);
        const hardwareInfo = parseHardwareInfo(stdout);
        const networkInfo = parseNetworkTest(stdout);

        if (stdout.includes('FIO_NOT_INSTALLED')) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: 'Paket benchmark (fio) belum terpasang di target server dan gagal diunduh otomatis (periksa koneksi internet VPS).'
            }));
            return;
        }

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
                diskInfo: diskInfo,
                hardware: hardwareInfo,
                network: networkInfo
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
