# -*- coding: utf-8 -*-
"""勝率予測モデル。

各馬が「そのレースで 1 着になる」確率を学習する二値分類器を訓練し、
推論時には **レース単位で softmax 正規化** して出走馬の勝率合計が 1 になる
ようにする (経験則の ``total_score / 150`` を置き換える正式な確率)。

LightGBM が利用可能ならそれを使い、無い環境では scikit-learn の
勾配ブースティングへ自動的にフォールバックする。
"""

from __future__ import annotations

import pickle
from dataclasses import dataclass

import numpy as np
import pandas as pd

from data.fetch import filter_grade
from features import FEATURE_COLUMNS, build_features, split_xy

try:  # LightGBM は任意依存。無ければ sklearn にフォールバック。
    import lightgbm as lgb
    _HAS_LGB = True
except Exception:  # pragma: no cover - 環境依存
    _HAS_LGB = False

from sklearn.ensemble import GradientBoostingClassifier


def _softmax(x: np.ndarray) -> np.ndarray:
    x = x - np.max(x)
    e = np.exp(x)
    return e / e.sum()


@dataclass
class TrainConfig:
    learning_rate: float = 0.05
    n_estimators: int = 300
    num_leaves: int = 31
    max_depth: int = -1
    min_child_samples: int = 30
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    random_state: int = 42


class WinProbabilityModel:
    """1 着確率を予測し、レース内で正規化して返すモデル。"""

    def __init__(self, config: TrainConfig | None = None):
        self.config = config or TrainConfig()
        self.model = None
        self.backend = "lightgbm" if _HAS_LGB else "sklearn"
        self.feature_columns = list(FEATURE_COLUMNS)

    # ------------------------------------------------------------------ #
    def fit(self, features_df: pd.DataFrame) -> "WinProbabilityModel":
        """``build_features`` 済みの DataFrame で学習する。"""
        X, y = split_xy(features_df)
        c = self.config
        if self.backend == "lightgbm":
            self.model = lgb.LGBMClassifier(
                objective="binary",
                learning_rate=c.learning_rate,
                n_estimators=c.n_estimators,
                num_leaves=c.num_leaves,
                max_depth=c.max_depth,
                min_child_samples=c.min_child_samples,
                subsample=c.subsample,
                colsample_bytree=c.colsample_bytree,
                random_state=c.random_state,
                verbosity=-1,
            )
            self.model.fit(X, y)
        else:  # pragma: no cover - フォールバック経路
            self.model = GradientBoostingClassifier(
                learning_rate=c.learning_rate,
                n_estimators=c.n_estimators,
                max_depth=3,
                subsample=c.subsample,
                random_state=c.random_state,
            )
            self.model.fit(X, y)
        return self

    # ------------------------------------------------------------------ #
    def _raw_logits(self, X: pd.DataFrame) -> np.ndarray:
        """各行の生 logit (log-odds) を返す。"""
        if self.backend == "lightgbm":
            return self.model.predict(X, raw_score=True)
        p = self.model.predict_proba(X)[:, 1]
        p = np.clip(p, 1e-6, 1 - 1e-6)
        return np.log(p / (1 - p))

    def predict_win_prob(self, features_df: pd.DataFrame) -> pd.Series:
        """レース単位で softmax 正規化した勝率を返す (合計 1 / レース)。"""
        if self.model is None:
            raise RuntimeError("モデルが未学習です。fit() を呼んでください。")
        X = features_df[self.feature_columns].astype(float)
        logits = self._raw_logits(X)
        out = pd.Series(index=features_df.index, dtype=float)
        for _, idx in features_df.groupby("race_id").groups.items():
            out.loc[idx] = _softmax(logits[features_df.index.get_indexer(idx)])
        return out

    def feature_importance(self) -> pd.Series:
        """特徴量重要度を返す。"""
        if self.model is None:
            raise RuntimeError("モデルが未学習です。")
        if self.backend == "lightgbm":
            imp = self.model.feature_importances_
        else:  # pragma: no cover
            imp = self.model.feature_importances_
        return pd.Series(imp, index=self.feature_columns).sort_values(ascending=False)

    # ------------------------------------------------------------------ #
    def save(self, path: str) -> None:
        with open(path, "wb") as f:
            pickle.dump(
                {"model": self.model, "backend": self.backend,
                 "feature_columns": self.feature_columns, "config": self.config},
                f,
            )

    @classmethod
    def load(cls, path: str) -> "WinProbabilityModel":
        with open(path, "rb") as f:
            blob = pickle.load(f)
        obj = cls(config=blob.get("config"))
        obj.model = blob["model"]
        obj.backend = blob["backend"]
        obj.feature_columns = blob["feature_columns"]
        return obj


def train_from_races(races_df: pd.DataFrame,
                     config: TrainConfig | None = None,
                     grade: str | None = None) -> WinProbabilityModel:
    """生レースデータから特徴量生成 → 学習までを一括で行う。

    grade が None の場合は全クラスを学習対象にする（未勝利・重賞含む）。
    grade="G1" を指定すると G1 のみに絞る。
    """
    from data.fetch import _coerce_schema
    if grade is not None:
        filtered = filter_grade(races_df, grade)
    else:
        filtered = _coerce_schema(races_df)  # 全クラス
    if filtered.empty:
        raise ValueError(f"学習データが空です（grade={grade}）")
    feats = build_features(filtered)
    return WinProbabilityModel(config).fit(feats)


def predict_race(model: WinProbabilityModel, history_df: pd.DataFrame,
                 race_id: str) -> pd.DataFrame:
    """履歴込みデータから特定レースの予測勝率を付与して返す。

    ``history_df`` には対象レースと、その馬たちの過去走を含む全データを渡す
    (特徴量は過去のみ参照するため対象レースの結果は使われない)。
    返り値は対象レースの行に ``pred_win_prob`` 列を加えたもの。
    """
    feats = build_features(filter_grade(history_df, "G1"))
    race = feats[feats["race_id"] == race_id].copy()
    if race.empty:
        raise ValueError(f"race_id が見つかりません: {race_id}")
    race["pred_win_prob"] = model.predict_win_prob(race)
    return race.sort_values("umaban")


if __name__ == "__main__":
    import argparse
    import os

    from data.fetch import generate_synthetic_dataset, load_races_csv

    parser = argparse.ArgumentParser(description="勝率予測モデルを学習して保存する")
    parser.add_argument("--csv", default=None, help="学習用レース CSV (省略時は合成データ)")
    parser.add_argument("--out", default="data/cache/model.pkl")
    args = parser.parse_args()

    races = load_races_csv(args.csv) if args.csv else generate_synthetic_dataset()
    model = train_from_races(races, grade=None)  # 全クラス学習
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    model.save(args.out)
    print(f"backend={model.backend} / 学習行数={len(races)}")
    print("特徴量重要度 (上位10):")
    print(model.feature_importance().head(10).to_string())
    print(f"保存 -> {args.out}")
