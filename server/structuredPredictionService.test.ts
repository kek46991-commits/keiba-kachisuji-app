import { describe, expect, it } from "vitest";
import { validateStructuredPrediction } from "./structuredPredictionService";

const runners = [{ horseNumber: 1, horseName: "テスト一号" }, { horseNumber: 2, horseName: "テスト二号" }, { horseNumber: 3, horseName: "テスト三号" }];
const valid = {
  summary: "データ上は1番を中心に評価します。",
  winCandidate: { horseNumber: 1, horseName: "テスト一号", confidence: 0.6, rationale: "単勝オッズが安定しています。" },
  placeCandidates: [
    { horseNumber: 2, horseName: "テスト二号", confidence: 0.4, rationale: "騎手条件が良好です。" },
    { horseNumber: 3, horseName: "テスト三号", confidence: 0.3, rationale: "馬場適性を考慮しました。" },
  ],
  riskLevel: "medium" as const, riskNotes: ["直前オッズは変動する可能性があります。"], disclaimer: "予想は保証ではありません。",
};

describe("validateStructuredPrediction", () => {
  it("出馬表と一致する候補だけを受け入れる", () => {
    expect(validateStructuredPrediction(valid, runners)).toEqual(valid);
  });
  it("出走していない馬番を拒否する", () => {
    expect(() => validateStructuredPrediction({ ...valid, winCandidate: { ...valid.winCandidate, horseNumber: 9 } }, runners)).toThrow("一致しない");
  });
  it("候補の重複を拒否する", () => {
    expect(() => validateStructuredPrediction({ ...valid, placeCandidates: [{ ...valid.winCandidate }, valid.placeCandidates[1]] }, runners)).toThrow("重複");
  });
});
