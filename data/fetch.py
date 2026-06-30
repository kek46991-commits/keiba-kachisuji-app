# -*- coding: utf-8 -*-
"""過去レースデータの取得・保存モジュール。

このモジュールは「出走表 + 確定結果 + 確定オッズ」を 1 行 = 1 頭 (出走) の
ロングフォーマットで扱う。実データソース (JRA / netkeiba 等) のスクレイピングは
利用規約・法的にグレーかつ安定取得が難しいため、本リポジトリでは

1. 同一スキーマのローカル CSV / SQLite を読み込む正式インターフェース
2. パイプライン全体を初期状態で検証可能にするための **合成データ生成器**
   (実データではなくダミーである旨を ``is_synthetic`` 列で明示)

の 2 つを提供する。実データを使う場合は ``RACE_COLUMNS`` と同じ列を持つ CSV を
用意して ``load_races_csv`` に渡すだけでよい。
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

import numpy as np
import pandas as pd

# 競馬場・距離・馬場種別はエンジン側の定義を流用する。
from engine import COURSE_MAP, DISTANCES, TRACK_TYPES, WEATHER_OPTIONS

# 1 レース 1 頭あたりの正準スキーマ。実データもこの列を満たすこと。
RACE_COLUMNS: list[str] = [
    "race_id",          # レース識別子 (例: 2024-05-26_東京_11)
    "date",             # 開催日 (YYYY-MM-DD)
    "course",           # 競馬場 (COURSE_MAP のキー)
    "track_type",       # 芝 / ダート
    "distance",         # 距離 (m)
    "weather",          # 天候
    "track_moisture",   # 馬場含水率 (0.0-0.3 程度)
    "field_size",       # 出走頭数
    "horse_id",         # 馬識別子
    "horse_name",       # 馬名
    "umaban",           # 馬番
    "waku",             # 枠番
    "sex",              # 性別 (牡/牝/セ)
    "age",              # 馬齢
    "jockey",           # 騎手
    "weight_carried",   # 斤量 (kg)
    "horse_weight",     # 馬体重 (kg)
    "horse_weight_diff",# 馬体重増減 (kg)
    "odds",             # 確定単勝オッズ
    "popularity",       # 単勝人気 (1=1番人気)
    "finish_pos",       # 確定着順 (1=1着)
    "is_synthetic",     # 合成データなら 1、実データなら 0
]

# 単勝の控除率 (JRA の標準的な値)。合成オッズ生成・バックテストの基準に使う。
WIN_TAKEOUT = 0.20


# --------------------------------------------------------------------------- #
#  入出力
# --------------------------------------------------------------------------- #
def _coerce_schema(df: pd.DataFrame) -> pd.DataFrame:
    """列の過不足を検証し、型を揃えて返す。"""
    missing = [c for c in RACE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"必須列が不足しています: {missing}")
    df = df[RACE_COLUMNS].copy()
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    int_cols = ["distance", "field_size", "umaban", "waku", "age",
                "popularity", "finish_pos", "is_synthetic"]
    for c in int_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce").astype("Int64")
    float_cols = ["track_moisture", "weight_carried", "horse_weight",
                  "horse_weight_diff", "odds"]
    for c in float_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
    return df


def load_races_csv(path: str) -> pd.DataFrame:
    """CSV からレースデータを読み込む。"""
    return _coerce_schema(pd.read_csv(path))


def save_races_csv(df: pd.DataFrame, path: str) -> None:
    """レースデータを CSV に保存する。"""
    _coerce_schema(df).to_csv(path, index=False)


def load_races_sqlite(path: str, table: str = "races") -> pd.DataFrame:
    """SQLite からレースデータを読み込む。"""
    with sqlite3.connect(path) as conn:
        df = pd.read_sql_query(f"SELECT * FROM {table}", conn)
    return _coerce_schema(df)


def save_races_sqlite(df: pd.DataFrame, path: str, table: str = "races") -> None:
    """レースデータを SQLite に保存する。"""
    with sqlite3.connect(path) as conn:
        _coerce_schema(df).to_sql(table, conn, if_exists="replace", index=False)


# --------------------------------------------------------------------------- #
#  合成データ生成
# --------------------------------------------------------------------------- #
@dataclass
class _SyntheticHorse:
    horse_id: str
    name: str
    sex: str
    birth_year: int
    ability: float          # 潜在的な基礎能力 (高いほど強い)
    surface_pref: dict       # {"芝": x, "ダート": y} 適性
    best_distance: int       # 最も得意な距離
    base_weight: float       # 標準馬体重


_SAMPLE_NAMES = [
    "サクラ", "ディープ", "オルフェ", "キタサン", "イクイ", "ドウデュース",
    "リバティ", "ジャスティン", "レガレイラ", "シンエンペラー", "ダノン",
    "アーバン", "ジャンタル", "テンハッピー", "ブローザ", "ベラジオ",
    "タスティ", "ソール", "ナミュール", "プログノ", "ステラ", "ハヤ",
    "ミカ", "ノース", "サウス", "イースト", "ウエスト", "セントラル",
]
_SUFFIX = ["オー", "インパクト", "ブラック", "ノックス", "アイランド", "ミラノ",
           "ホーン", "オペラ", "エリーゼ", "ロード", "クイーン", "キング"]
_JOCKEYS = ["ルメール", "川田", "武豊", "横山武", "戸崎", "松山", "坂井",
            "岩田望", "菅原明", "西村", "横山和", "鮫島駿"]


def _build_horse_pool(rng: np.random.Generator, n_horses: int,
                      start_year: int) -> list[_SyntheticHorse]:
    horses: list[_SyntheticHorse] = []
    names_used: set[str] = set()
    for i in range(n_horses):
        # ユニークな馬名を作る (組合せが尽きたら連番を付与)。
        name = rng.choice(_SAMPLE_NAMES) + rng.choice(_SUFFIX)
        if name in names_used:
            name = f"{name}{i}"
        names_used.add(name)
        surf_turf = float(rng.normal(0, 0.5))
        horses.append(
            _SyntheticHorse(
                horse_id=f"H{i:04d}",
                name=name,
                sex=str(rng.choice(["牡", "牝", "セ"], p=[0.55, 0.4, 0.05])),
                birth_year=start_year - int(rng.integers(2, 5)),
                ability=float(rng.normal(0.0, 1.0)),
                surface_pref={"芝": surf_turf, "ダート": -surf_turf},
                best_distance=int(rng.choice(DISTANCES)),
                base_weight=float(rng.normal(480, 25)),
            )
        )
    return horses


def _odds_from_prob(prob: float, rng: np.random.Generator) -> float:
    """真の勝率から、控除率とブックメーカー誤差を加味した確定オッズを作る。"""
    prob = min(max(prob, 1e-3), 0.99)
    # 市場は真の確率を歪めて見積もる (人気の偏り)。
    noisy = prob * float(rng.lognormal(0.0, 0.25))
    noisy = min(max(noisy, 1e-3), 0.99)
    fair_odds = 1.0 / noisy
    odds = fair_odds * (1.0 - WIN_TAKEOUT)  # 控除率の分だけ払戻しは下がる
    return round(max(1.0, odds), 1)


def generate_synthetic_dataset(
    n_horses: int = 400,
    n_races: int = 600,
    start_date: str = "2023-01-01",
    seed: int = 42,
) -> pd.DataFrame:
    """検証用の合成レースデータセットを生成する。

    各馬は潜在能力・馬場適性・得意距離を持ち、出走時の着順は
    Plackett-Luce 型 (能力 + ノイズの Gumbel サンプリング) で決まる。
    オッズは真の勝率を歪めたうえで控除率を引いて生成するため、
    「市場が見落とす価値」を学習・検証できる構造になっている。

    返り値は ``RACE_COLUMNS`` に従うロングフォーマット DataFrame。
    すべて ``is_synthetic = 1``。
    """
    rng = np.random.default_rng(seed)
    horses = _build_horse_pool(rng, n_horses, pd.Timestamp(start_date).year)
    courses = list(COURSE_MAP.keys())
    base = pd.Timestamp(start_date)

    rows: list[dict] = []
    for r in range(n_races):
        date = (base + pd.Timedelta(days=int(r * 7 / 3))).strftime("%Y-%m-%d")
        course = str(rng.choice(courses))
        track_type = str(rng.choice(TRACK_TYPES, p=[0.65, 0.35]))
        distance = int(rng.choice(DISTANCES))
        weather = str(rng.choice(WEATHER_OPTIONS, p=[0.5, 0.25, 0.12, 0.1, 0.03]))
        moisture = round(float(np.clip(rng.normal(0.06, 0.05), 0.01, 0.30)), 2)
        field_size = int(rng.integers(8, 19))

        runners = rng.choice(len(horses), size=field_size, replace=False)
        race_id = f"{date}_{course}_{r % 12 + 1}"

        # --- 各馬の出走時の真の強さ (latent utility) ---
        utilities: list[float] = []
        meta: list[dict] = []
        for h_idx in runners:
            h = horses[h_idx]
            age = pd.Timestamp(date).year - h.birth_year
            dist_gap = abs(distance - h.best_distance) / 800.0
            strength = (
                h.ability
                + h.surface_pref[track_type]
                - dist_gap
                - 0.15 * max(0, moisture - 0.10) * 10  # 重馬場はやや平準化
                + float(rng.normal(0, 0.15))            # 当日変動
            )
            utilities.append(strength)
            hw = round(h.base_weight + float(rng.normal(0, 6)), 0)
            meta.append({"h": h, "age": age, "hw": hw})

        utilities_arr = np.array(utilities)
        # 真の勝率 (softmax) → オッズ生成に使う。
        true_prob = np.exp(utilities_arr) / np.exp(utilities_arr).sum()

        # Plackett-Luce: Gumbel ノイズで着順を決める。
        gumbel = rng.gumbel(size=len(utilities_arr))
        scores = utilities_arr + gumbel
        order = np.argsort(-scores)  # 大きいほど上位
        finish = np.empty(len(order), dtype=int)
        for pos, idx in enumerate(order):
            finish[idx] = pos + 1

        odds = [_odds_from_prob(p, rng) for p in true_prob]
        popularity = (pd.Series(odds).rank(method="first").astype(int)).tolist()

        wakus = np.array_split(np.arange(field_size), min(8, field_size))
        umaban_to_waku = {}
        for w, group in enumerate(wakus, start=1):
            for u in group:
                umaban_to_waku[u + 1] = w

        for j, h_idx in enumerate(runners):
            m = meta[j]
            h = m["h"]
            umaban = j + 1
            rows.append({
                "race_id": race_id,
                "date": date,
                "course": course,
                "track_type": track_type,
                "distance": distance,
                "weather": weather,
                "track_moisture": moisture,
                "field_size": field_size,
                "horse_id": h.horse_id,
                "horse_name": h.name,
                "umaban": umaban,
                "waku": umaban_to_waku[umaban],
                "sex": h.sex,
                "age": m["age"],
                "jockey": str(rng.choice(_JOCKEYS)),
                "weight_carried": round(float(np.clip(rng.normal(56, 1.5), 50, 60)), 1),
                "horse_weight": m["hw"],
                "horse_weight_diff": round(float(rng.normal(0, 6)), 0),
                "odds": odds[j],
                "popularity": int(popularity[j]),
                "finish_pos": int(finish[j]),
                "is_synthetic": 1,
            })

    df = pd.DataFrame(rows)
    return _coerce_schema(df)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="合成レースデータを生成して保存する")
    parser.add_argument("--out", default="data/sample_races.csv")
    parser.add_argument("--sqlite", default="data/cache/races.sqlite")
    parser.add_argument("--n-horses", type=int, default=400)
    parser.add_argument("--n-races", type=int, default=600)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    data = generate_synthetic_dataset(
        n_horses=args.n_horses, n_races=args.n_races, seed=args.seed
    )
    import os
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    save_races_csv(data, args.out)
    os.makedirs(os.path.dirname(args.sqlite) or ".", exist_ok=True)
    save_races_sqlite(data, args.sqlite)
    print(f"生成: {len(data)} 行 / {data['race_id'].nunique()} レース")
    print(f"CSV   -> {args.out}")
    print(f"SQLite-> {args.sqlite}")
