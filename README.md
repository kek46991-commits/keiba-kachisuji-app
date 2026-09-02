# 競馬でGO!（勝ち筋解析システム）

JRA（中央）・NAR（地方）の両方に対応した競馬予想・成績管理Webアプリケーション。  
AI解析による予想の提案に加え、公式レース結果との自動照合、的中判定、回収率の自動集計までを1つの画面フローで扱えます。

公開デモ: https://keiba-kachisuji-web.onrender.com （Render無料プランのため、アイドル後の初回アクセスは起動に数十秒かかります）

---

## 主な機能

### 1. JRA/NAR予想の統合
* 中央・地方のレースを共通のデータモデル（`races` / `entries` / `payouts` / `predictions`）で保持
* 予想の生成・保存・買い目（3連単・3連複・馬連・馬単・ワイド）の管理を共通経路で処理
* 結果照合と成績集計も中央・地方で同じロジック（`server/raceSettlementSummary.ts`）を使用

### 2. 本物馬名交代
* 予想エンジンが出力する「馬A・馬B…」等のダミー馬名は保存値を書き換えずそのまま保持
* レースごとの出走表マスター（`race_entry_master`、キーは `raceKey + 馬番`）と照合し、表示面への解釈的解決
* 出走表・買い目・解説文・レース結果・成績集計のすべてで実名表示（`shared/horseNameMapping.ts`）
* マスター未登録時は元の保存値をそのまま表示するため、間違った馬名を出さない

### 3. 的中判定・回収率の自動集計ダッシュボード
* 公式着順（1〜3着）と確定払い戻しを保持し、推奨買い目と自動照合して「的中 / 不的中」を判定（`server/resultSettlement.ts`）
* 券種ごとの順不同性を正しく扱う（3連単・馬単は順序依存、3連複・馬連・ワイドは順序非依存）
* 着順確定済みで未精算の予想は、画面表示時に公式払い戻しから自動精算しDBへ永続化（`settlePendingConfirmedRaces`）
* レース詳細・今日の予想一覧に「1〜3着の馬名と馬番 / 判定 / 回収金額 / 回収率 [%]」を表示
* 予想履歴・ダッシュボードで通算および日別の「総投資額 / 総回収額 / 連続回収率 / 収支」をグラフ・数値で表示
* 回収率 = 回収額 ÷ 投資額 × 100、収支 = 回収額 - 投資額（`shared/settlementDisplay.ts`）
* 買い目・払い戻し・着順のいずれかが未取得の場合は「未精算」として扱い、誤って不的中扱いにしない

### 4. 買い目表示の整形
* フォーメーション表記の重複馬番を表示用ロジックで排除し、「1着5 → 2着4,2,3 → 3着4,2,3,6 (9点)」形式へ自動整形（`client/src/lib/ticketDisplay.ts`）
* 数量や分別自体は変更せず、表示するだけを整形

### 5. 日付・時刻表示
* レース日・更新時刻はすべて JST（Asia/Tokyo）固定で整形し、見る人のタイムゾーンによる日付ズレを防ぐ

### 6. 有料会員制（サブスクリプション + 期限付きアクセスパス）
* 有料ページ（`/todays-predictions`、`/predictions`、`/nar-predictions`、`/dashboard`、`/prediction-history`）は未購入だと `/access-pass` へリダイレクト（`client/src/components/PremiumRoute.tsx`）
* サーバー側でも `premiumProcedure` により有料APIを保護。クライアント変更ではデータを取得できない（`server/access/premiumAccess.ts`）
* 有料判定は2系統：①ログインユーザーのストライプサブスクリプション（アクティブ/トライアル中） ②アカウント不要の期限付きアクセスパス（1日パス ¥480 / 30日パス ¥1,980）
* アクセスパスは Stripe Checkout（都度払い）で購入。決済完了時に Webhook と成功画面のクレーム処理の両方が同じキーを決定論的に導出するため、二重発行されない（`server/access/issueAccessPass.ts`）
* DBにはキーの SHA-256 ハッシュのみを保存し、生キーは購入者への表示と HttpOnly Cookie にのみ保持（`drizzle/0019_access_passes.sql`）
* 期限切れ・失効済みキーは拒否します。別端末では `/access-pass` キー入力欄で解放できる

---

## 構成技術

| レイヤー | 技術 |
| :--- | :--- |
| **フロントエンド** | React 19, Vite, TypeScript, Tailwind CSS, Radix UI, React Query, wouter |
| **API** | Express, tRPC v11, Zod |
| **データベース** | MySQL, Drizzle ORM（マイグレーションは drizzle） |
| **決済** | Stripe（サブスクリプション + 都度払いアクセスパス） |
| **テスト** | Vitest (149テスト) |
| **ビルド** | Vite（クライアント） + esbuild（サーバー） |

---

## ディレクトリ構成

```text
client/src/pages/       画面（予想・レース結果・今日の予想・履歴・ダッシュボード等）
client/src/components/  RaceSettlementCard / PerformanceSummaryPanel 等の共通UI
server/                 tRPCルーター、結果照合・精算、成績集計、出走表マスター
shared/                 馬名変換・買い目整形・日米弁異なるクライアント/サーバー共通ロジック
drizzle/                スキーマ定義とマイグレーション
```

---

## セットアップ

```bash
pnpm install
pnpm db:push        # DATABASE_URL のMySQLへスキーマ適用
pnpm dev            # 開発サーバー
pnpm check          # 型チェック
pnpm test           # Vitest
pnpm build && pnpm start   # 本番ビルド・起動
```

## 環境変数

| 変数 | 用途 |
| :--- | :--- |
| `DATABASE_URL` | MySQL接続文字列（必須）例: `mysql://user:pass@host:3306/keiba` |
| `JWT_SECRET` | セッション署名・アクセスキー導出の秘密鍵（必須） |
| `STRIPE_SECRET_KEY` | Stripeシークレットキー（決済に必須） |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook署名検証用（決済に必須） |
| `VITE_APP_ID` | アプリ識別子 |
| `OAUTH_SERVER_URL` / `OWNER_OPEN_ID` | ログイン連携を使う場合に設定 |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | AI解析APIを使う場合に設定 |
| `NODE_ENV` / `PORT` | 実行モードと待受ポート（既定 3000） |

Stripe Webhook は `https://<本番ドメイン>/api/stripe/webhook` を登録し、`checkout.session.completed` を購読してください。

## 無料での公開デプロイ（Render + 無料MySQL）

Express常駐サーバー＋MySQL構成のため、静的ホスティング（Vercel/Netlifyの静的公開）では動作しません。無料枠で公開する場合は Render（Web Service / Free）＋ MySQL互換の無料DB（TiDB Cloud Serverless など）を使います。

1. Render で「New +」→「Blueprint」からこのリポジトリを選ぶと、ルートの `render.yaml`（`runtime: docker`）が読み込まれる。
2. データを永続させる場合は無料MySQLを作成し `DATABASE_URL` を設定する（TiDB Cloud Serverless はTLS必須のため `?ssl={"minVersion":"TLSv1.2"}` を付与）:
   `mysql://<user>:<pass>@<host>:4000/keiba?ssl={"minVersion":"TLSv1.2"}`
   `DATABASE_URL` を空のままにすると、コンテナ同梱の MariaDB とデモシードで起動する（外部DB不要だが、再起動でデータは消えるためデモ用途）。
3. `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` はRenderのダッシュボードで設定する（`render.yaml` では `sync: false` にしており値はリポジトリに保存しない）。未設定でもサーバーは起動し、決済導線のみ無効になる。`JWT_SECRET` はRenderが自動生成する。
4. デプロイ時に `pnpm build` と `drizzle-kit push`（`drizzle/schema.ts` を正としてスキーマ反映）が実行され、`https://<service>.onrender.com` が発行される。

無料プランは一定時間アクセスがないとスリープし、次のアクセスで数十秒かかる点に注意してください。
