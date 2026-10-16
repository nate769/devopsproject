const request = require('supertest');
const { setupTestApp } = require('./helpers');
const { SAMPLE_ITEMS } = require('../seeds/01_sample_items');

const newItem = {
  name: 'Desk Lamp',
  sku: 'furn-100',
  category: 'Furniture',
  quantity: 12,
  unit_price: 29.99,
  reorder_level: 4,
  location: 'Aisle 9',
};

describe('items API', () => {
  let app;
  let db;

  beforeEach(async () => {
    ({ app, db } = await setupTestApp());
  });
  afterEach(async () => db.destroy());

  describe('GET /api/items', () => {
    test('lists seeded items', async () => {
      const res = await request(app).get('/api/items');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(SAMPLE_ITEMS.length);
      expect(res.body[0]).toMatchObject({ sku: 'ELEC-001', quantity: 42, unit_price: 19.99 });
    });

    test('filters by search term (name or sku, case-insensitive)', async () => {
      const res = await request(app).get('/api/items').query({ search: 'keyboard' });
      expect(res.status).toBe(200);
      expect(res.body.map((i) => i.sku)).toEqual(['ELEC-003']);
    });

    test('filters by category', async () => {
      const res = await request(app).get('/api/items').query({ category: 'Office' });
      expect(res.body.every((i) => i.category === 'Office')).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    test('filters low-stock items', async () => {
      const res = await request(app).get('/api/items').query({ lowStock: 'true' });
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((i) => i.low_stock)).toBe(true);
    });
  });

  describe('GET /api/items/:id', () => {
    test('returns a single item', async () => {
      const res = await request(app).get('/api/items/1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
    });

    test('returns 404 for a missing item', async () => {
      const res = await request(app).get('/api/items/9999');
      expect(res.status).toBe(404);
    });

    test('returns 400 for a non-numeric id', async () => {
      const res = await request(app).get('/api/items/abc');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/items', () => {
    test('creates an item and normalises the sku', async () => {
      const res = await request(app).post('/api/items').send(newItem);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Desk Lamp', sku: 'FURN-100', quantity: 12, low_stock: false });
      expect(res.body.id).toBeDefined();

      const list = await request(app).get('/api/items');
      expect(list.body).toHaveLength(SAMPLE_ITEMS.length + 1);
    });

    test('rejects invalid payloads with 422', async () => {
      const res = await request(app).post('/api/items').send({ name: '', quantity: -1, unit_price: 'abc' });
      expect(res.status).toBe(422);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          'name is required',
          'sku is required',
          'quantity must be a non-negative integer',
          'unit_price must be a non-negative number',
        ]),
      );
    });

    test('rejects duplicate sku with 409', async () => {
      const res = await request(app).post('/api/items').send({ ...newItem, sku: 'ELEC-001' });
      expect(res.status).toBe(409);
    });

    test('rejects malformed JSON with 400', async () => {
      const res = await request(app)
        .post('/api/items')
        .set('Content-Type', 'application/json')
        .send('{"name": ');
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/items/:id', () => {
    test('updates selected fields', async () => {
      const res = await request(app).put('/api/items/1').send({ quantity: 2, unit_price: 21.5 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: 1, quantity: 2, unit_price: 21.5, low_stock: true });
    });

    test('returns 404 for a missing item', async () => {
      const res = await request(app).put('/api/items/9999').send({ quantity: 1 });
      expect(res.status).toBe(404);
    });

    test('rejects an empty update', async () => {
      const res = await request(app).put('/api/items/1').send({});
      expect(res.status).toBe(422);
    });
  });

  describe('PATCH /api/items/:id/stock', () => {
    test('adds and removes stock', async () => {
      const added = await request(app).patch('/api/items/1/stock').send({ delta: 8 });
      expect(added.status).toBe(200);
      expect(added.body.quantity).toBe(50);

      const removed = await request(app).patch('/api/items/1/stock').send({ delta: -10 });
      expect(removed.body.quantity).toBe(40);
    });

    test('refuses to go below zero', async () => {
      const res = await request(app).patch('/api/items/1/stock').send({ delta: -1000 });
      expect(res.status).toBe(422);
    });
  });

  describe('DELETE /api/items/:id', () => {
    test('deletes an item', async () => {
      const res = await request(app).delete('/api/items/1');
      expect(res.status).toBe(204);
      const after = await request(app).get('/api/items/1');
      expect(after.status).toBe(404);
    });

    test('returns 404 when deleting a missing item', async () => {
      const res = await request(app).delete('/api/items/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/items/stats', () => {
    test('returns aggregated inventory statistics', async () => {
      const res = await request(app).get('/api/items/stats');
      expect(res.status).toBe(200);

      const expectedUnits = SAMPLE_ITEMS.reduce((sum, i) => sum + i.quantity, 0);
      const expectedValue = SAMPLE_ITEMS.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
      const expectedLow = SAMPLE_ITEMS.filter((i) => i.quantity <= i.reorder_level).length;

      expect(res.body.total_items).toBe(SAMPLE_ITEMS.length);
      expect(res.body.total_units).toBe(expectedUnits);
      expect(res.body.inventory_value).toBeCloseTo(expectedValue, 2);
      expect(res.body.low_stock_count).toBe(expectedLow);
      expect(res.body.categories).toMatchObject({ Electronics: 3, Office: 2, Furniture: 2, Pantry: 1 });
    });
  });
});
