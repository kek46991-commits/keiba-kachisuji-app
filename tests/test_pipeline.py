# -*- coding: utf-8 -*-
"""データ→特徴量→モデル→バックテストのパイプラインと engine の単体テスト。"""

import numpy as np
import pandas as pd
import pytest

from data.fetch import RACE_COLUMNS, generate_synthetic_dataset
from features import FEATURE_COLUMNS, TARGET_COLUMN, build_features
from model import WinProbabilityModel, predict_race, train_from_races
from backtest import run_backtest, time_split
from engine import analyze_entries, calc_box_tickets, rate_expected_value, softmax


@pytest.fixture(scope="module")
def races():
    return generate_synthetic_dataset(n_horses=60, n_races=80, seed=1)


def test_synthetic_schema(races):
    assert list(races.columns) == RACE_COLUMNS
    assert races["is_synthetic"].eq(1).all()
    assert races["grade"].eq("G1").all()
    assert races["race_id"].nunique() >= 200
    assert races["field_size"].between(16, 18).all()
    # 各レースに 1 着が 1 頭だけ存在する。
    winners = races[races["finish_pos"] == 1].groupby("race_id").size()
    assert (winners == 1).all()
    assert (races["odds"] >= 1.0).all()


def test_features_no_leakage(races):
    feats = build_features(races)
    assert len(feats) == len(races)
    for c in FEATURE_COLUMNS + [TARGET_COLUMN]:
        assert c in feats.columns
    # 特徴量に欠損が残っていない。
    assert not feats[FEATURE_COLUMNS].isna().any().any()
    # オッズ・人気は特徴量に含まれない (市場情報リーク防止)。
    assert "odds" not in FEATURE_COLUMNS
    assert "popularity" not in FEATURE_COLUMNS

    # 初出走の馬は career_starts==0。
    first = feats.sort_values(["horse_id", "date"]).groupby("horse_id").head(1)
    assert (first["career_starts"] == 0).all()


def test_model_probs_sum_to_one(races):
    model = train_from_races(races)
    feats = build_features(races)
    feats["pred_win_prob"] = model.predict_win_prob(feats)
    sums = feats.groupby("race_id")["pred_win_prob"].sum()
    assert np.allclose(sums.values, 1.0, atol=1e-6)
    assert (feats["pred_win_prob"] >= 0).all()


def test_save_load_roundtrip(tmp_path, races):
    model = train_from_races(races)
    path = tmp_path / "m.pkl"
    model.save(str(path))
    loaded = WinProbabilityModel.load(str(path))
    feats = build_features(races)
    a = model.predict_win_prob(feats)
    b = loaded.predict_win_prob(feats)
    assert np.allclose(a.values, b.values)


def test_predict_race(races):
    model = train_from_races(races)
    rid = races["race_id"].iloc[-1]
    out = predict_race(model, races, rid)
    assert abs(out["pred_win_prob"].sum() - 1.0) < 1e-6
    assert (out["race_id"] == rid).all()


def test_time_split_ordering(races):
    train, valid, split = time_split(races, 0.7)
    assert pd.to_datetime(train["date"]).max() < pd.to_datetime(split)
    assert pd.to_datetime(valid["date"]).min() >= pd.to_datetime(split)


def test_backtest_runs(races):
    report = run_backtest(races, train_frac=0.7, ev_threshold=1.1, box_size=5)
    assert report.train_races >= 100
    assert report.valid_races >= 50
    df = report.to_frame()
    assert {"回収率%", "ROI%", "的中率"}.issubset(df.columns)
    # 回収率と ROI は整合する (ROI% = 回収率% - 100)。
    for _, row in df.iterrows():
        assert abs(row["ROI%"] - (row["回収率%"] - 100)) < 0.2


def test_rate_expected_value_thresholds():
    assert rate_expected_value(1.5).startswith("🔥")
    assert rate_expected_value(1.15).startswith("⭐")
    assert rate_expected_value(1.0).startswith("👀")
    assert rate_expected_value(0.85).startswith("△")
    assert rate_expected_value(0.5).startswith("✗")


def test_softmax_normalizes():
    p = softmax([1.0, 2.0, 3.0])
    assert abs(sum(p) - 1.0) < 1e-9
    assert p[2] > p[1] > p[0]


def test_analyze_entries_ev():
    res = analyze_entries(
        win_probs=[0.5, 0.3, 0.2],
        odds=[3.0, 2.0, 1.0],
        umaban=[1, 2, 3],
        names=["A", "B", "C"],
    )
    assert res[0].expected_value == 1.5
    assert res[0].win_prob == 0.5


def test_calc_box_tickets():
    assert calc_box_tickets(5, "三連複") == 10
    assert calc_box_tickets(5, "三連単") == 60
    assert calc_box_tickets(1, "馬連") == 0
