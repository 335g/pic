// D1 database types inferred from wrangler.jsonc bindings.
// Run `npm run types` to regenerate.
// This file is manually maintained for now.

export interface Media {
  id: string;
  filename: string;
  object_key: string;
  thumbnail_key: string;
  file_size: number;
  media_type: 'photo' | 'video';
  mime_type: string;
  width: number | null;
  height: number | null;
  taken_at: string;
  uploaded_at: string;
}

export type NewMedia = Omit<Media, 'uploaded_at'>;

export interface Env {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  API_SHARED_SECRET: string;
}
