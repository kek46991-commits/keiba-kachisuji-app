"""
福島競馬場 2026-07-12 全12レース結果をDBに投入するスクリプト。
Vercelの本番DBに直接投入するためにDATABASE_URL環境変数が必要。
"""
from __future__ import annotations

import os
import sys

RACE_RESULTS = [
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 1,
        "race_name": "2歳未勝利",
        "race_class": "未勝利",
        "distance": 1200,
        "track_type": "芝",
        "winner_horse": "ノブダブルホワイト",
        "winner_number": 3,
        "trifecta_payout_yen": 48150,
        "note": "3連複は5,710円",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 2,
        "race_name": "3歳未勝利",
        "race_class": "未勝利",
        "distance": 1800,
        "track_type": "芝",
        "winner_horse": "ヒロイックヴァース",
        "winner_number": 2,
        "trifecta_payout_yen": 23280,
        "note": "2着に15番人気が激走",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 3,
        "race_name": "3歳未勝利",
        "race_class": "未勝利",
        "distance": 1200,
        "track_type": "ダート",
        "winner_horse": "チャンピオンホープ",
        "winner_number": 9,
        "trifecta_payout_yen": 5390,
        "note": "堅めの決着",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 4,
        "race_name": "メイクデビュー福島",
        "race_class": "新馬",
        "distance": 1200,
        "track_type": "芝",
        "winner_horse": "ラヴィサンエール",
        "winner_number": 6,
        "trifecta_payout_yen": 11420,
        "note": "石神深道騎手が勝利",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 5,
        "race_name": "メイクデビュー福島",
        "race_class": "新馬",
        "distance": 1800,
        "track_type": "芝",
        "winner_horse": "リサナウト",
        "winner_number": 12,
        "trifecta_payout_yen": 13120,
        "note": "1番人気に応えて快勝",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 6,
        "race_name": "3歳未勝利",
        "race_class": "未勝利",
        "distance": 1800,
        "track_type": "ダート",
        "winner_horse": "ゴールドブレス",
        "winner_number": 4,
        "trifecta_payout_yen": 47440,
        "note": "中位人気が絡んで好配当",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 7,
        "race_name": "3歳以上1勝クラス",
        "race_class": "1勝クラス",
        "distance": 1200,
        "track_type": "ダート",
        "winner_horse": "ニシノミニヨンヌ",
        "winner_number": 1,
        "trifecta_payout_yen": 33520,
        "note": "牝馬限定のダート戦",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 8,
        "race_name": "3歳以上1勝クラス",
        "race_class": "1勝クラス",
        "distance": 2000,
        "track_type": "芝",
        "winner_horse": "コスモカノア",
        "winner_number": 11,
        "trifecta_payout_yen": 158400,
        "note": "伏兵が絡んで万馬券",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 9,
        "race_name": "織姫賞",
        "race_class": "1勝クラス",
        "distance": 1800,
        "track_type": "芝",
        "winner_horse": "エマヌエーレ",
        "winner_number": 8,
        "trifecta_payout_yen": 28900,
        "note": "芝1800mのハンデ戦",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 10,
        "race_name": "鶴ヶ城特別",
        "race_class": "2勝クラス",
        "distance": 1150,
        "track_type": "ダート",
        "winner_horse": "ミラーオブマインド",
        "winner_number": 14,
        "trifecta_payout_yen": 89450,
        "note": "ダート1150mの短距離戦",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 11,
        "race_name": "七夕賞",
        "race_class": "G3",
        "distance": 2000,
        "track_type": "芝",
        "winner_horse": "アスクナイスショー",
        "winner_number": 11,
        "trifecta_payout_yen": 223050,
        "note": "15番人気の激走で大波乱！",
    },
    {
        "race_date": "2026-07-12",
        "venue": "福島",
        "race_num": 12,
        "race_name": "3歳以上1勝クラス",
        "race_class": "1勝クラス",
        "distance": 1200,
        "track_type": "芝",
        "winner_horse": "スマートアイ",
        "winner_number": 5,
        "trifecta_payout_yen": 54200,
        "note": "最終レースもきっちり好配当",
    },
]


def ensure_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS race_results (
            id SERIAL PRIMARY KEY,
            race_date DATE NOT NULL,
            venue TEXT NOT NULL,
            race_num INTEGER NOT NULL,
            race_name TEXT NOT NULL,
            race_class TEXT,
            distance INTEGER,
            track_type TEXT,
            winner_horse TEXT NOT NULL,
            winner_number INTEGER,
            trifecta_payout_yen INTEGER,
            note TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(race_date, venue, race_num)
        )
        """
    )


def insert_results(cur) -> int:
    inserted = 0
    for r in RACE_RESULTS:
        cur.execute(
            """
            INSERT INTO race_results (
                race_date, venue, race_num, race_name, race_class,
                distance, track_type, winner_horse, winner_number,
                trifecta_payout_yen, note
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (race_date, venue, race_num) DO UPDATE SET
                race_name = EXCLUDED.race_name,
                race_class = EXCLUDED.race_class,
                distance = EXCLUDED.distance,
                track_type = EXCLUDED.track_type,
                winner_horse = EXCLUDED.winner_horse,
                winner_number = EXCLUDED.winner_number,
                trifecta_payout_yen = EXCLUDED.trifecta_payout_yen,
                note = EXCLUDED.note
            """,
            (
                r["race_date"],
                r["venue"],
                r["race_num"],
                r["race_name"],
                r["race_class"],
                r["distance"],
                r["track_type"],
                r["winner_horse"],
                r["winner_number"],
                r["trifecta_payout_yen"],
                r["note"],
            ),
        )
        inserted += 1
    return inserted


def main() -> None:
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        print("❌ DATABASE_URL が設定されていません。")
        sys.exit(1)

    try:
        import psycopg  # type: ignore[import-not-found]
    except ImportError:
        print("❌ psycopg が未インストールです。pip install psycopg[binary] を実行してください。")
        sys.exit(1)

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            print("📋 race_results テーブルを確認・作成中...")
            ensure_table(cur)
            print("📥 レース結果データを投入中...")
            count = insert_results(cur)
        conn.commit()
    print(f"✅ {count} 件のレース結果を投入しました！")


if __name__ == "__main__":
    main()
