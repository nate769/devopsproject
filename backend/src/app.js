const express = require('express');
const helmet = require('helmet');
const { itemsRouter } = require('./routes/items');
const { createMetrics } = require('./metrics');

function createApp(db, { appVersion = 'dev' } = {}) {
  const app = express();
  const metrics = createMetrics(db);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(metrics.middleware);

  app.get('/', (_req, res) => {
    res.json({ service: 'stockpile-backend', version: appVersion, docs: '/api/items' });
  });

  // Liveness: is the process up? Deliberately does not touch the database.
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Readiness: can we serve traffic right now? Requires a working DB connection.
  app.get('/ready', async (_req, res) => {
    try {
      await db.raw('select 1');
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'not ready', error: err.message });
    }
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metrics.register.contentType);
    res.send(await metrics.register.metrics());
  });

  // Same endpoints under /api so they are reachable through the Ingress / nginx proxy.
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/items', itemsRouter(db));

  app.use((_req, res) => res.status(404).json({ error: 'not found' }));

  // Express 5 forwards rejected promises from async handlers here.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body' });
    console.error(err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}

module.exports = { createApp };
