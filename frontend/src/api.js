// Thin fetch wrapper. All calls are relative (/api/...) so the same build works
// behind Vite's dev proxy, nginx in Docker, and the Kubernetes Ingress.
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body.errors ? body.errors.join(', ') : body.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export const api = {
  listItems: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== false));
    return request(`/items${qs.toString() ? `?${qs}` : ''}`);
  },
  stats: () => request('/items/stats'),
  createItem: (item) => request('/items', { method: 'POST', body: JSON.stringify(item) }),
  updateItem: (id, item) => request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(item) }),
  adjustStock: (id, delta) => request(`/items/${id}/stock`, { method: 'PATCH', body: JSON.stringify({ delta }) }),
  deleteItem: (id) => request(`/items/${id}`, { method: 'DELETE' }),
};
