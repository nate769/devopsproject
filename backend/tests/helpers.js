// Spins up an isolated in-memory PostgreSQL (pg-mem) per test file,
// runs the real Knex migrations, and returns an Express app wired to it.
// Tests never touch a real or production database.
const path = require('path');
const { newDb } = require('pg-mem');
const { createApp } = require('../src/app');

async function setupTestApp({ seed = true } = {}) {
  const mem = newDb();
  const db = mem.adapters.createKnex();
  await db.migrate.latest({ directory: path.join(__dirname, '..', 'migrations') });
  if (seed) {
    await db.seed.run({ directory: path.join(__dirname, '..', 'seeds') });
  }
  const app = createApp(db, { appVersion: 'test' });
  return { app, db };
}

module.exports = { setupTestApp };
