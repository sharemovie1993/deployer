// App mode switcher controller
function switchAppMode(mode) {
    const wizardContainer = document.getElementById('wizard-view-container');
    const presetContainer = document.getElementById('preset-view-container');
    const clusterContainer = document.getElementById('cluster-view-container');
    const logsContainer = document.getElementById('logs-view-container');
    const healthContainer = document.getElementById('health-view-container');
    const auditContainer = document.getElementById('audit-view-container');

    const wizardBtn = document.getElementById('mode-btn-wizard');
    const presetBtn = document.getElementById('mode-btn-preset');
    const clusterBtn = document.getElementById('mode-btn-cluster');
    const logsBtn = document.getElementById('mode-btn-logs');
    const healthBtn = document.getElementById('mode-btn-health');
    const auditBtn = document.getElementById('mode-btn-audit');

    if (!wizardContainer || !presetContainer) return;

    if (mode === 'preset') {
        if (typeof stopHealthAutoRefresh === 'function') stopHealthAutoRefresh();
        wizardContainer.style.display = 'none';
        presetContainer.style.display = 'flex';
        if (clusterContainer) clusterContainer.style.display = 'none';
        if (logsContainer) logsContainer.style.display = 'none';
        if (healthContainer) healthContainer.style.display = 'none';
        if (auditContainer) auditContainer.style.display = 'none';
        wizardBtn?.classList.remove('active');
        presetBtn?.classList.add('active');
        clusterBtn?.classList.remove('active');
        logsBtn?.classList.remove('active');
        healthBtn?.classList.remove('active');
        auditBtn?.classList.remove('active');
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
        if (auditContainer) auditContainer.style.display = 'none';
        wizardBtn?.classList.remove('active');
        presetBtn?.classList.remove('active');
        clusterBtn?.classList.add('active');
        logsBtn?.classList.remove('active');
        healthBtn?.classList.remove('active');
        auditBtn?.classList.remove('active');
    } else if (mode === 'logs') {
        if (typeof stopHealthAutoRefresh === 'function') stopHealthAutoRefresh();
        wizardContainer.style.display = 'none';
        presetContainer.style.display = 'none';
        if (clusterContainer) clusterContainer.style.display = 'none';
        if (logsContainer) logsContainer.style.display = 'flex';
        if (healthContainer) healthContainer.style.display = 'none';
        if (auditContainer) auditContainer.style.display = 'none';
        wizardBtn?.classList.remove('active');
        presetBtn?.classList.remove('active');
        clusterBtn?.classList.remove('active');
        logsBtn?.classList.add('active');
        healthBtn?.classList.remove('active');
        auditBtn?.classList.remove('active');
        if (typeof populateLogTargetPresets === 'function') {
            populateLogTargetPresets(() => {
                const sel = document.getElementById('log-target-preset');
                if (sel) {
                    if (window.activePresetId && sel.querySelector(`option[value="${window.activePresetId}"]`)) {
                        sel.value = window.activePresetId;
                    }
                    if (typeof populateLogTargetApps === 'function') {
                        populateLogTargetApps(sel.value);
                    }
                }
            });
        }
    } else if (mode === 'health') {
        wizardContainer.style.display = 'none';
        presetContainer.style.display = 'none';
        if (clusterContainer) clusterContainer.style.display = 'none';
        if (logsContainer) logsContainer.style.display = 'none';
        if (healthContainer) healthContainer.style.display = 'flex';
        if (auditContainer) auditContainer.style.display = 'none';
        wizardBtn?.classList.remove('active');
        presetBtn?.classList.remove('active');
        clusterBtn?.classList.remove('active');
        logsBtn?.classList.remove('active');
        healthBtn?.classList.add('active');
        auditBtn?.classList.remove('active');
        if (typeof populateHealthPresetDropdown === 'function') {
            populateHealthPresetDropdown(() => {
                if (window.activePresetId) {
                    const sel = document.getElementById('health-target-preset');
                    if (sel) sel.value = window.activePresetId;
                }
                if (typeof refreshHealthMatrixUI === 'function') refreshHealthMatrixUI();
                if (typeof startHealthAutoRefresh === 'function') startHealthAutoRefresh();
            });
        }
    } else if (mode === 'audit') {
        if (typeof stopHealthAutoRefresh === 'function') stopHealthAutoRefresh();
        wizardContainer.style.display = 'none';
        presetContainer.style.display = 'none';
        if (clusterContainer) clusterContainer.style.display = 'none';
        if (logsContainer) logsContainer.style.display = 'none';
        if (healthContainer) healthContainer.style.display = 'none';
        if (auditContainer) auditContainer.style.display = 'flex';
        wizardBtn?.classList.remove('active');
        presetBtn?.classList.remove('active');
        clusterBtn?.classList.remove('active');
        logsBtn?.classList.remove('active');
        healthBtn?.classList.remove('active');
        auditBtn?.classList.add('active');
        if (typeof populateAuditPresetDropdown === 'function') {
            populateAuditPresetDropdown(() => {
                if (typeof runAuditUI === 'function') runAuditUI();
            });
        }
    } else {
        if (typeof stopHealthAutoRefresh === 'function') stopHealthAutoRefresh();
        wizardContainer.style.display = 'flex';
        presetContainer.style.display = 'none';
        if (clusterContainer) clusterContainer.style.display = 'none';
        if (logsContainer) logsContainer.style.display = 'none';
        if (healthContainer) healthContainer.style.display = 'none';
        if (auditContainer) auditContainer.style.display = 'none';
        wizardBtn?.classList.add('active');
        presetBtn?.classList.remove('active');
        clusterBtn?.classList.remove('active');
        logsBtn?.classList.remove('active');
        healthBtn?.classList.remove('active');
        auditBtn?.classList.remove('active');
    }
}
