import { describe, expect, it } from "vitest";
import { buildCoverageFormation, buildLongshotAxisFormation, buildScoreFirstFormation, countOrderedTrifecta, selectValueCandidates } from "./valueBetting";

describe("selectValueCandidates", () => {
  const rows = [
    { horseNumber: 1, score: 90, odds: 2.5, expectedValue: -12, winProbability: 35 },
    { horseNumber: 2, score: 82, odds: 8, expectedValue: 14, winProbability: 15 },
    { horseNumber: 3, score: 79, odds: 12, expectedValue: 22, winProbability: 10 },
    { horseNumber: 4, score: 74, odds: 18, expectedValue: 8, winProbability: 6 },
  ];

  it("低期待値候補を除外して高い順に残す", () => {
    const selection = selectValueCandidates(rows, 0);
    expect(selection.skipped).toBe(false);
    expect(selection.candidates.map((row) => row.horseNumber)).toEqual([3, 2, 4]);
  });

  it("条件を満たす候補が3頭未満なら見送りにする", () => {
    const selection = selectValueCandidates(rows, 15);
    expect(selection.skipped).toBe(true);
    expect(selection.candidates).toHaveLength(0);
  });

  it("同一馬番を含む三連単の重複組合せを数えない", () => {
    expect(countOrderedTrifecta([1], [1, 2, 3], [1, 2, 3, 4])).toBe(4);
  });

  it("軸1頭・相手4頭で3連単12点と3連複6点を構成する", () => {
    const formation = buildCoverageFormation([
      { horseNumber: 1 }, { horseNumber: 2 }, { horseNumber: 3 }, { horseNumber: 4 }, { horseNumber: 5 },
    ]);

    expect(formation).toMatchObject({ axis: 1, second: [2, 3, 4, 5], third: [2, 3, 4, 5], trifectaCount: 12, trioCount: 6, targetReached: true });
  });

  it("相手5頭では3連単16点に広げ、公式組合せオッズ未取得の警告を返す", () => {
    const formation = buildCoverageFormation([
      { horseNumber: 1 }, { horseNumber: 2 }, { horseNumber: 3 }, { horseNumber: 4 }, { horseNumber: 5 }, { horseNumber: 6 },
    ]);

    expect(formation).toMatchObject({ trifectaCount: 16, trioCount: 6, targetReached: true });
    expect(formation?.trigamiWarning).toContain("未取得");
  });

  it("候補不足では馬を補完せず、点数目標未達の注意を返す", () => {
    const formation = buildCoverageFormation([{ horseNumber: 1 }, { horseNumber: 2 }, { horseNumber: 3 }, { horseNumber: 4 }]);
    expect(formation).toMatchObject({ trifectaCount: 6, trioCount: 3, targetReached: false });
    expect(formation?.caution).toContain("候補が不足");
  });

  it("スコア上位5頭から堅実な3連単9点・3連複3点を作る", () => {
    const formation = buildScoreFirstFormation([{ horseNumber: 1, score: 90 }, { horseNumber: 2, score: 82 }, { horseNumber: 3, score: 79 }, { horseNumber: 4, score: 74 }, { horseNumber: 5, score: 70 }]);
    expect(formation).toMatchObject({ axis: 1, second: [2, 3, 4], third: [2, 3, 4, 5], trioPartners: [2, 3, 4], trifectaCount: 9, trioCount: 3, targetReached: true });
    expect(formation?.first).toEqual([1]);
  });

  it("能力1・2位が4点以内なら1着候補を分散し、1位不発時をカバーする", () => {
    const formation = buildScoreFirstFormation([{ horseNumber: 1, score: 90 }, { horseNumber: 2, score: 87 }, { horseNumber: 3, score: 80 }, { horseNumber: 4, score: 76 }, { horseNumber: 5, score: 73 }]);
    expect(formation).toMatchObject({ axis: 1, first: [1, 2], second: [1, 2, 3], third: [1, 2, 3, 4, 5], trifectaCount: 12, trioCount: 4, targetReached: true, scoreGap: 3 });
  });

  it("穴馬軸でも上位スコア馬を2・3着から排除せず3連単16点を作る", () => {
    const formation = buildLongshotAxisFormation({ axis: 8, scoreRankedHorseNumbers: [1, 2, 3, 4, 5], holePartnerHorseNumbers: [6, 7] });
    expect(formation).toMatchObject({ axis: 8, second: [1, 2, 3, 6], third: [1, 2, 3, 4, 6], trioPartners: [1, 2, 6], trifectaCount: 16, trioCount: 3, targetReached: true });
    expect(formation?.second).toEqual(expect.arrayContaining([1, 2, 3]));
  });
});
