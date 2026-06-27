# pic — Personal Image Cloud

写真・動画をローカルからCloudflare R2に退避・管理するためのサービス。
CLI / Backend (API) / Frontend (Web) の3コンポーネントからなる。

## Language

**pic**:
このプロジェクト全体およびサービスの名称。
_Avoid_: —

**CLI**:
ユーザーのローカル端末上で動作し、写真・動画をR2にアップロードするコマンドラインツール。
サムネイル生成、メタデータ抽出、R2へのPUT、Backendへの通知を責務とする。
_Avoid_: Uploader, Desktop app

**Backend**:
Cloudflare Workers (TypeScript, Hono) 上で動作するAPIサーバ。
R2上のファイル一覧、メタデータ管理、署名付きURL発行、認可を責務とする。
_Avoid_: API server, Server

**Frontend**:
Cloudflare Pages 上にホストされる React (Vite + Tailwind CSS + shadcn/ui) のシングルページアプリケーション。
Backend APIを経由して写真一覧・表示・ダウンロードを行う。
_Avoid_: Web app, Client

**R2**:
Cloudflare R2 オブジェクトストレージ。CLIが元ファイルとサムネイルの両方を直接PUTし、FrontendはBackend発行の署名付きURL経由で読み取る。
_Avoid_: S3, Storage

**写真**:
静止画ファイル（JPEG, HEIC, PNG等）。CLIが生成するサムネイル（JPEG）を伴う。
_Avoid_: Image, Picture

**動画**:
動画ファイル（MOV, MP4等）。静止画同様、CLIが最初のフレームからサムネイル（JPEG）を生成する。
_Avoid_: Video, Movie

**サムネイル**:
一覧表示用に縮小されたJPEG画像。CLIが元ファイルから生成し、R2にアップロードする。
_Avoid_: Thumb, Preview

**メタデータ**:
各ファイル（写真/動画）の属性情報。BackendのD1で管理される。
- ファイル名（表示用）
- R2上のキー（パス）
- ファイルサイズ
- 種類（写真/動画）
- サムネイルのR2キー（パス）
- アップロード日時
- Exif撮影日時

_Avoid_: Info, Attributes

**署名付きURL**:
Backendが発行する、R2オブジェクトへの一時的な直接アクセスURL。
Frontendはこれを経由してR2からファイルを取得する。
_Avoid_: Presigned URL, Temporary URL
