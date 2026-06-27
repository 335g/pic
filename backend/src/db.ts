import type { Media, NewMedia } from './types';

export async function insertMedia(db: D1Database, media: NewMedia): Promise<Media> {
  const { id, filename, object_key, thumbnail_key, file_size, media_type, mime_type, width, height, taken_at } = media;
  await db
    .prepare(
      `INSERT INTO media (id, filename, object_key, thumbnail_key, file_size, media_type, mime_type, width, height, taken_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, filename, object_key, thumbnail_key, file_size, media_type, mime_type, width, height, taken_at)
    .run();

  const inserted = await db
    .prepare('SELECT * FROM media WHERE id = ?')
    .bind(id)
    .first<Media>();
  if (!inserted) throw new Error('Failed to retrieve inserted media');
  return inserted;
}

export interface ListMediaParams {
  cursor?: string;
  limit?: number;
  mediaType?: 'photo' | 'video';
}

export interface ListMediaResult {
  items: Media[];
  nextCursor: string | null;
}

export async function listMedia(
  db: D1Database,
  params: ListMediaParams = {}
): Promise<ListMediaResult> {
  const limit = Math.min(params.limit ?? 50, 100);

  let query = 'SELECT * FROM media';
  const binds: unknown[] = [];

  if (params.mediaType) {
    query += ' WHERE media_type = ?';
    binds.push(params.mediaType);
  }

  query += ' ORDER BY taken_at DESC';

  if (params.cursor) {
    // Cursor is the taken_at of the last item from previous page
    query += ' AND taken_at < ?';
    binds.push(params.cursor);
  }

  query += ' LIMIT ?';
  binds.push(limit + 1); // Fetch one extra to detect if there's a next page

  const { results } = await db.prepare(query).bind(...binds).all<Media>();

  const hasMore = results.length > limit;
  const items = results.slice(0, limit);
  const nextCursor = hasMore ? items[items.length - 1].taken_at : null;

  return { items, nextCursor };
}

export async function getMediaById(db: D1Database, id: string): Promise<Media | null> {
  return db
    .prepare('SELECT * FROM media WHERE id = ?')
    .bind(id)
    .first<Media>();
}

export async function deleteMedia(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM media WHERE id = ?').bind(id).run();
  return result.success;
}
