/**
 * パドック体調判断エンジン（Shen AI的アプローチ）
 * 
 * 中医学の「望診」の考え方を馬に応用し、外見的な兆候から体調を総合判断するシステム。
 * 
 * 四診法を馬に適用:
 * - 神（しん）= 目の輝き・集中力 → 精神状態
 * - 気 = 歩様・筋肉の張り → エネルギー状態
 * - 血 = 毛艶・心拍数 → 循環状態
 * - 津液 = 体重・発汗バランス → 水分代謝
 */

interface PaddockInput {
  heartRate?: number;
  horseWeight?: number;
  weightDiff?: number;
  sweatLevel?: number;
  gaitScore?: number;
  eyeBrightness?: number;
  excitementLevel?: number;
  concentrationLevel?: number;
  obedienceLevel?: number;
  fatigueLevel?: number;
  preEjaculation?: number;
  coatSheen?: number;
  muscleTone?: number;
}

/**
 * Shen AI体調スコアを計算 (0-100)
 */
export function calculateShenConditionScore(obs: PaddockInput): number {
  // === 1. 神（精神状態）スコア: 30% ===
  let shenScore = 0;
  let shenCount = 0;

  if (obs.eyeBrightness) {
    shenScore += (obs.eyeBrightness - 1) * 25;
    shenCount++;
  }
  if (obs.concentrationLevel) {
    shenScore += (obs.concentrationLevel - 1) * 25;
    shenCount++;
  }
  if (obs.excitementLevel) {
    // 2-3が最適: 適度な闘志
    const excMap: Record<number, number> = { 1: 40, 2: 90, 3: 100, 4: 60, 5: 20 };
    shenScore += excMap[obs.excitementLevel] ?? 50;
    shenCount++;
  }
  if (obs.obedienceLevel) {
    shenScore += (obs.obedienceLevel - 1) * 25;
    shenCount++;
  }
  const shenAvg = shenCount > 0 ? shenScore / shenCount : 50;

  // === 2. 気（エネルギー状態）スコア: 30% ===
  let qiScore = 0;
  let qiCount = 0;

  if (obs.gaitScore) {
    qiScore += (obs.gaitScore - 1) * 25;
    qiCount++;
  }
  if (obs.muscleTone) {
    qiScore += (obs.muscleTone - 1) * 25;
    qiCount++;
  }
  if (obs.fatigueLevel) {
    qiScore += (5 - obs.fatigueLevel) * 25; // 逆転
    qiCount++;
  }
  const qiAvg = qiCount > 0 ? qiScore / qiCount : 50;

  // === 3. 血（循環状態）スコア: 20% ===
  let bloodScore = 0;
  let bloodCount = 0;

  if (obs.coatSheen) {
    bloodScore += (obs.coatSheen - 1) * 25;
    bloodCount++;
  }
  if (obs.heartRate) {
    if (obs.heartRate >= 30 && obs.heartRate <= 40) {
      bloodScore += 100;
    } else if (obs.heartRate >= 25 && obs.heartRate <= 45) {
      bloodScore += 70;
    } else if (obs.heartRate >= 20 && obs.heartRate <= 50) {
      bloodScore += 40;
    } else {
      bloodScore += 10;
    }
    bloodCount++;
  }
  const bloodAvg = bloodCount > 0 ? bloodScore / bloodCount : 50;

  // === 4. 津液（水分代謝）スコア: 15% ===
  let fluidScore = 0;
  let fluidCount = 0;

  if (obs.sweatLevel !== undefined && obs.sweatLevel !== null) {
    const sweatMap: Record<number, number> = { 0: 70, 1: 100, 2: 50, 3: 20 };
    fluidScore += sweatMap[obs.sweatLevel] ?? 50;
    fluidCount++;
  }
  if (obs.weightDiff !== undefined && obs.weightDiff !== null) {
    const diff = Math.abs(obs.weightDiff);
    if (diff <= 2) fluidScore += 100;
    else if (diff <= 4) fluidScore += 80;
    else if (diff <= 8) fluidScore += 50;
    else if (diff <= 12) fluidScore += 30;
    else fluidScore += 10;
    fluidCount++;
  }
  const fluidAvg = fluidCount > 0 ? fluidScore / fluidCount : 50;

  // === 5. 特殊減点要素: 5% ===
  let penalty = 0;
  if (obs.preEjaculation === 1) penalty += 30;

  // === 総合スコア計算 ===
  const total =
    shenAvg * 0.30 +
    qiAvg * 0.30 +
    bloodAvg * 0.20 +
    fluidAvg * 0.15 +
    (100 - penalty) * 0.05;

  return Math.max(0, Math.min(100, Math.round(total)));
}

/**
 * Shen AI的診断コメントを生成
 */
export function generateShenDiagnosis(obs: PaddockInput, conditionScore: number): string {
  const parts: string[] = [];

  // 総合判定
  if (conditionScore >= 80) {
    parts.push("【神気充実】目に力あり、闘志みなぎる。");
  } else if (conditionScore >= 65) {
    parts.push("【気血調和】概ね良好、安定した状態。");
  } else if (conditionScore >= 45) {
    parts.push("【気血平衡】特段の異常なし、平常運転。");
  } else if (conditionScore >= 30) {
    parts.push("【気虚兆候】エネルギー不足の兆し、注意を要す。");
  } else {
    parts.push("【血虚・気滞】明らかな不調、出走回避も検討。");
  }

  // 個別指標コメント
  if ((obs.gaitScore ?? 0) >= 4) {
    parts.push("歩様軽快、四肢の運びに力あり。");
  } else if ((obs.gaitScore ?? 3) <= 2) {
    parts.push("歩様に硬さ、脚元に不安あり。");
  }

  if ((obs.coatSheen ?? 0) >= 4) {
    parts.push("毛艶良好、血行充実の証。");
  } else if ((obs.coatSheen ?? 3) <= 2) {
    parts.push("毛艶くすみ、体調下降の兆し。");
  }

  if (obs.excitementLevel === 2 || obs.excitementLevel === 3) {
    parts.push("適度な闘志、精神安定。");
  } else if ((obs.excitementLevel ?? 0) >= 5) {
    parts.push("過度の興奮、折り合い不安。入れ込み注意。");
  }

  if ((obs.muscleTone ?? 0) >= 4) {
    parts.push("筋肉の張り良好、仕上がり上々。");
  }

  if (obs.heartRate) {
    if (obs.heartRate >= 30 && obs.heartRate <= 38) {
      parts.push("心拍安定、リラックス状態。");
    } else if (obs.heartRate > 45) {
      parts.push("心拍数高め、緊張/ストレスの可能性。");
    }
  }

  if ((obs.fatigueLevel ?? 0) >= 4) {
    parts.push("疲弊の兆候あり、前走からの回復不十分か。");
  }

  if (obs.preEjaculation === 1) {
    parts.push("射精前兆候あり、集中力低下リスク。");
  }

  return parts.join("");
}
