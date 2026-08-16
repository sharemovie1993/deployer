const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = path.join(__dirname, '..', 'presets.db');
const PRESETS_JSON_FILE = path.join(__dirname, '..', 'presets.json');

let db;

function initDb() {
    if (db) return db;

    db = new DatabaseSync(DB_FILE);

    // Create table if not exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            vps_ip TEXT NOT NULL,
            vps_user TEXT NOT NULL,
            vps_sudo_pass TEXT,
            ssh_key_choice TEXT,
            vps_key_path TEXT,
            project TEXT,
            build_mode TEXT,
            obfuscate TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Auto-migrate data from presets.json if table is empty
    autoMigrateFromJson();

    return db;
}

function autoMigrateFromJson() {
    try {
        const countStmt = db.prepare('SELECT COUNT(*) as count FROM presets');
        const row = countStmt.get();
        if (row && row.count > 0) {
            return; // Table already has data
        }

        if (fs.existsSync(PRESETS_JSON_FILE)) {
            const raw = fs.readFileSync(PRESETS_JSON_FILE, 'utf8');
            const presets = JSON.parse(raw);
            if (Array.isArray(presets) && presets.length > 0) {
                const insertStmt = db.prepare(`
                    INSERT OR REPLACE INTO presets (
                        id, name, vps_ip, vps_user, vps_sudo_pass,
                        ssh_key_choice, vps_key_path, project, build_mode, obfuscate
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const p of presets) {
                    insertStmt.run(
                        p.id || `preset-${Date.now()}-${Math.random().toString(36).substring(2,6)}`,
                        p.name || p.vpsIp || 'Server VPS',
                        p.vpsIp || '',
                        p.vpsUser || 'asepsuryadi',
                        p.vpsSudoPass || '',
                        p.sshKeyChoice || 'nginxonly.pem',
                        p.vpsKeyPath || '',
                        p.project || 'absenta',
                        p.buildMode || 'remote',
                        p.obfuscate || 'N'
                    );
                }
                console.log(`[INFO] Berhasil migrasi ${presets.length} preset dari presets.json ke SQLite database (presets.db).`);
            }
        } else {
            // Seed default preset if no presets.json exists
            const insertStmt = db.prepare(`
                INSERT OR REPLACE INTO presets (
                    id, name, vps_ip, vps_user, vps_sudo_pass,
                    ssh_key_choice, vps_key_path, project, build_mode, obfuscate
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            insertStmt.run(
                'preset-10-10-10-99',
                'Server Sekolah (10.10.10.99)',
                '10.10.10.99',
                'asepsuryadi',
                '1',
                'nginxonly.pem',
                path.join(__dirname, '..', 'nginxonly.pem'),
                'absenta',
                'remote',
                'N'
            );
        }
    } catch (e) {
        console.error('[ERROR] Gagal migrasi preset ke SQLite:', e.message);
    }
}

function getPresets() {
    const instance = initDb();
    try {
        const stmt = instance.prepare('SELECT * FROM presets ORDER BY created_at ASC');
        const rows = stmt.all();
        return rows.map(r => ({
            id: r.id,
            name: r.name,
            vpsIp: r.vps_ip,
            vpsUser: r.vps_user,
            vpsSudoPass: r.vps_sudo_pass || '',
            sshKeyChoice: r.ssh_key_choice || 'nginxonly.pem',
            vpsKeyPath: r.vps_key_path || '',
            project: r.project || 'absenta',
            buildMode: r.build_mode || 'remote',
            obfuscate: r.obfuscate || 'N'
        }));
    } catch (e) {
        console.error('[ERROR] Gagal membaca presets dari SQLite:', e.message);
        return [];
    }
}

function savePresets(presets) {
    const instance = initDb();
    try {
        if (!Array.isArray(presets)) return;
        const deleteStmt = instance.prepare('DELETE FROM presets');
        deleteStmt.run();

        const insertStmt = instance.prepare(`
            INSERT INTO presets (
                id, name, vps_ip, vps_user, vps_sudo_pass,
                ssh_key_choice, vps_key_path, project, build_mode, obfuscate
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const p of presets) {
            insertStmt.run(
                p.id || `preset-${Date.now()}-${Math.random().toString(36).substring(2,6)}`,
                p.name || p.vpsIp || 'Server VPS',
                p.vpsIp || '',
                p.vpsUser || 'asepsuryadi',
                p.vpsSudoPass || '',
                p.sshKeyChoice || 'nginxonly.pem',
                p.vpsKeyPath || '',
                p.project || 'absenta',
                p.buildMode || 'remote',
                p.obfuscate || 'N'
            );
        }

        // Keep presets.json in sync as backup
        try {
            fs.writeFileSync(PRESETS_JSON_FILE, JSON.stringify(presets, null, 2), 'utf8');
        } catch (err) {}
    } catch (e) {
        console.error('[ERROR] Gagal menyimpan presets ke SQLite:', e.message);
    }
}

function saveSinglePreset(preset) {
    const instance = initDb();
    try {
        const stmt = instance.prepare(`
            INSERT INTO presets (
                id, name, vps_ip, vps_user, vps_sudo_pass,
                ssh_key_choice, vps_key_path, project, build_mode, obfuscate, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                vps_ip = excluded.vps_ip,
                vps_user = excluded.vps_user,
                vps_sudo_pass = excluded.vps_sudo_pass,
                ssh_key_choice = excluded.ssh_key_choice,
                vps_key_path = excluded.vps_key_path,
                project = excluded.project,
                build_mode = excluded.build_mode,
                obfuscate = excluded.obfuscate,
                updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(
            preset.id || `preset-${Date.now()}-${Math.random().toString(36).substring(2,6)}`,
            preset.name || preset.vpsIp || 'Server VPS',
            preset.vpsIp || '',
            preset.vpsUser || 'asepsuryadi',
            preset.vpsSudoPass || '',
            preset.sshKeyChoice || 'nginxonly.pem',
            preset.vpsKeyPath || '',
            preset.project || 'absenta',
            preset.buildMode || 'remote',
            preset.obfuscate || 'N'
        );

        // Sync back to JSON backup
        const current = getPresets();
        try {
            fs.writeFileSync(PRESETS_JSON_FILE, JSON.stringify(current, null, 2), 'utf8');
        } catch (err) {}
    } catch (e) {
        console.error('[ERROR] Gagal menyimpan single preset ke SQLite:', e.message);
    }
}

function deletePreset(id) {
    const instance = initDb();
    try {
        const stmt = instance.prepare('DELETE FROM presets WHERE id = ?');
        stmt.run(id);

        // Keep presets.json in sync
        const current = getPresets();
        try {
            fs.writeFileSync(PRESETS_JSON_FILE, JSON.stringify(current, null, 2), 'utf8');
        } catch (err) {}
    } catch (e) {
        console.error('[ERROR] Gagal menghapus preset dari SQLite:', e.message);
    }
}

module.exports = {
    getPresets,
    savePresets,
    saveSinglePreset,
    deletePreset,
    DB_FILE,
    PRESETS_FILE: PRESETS_JSON_FILE
};
