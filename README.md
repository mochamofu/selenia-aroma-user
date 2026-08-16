# Selenia Aroma User App

セレニアアロマの購入者向けWebアプリ / PWAです。

購入者が自分のアロマ制作記録、ベースブレンド、一般精油の情報、お気に入り、再購入導線をスマートフォンから確認できることを目的としています。

## 公開URL

| 用途 | URL | 説明 |
| --- | --- | --- |
| 購入者向けアプリ | https://selenia-aroma-customer.vercel.app | 現在の公開デモ。本番認証導入前のため、一時的にログイン入力なしで閲覧できます |
| 管理者・事業者向けアプリ | https://aroma-records-pwa.vercel.app/operator | 顧客カルテ、制作履歴、配合管理、脳波データ連携を扱う別アプリ |
| ローカル確認 | http://localhost:3100/dashboard | 購入者向けローカル起動時の確認URL |
| このリポジトリ | https://github.com/mochamofu/selenia-aroma-user | 購入者向けアプリのドキュメントとソース管理用 |

> 購入者向けアプリと管理者・事業者向けアプリは、用途・URLを分けて管理します。購入者向けの表示変更を管理者・事業者側へ反映しない方針です。

## 現在の状態

- スマートフォンファーストのNext.js Web/PWA
- 購入者向け公開URLはデモモードで自動入場
- デモ表示名は「花咲 美月さん」
- ホーム、アロマ一覧、アロマ詳細、再購入確認、気分から探す、精油図鑑、ベースブレンド図鑑、プロフィールを実装
- ベースブレンドは12種類。購入者向けには含まれる精油の種類と目的を表示し、配合比率は非公開
- 購入者向け画面では、滴数、ml、μL、配合比率などの詳細数値を表示しない
- 一般精油図鑑は36種類を想定し、香りの特徴、使用シーン、相性、注意メモを掲載
- 商品画像がない場合は、淡いグラデーションのプレースホルダーを表示
- 再購入ボタンから確認画面を経由して外部ECへ遷移
- 管理者・事業者側では、制作管理のため詳細な分量や配合情報を扱う

## 主な画面

| 画面 | パス |
| --- | --- |
| ホーム | `/dashboard` |
| アロマ記録一覧 | `/aromas` |
| アロマ詳細 | `/aromas/[id]` |
| 再購入確認 | `/aromas/[id]/reorder` |
| 気分・目的から探す | `/moods` |
| 気分別の精油一覧 | `/moods/[mood]` |
| 精油詳細 | `/oils/[slug]` |
| ベースブレンド一覧 | `/base-blends` |
| ベースブレンド詳細 | `/base-blends/[id]` |
| プロフィール | `/profile` |

## 技術構成

- Next.js 16.2.6 / App Router
- TypeScript
- Tailwind CSS 4
- Supabase Auth / Database / Storage 接続を想定
- lucide-react
- PWA manifest
- UI、hooks、services、types、data、libを分離した構成

## ローカル起動

現在の購入者向けアプリをローカルで確認する場合は、アプリ作業フォルダで次を実行します。

```bash
npm install
npm run dev:3100
```

ブラウザで http://localhost:3100/dashboard を開きます。

## 環境変数

本番認証・Supabase接続時に設定します。

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ENABLE_DEMO_MODE=
NEXT_PUBLIC_APP_TARGET=
```

デモ用の購入者向け設定例:

```env
NEXT_PUBLIC_ENABLE_DEMO_MODE=true
NEXT_PUBLIC_APP_TARGET=customer
```

Supabaseのサービスロールキーはクライアント側へ公開しません。

## データと権限の方針

- customer: 自分に紐づく公開済みアロマ記録と自分のお気に入りを利用
- admin: 顧客、アロマ記録、公開用ブレンド、内部レシピ、精油図鑑を管理
- 購入者向け表示では、ベースブレンドの比率や制作数量を非公開
- 事業者向けカルテでは、制作再現に必要な詳細情報を管理
- 本番運用ではSupabase RLSとSupabase Authで権限を分離

## リポジトリの現在位置づけ

このリポジトリには、購入者向けアプリのソースコード、公開仕様、更新履歴を登録しています。Claude、Codex、GLMなど複数の開発環境から共同で扱うためのリポジトリです。管理者・事業者向けアプリは別URL・別用途として管理します。

## ディレクトリ

- `src/`: 購入者向け画面、コンポーネント、hooks、services、types、公開用データ
- `public/`: PWAマニフェスト、アイコン、公開アセット
- `supabase/`: Database/RLS用SQL
- `docs/`: 公開してよい仕様書とデータ定義
- `scripts/`: 仕様書生成などの補助スクリプト

## 共同開発時の注意

公開リポジトリのため、次の情報はコミットしません。

- `.env.local`、Supabaseのサービスロールキー、その他の秘密鍵
- `.vercel/`、`.next/`、`node_modules/`、ビルド生成物
- 内部向けのベースブレンド配合比率

作業前にブランチを作成し、依存関係とビルドを確認してください。

```bash
git switch -c agent/<topic>
npm install
npm run build
```

詳細な更新履歴は [CHANGELOG.md](./CHANGELOG.md) を参照してください。
