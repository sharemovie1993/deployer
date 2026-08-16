const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');

/**
 * Single Source of Truth for SSH Key File Sanitization & Windows ACL Permissions
 */
function createSafeKeyFile(rawKeyPath) {
    if (!rawKeyPath) rawKeyPath = 'nginxonly.pem';

    let keyPath = rawKeyPath;
    if (!path.isAbsolute(keyPath)) {
        keyPath = path.join(ROOT_DIR, rawKeyPath);
    }

    if (!fs.existsSync(keyPath)) {
        const altPath = path.join(ROOT_DIR, path.basename(rawKeyPath));
        if (fs.existsSync(altPath)) {
            keyPath = altPath;
        } else {
            throw new Error(`File kunci SSH tidak ditemukan di path: "${rawKeyPath}"`);
        }
    }

    const randSuffix = Math.random().toString(36).substring(2, 8);
    const safeKeyPath = path.join(os.tmpdir(), `agy_key_${Date.now()}_${randSuffix}.pem`);

    // Copy key content safely
    const content = fs.readFileSync(keyPath);
    fs.writeFileSync(safeKeyPath, content, { mode: 0o600 });

    // Restrict Windows ACL permissions so OpenSSH does not reject the key
    if (process.platform === 'win32') {
        try {
            const safeKeyWin = safeKeyPath.replace(/\\/g, '\\\\');
            const aclCmd = 'powershell -Command "$acl=New-Object System.Security.AccessControl.FileSecurity;$acl.SetAccessRuleProtection($true,$false);$rule=New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name,\'FullControl\',\'Allow\');$acl.AddAccessRule($rule);Set-Acl -Path \'' + safeKeyWin + '\' -AclObject $acl"';
            execSync(aclCmd, { timeout: 5000, stdio: 'ignore' });
        } catch (e) {
            /* ignore ACL errors if powershell fails */
        }
    }

    return safeKeyPath;
}

/**
 * Safely remove temporary SSH key file
 */
function cleanupSafeKey(safeKeyPath) {
    if (safeKeyPath && typeof safeKeyPath === 'string' && safeKeyPath.includes('agy_key_')) {
        try {
            if (fs.existsSync(safeKeyPath)) {
                fs.unlinkSync(safeKeyPath);
            }
        } catch (e) {
            /* ignore deletion errors */
        }
    }
}

/**
 * Build standardized SSH command arguments array
 */
function getSshArgs(safeKeyPath, user, ip, remoteCmd = null, extraOpts = []) {
    const args = [
        '-i', safeKeyPath,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=10',
        '-o', 'BatchMode=yes',
        ...extraOpts,
        `${user || 'asepsuryadi'}@${ip}`
    ];
    if (remoteCmd) {
        args.push(remoteCmd);
    }
    return args;
}

/**
 * Unified Helper for Executing Remote SSH Commands
 */
function executeSshCommand({ rawKeyPath, user, ip, command, timeoutMs = 10000 }) {
    return new Promise((resolve) => {
        let safeKey;
        try {
            safeKey = createSafeKeyFile(rawKeyPath);
        } catch (e) {
            return resolve({ success: false, code: -1, stdout: '', stderr: e.message, safeKey: null });
        }

        const args = getSshArgs(safeKey, user, ip, command);
        const proc = spawn('ssh', args, { windowsHide: true });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            proc.kill();
            cleanupSafeKey(safeKey);
            resolve({
                success: false,
                code: -1,
                stdout,
                stderr: `Koneksi SSH timeout (${Math.round(timeoutMs / 1000)}s) ke ${ip}`,
                safeKey
            });
        }, timeoutMs);

        proc.on('close', (code) => {
            clearTimeout(timer);
            cleanupSafeKey(safeKey);
            resolve({
                success: code === 0,
                code,
                stdout,
                stderr,
                safeKey
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            cleanupSafeKey(safeKey);
            resolve({
                success: false,
                code: -1,
                stdout,
                stderr: err.message,
                safeKey
            });
        });
    });
}

module.exports = {
    createSafeKeyFile,
    cleanupSafeKey,
    getSshArgs,
    executeSshCommand
};
