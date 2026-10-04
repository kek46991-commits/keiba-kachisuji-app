# 地方競馬（NAR）データ自動取得パイプライン

## 概要

nar.netkeibaから地方競馬のレース情報・出馬表・オッズを自動取得し、
アプリのDBに保存して予想ページに反映する仕組みです。

## アーキテクチャ

```
[nar.netkeiba] → [Heartbeatハンドラー (TypeScript)] → [MySQL DB]
                                                          ↓
                                                   [tRPC API]
                                                          ↓
                                                   [NAR予想ページ]
```

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `scripts/fetch_nar_races.py` | Pythonスクリプト（手動実行用・テスト用） |
| `server/scheduled/fetchNarRaces.ts` | Heartbeat定期実行ハンドラー |
| `server/narPredictionRouter.ts` | NAR予想API（レース一覧・予想実行・既存予想取得） |
| `client/src/pages/NarPredictionPage.tsx` | NAR予想フロントエンド |

## 定期実行スケジュール

| ジョブ名 | 実行時刻 (JST) | 内容 |
|---------|---------------|------|
| fetchNarRaces | 毎日 7:00 | 当日のレース一覧・出馬表を取得 |
| fetchNarRaces-afternoon | 毎日 14:00 | オッズ更新（レース直前データ） |

## データ取得フロー

### 1. レース一覧取得
- `https://nar.netkeiba.com/top/race_list_sub.html?kaisai_date=YYYYMMDD`
- 当日開催の全競馬場・全レースを取得
- DBの `races` テーブルに保存（type='nar'）

### 2. 出馬表取得
- `https://nar.netkeiba.com/race/shutuba.html?race_id=XXXX`
- 各レースの出走馬・枠番・馬番・騎手・オッズを取得
- DBの `entries` テーブルに保存

### 3. オッズ取得
- 出馬表ページから単勝オッズ・人気順を抽出
- `entries.odds` / `entries.popularity` に保存

## DBテーブル

### races テーブル（既存）
- `raceId`: nar.netkeibaのレースID（例: 202630080501）
- `type`: 'nar'
- `venue`: 競馬場名
- `raceNumber`: レース番号
- `raceName`: レース名
- `raceDate`: 開催日
- `startTime`: 発走時刻
- `surface`: 芝/ダート
- `distance`: 距離(m)
- `headCount`: 頭数

### entries テーブル（既存）
- `raceId`: レースID
- `horseNumber`: 馬番
- `gateNumber`: 枠番
- `horseName`: 馬名
- `jockey`: 騎手名
- `odds`: 単勝オッズ
- `popularity`: 人気順

## 手動実行方法

```bash
# 今日のレース一覧のみ取得
cd /home/ubuntu/keiba-kachisuji-web
python3 scripts/fetch_nar_races.py

# 特定日のレース一覧取得
python3 scripts/fetch_nar_races.py --date 2026-08-05

# 出馬表も含めて取得
python3 scripts/fetch_nar_races.py --date 2026-08-05 --entries

# 最大取得レース数を制限
python3 scripts/fetch_nar_races.py --date 2026-08-05 --entries --max-races 5
```

## 環境変数

| 変数名 | 説明 |
|--------|------|
| `DATABASE_URL` | MySQL接続文字列（システム自動設定） |

※ nar.netkeibaへのアクセスに認証は不要です。

## 注意事項

- nar.netkeibaへのリクエストは1レースあたり1秒の間隔を空けています
- 全レース（30-50レース/日）の出馬表取得には約1-2分かかります
- keiba.go.jpのCSVデータ連携は、サイトリニューアル完了後に追加予定です

## 将来の拡張

1. **keiba.go.jp CSV連携**: サイト復旧後にCSVダウンロード→自動取り込みを追加
2. **JRA-VAN NV-Link連携**: Windowsマシンからのデータアップロード機能
3. **オッズ変動追跡**: 時系列でオッズ変動を記録し、予想精度向上に活用
