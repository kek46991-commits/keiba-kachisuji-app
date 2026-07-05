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
from typing import Any

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
    "grade",            # G1 / G2 / G3 / OP
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
    if "grade" not in df.columns:
        df = df.copy()
        df["grade"] = "OP"
    missing = [c for c in RACE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"必須列が不足しています: {missing}")
    df = df[RACE_COLUMNS].copy()
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    df["grade"] = df["grade"].fillna("OP").astype(str)
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


def filter_grade(df: pd.DataFrame, grade: str = "G1") -> pd.DataFrame:
    """指定グレードのみを抽出する。"""
    coerced = _coerce_schema(df)
    grade = grade.upper()
    return coerced[coerced["grade"].astype(str).str.upper() == grade].copy()


# --------------------------------------------------------------------------- #
#  合成データ生成
# --------------------------------------------------------------------------- #
@dataclass
class _SyntheticHorse:
    horse_id: str
    name: str
    sex: str
    birth_year: int
    debut_year: int
    retirement_year: int
    ability: float          # 潜在的な基礎能力 (高いほど強い)
    surface_pref: dict       # {"芝": x, "ダート": y} 適性
    best_distance: int       # 最も得意な距離
    base_weight: float       # 標準馬体重
    g1_bias: float


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


def _build_g1_horse_pool(
    rng: np.random.Generator,
    n_horses: int,
    start_year: int,
    seasons: int,
) -> list[_SyntheticHorse]:
    horses: list[_SyntheticHorse] = []
    names_used: set[str] = set()
    for i in range(n_horses):
        # ユニークな馬名を作る (組合せが尽きたら連番を付与)。
        name = rng.choice(_SAMPLE_NAMES) + rng.choice(_SUFFIX)
        if name in names_used:
            name = f"{name}{i}"
        names_used.add(name)
        debut_year = start_year + int(rng.integers(0, max(seasons - 2, 1)))
        retirement_year = min(
            start_year + seasons - 1,
            debut_year + int(rng.integers(4, 8)),
        )
        surf_turf = float(rng.normal(0, 0.5))
        horses.append(
            _SyntheticHorse(
                horse_id=f"H{i:04d}",
                name=name,
                sex=str(rng.choice(["牡", "牝", "セ"], p=[0.55, 0.4, 0.05])),
                birth_year=debut_year - 3,
                debut_year=debut_year,
                retirement_year=retirement_year,
                ability=float(rng.normal(0.6, 0.8)),
                surface_pref={"芝": surf_turf, "ダート": -surf_turf},
                best_distance=int(rng.choice(DISTANCES)),
                base_weight=float(rng.normal(478, 24)),
                g1_bias=float(rng.normal(0.15, 0.12)),
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


def generate_g1_dataset(
    n_horses: int = 360,
    start_year: int = 2014,
    seasons: int = 10,
    races_per_season: int = 24,
    seed: int = 42,
) -> pd.DataFrame:
    """G1 専用の合成レースデータセットを生成する。"""
    n_horses = max(n_horses, seasons * 24)
    rng = np.random.default_rng(seed)
    horses = _build_g1_horse_pool(rng, n_horses, start_year, seasons)
    courses = list(COURSE_MAP.keys())

    rows: list[dict[str, Any]] = []
    race_idx = 0
    for season_idx in range(seasons):
        year = start_year + season_idx
        dates = pd.date_range(
            start=f"{year}-01-01",
            periods=races_per_season,
            freq=f"{max(12, 365 // races_per_season)}D",
        )
        for date_ts in dates:
            date = date_ts.strftime("%Y-%m-%d")
            course = str(rng.choice(courses))
            track_type = str(rng.choice(TRACK_TYPES, p=[0.68, 0.32]))
            distance = int(rng.choice(DISTANCES))
            weather = str(rng.choice(WEATHER_OPTIONS, p=[0.52, 0.22, 0.10, 0.10, 0.06]))
            moisture = round(float(np.clip(rng.normal(0.05, 0.04), 0.00, 0.22)), 2)
            field_size = int(rng.integers(16, 19))

            active = [h for h in horses if h.debut_year <= year <= h.retirement_year]
            if len(active) < field_size:
                active = horses
            weights = np.array(
                [np.exp(h.ability + h.g1_bias + 0.08 * (year - h.debut_year)) for h in active],
                dtype=float,
            )
            weights = weights / weights.sum()
            selected = rng.choice(len(active), size=field_size, replace=False, p=weights)
            runners = [active[i] for i in selected]

            utilities: list[float] = []
            meta: list[dict[str, Any]] = []
            for h in runners:
                age = year - h.birth_year
                distance_fit = 1.0 - abs(distance - h.best_distance) / 1600.0
                season_form = 0.12 * max(0, year - h.debut_year)
                strength = (
                    h.ability * 1.25
                    + h.g1_bias
                    + h.surface_pref[track_type]
                    + 0.9 * distance_fit
                    + season_form
                    - 0.5 * max(0, moisture - 0.10)
                    + float(rng.normal(0, 0.12))
                )
                utilities.append(strength)
                meta.append({
                    "h": h,
                    "age": age,
                    "hw": round(h.base_weight + float(rng.normal(0, 5)), 0),
                })

            utilities_arr = np.array(utilities)
            true_prob = np.exp(utilities_arr - utilities_arr.max())
            true_prob = true_prob / true_prob.sum()
            gumbel = rng.gumbel(size=len(utilities_arr))
            scores = utilities_arr + gumbel
            order = np.argsort(-scores)
            finish = np.empty(len(order), dtype=int)
            for pos, idx in enumerate(order):
                finish[idx] = pos + 1

            odds = [_odds_from_prob(p, rng) for p in true_prob]
            popularity = pd.Series(odds).rank(method="first").astype(int).tolist()
            wakus = np.array_split(np.arange(field_size), min(8, field_size))
            umaban_to_waku: dict[int, int] = {}
            for w, group in enumerate(wakus, start=1):
                for u in group:
                    umaban_to_waku[u + 1] = w

            race_id = f"{date}_{course}_G1_{race_idx + 1:03d}"
            for j, h in enumerate(runners):
                m = meta[j]
                umaban = j + 1
                rows.append({
                    "race_id": race_id,
                    "date": date,
                    "course": course,
                    "track_type": track_type,
                    "grade": "G1",
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
                    "weight_carried": round(float(np.clip(rng.normal(57.0, 1.2), 54, 60)), 1),
                    "horse_weight": m["hw"],
                    "horse_weight_diff": round(float(rng.normal(0, 5)), 0),
                    "odds": odds[j],
                    "popularity": int(popularity[j]),
                    "finish_pos": int(finish[j]),
                    "is_synthetic": 1,
                })
            race_idx += 1

    return _coerce_schema(pd.DataFrame(rows))


def generate_synthetic_dataset(
    n_horses: int = 360,
    n_races: int = 600,
    start_date: str = "2014-01-01",
    seed: int = 42,
    grade: str = "G1",
    seasons: int = 10,
    races_per_season: int = 24,
) -> pd.DataFrame:
    """検証用の合成レースデータセットを生成する。

    既定では G1 専用の多シーズンデータを返す。
    """
    if grade.upper() != "G1":
        raise ValueError("現在の合成データ生成は G1 専用です。")
    return generate_g1_dataset(
        n_horses=n_horses,
        start_year=pd.Timestamp(start_date).year,
        seasons=seasons,
        races_per_season=races_per_season,
        seed=seed,
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="G1 合成レースデータを生成して保存する")
    parser.add_argument("--out", default="data/sample_races.csv")
    parser.add_argument("--sqlite", default="data/cache/races.sqlite")
    parser.add_argument("--n-horses", type=int, default=400)
    parser.add_argument("--seasons", type=int, default=10)
    parser.add_argument("--races-per-season", type=int, default=24)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    data = generate_synthetic_dataset(
        n_horses=args.n_horses,
        seasons=args.seasons,
        races_per_season=args.races_per_season,
        seed=args.seed,
    )
    import os
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    save_races_csv(data, args.out)
    os.makedirs(os.path.dirname(args.sqlite) or ".", exist_ok=True)
    save_races_sqlite(data, args.sqlite)
    print(f"生成: {len(data)} 行 / {data['race_id'].nunique()} レース")
    print(f"CSV   -> {args.out}")
    print(f"SQLite-> {args.sqlite}")
