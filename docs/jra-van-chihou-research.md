# JRA-VAN 地方競馬DATA 調査結果

## サービス概要
- 提供元: 株式会社インター通信社 (saikyo.k-ba.com)
- 月額: 1,800〜1,980円
- データフォーマット: JRA-VAN DataLabとほぼ同一
- SDK: 個人開発用SDKは非公開。NV-Link（UmaConn）経由でデータ取得
- Windows COM経由（NV-Link）でデータ取得 → PostgreSQL等に保存

## データ取得方法
1. **NV-Link (UmaConn)**: Windows COM経由。JV-Linkの地方版。Pythonからはwin32comで呼び出し可能
2. **PC-KEIBA**: PostgreSQLにインポートするツール（月額980円追加でリアルタイムデータ対応）
3. **KEIBA DATA SCOPE**: CSV出力可能な分析ソフト

## データ構造（PC-KEIBA経由PostgreSQL取り込み時）
- テーブル名: JRA-VANの「jvd_」を「nvd_」に置換
  - nvd_ra: レース詳細（距離、競馬場、出走時刻、トラック、賞金）
  - nvd_se: 馬毎レース情報（騎手、調教師、馬主、負担重量、着順）
  - nvd_um: 競走馬マスタ（血統、プロフィール、性別、毛色）
  - nvd_ks: 騎手マスタ
  - nvd_ch: 調教師マスタ
  - nvd_hr: 払戻（オッズ結果）

## キーフィールド
- 開催年(kaisai_nen): 4桁 例:2026
- 開催月日(kaisai_tsukihi): 4桁 例:0805
- 競馬場コード(keibajo_code): 2桁
- レース番号(race_bango): 2桁
- 馬番(umaban): 2桁
- 血統登録番号(ketto_toroku_bango): 馬のPK

## 注意点
- 固定長データ: 数値は0埋め、文字列はスペース埋め
- リアルタイムデータ（馬体重、オッズ等）は別テーブル
- 地方競馬DATAにはレース開催スケジュール(ys)テーブルなし
- 脚質データなし（中央にはある）
- 中央所属馬のデータなし（交流戦で注意）

## Pythonからの利用方法
- Windows環境: win32com経由でNV-Link(UmaConn)を呼び出し
- Linux/サーバー環境: PC-KEIBA経由でPostgreSQLに取り込み済みデータをSQLで参照
- または: KEIBA DATA SCOPEでCSV出力→Pythonで読み込み

## 参考URL
- https://saikyo.k-ba.com/members/chihou/
- https://pc-keiba.com/wp/jv-link-install/
- https://developer.jra-van.jp/
- https://qiita.com/masachaco/items/5b3f4bcb3d133f2e6f5f
