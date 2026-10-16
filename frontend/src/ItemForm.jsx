import { useState } from 'react';

const EMPTY = { name: '', sku: '', category: '', quantity: 0, unit_price: 0, reorder_level: 5, location: '' };

export default function ItemForm({ item, categories, onSave, onClose }) {
  const [form, setForm] = useState(item ? { ...EMPTY, ...item, location: item.location || '' } : EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: form.name,
        sku: form.sku,
        category: form.category || 'General',
        quantity: Number(form.quantity),
        unit_price: Number(form.unit_price),
        reorder_level: Number(form.reorder_level),
        location: form.location || null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-header">
          <h2>{item ? 'Edit item' : 'Add item'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="form-grid">
          <label className="span-2">
            Name
            <input value={form.name} onChange={set('name')} required autoFocus />
          </label>
          <label>
            SKU
            <input value={form.sku} onChange={set('sku')} required placeholder="e.g. ELEC-010" />
          </label>
          <label>
            Category
            <input value={form.category} onChange={set('category')} list="category-options" placeholder="General" />
            <datalist id="category-options">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label>
            Quantity
            <input type="number" min="0" step="1" value={form.quantity} onChange={set('quantity')} required />
          </label>
          <label>
            Unit price ($)
            <input type="number" min="0" step="0.01" value={form.unit_price} onChange={set('unit_price')} required />
          </label>
          <label>
            Reorder level
            <input type="number" min="0" step="1" value={form.reorder_level} onChange={set('reorder_level')} required />
          </label>
          <label>
            Location
            <input value={form.location} onChange={set('location')} placeholder="Aisle 3" />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <footer className="modal-footer">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
          </button>
        </footer>
      </form>
    </div>
  );
}
