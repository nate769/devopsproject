const config = require('./config');
const { createDb } = require('./db');
const { createApp } = require('./app');

async function main() {
  const db = createDb();

  if (config.runMigrations) {
    // Knex holds a lock table, so several replicas starting at once is safe.
    const [batch, applied] = await db.migrate.latest();
    console.log(`migrations: batch ${batch}, applied ${applied.length}`);
  }
  if (config.seedSampleData) {
    await db.seed.run();
  }

  const app = createApp(db, { appVersion: config.appVersion });
  const server = app.listen(config.port, () => {
    console.log(`stockpile-backend listening on :${config.port}`);
  });

  // Kubernetes sends SIGTERM before killing a pod: finish in-flight requests, then exit.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await db.destroy();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('failed to start', err);
  process.exit(1);
});
