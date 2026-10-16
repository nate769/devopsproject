import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy /api to the local backend so the browser only ever talks to one origin —
// the same pattern nginx (Docker) and the Ingress (Kubernetes) use in deployed environments.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
