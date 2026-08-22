import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { races, entries, payouts, predictions, officialDataImports } from "../drizzle/schema";
import { eq, and, sql, desc, asc, lt, ne, isNotNull } from "drizzle-orm";
import { normalizeOfficialCsvRows } from "./officialRaceCsv";
import { reconcileRaceResult, summarizeRaceReconciliation } from "./resultSettlement";
import { summarizeTodaySettlements } from "./todaySettlementSummary";
import { buildMonthlyResultImportTrend, buildUnimportedRaceRanking } from "./resultImportTrend";
import { requireAuthorizedDataSource, writeDataImportAudit } from "./authorizedDataSource";

/**
 * CSVアップロードルーター
 * keiba.go.jp公式CSVフォーマットに準拠
 * 管理者のみアクセス可能
 */

// --- ヘルパー関数 ---

/** CSV文字列をパースして行配列に変換 */
function parseCSV(csvText: string): string[][] {
  const lines = csvText.trim().split(/\r?\n/);
  return lines.map(line => {
    // 簡易CSVパーサー（ダブルクォート対応）
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

/** 競馬場コードを生成（競馬場名→4桁コード） */
function venueToCode(venueName: string): string {
  const map: Record<string, string> = {
    "帯広": "01", "門別": "02", "盛岡": "03", "水沢": "04",
    "浦和": "05", "船橋": "06", "大井": "07", "川崎": "08",
    "金沢": "09", "笠松": "10", "名古屋": "11", "園田": "12",
    "姫路": "13", "高知": "14", "佐賀": "15",
    "札幌": "S1", "函館": "S2", "福島": "S3", "新潟": "S4",
    "東京": "S5", "中山": "S6", "中京": "S7", "京都": "S8",
    "阪神": "S9", "小倉": "SA",
  };
  return map[venueName] || venueName.substring(0, 2);
}

/** 日付文字列を正規化（YYYY/MM/DD → YYYY-MM-DD） */
function normalizeDate(dateStr: string): string {
  return dateStr.replace(/\//g, "-");
}

/** 公式CSVの開催情報からJRA/NAR共通の内部レースIDを生成する。 */
export function buildOfficialRaceId(venueName: string, date: string, raceNumber: number): string {
  const normalizedDate = normalizeDate(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) throw new Error("開催日はYYYY-MM-DDまたはYYYY/MM/DDで指定してください。");
  if (!Number.isInteger(raceNumber) || raceNumber < 1 || raceNumber > 12) throw new Error("レース番号は1〜12で指定してください。");
  return `${normalizedDate.replace(/-/g, "")}${venueToCode(venueName)}${String(raceNumber).padStart(2, "0")}`;
}

/** 馬場状態を英語enumに変換 */
function trackConditionToEnum(condition: string): "good" | "slightly_heavy" | "heavy" | "bad" | null {
  const map: Record<string, "good" | "slightly_heavy" | "heavy" | "bad"> = {
    "良": "good", "稍重": "slightly_heavy", "稍": "slightly_heavy",
    "重": "heavy", "不良": "bad", "不": "bad",
  };
  return map[condition] || null;
}

/** コース種別を英語enumに変換 */
function surfaceToEnum(surface: string): "turf" | "dirt" | "steeplechase" {
  if (surface.includes("芝")) return "turf";
  if (surface.includes("ダ") || surface.includes("ダート")) return "dirt";
  if (surface.includes("障")) return "steeplechase";
  return "dirt"; // 地方はデフォルトダート
}

/** 回りを英語enumに変換 */
function directionToEnum(direction: string): "right" | "left" | "straight" | null {
  if (direction.includes("右")) return "right";
  if (direction.includes("左")) return "left";
  if (direction.includes("直")) return "straight";
  return null;
}

/** 券種を英語enumに変換 */
function betTypeToEnum(betType: string): "win" | "place" | "quinella" | "exacta" | "wide" | "trio" | "trifecta" | null {
  const map: Record<string, "win" | "place" | "quinella" | "exacta" | "wide" | "trio" | "trifecta"> = {
    "単勝": "win", "複勝": "place", "枠複": "quinella", "枠単": "exacta",
    "馬複": "quinella", "馬単": "exacta", "ワイド": "wide",
    "3連複": "trio", "三連複": "trio", "3連単": "trifecta", "三連単": "trifecta",
  };
  return map[betType] || null;
}

type Organizer = "JRA" | "NAR";
type ImportKind = "race_list" | "entries" | "payouts";

/** 正規CSVの取込証跡をレース単位で残す。CSV本文・利用キーは保存しない。 */
async function recordOfficialImport(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  raceIds: Iterable<string>,
  organizer: Organizer,
  kind: ImportKind,
  rowCount: number,
  importedByOpenId?: string,
) {
  const uniqueRaceIds = Array.from(new Set(raceIds));
  if (uniqueRaceIds.length === 0) return;
  await db.insert(officialDataImports).values(uniqueRaceIds.map(raceId => ({
    raceId,
    source: `${organizer}_OFFICIAL_CSV_${kind}`,
    fileFormat: "csv" as const,
    rowCount,
    importedByOpenId: importedByOpenId ?? null,
  })));
}

/** 公式CSVと保存済みレースを照合するため、地方競馬の表示ゆれを吸収する。 */
function normalizeVenueForMatching(venueName: string) {
  const normalized = venueName.trim().replace(/[\s　]/g, "").replace(/競馬場$/, "");
  if (normalized.startsWith("帯広")) return "帯広";
  return normalized;
}

/**
 * 内部レースIDだけに依存せず、主催者・開催日・競馬場・レース番号で既存レースを再照合する。
 * 同じ公式CSVが「帯広」「帯広(ば)」のように表記を変えても、既存データへ安全に結合する。
 */
async function findRaceForOfficialImport(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  input: { organizer: Organizer; venueName: string; raceDate: string; raceNumber: number },
) {
  const candidateRaceId = buildOfficialRaceId(input.venueName, input.raceDate, input.raceNumber);
  const [directMatch] = await db.select({
    id: races.id,
    raceId: races.raceId,
    organizer: races.organizer,
    status: races.status,
    venueName: races.venueName,
  })
    .from(races)
    .where(eq(races.raceId, candidateRaceId))
    .limit(1);
  if (directMatch) return directMatch;

  const candidates = await db.select({
    id: races.id,
    raceId: races.raceId,
    organizer: races.organizer,
    status: races.status,
    venueName: races.venueName,
  })
    .from(races)
    .where(and(
      eq(races.organizer, input.organizer),
      eq(races.raceDate, input.raceDate),
      eq(races.raceNumber, input.raceNumber),
    ));
  const targetVenue = normalizeVenueForMatching(input.venueName);
  return candidates.find(race => normalizeVenueForMatching(race.venueName) === targetVenue) ?? null;
}

// --- ルーター ---

export const csvUploadRouter = router({
  /**
   * レース一覧CSV（racelist.csv）アップロード
   * keiba.go.jp形式: 競馬場,競走年月日,レース番号,発走時刻,競走種類名称,レース名,芝ダート区分,回り,距離,天候,馬場,頭数,条件,...
   */
  // 主催者照合と確定結果の保全を行うレース一覧取込。
  uploadRaceList: adminProcedure
    .input(z.object({
      csvContent: z.string(),
      hasHeader: z.boolean().default(true),
      organizer: z.enum(["JRA", "NAR"]).default("NAR"),
      sourceKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/),
      fileName: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { db, source } = await requireAuthorizedDataSource({
        sourceKey: input.sourceKey,
        organizer: input.organizer,
        deliveryMethod: "csv",
      });

      const rows = parseCSV(input.csvContent);
      const dataRows = normalizeOfficialCsvRows(rows, input.hasHeader, "race");

      let inserted = 0;
      let updated = 0;
      let errors: string[] = [];
      const importedRaceIds = new Set<string>();

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        try {
          if (row.length < 9) {
            errors.push(`行${i + 1}: カラム数不足 (${row.length}列)`);
            continue;
          }

          const venueName = row[0];
          const raceDate = normalizeDate(row[1]);
          const raceNumber = parseInt(row[2]);
          const startTime = row[3] || null;
          const raceName = row[5] || `${raceNumber}R`;
          const surface = surfaceToEnum(row[6]);
          const direction = directionToEnum(row[7]);
          const distance = parseInt(row[8]) || null;
          const weather = row[9] || null;
          const trackCondition = trackConditionToEnum(row[10] || "");
          const headCount = parseInt(row[11]) || null;
          const conditions = row[12] || null;
          const prizeMoney = row[13] ? parseFloat(row[13]) : null;

          const venueCode = venueToCode(venueName);
          // レースID: YYYYMMDD + 場コード + レース番号(2桁)
          const candidateRaceId = buildOfficialRaceId(venueName, raceDate, raceNumber);
          const matchedRace = await findRaceForOfficialImport(db, { organizer: input.organizer, venueName, raceDate, raceNumber });
          const raceId = matchedRace?.raceId ?? candidateRaceId;
          importedRaceIds.add(raceId);

          // UPSERT: 既存なら更新、なければ挿入
          const existing = matchedRace ? [matchedRace] : [];

          if (existing.length > 0) {
            if (existing[0]?.organizer !== input.organizer) {
              throw new Error(`主催者が既存レースと一致しません（既存: ${existing[0]?.organizer} / 指定: ${input.organizer}）`);
            }
            await db.update(races)
              .set({
                raceName,
                postTime: startTime,
                surface,
                direction,
                distance,
                weather,
                trackCondition,
                headCount,
                prizeMoney,
                // 結果確定済みの公式レースを、予定表の再取込で未確定に戻さない。
                status: existing[0]?.status === "results_confirmed" ? "results_confirmed" : "upcoming",
              })
              .where(eq(races.raceId, raceId));
            updated++;
          } else {
            await db.insert(races).values({
              raceId,
              raceName,
              raceDate,
              postTime: startTime,
              venueCode,
              venueName,
              raceNumber,
              surface,
              direction,
              distance,
              weather,
              trackCondition,
              headCount,
              prizeMoney,
              organizer: input.organizer,
              status: "upcoming",
            });
            inserted++;
          }
        } catch (e: any) {
          errors.push(`行${i + 1}: ${e.message}`);
        }
      }

      await recordOfficialImport(db, importedRaceIds, input.organizer, "race_list", dataRows.length, ctx.user.openId);
      await writeDataImportAudit({
        source,
        kind: "race_list",
        content: input.csvContent,
        fileName: input.fileName,
        rowCount: dataRows.length,
        status: "accepted",
        importedByOpenId: ctx.user.openId,
      });
      return { inserted, updated, errors: errors.slice(0, 20), totalRows: dataRows.length };
    }),

  /**
   * 出馬表CSV（horselist.csv）アップロード
   * keiba.go.jp形式: 競馬場,競走年月日,レース番号,枠番,馬番,馬名,性,齢,...,騎手名,...,負担重量,...,着順,タイム,着差,上がり3F,人気
   */
  // 結果入り出馬表を主催者単位で照合して取り込む。
  uploadHorseList: adminProcedure
    .input(z.object({
      csvContent: z.string(),
      hasHeader: z.boolean().default(true),
      organizer: z.enum(["JRA", "NAR"]).default("NAR"),
      sourceKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/),
      fileName: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { db, source } = await requireAuthorizedDataSource({
        sourceKey: input.sourceKey,
        organizer: input.organizer,
        deliveryMethod: "csv",
      });

      const rows = parseCSV(input.csvContent);
      const dataRows = normalizeOfficialCsvRows(rows, input.hasHeader, "entry");

      let inserted = 0;
      let updated = 0;
      let errors: string[] = [];
      const resultCandidateRaceIds = new Set<string>();
      const importedRaceIds = new Set<string>();

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        try {
          if (row.length < 6) {
            errors.push(`行${i + 1}: カラム数不足 (${row.length}列)`);
            continue;
          }

          const venueName = row[0];
          const raceDate = normalizeDate(row[1]);
          const raceNumber = parseInt(row[2]);
          const gateNumber = parseInt(row[3]) || null;
          const horseNumber = parseInt(row[4]);
          const horseName = row[5];
          const sex = row[6] || null;
          const age = parseInt(row[7]) || null;
          // row[8] = 毛色, row[9] = 生年月日
          const sire = row[10] || null;  // 父馬名
          const dam = row[11] || null;   // 母馬名
          // row[12] = 母父馬名 (not stored in current schema)
          const jockey = row[13] || null;
          // row[14] = 騎手所属
          const weight = parseFloat(row[15]) || null; // 負担重量
          // ... 中間カラム省略 ...
          const horseWeight = parseInt(row[21]) || null;
          const horseWeightDiff = parseInt(row[22]) || null;

          // 着順・タイム等（結果確定時のみ）
          const finishPositionIdx = row.length - 5; // 末尾5列が着順,タイム,着差,上がり3F,人気
          const finishPosition = parseInt(row[finishPositionIdx]) || null;
          const finishTimeStr = row[finishPositionIdx + 1] || null;
          const margin = row[finishPositionIdx + 2] || null;
          const last3fStr = row[finishPositionIdx + 3] || null;
          const popularity = parseInt(row[finishPositionIdx + 4]) || null;

          // タイムを秒に変換（例: "1:23.4" → 83.4）
          let finishTime: number | null = null;
          if (finishTimeStr && finishTimeStr.includes(":")) {
            const [min, sec] = finishTimeStr.split(":");
            finishTime = parseInt(min) * 60 + parseFloat(sec);
          }
          const last3f = last3fStr ? parseFloat(last3fStr) : null;

          const venueCode = venueToCode(venueName);
          const matchedRace = await findRaceForOfficialImport(db, { organizer: input.organizer, venueName, raceDate, raceNumber });
          if (!matchedRace) throw new Error("対象レースが見つかりません。先に同じ主催者のレース一覧CSVを取り込んでください。");
          if (matchedRace.organizer !== input.organizer) {
            throw new Error(`主催者が既存レースと一致しません（既存: ${matchedRace.organizer} / 指定: ${input.organizer}）`);
          }
          const raceId = matchedRace.raceId;

          // UPSERT
          const existing = await db.select({
            id: entries.id,
            finishPosition: entries.finishPosition,
            finishTime: entries.finishTime,
            margin: entries.margin,
            last3f: entries.last3f,
            popularity: entries.popularity,
          })
            .from(entries)
            .where(and(
              eq(entries.raceId, raceId),
              eq(entries.horseNumber, horseNumber)
            ))
            .limit(1);

          if (existing.length > 0) {
            await db.update(entries)
              .set({
                horseName,
                gateNumber,
                sex,
                age,
                weight,
                jockey,
                horseWeight,
                horseWeightDiff,
                // 結果なしの出馬表を再取込しても、確定済みの着順・走破タイムを消去しない。
                finishPosition: finishPosition ?? existing[0]?.finishPosition ?? null,
                finishTime: finishTime ?? existing[0]?.finishTime ?? null,
                margin: margin ?? existing[0]?.margin ?? null,
                last3f: last3f ?? existing[0]?.last3f ?? null,
                popularity: popularity ?? existing[0]?.popularity ?? null,
                sire,
                dam,
              })
              .where(and(
                eq(entries.raceId, raceId),
                eq(entries.horseNumber, horseNumber)
              ));
            updated++;
          } else {
            await db.insert(entries).values({
              raceId,
              horseNumber,
              horseName,
              gateNumber,
              sex,
              age,
              weight,
              jockey,
              horseWeight,
              horseWeightDiff,
              finishPosition,
              finishTime,
              margin,
              last3f,
              popularity,
              sire,
              dam,
            });
            inserted++;
          }

          if (finishPosition !== null) resultCandidateRaceIds.add(raceId);
          importedRaceIds.add(raceId);
          // 結果確定済みレースを、出馬表の再取込で未確定へ戻さない。
          await db.update(races)
            .set({ status: "entries_confirmed" })
            .where(and(eq(races.raceId, raceId), eq(races.organizer, input.organizer), sql`${races.status} <> 'results_confirmed'`));
        } catch (e: any) {
          errors.push(`行${i + 1}: ${e.message}`);
        }
      }

      const reconciled = await Promise.all(Array.from(resultCandidateRaceIds).map(raceId => reconcileRaceResult(db, raceId)));
      await recordOfficialImport(db, importedRaceIds, input.organizer, "entries", dataRows.length, ctx.user.openId);
      await writeDataImportAudit({
        source,
        kind: "entries",
        content: input.csvContent,
        fileName: input.fileName,
        rowCount: dataRows.length,
        status: "accepted",
        importedByOpenId: ctx.user.openId,
      });
      return {
        inserted,
        updated,
        errors: errors.slice(0, 20),
        totalRows: dataRows.length,
        reconciled,
        reconciliationSummary: summarizeRaceReconciliation(reconciled),
      };
    }),

  /**
   * 払戻金CSV（payback.csv）アップロード
   * keiba.go.jp形式: 競馬場,競走年月日,レース番号,賭式,組番,払戻金,人気
   */
  // 払戻金を同一主催者・同一レースへだけ結合する。
  uploadPayback: adminProcedure
    .input(z.object({
      csvContent: z.string(),
      hasHeader: z.boolean().default(true),
      organizer: z.enum(["JRA", "NAR"]).default("NAR"),
      sourceKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/),
      fileName: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { db, source } = await requireAuthorizedDataSource({
        sourceKey: input.sourceKey,
        organizer: input.organizer,
        deliveryMethod: "csv",
      });

      const rows = parseCSV(input.csvContent);
      const dataRows = normalizeOfficialCsvRows(rows, input.hasHeader, "payout");

      let inserted = 0;
      let skipped = 0;
      let errors: string[] = [];
      const affectedRaceIds = new Set<string>();
      const importedRaceIds = new Set<string>();

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        try {
          if (row.length < 6) {
            errors.push(`行${i + 1}: カラム数不足 (${row.length}列)`);
            continue;
          }

          const venueName = row[0];
          const raceDate = normalizeDate(row[1]);
          const raceNumber = parseInt(row[2]);
          const betTypeStr = row[3];
          const combination = row[4];
          const payoutAmount = parseInt(row[5].replace(/,/g, "")) || 0;
          const popularity = parseInt(row[6]) || null;

          const betType = betTypeToEnum(betTypeStr);
          if (!betType) {
            skipped++;
            continue;
          }

          const venueCode = venueToCode(venueName);
          const matchedRace = await findRaceForOfficialImport(db, { organizer: input.organizer, venueName, raceDate, raceNumber });
          if (!matchedRace) throw new Error("対象レースが見つかりません。先に同じ主催者のレース一覧CSVを取り込んでください。");
          if (matchedRace.organizer !== input.organizer) {
            throw new Error(`主催者が既存レースと一致しません（既存: ${matchedRace.organizer} / 指定: ${input.organizer}）`);
          }
          const raceId = matchedRace.raceId;
          affectedRaceIds.add(raceId);

          // 重複チェック
          const existing = await db.select({ id: payouts.id })
            .from(payouts)
            .where(and(
              eq(payouts.raceId, raceId),
              eq(payouts.betType, betType),
              eq(payouts.combination, combination)
            ))
            .limit(1);

          if (existing.length > 0) {
            skipped++;
            continue;
          }

          await db.insert(payouts).values({
            raceId,
            betType,
            combination,
            payout: payoutAmount,
            popularity,
          });
          inserted++;
          importedRaceIds.add(raceId);

        } catch (e: any) {
          errors.push(`行${i + 1}: ${e.message}`);
        }
      }

      const reconciled = await Promise.all(Array.from(affectedRaceIds).map(raceId => reconcileRaceResult(db, raceId)));
      await recordOfficialImport(db, importedRaceIds, input.organizer, "payouts", dataRows.length, ctx.user.openId);
      await writeDataImportAudit({
        source,
        kind: "payouts",
        content: input.csvContent,
        fileName: input.fileName,
        rowCount: dataRows.length,
        status: "accepted",
        importedByOpenId: ctx.user.openId,
      });
      return {
        inserted,
        skipped,
        errors: errors.slice(0, 20),
        totalRows: dataRows.length,
        reconciled,
        reconciliationSummary: summarizeRaceReconciliation(reconciled),
      };
    }),

  /** アップロード統計情報を取得 */
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { races: 0, entries: 0, payouts: 0 };

    const [raceCount] = await db.select({ count: sql<number>`count(*)` }).from(races);
    const [entryCount] = await db.select({ count: sql<number>`count(*)` }).from(entries);
    const [payoutCount] = await db.select({ count: sql<number>`count(*)` }).from(payouts);

    return {
      races: raceCount?.count || 0,
      entries: entryCount?.count || 0,
      payouts: payoutCount?.count || 0,
    };
  }),

  /** スマホ取込画面に、未取込の過去公式結果と直近確定結果を安全に表示する。 */
  getResultImportStatus: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { pastUnconfirmed: 0, latestConfirmed: null };
    const jstToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
    const [pastUnconfirmed] = await db.select({ count: sql<number>`count(*)` })
      .from(races)
      .where(and(lt(races.raceDate, jstToday), ne(races.status, "results_confirmed")));
    const [latestConfirmed] = await db.select({
      raceId: races.raceId,
      raceName: races.raceName,
      raceDate: races.raceDate,
      venueName: races.venueName,
      raceNumber: races.raceNumber,
    })
      .from(races)
      .where(eq(races.status, "results_confirmed"))
      .orderBy(desc(races.raceDate), desc(races.raceNumber))
      .limit(1);
    return { pastUnconfirmed: pastUnconfirmed?.count ?? 0, latestConfirmed: latestConfirmed ?? null };
  }),

  /** 地方競馬の未取込公式結果を、日付・会場単位で管理画面に表示する。 */
  getNarResultImportStatus: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { pastUnconfirmed: 0, byVenue: [] as Array<{ raceDate: string; venueName: string; raceCount: number }> };
    const jstToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
    const [total] = await db.select({ count: sql<number>`count(*)` })
      .from(races)
      .where(and(eq(races.organizer, "NAR"), lt(races.raceDate, jstToday), ne(races.status, "results_confirmed")));
    const byVenue = await db.select({
      raceDate: races.raceDate,
      venueName: races.venueName,
      raceCount: sql<number>`count(*)`,
    })
      .from(races)
      .where(and(eq(races.organizer, "NAR"), lt(races.raceDate, jstToday), ne(races.status, "results_confirmed")))
      .groupBy(races.raceDate, races.venueName)
      .orderBy(desc(races.raceDate), asc(races.venueName))
      .limit(30);
    return { pastUnconfirmed: total?.count ?? 0, byVenue };
  }),

  /** 過去レースの公式結果取込状況を、主催者内訳付きで月別に返す。 */
  getMonthlyResultImportTrend: adminProcedure.query(async () => {
    const jstToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
    const db = await getDb();
    if (!db) return { throughDate: jstToday, months: [] };
    const pastRaces = await db.select({
      raceDate: races.raceDate,
      organizer: races.organizer,
      status: races.status,
    })
      .from(races)
      .where(lt(races.raceDate, jstToday));
    return {
      throughDate: jstToday,
      months: buildMonthlyResultImportTrend(pastRaces),
    };
  }),

  /** 過去の公式結果が未取込のレースを、主催者別・会場別に順位表示する。 */
  getUnimportedRaceRanking: adminProcedure.query(async () => {
    const jstToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
    const db = await getDb();
    if (!db) return { throughDate: jstToday, organizerRanking: [], venueRanking: [] };
    const unimportedRaces = await db.select({
      raceDate: races.raceDate,
      organizer: races.organizer,
      venueName: races.venueName,
    })
      .from(races)
      .where(and(lt(races.raceDate, jstToday), ne(races.status, "results_confirmed")));
    return {
      throughDate: jstToday,
      ...buildUnimportedRaceRanking(unimportedRaces),
    };
  }),

  /** CSV取込後の通知に使う、JST当日の確定・実測可能な予想成績。 */
  getTodaySettlementSummary: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return summarizeTodaySettlements([]);
    const jstToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
    const rows = await db.select({
      raceId: predictions.raceId,
      predictedAt: predictions.predictedAt,
      recommendedBets: predictions.recommendedBets,
      isHit: predictions.isHit,
      investAmount: predictions.investAmount,
      returnAmount: predictions.returnAmount,
    })
      .from(predictions)
      .innerJoin(races, eq(predictions.raceId, races.raceId))
      .where(and(eq(races.raceDate, jstToday), eq(races.status, "results_confirmed"), isNotNull(predictions.isHit)));
    return summarizeTodaySettlements(rows);
  }),
});
