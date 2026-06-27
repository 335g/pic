import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { AwsClient } from 'aws4fetch';
import type { Env } from '../types';
import { insertMedia, listMedia, getMediaById } from '../db';

const app = new Hono<{ Bindings: Env }>();

// Schema for registering uploaded media
const registerMediaSchema = z.object({
  id: z.string().uuid(),
  filename: z.string().min(1),
  object_key: z.string().min(1),
  thumbnail_key: z.string().min(1),
  file_size: z.number().int().positive(),
  media_type: z.enum(['photo', 'video']),
  mime_type: z.string().min(1),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  taken_at: z.string().datetime({ offset: true }),
});

// POST /api/media — Register uploaded media (called by CLI after successful R2 upload)
app.post('/api/media', zValidator('json', registerMediaSchema), async (c) => {
  const data = c.req.valid('json');
  const media = await insertMedia(c.env.DB, {
    id: data.id,
    filename: data.filename,
    object_key: data.object_key,
    thumbnail_key: data.thumbnail_key,
    file_size: data.file_size,
    media_type: data.media_type,
    mime_type: data.mime_type,
    width: data.width ?? null,
    height: data.height ?? null,
    taken_at: data.taken_at,
  });
  return c.json(media, 201);
});

// GET /api/media — List media (paginated, sorted by taken_at DESC)
app.get('/api/media', async (c) => {
  const cursor = c.req.query('cursor');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;
  const mediaType = c.req.query('media_type') as 'photo' | 'video' | undefined;

  if (mediaType && !['photo', 'video'].includes(mediaType)) {
    return c.json({ error: 'Invalid media_type. Must be "photo" or "video"' }, 400);
  }

  const result = await listMedia(c.env.DB, { cursor, limit, mediaType });
  return c.json({ items: result.items, next_cursor: result.nextCursor });
});

// GET /api/media/:id — Get single media details
app.get('/api/media/:id', async (c) => {
  const id = c.req.param('id');
  const media = await getMediaById(c.env.DB, id);
  if (!media) {
    return c.json({ error: 'Media not found' }, 404);
  }
  return c.json(media);
});

// GET /api/media/:id/thumbnail — Proxy thumbnail image
app.get('/api/media/:id/thumbnail', async (c) => {
  const id = c.req.param('id');
  const media = await getMediaById(c.env.DB, id);
  if (!media) {
    return c.json({ error: 'Media not found' }, 404);
  }

  const object = await c.env.MEDIA_BUCKET.get(media.thumbnail_key);
  if (!object) {
    return c.json({ error: 'Thumbnail not found' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day

  return new Response(object.body, {
    headers,
  });
});

// GET /api/media/:id/download — Get signed download URL for original file
app.get('/api/media/:id/download', async (c) => {
  const id = c.req.param('id');
  const media = await getMediaById(c.env.DB, id);
  if (!media) {
    return c.json({ error: 'Media not found' }, 404);
  }

  const r2Endpoint = `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const bucketName = 'pic-media'; // Hardcoded — could also be an env var

  const client = new AwsClient({
    accessKeyId: c.env.R2_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    service: 's3',
  });

  const signedRequest = await client.sign(
    new Request(`${r2Endpoint}/${bucketName}/${media.object_key}`),
    {
      aws: { signQuery: true },
      expiresIn: 3600, // 1 hour
    }
  );

  return c.json({ signed_url: signedRequest.url, filename: media.filename });
});

export default app;
