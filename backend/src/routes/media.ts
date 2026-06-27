import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
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

  // Generate signed URLs for thumbnails
  const itemsWithUrls = await Promise.all(
    result.items.map(async (item) => ({
      ...item,
      signed_thumbnail_url: (
        await c.env.MEDIA_BUCKET.createSignedUrl(item.thumbnail_key, { expiresIn: 3600 })
      ).toString(),
    }))
  );

  return c.json({ items: itemsWithUrls, next_cursor: result.nextCursor });
});

// GET /api/media/:id — Get single media details with signed thumbnail URL
app.get('/api/media/:id', async (c) => {
  const id = c.req.param('id');
  const media = await getMediaById(c.env.DB, id);
  if (!media) {
    return c.json({ error: 'Media not found' }, 404);
  }

  // Generate signed URL for thumbnail
  const signedThumbnailUrl = await c.env.MEDIA_BUCKET.createSignedUrl(media.thumbnail_key, {
    expiresIn: 3600, // 1 hour
  });

  return c.json({ ...media, signed_thumbnail_url: signedThumbnailUrl.toString() });
});

// GET /api/media/:id/download — Get signed URL for original file download
app.get('/api/media/:id/download', async (c) => {
  const id = c.req.param('id');
  const media = await getMediaById(c.env.DB, id);
  if (!media) {
    return c.json({ error: 'Media not found' }, 404);
  }

  const signedUrl = await c.env.MEDIA_BUCKET.createSignedUrl(media.object_key, {
    expiresIn: 3600, // 1 hour
  });

  return c.json({ signed_url: signedUrl.toString(), filename: media.filename });
});

export default app;
