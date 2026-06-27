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

const authHeaders = { Authorization: 'Bearer test-secret' };

describe('API', () => {
  let mockDB: D1Database;
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockDB = createMockDB();
    mockBucket = createMockBucket();
  });

  describe('GET /api/health', () => {
    it('returns ok status without auth', async () => {
      const res = await app.request('/api/health', {}, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'ok' });
    });
  });

  describe('auth', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request('/api/media', {}, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(401);
    });

    it('returns 401 with wrong auth header', async () => {
      const res = await app.request('/api/media', { headers: { Authorization: 'Bearer wrong-secret' } }, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/media/:id', () => {
    it('returns 404 for non-existent media', async () => {
      const res = await app.request('/api/media/nonexistent-id', { headers: authHeaders }, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/media', () => {
    it('returns 200 with empty list', async () => {
      const res = await app.request('/api/media', { headers: authHeaders }, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('next_cursor');
    });

    it('returns 400 for invalid media_type', async () => {
      const res = await app.request('/api/media?media_type=invalid', { headers: authHeaders }, { ...env, DB: mockDB, MEDIA_BUCKET: mockBucket });
      expect(res.status).toBe(400);
    });
  });
});
