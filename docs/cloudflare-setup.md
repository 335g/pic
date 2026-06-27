# Cloudflare Setup Guide

## 事前準備

- Cloudflare アカウント（`335g.dev` ドメイン登録済み）
- `wrangler` CLI が認証済みであること

```bash
npx wrangler login
```

---

## 1. R2 バケット作成

写真・動画の元ファイルとサムネイルを格納するバケット。

```bash
cd backend
npx wrangler r2 bucket create pic-media
```

> バケット名は `pic-media` 固定。変更する場合は `wrangler.jsonc` の `bucket_name` も合わせて変更。

### R2 API トークン発行（CLI用）

CLIがR2に直接PUTするためのAPIトークンを発行する。

1. Cloudflare ダッシュボード → **R2** → **pic-media** → **Manage R2 API Tokens**
2. **Create API Token** → 権限: **Admin Read & Write**
3. 発行された `Access Key ID` と `Secret Access Key` を控える

---

## 2. D1 データベース作成

メタデータを管理するSQLiteデータベース。

```bash
cd backend

# データベース作成
npm run db:create
# → 出力された database_id を wrangler.jsonc の d1_databases[0].database_id に書き込む

# マイグレーション実行（ローカル確認用）
npm run migrate:apply:local

# マイグレーション実行（本番）
npm run migrate:apply
```

### wrangler.jsonc の更新

`database_id` を実際の値で埋める:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "pic-media",
    "database_id": "<取得したUUID>"
  }
]
```

---

## 3. Zero Trust 設定

### 3-1. Frontend 用 Access ポリシー（メール制限）

1. Cloudflare ダッシュボード → **Zero Trust** → **Access** → **Applications**
2. **Add an application** → **Self-hosted**
3. **Application domain**: `pic.335g.dev`
4. **Session Duration**: 適宜（推奨: 24h）
5. **Policy**: 許可するメールアドレスを1つ登録（例: `your@email.com`）
6. 作成完了

### 3-2. CLI 用 Service Token

1. Cloudflare ダッシュボード → **Zero Trust** → **Access** → **Service Auth**
2. **Generate Service Token**
3. 発行された `Client ID` と `Client Secret` を控える

### 3-3. API ドメインの Access ポリシー

1. **Access** → **Applications** → **Add an application** → **Self-hosted**
2. **Application domain**: `api.pic.335g.dev`
3. **Policy** → 以下のいずれかを選択:
   - **Service Token のみ許可**: ポリシーで Service Token のみを許可（CLIからのみアクセス）
   - **メール + Service Token**: Frontendからのブラウザアクセスも許可する場合

> **推奨**: Frontend は `pic.335g.dev` からAPIを呼ぶだけなので、`api.pic.335g.dev` は Service Token のみ許可でよい。
> ただし開発初期は両方許可しておくと楽。

---

## 4. ドメイン DNS 設定

### 4-1. Backend 用カスタムドメイン

```bash
cd backend
npx wrangler deployments list
# Worker がデプロイされていることを確認

npx wrangler domain list
# またはダッシュボードから設定
```

もしくはダッシュボードで:
1. **Workers & Pages** → **pic-api** → **Settings** → **Domains**
2. **Add Custom Domain**: `api.pic.335g.dev`

> DNS レコードは Cloudflare が自動的に作成する。

### 4-2. Frontend 用カスタムドメイン

**方法A: Cloudflare Pages から設定（推奨）**
1. **Workers & Pages** → **pic**（Pagesプロジェクト名）→ **Custom domains**
2. **Set up a custom domain**: `pic.335g.dev`

**方法B: DNS レコードを手動追加**
```
pic.335g.dev  CNAME  pic.pages.dev
```

---

## 5. Backend デプロイ

```bash
cd backend

# 型定義の生成
npm run types

# デプロイ
npm run deploy
```

初回デプロイ後、以下の環境変数を設定する（必要な場合）:

```bash
npx wrangler secret put R2_PUBLIC_URL
# → R2 バケットの公開URL（署名付きURLに必要。通常は自動生成されるので省略可）
```

---

## 6. Frontend デプロイ

### Cloudflare Pages に接続（Git連携）

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. リポジトリ `335g/pic` を選択
3. **Build configuration**:
   - Build command: `cd frontend && npm install && npm run build`
   - Build output directory: `frontend/dist`
   - Root directory: （空 = リポジトリルート）

### 環境変数

| 変数名 | 値 | 用途 |
|--------|-----|------|
| `VITE_API_BASE` | `https://api.pic.335g.dev` | APIエンドポイント（本番） |
| `NODE_VERSION` | `22` | Node.js バージョン |

> 開発環境では省略可（同じオリジンの `/api/*` にフォールバック）。

---

## 7. CLI 設定

`~/.pic/config.toml` を作成:

```toml
[r2]
endpoint = "https://<account-id>.r2.cloudflarestorage.com"
bucket = "pic-media"
access_key_id = "<R2 API Access Key ID>"
secret_access_key = "<R2 API Secret Access Key>"

[api]
endpoint = "https://api.pic.335g.dev"
cf_access_client_id = "<Zero Trust Service Token Client ID>"
cf_access_client_secret = "<Zero Trust Service Token Client Secret>"
```

> R2 エンドポイントの形式: `https://<account-id>.r2.cloudflarestorage.com`
> Account ID は Cloudflare ダッシュボードのURLや右下の **Account ID** から確認可能。

---

## セットアップ手順サマリー（作業順）

```
 1. R2 バケット作成          → wrangler r2 bucket create pic-media
 2. R2 API トークン発行       → ダッシュボード
 3. D1 データベース作成       → npm run db:create
 4. wrangler.jsonc の更新     → database_id を書き込み
 5. D1 マイグレーション実行   → npm run migrate:apply
 6. Zero Trust Service Token  → ダッシュボード（CLI用）
 7. Zero Trust Access ポリシー → ダッシュボード（pic.335g.dev + api.pic.335g.dev）
 8. Backend デプロイ          → npm run deploy
 9. Backend カスタムドメイン   → api.pic.335g.dev
10. Frontend デプロイ         → Cloudflare Pages (Git連携)
11. Frontend カスタムドメイン  → pic.335g.dev
12. CLI 設定ファイル作成      → ~/.pic/config.toml
```
