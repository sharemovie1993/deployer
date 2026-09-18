let currentStep = 1;
let installConfig = {
    targetOS: 'linux',
    vpsIp: '10.10.10.99',
    vpsUser: 'asepsuryadi',
    vpsKeyChoice: 'nginxonly.pem',
    vpsKeyPath: '',
    vpsSudoPass: '1',
    deployScenario: 'saas',
    targetDomain: 'absenta.sekolah.sch.id',
    backendPort: '3003',
    frontendPort: '5175',
    defaultTimezone: 'Asia/Jakarta',
    sslScenario: 'internal',
    cfToken: '',
    postgresMode: 'Y',
    dbUrl: 'postgresql://postgres:123123123@localhost:5432/absensi',
    redisMode: 'Y',
    redisUrl: 'redis://localhost:6379',
    licenseKey: '',
    schoolName: '',
    adminEmail: ''
};

function selectTargetOS(os) {
    installConfig.targetOS = os;
    document.getElementById('card-os-linux').classList.toggle('selected', os === 'linux');
    document.getElementById('card-os-windows').classList.toggle('selected', os === 'windows');
    document.getElementById('vps-details-form').style.display = os === 'linux' ? 'block' : 'none';
}

function handleKeySelection() {
    const val = document.getElementById('vps-key-select').value;
    installConfig.vpsKeyChoice = val;
    document.getElementById('key-upload-group').style.display = val === 'upload' ? 'block' : 'none';
}

function selectScenario(scenario) {
    installConfig.deployScenario = scenario;
    const saasCard = document.getElementById('card-mode-saas');
    const hybridCard = document.getElementById('card-mode-hybrid');
    const onpremCard = document.getElementById('card-mode-onprem');
    if (saasCard) saasCard.classList.toggle('selected', scenario === 'saas');
    if (hybridCard) hybridCard.classList.toggle('selected', scenario === 'hybrid');
    if (onpremCard) onpremCard.classList.toggle('selected', scenario === 'onprem');
}

function setPostgresMode(mode) {
    installConfig.postgresMode = mode;
    document.getElementById('card-pg-yes').classList.toggle('selected', mode === 'Y');
    document.getElementById('card-pg-no').classList.toggle('selected', mode === 'N');
}

function setRedisMode(mode) {
    installConfig.redisMode = mode;
    const yesCard = document.getElementById('card-redis-yes');
    const noCard = document.getElementById('card-redis-no');
    const urlGroup = document.getElementById('redis-url-group');
    if (yesCard) yesCard.classList.toggle('selected', mode === 'Y');
    if (noCard) noCard.classList.toggle('selected', mode === 'N');
    if (urlGroup) urlGroup.style.display = mode === 'N' ? 'block' : 'none';
}

function testSSHConnection() {
    const alertBox = document.getElementById('ssh-test-alert');
    alertBox.className = 'alert-box warning';
    alertBox.innerHTML = '🔄 Menguji koneksi SSH ke VPS... Silakan tunggu.';

    const payload = {
        vpsIp: document.getElementById('vps-ip').value,
        vpsUser: document.getElementById('vps-user').value,
        vpsKeyPath: installConfig.vpsKeyPath
    };

    fetch('/api/test-ssh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alertBox.className = 'alert-box success';
            alertBox.innerHTML = '✅ ' + data.message;
        } else {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = '❌ ' + data.message;
        }
    })
    .catch(err => {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Gagal melakukan tes SSH: ' + err.message;
    });
}

function testDatabaseConnection() {
    const alertBox = document.getElementById('db-test-alert');
    alertBox.className = 'alert-box warning';
    alertBox.innerHTML = '🔄 Memeriksa jangkauan port PostgreSQL...';

    const dbUrl = document.getElementById('db-url').value;

    fetch('/api/test-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbUrl })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alertBox.className = 'alert-box success';
            alertBox.innerHTML = '✅ ' + data.message;
        } else {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = '❌ ' + data.message;
        }
    })
    .catch(err => {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Gagal melakukan tes DB: ' + err.message;
    });
}

function createDatabaseAuto() {
    const alertBox = document.getElementById('db-test-alert');
    alertBox.className = 'alert-box warning';
    alertBox.innerHTML = '🔄 Menghubungi PostgreSQL dan membuat database baru... Silakan tunggu.';

    const dbUrl = document.getElementById('db-url').value;

    fetch('/api/create-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbUrl })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alertBox.className = 'alert-box success';
            alertBox.innerHTML = data.message;
        } else {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = data.message;
        }
    })
    .catch(err => {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Gagal membuat database: ' + err.message;
    });
}

function toggleLicenseMode(mode) {
    const cardExisting = document.getElementById('card-lic-existing');
    const cardRegister = document.getElementById('card-lic-register');
    const formExisting = document.getElementById('form-lic-existing');
    const formRegister = document.getElementById('form-lic-register');
    const alertBox = document.getElementById('license-test-alert');

    if (alertBox) alertBox.className = 'alert-box';

    if (mode === 'register') {
        if (cardExisting) cardExisting.classList.remove('selected');
        if (cardRegister) cardRegister.classList.add('selected');
        if (formExisting) formExisting.style.display = 'none';
        if (formRegister) formRegister.style.display = 'block';
    } else {
        if (cardExisting) cardExisting.classList.add('selected');
        if (cardRegister) cardRegister.classList.remove('selected');
        if (formExisting) formExisting.style.display = 'block';
        if (formRegister) formRegister.style.display = 'none';
    }
}

function requestNewLicense() {
    const alertBox = document.getElementById('license-test-alert');
    const schoolName = document.getElementById('reg-school-name').value.trim();
    const waNumber = document.getElementById('reg-wa-number').value.trim();
    const requestedSlug = document.getElementById('reg-slug').value.trim();

    if (!schoolName) {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Masukkan Nama Resmi Sekolah / Lembaga.';
        return;
    }
    if (!waNumber) {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Masukkan Nomor WhatsApp untuk menerima kunci lisensi.';
        return;
    }
    if (!requestedSlug) {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Masukkan Subdomain / Slug pilihan Anda.';
        return;
    }

    alertBox.className = 'alert-box warning';
    alertBox.innerHTML = '🔄 Mengirim permohonan registrasi lisensi baru ke api.absenta.id... Silakan tunggu.';

    fetch('/api/register-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolName, waNumber, requestedSlug })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success && data.licenseKey) {
            document.getElementById('license-key').value = data.licenseKey;
            const schoolNameInput = document.getElementById('school-name');
            if (schoolNameInput) schoolNameInput.value = data.schoolName;
            installConfig.licenseKey = data.licenseKey;
            installConfig.schoolName = data.schoolName;

            if (installConfig.deployScenario === 'hybrid' && data.domain) {
                installConfig.targetDomain = data.domain;
                const domainInput = document.getElementById('target-domain');
                if (domainInput) domainInput.value = data.domain;
            }

            toggleLicenseMode('existing');

            alertBox.className = 'alert-box success';
            alertBox.style.background = 'rgba(16, 185, 129, 0.1)';
            alertBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            alertBox.style.padding = '16px';
            alertBox.style.borderRadius = '12px';
            alertBox.innerHTML = `
                <div style="font-weight: 700; font-size: 15px; color: #34d399; margin-bottom: 8px;">
                    🎉 Registrasi Berhasil! Kunci Lisensi Baru Telah Diterbitkan
                </div>
                <div style="font-size: 13px; color: #e2e8f0; line-height: 1.6;">
                    <strong>Serial Key:</strong> <code style="color: #6ee7b7; font-weight: bold; font-size: 14px;">${data.licenseKey}</code><br>
                    <strong>Sekolah:</strong> ${data.schoolName}<br>
                    <strong>Domain Portal:</strong> <span style="color: #38bdf8;">${data.domain}</span><br>
                    <span style="color: #a78bfa;">Detail lisensi dan rincian aktivasi juga telah dikirimkan ke WhatsApp Anda (${waNumber}).</span>
                </div>
            `;
        } else {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = '❌ ' + (data.message || 'Gagal melakukan registrasi lisensi.');
        }
    })
    .catch(err => {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Gagal menghubungi server registrasi: ' + err.message;
    });
}

function checkExistingLicense() {
    const alertBox = document.getElementById('license-test-alert');
    const key = document.getElementById('license-key').value.trim();
    const schoolName = document.getElementById('school-name').value.trim();
    const adminEmail = document.getElementById('admin-email').value.trim();

    if (!key) {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Masukkan Serial Key Lisensi terlebih dahulu.';
        return;
    }

    alertBox.className = 'alert-box warning';
    alertBox.innerHTML = '🛡️ Memverifikasi Serial Key Lisensi ke server Absenta...';

    fetch('/api/verify-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: key, schoolName, adminEmail })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success && data.data) {
            const d = data.data;
            alertBox.className = 'alert-box success';
            alertBox.style.background = 'rgba(16, 185, 129, 0.1)';
            alertBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            alertBox.style.padding = '16px';
            alertBox.style.borderRadius = '12px';
            alertBox.innerHTML = `
                <div style="font-weight: 700; font-size: 15px; color: #34d399; display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 1px solid rgba(52,211,153,0.2); padding-bottom: 8px;">
                    <span>🛡️ ${data.message}</span>
                    <span class="badge badge-success" style="background: #059669; color: #fff; padding: 3px 10px; border-radius: 6px; font-size: 11px;">VERIFIED</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; font-size: 13px; text-align: left; color: #e2e8f0;">
                    <div>
                        <span style="color: var(--text-muted); display: block; font-size: 11px; font-weight: 600; text-transform: uppercase;">Serial Key Lisensi</span>
                        <code style="color: #6ee7b7; font-family: 'Fira Code', monospace; font-size: 12.5px; font-weight: 700;">${d.key}</code>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); display: block; font-size: 11px; font-weight: 600; text-transform: uppercase;">Lembaga / Sekolah Target</span>
                        <strong style="color: #fff;">${d.schoolName}</strong>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); display: block; font-size: 11px; font-weight: 600; text-transform: uppercase;">Paket / Tipe Lisensi</span>
                        <span style="color: #38bdf8; font-weight: 600;">${d.packageType}</span>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); display: block; font-size: 11px; font-weight: 600; text-transform: uppercase;">Akses SSL & Domain</span>
                        <span style="color: #a78bfa; font-weight: 600;">${d.tunnelAccess}</span>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); display: block; font-size: 11px; font-weight: 600; text-transform: uppercase;">Masa Berlaku / Status</span>
                        <span style="color: #34d399; font-weight: 600;">${d.status} (${d.expiredDate})</span>
                    </div>
                    <div>
                        <span style="color: var(--text-muted); display: block; font-size: 11px; font-weight: 600; text-transform: uppercase;">Admin / E-mail</span>
                        <span>${d.adminEmail}</span>
                    </div>
                </div>
            `;
        } else {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = '❌ ' + (data.message || 'Gagal memverifikasi lisensi.');
        }
    })
    .catch(err => {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Gagal memverifikasi lisensi: ' + err.message;
    });
}

function updateStepUI() {
    for (let i = 1; i <= 6; i++) {
        const panel = document.getElementById('panel-' + i);
        const navItem = document.getElementById('step-nav-' + i);
        if (panel) panel.classList.toggle('active', i === currentStep);
        if (navItem) {
            navItem.classList.toggle('active', i === currentStep);
            navItem.classList.toggle('completed', i < currentStep);
        }
    }

    document.getElementById('btn-prev').disabled = currentStep === 1;
    document.getElementById('btn-next').innerText = currentStep === 5 ? '🚀 Jalankan Pemasangan' : (currentStep === 6 ? 'Selesai' : 'Berikutnya');
    if (currentStep === 6) {
        document.getElementById('btn-next').style.display = 'none';
        document.getElementById('btn-prev').style.display = 'none';
    }

    if (currentStep === 5) {
        renderSummary();
    }
}

function nextStep() {
    if (currentStep === 1) {
        // targetOS already set via selectTargetOS() click handler
        if (installConfig.targetOS === 'linux') {
            installConfig.vpsIp = document.getElementById('vps-ip').value;
            installConfig.vpsUser = document.getElementById('vps-user').value;
            installConfig.vpsSudoPass = document.getElementById('vps-sudo-pass').value;
            const keyChoiceEl = document.getElementById('vps-key-select');
            if (keyChoiceEl) installConfig.vpsKeyChoice = keyChoiceEl.value;
        } else {
            // Windows on-premise: clear SSH fields so they don't confuse the backend
            installConfig.vpsIp = 'localhost';
            installConfig.vpsUser = '';
            installConfig.vpsSudoPass = '';
            installConfig.vpsKeyPath = '';
        }
    } else if (currentStep === 2) {
        installConfig.targetDomain = document.getElementById('target-domain').value;
        installConfig.backendPort = document.getElementById('backend-port').value;
        installConfig.frontendPort = document.getElementById('frontend-port').value;
        const tzEl = document.getElementById('platform-timezone');
        if (tzEl) installConfig.defaultTimezone = tzEl.value;
    } else if (currentStep === 3) {
        installConfig.dbUrl = document.getElementById('db-url').value;
        const redisUrlEl = document.getElementById('redis-url');
        if (redisUrlEl && installConfig.redisMode === 'N') {
            installConfig.redisUrl = redisUrlEl.value;
        }
    } else if (currentStep === 4) {
        installConfig.licenseKey = document.getElementById('license-key').value;
        installConfig.schoolName = document.getElementById('school-name').value;
        installConfig.adminEmail = document.getElementById('admin-email').value;
    } else if (currentStep === 5) {
        startInstallation();
        currentStep = 6;
        updateStepUI();
        return;
    }

    if (currentStep < 6) {
        currentStep++;
        updateStepUI();
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        updateStepUI();
    }
}

function renderSummary() {
    const summary = document.getElementById('summary-container');
    if (!summary) return;

    let scenarioLabel = '🌐 SaaS / Cloud Direct (Domain Publik Mandiri)';
    if (installConfig.deployScenario === 'hybrid') {
        scenarioLabel = '🔗 Hybrid (Lokal Sekolah + Easy-Tunnel WireGuard)';
    } else if (installConfig.deployScenario === 'onprem') {
        scenarioLabel = '🏫 On-Premise Intranet Murni (Tanpa Internet Publik)';
    }

    summary.innerHTML =
        '<strong>📌 Target Server:</strong> ' + installConfig.targetOS.toUpperCase() + ' (' + (installConfig.targetOS === 'linux' ? installConfig.vpsIp : 'Localhost') + ')<br>' +
        '<strong>🚀 Skenario Akses:</strong> ' + scenarioLabel + '<br>' +
        '<strong>🌐 Domain Sekolah:</strong> ' + installConfig.targetDomain + '<br>' +
        '<strong>🔌 Port Aplikasi:</strong> Backend ' + installConfig.backendPort + ' | Frontend ' + installConfig.frontendPort + '<br>' +
        '<strong>🕒 Zona Waktu:</strong> ' + (installConfig.defaultTimezone || 'Asia/Jakarta') + '<br>' +
        '<strong>🗄️ Database PostgreSQL:</strong> ' + (installConfig.postgresMode === 'Y' ? 'Otomatis Install Lokal' : 'Database Eksisting') + ' (' + installConfig.dbUrl + ')<br>' +
        '<strong>⚡ Redis Cache:</strong> ' + (installConfig.redisMode === 'Y' ? 'Otomatis Install Lokal di VPS' : 'Lewati / Eksternal (' + installConfig.redisUrl + ')') + '<br>' +
        '<strong>🛡️ Serial Key Lisensi:</strong> ' + (installConfig.licenseKey || 'Belum diisi (Trial Mode)');
}

function startInstallation() {
    fetch('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(installConfig)
    })
    .then(() => {
        const consoleContainer = document.getElementById('terminal-logs');
        const progressBar = document.getElementById('install-progress-fill');
        const percentText = document.getElementById('install-progress-percent');
        const statusText = document.getElementById('install-progress-status');
        const finalAlert = document.getElementById('final-install-alert');

        consoleContainer.innerHTML = '>> Menghubungkan ke log stream instan...\n';
        let progress = 5;

        const eventSource = new EventSource('/api/stream-install');

        eventSource.onmessage = function(event) {
            const line = event.data;

            if (line === '[INSTALL_COMPLETE]') {
                eventSource.close();
                progressBar.style.width = '100%';
                percentText.innerHTML = '100%';
                statusText.innerHTML = 'Pemasangan Selesai Sukses! 🎉';
                
                finalAlert.className = 'alert-box success';
                finalAlert.innerHTML = '<strong>Suksess!</strong> Aplikasi Absenta berhasil dipasang.<br><a href="http://' + installConfig.vpsIp + ':' + installConfig.frontendPort + '" target="_blank" style="color: white; font-weight: bold; text-decoration: underline;">Buka Portal Absenta Sekolah</a>';
                return;
            }

            if (line.startsWith('[INSTALL_FAILED]')) {
                eventSource.close();
                statusText.innerHTML = 'Deployment Gagal! ❌';
                finalAlert.className = 'alert-box error';
                finalAlert.innerHTML = '<strong>Instalasi Gagal!</strong><br>' + line;
                return;
            }

            const isError = line.startsWith('[ERROR]');
            const span = document.createElement('span');
            if (isError) span.style.color = 'var(--error)';
            span.appendChild(document.createTextNode(line + '\n'));
            consoleContainer.appendChild(span);
            consoleContainer.scrollTop = consoleContainer.scrollHeight;
        };
    });
}
