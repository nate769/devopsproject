const request = require('supertest');
const { setupTestApp } = require('./helpers');
const { createApp } = require('../src/app');

describe('health, readiness and metrics', () => {
  let app;
  let db;

  beforeAll(async () => {
    ({ app, db } = await setupTestApp());
  });
  afterAll(async () => db.destroy());

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('GET /ready returns ready when the database is reachable', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  test('GET /metrics exposes Prometheus metrics', async () => {
    await request(app).get('/api/items');
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('http_request_duration_seconds');
    expect(res.text).toContain('stockpile_low_stock_items');
  });

  test('unknown routes return 404 JSON', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not found');
  });
});

describe('readiness without a database', () => {
  test('GET /ready returns 503 when the database is down', async () => {
    const brokenDb = Object.assign(() => {
      throw new Error('connection refused');
    }, { raw: () => Promise.reject(new Error('connection refused')) });
    const res = await request(createApp(brokenDb)).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not ready');
  });
});
