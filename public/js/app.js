// App mode switcher controller
function switchAppMode(mode) {
    const wizardContainer = document.getElementById('wizard-view-container');
    const presetContainer = document.getElementById('preset-view-container');
    const clusterContainer = document.getElementById('cluster-view-container');
    const logsContainer = document.getElementById('logs-view-container');
    const healthContainer = document.getElementById('health-view-container');

    const wizardBtn = document.getElementById('mode-btn-wizard');
    const presetBtn = document.getElementById('mode-btn-preset');
    const clusterBtn = document.getElementById('mode-btn-cluster');
    const logsBtn = document.getElementById('mode-btn-logs');
    const healthBtn = document.getElementById('mode-btn-health');

    if (!wizardContainer || !presetContainer) return;

    if (mode === 'preset') {
        if (typeof stopHealthAutoRefresh === 'function') stopHealthAutoRefresh();
        wizardContainer.style.display = 'none';
        presetContainer.style.display = 'flex';
        if (clusterContainer) clusterContainer.style.display = 'none';
        if (logsContainer) logsContainer.style.display = 'none';
        if (healthContainer) healthContainer.style.display = 'none';
        wizardBtn?.classList.remove('active');
        presetBtn?.classList.add('active');
        clusterBtn?.classList.remove('active');
        logsBtn?.classList.remove('active');
        healthBtn?.classList.remove('active');
        if (typeof loadPresets === 'function') {
            loadPresets();
        }
    } else if (mode === 'cluster') {
        if (typeof stopHealthAutoRefresh === 'function') stopHealthAutoRefresh();
        wizardContainer.style.display = 'none';
        presetContainer.style.display = 'none';
        if (clusterContainer) clusterContainer.style.display = 'flex';
        if (logsContainer) logsContainer.style.display = 'none';
        if (healthContainer) healthContainer.style.display = 'none';
        wizardBtn?.classList.remove('active');
        presetBtn?.classList.remove('active');
        clusterBtn?.classList.add('active');
        logsBtn?.classList.remove('active');
        healthBtn?.classList.remove('active');
    } else if (mode === 'logs') {
        if (typeof stopHealthAutoRefresh === 'function') stopHealthAutoRefresh();
        wizardContainer.style.display = 'none';
        presetContainer.style.display = 'none';
        if (clusterContainer) clusterContainer.style.display = 'none';
        if (logsContainer) logsContainer.style.display = 'flex';
        if (healthContainer) healthContainer.style.display = 'none';
        wizardBtn?.classList.remove('active');
        presetBtn?.classList.remove('active');
        clusterBtn?.classList.remove('active');
        logsBtn?.classList.add('active');
        healthBtn?.classList.remove('active');
        if (typeof populateLogTargetPresets === 'function') {
            populateLogTargetPresets();
        }
    } else if (mode === 'health') {
        wizardContainer.style.display = 'none';
        presetContainer.style.display = 'none';
        if (clusterContainer) clusterContainer.style.display = 'none';
        if (logsContainer) logsContainer.style.display = 'none';
        if (healthContainer) healthContainer.style.display = 'flex';
        wizardBtn?.classList.remove('active');
        presetBtn?.classList.remove('active');
        clusterBtn?.classList.remove('active');
        logsBtn?.classList.remove('active');
        healthBtn?.classList.add('active');
        if (typeof populateHealthPresetDropdown === 'function') {
            populateHealthPresetDropdown();
        }
        if (typeof refreshHealthMatrixUI === 'function') {
            refreshHealthMatrixUI();
        }
        if (typeof startHealthAutoRefresh === 'function') {
            startHealthAutoRefresh();
        }
    } else {
        if (typeof stopHealthAutoRefresh === 'function') stopHealthAutoRefresh();
        wizardContainer.style.display = 'flex';
        presetContainer.style.display = 'none';
        if (clusterContainer) clusterContainer.style.display = 'none';
        if (logsContainer) logsContainer.style.display = 'none';
        if (healthContainer) healthContainer.style.display = 'none';
        wizardBtn?.classList.add('active');
        presetBtn?.classList.remove('active');
        clusterBtn?.classList.remove('active');
        logsBtn?.classList.remove('active');
        healthBtn?.classList.remove('active');
    }
}
