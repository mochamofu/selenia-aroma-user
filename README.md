# Selenia Aroma User App

セレニアアロマの購入者向けWebアプリ / PWAです。

購入者が自分のアロマ制作記録、ベースブレンド、一般精油の情報、お気に入り、再購入導線をスマートフォンから確認できることを目的としています。

## アプリは2つあります

このサービスは **お客様用** と **サロン運営者用** の2つのアプリでできています。
別々のリポジトリで、別々に公開されています。**このリポジトリはお客様用です。**

### お客様用（このリポジトリ）

| | |
| --- | --- |
| 公開URL | https://selenia-aroma-customer.vercel.app |
| ログイン | 不要（本番認証の導入前のため、開くとそのままホームに入ります） |
| 使う端末 | iPhone・スマートフォン（幅430pxのレイアウト） |
| 使う人 | 測定を受けたお客様 |
| 見えるもの | 自分の記録だけ。他のお客様の情報は一切表示されません |
| 画面の目印 | ホーム上部に **SELENIA AROMA ／ お客様用** |
| リポジトリ | https://github.com/mochamofu/selenia-aroma-user |
| ローカル起動 | `npm run dev` → http://localhost:3000/dashboard |

### サロン運営者用（別リポジトリ）

| | |
| --- | --- |
| 公開URL | https://aroma-records-pwa.vercel.app/operator |
| ログイン画面 | https://aroma-records-pwa.vercel.app/login |
| 使う端末 | iPad・PC |
| 使う人 | 施術を行うインストラクター、サロン管理者 |
| 画面の目印 | ログイン画面に **サロン運営者用** |
| リポジトリ | https://github.com/mochamofu/selenia-aroma-master |

ログイン情報（試用環境。表示されるデータはすべて架空のものです）

| 用途 | ID | パスワード | 見えるもの |
| --- | --- | --- | --- |
| 社外共有用 | `hacosco` | `aroma` | 内部配合比率は**非表示** |
| サロン管理者 | `admin@selenia` | `aroma` | 内部配合比率まで含めた全て |

**社外へURLを送るときは社外共有用のほうを渡してください。**
共有先を増やすときは、運営者アプリの `src/lib/auth.ts` の `DEMO_ACCOUNTS` に行を足します。

### 主な画面のURL（サロン運営者用）

| パス | 画面 |
| --- | --- |
| `/operator` | ダッシュボード（ログイン後のホーム） |
| `/operator/karte` | 利用者カルテ |
| `/operator/karte?client=<顧客ID>` | 特定の人のカルテを直接開く |
| `/operator/customers` | 利用者一覧 |
| `/operator/base-blends` | ベースブレンド一覧 |
| `/operator/oils` | エッセンシャルオイル一覧 |

### 2つのアプリの関係

画面は2つに分かれますが、**データベースは1つ（Cloudflare D1）を共有します。**
同じ顧客番号の人は、両方のアプリで同じ人として扱われます。

購入者向けの表示変更を、運営者向けへそのまま反映することはしません（`docs/app-separation.md`）。

## 番号の付け方

| | 表記 | 桁数 | 表すもの |
| --- | --- | --- | --- |
| 顧客番号 | `CLT-2600123` | 7桁 | **人**。一度発行したら一生変わらない |
| 施術番号 | `LOT-260904-010-01` | 11桁 | **1回の測定+調香**。ボトルのロット番号を兼ねる |
| 加盟店コード | `010` | 3桁 | 加入した順の通し番号 |

`CLT` と `LOT` の接頭辞は、数字を読まなくても種類が分かるようにするためのものです。
入力は接頭辞ありでもなしでも受け付けます（`CLT-2600123` でも `2600123` でも同じ）。

**「何回目の来店か」は番号に入れません。** 来店記録を数えて出します。
根拠は `docs/numbering-design.md` を参照してください。

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
