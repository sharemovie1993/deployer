/**
 * Shared Preset Picker Component - Single Source of Truth untuk Seluruh Dropdown Target Server
 */
(function () {
    window.sharedPresets = [];

    /**
     * Fetch presets dari SQLite backend (Single Source of Truth)
     */
    window.fetchSharedPresets = async function (forceRefresh = false) {
        if (!forceRefresh && window.sharedPresets.length > 0) {
            return window.sharedPresets;
        }

        try {
            const res = await fetch('/api/presets');
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                window.sharedPresets = json.data;
                // Auto update semua preset dropdown di halaman
                window.updateAllPresetDropdowns();
                // Broadcast custom event untuk listener lain
                window.dispatchEvent(new CustomEvent('presetsUpdated', { detail: window.sharedPresets }));
                return window.sharedPresets;
            }
        } catch (e) {
            console.error('[SharedPreset] Gagal mengambil data preset:', e);
        }
        return window.sharedPresets;
    };

    /**
     * Populasi elemen <select> target secara terpadu
     */
    window.populatePresetDropdown = function (selectEl, opts = {}) {
        const el = typeof selectEl === 'string' ? document.getElementById(selectEl) : selectEl;
        if (!el) return;

        const presets = window.sharedPresets || [];
        const currentValue = el.value || opts.defaultId;

        let html = '';
        if (opts.includeLocal) {
            html += '<option value="local">💻 Server Windows Lokal (Localhost)</option>';
        }

        presets.forEach(p => {
            const label = `🌐 ${p.name} (${p.vpsIp}) [Project ${p.project || 'absenta'}]`;
            html += `<option value="${p.id}">${label}</option>`;
        });

        if (presets.length === 0 && !opts.includeLocal) {
            html = '<option value="">-- Belum ada Preset VPS tersimpan --</option>';
        }

        el.innerHTML = html;

        if (currentValue && el.querySelector(`option[value="${currentValue}"]`)) {
            el.value = currentValue;
        }
    };

    /**
     * Update otomatis seluruh dropdown target server di aplikasi
     */
    window.updateAllPresetDropdowns = function () {
        // 1. Dropdown Monitor Health (health.js)
        window.populatePresetDropdown('health-target-preset', { includeLocal: true });
        window.populatePresetDropdown('health-preset-select', { includeLocal: true });
        // 2. Dropdown Monitor Log PM2 (logs.js)
        window.populatePresetDropdown('log-target-preset', { includeLocal: true });
        window.populatePresetDropdown('logs-preset-select', { includeLocal: true });
        // 3. Dropdown Quick Update Multi-Preset (presets.js)
        window.populatePresetDropdown('quick-update-preset-select');
        // 4. Dropdown Seed Wilayah (presets.js)
        window.populatePresetDropdown('seed-preset-select');
        // 5. Dropdown Watchdog (presets.js)
        window.populatePresetDropdown('watchdog-preset-select');
        // 6. Dropdown Tunnel Fix (presets.js)
        window.populatePresetDropdown('tunnel-preset-select');
    };

    // Initial fetch saat halaman dimuat
    document.addEventListener('DOMContentLoaded', () => {
        window.fetchSharedPresets();
    });
})();
