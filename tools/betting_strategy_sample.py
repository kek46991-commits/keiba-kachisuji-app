"""三連単ボックス／フォーメーションの自動切替サンプル。

アプリ本体（server/valueBetting.ts）と同じ判定基準を Python で再現した確認用スクリプト。
上位4頭のスコア差が SCORE_SPREAD_FOR_BOX 以内なら混戦とみなしてボックス、
それ以外は軸を固定したフォーメーションを選ぶ。
"""

import itertools

SCORE_SPREAD_FOR_BOX = 5
BOX_HORSE_COUNT = 4
SAMPLE_PRINT_LIMIT = 5


def generate_sanrentan_box(horse_list):
    """選んだ馬から3頭の全順列を作る（4頭なら 4P3 = 24点）。"""
    return list(itertools.permutations(horse_list, 3))


def generate_sanrentan_formation(first_candidates, second_candidates, third_candidates):
    """着順ごとの候補から、同一馬の重複を除いた買い目を作る。"""
    return [
        (f, s, t)
        for f in first_candidates
        for s in second_candidates
        for t in third_candidates
        if f != s and s != t and f != t
    ]


def select_race_condition(scored_horses):
    """スコア上位4頭の差から混戦（box）か軸明確（formation）かを判定する。"""
    ranked = sorted(scored_horses, key=lambda horse: horse["score"], reverse=True)
    if len(ranked) < BOX_HORSE_COUNT:
        return "formation", ranked, None
    spread = round(ranked[0]["score"] - ranked[BOX_HORSE_COUNT - 1]["score"], 1)
    condition = "box" if spread <= SCORE_SPREAD_FOR_BOX else "formation"
    return condition, ranked, spread


def select_betting_strategy(race_condition, data):
    if race_condition == "box":
        bets = generate_sanrentan_box(data["horses"])
        strategy_name = "三連単ボックス"
    elif race_condition == "formation":
        bets = generate_sanrentan_formation(data["first"], data["second"], data["third"])
        strategy_name = "三連単フォーメーション"
    else:
        bets = []
        strategy_name = "未定義"

    return {"strategy": strategy_name, "total_points": len(bets), "bets": bets}


def format_bet(bet):
    return f"1着[{bet[0]}] - 2着[{bet[1]}] - 3着[{bet[2]}]"


def print_result(result, limit=None):
    print(f"--- 選択方式: {result['strategy']} ({result['total_points']}点) ---")
    shown = result["bets"] if limit is None else result["bets"][:limit]
    for bet in shown:
        print(f"  買い目: {format_bet(bet)}")
    remaining = result["total_points"] - len(shown)
    if remaining > 0:
        print(f"  ... 他{remaining}点")


if __name__ == "__main__":
    tight_race = [
        {"horse": 1, "score": 63},
        {"horse": 2, "score": 61},
        {"horse": 3, "score": 58},
        {"horse": 4, "score": 58},
        {"horse": 5, "score": 50},
    ]
    clear_race = [
        {"horse": 1, "score": 90},
        {"horse": 2, "score": 78},
        {"horse": 3, "score": 70},
        {"horse": 4, "score": 62},
        {"horse": 5, "score": 55},
    ]

    for label, horses in (("混戦レース", tight_race), ("軸が明確なレース", clear_race)):
        condition, ranked, spread = select_race_condition(horses)
        numbers = [horse["horse"] for horse in ranked]
        data = {
            "horses": numbers[:BOX_HORSE_COUNT],
            "first": numbers[:1],
            "second": numbers[1:4],
            "third": numbers[1:5],
        }
        print(f"[{label}] 上位4頭のスコア差: {spread}")
        print_result(select_betting_strategy(condition, data), limit=SAMPLE_PRINT_LIMIT)
        print()
