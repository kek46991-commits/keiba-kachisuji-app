/**
 * 地方競馬（NAR）予想ルーター
 * nar.netkeibaからレースデータ・出馬表を取得し、AIスコアリングで予想を実行
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { predictions, predictionTicketSets, races, entries } from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getNARScoreEnhancement } from "./oddsEngine";
import { applyPredictionMetrics } from "./predictionMetrics";
import { resolveValidatedNarRace } from "./narRaceValidation";
import { buildScoreFirstFormation, selectValueCandidates } from "./valueBetting";
import { analyzeRaceDiagnostics } from "./raceAnalysisDiagnostics";
import { calculateThreeViewAnalyses } from "./dashboardRouter";
import { buildAnaBettingRecommendationForRace } from "./anaUmaRouter";
import { savePredictionTicketSets } from "./predictionTicketSets";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const NAR_BASE = "https://nar.netkeiba.com";

// ==========================================
// NAR地方競馬 騎手ランク別補正
// ==========================================
const NAR_TOP_JOCKEYS: Record<string, number> = {
  // 南関東
  "御神本訓史": 10, "森泰斗": 9, "笹川翼": 8, "矢野貴之": 8,
  "本橋孝太": 7, "張田昂": 7, "石崎駿": 7, "左海誠二": 6,
  "真島大輔": 7, "今野忠成": 6, "山崎誠士": 7, "的場文男": 6,
  "落合玄太": 6, "藤田凌駕": 5, "阿部龍": 6, "小林凌大": 5,
  // 園田・姫路
  "吉村智洋": 9, "下原理": 8, "笹田知宏": 7, "永井孝典": 6,
  "杉浦健太": 6, "松木大地": 6, "大山寿文": 5, "田中学": 7,
  "小牧太": 8, "高橋洸佑": 5, "福原杏": 4, "土方颯太": 4,
  "廣瀬航": 5, "田野豊三": 5, "竹村達也": 5, "鷹野宏史": 5,
  // 北海道・東北
  "服部茂史": 5, "岩橋勇二": 5, "山本聡哉": 6, "村上忍": 5,
  "松井伸也": 5, "坂口裕一": 5,
  // 高知
  "赤岡修次": 8, "永森大智": 7, "岡村卓弥": 6, "宮川実": 5,
  "倉兼育康": 5, "西川敏弘": 6, "畑中信司": 5,
  // 佐賀
  "山口勲": 7, "鮫島克也": 6, "石川慎将": 5, "飛田愛斗": 5,
  // 金沢・笠松・名古屋
  "吉原寛人": 9, "藤田菜七子": 5, "繁田健一": 6,
  "岡部誠": 7, "大畑雅章": 6, "加藤聡一": 6, "丸野勝虎": 5,
  // JRA（地方参戦時）
  "岩田康誠": 8, "川田将雅": 11, "武豊": 8, "C.ルメール": 12,
};

// NAR競馬場の枠番バイアス
const NAR_GATE_BIAS: Record<string, { inner: number; outer: number }> = {
  "門別": { inner: 2, outer: -1 },
  "盛岡": { inner: 1, outer: 0 },
  "水沢": { inner: 2, outer: -1 },
  "浦和": { inner: 3, outer: -2 },
  "船橋": { inner: 2, outer: -1 },
  "大井": { inner: 1, outer: 1 },
  "川崎": { inner: 3, outer: -2 },
  "金沢": { inner: 2, outer: -1 },
  "笠松": { inner: 2, outer: -1 },
  "名古屋": { inner: 2, outer: -1 },
  "園田": { inner: 3, outer: -2 },
  "姫路": { inner: 2, outer: -1 },
  "高知": { inner: 2, outer: -1 },
  "佐賀": { inner: 2, outer: -1 },
  "帯広": { inner: 0, outer: 0 },
};

// ==========================================
// スクレイピング関数
// ==========================================

interface NarRaceInfo {
  raceId: string;
  raceNumber: number;
  raceName: string;
  startTime: string;
  surface: string;
  distance: number;
  headCount: number;
  venue: string;
  date: string;
  status: "upcoming" | "finished" | "running";
}

export interface NarEntryInfo {
  gateNumber: number;
  horseNumber: number;
  horseName: string;
  horseId: string; // netkeiba馬ID
  sex: string;
  age: number;
  weight: number; // 斤量
  jockey: string;
  trainer: string;
  horseWeight: number | null;
  horseWeightDiff: number | null;
  odds: number | null;
  popularity: number | null;
  sire: string | null; // 父馬名（血統Ajax取得）
}

/**
 * nar.netkeibaからレース一覧を取得
 */
async function fetchNarRaceList(date: string): Promise<NarRaceInfo[]> {
  const dateStr = date.replace(/-/g, "");
  
  // まずkaisai_idを取得
  const dateListUrl = `${NAR_BASE}/top/race_list_get_date_list.html?kaisai_date=${dateStr}`;
  const dateResp = await fetch(dateListUrl, {
    headers: { "User-Agent": USER_AGENT, "Referer": `${NAR_BASE}/top/race_list.html?kaisai_date=${dateStr}` }
  });
  const dateHtml = await dateResp.text();
  
  // kaisai_idを抽出
  const kaisaiMatch = dateHtml.match(new RegExp(`kaisai_id=(\\d+).*?kaisai_date=${dateStr}`));
  const kaisaiId = kaisaiMatch ? kaisaiMatch[1] : "";
  
  // レース一覧を取得
  const listUrl = `${NAR_BASE}/top/race_list_sub.html?kaisai_date=${dateStr}${kaisaiId ? `&kaisai_id=${kaisaiId}` : ""}`;
  const listResp = await fetch(listUrl, {
    headers: { "User-Agent": USER_AGENT, "Referer": `${NAR_BASE}/top/race_list.html?kaisai_date=${dateStr}` }
  });
  const listHtml = await listResp.text();
  
  // HTMLをパース
  const races: NarRaceInfo[] = [];
  
  // 開催場ごとのブロックを解析
  const venueBlocks = listHtml.split('<dl class="RaceList_DataList"');
  
  for (let i = 1; i < venueBlocks.length; i++) {
    const block = venueBlocks[i]!;
    
    // 開催場名を取得
    const venueMatch = block.match(/<p class="RaceList_DataTitle[^"]*">\s*(?:<small>[^<]*<\/small>\s*)?([^\s<]+)/);
    const venue = venueMatch ? venueMatch[1]!.trim() : "不明";
    
    // 天気・馬場状態
    // const weatherMatch = block.match(/Weather(\d+)/);
    // const trackMatch = block.match(/ダ：(\S+)/);
    
    // 各レースを取得
    const raceRegex = /<a href="[^"]*race_id=(\d+)[^"]*"[^>]*>\s*<div class="Race_Num([^"]*)">[\s\S]*?(\d+)R[\s\S]*?<\/div>\s*<div class="RaceList_ItemContent">[\s\S]*?<span class="ItemTitle">([^<]*)<\/span>[\s\S]*?<div class="RaceData">\s*<span>([^<]*)<\/span>\s*<span class="(?:Dart|Shiba)">([^<]*)<\/span>\s*(\d+)頭/g;
    
    let match;
    while ((match = raceRegex.exec(block)) !== null) {
      const raceId = match[1]!;
      const statusClass = (match[2] || "").trim();
      const raceNumber = parseInt(match[3]!);
      const raceName = match[4]!.trim();
      const startTime = match[5]!.trim();
      const surfaceDistance = match[6]!;
      const headCount = parseInt(match[7]!);
      
      // 芝/ダートと距離を分離
      const sdMatch = surfaceDistance.match(/(芝|ダ)(\d+)m/);
      const surface = sdMatch ? (sdMatch[1] === "芝" ? "turf" : "dirt") : "dirt";
      const distance = sdMatch ? parseInt(sdMatch[2]!) : 0;
      
      // ステータス判定
      let status: "upcoming" | "finished" | "running" = "upcoming";
      if (statusClass.includes("Race_Fixed")) status = "finished";
      else if (statusClass.includes("Race_Next")) status = "running";
      
      races.push({
        raceId,
        raceNumber,
        raceName,
        startTime,
        surface,
        distance,
        headCount,
        venue,
        date,
        status,
      });
    }
  }
  
  return races;
}

/**
 * nar.netkeibaから出馬表を取得
 * ShutubaTableクラスのテーブルを解析
 * td構造: [0]枠 [1]馬番 [2]印 [3]馬名 [4]性齢 [5]斤量 [6]騎手 [7]厩舎 [8]馬体重 [9]オッズ [10]人気
 */
export async function fetchNarEntries(raceId: string): Promise<NarEntryInfo[]> {
  const url = `${NAR_BASE}/race/shutuba.html?race_id=${raceId}`;
  let entryList: NarEntryInfo[] = [];
  
  // 方法1: nar.netkeibaのHTMLから出馬表をパース
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT }
    });
    const html = await resp.text();
    
    // ShutubaTableの各データ行を解析
    // 行は<tr class="HorseList" id="tr_N">の形式
    const rowRegex = /<tr class="HorseList"[^>]*>[\s\S]*?<\/tr>/g;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[0];
      
      // 枠番
      const wakuMatch = row.match(/<td class="Waku\d+">(\d+)<\/td>/);
      const gateNumber = wakuMatch ? parseInt(wakuMatch[1]!) : 0;
      
      // 馬番
      const umabanMatch = row.match(/<td class="Umaban\d+">(\d+)<\/td>/);
      const horseNumber = umabanMatch ? parseInt(umabanMatch[1]!) : 0;
      
      // 馬名と馬ID（HorseInfoセル内）
      const horseNameMatch = row.match(/<td class="HorseInfo">[\s\S]*?<span class="HorseName"[^>]*>\s*<a[^>]*href="[^"]*horse\/(\d+)"[^>]*>([^<]+)<\/a>/);
      const horseId = horseNameMatch ? horseNameMatch[1]! : "";
      const horseName = horseNameMatch ? horseNameMatch[2]!.trim() : "";
      
      // 性齢
      const ageMatch = row.match(/<span class="Age">([^<]+)<\/span>/);
      const sexAgeStr = ageMatch ? ageMatch[1]!.trim() : "";
      const sexParsed = sexAgeStr.match(/(牡|牝|セ)(\d+)/);
      const sex = sexParsed ? sexParsed[1]! : "";
      const age = sexParsed ? parseInt(sexParsed[2]!) : 0;
      
      // 斤量
      const weightMatch = row.match(/<td class="Txt_C">\s*([\d.]+)\s*<\/td>/);
      const weight = weightMatch ? parseFloat(weightMatch[1]!) : 0;
      
      // 騎手
      const jockeyMatch = row.match(/<td class="Jockey">[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
      const jockey = jockeyMatch ? jockeyMatch[1]!.trim() : "";
      
      // 厩舎
      const trainerMatch = row.match(/<td class="Trainer">[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
      const trainer = trainerMatch ? trainerMatch[1]!.trim() : "";
      
      // 馬体重
      const hwMatch = row.match(/<td class="Weight">\s*(\d+)<small>\(([+-]?\d+)\)<\/small>/);
      const horseWeight = hwMatch ? parseInt(hwMatch[1]!) : null;
      const horseWeightDiff = hwMatch ? parseInt(hwMatch[2]!) : null;
      
      // オッズ（Popular Txt_Rクラス内の数値）
      const oddsMatch = row.match(/<td class="Popular Txt_R">\s*(?:<span[^>]*>)?([\d.]+)/);
      const odds = oddsMatch ? parseFloat(oddsMatch[1]!) : null;
      
      // 人気（Popular Txt_Cクラス、末尾スペースあり）
      const popMatch = row.match(/<td class="Popular Txt_C[^"]*">\s*<span>(\d+)<\/span>/);
      const popularity = popMatch ? parseInt(popMatch[1]!) : null;
      
      if (horseName) {
        entryList.push({
          gateNumber,
          horseNumber,
          horseName,
          horseId,
          sex,
          age,
          weight,
          jockey,
          trainer,
          horseWeight,
          horseWeightDiff,
          odds,
          popularity,
          sire: null,
        });
      }
    }
  } catch (e) {
    console.error("[fetchNarEntries] HTML fetch failed:", e);
  }
  
  // 方法2: HTMLパースが0件の場合、DBのentriesテーブルからフォールバック取得
  if (entryList.length === 0) {
    try {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      // raceIdでentriesテーブルを検索（netkeibaRaceId形式とDB形式の両方を試行）
      const dbEntries = await db.select().from(entries).where(eq(entries.raceId, raceId));
      
      if (dbEntries.length > 0) {
        entryList = dbEntries.map((e: any) => ({
          gateNumber: e.gateNumber ?? 0,
          horseNumber: e.horseNumber ?? 0,
          horseName: e.horseName ?? "",
          horseId: "",
          sex: e.sex ?? "",
          age: e.age ?? 0,
          weight: e.weight ?? 0,
          jockey: e.jockey ?? "",
          trainer: e.trainer ?? "",
          horseWeight: e.horseWeight ?? null,
          horseWeightDiff: e.horseWeightDiff ?? null,
          odds: e.odds ? parseFloat(String(e.odds)) : null,
          popularity: e.popularity ?? null,
          sire: e.sire ?? null,
        }));
        console.log(`[fetchNarEntries] DB fallback: ${entryList.length} entries for ${raceId}`);
      }
      
      // netkeibaRaceId形式でも検索（races テーブル経由）
      if (entryList.length === 0) {
        // netkeibaRaceId形式: 2026XXYYYZZZ (年4桁 + 競馬場コード2桁 + 日付4桁 + レース番号2桁)
        // 内部raceId形式: YYYYMMDDCCNN (年月日8桁 + 競馬場コード2桁 + レース番号2桁)
        // netkeibaRaceId=202651080502 → 年2026, 競馬場51(園田), 日付0805, レース番号02
        // 内部raceId=202608051203 → 年月日20260805, 競馬場12(園田), レース番号03
        // マッチング: 日付とレース番号で検索
        if (raceId.length >= 12) {
          // netkeibaRaceIdから日付を抽出（位置6-9が月日: MMDD）
          const nkDate = raceId.substring(6, 10); // "0805"
          const nkRaceNum = parseInt(raceId.substring(10, 12)); // 02
          const yearStr = raceId.substring(0, 4); // "2026"
          const dateStr = `${yearStr}-${nkDate.substring(0, 2)}-${nkDate.substring(2, 4)}`; // "2026-08-05"
          
          // 日付とレース番号で検索
          const matchingRaces = await db.select().from(races)
            .where(and(eq(races.raceDate, dateStr), eq(races.organizer, "NAR")));
          
          // レース番号が近いものを探す（netkeibaのレース番号は場内番号と1-2ずれることがある）
          for (const race of matchingRaces) {
            if (Math.abs(race.raceNumber - nkRaceNum) <= 1) {
              const dbEntries2 = await db.select().from(entries).where(eq(entries.raceId, race.raceId));
              if (dbEntries2.length > 0) {
                entryList = dbEntries2.map((e: any) => ({
                  gateNumber: e.gateNumber ?? 0,
                  horseNumber: e.horseNumber ?? 0,
                  horseName: e.horseName ?? "",
                  horseId: "",
                  sex: e.sex ?? "",
                  age: e.age ?? 0,
                  weight: e.weight ?? 0,
                  jockey: e.jockey ?? "",
                  trainer: e.trainer ?? "",
                  horseWeight: e.horseWeight ?? null,
                  horseWeightDiff: e.horseWeightDiff ?? null,
                  odds: e.odds ? parseFloat(String(e.odds)) : null,
                  popularity: e.popularity ?? null,
                  sire: e.sire ?? null,
                }));
                console.log(`[fetchNarEntries] DB fallback via date+raceNum: ${entryList.length} entries for ${raceId} -> ${race.raceId}`);
                // netkeibaRaceIdをracesテーブルに保存（次回以降高速化）
                try {
                  await db.execute(
                    sql`UPDATE races SET netkeibaRaceId = ${raceId} WHERE raceId = ${race.raceId}`
                  );
                } catch {}
                break;
              }
            }
          }
        }
      }
    } catch (dbErr) {
      console.error("[fetchNarEntries] DB fallback failed:", dbErr);
    }
  }
  
  // 血統情報を並列取得（父馬名）- HTMLから取得できた場合のみ
  if (entryList.length > 0 && entryList.some(e => e.horseId)) {
    await fetchSireInfo(entryList);
  }
  
  return entryList;
}

/**
 * netkeiba血統Ajaxから父馬名を並列取得
 */
async function fetchSireInfo(entries: NarEntryInfo[]): Promise<void> {
  const tasks = entries.map(async (entry) => {
    if (!entry.horseId) return;
    try {
      const url = `https://db.netkeiba.com/horse/ajax_horse_pedigree.html?input=UTF-8&output=json&id=${entry.horseId}`;
      const resp = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": `https://db.netkeiba.com/horse/${entry.horseId}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return;
      const data = await resp.json() as { status: string; data: string };
      if (data.status !== "OK" || !data.data) return;
      // 父馬 = 最初の<td rowspan="2" class="b_ml">内のspan
      const sireMatch = data.data.match(/<td rowspan="2" class="b_ml">\s*<a[^>]*><span[^>]*>([^<]+)<\/span><\/a>/);
      if (sireMatch) {
        entry.sire = sireMatch[1]!.trim();
      }
    } catch {
      // タイムアウトやネットワークエラーは無視
    }
  });
  // 最大5並列で取得（レート制限対策）
  const batchSize = 5;
  for (let i = 0; i < tasks.length; i += batchSize) {
    await Promise.all(tasks.slice(i, i + batchSize));
  }
}

// ==========================================
// NARスコアリング関数
// ==========================================

// NAR馬場状態補正（地方競馬はほぼダート）
const NAR_TRACK_CONDITION_FACTOR: Record<string, number> = {
  "good": 1.0,
  "slightly_heavy": 1.05,
  "heavy": 1.1,
  "bad": 1.15,
};

// NAR地方競馬用血統スコア（ダート主体）— 主要種牡馬40頭以上
const NAR_SIRE_AFFINITY: Record<string, { dirt: number; sprint: number; long: number }> = {
  // ダート強豪
  "サウスヴィグラス": { dirt: 5, sprint: 3, long: -1 },
  "シニスターミニスター": { dirt: 5, sprint: 2, long: 2 },
  "ヘニーヒューズ": { dirt: 5, sprint: 4, long: -2 },
  "マジェスティックウォリアー": { dirt: 4, sprint: 2, long: 2 },
  "パイロ": { dirt: 5, sprint: 3, long: 0 },
  "ゴールドアリュール": { dirt: 5, sprint: 1, long: 3 },
  "カネヒキリ": { dirt: 4, sprint: 1, long: 3 },
  "エスポワールシチー": { dirt: 5, sprint: 2, long: 2 },
  "ホッコータルマエ": { dirt: 5, sprint: 3, long: 1 },
  "コパノリッキー": { dirt: 5, sprint: 2, long: 1 },
  "ルーラーシップ": { dirt: 4, sprint: 2, long: 1 },
  "ダイワメジャー": { dirt: 3, sprint: 3, long: 1 },
  "クロフネ": { dirt: 5, sprint: 2, long: 2 },
  "フリオーソ": { dirt: 4, sprint: 3, long: 0 },
  "タイムフライヤー": { dirt: 4, sprint: 2, long: 1 },
  "トランセンド": { dirt: 4, sprint: 1, long: 3 },
  "アジアエクスプレス": { dirt: 4, sprint: 2, long: 1 },
  "カジノドライヴ": { dirt: 4, sprint: 3, long: 0 },
  "ビッグアーサー": { dirt: 4, sprint: 2, long: 2 },
  "マインドユアビスケッツ": { dirt: 4, sprint: 3, long: 0 },
  "ラブリーデイ": { dirt: 4, sprint: 2, long: 1 },
  "エンパイアメーカー": { dirt: 4, sprint: 3, long: -1 },
  "フェノーメノ": { dirt: 3, sprint: 2, long: 2 },
  // 苝・万能系
  "キングカメハメハ": { dirt: 3, sprint: 1, long: 2 },
  "ディープインパクト": { dirt: -1, sprint: -1, long: 3 },
  "ロードカナロア": { dirt: 2, sprint: 4, long: -2 },
  "ドゥラメンテ": { dirt: 3, sprint: 0, long: 2 },
  "ハーツクライ": { dirt: 3, sprint: 2, long: 1 },
  "オルフェーヴル": { dirt: 3, sprint: 1, long: 2 },
  "エピファネイア": { dirt: 3, sprint: 2, long: 1 },
  "モーリス": { dirt: 3, sprint: 2, long: 1 },
  // スプリント系
  "タワーオブロンドン": { dirt: 3, sprint: 4, long: -2 },
  "スピルバーグ": { dirt: 3, sprint: 4, long: -1 },
  "アドマイヤムーン": { dirt: 3, sprint: 4, long: -2 },
  "ダノンバラード": { dirt: 3, sprint: 4, long: -1 },
  // スタミナ系
  "ストロングリターン": { dirt: 3, sprint: 2, long: 1 },
  "サンデーサイレンス": { dirt: 3, sprint: 3, long: 0 },
  "ディスクリートキャット": { dirt: 3, sprint: 3, long: -1 },
  // マイナー種牡馬
  "エスポワール": { dirt: 4, sprint: 2, long: 1 },
  "サマーバード": { dirt: 3, sprint: 2, long: 1 },
  "スウェプトオーヴァボード": { dirt: 4, sprint: 2, long: 1 },
  "ファストフォース": { dirt: 3, sprint: 3, long: 0 },
  "ブリックスアンドモルタル": { dirt: 3, sprint: 2, long: 1 },
};

interface NarScoreResult {
  horseNumber: number;
  horseName: string;
  jockey: string;
  gateNumber: number;
  sex: string;
  age: number;
  weight: number;
  odds: number | null;
  /** 能力スコアから導く理論上の予想オッズ。市場で成立した公式オッズではない。 */
  predictedOdds?: number | null;
  oddsSource?: "official" | "predicted";
  popularity: number | null;
  totalScore: number;
  winProbability: number; // 推定勝率（同一レース内の相対確率、%）
  expectedValue: number | null; // 期待値 (%)
  baseScore?: number;
  threeView?: {
    overallScore: number;
    confidence: "S" | "A" | "B" | "C" | "D";
    verdict: string;
    strongPoints: string[];
    riskFactors: string[];
  };
  breakdown: {
    base: number;
    jockeyBonus: number;
    oddsScore: number;
    gateScore: number;
    trackConditionScore: number;
    bloodlineScore: number;
    weightScore: number;
    ageScore: number;
    paddockScore: number;
    intervalScore: number; // 出走間隔スコア
    classScore: number; // クラス補正
    paceScore: number; // 展開予測スコア
    jockeyStatsScore: number; // 当該競馬場・距離帯の騎手成績
    compatibilityScore: number; // 馬×騎手の過去コンビ実績
    oddsMovementScore: number; // 直前のオッズ急落シグナル
    abilityScore: number; // 市場情報を除いた能力・適性評価
    marketSignalScore: number; // オッズ・市場急変などの参考シグナル
    jockeySampleSize: number;
    compatibilityRides: number;
  };
  rating: string;
}

export interface PaddockInput {
  horseNumber: number;
  heartRate?: number | null; // 心拍数 (bpm)
  excitement?: number | null; // 興奮度 (1-5)
  fatigue?: number | null; // 疲弊度 (1-5)
  focus?: number | null; // 集中力 (1-5)
  obedience?: number | null; // 騎手指示従順度 (1-5)
  bodyCondition?: number | null; // 馬体コンディション (1-5)
  preEjaculation?: boolean | null; // 射精前かどうか
}

function calculateNarScore(
  entry: NarEntryInfo,
  venue: string,
  headCount: number,
  distance: number,
  trackCondition?: string | null,
  sire?: string | null,
  paddock?: PaddockInput | null,
): NarScoreResult["breakdown"] {
  // 1. ベーススコア。単勝オッズを能力評価へ混在させない。
  const base = 50;
  
  // 2. 騎手ボーナス（トップジョッキーリスト + 部分一致）
  let jockeyBonus = NAR_TOP_JOCKEYS[entry.jockey] ?? 0;
  if (jockeyBonus === 0) {
    for (const [name, bonus] of Object.entries(NAR_TOP_JOCKEYS)) {
      if (name.includes(entry.jockey) || entry.jockey.includes(name)) {
        jockeyBonus = bonus;
        break;
      }
    }
  }
  
  // 3. オッズ妙味スコア（穴馬検知）
  let oddsScore = 0;
  if (entry.odds && entry.popularity) {
    const expectedOdds = entry.popularity * 3;
    if (entry.odds < expectedOdds * 0.7) {
      oddsScore = 5; // 実力以上に人気がある
    } else if (entry.odds > expectedOdds * 1.5 && entry.odds < 30) {
      oddsScore = 8; // 穴馬候補（過小評価）
    }
  }
  
  // 4. 枠番スコア
  // 現時点で地方競馬の確定結果から再計算したコース別枠順統計が未蓄積のため、
  // 固定の一般則を能力スコアへ加点しない。公式結果の十分な標本が揃った時だけ別途加算する。
  let gateScore = 0;
  
  // 5. 馬場状態スコア（地方競馬はダート主体）
  let trackConditionScore = 0;
  if (trackCondition) {
    const factor = NAR_TRACK_CONDITION_FACTOR[trackCondition] ?? 1.0;
    if (factor > 1.0) {
      // 重馬場ではパワー型（体重が重い馬）を加点
      trackConditionScore = Math.round((factor - 1.0) * 30);
      if (entry.horseWeight && entry.horseWeight > 480) {
        trackConditionScore += 2; // 大型馬は重馬場得意
      }
    }
  }
  
  // 6. 血統スコア（ダート適性）
  let bloodlineScore = 0;
  if (sire) {
    const sireAffinity = NAR_SIRE_AFFINITY[sire];
    if (sireAffinity) {
      bloodlineScore += sireAffinity.dirt;
      if (distance <= 1400) bloodlineScore += sireAffinity.sprint;
      else if (distance >= 2000) bloodlineScore += sireAffinity.long;
    }
  }
  
  // 7. 馬体重スコア（体調判定 + 距離適性 + 馬場適性）
  let weightScore = 0;
  // 7a. 体重変動スコア（前走比）
  if (entry.horseWeightDiff !== null) {
    if (entry.horseWeightDiff < -15) weightScore = -7; // 極端な減量は深刻な体調不良
    else if (entry.horseWeightDiff < -10) weightScore = -5; // 大幅減は体調不良リスク
    else if (entry.horseWeightDiff < -5) weightScore = -2; // やや減は注意
    else if (entry.horseWeightDiff > 20) weightScore = -5; // 極端な増量は仕上がり不足
    else if (entry.horseWeightDiff > 15) weightScore = -3; // 大幅増は仕上がり不足
    else if (entry.horseWeightDiff > 8) weightScore = -1; // やや増は注意
    else if (entry.horseWeightDiff >= -2 && entry.horseWeightDiff <= 4) weightScore = 4; // 微増は好調サイン
    else if (entry.horseWeightDiff >= -4 && entry.horseWeightDiff <= 6) weightScore = 2; // 安定範囲
  }
  // 7b. 絶対体重×距離適性（地方競馬ダート基準）
  if (entry.horseWeight) {
    const w = entry.horseWeight;
    if (distance <= 1200) {
      // 短距離: 440-480kgが理想（スピード型）
      if (w >= 440 && w <= 480) weightScore += 3;
      else if (w >= 420 && w <= 500) weightScore += 1;
      else if (w > 520) weightScore -= 2; // 重すぎる
    } else if (distance <= 1600) {
      // マイル: 450-500kgが理想
      if (w >= 450 && w <= 500) weightScore += 3;
      else if (w >= 430 && w <= 520) weightScore += 1;
    } else if (distance <= 2000) {
      // 中距離: 460-510kgが理想（パワー型）
      if (w >= 460 && w <= 510) weightScore += 3;
      else if (w >= 440 && w <= 530) weightScore += 1;
      else if (w < 430) weightScore -= 2; // 軽すぎる
    } else {
      // 長距離: 470-520kgが理想（スタミナ+パワー）
      if (w >= 470 && w <= 520) weightScore += 3;
      else if (w >= 450 && w <= 540) weightScore += 1;
      else if (w < 440) weightScore -= 2;
    }
    // 7c. 重馬場での体重ボーナス
    if (trackCondition && (trackCondition === '重' || trackCondition === '不良')) {
      if (w >= 480) weightScore += 2; // 重馬場では大型馬が有利
      else if (w < 440) weightScore -= 2; // 軽量馬は重馬場苦手
    }
  }
  
  // 8. 年齢スコア
  let ageScore = 0;
  if (entry.age === 2) {
    // 2歳戦: 体重が重い馬は早熟傾向で有利
    if (entry.horseWeight && entry.horseWeight > 460) ageScore = 3;
    else if (entry.horseWeight && entry.horseWeight > 440) ageScore = 2;
    else ageScore = 1;
  } else if (entry.age === 3) ageScore = 3; // 成長力
  else if (entry.age === 4) ageScore = 4; // ピーク
  else if (entry.age === 5) ageScore = 2;
  else if (entry.age >= 7) ageScore = -3; // 高齢は衰え
  
  // 9. パドックスコア（直前情報）
  let paddockScore = 0;
  if (paddock) {
    // 心拍数: 理想は30-40bpm、高すぎると興奮、低すぎると無気力
    if (paddock.heartRate) {
      if (paddock.heartRate >= 30 && paddock.heartRate <= 40) paddockScore += 3;
      else if (paddock.heartRate > 50) paddockScore -= 4; // 過度の興奮
      else if (paddock.heartRate < 25) paddockScore -= 2; // 無気力
    }
    // 興奮度: 適度(2-3)がベスト、高すぎ(5)はマイナス
    if (paddock.excitement) {
      if (paddock.excitement <= 3) paddockScore += (3 - paddock.excitement + 1);
      else if (paddock.excitement >= 4) paddockScore -= (paddock.excitement - 3) * 2;
    }
    // 疲弊度: 低いほど良い
    if (paddock.fatigue) {
      paddockScore -= (paddock.fatigue - 1) * 2;
    }
    // 集中力: 高いほど良い
    if (paddock.focus) {
      paddockScore += (paddock.focus - 3) * 2;
    }
    // 騎手指示従順度: 高いほど良い
    if (paddock.obedience) {
      paddockScore += (paddock.obedience - 3) * 2;
    }
    // 馬体コンディション: 高いほど良い
    if (paddock.bodyCondition) {
      paddockScore += (paddock.bodyCondition - 3) * 2;
    }
    // 射精前: 大幅マイナス（集中力低下・スタミナ消耗）
    if (paddock.preEjaculation) {
      paddockScore -= 8;
    }
  }
  
  // 10. 出走間隔スコア（過酷ローテ検知）
  // ※現状はNarEntryInfoに前走日がないため、年齢とオッズから推定
  let intervalScore = 0;
  // 高齢馬で人気が高い（オッズが低い）場合、過剰人気のリスクあり
  if (entry.age >= 7 && entry.odds && entry.odds < 5) {
    intervalScore = -3; // 高齢人気馬は衰えリスク
  }
  // 若馬（3歳）でオッズが高い場合、成長余地あり
  if (entry.age === 3 && entry.odds && entry.odds > 10 && entry.odds < 30) {
    intervalScore = 2; // 若馬の成長力に期待
  }
  
  // 11. クラス補正（オッズと人気から推定）
  let classScore = 0;
  if (entry.odds && entry.popularity) {
    // 人気が低いのにオッズが急落→降級馬（プロが買っている）
    if (entry.popularity >= 5 && entry.odds < 8) {
      classScore = 4; // 降級馬の可能性（プロが評価）
    }
    // 1番人気でオッズが極端に低い→実力断然トップ
    if (entry.popularity === 1 && entry.odds < 2.0) {
      classScore = 3; // 圧倒的本命
    }
    // 人気が高いがオッズが不自然に高い→昇級苦戦リスク
    if (entry.popularity <= 3 && entry.odds > 5) {
      classScore = -2; // 昇級苦戦の可能性
    }
  }
  
  // 12. 展開予測スコア（距離×頭数×枠番から推定）
  let paceScore = 0;
  // 少頭数（8頭以下）で内枠→スローペースで先行有利
  if (headCount <= 8 && entry.gateNumber <= 3) {
    paceScore = 2;
  }
  // 多頭数（12頭以上）で外枠→ハイペースになりやすく差し馬有利
  if (headCount >= 12 && entry.gateNumber >= headCount - 2) {
    paceScore = -1; // 外枠は不利だが差し馬なら展開向き
  }
  // 短距離で内枠→先行有利
  if (distance <= 1200 && entry.gateNumber <= 3) {
    paceScore += 2;
  }
  // 長距離で外枠→スタミナ消耗
  if (distance >= 2000 && entry.gateNumber >= headCount - 2) {
    paceScore -= 1;
  }
  
  return { base, jockeyBonus, oddsScore, gateScore, trackConditionScore, bloodlineScore, weightScore, ageScore, paddockScore, intervalScore, classScore, paceScore, jockeyStatsScore: 0, compatibilityScore: 0, oddsMovementScore: 0, abilityScore: 0, marketSignalScore: 0, jockeySampleSize: 0, compatibilityRides: 0 };
}

function generateLegacyNarBettingRecommendation(results: NarScoreResult[]): {
  trifecta: string;
  trio: string;
  quinella: string;
  wide: string;
  exacta: string;
  trifectaCount: number;
  trioCount: number;
  quinellaCount: number;
  wideCount: number;
  exactaCount: number;
  totalBets: number;
  reasoning: string[];
} {
  const top5 = results.slice(0, 5);
  const honmei = top5[0];
  const taikou = top5[1];
  const tanana = top5[2];
  const renka1 = top5[3];
  const renka2 = top5[4];
  
  if (!honmei || !taikou || !tanana) {
    return { trifecta: "データ不足", trio: "データ不足", quinella: "データ不足", wide: "データ不足", exacta: "データ不足", trifectaCount: 0, trioCount: 0, quinellaCount: 0, wideCount: 0, exactaCount: 0, totalBets: 0, reasoning: [] };
  }
  
  const reasoning: string[] = [];
  reasoning.push(`◎${honmei.horseName}（スコア${Math.round(honmei.totalScore)}pt）を軸に構成`);
  if (honmei.breakdown.jockeyBonus > 5) {
    reasoning.push(`騎手${honmei.jockey}の高い技量を評価`);
  }
  if (tanana.odds && tanana.odds > 10) {
    reasoning.push(`▲${tanana.horseName}（${tanana.odds}倍）の穴馬妙味に注目`);
  }
  if (honmei.expectedValue && honmei.expectedValue > 20) {
    reasoning.push(`◎${honmei.horseName}の期待値+${honmei.expectedValue.toFixed(1)}%が高く軸として最適`);
  }
  
  const nums = top5.map(r => r.horseNumber);
  const isShortPricedAxis = honmei.odds !== null && honmei.odds <= 5;
  
  // 3連単: 人気軸では1着を固定し、穴軸の場合だけ1着候補を2頭にして取り逃しを抑える。
  const trifectaStr = isShortPricedAxis
    ? `本線: 1着${nums[0]} / 2着${nums[1]},${nums[2]},${nums[3]},${nums[4]} / 3着${nums[1]},${nums[2]},${nums[3]},${nums[4]}`
    : `本線: 1着${nums[0]},${nums[1]} / 2着${nums[0]},${nums[1]},${nums[2]} / 3着${nums[0]},${nums[1]},${nums[2]},${nums[3]},${nums[4]}`;
  const trifectaCount = isShortPricedAxis ? 12 : 18;
  reasoning.push(isShortPricedAxis
    ? `◎が${honmei.odds?.toFixed(1)}倍の人気軸のため、1着固定・12点へ圧縮`
    : `◎が${honmei.odds?.toFixed(1) ?? "不明"}倍の穴軸のため、1着候補を2頭にした18点フォーメーションを採用`);
  
  // 3連複: 保険BOXではなく◎の1頭軸流しで重複購入を避ける。
  const trioStr = `${nums[0]} - ${nums[1]},${nums[2]},${nums[3]},${nums[4]}（1頭軸流し）`;
  const trioCount = 6; // 相手4頭から2頭を選ぶ = 4C2
  
  // 馬連: ◎軸流し
  const quinellaStr = `${nums[0]}-${nums[1]}, ${nums[0]}-${nums[2]}, ${nums[0]}-${nums[3]}`;
  const quinellaCount = 3;
  
  // ワイド: ◎○▲ボックス
  const wideStr = `${nums[0]}-${nums[1]}, ${nums[0]}-${nums[2]}, ${nums[1]}-${nums[2]}`;
  const wideCount = 3;
  
  // 馬単: ◎→1着固定
  const exactaStr = `${nums[0]}→${nums[1]}, ${nums[0]}→${nums[2]}`;
  const exactaCount = 2;
  
  const totalBets = trifectaCount + trioCount + quinellaCount + wideCount + exactaCount;
  
  return {
    trifecta: trifectaStr,
    trio: trioStr,
    quinella: quinellaStr,
    wide: wideStr,
    exacta: exactaStr,
    trifectaCount,
    trioCount,
    quinellaCount,
    wideCount,
    exactaCount,
    totalBets,
    reasoning,
  };
}

/**
 * 相対期待値がプラスの馬だけを使い、無理に買わない少点数の標準推奨を作る。
 * 3連系の厳密な組合せ期待値を推定しているわけではないため、相関を仮定した回収保証はしない。
 */
export function generateNarBettingRecommendation(results: NarScoreResult[], options: { oddsMode?: "official" | "predicted" } = {}): {
  trifecta: string;
  trio: string;
  quinella: string;
  wide: string;
  exacta: string;
  trifectaCount: number;
  trioCount: number;
  quinellaCount: number;
  wideCount: number;
  exactaCount: number;
  totalBets: number;
  riskWarning?: string;
  formationCaution?: string;
  formation?: { axis: number; first?: number[]; second: number[]; third: number[]; trioPartners: number[] };
  referenceOnly?: boolean;
  referenceNotice?: string;
  reasoning: string[];
} {
  const selection = selectValueCandidates(
    results.map((result) => ({ ...result, score: result.totalScore })),
    0,
    6,
  );
  const scoreRanked = [...results]
    .filter((candidate) => Number.isInteger(candidate.horseNumber) && candidate.horseNumber > 0)
    .sort((left, right) => right.totalScore - left.totalScore);
  const createReferenceFormation = (reason: string) => {
    const formation = buildScoreFirstFormation(scoreRanked.map(candidate => ({ horseNumber: candidate.horseNumber, score: candidate.totalScore })));
    if (!formation) return null;
    const axis = scoreRanked[0]!;
    const totalBets = formation.trifectaCount + formation.trioCount;
    const referenceNotice = "購入推奨なし：期待値が未算出または根拠不足のため、スコア順位だけを使った参考フォーメーションです。実際の購入・精算・実績集計の対象にはなりません。";
    return {
      trifecta: `参考フォーメーション: 1着${formation.first.join(",")} / 2着${formation.second.join(",")} / 3着${formation.third.join(",")}（${formation.trifectaCount}点）`,
      trio: formation.trioCount > 0 ? `参考カバー: ${formation.first.length > 1 ? `1着候補${formation.first.join(",")}を含む ${formation.trioPartners.join(",")}` : `${formation.axis} - ${formation.trioPartners.join(",")}`}（${formation.first.length > 1 ? "分散カバー" : "1頭軸流し"}・${formation.trioCount}点）` : "対象外",
      quinella: "対象外",
      wide: "対象外",
      exacta: "対象外",
      trifectaCount: formation.trifectaCount,
      trioCount: formation.trioCount,
      quinellaCount: 0,
      wideCount: 0,
      exactaCount: 0,
      totalBets,
      riskWarning: formation.trigamiWarning,
      formationCaution: referenceNotice,
      formation: { axis: formation.axis, first: formation.first, second: formation.second, third: formation.third, trioPartners: formation.trioPartners },
      referenceOnly: true,
      referenceNotice,
      reasoning: [
        `通常買い目は見送り：${reason}`,
        `◎${axis.horseName}（スコア1位）を軸に、スコア上位だけで参考フォーメーションを表示`,
        referenceNotice,
      ],
    };
  };

  if (options.oddsMode === "predicted") {
    const formation = buildScoreFirstFormation(scoreRanked.map(candidate => ({ horseNumber: candidate.horseNumber, score: candidate.totalScore })));
    if (formation) {
      const axis = scoreRanked[0]!;
      const totalBets = formation.trifectaCount + formation.trioCount;
      return {
        trifecta: `スコア順本線: 1着${formation.first.join(",")} / 2着${formation.second.join(",")} / 3着${formation.third.join(",")}（${formation.trifectaCount}点）`,
        trio: formation.trioCount > 0 ? `スコア順カバー: ${formation.first.length > 1 ? `1着候補${formation.first.join(",")}を含む ${formation.trioPartners.join(",")}` : `${formation.axis} - ${formation.trioPartners.join(",")}`}（${formation.first.length > 1 ? "分散カバー" : "1頭軸流し"}・${formation.trioCount}点）` : "対象外",
        quinella: "対象外",
        wide: "対象外",
        exacta: "対象外",
        trifectaCount: formation.trifectaCount,
        trioCount: formation.trioCount,
        quinellaCount: 0,
        wideCount: 0,
        exactaCount: 0,
        totalBets,
        riskWarning: "公式組合せオッズが未取得のため、トリガミ判定はできません。予想オッズは市場で成立した実オッズではありません。",
        formationCaution: formation.caution ?? undefined,
        formation: { axis: formation.axis, first: formation.first, second: formation.second, third: formation.third, trioPartners: formation.trioPartners },
        reasoning: [
          "公式オッズ未取得のため、能力スコア順位だけで通常フォーメーションを構成",
          formation.first.length > 1 ? `能力1・2位の差が${formation.scoreGap}点のため、${formation.first.join("・")}を1着候補へ分散し、1位不発時をカバー` : `◎${axis.horseName}（スコア1位）を1着軸に固定し、スコア2〜4位を2着、スコア2〜5位を3着候補に採用`,
          `3連単${formation.trifectaCount}点・3連複${formation.trioCount}点、合計${totalBets}点。予想オッズは市場実勢とは異なり、的中・収益を保証しません。`,
          ...(formation.caution ? [formation.caution] : []),
        ],
      };
    }
  }

  if (selection.skipped) {
    const reference = createReferenceFormation(selection.reason);
    if (reference) return reference;
    return {
      trifecta: "見送り",
      trio: "見送り",
      quinella: "対象外",
      wide: "対象外",
      exacta: "対象外",
      trifectaCount: 0,
      trioCount: 0,
      quinellaCount: 0,
      wideCount: 0,
      exactaCount: 0,
      totalBets: 0,
      reasoning: [selection.reason, "低期待値の買い目を補充して点数を増やすことはしません"],
    };
  }

  const candidates = [...selection.candidates].sort((a, b) => b.totalScore - a.totalScore);
  const formation = buildScoreFirstFormation(candidates.map(candidate => ({ horseNumber: candidate.horseNumber, score: candidate.totalScore })));
  if (!formation) {
    return { trifecta: "見送り", trio: "見送り", quinella: "対象外", wide: "対象外", exacta: "対象外", trifectaCount: 0, trioCount: 0, quinellaCount: 0, wideCount: 0, exactaCount: 0, totalBets: 0, reasoning: [selection.reason, "フォーメーションを組むための候補が不足しています"] };
  }
  const axis = candidates[0]!;
  const trifecta = `スコア順本線: 1着${formation.first.join(",")} / 2着${formation.second.join(",")} / 3着${formation.third.join(",")}（${formation.trifectaCount}点）`;
  const trio = formation.trioCount > 0 ? `スコア順カバー: ${formation.first.length > 1 ? `1着候補${formation.first.join(",")}を含む ${formation.trioPartners.join(",")}` : `${formation.axis} - ${formation.trioPartners.join(",")}`}（${formation.first.length > 1 ? "分散カバー" : "1頭軸流し"}・${formation.trioCount}点）` : "対象外";
  const totalBets = formation.trifectaCount + formation.trioCount;

  return {
    trifecta,
    trio,
    quinella: "対象外",
    exacta: "対象外",
    trifectaCount: formation.trifectaCount,
    trioCount: formation.trioCount,
    quinellaCount: 0,
    wide: "対象外",
    wideCount: 0,
    exactaCount: 0,
    totalBets,
    riskWarning: formation.trigamiWarning,
    formationCaution: formation.caution ?? undefined,
    formation: { axis: formation.axis, first: formation.first, second: formation.second, third: formation.third, trioPartners: formation.trioPartners },
    reasoning: [
      selection.reason,
      formation.first.length > 1 ? `能力1・2位の差が${formation.scoreGap}点のため、${formation.first.join("・")}を1着候補へ分散し、1位不発時をカバー` : `◎${axis.horseName}（スコア1位）を1着軸に固定し、スコア2〜4位を2着、スコア2〜5位を3着候補に採用`,
      `堅実パターンは3連単${formation.trifectaCount}点・3連複${formation.trioCount}点、合計${totalBets}点・想定投資額${totalBets * 100}円（1点100円換算）`,
      ...(formation.caution ? [formation.caution] : []),
      formation.trigamiWarning,
    ],
  };
}

// ==========================================
// ルーター定義
// ==========================================

export const narPredictionRouter = router({
  /**
   * 指定日のNARレース一覧を取得
   */
  getRaces: publicProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb();

        // 正規CSVから取り込んだNARレースを最優先する。
        // 外部HTMLの構造変更やネットワーク障害があっても、取込直後に予想へ進める。
        if (db) {
          const importedRaces = await db.select({
            raceId: races.raceId,
            raceNumber: races.raceNumber,
            raceName: races.raceName,
            startTime: races.postTime,
            surface: races.surface,
            distance: races.distance,
            headCount: races.headCount,
            venue: races.venueName,
            raceDate: races.raceDate,
            status: races.status,
          }).from(races).where(and(eq(races.raceDate, input.date), eq(races.organizer, "NAR")));

          if (importedRaces.length > 0) {
            const raceIds = importedRaces.map(race => race.raceId);
            const existingPredictions = await db.select({ raceId: predictions.raceId })
              .from(predictions)
              .where(inArray(predictions.raceId, raceIds));
            const predictedRaceIds = new Set(existingPredictions.map(prediction => prediction.raceId));
            return {
              races: importedRaces.map(race => ({
                raceId: race.raceId,
                raceNumber: race.raceNumber,
                raceName: race.raceName,
                startTime: race.startTime ?? "未定",
                surface: race.surface ?? "dirt",
                distance: race.distance ?? 0,
                headCount: race.headCount ?? 0,
                venue: race.venue,
                date: race.raceDate,
                status: race.status === "results_confirmed" ? "finished" : "upcoming" as const,
                hasPrediction: predictedRaceIds.has(race.raceId),
                source: "official_csv" as const,
              })),
              error: null,
            };
          }
        }

        const raceList = await fetchNarRaceList(input.date);
        
        // DBから予想済みレースIDを取得
        let predictedRaceIds = new Set<string>();
        if (db && raceList.length > 0) {
          try {
            const raceIds = raceList.map(r => r.raceId);
            const existingPredictions = await db.select({ raceId: predictions.raceId })
              .from(predictions)
              .where(inArray(predictions.raceId, raceIds));
            predictedRaceIds = new Set(existingPredictions.map(p => p.raceId));
          } catch (e) {
            // DBエラーは無視
          }
        }
        
        const racesWithPrediction = raceList.map(r => ({
          ...r,
          hasPrediction: predictedRaceIds.has(r.raceId),
        }));
        
        return { races: racesWithPrediction, error: null };
      } catch (e: any) {
        console.error("[NAR] getRaces error:", e.message);
        return { races: [], error: "レース情報の取得に失敗しました" };
      }
    }),

  /**
   * 今週のNAR開催日一覧を取得
   */
  getThisWeekDates: publicProcedure.query(async () => {
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dates: string[] = [];
    
    // 今日から7日間
    for (let i = 0; i < 7; i++) {
      const d = new Date(jstNow.getTime() + i * 86400000);
      dates.push(d.toISOString().split("T")[0]!);
    }
    
    return dates;
  }),

  /**
   * 指定レースの出馬表を取得して予想を実行
   */
  runPrediction: publicProcedure
    .input(z.object({
      raceId: z.string(),
      venue: z.string(),
      distance: z.number(),
      headCount: z.number(),
      trackCondition: z.string().optional(),
      surface: z.string().optional(),
      raceDate: z.string().optional(),
      raceNumber: z.number().optional(),
      raceName: z.string().optional(),
      paddockData: z.array(z.object({
        horseNumber: z.number(),
        heartRate: z.number().nullable().optional(),
        excitement: z.number().nullable().optional(),
        fatigue: z.number().nullable().optional(),
        focus: z.number().nullable().optional(),
        obedience: z.number().nullable().optional(),
        bodyCondition: z.number().nullable().optional(),
        preEjaculation: z.boolean().nullable().optional(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        const validation = await resolveValidatedNarRace(db, {
          raceId: input.raceId,
          venue: input.venue,
          raceDate: input.raceDate,
          raceNumber: input.raceNumber,
          raceName: input.raceName,
          surface: input.surface,
          distance: input.distance,
          trackCondition: input.trackCondition ?? null,
        });
        if (!validation.canonicalRaceId) {
          return { success: false, error: "レース条件を検証できませんでした。開催日・競馬場・レース番号を確認してください", results: [], recommendation: null, validation };
        }

        // 取込済みの正規出馬表を最優先に使う。公開予想モードでは市場オッズ・人気を
        // 入力へ渡さず、未保存時だけ既存の取得処理へフォールバックする。
        const savedEntries = db
          ? await db.select().from(entries).where(eq(entries.raceId, validation.canonicalRaceId))
          : [];
        const locallyStoredEntries: NarEntryInfo[] = savedEntries.map(entry => ({
          gateNumber: entry.gateNumber ?? 0,
          horseNumber: entry.horseNumber,
          horseName: entry.horseName,
          horseId: "",
          sex: entry.sex ?? "",
          age: entry.age ?? 0,
          weight: entry.weight ?? 0,
          jockey: entry.jockey ?? "",
          trainer: entry.trainer ?? "",
          horseWeight: entry.horseWeight ?? null,
          horseWeightDiff: entry.horseWeightDiff ?? null,
          odds: null,
          popularity: null,
          sire: entry.sire ?? null,
        }));
        const fetchedEntries = locallyStoredEntries.length > 0
          ? locallyStoredEntries
          : await fetchNarEntries(validation.canonicalRaceId);
        const raceEntries = fetchedEntries.map(entry => ({ ...entry, odds: null, popularity: null }));
        
        if (raceEntries.length === 0) {
          return {
            success: false,
            error: "出馬表データを取得できませんでした",
            results: [],
            recommendation: null,
          };
        }
        
        // DB蓄積済みの騎手条件別成績・馬騎手相性・直前オッズ急変を取得
        const enhancements = await Promise.all(raceEntries.map(entry => getNARScoreEnhancement(db, {
          raceId: validation.canonicalRaceId!,
          horseNumber: entry.horseNumber,
          horseName: entry.horseName,
          jockeyName: entry.jockey,
          venue: validation.venue ?? input.venue,
          surface: validation.surface ?? input.surface ?? "dirt",
          distance: validation.distance ?? input.distance,
        })));

        // スコアリング
        let scored: Array<NarScoreResult & { score: number }> = raceEntries.map((entry, index) => {
          const paddock = input.paddockData?.find(p => p.horseNumber === entry.horseNumber) ?? null;
          const breakdown = calculateNarScore(
            entry,
            validation.venue ?? input.venue,
            raceEntries.length,
            validation.distance ?? input.distance,
            validation.trackCondition ?? input.trackCondition ?? null,
            entry.sire,
            paddock,
          );
          const enhancement = enhancements[index]!;
          // 条件別騎手成績は20騎乗以上、馬×騎手の相性は3騎乗以上を最低標本数とする。
          breakdown.jockeyStatsScore = enhancement.jockeySampleSize >= 20 ? enhancement.jockeyStatsScore : 0;
          breakdown.compatibilityScore = enhancement.compatibilityRides >= 3 ? enhancement.compatibilityScore : 0;
          breakdown.oddsMovementScore = enhancement.oddsMovementScore;
          breakdown.jockeySampleSize = enhancement.jockeySampleSize;
          breakdown.compatibilityRides = enhancement.compatibilityRides;
          // 能力評価は枠・騎手・馬場・展開など取得済みの適性データだけで算出し、オッズ由来の要素は市場参考値として分離する。
          const totalScore = breakdown.base + breakdown.jockeyBonus + breakdown.gateScore + breakdown.trackConditionScore + breakdown.bloodlineScore + breakdown.weightScore + breakdown.ageScore + breakdown.paddockScore + breakdown.paceScore + breakdown.jockeyStatsScore + breakdown.compatibilityScore;
          breakdown.abilityScore = totalScore;
          breakdown.marketSignalScore = breakdown.oddsScore + breakdown.intervalScore + breakdown.classScore + breakdown.oddsMovementScore;
          return {
            horseNumber: entry.horseNumber,
            horseName: entry.horseName,
            jockey: entry.jockey,
            gateNumber: entry.gateNumber,
            sex: entry.sex,
            age: entry.age,
            weight: entry.weight,
            odds: entry.odds,
            popularity: entry.popularity,
            totalScore,
            score: totalScore,
            winProbability: 0,
            expectedValue: null,
            breakdown,
            rating: "",
          };
        });
        
        // まず既存の決定論的スコアから相対勝率・期待値を算出し、三支点の市場評価に利用する。
        scored = applyPredictionMetrics(scored);
        const localBiasNotice = "地方競馬のコース別枠順実績は、公式確定結果の十分な標本が未蓄積のため能力スコアへ未反映です。騎手・馬騎手相性は標本数の基準を満たす場合のみ反映します。";

        const dashboardPaddockData = input.paddockData?.map(paddock => ({
          horseNumber: paddock.horseNumber,
          heartRate: paddock.heartRate ?? undefined,
          excitementLevel: paddock.excitement ?? undefined,
          concentrationLevel: paddock.focus ?? undefined,
          obedienceLevel: paddock.obedience ?? undefined,
          fatigueLevel: paddock.fatigue ?? undefined,
          muscleTone: paddock.bodyCondition ?? undefined,
        }));
        const threeViewByHorse = new Map(calculateThreeViewAnalyses(scored, dashboardPaddockData).map(analysis => [analysis.horseNumber, analysis]));

        // 三支点のうち、市場評価（オッズ・期待値）は最終能力順位へ混在させない。
        // 能力・適性（AI）と状態（調教師）だけを補助評価に使い、市場評価は別表示に残す。
        scored = scored.map(result => {
          const analysis = threeViewByHorse.get(result.horseNumber);
          if (!analysis) return result;
          const baseScore = result.totalScore;
          const abilitySupportScore = Math.round(analysis.threeView.ai.total * 0.60 + analysis.threeView.trainer.total * 0.40);
          const totalScore = Math.round(baseScore * 0.70 + abilitySupportScore * 0.30);
          return {
            ...result,
            baseScore,
            totalScore,
            score: totalScore,
            threeView: {
              overallScore: abilitySupportScore,
              confidence: analysis.threeView.overall.confidence,
              verdict: analysis.threeView.overall.verdict,
              strongPoints: analysis.threeView.overall.strongPoints,
              riskFactors: analysis.threeView.overall.riskFactors,
            },
          };
        });
        scored = applyPredictionMetrics(scored);
        const raceAnalysis = analyzeRaceDiagnostics(scored.map(result => ({ score: result.totalScore, odds: null })));

        // スコア順にソート
        scored.sort((a, b) => b.totalScore - a.totalScore);
        
        // レーティング付与
        const ratings = ["◎", "○", "▲", "△", "△"];
        scored.forEach((s, i) => {
          s.rating = i < 5 ? ratings[i]! : "☆";
        });
        
        // 買い目推奨
        const predictionOnlyResults = scored.map(result => ({ ...result, odds: null, expectedValue: null }));
        const recommendation = generateNarBettingRecommendation(predictionOnlyResults, { oddsMode: "predicted" });
        recommendation.reasoning.unshift("三支点総合（AI・市場・状態評価）を通常予想スコアへ自動統合");
        const predictedOddsByHorseNumber = new Map(scored.map(result => [result.horseNumber, result.predictedOdds ?? null]));
        const longshotRecommendation = buildAnaBettingRecommendationForRace({
          entries: raceEntries.map(entry => ({
            ...entry,
            odds: predictedOddsByHorseNumber.get(entry.horseNumber) ?? null,
            popularity: null,
          })),
          venue: validation.venue ?? input.venue,
          surface: validation.surface ?? input.surface ?? "dirt",
          distance: validation.distance ?? input.distance,
          trackCondition: validation.trackCondition ?? input.trackCondition ?? null,
          scoreRankedHorseNumbers: [...scored].sort((left, right) => right.totalScore - left.totalScore).map(result => result.horseNumber),
          oddsMode: "predicted",
        });
        
        // DB保存（予想履歴として）
        try {
          if (db) {
            const top3 = scored.slice(0, 3);
            const renkaNumbers = scored.slice(3, 5).map(e => e.horseNumber);
            await db.insert(predictions).values({
              raceId: validation.canonicalRaceId,
              honmei: top3[0]?.horseNumber ?? 0,
              taikou: top3[1]?.horseNumber ?? 0,
              tanana: top3[2]?.horseNumber ?? 0,
              renka: JSON.stringify(renkaNumbers),
              recommendedBets: JSON.stringify(recommendation),
              investAmount: recommendation.referenceOnly ? 0 : recommendation.totalBets * 100,
              reasoning: recommendation.reasoning.join("\n"),
            });
            const [savedPrediction] = await db
              .select({ id: predictions.id })
              .from(predictions)
              .where(eq(predictions.raceId, validation.canonicalRaceId))
              .orderBy(desc(predictions.predictedAt), desc(predictions.id))
              .limit(1);
            if (savedPrediction) {
              await savePredictionTicketSets(db, {
                predictionId: savedPrediction.id,
                raceId: validation.canonicalRaceId,
                sets: [
                  { strategy: "score", ticketData: recommendation, investAmount: recommendation.referenceOnly ? 0 : recommendation.totalBets * 100 },
                  { strategy: "longshot", ticketData: longshotRecommendation, investAmount: longshotRecommendation.totalBets * 100 },
                ],
              });
            }
            console.log(`[NAR] 予想結果をDBに保存: ${validation.canonicalRaceId}`);
          }
        } catch (saveErr: any) {
          console.error("[NAR] 予想結果のDB保存に失敗:", saveErr.message);
        }
        
        const publicResults = scored.map(result => ({
          ...result,
          odds: result.predictedOdds ?? null,
          popularity: null,
          expectedValue: null as number | null,
          oddsSource: "predicted" as const,
          breakdown: {
            ...result.breakdown,
            oddsScore: 0,
            oddsMovementScore: 0,
            marketSignalScore: 0,
          },
        }));

        return {
          success: true,
          error: null,
          results: publicResults,
          recommendation,
          longshotRecommendation,
          raceId: validation.canonicalRaceId,
          raceAnalysis,
          localBiasNotice,
          validation,
        };
      } catch (e: any) {
        console.error("[NAR] runPrediction error:", e.message);
        return {
          success: false,
          error: `予想実行エラー: ${e.message}`,
          results: [],
          recommendation: null,
        };
      }
    }),

  /**
   * NARレースの既存予想を取得
   */
  getExistingPrediction: publicProcedure
    .input(z.object({
      raceId: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [prediction] = await db.select().from(predictions)
        .where(eq(predictions.raceId, input.raceId))
        .orderBy(desc(predictions.predictedAt))
        .limit(1);

      if (!prediction) return null;

      // DBに保存されている出馬表・戦略別買い目を返す。
      const [entryList, ticketSets] = await Promise.all([
        db.select().from(entries).where(eq(entries.raceId, input.raceId)),
        db.select().from(predictionTicketSets).where(eq(predictionTicketSets.predictionId, prediction.id)),
      ]);

      // 出馬表データの最終更新時刻を取得
      let entriesUpdatedAt: Date | null = null;
      if (entryList.length > 0) {
        entriesUpdatedAt = entryList.reduce((latest, e) => {
          return e.updatedAt > latest ? e.updatedAt : latest;
        }, entryList[0].updatedAt);
      }

      return {
        prediction,
        ticketSets,
        entries: entryList,
        entriesUpdatedAt,
      };
    }),
});
import { sql } from "drizzle-orm";
