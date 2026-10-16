const express = require('express');

const EDITABLE_FIELDS = ['name', 'sku', 'category', 'quantity', 'unit_price', 'reorder_level', 'location'];

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price_cents) / 100,
    reorder_level: Number(row.reorder_level),
    location: row.location,
    low_stock: Number(row.quantity) <= Number(row.reorder_level),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Returns { data, errors }. `partial` allows PUT bodies that only send some fields.
function validateItem(body, { partial = false } = {}) {
  const errors = [];
  const data = {};
  const input = body || {};

  for (const field of EDITABLE_FIELDS) {
    if (input[field] !== undefined) data[field] = input[field];
  }

  if (!partial || data.name !== undefined) {
    if (typeof data.name !== 'string' || !data.name.trim()) errors.push('name is required');
    else data.name = data.name.trim();
  }
  if (!partial || data.sku !== undefined) {
    if (typeof data.sku !== 'string' || !data.sku.trim()) errors.push('sku is required');
    else data.sku = data.sku.trim().toUpperCase();
  }
  if (data.category !== undefined) {
    if (typeof data.category !== 'string' || !data.category.trim()) errors.push('category must be a non-empty string');
    else data.category = data.category.trim();
  }
  for (const field of ['quantity', 'reorder_level']) {
    if (data[field] !== undefined) {
      const n = Number(data[field]);
      if (!Number.isInteger(n) || n < 0) errors.push(`${field} must be a non-negative integer`);
      else data[field] = n;
    }
  }
  if (data.unit_price !== undefined) {
    const n = Number(data.unit_price);
    if (!Number.isFinite(n) || n < 0) errors.push('unit_price must be a non-negative number');
    else {
      data.unit_price_cents = Math.round(n * 100);
      delete data.unit_price;
    }
  }

  if (partial && Object.keys(data).length === 0) errors.push('no updatable fields provided');
  return { data, errors };
}

function isUniqueViolation(err) {
  return err && (err.code === '23505' || /unique|duplicate/i.test(err.message || ''));
}

function itemsRouter(db) {
  const router = express.Router();

  const parseId = (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'id must be a positive integer' });
      return null;
    }
    return id;
  };

  // GET /api/items?search=&category=&lowStock=true
  router.get('/', async (req, res) => {
    const { search, category, lowStock } = req.query;
    const query = db('items').select('*').orderBy('id', 'asc');
    if (search) {
      const term = `%${String(search).toLowerCase()}%`;
      query.where((qb) => qb.whereRaw('lower(name) like ?', [term]).orWhereRaw('lower(sku) like ?', [term]));
    }
    if (category) query.where('category', String(category));
    if (lowStock === 'true') query.whereRaw('quantity <= reorder_level');
    const rows = await query;
    res.json(rows.map(serialize));
  });

  // GET /api/items/stats — registered before /:id so "stats" is not treated as an id.
  router.get('/stats', async (_req, res) => {
    const rows = await db('items').select('category', 'quantity', 'unit_price_cents', 'reorder_level');
    const stats = {
      total_items: rows.length,
      total_units: 0,
      inventory_value: 0,
      low_stock_count: 0,
      categories: {},
    };
    for (const row of rows) {
      const qty = Number(row.quantity);
      stats.total_units += qty;
      stats.inventory_value += qty * Number(row.unit_price_cents);
      if (qty <= Number(row.reorder_level)) stats.low_stock_count += 1;
      stats.categories[row.category] = (stats.categories[row.category] || 0) + 1;
    }
    stats.inventory_value /= 100; // cents -> currency units
    res.json(stats);
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const row = await db('items').where({ id }).first();
    if (!row) return res.status(404).json({ error: 'item not found' });
    res.json(serialize(row));
  });

  router.post('/', async (req, res) => {
    const { data, errors } = validateItem(req.body);
    if (errors.length) return res.status(422).json({ errors });
    try {
      const [row] = await db('items').insert(data).returning('*');
      res.status(201).json(serialize(row));
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: `sku ${data.sku} already exists` });
      throw err;
    }
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const { data, errors } = validateItem(req.body, { partial: true });
    if (errors.length) return res.status(422).json({ errors });
    try {
      const [row] = await db('items')
        .where({ id })
        .update({ ...data, updated_at: db.fn.now() })
        .returning('*');
      if (!row) return res.status(404).json({ error: 'item not found' });
      res.json(serialize(row));
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: `sku ${data.sku} already exists` });
      throw err;
    }
  });

  // PATCH /api/items/:id/stock { "delta": -3 } — record stock coming in or going out.
  router.patch('/:id/stock', async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const delta = Number(req.body && req.body.delta);
    if (!Number.isInteger(delta) || delta === 0) {
      return res.status(422).json({ errors: ['delta must be a non-zero integer'] });
    }
    const item = await db('items').where({ id }).first();
    if (!item) return res.status(404).json({ error: 'item not found' });
    const quantity = Number(item.quantity) + delta;
    if (quantity < 0) return res.status(422).json({ errors: ['stock cannot go below zero'] });
    const [row] = await db('items')
      .where({ id })
      .update({ quantity, updated_at: db.fn.now() })
      .returning('*');
    res.json(serialize(row));
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const deleted = await db('items').where({ id }).del();
    if (!deleted) return res.status(404).json({ error: 'item not found' });
    res.status(204).end();
  });

  return router;
}

module.exports = { itemsRouter, validateItem };
