-- Migration 0001: Create media table
-- Description: Stores metadata for photos and videos uploaded via CLI

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  object_key TEXT NOT NULL,
  thumbnail_key TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  taken_at TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_taken_at ON media(taken_at);
CREATE INDEX IF NOT EXISTS idx_media_uploaded_at ON media(uploaded_at);
