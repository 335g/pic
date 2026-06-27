# PRD: pic — Personal Image Cloud

## Problem Statement

iPhoneのストレージが圧迫される原因の多くは写真・動画である。iCloudは月額課金が必要で、かつAppleのエコシステムにロックインされる。ローカルにある写真を自分所有のクラウドストレージ（Cloudflare R2）に安全に退避し、Webブラウザからいつでも閲覧・ダウンロードできるようにしたい。

また、退避が完了したローカルファイルは自動的に削除することで、端末のストレージを継続的に開放したい。

## Solution

3つのコンポーネントからなる個人用写真管理システム「pic」を構築する。

1. **CLI（Rust）**: ローカルの写真・動画を読み取り、サムネイルを生成し、R2にアップロードする。アップロード成功後、ローカルファイルを自動削除する。
2. **Backend（TypeScript/Hono on Cloudflare Workers）**: メタデータをD1で管理し、Frontend向けに一覧API・署名付きURL発行を行う。認証はCloudflare Zero Trust Service Tokenを使用する。
3. **Frontend（React/Vite/Tailwind/shadcn on Cloudflare Pages）**: Backend APIを経由して写真一覧を表示し、選択した写真・動画のダウンロードができる。

## User Stories

1. As a user, I want to run a CLI command to upload a directory of photos/videos, so that my media is safely stored on R2.
2. As a user, I want CLI to automatically generate thumbnails during upload, so that the Frontend can display a gallery without loading full-size files.
3. As a user, I want CLI to handle iPhone HEIC photos, so that I can upload photos directly from my iPhone's library after transfering them to my Mac.
4. As a user, I want CLI to extract the first frame from video files as a thumbnail, so that videos are also visually identifiable in the gallery.
5. As a user, I want CLI to organize files by their shooting date in R2 (e.g. `2026/06/27/`), so that the storage structure is human-readable.
6. As a user, I want CLI to upload both the original file and the thumbnail to R2 directly (not via Backend), so that large video files are not blocked by size limits.
7. As a user, I want CLI to notify the Backend after a successful upload, so that the media metadata is registered in D1.
8. As a user, I want CLI to automatically delete local files after confirming successful upload + metadata registration, so that device storage is freed without manual intervention.
9. As a user, I want CLI to optionally keep local files with a `--keep` flag, so that I can verify before deleting.
10. As a user, I want to access my media gallery at `pic.335g.dev`, so that I can view my photos and videos from any browser.
11. As a user, I want to see a grid of photo/video thumbnails on the Frontend, so that I can quickly browse through my media.
12. As a user, I want to click on a thumbnail to see the full-size photo or play the video, so that I can enjoy my media.
13. As a user, I want to download the original file from the Frontend, so that I can retrieve my media when needed.
14. As a user, I want the Frontend to be authenticated via Cloudflare Zero Trust, so that only I can access my gallery.
15. As a user, I want the Backend to issue signed URLs for R2 objects, so that the Frontend can stream/download files without exposing public R2 access.
16. As a user, I want the Backend to list media items sorted by shooting date (newest first), so that I can find recent photos easily.
17. As a user, I want CLI to show progress during upload (file count, size, speed), so that I know the operation is running correctly.

## Implementation Decisions

### Architecture

- **Upload path**: CLI → R2 (direct PUT). After successful upload, CLI calls Backend to register metadata. Read path: Frontend → Backend (signed URL) → R2 (direct download). See ADR-0001.
- **Auth**: Backend API uses Cloudflare Zero Trust Service Token. CLI sends `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers. Frontend uses Cloudflare Zero Trust with email-based access restriction.
- **Ownership**: Single-user application. No multi-user consideration needed.

### Domains & Hosting

- `pic.335g.dev` → Cloudflare Pages (Frontend)
- `api.pic.335g.dev` → Cloudflare Workers (Backend)

### R2 Object Key Convention

```
{upload year}/{upload month(2-digit)}/{upload day(2-digit)}/{uuid}.{ext}
{upload year}/{upload month(2-digit)}/{upload day(2-digit)}/{uuid}_thumb.jpg
```

Example:
```
2026/06/27/a1b2c3d4-e5f6-7890-abcd-ef1234567890.HEIC
2026/06/27/a1b2c3d4-e5f6-7890-abcd-ef1234567890_thumb.jpg
```

The date component is determined from the file's shooting date (Exif for photos, metadata for videos).

### Thumbnail Specification

- Format: JPEG
- Max dimension (long edge): 400px
- Quality: 75%
- Aspect ratio: Preserved (no cropping)
- Video: First frame extracted as thumbnail

### D1 Schema

```sql
CREATE TABLE media (
  id TEXT PRIMARY KEY,                       -- UUID
  filename TEXT NOT NULL,                     -- Display filename (e.g. IMG_1234.HEIC)
  object_key TEXT NOT NULL,                   -- R2 object key (e.g. 2026/06/27/uuid.HEIC)
  thumbnail_key TEXT NOT NULL,                -- R2 thumbnail key
  file_size INTEGER NOT NULL,                 -- File size in bytes
  media_type TEXT NOT NULL,                   -- 'photo' | 'video'
  mime_type TEXT NOT NULL,                    -- 'image/heic', 'video/quicktime', etc.
  width INTEGER,                              -- Pixel width (NULL for videos initially)
  height INTEGER,                             -- Pixel height (NULL for videos initially)
  taken_at TEXT NOT NULL,                     -- Shooting datetime from Exif/metadata
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_media_taken_at ON media(taken_at);
```

### API Endpoints (Backend)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/media` | Register uploaded media | Service Token |
| GET | `/api/media` | List media (paginated, sorted by taken_at DESC) | Service Token |
| GET | `/api/media/:id` | Get single media details + signed thumbnail URL | Service Token |
| GET | `/api/media/:id/download` | Get signed URL for original file download | Service Token |

### CLI Interface

```
pic upload [OPTIONS] <paths...>
  --keep            Keep local files after successful upload
  --dry-run         Show what would be uploaded without actually uploading
  --verbose, -v     Verbose output

pic status
  Show upload queue status and pending files
```

### Backend Configuration (Environment Variables)

- `R2_BUCKET_NAME` — R2 bucket name
- `R2_ACCESS_KEY_ID` — R2 API credentials
- `R2_SECRET_ACCESS_KEY` — R2 API credentials
- `R2_PUBLIC_URL` — R2 public endpoint for signed URLs
- `D1_DATABASE_ID` — D1 database binding

### CLI Configuration

Configuration file at `~/.pic/config.toml` or environment variables:

```toml
r2_endpoint = "https://...r2.cloudflarestorage.com"
r2_bucket = "pic"
r2_access_key_id = "..."
r2_secret_access_key = "..."
api_endpoint = "https://api.pic.335g.dev"
cf_access_client_id = "..."
cf_access_client_secret = "..."
```

## Testing Decisions

- **CLI**: Rust unit tests for thumbnail generation (image processing logic) + integration tests using a local S3-compatible store (e.g. minio) for R2 upload verification.
- **Backend**: Vitest + Hono test helpers. API endpoints tested at the HTTP level (requests in, responses out). D1 mocked or replaced with an in-memory SQLite backend. Test fixture: known metadata payloads.
- **Frontend**: Vitest + Testing Library for component tests. API calls mocked at the fetch level. No end-to-end tests in the initial version.
- **Testing principle**: Only test external behavior (API responses, component render output), not implementation details. Prefer the highest seam possible.

## Out of Scope

- Multi-user support (single-user only)
- Photo editing/filtering on Frontend
- Automatic sync/ watch mode for CLI (manual upload command only)
- Exif metadata editing
- Album/collection organization
- Search functionality
- Mobile app
- End-to-end tests (initial version)
- CI/CD pipeline configuration

## Further Notes

- HEIC support in CLI uses `libheif-rs` (requires `libheif` system library). macOS can install via `brew install libheif`. Cross-platform support is planned but not required for initial release.
- Cloudflare Free plan limits: Workers 100k req/day, D1 5M rows read/day + 100k writes/day, R2 10GB storage free, Pages 500 builds/month. Single-user usage is well within all limits.
- Cloudflare Workers CPU time (Free: 10ms/req) is sufficient for Backend's lightweight operation (JSON DB queries + signed URL generation). Heavy image processing is intentionally placed in CLI to avoid this constraint.
- Upload success is determined by: (1) R2 PUT confirmed, (2) Backend metadata registration confirmed. If either fails, the operation is rolled back (if R2 succeeded but Backend failed, CLI retries Backend registration; if R2 PUT itself failed, CLI reports error and leaves local file intact).
