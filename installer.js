const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleRequest } = require('./src/routes');

const DEFAULT_PORT = 8080;
const URL_FILE = path.join(__dirname, 'active_url.txt');

function startServer(port) {
    const server = http.createServer(handleRequest);

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[INFO] Port ${port} sedang digunakan, mencoba port ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('[ERROR] Gagal memulai server:', err);
        }
    });

    server.listen(port, '0.0.0.0', () => {
        const url = `http://localhost:${port}`;
        console.log(`\n======================================================`);
        console.log(` 👉 Installer GUI Absenta AKTIF di: ${url}`);
        console.log(`======================================================\n`);
        
        fs.writeFileSync(URL_FILE, url, 'utf8');
    });
}

// Start Server
startServer(DEFAULT_PORT);
