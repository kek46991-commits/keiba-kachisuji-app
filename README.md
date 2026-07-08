# 🏇 勝ち筋解析システム

**実データ × 機械学習 × バックテスト** で競馬の期待値を *検証* するための分析基盤。

> ## ⚠️ 重要な免責事項
> 競馬の馬券には **控除率 (テラ銭)** が約 20〜30% あり (単勝で約20%)、
> 市場どおりに買うと払戻は平均的に投資の約 80% にしかなりません。
> したがって **バックテストで回収率 100% 超 (ROI プラス) を継続的に達成できない限り、
> 「儲かる」とは言えません**。本プロジェクトの第一目的は利益の保証ではなく、
> **実データで検証可能な仕組みを作り、予測ロジックの有効性を定量評価すること** です。
> 同梱の合成データでの結果はアルゴリズムが生成したダミーであり、実市場の成績を意味しません。

利用形態:

1. **データ駆動パイプライン (Python)** — `data/` → `features.py` → `model.py` → `backtest.py`。
   実データ (または合成データ) を学習し、勝率を予測してバックテストする **正式な検証ロジック**。
2. **Streamlitアプリ版 (`app.py`)** — 上記パイプラインを GUI 化。予測・バックテストをブラウザで実行。
3. **静的Webサイト版 (`site/`)** — サーバー不要のデモ。**ただしパドック経験則は統計的根拠の無い
   レガシー実装** であり、検証には Python パイプラインを使うこと。

## 機能

- **データ駆動予測**: 過去成績・距離/競馬場適性・馬場などの特徴量から各馬の勝率を学習し、
  レース内で合計100%に正規化した予測勝率を出力 (LightGBM、未導入環境では scikit-learn に自動フォールバック)
- **バックテスト**: 学習期間/検証期間に時系列分割し、単勝 value / 予測1位 / 1番人気 などの
  買い方の **的中率・回収率 (ROI)** を集計
- **ボックス買い目計算機**: 三連単/三連複/馬連/馬単/ワイドの点数・投資額計算
- **ビジュアル分析**: インタラクティブなグラフ表示（静的版はChart.js、Streamlit版はPlotly）

## 静的Webサイト版 (推奨・デプロイ向け)

ビルド不要の純粋なHTML/CSS/JS。`site/` ディレクトリをそのまま静的ホスティングに置くだけ。

### ローカルで確認

```bash
cd site
python -m http.server 8080
# ブラウザで http://localhost:8080 を開く
```

### デプロイ

- **GitHub Pages**: リポジトリ設定で `site/` を公開ディレクトリに指定（または `site/` の中身をルートに配置）。
- **Netlify**: Publish directory に `site` を指定（ビルドコマンドは不要）。
- **Vercel**: Root Directory に `site` を指定（Framework Preset は "Other"）。

構成:

```
site/
  index.html      # マークアップ
  styles.css      # ダークテーマのスタイル
  js/engine.js    # 解析エンジン (JavaScript移植版)
  js/app.js       # UIロジック・Chart.js描画
```

## データ駆動パイプライン (Python)

```bash
pip install -r requirements-ml.txt

# 1) 合成データを生成 (実データを使う場合はこの手順を CSV 用意に置き換え)
python -m data.fetch --out data/sample_races.csv --sqlite data/cache/races.sqlite

# 2) モデルを学習して保存 (特徴量重要度も表示)
python model.py --csv data/sample_races.csv --out data/cache/model.pkl

# 3) バックテストで的中率・回収率(ROI)を集計
python backtest.py --csv data/sample_races.csv --train-frac 0.7 --ev-threshold 1.1
```

各引数を省略すると G1 専用の合成データで動作します。
`data.fetch` の生成 CLI は `--seasons` と `--races-per-season` で G1 の量を調整で
きます。

### モジュール構成

| モジュール | 役割 |
|------------|------|
| `data/fetch.py` | 過去レースの出走表・結果・確定オッズを CSV/SQLite で取得・保存。`grade` 列で G1/G2/G3/OP を表し、既定の合成データは G1 専用。`filter_grade()` で G1 へ絞り込める |
| `features.py` | 各出走時点で **過去のみ参照** して特徴量を生成 (リーク防止)。通算/直近成績、距離・競馬場・馬場適性、休養、斤量など。確定オッズ・人気は市場情報リーク防止のため特徴量に含めない |
| `model.py` | 1着確率を学習する二値分類器。推論時は **レース単位で softmax 正規化** し、G1 だけを学習・推論対象にする |
| `backtest.py` | 時系列分割で学習/検証し、G1 だけを対象に `calc_box_tickets` で投資額を算出しつつ的中率・回収率を集計 |
| `engine.py` | 予測勝率から期待値・判定を組み立てる (`analyze_entries`)。旧パドック経験則 (`analyze_horse`) はレガシー |

### データスキーマ (`data/sample_races.csv` と同じ列を用意すれば実データを差し替え可能)

`race_id, date, course, track_type, grade, distance, weather, track_moisture, field_size,
horse_id, horse_name, umaban, waku, sex, age, jockey, weight_carried, horse_weight,
horse_weight_diff, odds, popularity, finish_pos, is_synthetic`

> **実データソースについて**: JRA / netkeiba 等のスクレイピングは利用規約・法的にグレーで
> 安定取得も難しいため、本リポジトリでは同梱しません。上記スキーマの CSV を用意して
> `data/fetch.py` の `load_races_csv` に渡せば、そのまま学習・バックテストできます。
> `grade` 列が無い古い CSV / SQLite は自動的に `OP` として読み込みますが、学習・バックテストは `G1` のみを使用します。

## Streamlitアプリ版

```bash
pip install -r requirements-ml.txt
streamlit run app.py
```

- **🤖 データ駆動予測 (G1専用)**: CSV/合成データを G1 に絞って学習し、選択レースの予測勝率・期待値・買い目候補を表示
- **🧪 バックテスト (G1専用)**: 学習割合・EV閾値・ボックス頭数を指定して G1 の回収率を検証
- **🎰 買い目計算**: ボックス点数・投資額
- **📝/📊 パドック (レガシー)**: 旧経験則のデモ (検証用途には非推奨)

## Web SaaS 版

`site/` の静的 UI をそのまま使う Web 版を、FastAPI + Stripe サブスクで公開する構
成を追加しました。

### ローカル起動

```bash
pip install -r requirements.txt
DEMO_MODE=1 uvicorn web.server:app --port 8000
```

### Docker / PaaS

```bash
docker build -t keiba-kachisuji .
docker run --rm -p 8000:8000 -e PORT=8000 -e DEMO_MODE=1 keiba-kachisuji
```

Render / Railway / Fly では、この Dockerfile をそのまま使い、環境変数
`APP_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
を設定してください。Stripe の鍵が未設定でも landing page は表示され、checkout は
`Stripe未設定` エラーを返します。

## デプロイ

この Web SaaS は、**常時起動の stateful ホスト** と **serverless** で要件が異なり
ます。

### 推奨: Render / Railway / Fly

- Dockerfile からそのまま起動できます
- SQLite で `web/subscribers.db` を使えるので MVP と相性が良いです
- Render では persistent disk を `SUBSCRIBERS_DB_PATH` にマウントしてください
- GitHub リポジトリをプロバイダ側で接続すると、branch への push で auto-deploy されます

### Vercel / Netlify

- Python は serverless function として動くため、ファイルシステムは **永続保存前提で
はありません**
- そのため SQLite の subscriber DB は保持されず、**`DATABASE_URL` で managed Post
gres を必須にしてください**
- `DATABASE_URL` なしで動かすと、デプロイはできますが webhook で subscriber を永続
保存できません
- Vercel は `vercel.json` をそのまま使い、`api/index.py` がエントリになります
- Netlify は `netlify.toml` と `netlify/functions/app.py` を使いますが、こちらは Verc
el より副次的な構成です

## Vercel へのデプロイ手順

Vercel は serverless なので、購入者情報を SQLite で保持しないでください。**Neon か Supabase の Postgres を必ず用意**し、`DATABASE_URL` を設定します。

1. GitHub リポジトリを Vercel に Import します。
2. Framework Preset は `Other` のままにします。
3. Environment Variables を設定します。
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID`
   - `STRIPE_WEBHOOK_SECRET`
   - `APP_SECRET_KEY`
   - `PUBLIC_BASE_URL` = `https://あなたのVercelドメイン`
   - `COOKIE_SECURE=1`
   - `DATABASE_URL` = Neon / Supabase の接続文字列
4. Neon / Supabase で無料 Postgres を作成します。
   - Neon: Project を作成 → Connection string をコピー
   - Supabase: Project を作成 → `Settings > Database > Connection string` をコピー
5. Stripe ダッシュボードで Webhook を追加します。
   - URL: `https://YOUR-DOMAIN/api/webhook`
   - 少なくとも `checkout.session.completed` と `customer.subscription.*` を購読
6. デプロイ後に確認します。
   - `/` が表示されること
   - `/app` が購読なしではリダイレクトすること
   - `DEMO_MODE=1` の検証時は `/app` が開けること
   - Checkout 完了後に `/access?session_id=...` で cookie が発行されること
   - Webhook 後に購読状態が Postgres に保存されること

補足: Vercel は root の `requirements.txt` を読みます。このリポジトリでは `requirements.txt` を web 用の薄い shim にし、重い ML 依存は `requirements-ml.txt` に分離しています。

### Stripe Webhook

Stripe ダッシュボードに以下の URL を登録してください。

```text
https://YOUR-DOMAIN/api/webhook
```

チェックアウト完了とサブスクリプション更新はこの webhook で subscriber DB に反映し
ます。

## デスクトップアプリ

Streamlit アプリを起動するデスクトップ向けランチャーと、PyInstaller 用のパッケー
ジ定義を同梱しています。

### ローカルでビルド

```bash
pip install -r requirements-ml.txt
pip install pyinstaller
pyinstaller keiba-app.spec
```

### CI での配布

GitHub Actions が Windows / macOS 向けのバイナリをビルドし、Actions の artifact ま
たは
タグ付きリリース (`v*`) からダウンロードできるようにします。

### 直接起動

```bash
python desktop.py
```

必要ならポートを固定して起動できます。

```bash
python desktop.py --port 8501
```

## 勝率・期待値の考え方

- **予測勝率**: モデルが出力する確率を **レース内で softmax 正規化** するため、出走馬の合計は 1。
  旧来の `total_score / 150` (合計が 1 にならない) を置き換える統計的な確率。
- **期待値 (EV)**: `EV = 予測勝率 × 単勝オッズ`。これは単勝 100 円に対する **期待払戻倍率 (= 回収率)**。
- **損益分岐は EV = 1.0**。ただし控除率 (単勝で約20%) のため市場どおりに買うと EV は平均 約0.8。
  EV > 1.0 を継続できる買い目を見つけられて初めて利益が期待できる。

### 期待値の判定基準 (控除率を考慮)

| 期待値 (回収率) | 判定 |
|-----------------|------|
| 1.3以上 | 🔥 妙味大・強い買い |
| 1.1以上 | ⭐ 期待値あり・買い |
| 1.0以上 | 👀 損益分岐付近・小口 |
| 0.8以上 | △ 控除率相当・見送り寄り |
| 0.8未満 | ✗ 期待値不足・見送り |

## テスト

```bash
pip install pytest
pytest -q
```
