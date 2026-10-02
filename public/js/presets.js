// =============================================================================
// ABSENTA DEPLOYER - PRESETS ENTRY POINT & MODULAR FACADE
// Menghubungkan modul-modul presets (UI, Runner, Benchmark, Calculator, PDF Export)
// =============================================================================

// Global State
window.globalPresets = [];
window.activePresetId = null;

// Initializer saat DOM siap
document.addEventListener('DOMContentLoaded', function() {
    if (typeof loadPresets === 'function') {
        loadPresets();
    }
});
