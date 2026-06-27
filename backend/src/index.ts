import { Hono } from 'hono';
import type { Env } from './types';
import mediaRoutes from './routes/media';

const app = new Hono<{ Bindings: Env }>();

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' });
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
  return c.json({ error: 'Internal server error', detail: err.message }, 500);
});

export default app;
