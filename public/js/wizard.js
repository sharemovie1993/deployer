let currentStep = 1;
let installConfig = {
    targetOS: 'linux',
    vpsIp: '10.10.10.99',
    vpsUser: 'asepsuryadi',
    vpsKeyChoice: 'nginxonly.pem',
    vpsKeyPath: '',
    vpsSudoPass: '1',
    deployScenario: 'saas-public',
    targetDomain: 'absenta.sekolah.sch.id',
    backendPort: '3003',
    frontendPort: '5175',
    defaultTimezone: 'Asia/Jakarta',
    sslScenario: 'letsencrypt',
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
    const saasPublicCard = document.getElementById('card-mode-saas-public');
    const saasLocalCard = document.getElementById('card-mode-saas-local');
    const onpremiseCard = document.getElementById('card-mode-onpremise');
    if (saasPublicCard) saasPublicCard.classList.toggle('selected', scenario === 'saas-public');
    if (saasLocalCard) saasLocalCard.classList.toggle('selected', scenario === 'saas-local');
    if (onpremiseCard) onpremiseCard.classList.toggle('selected', scenario === 'onpremise');

    const domainLabel = document.getElementById('label-target-domain');
    const domainInput = document.getElementById('target-domain');
    const domainTip = document.getElementById('domain-helper-tip');

    if (scenario === 'saas-public') {
        installConfig.sslScenario = 'letsencrypt';
        if (domainLabel) domainLabel.innerText = 'Domain Induk Platform SaaS (Cloud VPS)';
        if (domainInput) {
            domainInput.placeholder = 'Contoh: absenta.id (tanpa titik di depan)';
            if (!domainInput.value || domainInput.value === 'absenta.sekolah.sch.id' || domainInput.value === 'smkn1pld.absenta.id' || domainInput.value === 'home.absenta.id') {
                domainInput.value = 'absenta.id';
            }
        }
        if (domainTip) {
            domainTip.innerHTML = '🌐 <strong>Cloud Multi-Tenant:</strong> Masukkan domain induk platform Anda (tanpa subdomain). Sekolah-sekolah pelanggan nanti otomatis mendapatkan subdomain resmi di bawah domain ini (contoh: <code style="color:#6ee7b7;font-weight:bold;">smkn1.absenta.id</code>).';
        }
    } else if (scenario === 'saas-local') {
        installConfig.sslScenario = 'sync';
        if (domainLabel) domainLabel.innerText = 'Domain Layanan Home-Lab (Multi-Tenant)';
        if (domainInput) {
            domainInput.placeholder = 'Contoh: absenta.id atau home.absenta.id';
            if (!domainInput.value || domainInput.value === 'absenta.sekolah.sch.id' || domainInput.value === 'smkn1pld.absenta.id') {
                domainInput.value = 'home.absenta.id';
            }
        }
        if (domainTip) {
            domainTip.innerHTML = '🏠 <strong>Home-Lab Multi-Tenant:</strong> Server fisik di rumah/kantor sendiri (online via EasyTunnel). Jika Anda juga menyewa Cloud VPS untuk <code>absenta.id</code>, gunakan pembeda seperti <code style="color:#6ee7b7;font-weight:bold;">home.absenta.id</code> agar sekolah di server rumah beralamat di <code style="color:#6ee7b7;font-weight:bold;">smkn1.home.absenta.id</code>.';
        }
    } else if (scenario === 'onpremise') {
        installConfig.sslScenario = 'sync';
        if (domainLabel) domainLabel.innerText = 'Subdomain / Domain Akses Sekolah (Dedicated)';
        if (domainInput) {
            domainInput.placeholder = 'Contoh: smkn1pld.absenta.id atau aduhay.absenta.id';
            if (!domainInput.value || domainInput.value === 'absenta.id' || domainInput.value === 'home.absenta.id' || domainInput.value === 'absenta.sekolah.sch.id') {
                domainInput.value = 'smkn1pld.absenta.id';
            }
        }
        if (domainTip) {
            domainTip.innerHTML = '🏫 <strong>Dedicated 1 Sekolah:</strong> Masukkan subdomain resmi sekolah ini. Jika Anda memasukkan atau meregistrasikan Serial Key di Langkah 4 nanti, kolom ini akan otomatis diselaraskan.';
        }
    }

    // Dynamic Step 4 UI switching & context banner
    const step4Title = document.getElementById('step-4-title');
    const step4Subtitle = document.getElementById('step-4-subtitle');
    const bannerModeTitle = document.getElementById('banner-lic-mode-title');
    const badgeScenario = document.getElementById('badge-lic-scenario');
    const bannerDesc = document.getElementById('banner-lic-desc');
    const labelSchoolName = document.getElementById('label-school-name');
    const schoolNameInput = document.getElementById('school-name');
    const labelAdminEmail = document.getElementById('label-admin-email');
    const adminEmailInput = document.getElementById('admin-email');
    const labelRegSchoolName = document.getElementById('label-reg-school-name');
    const regSchoolNameInput = document.getElementById('reg-school-name');
    const labelRegSlug = document.getElementById('label-reg-slug');
    const tipRegSlug = document.getElementById('tip-reg-slug');

    if (scenario === 'saas-public' || scenario === 'saas-local') {
        if (step4Title) step4Title.innerText = 'Registrasi & Lisensi Node Server SaaS';
        if (step4Subtitle) step4Subtitle.innerText = 'Server SaaS wajib terdaftar di Server Lisensi Pusat (api.absenta.id) untuk administrasi, monitoring node, dan sinkronisasi tenant.';
        if (badgeScenario) {
            badgeScenario.innerText = scenario === 'saas-public' ? 'Cloud Multi-Tenant' : 'Home-Lab Multi-Tenant';
            badgeScenario.className = scenario === 'saas-public' ? 'badge badge-purple' : 'badge badge-primary';
        }
        if (bannerModeTitle) bannerModeTitle.innerText = 'Otentikasi Node Server SaaS Master ke Lisensi Pusat';
        if (bannerDesc) {
            bannerDesc.innerHTML = 'Server ini disiapkan sebagai <strong>Node Multi-Tenant</strong>. Seluruh server Absenta wajib memiliki Serial Key resmi yang terdaftar di Server Lisensi Pusat (<code>api.absenta.id</code>) untuk administrasi, monitoring kapasitas (RAM/CPU/DB), dan manajemen jaringan.';
        }
        if (labelSchoolName) labelSchoolName.innerText = 'Nama Brand Platform / Identitas Node Server';
        if (schoolNameInput) schoolNameInput.placeholder = 'Contoh: Absenta Edu Cloud / Node Server 1';
        if (labelAdminEmail) labelAdminEmail.innerText = 'Email Super Administrator Master';
        if (adminEmailInput && (!adminEmailInput.value || adminEmailInput.value === 'admin@sekolah.sch.id')) adminEmailInput.value = 'admin@absenta.id';
        if (labelRegSchoolName) labelRegSchoolName.innerHTML = 'Nama Brand Platform / Identitas Node <span style="color: var(--error);">*</span>';
        if (regSchoolNameInput) regSchoolNameInput.placeholder = 'Contoh: Absenta Cloud Pusat';
        if (labelRegSlug) labelRegSlug.innerHTML = 'Slug / Identitas Unik Node Server <span style="color: var(--error);">*</span>';
        if (tipRegSlug) tipRegSlug.innerText = 'Identitas unik node server Anda yang didaftarkan ke DNS pusat absenta.id.';
    } else {
        // onpremise
        if (step4Title) step4Title.innerText = 'Aktivasi Lisensi Server Sekolah (On-Premise)';
        if (step4Subtitle) step4Subtitle.innerText = 'Daftarkan atau verifikasi Serial Key server appliance resmi untuk sekolah ini.';
        if (badgeScenario) {
            badgeScenario.innerText = 'Dedicated 1 Sekolah';
            badgeScenario.className = 'badge badge-success';
        }
        if (bannerModeTitle) bannerModeTitle.innerText = 'Otentikasi Server Appliance Sekolah';
        if (bannerDesc) {
            bannerDesc.innerHTML = 'Server fisik sekolah ini wajib terdaftar di Server Lisensi Pusat (<code>api.absenta.id</code>) untuk sinkronisasi domain, penerbitan sertifikat SSL, dan aktivasi masa berlangganan sekolah.';
        }
        if (labelSchoolName) labelSchoolName.innerText = 'Nama Resmi Sekolah / Lembaga';
        if (schoolNameInput) schoolNameInput.placeholder = 'Contoh: SMK Negeri 1 Jakarta';
        if (labelAdminEmail) labelAdminEmail.innerText = 'Email Penanggung Jawab / Admin Sekolah';
        if (adminEmailInput && adminEmailInput.value === 'admin@absenta.id') adminEmailInput.value = 'admin@sekolah.sch.id';
        if (labelRegSchoolName) labelRegSchoolName.innerHTML = 'Nama Resmi Sekolah / Lembaga <span style="color: var(--error);">*</span>';
        if (regSchoolNameInput) regSchoolNameInput.placeholder = 'Contoh: SMK Negeri 4 Bandung';
        if (labelRegSlug) labelRegSlug.innerHTML = 'Subdomain / Slug Akses Pilihan <span style="color: var(--error);">*</span>';
        if (tipRegSlug) tipRegSlug.innerText = 'Alamat domain publik yang akan diberikan server lisensi untuk portal sekolah Anda.';
    }
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
    const cardMigrate = document.getElementById('card-lic-migrate');
    const formExisting = document.getElementById('form-lic-existing');
    const formRegister = document.getElementById('form-lic-register');
    const formMigrate = document.getElementById('form-lic-migrate');
    const alertBox = document.getElementById('license-test-alert');

    if (alertBox) alertBox.className = 'alert-box';

    if (cardExisting) cardExisting.classList.toggle('selected', mode === 'existing');
    if (cardRegister) cardRegister.classList.toggle('selected', mode === 'register');
    if (cardMigrate) cardMigrate.classList.toggle('selected', mode === 'migrate');

    if (formExisting) formExisting.style.display = (mode === 'existing') ? 'block' : 'none';
    if (formRegister) formRegister.style.display = (mode === 'register') ? 'block' : 'none';
    if (formMigrate) formMigrate.style.display = (mode === 'migrate') ? 'block' : 'none';
}

function requestMigrationOtp() {
    const alertBox = document.getElementById('license-test-alert');
    const slugInput = document.getElementById('mig-slug');
    const slug = (slugInput ? slugInput.value : '').trim().toLowerCase();
    const btnSendOtp = document.getElementById('btn-mig-send-otp');
    const otpSection = document.getElementById('mig-otp-section');
    const phoneNotice = document.getElementById('mig-phone-notice');

    if (!slug) {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Masukkan subdomain sekolah di Cloud SaaS yang ingin dipindahkan.';
        return;
    }

    alertBox.className = 'alert-box warning';
    alertBox.innerHTML = '⏳ Menghubungi server lisensi untuk verifikasi subdomain & mengirim kode OTP WhatsApp...';
    if (btnSendOtp) btnSendOtp.disabled = true;

    fetch('/api/request-migration-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedSlug: slug })
    })
    .then(res => res.json())
    .then(data => {
        if (btnSendOtp) btnSendOtp.disabled = false;
        if (data.success) {
            alertBox.className = 'alert-box success';
            alertBox.innerHTML = `✅ ${data.message}`;
            if (otpSection) otpSection.style.display = 'block';
            if (phoneNotice) {
                phoneNotice.innerHTML = `📱 Kode OTP 6 digit telah dikirim ke nomor WhatsApp operator: <strong>${data.masked_phone}</strong> (${data.school_name}). Masukkan kode di bawah:`;
            }
            const otpInput = document.getElementById('mig-otp-code');
            if (otpInput) otpInput.focus();
        } else {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = '❌ ' + (data.message || 'Gagal mengirim OTP migrasi.');
        }
    })
    .catch(err => {
        if (btnSendOtp) btnSendOtp.disabled = false;
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Gagal menghubungi server: ' + err.message;
    });
}

function confirmMigrationOtp() {
    const alertBox = document.getElementById('license-test-alert');
    const slugInput = document.getElementById('mig-slug');
    const slug = (slugInput ? slugInput.value : '').trim().toLowerCase();
    const otpInput = document.getElementById('mig-otp-code');
    const otp = (otpInput ? otpInput.value : '').trim();
    const btnConfirm = document.getElementById('btn-mig-confirm-otp');

    if (!otp || otp.length < 6) {
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Masukkan 6 digit kode OTP WhatsApp yang Anda terima.';
        return;
    }

    alertBox.className = 'alert-box warning';
    alertBox.innerHTML = '⏳ Memvalidasi kode OTP dan mengalihkan konfigurasi rute lisensi ke server fisik...';
    if (btnConfirm) btnConfirm.disabled = true;

    fetch('/api/confirm-migration-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedSlug: slug, otp })
    })
    .then(res => res.json())
    .then(data => {
        if (btnConfirm) btnConfirm.disabled = false;
        if (data.success && data.license_key) {
            document.getElementById('license-key').value = data.license_key;
            const schoolNameInput = document.getElementById('school-name');
            if (schoolNameInput) schoolNameInput.value = data.school_name || '';
            installConfig.licenseKey = data.license_key;
            installConfig.schoolName = data.school_name || '';

            if (installConfig.deployScenario === 'onpremise' && data.domain) {
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
                    🎉 Migrasi Berhasil! Subdomain Resmi Ditautkan ke Server On-Premise
                </div>
                <div style="font-size: 13px; color: #e2e8f0; line-height: 1.6;">
                    <strong>Serial Key Server (Gratis/Aktif):</strong> <code style="color: #6ee7b7; font-weight: bold; font-size: 14px;">${data.license_key}</code><br>
                    <strong>Sekolah:</strong> ${data.school_name || ''}<br>
                    <strong>Domain Akses Dialihkan:</strong> <span style="color: #38bdf8; font-weight: 600;">${data.domain}</span><br>
                    <strong>Mode Lisensi:</strong> <span style="color: #a78bfa; font-weight: 600;">On-Premise Server Appliance (Aktif Permanen)</span><br>
                    <span style="color: #6ee7b7;">Gateway routing Caddy telah disinkronkan secara otomatis. Anda siap melanjutkan instalasi!</span>
                </div>
            `;
        } else {
            alertBox.className = 'alert-box error';
            alertBox.innerHTML = '❌ ' + (data.message || 'Verifikasi kode OTP gagal.');
        }
    })
    .catch(err => {
        if (btnConfirm) btnConfirm.disabled = false;
        alertBox.className = 'alert-box error';
        alertBox.innerHTML = '❌ Gagal verifikasi kode OTP: ' + err.message;
    });
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

            if (installConfig.deployScenario === 'onpremise' && data.domain) {
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
        const licKeyEl = document.getElementById('license-key');
        const schoolNameEl = document.getElementById('school-name');
        const adminEmailEl = document.getElementById('admin-email');

        installConfig.licenseKey = licKeyEl ? licKeyEl.value.trim() : '';
        installConfig.schoolName = schoolNameEl ? schoolNameEl.value.trim() : '';
        installConfig.adminEmail = adminEmailEl ? adminEmailEl.value.trim() : '';

        // Default fallbacks
        if (!installConfig.schoolName) {
            installConfig.schoolName = (installConfig.deployScenario === 'onpremise') ? 'Sekolah Absenta' : 'Absenta Cloud Platform';
        }
        if (!installConfig.adminEmail) {
            installConfig.adminEmail = (installConfig.deployScenario === 'onpremise') ? 'admin@sekolah.sch.id' : 'admin@absenta.id';
        }
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

    let scenarioLabel = '🌐 saas-public (Cloud VPS Multi-Tenant, Let\'s Encrypt SSL)';
    if (installConfig.deployScenario === 'saas-local') {
        scenarioLabel = '🏠 saas-local (Server Rumah/Kantor Multi-Tenant + EasyTunnel)';
    } else if (installConfig.deployScenario === 'onpremise') {
        scenarioLabel = '🏫 onpremise (Dedicated 1 Sekolah: LAN Port 80 + EasyTunnel)';
    }

    let domainSummaryLabel = installConfig.deployScenario === 'onpremise' ? '🌐 Domain Akses Sekolah:' : '🌐 Domain Induk Platform:';
    let entityLabel = installConfig.deployScenario === 'onpremise' ? '🏫 Lembaga / Sekolah:' : '🏢 Platform / Identitas Node:';
    let adminLabel = installConfig.deployScenario === 'onpremise' ? '📧 Email Admin Sekolah:' : '👤 Email Super Admin:';

    summary.innerHTML =
        '<strong>📌 Target Server:</strong> ' + installConfig.targetOS.toUpperCase() + ' (' + (installConfig.targetOS === 'linux' ? installConfig.vpsIp : 'Localhost') + ')<br>' +
        '<strong>🚀 Skenario Akses:</strong> ' + scenarioLabel + '<br>' +
        '<strong>' + domainSummaryLabel + '</strong> ' + installConfig.targetDomain + '<br>' +
        '<strong>' + entityLabel + '</strong> ' + (installConfig.schoolName || '-') + '<br>' +
        '<strong>' + adminLabel + '</strong> ' + (installConfig.adminEmail || '-') + '<br>' +
        '<strong>🔌 Port Aplikasi:</strong> Backend ' + installConfig.backendPort + ' | Frontend ' + installConfig.frontendPort + '<br>' +
        '<strong>🕒 Zona Waktu:</strong> ' + (installConfig.defaultTimezone || 'Asia/Jakarta') + '<br>' +
        '<strong>🗄️ Database PostgreSQL:</strong> ' + (installConfig.postgresMode === 'Y' ? 'Otomatis Install Lokal' : 'Database Eksisting') + ' (' + installConfig.dbUrl + ')<br>' +
        '<strong>⚡ Redis Cache:</strong> ' + (installConfig.redisMode === 'Y' ? 'Otomatis Install Lokal di VPS' : 'Lewati / Eksternal (' + installConfig.redisUrl + ')') + '<br>' +
        '<strong>🛡️ Serial Key Lisensi Server:</strong> ' + (installConfig.licenseKey ? '<code style="color:#6ee7b7;font-weight:bold;">' + installConfig.licenseKey + '</code> (Terdaftar di api.absenta.id)' : '<span style="color:#f59e0b;">Belum diverifikasi / Trial Mode</span>');
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
                
                const hostIp = (installConfig.vpsIp && installConfig.vpsIp !== 'localhost') ? installConfig.vpsIp : 'localhost';
                const ipUrl = `http://${hostIp}`;
                
                let domainUrl = '';
                if (installConfig.targetDomain && installConfig.targetDomain !== 'localhost' && !/^[0-9.]+$/.test(installConfig.targetDomain)) {
                    const proto = (installConfig.sslScenario === 'letsencrypt' || installConfig.sslScenario === 'cloudflare') ? 'https://' : 'http://';
                    domainUrl = `${proto}${installConfig.targetDomain}`;
                }

                let buttonsHtml = `
                    <a href="${ipUrl}" target="_blank" class="btn btn-primary" style="text-decoration: none; padding: 9px 18px; font-size: 13.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                        🌐 Buka Portal via IP Server (${ipUrl})
                    </a>
                `;

                if (domainUrl) {
                    buttonsHtml += `
                        <a href="${domainUrl}" target="_blank" class="btn btn-secondary" style="text-decoration: none; padding: 9px 18px; font-size: 13.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                            🔗 Buka via Domain (${installConfig.targetDomain})
                        </a>
                    `;
                }

                finalAlert.className = 'alert-box success';
                finalAlert.style.padding = '18px';
                finalAlert.style.borderRadius = '12px';
                finalAlert.innerHTML = `
                    <div style="font-weight: 700; font-size: 16px; color: #34d399; margin-bottom: 6px;">
                        🎉 Pemasangan Selesai Sukses!
                    </div>
                    <div style="font-size: 13px; color: #e2e8f0; line-height: 1.6; margin-bottom: 14px;">
                        Layanan Web Server Caddy telah aktif dan siap melayani lalu lintas di <strong>Port 80/443</strong>.<br>
                        Port aplikasi internal (<code>${installConfig.frontendPort}</code> & <code>${installConfig.backendPort}</code>) telah diproteksi dan dirutekan secara otomatis.
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        ${buttonsHtml}
                    </div>
                `;
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

document.addEventListener('DOMContentLoaded', () => {
    selectScenario(installConfig.deployScenario || 'saas-public');
});
