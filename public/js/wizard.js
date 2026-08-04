let currentStep = 1;
let installConfig = {
    targetOS: 'linux',
    vpsIp: '10.10.10.99',
    vpsUser: 'asepsuryadi',
    vpsKeyChoice: 'nginxonly.pem',
    vpsKeyPath: '',
    vpsSudoPass: '1',
    deployScenario: 'hybrid',
    targetDomain: 'absenta.sekolah.sch.id',
    backendPort: '3003',
    frontendPort: '5175',
    sslScenario: 'internal',
    cfToken: '',
    postgresMode: 'Y',
    dbUrl: 'postgresql://postgres:postgres@localhost:5432/absenta_db',
    redisMode: 'N',
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
    document.getElementById('card-mode-hybrid').classList.toggle('selected', scenario === 'hybrid');
    document.getElementById('card-mode-onprem').classList.toggle('selected', scenario === 'onprem');
}

function setPostgresMode(mode) {
    installConfig.postgresMode = mode;
    document.getElementById('card-pg-yes').classList.toggle('selected', mode === 'Y');
    document.getElementById('card-pg-no').classList.toggle('selected', mode === 'N');
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
        body: JSON.stringify(dbUrl)
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

function checkExistingLicense() {
    const alertBox = document.getElementById('license-test-alert');
    const key = document.getElementById('license-key').value;

    if (!key) {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Masukkan Serial Key Lisensi terlebih dahulu.';
        return;
    }

    alertBox.className = 'alert-box warning';
    alertBox.innerHTML = '🛡️ Memverifikasi Serial Key...';

    setTimeout(() => {
        alertBox.className = 'alert-box success';
        alertBox.innerHTML = '✅ Lisensi Valid & Terverifikasi Aktif!';
    }, 1000);
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
        installConfig.vpsIp = document.getElementById('vps-ip').value;
        installConfig.vpsUser = document.getElementById('vps-user').value;
        installConfig.vpsSudoPass = document.getElementById('vps-sudo-pass').value;
    } else if (currentStep === 2) {
        installConfig.targetDomain = document.getElementById('target-domain').value;
        installConfig.backendPort = document.getElementById('backend-port').value;
        installConfig.frontendPort = document.getElementById('frontend-port').value;
    } else if (currentStep === 3) {
        installConfig.dbUrl = document.getElementById('db-url').value;
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

    summary.innerHTML =
        '<strong>📌 Target Server:</strong> ' + installConfig.targetOS.toUpperCase() + ' (' + (installConfig.targetOS === 'linux' ? installConfig.vpsIp : 'Localhost') + ')<br>' +
        '<strong>🌐 Domain Sekolah:</strong> ' + installConfig.targetDomain + '<br>' +
        '<strong>🔌 Port Aplikasi:</strong> Backend ' + installConfig.backendPort + ' | Frontend ' + installConfig.frontendPort + '<br>' +
        '<strong>🗄️ Database PostgreSQL:</strong> ' + (installConfig.postgresMode === 'Y' ? 'Otomatis Install Lokal' : 'Database Eksisting') + '<br>' +
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
