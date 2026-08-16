const { getPresets, saveSinglePreset, deletePreset } = require('../preset-store');

function handleGetPresets(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: getPresets() }));
}

function handleSavePreset(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            saveSinglePreset(data);
            const presets = getPresets();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: presets }));
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: e.message }));
        }
    });
}

function handleDeletePreset(req, res, parsedUrl) {
    const id = parsedUrl.searchParams.get('id');
    deletePreset(id);
    const presets = getPresets();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: presets }));
}

module.exports = {
    handleGetPresets,
    handleSavePreset,
    handleDeletePreset
};
