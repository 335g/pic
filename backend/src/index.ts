import { Hono } from 'hono';
import type { Env } from './types';
import mediaRoutes from './routes/media';

const app = new Hono<{ Bindings: Env }>();

function setCorsHeaders(c: any, origin: string) {
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  c.header('Vary', 'Origin');
}

// CORS middleware (runs before request handler)
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('origin');

  // Handle preflight
  if (c.req.method === 'OPTIONS') {
    if (origin) setCorsHeaders(c, origin);
    c.header('Access-Control-Max-Age', '86400');
    return c.body(null, 204);
  }

  // Set CORS headers on the response
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
  }

  await next();
});

// Health check — public
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

// POST /api/media — requires shared secret (for CLI)
app.use('/api/media', async (c, next) => {
  if (c.req.method !== 'POST') return next();

  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ') && authHeader.slice(7) === c.env.API_SHARED_SECRET) {
    return next();
  }

  return c.json({ error: 'Unauthorized' }, 401);
});

// Mount media routes
app.route('/', mediaRoutes);

// 404 fallback
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
