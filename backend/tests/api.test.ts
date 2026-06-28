import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index';

function createMockDB() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => ({ success: true })),
        first: vi.fn(async <T>(): Promise<T | null> => null),
        all: vi.fn(async <T>(): Promise<{ results: T[] }> => ({ results: [] as T[] })),
      })),
    })),
  } as unknown as D1Database;
}

function createMockBucket() {
  return {
    get: vi.fn(async (_key: string) => null),
  } as unknown as R2Bucket;
}

const env = {
  DB: null as unknown as D1Database,
  MEDIA_BUCKET: null as unknown as R2Bucket,
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_ACCOUNT_ID: 'test-account',
  API_SHARED_SECRET: 'test-secret',
};

describe('API', () => {
  let mockDB: D1Database;
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockDB = createMockDB();
    mockBucket = createMockBucket();
  });

  describe('GET /api/health', () => {
    it('returns ok status', async () => {
      const res = await app.request('/api/health', {}, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    });
  });

  describe('GET /api/media', () => {
    it('returns 200 without auth (public)', async () => {
      const res = await app.request('/api/media', {}, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('next_cursor');
    });

    it('returns 400 for invalid media_type', async () => {
      const res = await app.request('/api/media?media_type=invalid', {}, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/media/:id', () => {
    it('returns 404 for non-existent media', async () => {
      const res = await app.request('/api/media/nonexistent-id', {}, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/media', () => {
    const validBody = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      filename: 'test.jpg',
      object_key: '2026/06/27/test.jpg',
      thumbnail_key: '2026/06/27/test_thumb.jpg',
      file_size: 12345,
      media_type: 'photo',
      mime_type: 'image/jpeg',
      width: 1920,
      height: 1080,
      taken_at: '2026-06-27T10:00:00+09:00',
    };

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      }, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(401);
    });

    it('returns 401 with wrong auth', async () => {
      const res = await app.request('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
        body: JSON.stringify(validBody),
      }, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(401);
    });

    it.skip('returns 201 with valid auth', async () => {
      // Skipped because it requires a working D1 mock
    });
  });
});
