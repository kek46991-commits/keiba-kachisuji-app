# -*- coding: utf-8 -*-
"""バックテスト基盤。

過去データを学習期間 / 検証期間に時系列分割し、学習済みモデルの予測勝率に
基づく買い方の **的中率・回収率 (ROI)** を集計する。

回収率 (ROI) = (払戻総額 − 投資総額) / 投資総額。
ROI > 0 (= 回収率 100% 超) でなければ「儲かる」とは言えない。競馬は控除率が
約 20〜30% あるため、これを上回るのは容易でない点に注意 (README 参照)。

- 単勝系: 確定単勝オッズがあるため ROI を厳密に計算できる。
    * value      : 予測勝率×オッズ (期待値) が閾値超の馬を単勝で買う
    * top_pick   : 各レースで予測勝率最大の馬を単勝で買う
    * favorite   : 各レースで 1 番人気 (最低オッズ) を単勝で買う (ベースライン)
- ボックス系: ``calc_box_tickets`` で投資額を算出し、的中率を集計する。
    払戻 (ROI) には三連複等の配当データが必要なため、配当列があれば使い、
    無ければ的中率と投資額のみを報告する。
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from engine import calc_box_tickets
from features import build_features
from model import TrainConfig, WinProbabilityModel


@dataclass
class StrategyResult:
    name: str
    n_bets: int
    n_hits: int
    invested: float
    returned: float

    @property
    def hit_rate(self) -> float:
        return self.n_hits / self.n_bets if self.n_bets else 0.0

    @property
    def roi(self) -> float:
        return (self.returned - self.invested) / self.invested if self.invested else 0.0

    @property
    def recovery_rate(self) -> float:
        """回収率 (払戻 / 投資)。100% 超で黒字。"""
        return self.returned / self.invested if self.invested else 0.0

    def as_dict(self) -> dict:
        return {
            "戦略": self.name,
            "ベット数": self.n_bets,
            "的中数": self.n_hits,
            "的中率": round(self.hit_rate * 100, 1),
            "投資額": round(self.invested, 0),
            "払戻額": round(self.returned, 0),
            "回収率%": round(self.recovery_rate * 100, 1),
            "ROI%": round(self.roi * 100, 1),
        }


@dataclass
class BacktestReport:
    train_races: int
    valid_races: int
    split_date: str
    strategies: list[StrategyResult] = field(default_factory=list)
    box_summary: list[dict] = field(default_factory=list)

    def to_frame(self) -> pd.DataFrame:
        return pd.DataFrame([s.as_dict() for s in self.strategies])

    def box_frame(self) -> pd.DataFrame:
        return pd.DataFrame(self.box_summary)


# --------------------------------------------------------------------------- #
def time_split(df: pd.DataFrame, train_frac: float = 0.7) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    """開催日でソートし、前半 train_frac を学習・残りを検証に分割する。"""
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    dates = np.sort(df["date"].unique())
    split_idx = int(len(dates) * train_frac)
    split_date = pd.Timestamp(dates[split_idx])
    train = df[df["date"] < split_date]
    valid = df[df["date"] >= split_date]
    return train, valid, split_date.strftime("%Y-%m-%d")


def _win_strategies(valid: pd.DataFrame, ev_threshold: float,
                    unit: float = 100.0) -> list[StrategyResult]:
    """単勝系戦略の ROI を計算する。"""
    valid = valid.copy()
    valid["ev"] = valid["pred_win_prob"] * valid["odds"]
    valid["won"] = (valid["finish_pos"] == 1).astype(int)

    results: list[StrategyResult] = []

    # value: 期待値が閾値超の馬すべてを単勝で買う
    bets = valid[valid["ev"] >= ev_threshold]
    results.append(StrategyResult(
        name=f"単勝 value (EV>={ev_threshold})",
        n_bets=len(bets),
        n_hits=int(bets["won"].sum()),
        invested=len(bets) * unit,
        returned=float((bets["won"] * bets["odds"] * unit).sum()),
    ))

    # top_pick: 各レースで予測勝率最大の馬
    idx = valid.groupby("race_id")["pred_win_prob"].idxmax()
    top = valid.loc[idx]
    results.append(StrategyResult(
        name="単勝 top_pick (予測1位)",
        n_bets=len(top),
        n_hits=int(top["won"].sum()),
        invested=len(top) * unit,
        returned=float((top["won"] * top["odds"] * unit).sum()),
    ))

    # favorite: 各レースで 1 番人気 (最低オッズ)
    idx_fav = valid.groupby("race_id")["odds"].idxmin()
    fav = valid.loc[idx_fav]
    results.append(StrategyResult(
        name="単勝 favorite (1番人気・基準)",
        n_bets=len(fav),
        n_hits=int(fav["won"].sum()),
        invested=len(fav) * unit,
        returned=float((fav["won"] * fav["odds"] * unit).sum()),
    ))
    return results


def _box_summary(valid: pd.DataFrame, box_size: int, unit: float = 100.0) -> list[dict]:
    """予測上位 box_size 頭でボックスを買った場合の的中率・投資額。

    配当 (三連複/馬連) 列があれば払戻・ROI も計算する:
        - trio_payout : 三連複配当 (100 円あたり)
        - quinella_payout : 馬連配当 (100 円あたり)
    無ければ的中率と投資額のみ報告する。
    """
    rows: list[dict] = []
    bet_specs = [
        ("三連複", 3, "trio_payout"),
        ("馬連", 2, "quinella_payout"),
    ]
    for bet_type, k_finish, payout_col in bet_specs:
        n_races = 0
        n_hits = 0
        invested = 0.0
        returned = 0.0
        has_payout = payout_col in valid.columns
        for race_id, g in valid.groupby("race_id"):
            if len(g) < box_size:
                continue
            n_races += 1
            picks = set(g.nlargest(box_size, "pred_win_prob")["umaban"])
            winners = set(g[g["finish_pos"] <= k_finish]["umaban"])
            tickets = calc_box_tickets(box_size, bet_type)
            invested += tickets * unit
            hit = winners.issubset(picks) and len(winners) == k_finish
            if hit:
                n_hits += 1
                if has_payout:
                    returned += float(g[payout_col].iloc[0]) / 100.0 * unit
        row = {
            "馬券種": bet_type,
            "選択頭数": box_size,
            "点数/レース": calc_box_tickets(box_size, bet_type),
            "対象レース": n_races,
            "的中数": n_hits,
            "的中率%": round(n_hits / n_races * 100, 1) if n_races else 0.0,
            "投資額": round(invested, 0),
        }
        if has_payout:
            row["払戻額"] = round(returned, 0)
            row["回収率%"] = round(returned / invested * 100, 1) if invested else 0.0
        else:
            row["払戻額"] = "配当データなし"
            row["回収率%"] = "—"
        rows.append(row)
    return rows


def run_backtest(
    races_df: pd.DataFrame,
    train_frac: float = 0.7,
    ev_threshold: float = 1.1,
    box_size: int = 5,
    config: TrainConfig | None = None,
) -> BacktestReport:
    """学習 → 検証 → 集計までを実行してレポートを返す。"""
    train_raw, valid_raw, split_date = time_split(races_df, train_frac)

    # 特徴量は全期間の履歴を使って構築 (各行は過去のみ参照するためリークしない)。
    feats_all = build_features(races_df)
    feats_all["date"] = pd.to_datetime(feats_all["date"])
    split_ts = pd.Timestamp(split_date)
    feats_train = feats_all[feats_all["date"] < split_ts]
    feats_valid = feats_all[feats_all["date"] >= split_ts].copy()

    model = WinProbabilityModel(config).fit(feats_train)
    feats_valid["pred_win_prob"] = model.predict_win_prob(feats_valid)

    report = BacktestReport(
        train_races=int(train_raw["race_id"].nunique()),
        valid_races=int(valid_raw["race_id"].nunique()),
        split_date=split_date,
    )
    report.strategies = _win_strategies(feats_valid, ev_threshold)
    report.box_summary = _box_summary(feats_valid, box_size)
    return report


if __name__ == "__main__":
    import argparse

    from data.fetch import generate_synthetic_dataset, load_races_csv

    parser = argparse.ArgumentParser(description="バックテストを実行する")
    parser.add_argument("--csv", default=None, help="レース CSV (省略時は合成データ)")
    parser.add_argument("--train-frac", type=float, default=0.7)
    parser.add_argument("--ev-threshold", type=float, default=1.1)
    parser.add_argument("--box-size", type=int, default=5)
    args = parser.parse_args()

    races = load_races_csv(args.csv) if args.csv else generate_synthetic_dataset()
    report = run_backtest(
        races, train_frac=args.train_frac,
        ev_threshold=args.ev_threshold, box_size=args.box_size,
    )
    print(f"学習レース数={report.train_races} / 検証レース数={report.valid_races} "
          f"(分割日={report.split_date})\n")
    print("=== 単勝系戦略 ===")
    print(report.to_frame().to_string(index=False))
    print("\n=== ボックス系 (予測上位ボックス) ===")
    print(report.box_frame().to_string(index=False))
    print("\n注: 回収率 100% 超でなければ利益は出ない。控除率を考慮すること。")
