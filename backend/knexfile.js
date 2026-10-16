// Knex configuration used by both the CLI (`npm run migrate`) and the app.
const config = require('./src/config');

module.exports = {
  client: 'pg',
  connection: config.databaseUrl,
  pool: { min: 0, max: 10 },
  migrations: { directory: './migrations', tableName: 'knex_migrations' },
  seeds: { directory: './seeds' },
};
