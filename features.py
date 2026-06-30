# -*- coding: utf-8 -*-
"""特徴量エンジニアリング。

``data.fetch`` のロングフォーマット (1 行 = 1 頭出走) から、各出走時点で
**そのレースより前にしか得られない情報** のみを使って特徴量を生成する
(リーク防止)。過去成績・距離適性・競馬場適性・馬場/天候・斤量などを扱う。

重要: 確定オッズ (``odds``) と人気 (``popularity``) は **特徴量に含めない**。
モデルがファンダメンタルズだけで勝率を予測し、その予測を市場オッズと突き合わせて
「市場が見落とす価値 (期待値 > 1)」を探せるようにするため。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# 馬場種別・性別の数値エンコード。
_SURFACE_CODE = {"芝": 0, "ダート": 1}
_SEX_CODE = {"牡": 0, "牝": 1, "セ": 2}

# モデルに渡す特徴量列 (オッズ・人気は意図的に除外)。
FEATURE_COLUMNS: list[str] = [
    "distance",
    "track_type_code",
    "track_moisture",
    "field_size",
    "umaban",
    "waku",
    "sex_code",
    "age",
    "weight_carried",
    "horse_weight",
    "horse_weight_diff",
    "career_starts",
    "career_win_rate",
    "career_top3_rate",
    "career_avg_finish",
    "recent_win_rate",
    "recent_avg_finish",
    "days_since_last",
    "course_win_rate",
    "surface_win_rate",
    "distance_win_rate",
    "prev_finish_pos",
]

TARGET_COLUMN = "is_win"

# 距離適性を見るためのバケット (短/マ/中/長距離)。
_DIST_BINS = [0, 1400, 1800, 2200, 9999]


def _expanding_rate(df: pd.DataFrame, by: list[str], value: pd.Series) -> pd.Series:
    """``by`` でグルーピングし、当該行を除いた累積平均を返す (リーク防止)。"""
    grp = value.groupby([df[c] for c in by])
    cum = grp.cumsum() - value
    cnt = grp.cumcount()
    return (cum / cnt.replace(0, np.nan)).astype(float)


def build_features(df: pd.DataFrame, recent_n: int = 5) -> pd.DataFrame:
    """レースデータから特徴量行列 (+ 目的変数) を構築する。

    返り値は入力と同じ行順・行数で、``FEATURE_COLUMNS`` と
    ``TARGET_COLUMN`` を含む。オッズ・人気・レース識別子も検証用に温存する。
    """
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    # 出走順 (履歴計算の時系列キー)。同日内は race_id, umaban で安定化。
    df = df.sort_values(["horse_id", "date", "race_id", "umaban"]).reset_index(drop=True)

    win = (df["finish_pos"] == 1).astype(float)
    top3 = (df["finish_pos"] <= 3).astype(float)
    df["dist_bin"] = pd.cut(df["distance"], bins=_DIST_BINS, labels=False)

    # --- 基本エンコード ---
    df["track_type_code"] = df["track_type"].map(_SURFACE_CODE).fillna(0).astype(int)
    df["sex_code"] = df["sex"].map(_SEX_CODE).fillna(0).astype(int)

    # --- 通算成績 (当該レースを除外) ---
    g = df.groupby("horse_id")
    df["career_starts"] = g.cumcount()
    df["career_win_rate"] = _expanding_rate(df, ["horse_id"], win)
    df["career_top3_rate"] = _expanding_rate(df, ["horse_id"], top3)

    cum_finish = g["finish_pos"].cumsum() - df["finish_pos"]
    df["career_avg_finish"] = (cum_finish / df["career_starts"].replace(0, np.nan)).astype(float)

    # --- 直近 recent_n 走 ---
    df["recent_win_rate"] = (
        g["finish_pos"].transform(
            lambda s: (s.eq(1)).shift().rolling(recent_n, min_periods=1).mean()
        )
    ).astype(float)
    df["recent_avg_finish"] = (
        g["finish_pos"].transform(
            lambda s: s.shift().rolling(recent_n, min_periods=1).mean()
        )
    ).astype(float)

    # --- 休養 (前走からの日数) ---
    df["days_since_last"] = g["date"].diff().dt.days.astype(float)

    # --- 条件別 (競馬場 / 馬場 / 距離帯) 勝率 ---
    df["course_win_rate"] = _expanding_rate(df, ["horse_id", "course"], win)
    df["surface_win_rate"] = _expanding_rate(df, ["horse_id", "track_type"], win)
    df["distance_win_rate"] = _expanding_rate(df, ["horse_id", "dist_bin"], win)

    # --- 前走着順 ---
    df["prev_finish_pos"] = g["finish_pos"].shift().astype(float)

    df[TARGET_COLUMN] = win.astype(int)

    # 初出走などで履歴が無い箇所を中立値で補完。
    fill_defaults = {
        "career_win_rate": 0.0,
        "career_top3_rate": 0.0,
        "career_avg_finish": df["field_size"].astype(float) / 2.0,
        "recent_win_rate": 0.0,
        "recent_avg_finish": df["field_size"].astype(float) / 2.0,
        "days_since_last": 60.0,
        "course_win_rate": 0.0,
        "surface_win_rate": 0.0,
        "distance_win_rate": 0.0,
        "prev_finish_pos": df["field_size"].astype(float) / 2.0,
        "horse_weight_diff": 0.0,
    }
    for col, default in fill_defaults.items():
        df[col] = df[col].fillna(default)

    return df


def split_xy(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """特徴量 X と目的変数 y を取り出す。"""
    return df[FEATURE_COLUMNS].astype(float), df[TARGET_COLUMN].astype(int)
