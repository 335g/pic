import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../src/index';

// Mock D1 database
function createMockDB() {
  const store = new Map<string, Record<string, unknown>>();

  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => {
          return { success: true };
        }),
        first: vi.fn(async <T>(): Promise<T | null> => {
          return null as T;
        }),
        all: vi.fn(async <T>(): Promise<{ results: T[] }> => {
          return { results: [] as T[] };
        }),
      })),
    })),
  } as unknown as D1Database;
}

// Mock R2 bucket
function createMockBucket() {
  return {
    createSignedUrl: vi.fn(async (_key: string, _options?: { expiresIn?: number }) => {
      return new URL('https://mock-r2.example.com/signed-url');
    }),
  } as unknown as R2Bucket;
}

describe('API', () => {
  let mockDB: D1Database;
  let mockBucket: R2Bucket;

  beforeEach(() => {
    mockDB = createMockDB();
    mockBucket = createMockBucket();
  });

  describe('GET /api/health', () => {
    it('returns ok status', async () => {
      const res = await app.request('/api/health', {}, {
        DB: mockDB,
        MEDIA_BUCKET: mockBucket,
        R2_PUBLIC_URL: '',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /api/media/:id', () => {
    it('returns 404 for non-existent media', async () => {
      const res = await app.request('/api/media/nonexistent-id', {}, {
        DB: mockDB,
        MEDIA_BUCKET: mockBucket,
        R2_PUBLIC_URL: '',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/media', () => {
    it('returns 200 with empty list', async () => {
      const res = await app.request('/api/media', {}, {
        DB: mockDB,
        MEDIA_BUCKET: mockBucket,
        R2_PUBLIC_URL: '',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('nextCursor');
    });

    it('returns 400 for invalid media_type', async () => {
      const res = await app.request('/api/media?media_type=invalid', {}, {
        DB: mockDB,
        MEDIA_BUCKET: mockBucket,
        R2_PUBLIC_URL: '',
      });
      expect(res.status).toBe(400);
    });
  });
});
