const fs = require('fs');
const path = require('path');

const PRESETS_FILE = path.join(__dirname, '..', 'presets.json');

function getPresets() {
    if (!fs.existsSync(PRESETS_FILE)) {
        const defaultPreset = [{
            id: 'preset-10-10-10-99',
            name: 'Server Sekolah (10.10.10.99)',
            vpsIp: '10.10.10.99',
            vpsUser: 'asepsuryadi',
            sshKeyChoice: 'nginxonly.pem',
            vpsKeyPath: path.join(__dirname, '..', 'nginxonly.pem'),
            vpsSudoPass: '1',
            project: 'absenta'
        }];
        try {
            fs.writeFileSync(PRESETS_FILE, JSON.stringify(defaultPreset, null, 2), 'utf8');
        } catch (e) {
            console.error('[ERROR] Gagal membuat presets.json default:', e.message);
        }
        return defaultPreset;
    }
    try {
        const content = fs.readFileSync(PRESETS_FILE, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        console.error('[ERROR] Gagal membaca presets.json:', e.message);
        return [];
    }
}

function savePresets(presets) {
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), 'utf8');
}

module.exports = {
    getPresets,
    savePresets,
    PRESETS_FILE
};
