// Prometheus metrics: Node.js runtime defaults + HTTP RED metrics + a business gauge.
const client = require('prom-client');

function createMetrics(db) {
  const register = new client.Registry();
  register.setDefaultLabels({ app: 'stockpile-backend' });
  client.collectDefaultMetrics({ register });

  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });

  const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [register],
  });

  // Evaluated on every scrape, so Grafana can chart low-stock items over time.
  new client.Gauge({
    name: 'stockpile_low_stock_items',
    help: 'Number of items at or below their reorder level',
    registers: [register],
    async collect() {
      try {
        const [{ count }] = await db('items')
          .whereRaw('quantity <= reorder_level')
          .count({ count: '*' });
        this.set(Number(count));
      } catch {
        // Database unavailable: keep the last value instead of failing the scrape.
      }
    },
  });

  function middleware(req, res, next) {
    if (req.path === '/metrics') return next();
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
      // Use the route pattern (/api/items/:id), not the raw URL, to keep label cardinality low.
      const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      const labels = { method: req.method, route, status_code: String(res.statusCode) };
      httpRequestsTotal.inc(labels);
      end(labels);
    });
    next();
  }

  return { register, middleware };
}

module.exports = { createMetrics };
