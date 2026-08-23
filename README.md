# 競馬でGO!（勝ち筋解析システム）

JRA（中央）・NAR（地方）の両方に対応した競馬予想・成績管理Webアプリケーション。AI解析による予想の提示に加え、公式レース結果との自動照合、的中判定、回収率の自動集計までを一つの画面フローで扱えます。

デモ: 一時公開URL（Devinトンネル、Basic認証付き・稼働中のみ有効）

## 主な機能

### 1. JRA / NAR 予想の統合
- 中央・地方のレースを共通のデータモデル（`races` / `entries` / `payouts` / `predictions`）で保持
- 予想の生成・保存・買い目（3連単・3連複・馬連・馬単・ワイド）の管理を共通経路で処理
- 結果照合と成績集計も中央・地方で同一ロジック（`server/raceSettlementSummary.ts`）を使用

### 2. リアルタイム本物馬名置換
- 予想エンジンが出力する「馬A・馬B…」等のダミー馬名は**保存値を書き換えずそのまま保持**
- レースごとの出走表マスター（`race_entry_master`、キーは `raceKey + 馬番`）と照合し、**表示時に実名へ動的解決**
- 出走表・買い目・解説文・レース結果・成績集計のすべてで実名表示（`shared/horseNameMapping.ts`）
- マスター未登録時は元の保存値をそのまま表示するため、誤った馬名を出さない

### 3. 的中判定・回収率の自動集計ダッシュボード
- 公式着順（1〜3着）と確定払戻を保持し、推奨買い目と自動照合して「的中 🎯 / 不的中」を判定（`server/resultSettlement.ts`）
- 券種ごとの順序依存を正しく扱う（3連単・馬単は順序依存、3連複・馬連・ワイドは順序非依存）
- 着順確定済みで未精算の予想は、画面表示時に公式払戻から自動精算しDBへ永続化（`settlePendingConfirmedRaces`）
- レース詳細・今日の予想一覧に「1〜3着の馬名と馬番 / 判定 / 回収金額 / 回収率(%)」を表示
- 予想履歴・ダッシュボードで通算および日別の「総投資額 / 総回収額 / 通算回収率 / 収支」をグラフ・数値で表示
- 回収率 = 回収額 ÷ 投資額 × 100、収支 = 回収額 − 投資額（`shared/settlementDisplay.ts`）
- 買い目・払戻・着順のいずれかが未取得の場合は「未精算」として扱い、誤って的中扱いにしない

### 4. 買い目表示の整形
- フォーメーション表記の重複馬番を表示用ロジックで排除し、「1着5 → 2着4,2,3 → 3着4,2,3,6（9点）」形式へ自動整形（`client/src/lib/ticketDisplay.ts`）
- 点数や組合せ自体は変更せず、表示だけを整形

### 5. 日付・時刻表示
- レース日・更新時刻はすべて JST（`Asia/Tokyo`）固定で整形し、閲覧者のタイムゾーンによる日付ズレを防止

## 技術構成

| レイヤー | 技術 |
| --- | --- |
| フロントエンド | React 19, Vite, TypeScript, Tailwind CSS, Radix UI, React Query, wouter |
| API | Express, tRPC 11, Zod |
| データベース | MySQL, Drizzle ORM（マイグレーションは `drizzle/`） |
| 決済 | Stripe |
| テスト | Vitest（143テスト） |
| ビルド | Vite（クライアント）+ esbuild（サーバー） |

## ディレクトリ構成

```
client/src/pages/        画面（予想・レース結果・今日の予想・履歴・ダッシュボード等）
client/src/components/   RaceSettlementCard / PerformanceSummaryPanel など表示部品
server/                  tRPCルーター、結果照合・精算、成績集計、出走表マスター
shared/                  馬名置換・買い目整形・回収率計算などクライアント/サーバー共通ロジック
drizzle/                 スキーマ定義とマイグレーション
```

## セットアップ

```bash
# 依存関係
pnpm install

# MySQL（ローカル例）
docker run -d --name keiba-mysql -e MYSQL_ROOT_PASSWORD=keiba \
  -e MYSQL_DATABASE=keiba -p 3307:3306 mysql:8

# マイグレーション
DATABASE_URL='mysql://root:keiba@127.0.0.1:3307/keiba' pnpm db:push

# 開発サーバー
DATABASE_URL='mysql://root:keiba@127.0.0.1:3307/keiba' pnpm dev

# 本番ビルドと起動
pnpm build
DATABASE_URL='mysql://root:keiba@127.0.0.1:3307/keiba' NODE_ENV=production PORT=3000 node dist/index.js
```

デモ用データ（中央・地方の結果確定レース）の投入:

```bash
DATABASE_URL='mysql://root:keiba@127.0.0.1:3307/keiba' npx tsx local_result_seed.ts
```

## 品質チェック

```bash
pnpm check   # TypeScript 型チェック
pnpm test    # Vitest（結果照合・回収率・馬名置換・買い目整形のユニットテスト）
pnpm build   # 本番ビルド
```

## 環境変数

| 変数 | 用途 |
| --- | --- |
| `DATABASE_URL` | MySQL接続文字列（未設定時はDB非依存の空表示にフォールバック） |
| `STRIPE_SECRET_KEY` | Stripe連携（サブスクリプション） |
| `NODE_ENV` / `PORT` | 実行モードと待ち受けポート |
