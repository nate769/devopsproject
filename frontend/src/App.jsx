import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import ItemForm from './ItemForm.jsx';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function StatCard({ label, value, tone }) {
  return (
    <div className={`stat-card ${tone || ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export default function App() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ search: '', category: '', lowStock: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, item = edit

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([api.listItems(filters), api.stats()]);
      setItems(list);
      setStats(s);
      setError('');
    } catch (err) {
      setError(`Could not reach the StockPile API: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 200); // debounce typing in the search box
    return () => clearTimeout(t);
  }, [load]);

  const categories = stats ? Object.keys(stats.categories).sort() : [];

  async function run(action) {
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function save(payload) {
    if (editing && editing.id) await api.updateItem(editing.id, payload);
    else await api.createItem(payload);
    setEditing(null);
    await load();
  }

  function remove(item) {
    if (window.confirm(`Delete "${item.name}"?`)) run(() => api.deleteItem(item.id));
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">📦</span>
          <div>
            <h1>StockPile</h1>
            <p>Inventory at a glance</p>
          </div>
        </div>
        <button className="btn primary" onClick={() => setEditing({})}>+ Add item</button>
      </header>

      <main className="content">
        <section className="stats">
          <StatCard label="Products" value={stats ? stats.total_items : '—'} />
          <StatCard label="Units in stock" value={stats ? stats.total_units.toLocaleString() : '—'} />
          <StatCard label="Inventory value" value={stats ? money.format(stats.inventory_value) : '—'} tone="accent" />
          <StatCard label="Low stock" value={stats ? stats.low_stock_count : '—'} tone={stats && stats.low_stock_count ? 'warn' : ''} />
        </section>

        <section className="panel">
          <div className="toolbar">
            <input
              className="search"
              type="search"
              placeholder="Search by name or SKU…"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
            <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="toggle">
              <input
                type="checkbox"
                checked={filters.lowStock}
                onChange={(e) => setFilters({ ...filters, lowStock: e.target.checked })}
              />
              Low stock only
            </label>
          </div>

          {error && <div className="alert">{error}</div>}

          {loading ? (
            <p className="empty">Loading inventory…</p>
          ) : items.length === 0 ? (
            <p className="empty">No items match your filters.</p>
          ) : (
            <table className="items">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th className="num">Stock</th>
                  <th className="num">Unit price</th>
                  <th className="num">Value</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Item">
                      <div className="item-name">{item.name}</div>
                      <div className="item-sku">{item.sku}</div>
                    </td>
                    <td data-label="Category"><span className="chip">{item.category}</span></td>
                    <td data-label="Location">{item.location || '—'}</td>
                    <td data-label="Stock" className="num">
                      <div className="stepper">
                        <button
                          onClick={() => run(() => api.adjustStock(item.id, -1))}
                          disabled={item.quantity === 0}
                          aria-label={`Remove one ${item.name}`}
                        >−</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => run(() => api.adjustStock(item.id, 1))} aria-label={`Add one ${item.name}`}>+</button>
                      </div>
                    </td>
                    <td data-label="Unit price" className="num">{money.format(item.unit_price)}</td>
                    <td data-label="Value" className="num">{money.format(item.unit_price * item.quantity)}</td>
                    <td data-label="Status">
                      {item.quantity === 0 ? (
                        <span className="badge danger">Out of stock</span>
                      ) : item.low_stock ? (
                        <span className="badge warn">Reorder</span>
                      ) : (
                        <span className="badge ok">In stock</span>
                      )}
                    </td>
                    <td className="actions">
                      <button className="btn ghost small" onClick={() => setEditing(item)}>Edit</button>
                      <button className="btn danger small" onClick={() => remove(item)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <footer className="footer">StockPile · React + Express + PostgreSQL · deployed with Helm on Kubernetes</footer>

      {editing && (
        <ItemForm
          item={editing.id ? editing : null}
          categories={categories}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
