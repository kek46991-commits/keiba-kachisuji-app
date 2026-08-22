import { describe, expect, it } from "vitest";
import { validateAuthorizedDataSource } from "./authorizedDataSource";

const activeNarCsv = {
  id: 1,
  sourceKey: "nar-contract-csv",
  organizer: "NAR" as const,
  deliveryMethod: "csv" as const,
  status: "active" as const,
};

describe("validateAuthorizedDataSource", () => {
  it("有効な契約済みCSV提供元だけを通す", () => {
    expect(validateAuthorizedDataSource(activeNarCsv, {
      sourceKey: "nar-contract-csv",
      organizer: "NAR",
      deliveryMethod: "csv",
    })).toEqual(activeNarCsv);
  });

  it("未有効化・主催者違い・提供形式違いを拒否する", () => {
    expect(() => validateAuthorizedDataSource({ ...activeNarCsv, status: "pending" }, {
      sourceKey: "nar-contract-csv", organizer: "NAR", deliveryMethod: "csv",
    })).toThrow("有効化");
    expect(() => validateAuthorizedDataSource(activeNarCsv, {
      sourceKey: "nar-contract-csv", organizer: "JRA", deliveryMethod: "csv",
    })).toThrow("主催者範囲");
    expect(() => validateAuthorizedDataSource(activeNarCsv, {
      sourceKey: "nar-contract-csv", organizer: "NAR", deliveryMethod: "api",
    })).toThrow("提供形式");
  });
});
