import { Hono } from 'hono';
import type { Env } from './types';
import mediaRoutes from './routes/media';

const app = new Hono<{ Bindings: Env }>();

// Health check — public (no auth)
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
});

// Auth middleware for all /api/* routes (except health)
app.use('/api/*', async (c, next) => {
  // Skip auth for health check (already handled above, but just in case)
  if (c.req.path === '/api/health') {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  if (token !== c.env.API_SHARED_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
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
