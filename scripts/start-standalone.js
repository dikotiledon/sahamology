/**
 * Local / PM2 launcher for the Next.js standalone bundle.
 *
 * `output: "standalone"` produces a self-contained server at
 * `.next/standalone/server.js`, but static assets (`/.next/static` and
 * `/public`) are *not* copied into that directory by `next build`. The Docker
 * image copies them explicitly (see Dockerfile). This script does the same for
 * bare-metal / PM2 runs so `server.js` can serve CSS, JS chunks, and public
 * files correctly.
 */

const { cpSync, existsSync } = require('fs');
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

const serverPath = path.join(standalone, 'server.js');
if (!existsSync(serverPath)) {
  console.error('Standalone server not found. Run `npm run build` first.');
  process.exit(1);
}

// 1. Static chunks (/_next/static/*)
const staticSrc = path.join(root, '.next', 'static');
const staticDest = path.join(standalone, '.next', 'static');
if (!existsSync(staticSrc)) {
  console.error('.next/static not found. Run `npm run build` first.');
  process.exit(1);
}
if (!existsSync(path.join(staticDest, 'chunks'))) {
  cpSync(staticSrc, staticDest, { recursive: true });
}

// 2. Public assets (/favicon.ico etc.)
const publicSrc = path.join(root, 'public');
const publicDest = path.join(standalone, 'public');
if (existsSync(publicSrc) && !existsSync(publicDest)) {
  cpSync(publicSrc, publicDest, { recursive: true });
}

// 3. Launch the standalone server with stdio inherited.
const child = spawn(process.execPath, [serverPath], {
  cwd: standalone,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
