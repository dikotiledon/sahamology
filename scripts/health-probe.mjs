const port = process.env.PORT || '3000';
const url = 'http://127.0.0.1:' + port + '/api/health?level=live';
fetch(url).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1));
