/**
 * NAR（地方競馬）レース情報・出馬表・オッズ自動取得ハンドラー
 * nar.netkeiba.com から当日〜翌日のレース情報と出馬表をスクレイピングしてDBに保存する
 * Heartbeat定期実行対応（毎日朝8時・昼12時・夕方16時に実行推奨）
 */
import { Request, Response } from "express";
import { getDb } from "../db";
import { races, entries } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const NAR_BASE = "https://nar.netkeiba.com";

// 競馬場コードマッピング
const VENUE_CODE_MAP: Record<string, string> = {
  "帯広": "01", "門別": "02", "盛岡": "03", "水沢": "04",
  "浦和": "05", "船橋": "06", "大井": "07", "川崎": "08",
  "金沢": "09", "笠松": "10", "名古屋": "11", "園田": "12",
  "姫路": "13", "高知": "14", "佐賀": "15",
};

interface NarRaceInfo {
  netkeibaRaceId: string;
  raceNumber: number;
  raceName: string;
  postTime: string | null;
  surface: "turf" | "dirt";
  distance: number;
  headCount: number;
  venue: string;
  venueCode: string;
  raceDate: string;
}

interface NarEntryInfo {
  gateNumber: number;
  horseNumber: number;
  horseName: string;
  horseId: string;
  sex: string;
  age: number;
  weight: number;
  jockey: string;
  trainer: string;
  horseWeight: number | null;
  horseWeightDiff: number | null;
  odds: number | null;
  popularity: number | null;
  sire: string | null;
}

/**
 * URLからHTMLを取得
 */
async function fetchHtml(url: string, referer?: string): Promise<string> {
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (referer) headers["Referer"] = referer;
  
  try {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    return await resp.text();
  } catch (e) {
    console.error(`[fetchNarRaces] Error fetching ${url}:`, e);
    return "";
  }
}

/**
 * 指定日のNARレース一覧を取得
 */
async function fetchNarRaceList(dateStr: string): Promise<NarRaceInfo[]> {
  const dateCompact = dateStr.replace(/-/g, "");
  
  // レース一覧を取得
  const listUrl = `${NAR_BASE}/top/race_list_sub.html?kaisai_date=${dateCompact}`;
  const listHtml = await fetchHtml(listUrl, `${NAR_BASE}/top/race_list.html?kaisai_date=${dateCompact}`);
  
  if (!listHtml) return [];
  
  const allRaces: NarRaceInfo[] = [];
  
  // race_idを全て抽出
  const raceIdSet = new Set<string>();
  const raceIdRegex = /race_id=(\d+)/g;
  let raceIdMatch;
  while ((raceIdMatch = raceIdRegex.exec(listHtml)) !== null) {
    raceIdSet.add(raceIdMatch[1]!);
  }
  const raceIds = Array.from(raceIdSet);
  
  // 各レースのメタデータを取得するために、ブロック解析
  // 開催場ごとのブロック分割
  const venueBlocks = listHtml.split('<dl class="RaceList_DataList"');
  
  for (let i = 1; i < venueBlocks.length; i++) {
    const block = venueBlocks[i]!;
    
    // 開催場名
    const venueMatch = block.match(/<p class="RaceList_DataTitle[^"]*">\s*(?:<small>[^<]*<\/small>\s*)?([^\s<]+)/);
    const venue = venueMatch ? venueMatch[1]!.trim() : "不明";
    const venueCode = VENUE_CODE_MAP[venue] || venue.substring(0, 2);
    
    // 各レースを抽出（簡易パターン）
    const racePattern = /race_id=(\d+)[^>]*>[\s\S]*?<span>[\s\S]*?(\d+)R[\s\S]*?<\/span>[\s\S]*?<span class="ItemTitle">([^<]*)<\/span>[\s\S]*?<span>([^<]*)<\/span>\s*<span class="(?:Dart|Shiba)">([^<]*)<\/span>\s*(\d+)頭/g;
    
    let raceMatch;
    while ((raceMatch = racePattern.exec(block)) !== null) {
      const netkeibaRaceId = raceMatch[1]!;
      const raceNumber = parseInt(raceMatch[2]!);
      const raceName = raceMatch[3]!.trim() || `${raceNumber}R`;
      const startTime = raceMatch[4]!.trim();
      const surfaceDistance = raceMatch[5]!;
      const headCount = parseInt(raceMatch[6]!);
      
      // 芝/ダートと距離を分離
      const sdMatch = surfaceDistance.match(/(芝|ダ)(\d+)m/);
      const surface: "turf" | "dirt" = sdMatch && sdMatch[1] === "芝" ? "turf" : "dirt";
      const distance = sdMatch ? parseInt(sdMatch[2]!) : 0;
      
      // 発走時刻
      const timeMatch = startTime.match(/(\d{1,2}):(\d{2})/);
      const postTime = timeMatch ? `${String(parseInt(timeMatch[1]!)).padStart(2, "0")}:${timeMatch[2]}` : null;
      
      allRaces.push({
        netkeibaRaceId,
        raceNumber,
        raceName,
        postTime,
        surface,
        distance,
        headCount,
        venue,
        venueCode,
        raceDate: dateStr,
      });
    }
  }
  
  return allRaces;
}

/**
 * 指定レースの出馬表を取得（オッズ含む）
 */
async function fetchNarEntries(raceId: string): Promise<NarEntryInfo[]> {
  const url = `${NAR_BASE}/race/shutuba.html?race_id=${raceId}`;
  const html = await fetchHtml(url);
  
  if (!html) return [];
  
  const result: NarEntryInfo[] = [];
  
  const rowRegex = /<tr class="HorseList"[^>]*>[\s\S]*?<\/tr>/g;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[0];
    
    const wakuMatch = row.match(/<td class="Waku\d+">(\d+)<\/td>/);
    const gateNumber = wakuMatch ? parseInt(wakuMatch[1]!) : 0;
    
    const umabanMatch = row.match(/<td class="Umaban\d+">(\d+)<\/td>/);
    const horseNumber = umabanMatch ? parseInt(umabanMatch[1]!) : 0;
    
    const nameMatch = row.match(/<td class="HorseInfo">[\s\S]*?<span class="HorseName"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/);
    const horseName = nameMatch ? nameMatch[1]!.trim() : "";
    
    const ageMatch = row.match(/<span class="Age">([^<]+)<\/span>/);
    const sexAgeStr = ageMatch ? ageMatch[1]!.trim() : "";
    const sexParsed = sexAgeStr.match(/(牡|牝|セ)(\d+)/);
    const sex = sexParsed ? sexParsed[1]! : "";
    const age = sexParsed ? parseInt(sexParsed[2]!) : 0;
    
    const weightMatch = row.match(/<td class="Txt_C">\s*([\d.]+)\s*<\/td>/);
    const weight = weightMatch ? parseFloat(weightMatch[1]!) : 0;
    
    const jockeyMatch = row.match(/<td class="Jockey">[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    const jockey = jockeyMatch ? jockeyMatch[1]!.trim() : "";
    
    const trainerMatch = row.match(/<td class="Trainer">[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    const trainer = trainerMatch ? trainerMatch[1]!.trim() : "";
    
    const hwMatch = row.match(/<td class="Weight">\s*(\d+)<small>\(([+-]?\d+)\)<\/small>/);
    const horseWeight = hwMatch ? parseInt(hwMatch[1]!) : null;
    const horseWeightDiff = hwMatch ? parseInt(hwMatch[2]!) : null;
    
    const oddsMatch = row.match(/<td class="Popular Txt_R">\s*(?:<span[^>]*>)?([\d.]+)/);
    const odds = oddsMatch ? parseFloat(oddsMatch[1]!) : null;
    
    const popMatch = row.match(/<td class="Popular Txt_C[^"]*">\s*<span>(\d+)<\/span>/);
    const popularity = popMatch ? parseInt(popMatch[1]!) : null;
    
    if (horseName && horseNumber > 0) {
      result.push({ gateNumber, horseNumber, horseName, horseId: "", sex, age, weight, jockey, trainer, horseWeight, horseWeightDiff, odds, popularity, sire: null });
    }
  }
  
  return result;
}

/**
 * レース情報をDBに保存（UPSERT）
 */
async function saveRacesToDb(db: any, racesData: NarRaceInfo[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  
  for (const race of racesData) {
    const dateCompact = race.raceDate.replace(/-/g, "");
    const raceId = `${dateCompact}${race.venueCode}${String(race.raceNumber).padStart(2, "0")}`;
    
    const existing = await db.select({ id: races.id }).from(races).where(eq(races.raceId, raceId)).limit(1);
    
    if (existing.length > 0) {
      await db.update(races).set({
        netkeibaRaceId: race.netkeibaRaceId,
        raceName: race.raceName,
        postTime: race.postTime,
        surface: race.surface,
        distance: race.distance,
        headCount: race.headCount,
      }).where(eq(races.raceId, raceId));
      updated++;
    } else {
      await db.insert(races).values({
        raceId,
        netkeibaRaceId: race.netkeibaRaceId,
        raceName: race.raceName,
        raceDate: race.raceDate,
        postTime: race.postTime,
        venueCode: race.venueCode,
        venueName: race.venue,
        raceNumber: race.raceNumber,
        surface: race.surface,
        distance: race.distance,
        headCount: race.headCount,
        organizer: "NAR",
        status: "upcoming",
      });
      inserted++;
    }
  }
  
  return { inserted, updated };
}

/**
 * 出馬表をDBに保存（UPSERT）
 */
async function saveEntriesToDb(db: any, raceId: string, entriesData: NarEntryInfo[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  
  for (const entry of entriesData) {
    const existing = await db.select({ id: entries.id }).from(entries)
      .where(and(eq(entries.raceId, raceId), eq(entries.horseNumber, entry.horseNumber)))
      .limit(1);
    
    if (existing.length > 0) {
      await db.update(entries).set({
        horseName: entry.horseName,
        gateNumber: entry.gateNumber,
        sex: entry.sex,
        age: entry.age,
        weight: entry.weight,
        jockey: entry.jockey,
        trainer: entry.trainer,
        horseWeight: entry.horseWeight,
        horseWeightDiff: entry.horseWeightDiff,
        odds: entry.odds,
        popularity: entry.popularity,
      }).where(and(eq(entries.raceId, raceId), eq(entries.horseNumber, entry.horseNumber)));
      updated++;
    } else {
      await db.insert(entries).values({
        raceId,
        horseNumber: entry.horseNumber,
        horseName: entry.horseName,
        gateNumber: entry.gateNumber,
        sex: entry.sex,
        age: entry.age,
        weight: entry.weight,
        jockey: entry.jockey,
        trainer: entry.trainer,
        horseWeight: entry.horseWeight,
        horseWeightDiff: entry.horseWeightDiff,
        odds: entry.odds,
        popularity: entry.popularity,
      });
      inserted++;
    }
  }
  
  return { inserted, updated };
}

/**
 * sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Heartbeatハンドラー: NAR地方競馬レース・出馬表取得
 * 当日と翌日のレース情報を取得し、出馬表・オッズも保存する
 */
export async function fetchNarRacesHandler(req: Request, res: Response) {
  console.log("[fetchNarRaces] Starting NAR race data fetch...");
  
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "DB not available" });
    }
    
    // JST基準で今日と明日
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);
    
    const dates: string[] = [];
    for (let i = 0; i <= 1; i++) {
      const d = new Date(jstNow.getTime() + i * 24 * 60 * 60 * 1000);
      dates.push(d.toISOString().split("T")[0]!);
    }
    
    let totalRacesInserted = 0;
    let totalRacesUpdated = 0;
    let totalEntriesInserted = 0;
    let totalEntriesUpdated = 0;
    
    for (const dateStr of dates) {
      console.log(`[fetchNarRaces] Fetching races for ${dateStr}...`);
      
      // レース一覧取得
      const raceList = await fetchNarRaceList(dateStr);
      console.log(`[fetchNarRaces] Found ${raceList.length} races for ${dateStr}`);
      
      if (raceList.length === 0) continue;
      
      // レース情報保存
      const raceResult = await saveRacesToDb(db, raceList);
      totalRacesInserted += raceResult.inserted;
      totalRacesUpdated += raceResult.updated;
      
      // 出馬表取得（レート制限対策で1秒間隔）
      for (const race of raceList) {
        const dateCompact = race.raceDate.replace(/-/g, "");
        const raceIdDb = `${dateCompact}${race.venueCode}${String(race.raceNumber).padStart(2, "0")}`;
        
        const entryList = await fetchNarEntries(race.netkeibaRaceId);
        
        if (entryList.length > 0) {
          const entryResult = await saveEntriesToDb(db, raceIdDb, entryList);
          totalEntriesInserted += entryResult.inserted;
          totalEntriesUpdated += entryResult.updated;
        }
        
        await sleep(1000); // レート制限対策
      }
      
      await sleep(2000); // 日付間のインターバル
    }
    
    const summary = {
      success: true,
      dates,
      races: { inserted: totalRacesInserted, updated: totalRacesUpdated },
      entries: { inserted: totalEntriesInserted, updated: totalEntriesUpdated },
    };
    
    console.log(`[fetchNarRaces] Done.`, summary);
    return res.json(summary);
  } catch (e) {
    console.error("[fetchNarRaces] Error:", e);
    return res.status(500).json({ error: String(e) });
  }
}
