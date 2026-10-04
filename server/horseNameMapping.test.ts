import { describe, expect, it } from "vitest";
import { buildHorseNameMap, isDummyHorseName, resolveHorseName, restoreHorseNamesInText, withResolvedHorseNames } from "../shared/horseNameMapping";

const master = [
  { horseNumber: 1, horseName: "シャンドゥルール" },
  { horseNumber: 2, horseName: "ジーククローネ" },
  { horseNumber: 3, horseName: " ライラスター " },
  { horseNumber: 0, horseName: "無効馬番" },
  { horseNumber: 4, horseName: "   " },
];

describe("horseNameMapping", () => {
  it("無効な馬番と空の馬名は対応表へ入れない", () => {
    const map = buildHorseNameMap(master);
    expect(map.get(1)).toBe("シャンドゥルール");
    expect(map.get(3)).toBe("ライラスター");
    expect(map.has(0)).toBe(false);
    expect(map.has(4)).toBe(false);
  });

  it("馬番一致で本物の馬名を返し、未登録なら元の馬名を保つ", () => {
    const map = buildHorseNameMap(master);
    expect(resolveHorseName({ horseNumber: 2, horseName: "馬B" }, map)).toBe("ジーククローネ");
    expect(resolveHorseName({ horseNumber: 9, horseName: "馬I" }, map)).toBe("馬I");
  });

  it("保存済みの馬名は変えず displayName だけを付与する", () => {
    const resolved = withResolvedHorseNames([{ horseNumber: 1, horseName: "馬A", score: 80 }], buildHorseNameMap(master));
    expect(resolved[0]).toEqual({ horseNumber: 1, horseName: "馬A", score: 80, displayName: "シャンドゥルール" });
  });

  it("文章内のダミー馬名を本物の馬名へ置換する", () => {
    const entries = [
      { horseNumber: 1, horseName: "馬A" },
      { horseNumber: 2, horseName: "馬B" },
    ];
    const text = "◎馬A（スコア1位）を軸に、馬Bを2着候補へ";
    expect(restoreHorseNamesInText(text, entries, buildHorseNameMap(master))).toBe("◎シャンドゥルール（スコア1位）を軸に、ジーククローネを2着候補へ");
  });

  it("出走表マスターが無ければ文章は変更しない", () => {
    const text = "◎馬A（スコア1位）";
    expect(restoreHorseNamesInText(text, [{ horseNumber: 1, horseName: "馬A" }], new Map())).toBe(text);
  });

  it("ダミー馬名を判定する", () => {
    expect(isDummyHorseName("馬A")).toBe(true);
    expect(isDummyHorseName("テスト馬1")).toBe(true);
    expect(isDummyHorseName("シャンドゥルール")).toBe(false);
  });
});
