// Cluster Deployment JS Controller
let clusterEventSource = null;

function runClusterDeployment() {
    const apiNodes = document.getElementById('cluster-api-nodes').value.trim();
    const waNode = document.getElementById('cluster-wa-node').value.trim();
    const loadBalancerNode = document.getElementById('cluster-lb-node').value.trim();
    const dbNode = document.getElementById('cluster-db-node').value.trim();
    const targetUser = document.getElementById('cluster-vps-user').value.trim() || 'asepsuryadi';
    const keyPath = document.getElementById('cluster-key-path').value.trim() || 'nginxonly.pem';
    const sudoPass = document.getElementById('cluster-sudo-pass').value.trim() || '1';

    if (!apiNodes) {
        alert('Harap masukkan minimal 1 IP untuk API Worker Nodes.');
        return;
    }

    const termOutput = document.getElementById('cluster-terminal-output');
    const termBadge = document.getElementById('cluster-status-badge');
    const deployBtn = document.getElementById('btn-run-cluster-deploy');

    termOutput.innerHTML = '';
    termBadge.textContent = '🚀 MENJALANKAN DEPLOYMENT...';
    termBadge.className = 'badge badge-info';
    deployBtn.disabled = true;

    function appendLog(line) {
        const div = document.createElement('div');
        div.className = 'term-line';

        if (line.includes('FASE 1') || line.includes('FASE 2') || line.includes('FASE 3') || line.includes('FASE 4')) {
            div.style.color = '#38bdf8';
            div.style.fontWeight = 'bold';
        } else if (line.includes('✅')) {
            div.style.color = '#4ade80';
        } else if (line.includes('❌') || line.includes('[ERROR]') || line.includes('FAILED')) {
            div.style.color = '#f87171';
        } else if (line.includes('===') || line.includes('SUKSES')) {
            div.style.color = '#facc15';
            div.style.fontWeight = 'bold';
        }

        div.textContent = line;
        termOutput.appendChild(div);
        termOutput.scrollTop = termOutput.scrollHeight;
    }

    if (clusterEventSource) {
        clusterEventSource.close();
    }

    const queryUrl = `/api/stream-cluster-install?apiNodes=${encodeURIComponent(apiNodes)}&waNode=${encodeURIComponent(waNode)}&loadBalancerNode=${encodeURIComponent(loadBalancerNode)}&dbNode=${encodeURIComponent(dbNode)}&targetUser=${encodeURIComponent(targetUser)}&keyPath=${encodeURIComponent(keyPath)}&sudoPass=${encodeURIComponent(sudoPass)}`;

    clusterEventSource = new EventSource(queryUrl);

    clusterEventSource.onmessage = function(e) {
        const data = e.data;
        if (data.startsWith(': heartbeat')) return;

        if (data.includes('[INSTALL_COMPLETE]')) {
            appendLog('✨ Multi-Node Cluster Deployment Selesai Sukses!');
            termBadge.textContent = '🟢 DEPLOYMENT SELESAI';
            termBadge.className = 'badge badge-success';
            deployBtn.disabled = false;
            clusterEventSource.close();
            return;
        }

        if (data.includes('[INSTALL_FAILED]')) {
            appendLog('❌ Deployment Gagal. Silakan periksa log di atas.');
            termBadge.textContent = '🔴 DEPLOYMENT GAGAL';
            termBadge.className = 'badge badge-danger';
            deployBtn.disabled = false;
            clusterEventSource.close();
            return;
        }

        appendLog(data);
    };

    clusterEventSource.onerror = function() {
        appendLog('⚠️ Terputus dari server streamer log.');
        deployBtn.disabled = false;
        clusterEventSource.close();
    };
}
