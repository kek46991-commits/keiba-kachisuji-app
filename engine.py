# -*- coding: utf-8 -*-
"""勝ち筋解析エンジン - かずさん理論 + 物理統計"""

import random
from dataclasses import dataclass, field
from typing import Optional


COURSE_MAP = {
    "東京": {"corner_r": 1.5, "straight": 525, "slope": True, "label": "東京競馬場"},
    "阪神": {"corner_r": 1.2, "straight": 473, "slope": True, "label": "阪神競馬場"},
    "京都": {"corner_r": 1.3, "straight": 404, "slope": False, "label": "京都競馬場"},
    "中山": {"corner_r": 1.1, "straight": 310, "slope": True, "label": "中山競馬場"},
    "中京": {"corner_r": 1.25, "straight": 412, "slope": True, "label": "中京競馬場"},
    "新潟": {"corner_r": 1.6, "straight": 659, "slope": False, "label": "新潟競馬場"},
    "小倉": {"corner_r": 1.0, "straight": 293, "slope": False, "label": "小倉競馬場"},
    "札幌": {"corner_r": 1.15, "straight": 266, "slope": False, "label": "札幌競馬場"},
    "函館": {"corner_r": 1.05, "straight": 262, "slope": False, "label": "函館競馬場"},
    "福島": {"corner_r": 1.1, "straight": 292, "slope": False, "label": "福島競馬場"},
}

WEATHER_OPTIONS = ["晴", "曇", "小雨", "雨", "大雨"]
TRACK_TYPES = ["芝", "ダート"]
DISTANCES = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2500, 3000, 3200, 3600]


@dataclass
class EnvironmentData:
    temp: float = 22.0
    humidity: float = 55.0
    track_cond: float = 0.04
    weather: str = "晴"
    track_type: str = "芝"
    distance: int = 2000


@dataclass
class PaddockData:
    stride_angle_y: float = 0.5
    bounce_factor: float = 0.5
    after_poop_relax: bool = False
    coat_shine: float = 0.5
    sweat_level: float = 0.3
    ear_movement: float = 0.5


@dataclass
class HorseEntry:
    umaban: int = 1
    name: str = ""
    odds: float = 10.0
    paddock: PaddockData = field(default_factory=PaddockData)


@dataclass
class AnalysisResult:
    umaban: int
    name: str
    odds: float
    base_score: float
    physics_bonus: float
    condition_bonus: float
    total_score: float
    win_prob: float
    expected_value: float
    rating: str
    details: list[str] = field(default_factory=list)


def analyze_horse(
    horse: HorseEntry,
    env: EnvironmentData,
    location: str,
) -> AnalysisResult:
    """1頭の馬を解析して期待値を算出する。"""
    course = COURSE_MAP[location]
    r_val = course["corner_r"]
    ai = horse.paddock
    details: list[str] = []

    # --- 基礎点 ---
    base_score = 60.0

    # --- 物理補正 ---
    physics_bonus = 0.0

    # コーナーR値 × ストライド横振り幅
    stride_corner = ai.stride_angle_y * 40 * r_val
    physics_bonus += stride_corner
    details.append(f"ストライド×コーナーR補正: +{stride_corner:.1f}")

    # 直線の長さ補正（長い直線ほどストライドが活きる）
    straight_bonus = (course["straight"] / 500) * ai.stride_angle_y * 10
    physics_bonus += straight_bonus
    details.append(f"直線距離補正: +{straight_bonus:.1f}")

    # 坂の有無と弾み
    if course["slope"] and ai.bounce_factor > 0.6:
        slope_bonus = ai.bounce_factor * 8
        physics_bonus += slope_bonus
        details.append(f"坂路適性（弾み）: +{slope_bonus:.1f}")

    # --- コンディション補正 ---
    condition_bonus = 0.0

    # 気温×弾み相関
    if env.temp < 15 and ai.bounce_factor > 0.7:
        cold_bonus = 15.0
        condition_bonus += cold_bonus
        details.append("低温×高弾み: +15.0")

    # ボロ後リラックス
    if ai.after_poop_relax:
        condition_bonus += 10.0
        details.append("ボロ後リラックス: +10.0")

    # 毛艶
    if ai.coat_shine > 0.7:
        shine_bonus = ai.coat_shine * 8
        condition_bonus += shine_bonus
        details.append(f"毛艶良好: +{shine_bonus:.1f}")

    # 発汗（多すぎはマイナス）
    if ai.sweat_level > 0.7:
        sweat_penalty = -10.0
        condition_bonus += sweat_penalty
        details.append("過度な発汗: -10.0")
    elif ai.sweat_level < 0.2:
        condition_bonus += 5.0
        details.append("適度な落ち着き: +5.0")

    # 耳の動き（集中度）
    if ai.ear_movement > 0.7:
        ear_bonus = ai.ear_movement * 6
        condition_bonus += ear_bonus
        details.append(f"高集中（耳の動き）: +{ear_bonus:.1f}")

    # 馬場状態の影響
    if env.track_cond > 0.10:
        # 重馬場ペナルティ（ダートは影響少ない）
        mud_factor = -8.0 if env.track_type == "芝" else -3.0
        condition_bonus += mud_factor
        details.append(f"馬場悪化: {mud_factor:.1f}")

    # --- 合計 ---
    total_score = base_score + physics_bonus + condition_bonus
    total_score = max(0.0, min(150.0, total_score))

    win_prob = total_score / 150.0
    expected_value = win_prob * horse.odds

    # レーティング
    if expected_value >= 3.0:
        rating = "🔥 激アツ・勝ち筋確定"
    elif expected_value >= 2.0:
        rating = "⭐ 高期待値・要注目"
    elif expected_value >= 1.5:
        rating = "👀 やや有望"
    elif expected_value >= 1.0:
        rating = "△ 普通"
    else:
        rating = "✗ 見送り推奨"

    return AnalysisResult(
        umaban=horse.umaban,
        name=horse.name,
        odds=horse.odds,
        base_score=base_score,
        physics_bonus=round(physics_bonus, 2),
        condition_bonus=round(condition_bonus, 2),
        total_score=round(total_score, 2),
        win_prob=round(win_prob, 4),
        expected_value=round(expected_value, 2),
        rating=rating,
        details=details,
    )


def calc_box_tickets(horse_count: int, bet_type: str = "三連単") -> int:
    """ボックス買い目の点数を計算する。"""
    n = horse_count
    if bet_type == "三連単":
        return n * (n - 1) * (n - 2) if n >= 3 else 0
    elif bet_type == "三連複":
        if n < 3:
            return 0
        return n * (n - 1) * (n - 2) // 6
    elif bet_type == "馬連":
        if n < 2:
            return 0
        return n * (n - 1) // 2
    elif bet_type == "馬単":
        if n < 2:
            return 0
        return n * (n - 1)
    elif bet_type == "ワイド":
        if n < 2:
            return 0
        return n * (n - 1) // 2
    return 0


def generate_sample_horses(count: int = 5) -> list[HorseEntry]:
    """サンプル馬データを生成する。"""
    names = [
        "サクラバクシンオー", "ディープインパクト", "オルフェーヴル",
        "キタサンブラック", "イクイノックス", "ドウデュース",
        "リバティアイランド", "ジャスティンミラノ", "レガレイラ",
        "シンエンペラー", "ダノンデサイル", "アーバンシック",
        "ジャンタルマンタル", "テンハッピーローズ", "ブローザホーン",
        "ベラジオオペラ", "タスティエーラ", "ソールオリエンス",
    ]
    horses = []
    for i in range(count):
        name = names[i % len(names)]
        horses.append(
            HorseEntry(
                umaban=i + 1,
                name=name,
                odds=round(random.uniform(1.5, 80.0), 1),
                paddock=PaddockData(
                    stride_angle_y=round(random.uniform(0.3, 1.0), 2),
                    bounce_factor=round(random.uniform(0.2, 1.0), 2),
                    after_poop_relax=random.choice([True, False]),
                    coat_shine=round(random.uniform(0.2, 1.0), 2),
                    sweat_level=round(random.uniform(0.0, 1.0), 2),
                    ear_movement=round(random.uniform(0.2, 1.0), 2),
                ),
            )
        )
    return horses
