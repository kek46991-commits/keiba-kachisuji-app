#!/usr/bin/env python3
"""yoso.json に出馬表(shutuba)・コース情報(course)を追加するスクリプト"""
import json
from pathlib import Path

DATA_PATH = Path("web/data/yoso.json")
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

# =====================================================================
# 小倉記念 出馬表（枠番・馬番・馬名・騎手・斤量）
# ハンデ戦のため斤量は仮定値（公式発表前）
# =====================================================================
kokura_shutuba = [
    {"waku": 1, "num": 1,  "name": "ジョバンニ",        "jockey": "J.コレット",  "kg": 57.0, "weight": "—", "odds": "—"},
    {"waku": 1, "num": 2,  "name": "ガイアメンテ",       "jockey": "川田将雅",    "kg": 57.5, "weight": "—", "odds": "—"},
    {"waku": 2, "num": 3,  "name": "レーゼドラマ",       "jockey": "松若風馬",    "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 2, "num": 4,  "name": "タガノアビー",       "jockey": "幸英明",      "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 3, "num": 5,  "name": "ジーティーアダマン",  "jockey": "松山弘平",    "kg": 57.0, "weight": "—", "odds": "—"},
    {"waku": 3, "num": 6,  "name": "エヒト",             "jockey": "未定",        "kg": 56.0, "weight": "—", "odds": "—"},
    {"waku": 4, "num": 7,  "name": "サフィラ",           "jockey": "西村淳也",    "kg": 53.0, "weight": "—", "odds": "—"},
    {"waku": 4, "num": 8,  "name": "アスクナイスショー",  "jockey": "田辺裕信",    "kg": 55.0, "weight": "—", "odds": "—"},
    {"waku": 5, "num": 9,  "name": "カエルム",           "jockey": "M.デムーロ",  "kg": 56.0, "weight": "—", "odds": "—"},
    {"waku": 5, "num": 10, "name": "マイネルメモリー",    "jockey": "菱田裕二",    "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 6, "num": 11, "name": "ナヴォーナ",         "jockey": "未定",        "kg": 55.0, "weight": "—", "odds": "—"},
    {"waku": 6, "num": 12, "name": "ウエストナウ",       "jockey": "高杉吏麒",    "kg": 55.0, "weight": "—", "odds": "—"},
    {"waku": 7, "num": 13, "name": "カネフラ",           "jockey": "永島まなみ",  "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 7, "num": 14, "name": "コパノサントス",     "jockey": "藤懸貴志",    "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 7, "num": 15, "name": "テーオーソラネル",   "jockey": "田口貫太",    "kg": 55.0, "weight": "—", "odds": "—"},
    {"waku": 8, "num": 16, "name": "トータルクラリティ", "jockey": "国分優作",    "kg": 55.0, "weight": "—", "odds": "—"},
    {"waku": 8, "num": 17, "name": "ゼンダンハヤブサ",   "jockey": "酒井学",      "kg": 55.0, "weight": "—", "odds": "—"},
    {"waku": 8, "num": 18, "name": "ナムラエイハブ",     "jockey": "田山旺佑",    "kg": 55.0, "weight": "—", "odds": "—"},
    {"waku": 8, "num": 19, "name": "ノーランサンライズ",  "jockey": "未定",        "kg": 53.0, "weight": "—", "odds": "—"},
    {"waku": 8, "num": 20, "name": "ケイズレーヴ",       "jockey": "渡辺竜也",    "kg": 56.0, "weight": "—", "odds": "—"},
]

kokura_course = {
    "venue": "小倉競馬場",
    "track": "芝2000m（右回り・Aコース）",
    "distance": 2000,
    "direction": "右回り",
    "surface": "芝",
    "course_code": "A",
    "notes": "ハンデ戦",
    "start_time": "15:45",
    "svg_id": "kokura2000",
    "description": "小倉芝2000mは向正面スタート。最初のコーナーまでの距離が約600mと長く、先行争いが激化しやすい。3〜4コーナーは緩やかなカーブで、直線は約293mと短め。先行・差し共に決まるが、猛暑時は逃げ・先行有利の傾向。Aコース使用で内ラチ沿いが良好。",
    "course_points": [
        {"label": "スタート", "note": "向正面・2コーナー付近"},
        {"label": "1コーナーまで", "note": "約600m。先行争い激化"},
        {"label": "3〜4コーナー", "note": "緩やかなカーブ。外枠不利"},
        {"label": "直線", "note": "約293m。短い直線で差し切り困難"},
    ],
    "bias": [
        {"key": "先行", "val": "◎", "note": "良馬場・猛暑で有利"},
        {"key": "差し", "val": "○", "note": "展開次第"},
        {"key": "追込", "val": "△", "note": "直線短く不利"},
        {"key": "逃げ", "val": "○", "note": "ペース次第"},
    ],
    "past_winners": [
        {"year": 2025, "name": "ルージュリナージュ", "jockey": "戸崎圭太", "kg": 54},
        {"year": 2024, "name": "サヴォーナ",         "jockey": "岩田望来",  "kg": 57},
        {"year": 2023, "name": "エヒト",             "jockey": "藤岡佑介",  "kg": 56},
    ],
}

# =====================================================================
# 函館2歳ステークス 出馬表（馬齢戦・全馬54kg）
# =====================================================================
hakodate_shutuba = [
    {"waku": 1, "num": 1,  "name": "シグレ",           "jockey": "武豊",       "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 1, "num": 2,  "name": "ロンドンガーズ",    "jockey": "北村友一",   "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 2, "num": 3,  "name": "ダイメイビッグボス","jockey": "横山武史",   "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 2, "num": 4,  "name": "ショウナンカノア",  "jockey": "池添謙一",   "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 3, "num": 5,  "name": "ノリヤンモーニン",  "jockey": "浜中俊",     "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 3, "num": 6,  "name": "フェリチタ",        "jockey": "横山和生",   "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 4, "num": 7,  "name": "イモージェン",      "jockey": "佐々木大輔", "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 4, "num": 8,  "name": "クロリス",          "jockey": "岩田康誠",   "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 5, "num": 9,  "name": "アルテクィーン",    "jockey": "鮫島克駿",   "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 5, "num": 10, "name": "ダイシンドラゴン",  "jockey": "丹内祐次",   "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 6, "num": 11, "name": "ウンスイ",          "jockey": "横山琉人",   "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 6, "num": 12, "name": "セタキト",          "jockey": "斎藤新",     "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 7, "num": 13, "name": "ダマスク",          "jockey": "黛弘人",     "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 7, "num": 14, "name": "アイルドフルール",  "jockey": "未定",       "kg": 54.0, "weight": "—", "odds": "—"},
    {"waku": 8, "num": 15, "name": "フレイコン",        "jockey": "未定",       "kg": 54.0, "weight": "—", "odds": "—"},
]

hakodate_course = {
    "venue": "函館競馬場",
    "track": "芝1200m（右回り）",
    "distance": 1200,
    "direction": "右回り",
    "surface": "芝",
    "course_code": "",
    "notes": "2歳馬齢戦",
    "start_time": "15:20",
    "svg_id": "hakodate1200",
    "description": "函館芝1200mは向正面スタート。直線は約262mと短く、スピードと先行力が問われる。函館は洋芝でクッション性が高く、パワー型の馬が活躍しやすい。2歳戦は前走函館・札幌で好走した馬が有利で、初めて函館を走る馬は割引。良馬場では先行馬が圧倒的に有利。",
    "course_points": [
        {"label": "スタート", "note": "向正面・2コーナー付近"},
        {"label": "3〜4コーナー", "note": "緩やかなカーブ。洋芝で力が必要"},
        {"label": "直線", "note": "約262m。短く先行有利"},
    ],
    "bias": [
        {"key": "先行", "val": "◎", "note": "直線短く圧倒的有利"},
        {"key": "逃げ", "val": "○", "note": "ペース次第で残る"},
        {"key": "差し", "val": "△", "note": "展開が向けば"},
        {"key": "追込", "val": "×", "note": "直線短く不利"},
    ],
    "past_winners": [
        {"year": 2025, "name": "エイシンディード", "jockey": "石橋脩",   "kg": 54},
        {"year": 2024, "name": "サトノカルナバル", "jockey": "C.ルメール","kg": 54},
        {"year": 2023, "name": "ゼルトザーム",     "jockey": "岩田康誠",  "kg": 54},
    ],
}

# =====================================================================
# データを注入
# =====================================================================
for race in data["races"]:
    if race["id"] == "kokura":
        race["shutuba"] = kokura_shutuba
        race["course"] = kokura_course
    elif race["id"] == "hakodate":
        race["shutuba"] = hakodate_shutuba
        race["course"] = hakodate_course

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("✅ yoso.json 更新完了")

# 検証
data2 = json.loads(DATA_PATH.read_text(encoding="utf-8"))
for race in data2["races"]:
    shutuba = race.get("shutuba", [])
    course = race.get("course", {})
    print(f"  {race['name']}: shutuba={len(shutuba)}頭, course={bool(course)}")
