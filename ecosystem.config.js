/**
 * PM2 process configuration for the bare-metal / VPS deployment path.
 *
 * One process serves both the web app and the embedded BullMQ workers
 * (started by instrumentation.ts). Run with:
 *
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'sahamology',
      // Assembles the standalone bundle (static + public assets) and launches
      // the bundled server.js. Single instance => single worker set => no
      // duplicate cron jobs.
      script: 'scripts/start-standalone.js',
      cwd: __dirname,
      instances: 1, // single instance => single worker set => no duplicate cron jobs
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
        // Fill from .env or the host environment (DATABASE_URL is required).
      },
    },
  ],
};
