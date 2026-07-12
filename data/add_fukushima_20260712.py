"""
福島競馬場 2026-07-12 レース結果を sample_races.csv に追記するスクリプト。
実際の全頭データが無いため、勝ち馬を中心に代表的なレコードを生成する。
（天候・馬場・距離・クラスの統計学習用データとして活用）
"""
from __future__ import annotations

import csv
import os
import random
from pathlib import Path

RANDOM_SEED = 42
random.seed(RANDOM_SEED)

CSV_PATH = Path(__file__).parent / "sample_races.csv"

# 福島2026-07-12 当日の天候・馬場条件（七夕賞当日）
WEATHER = "晴"
TRACK_MOISTURE = 0.04  # 良馬場

RACES = [
    {"race_id": "2026071201", "date": "2026-07-12", "course": "福島", "track_type": "芝",   "distance": 1200, "race_class": "未勝利",   "field_size": 16, "winner": "ノブダブルホワイト",  "winner_num": 3,  "trifecta": 48150},
    {"race_id": "2026071202", "date": "2026-07-12", "course": "福島", "track_type": "芝",   "distance": 1800, "race_class": "未勝利",   "field_size": 16, "winner": "ヒロイックヴァース",  "winner_num": 2,  "trifecta": 23280},
    {"race_id": "2026071203", "date": "2026-07-12", "course": "福島", "track_type": "ダート","distance": 1200, "race_class": "未勝利",   "field_size": 14, "winner": "チャンピオンホープ",  "winner_num": 9,  "trifecta": 5390},
    {"race_id": "2026071204", "date": "2026-07-12", "course": "福島", "track_type": "芝",   "distance": 1200, "race_class": "新馬",     "field_size": 12, "winner": "ラヴィサンエール",   "winner_num": 6,  "trifecta": 11420},
    {"race_id": "2026071205", "date": "2026-07-12", "course": "福島", "track_type": "芝",   "distance": 1800, "race_class": "新馬",     "field_size": 12, "winner": "リサナウト",        "winner_num": 12, "trifecta": 13120},
    {"race_id": "2026071206", "date": "2026-07-12", "course": "福島", "track_type": "ダート","distance": 1800, "race_class": "未勝利",   "field_size": 16, "winner": "ゴールドブレス",     "winner_num": 4,  "trifecta": 47440},
    {"race_id": "2026071207", "date": "2026-07-12", "course": "福島", "track_type": "ダート","distance": 1200, "race_class": "1勝クラス", "field_size": 14, "winner": "ニシノミニヨンヌ",   "winner_num": 1,  "trifecta": 33520},
    {"race_id": "2026071208", "date": "2026-07-12", "course": "福島", "track_type": "芝",   "distance": 2000, "race_class": "1勝クラス", "field_size": 14, "winner": "コスモカノア",       "winner_num": 11, "trifecta": 158400},
    {"race_id": "2026071209", "date": "2026-07-12", "course": "福島", "track_type": "芝",   "distance": 1800, "race_class": "1勝クラス", "field_size": 16, "winner": "エマヌエーレ",       "winner_num": 8,  "trifecta": 28900},
    {"race_id": "2026071210", "date": "2026-07-12", "course": "福島", "track_type": "ダート","distance": 1150, "race_class": "2勝クラス", "field_size": 16, "winner": "ミラーオブマインド",  "winner_num": 14, "trifecta": 89450},
    {"race_id": "2026071211", "date": "2026-07-12", "course": "福島", "track_type": "芝",   "distance": 2000, "race_class": "G3",       "field_size": 16, "winner": "アスクナイスショー",  "winner_num": 11, "trifecta": 223050},
    {"race_id": "2026071212", "date": "2026-07-12", "course": "福島", "track_type": "芝",   "distance": 1200, "race_class": "1勝クラス", "field_size": 14, "winner": "スマートアイ",       "winner_num": 5,  "trifecta": 54200},
]

JOCKEYS = [
    "川田将雅", "福永祐一", "武豊", "横山武史", "松山弘平",
    "石神深道", "丸田恭介", "永野猛蔵", "菅原明良", "木幡巧也",
    "三浦皇成", "柴田大知", "小林脩斗", "泉谷楓真", "岩田望来",
]

HEADER = [
    "race_id","date","course","track_type","distance","weather","track_moisture",
    "field_size","horse_id","horse_name","umaban","waku","sex","age","jockey",
    "weight_carried","horse_weight","horse_weight_diff","odds","popularity",
    "finish_pos","is_synthetic"
]


def generate_rows() -> list[dict]:
    rows = []
    for r in RACES:
        field = r["field_size"]
        # 勝ち馬のレコード
        winner_row = {
            "race_id": r["race_id"],
            "date": r["date"],
            "course": r["course"],
            "track_type": r["track_type"],
            "distance": r["distance"],
            "weather": WEATHER,
            "track_moisture": TRACK_MOISTURE,
            "field_size": field,
            "horse_id": f"h_{r['race_id']}_{r['winner_num']:02d}",
            "horse_name": r["winner"],
            "umaban": r["winner_num"],
            "waku": (r["winner_num"] - 1) // 2 + 1,
            "sex": random.choice(["牡", "牝", "セ"]),
            "age": random.randint(2, 6),
            "jockey": random.choice(JOCKEYS),
            "weight_carried": random.choice([54.0, 55.0, 56.0, 57.0, 58.0]),
            "horse_weight": random.randint(440, 520),
            "horse_weight_diff": random.randint(-8, 8),
            "odds": round(random.uniform(2.0, 30.0), 1),
            "popularity": random.randint(1, field),
            "finish_pos": 1,
            "is_synthetic": 1,
        }
        rows.append(winner_row)
        # 2〜3着馬（代表的な2頭）
        for pos in [2, 3]:
            num = (r["winner_num"] % field) + pos
            if num > field:
                num = num - field
            rows.append({
                "race_id": r["race_id"],
                "date": r["date"],
                "course": r["course"],
                "track_type": r["track_type"],
                "distance": r["distance"],
                "weather": WEATHER,
                "track_moisture": TRACK_MOISTURE,
                "field_size": field,
                "horse_id": f"h_{r['race_id']}_{num:02d}",
                "horse_name": f"馬{num:02d}_{r['race_id'][-2:]}",
                "umaban": num,
                "waku": (num - 1) // 2 + 1,
                "sex": random.choice(["牡", "牝", "セ"]),
                "age": random.randint(2, 6),
                "jockey": random.choice(JOCKEYS),
                "weight_carried": random.choice([54.0, 55.0, 56.0, 57.0, 58.0]),
                "horse_weight": random.randint(440, 520),
                "horse_weight_diff": random.randint(-8, 8),
                "odds": round(random.uniform(3.0, 80.0), 1),
                "popularity": random.randint(1, field),
                "finish_pos": pos,
                "is_synthetic": 1,
            })
    return rows


def main() -> None:
    rows = generate_rows()
    file_exists = CSV_PATH.exists()
    with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=HEADER)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)
    print(f"✅ {len(rows)} 行を {CSV_PATH} に追記しました（福島2026-07-12）")


if __name__ == "__main__":
    main()
