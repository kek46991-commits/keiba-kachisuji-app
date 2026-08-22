# JRA-VAN Data Lab. 公式連携メモ

確認日: 2026-08-12

## 確認結果

- JRA-VAN Data Lab. は、公式ページ上で **Windowsパソコン向け** サービスとして案内されている。
- 公式のリアルタイムオッズは、JV-Link を利用する対応ソフト向けのデータ提供である。
- Data Lab. の利用には会員の **利用キー** と Windows 上の JV-Link 設定が必要である。
- 現在のWebアプリ実行環境はLinuxであり、Windows COM ベースのJV-Linkを直接実行できない。
- 現セッションにJRA-VAN用コネクタやAPI資格情報は設定されていない。

## 実装方針

Webアプリ本体には、公式JV-Linkを実行できるWindows側の小さなブリッジから、検証済みJSON/CSVを受け付けて `race_odds` にUPSERTする受信口を実装する。

Windowsブリッジは、利用者自身のData Lab.利用キーでJV-Linkから公式オッズを取得し、共有シークレットでWebアプリへ送信する。Webアプリ側は利用キーを受け取らず、クライアント側にも公開しない。

## 参考

- https://jra-van.jp/dlb/
- https://developer.jra-van.jp/
- https://developer.jra-van.jp/t/topic/701
