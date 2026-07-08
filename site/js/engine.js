// 勝ち筋解析エンジン - かずさん理論 + 物理統計 (JavaScript版)

export const COURSE_MAP = {
  "東京": { corner_r: 1.5, straight: 525, slope: true, label: "東京競馬場" },
  "阪神": { corner_r: 1.2, straight: 473, slope: true, label: "阪神競馬場" },
  "京都": { corner_r: 1.3, straight: 404, slope: false, label: "京都競馬場" },
  "中山": { corner_r: 1.1, straight: 310, slope: true, label: "中山競馬場" },
  "中京": { corner_r: 1.25, straight: 412, slope: true, label: "中京競馬場" },
  "新潟": { corner_r: 1.6, straight: 659, slope: false, label: "新潟競馬場" },
  "小倉": { corner_r: 1.0, straight: 293, slope: false, label: "小倉競馬場" },
  "札幌": { corner_r: 1.15, straight: 266, slope: false, label: "札幌競馬場" },
  "函館": { corner_r: 1.05, straight: 262, slope: false, label: "函館競馬場" },
  "福島": { corner_r: 1.1, straight: 292, slope: false, label: "福島競馬場" },
};

export const WEATHER_OPTIONS = ["晴", "曇", "小雨", "雨", "大雨"];
export const TRACK_TYPES = ["芝", "ダート"];
export const DISTANCES = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2500, 3000, 3200, 3600];

export const WEATHER_MOISTURE = { "晴": 0.04, "曇": 0.06, "小雨": 0.10, "雨": 0.15, "大雨": 0.22 };

// 単勝の控除率 (JRA 標準)。EV=1.0 が損益分岐点。
export const WIN_TAKEOUT = 0.20;
export const EV_BET_THRESHOLD = 1.1;

// 期待値(回収率)を控除率を踏まえて判定する。engine.py の rate_expected_value と一致。
export function rateExpectedValue(ev) {
  if (ev >= 1.3) return "🔥 妙味大・強い買い";
  if (ev >= EV_BET_THRESHOLD) return "⭐ 期待値あり・買い";
  if (ev >= 1.0) return "👀 損益分岐付近・小口";
  if (ev >= 1.0 - WIN_TAKEOUT) return "△ 控除率相当・見送り寄り";
  return "✗ 期待値不足・見送り";
}

const HORSE_NAMES = [
  "サクラバクシンオー", "ディープインパクト", "オルフェーヴル",
  "キタサンブラック", "イクイノックス", "ドウデュース",
  "リバティアイランド", "ジャスティンミラノ", "レガレイラ",
  "シンエンペラー", "ダノンデサイル", "アーバンシック",
  "ジャンタルマンタル", "テンハッピーローズ", "ブローザホーン",
  "ベラジオオペラ", "タスティエーラ", "ソールオリエンス",
];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round(v, d = 2) {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

// 1頭の馬を解析して期待値を算出する。
export function analyzeHorse(horse, env, location) {
  const course = COURSE_MAP[location];
  const r_val = course.corner_r;
  const ai = horse.paddock;
  const details = [];

  // --- 基礎点 ---
  const base_score = 60.0;

  // --- 物理補正 ---
  let physics_bonus = 0.0;

  const stride_corner = ai.stride_angle_y * 40 * r_val;
  physics_bonus += stride_corner;
  details.push(`ストライド×コーナーR補正: +${stride_corner.toFixed(1)}`);

  const straight_bonus = (course.straight / 500) * ai.stride_angle_y * 10;
  physics_bonus += straight_bonus;
  details.push(`直線距離補正: +${straight_bonus.toFixed(1)}`);

  if (course.slope && ai.bounce_factor > 0.6) {
    const slope_bonus = ai.bounce_factor * 8;
    physics_bonus += slope_bonus;
    details.push(`坂路適性（弾み）: +${slope_bonus.toFixed(1)}`);
  }

  // --- コンディション補正 ---
  let condition_bonus = 0.0;

  if (env.temp < 15 && ai.bounce_factor > 0.7) {
    condition_bonus += 15.0;
    details.push("低温×高弾み: +15.0");
  }

  if (ai.after_poop_relax) {
    condition_bonus += 10.0;
    details.push("ボロ後リラックス: +10.0");
  }

  if (ai.coat_shine > 0.7) {
    const shine_bonus = ai.coat_shine * 8;
    condition_bonus += shine_bonus;
    details.push(`毛艶良好: +${shine_bonus.toFixed(1)}`);
  }

  if (ai.sweat_level > 0.7) {
    condition_bonus += -10.0;
    details.push("過度な発汗: -10.0");
  } else if (ai.sweat_level < 0.2) {
    condition_bonus += 5.0;
    details.push("適度な落ち着き: +5.0");
  }

  if (ai.ear_movement > 0.7) {
    const ear_bonus = ai.ear_movement * 6;
    condition_bonus += ear_bonus;
    details.push(`高集中（耳の動き）: +${ear_bonus.toFixed(1)}`);
  }

  if (env.track_cond > 0.10) {
    const mud_factor = env.track_type === "芝" ? -8.0 : -3.0;
    condition_bonus += mud_factor;
    details.push(`馬場悪化: ${mud_factor.toFixed(1)}`);
  }

  // --- 合計 ---
  let total_score = base_score + physics_bonus + condition_bonus;
  total_score = clamp(total_score, 0.0, 150.0);

  // 暫定の勝率 (レース内 softmax 正規化前)。analyzeRace で正規化する。
  const win_prob = total_score / 150.0;
  const expected_value = win_prob * horse.odds;

  return {
    umaban: horse.umaban,
    name: horse.name,
    odds: horse.odds,
    base_score,
    physics_bonus: round(physics_bonus),
    condition_bonus: round(condition_bonus),
    total_score: round(total_score),
    win_prob: round(win_prob, 4),
    expected_value: round(expected_value),
    rating: rateExpectedValue(expected_value),
    details,
  };
}

// レース全体を解析し、勝率を softmax でレース内合計1に正規化してから
// 期待値・判定を再計算する。Python パイプラインの正規化方針に合わせた実装。
export function analyzeRace(horses, env, location) {
  const raw = horses.map((h) => analyzeHorse(h, env, location));
  // total_score を logit 代わりに使い softmax。スケールで尖り過ぎないよう調整。
  const scores = raw.map((r) => r.total_score / 15.0);
  const m = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return raw.map((r, i) => {
    const win_prob = exps[i] / sum;
    const expected_value = win_prob * r.odds;
    return {
      ...r,
      win_prob: round(win_prob, 4),
      expected_value: round(expected_value),
      rating: rateExpectedValue(expected_value),
      details: [
        ...r.details,
        `予測勝率(レース内正規化): ${(win_prob * 100).toFixed(1)}%`,
        `期待値(回収率): ${expected_value.toFixed(2)} (損益分岐 1.0 / 控除率 ${(WIN_TAKEOUT * 100).toFixed(0)}%)`,
      ],
    };
  });
}

// ボックス買い目の点数を計算する。
export function calcBoxTickets(n, betType = "三連単") {
  switch (betType) {
    case "三連単":
      return n >= 3 ? n * (n - 1) * (n - 2) : 0;
    case "三連複":
      return n >= 3 ? (n * (n - 1) * (n - 2)) / 6 : 0;
    case "馬連":
      return n >= 2 ? (n * (n - 1)) / 2 : 0;
    case "馬単":
      return n >= 2 ? n * (n - 1) : 0;
    case "ワイド":
      return n >= 2 ? (n * (n - 1)) / 2 : 0;
    default:
      return 0;
  }
}

function randUniform(lo, hi) {
  return Math.random() * (hi - lo) + lo;
}

// サンプル馬データを生成する。
export function generateSampleHorses(count = 5) {
  const horses = [];
  for (let i = 0; i < count; i++) {
    horses.push({
      umaban: i + 1,
      name: HORSE_NAMES[i % HORSE_NAMES.length],
      odds: round(randUniform(1.5, 80.0), 1),
      paddock: {
        stride_angle_y: round(randUniform(0.3, 1.0)),
        bounce_factor: round(randUniform(0.2, 1.0)),
        after_poop_relax: Math.random() < 0.5,
        coat_shine: round(randUniform(0.2, 1.0)),
        sweat_level: round(randUniform(0.0, 1.0)),
        ear_movement: round(randUniform(0.2, 1.0)),
      },
    });
  }
  return horses;
}

export function emptyHorse(umaban) {
  return {
    umaban,
    name: `馬${umaban}`,
    odds: 10.0,
    paddock: {
      stride_angle_y: 0.5,
      bounce_factor: 0.5,
      after_poop_relax: false,
      coat_shine: 0.5,
      sweat_level: 0.3,
      ear_movement: 0.5,
    },
  };
}

export function babaLabel(track_cond) {
  if (track_cond <= 0.05) return "良";
  if (track_cond <= 0.10) return "稍重";
  if (track_cond <= 0.18) return "重";
  return "不良";
}
