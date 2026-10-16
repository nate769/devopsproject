// Central place for environment-driven configuration.
const env = process.env;

function buildDatabaseUrl() {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = env.PGUSER || 'stockpile';
  const password = encodeURIComponent(env.PGPASSWORD || 'stockpile');
  const host = env.PGHOST || 'localhost';
  const port = env.PGPORT || '5432';
  const database = env.PGDATABASE || 'stockpile';
  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

module.exports = {
  port: Number(env.PORT || 4000),
  databaseUrl: buildDatabaseUrl(),
  runMigrations: env.RUN_MIGRATIONS !== 'false',
  seedSampleData: env.SEED_SAMPLE_DATA !== 'false',
  appVersion: env.APP_VERSION || 'dev',
};
