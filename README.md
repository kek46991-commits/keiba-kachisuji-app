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
pip install -r requirements.txt

# 1) 合成データを生成 (実データを使う場合はこの手順を CSV 用意に置き換え)
python -m data.fetch --out data/sample_races.csv --sqlite data/cache/races.sqlite

# 2) モデルを学習して保存 (特徴量重要度も表示)
python model.py --csv data/sample_races.csv --out data/cache/model.pkl

# 3) バックテストで的中率・回収率(ROI)を集計
python backtest.py --csv data/sample_races.csv --train-frac 0.7 --ev-threshold 1.1
```

各引数を省略すると合成データで動作します。

### モジュール構成

| モジュール | 役割 |
|------------|------|
| `data/fetch.py` | 過去レースの出走表・結果・確定オッズを CSV/SQLite で取得・保存。実データが無い環境向けに合成データ生成器を同梱 (`is_synthetic=1` で明示) |
| `features.py` | 各出走時点で **過去のみ参照** して特徴量を生成 (リーク防止)。通算/直近成績、距離・競馬場・馬場適性、休養、斤量など。確定オッズ・人気は市場情報リーク防止のため特徴量に含めない |
| `model.py` | 1着確率を学習する二値分類器。推論時は **レース単位で softmax 正規化** し、出走馬の勝率合計が 1 になる確率を出力 |
| `backtest.py` | 時系列分割で学習/検証し、`calc_box_tickets` で投資額を算出しつつ的中率・回収率を集計 |
| `engine.py` | 予測勝率から期待値・判定を組み立てる (`analyze_entries`)。旧パドック経験則 (`analyze_horse`) はレガシー |

### データスキーマ (`data/sample_races.csv` と同じ列を用意すれば実データを差し替え可能)

`race_id, date, course, track_type, distance, weather, track_moisture, field_size,
horse_id, horse_name, umaban, waku, sex, age, jockey, weight_carried, horse_weight,
horse_weight_diff, odds, popularity, finish_pos, is_synthetic`

> **実データソースについて**: JRA / netkeiba 等のスクレイピングは利用規約・法的にグレーで
> 安定取得も難しいため、本リポジトリでは同梱しません。上記スキーマの CSV を用意して
> `data/fetch.py` の `load_races_csv` に渡せば、そのまま学習・バックテストできます。

## Streamlitアプリ版

```bash
pip install -r requirements.txt
streamlit run app.py
```

- **🤖 データ駆動予測**: CSV/合成データを学習し、選択レースの予測勝率・期待値・買い目候補を表示
- **🧪 バックテスト**: 学習割合・EV閾値・ボックス頭数を指定して回収率を検証
- **🎰 買い目計算**: ボックス点数・投資額
- **📝/📊 パドック (レガシー)**: 旧経験則のデモ (検証用途には非推奨)

## デスクトップアプリ

Streamlit アプリを起動するデスクトップ向けランチャーと、PyInstaller 用のパッケー
ジ定義を同梱しています。

### ローカルでビルド

```bash
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
