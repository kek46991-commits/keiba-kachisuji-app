/**
 * 穴馬予想アルゴリズム専用ルーター
 * コース波乱度統計・穴馬スコアリング・中穴/大穴分類
 * 
 * 穴馬定義: 単勝オッズ6.0倍以上
 * - 中穴: 6.0〜30.0倍未満（敗因明確で条件好転が見込める巻き返し組）
 * - 大穴: 30.0倍以上（一変要素を秘めた爆発期待組）
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { races, entries, predictions, venues } from "../drizzle/schema";
import { eq, and, gte, lte, asc, desc, sql, inArray, like } from "drizzle-orm";
import { fetchNarEntries, type NarEntryInfo } from "./narPredictionRouter";
import { resolveValidatedNarRace } from "./narRaceValidation";
import { buildLongshotAxisFormation } from "./valueBetting";

// ==========================================
// コース波乱度統計データ（JRA + NAR）
// 過去の統計に基づくコース別穴馬出現率
// ==========================================

interface CourseStats {
  /** 穴馬（単勝6倍以上）が3着以内に入る確率(%) */
  longshotPlaceRate: number;
  /** 約何レースに1回穴馬が激走するか */
  longshotFrequency: number;
  /** 大穴（単勝30倍以上）が3着以内に入る確率(%) */
  bombPlaceRate: number;
  /** 大穴の出現頻度（約何レースに1回） */
  bombFrequency: number;
  /** コース特性メモ */
  note: string;
}

// JRAコース波乱度統計（距離別）
const JRA_COURSE_STATS: Record<string, Record<string, CourseStats>> = {
  "札幌": {
    "turf_1200": { longshotPlaceRate: 42, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "洋芝で差し有利、穴馬の台頭多い" },
    "turf_1800": { longshotPlaceRate: 38, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "小回りで内枠有利、人気薄の先行馬注意" },
    "turf_2000": { longshotPlaceRate: 35, longshotFrequency: 3, bombPlaceRate: 8, bombFrequency: 12, note: "スタミナ勝負で実力通り決まりやすい" },
    "dirt_1000": { longshotPlaceRate: 45, longshotFrequency: 2, bombPlaceRate: 15, bombFrequency: 7, note: "短距離ダートは荒れやすい" },
    "dirt_1700": { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "先行有利だが差しも届く" },
  },
  "函館": {
    "turf_1200": { longshotPlaceRate: 44, longshotFrequency: 2, bombPlaceRate: 14, bombFrequency: 7, note: "開幕週は内有利、後半は外差し台頭" },
    "turf_1800": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "小回りコーナー4つ、器用さ必要" },
    "turf_2000": { longshotPlaceRate: 34, longshotFrequency: 3, bombPlaceRate: 8, bombFrequency: 13, note: "スタミナ型が有利" },
    "dirt_1000": { longshotPlaceRate: 46, longshotFrequency: 2, bombPlaceRate: 16, bombFrequency: 6, note: "超短距離で波乱多発" },
    "dirt_1700": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "先行有利コース" },
  },
  "福島": {
    "turf_1200": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "小回りで内枠先行有利" },
    "turf_1800": { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "コーナー4つで紛れあり" },
    "turf_2000": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "ペース次第で差し馬台頭" },
    "dirt_1150": { longshotPlaceRate: 44, longshotFrequency: 2, bombPlaceRate: 14, bombFrequency: 7, note: "短距離ダートは荒れる" },
    "dirt_1700": { longshotPlaceRate: 38, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "先行有利" },
  },
  "新潟": {
    "turf_1000": { longshotPlaceRate: 48, longshotFrequency: 2, bombPlaceRate: 18, bombFrequency: 6, note: "直線1000mは大波乱多発" },
    "turf_1400": { longshotPlaceRate: 41, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "外回り直線長く差し有利" },
    "turf_1800": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "内回りは先行有利" },
    "turf_2000": { longshotPlaceRate: 35, longshotFrequency: 3, bombPlaceRate: 8, bombFrequency: 12, note: "外回り直線長い" },
    "dirt_1200": { longshotPlaceRate: 42, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "短距離ダートは荒れる" },
    "dirt_1800": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "先行有利" },
  },
  "東京": {
    "turf_1400": { longshotPlaceRate: 38, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "直線長く実力差出やすい" },
    "turf_1600": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "マイル戦は堅い傾向" },
    "turf_1800": { longshotPlaceRate: 35, longshotFrequency: 3, bombPlaceRate: 8, bombFrequency: 12, note: "実力通り決まりやすい" },
    "turf_2000": { longshotPlaceRate: 34, longshotFrequency: 3, bombPlaceRate: 7, bombFrequency: 14, note: "府中2000は堅い" },
    "turf_2400": { longshotPlaceRate: 33, longshotFrequency: 3, bombPlaceRate: 7, bombFrequency: 14, note: "ダービーコース、実力勝負" },
    "dirt_1300": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "短距離ダートは荒れやすい" },
    "dirt_1600": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "ダートマイルは中穴狙い目" },
    "dirt_2100": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 8, bombFrequency: 12, note: "長距離ダートは堅い" },
  },
  "中山": {
    "turf_1200": { longshotPlaceRate: 44, longshotFrequency: 2, bombPlaceRate: 14, bombFrequency: 7, note: "急坂あり、差し馬台頭" },
    "turf_1600": { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "外回りは差し有利" },
    "turf_1800": { longshotPlaceRate: 38, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "内回りは先行有利" },
    "turf_2000": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "中山2000は荒れやすい" },
    "turf_2500": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "有馬記念コース、波乱あり" },
    "dirt_1200": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "短距離ダート荒れる" },
    "dirt_1800": { longshotPlaceRate: 38, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "先行有利" },
  },
  "中京": {
    "turf_1200": { longshotPlaceRate: 42, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "直線坂あり、差し台頭" },
    "turf_1400": { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "中穴狙い目" },
    "turf_1600": { longshotPlaceRate: 38, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "マイル戦は中穴" },
    "turf_2000": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "左回り2000は堅め" },
    "dirt_1200": { longshotPlaceRate: 44, longshotFrequency: 2, bombPlaceRate: 14, bombFrequency: 7, note: "短距離ダート荒れる" },
    "dirt_1800": { longshotPlaceRate: 38, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "先行有利" },
  },
  "京都": {
    "turf_1200": { longshotPlaceRate: 41, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "内回り短距離は荒れる" },
    "turf_1400": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "外回りは差し有利" },
    "turf_1600": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "マイルCSコース" },
    "turf_1800": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "内回りは先行有利" },
    "turf_2000": { longshotPlaceRate: 35, longshotFrequency: 3, bombPlaceRate: 8, bombFrequency: 12, note: "秋華賞コース" },
    "turf_2400": { longshotPlaceRate: 34, longshotFrequency: 3, bombPlaceRate: 7, bombFrequency: 14, note: "菊花賞コース、実力勝負" },
    "dirt_1200": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "短距離ダート荒れる" },
    "dirt_1800": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "先行有利" },
  },
  "阪神": {
    "turf_1200": { longshotPlaceRate: 42, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "内回り短距離は荒れる" },
    "turf_1400": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "外回り差し有利" },
    "turf_1600": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "阪神マイルは堅め" },
    "turf_1800": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "内回り先行有利" },
    "turf_2000": { longshotPlaceRate: 35, longshotFrequency: 3, bombPlaceRate: 8, bombFrequency: 12, note: "大阪杯コース" },
    "turf_2200": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "宝塚記念コース、荒れやすい" },
    "dirt_1200": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "短距離ダート荒れる" },
    "dirt_1400": { longshotPlaceRate: 41, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "中穴狙い目" },
    "dirt_1800": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "先行有利" },
    "dirt_2000": { longshotPlaceRate: 35, longshotFrequency: 3, bombPlaceRate: 8, bombFrequency: 12, note: "長距離ダートは堅い" },
  },
  "小倉": {
    "turf_1200": { longshotPlaceRate: 46, longshotFrequency: 2, bombPlaceRate: 15, bombFrequency: 7, note: "小回り平坦で大波乱多発" },
    "turf_1800": { longshotPlaceRate: 41, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "小回りで先行有利、穴馬台頭" },
    "turf_2000": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "小回り2000は荒れる" },
    "dirt_1000": { longshotPlaceRate: 47, longshotFrequency: 2, bombPlaceRate: 16, bombFrequency: 6, note: "超短距離で大波乱" },
    "dirt_1700": { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "先行有利" },
  },
};

// NAR（地方競馬）コース波乱度統計
const NAR_COURSE_STATS: Record<string, Record<string, CourseStats>> = {
  "大井": {
    "dirt_1200": { longshotPlaceRate: 44, longshotFrequency: 2, bombPlaceRate: 14, bombFrequency: 7, note: "短距離は荒れやすい" },
    "dirt_1400": { longshotPlaceRate: 42, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "中穴狙い目" },
    "dirt_1600": { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "東京ダービーコース" },
    "dirt_1800": { longshotPlaceRate: 38, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "帝王賞コース" },
    "dirt_2000": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "長距離は堅め" },
  },
  "船橋": {
    "dirt_1000": { longshotPlaceRate: 47, longshotFrequency: 2, bombPlaceRate: 16, bombFrequency: 6, note: "超短距離で大波乱多発" },
    "dirt_1200": { longshotPlaceRate: 44, longshotFrequency: 2, bombPlaceRate: 14, bombFrequency: 7, note: "短距離荒れる" },
    "dirt_1400": { longshotPlaceRate: 41, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "中穴狙い目" },
    "dirt_1600": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "かしわ記念コース" },
    "dirt_1800": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "先行有利" },
  },
  "川崎": {
    "dirt_900": { longshotPlaceRate: 48, longshotFrequency: 2, bombPlaceRate: 17, bombFrequency: 6, note: "超短距離で大波乱" },
    "dirt_1400": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "小回りで荒れやすい" },
    "dirt_1500": { longshotPlaceRate: 41, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "川崎記念コース" },
    "dirt_1600": { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "中穴狙い目" },
    "dirt_2100": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "長距離は堅め" },
  },
  "浦和": {
    "dirt_800": { longshotPlaceRate: 49, longshotFrequency: 2, bombPlaceRate: 18, bombFrequency: 6, note: "超短距離で大波乱多発" },
    "dirt_1200": { longshotPlaceRate: 44, longshotFrequency: 2, bombPlaceRate: 14, bombFrequency: 7, note: "短距離荒れる" },
    "dirt_1400": { longshotPlaceRate: 42, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "さきたま杯コース" },
    "dirt_1500": { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "浦和記念コース" },
    "dirt_2000": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "長距離は堅め" },
  },
  "門別": {
    "dirt_1000": { longshotPlaceRate: 46, longshotFrequency: 2, bombPlaceRate: 15, bombFrequency: 7, note: "短距離荒れやすい" },
    "dirt_1200": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "北海道スプリント" },
    "dirt_1700": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "先行有利" },
    "dirt_1800": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "北海道2歳優駿コース" },
    "dirt_2000": { longshotPlaceRate: 35, longshotFrequency: 3, bombPlaceRate: 8, bombFrequency: 12, note: "長距離は堅め" },
  },
  "園田": {
    "dirt_820": { longshotPlaceRate: 48, longshotFrequency: 2, bombPlaceRate: 17, bombFrequency: 6, note: "超短距離で大波乱" },
    "dirt_1230": { longshotPlaceRate: 44, longshotFrequency: 2, bombPlaceRate: 14, bombFrequency: 7, note: "短距離荒れる" },
    "dirt_1400": { longshotPlaceRate: 42, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "園田金盃コース" },
    "dirt_1700": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "先行有利" },
    "dirt_1870": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "長距離は堅め" },
  },
  "笠松": {
    "dirt_800": { longshotPlaceRate: 49, longshotFrequency: 2, bombPlaceRate: 18, bombFrequency: 6, note: "超短距離で大波乱" },
    "dirt_1400": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "小回りで荒れやすい" },
    "dirt_1600": { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "中穴狙い目" },
    "dirt_1800": { longshotPlaceRate: 37, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "先行有利" },
  },
  "名古屋": {
    "dirt_920": { longshotPlaceRate: 47, longshotFrequency: 2, bombPlaceRate: 16, bombFrequency: 6, note: "超短距離で波乱" },
    "dirt_1300": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "短距離荒れる" },
    "dirt_1400": { longshotPlaceRate: 41, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "名古屋大賞典コース" },
    "dirt_1700": { longshotPlaceRate: 38, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "先行有利" },
  },
  "高知": {
    "dirt_800": { longshotPlaceRate: 50, longshotFrequency: 2, bombPlaceRate: 19, bombFrequency: 5, note: "超短距離で大波乱多発" },
    "dirt_1300": { longshotPlaceRate: 44, longshotFrequency: 2, bombPlaceRate: 14, bombFrequency: 7, note: "短距離荒れる" },
    "dirt_1400": { longshotPlaceRate: 42, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "黒船賞コース" },
    "dirt_1600": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "中穴狙い目" },
  },
  "佐賀": {
    "dirt_900": { longshotPlaceRate: 47, longshotFrequency: 2, bombPlaceRate: 16, bombFrequency: 6, note: "超短距離で波乱" },
    "dirt_1300": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "短距離荒れる" },
    "dirt_1400": { longshotPlaceRate: 41, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "佐賀記念コース" },
    "dirt_1750": { longshotPlaceRate: 38, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "先行有利" },
    "dirt_2000": { longshotPlaceRate: 35, longshotFrequency: 3, bombPlaceRate: 8, bombFrequency: 12, note: "長距離は堅め" },
  },
  "盛岡": {
    "turf_1000": { longshotPlaceRate: 47, longshotFrequency: 2, bombPlaceRate: 16, bombFrequency: 6, note: "芝短距離は大波乱" },
    "turf_1600": { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "芝マイルは中穴" },
    "dirt_1000": { longshotPlaceRate: 46, longshotFrequency: 2, bombPlaceRate: 15, bombFrequency: 7, note: "短距離荒れる" },
    "dirt_1600": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "マーキュリーCコース" },
    "dirt_2000": { longshotPlaceRate: 36, longshotFrequency: 3, bombPlaceRate: 9, bombFrequency: 11, note: "長距離は堅め" },
  },
  "水沢": {
    "dirt_850": { longshotPlaceRate: 48, longshotFrequency: 2, bombPlaceRate: 17, bombFrequency: 6, note: "超短距離で大波乱" },
    "dirt_1300": { longshotPlaceRate: 43, longshotFrequency: 2, bombPlaceRate: 13, bombFrequency: 8, note: "短距離荒れる" },
    "dirt_1400": { longshotPlaceRate: 41, longshotFrequency: 2, bombPlaceRate: 12, bombFrequency: 8, note: "中穴狙い目" },
    "dirt_1600": { longshotPlaceRate: 39, longshotFrequency: 3, bombPlaceRate: 10, bombFrequency: 10, note: "先行有利" },
  },
};

// ==========================================
// 馬場状態による穴馬出現率補正
// ==========================================
const TRACK_CONDITION_MULTIPLIER: Record<string, number> = {
  "good": 1.0,           // 良: 基準
  "slightly_heavy": 1.15, // 稍重: 穴馬出現率15%UP
  "heavy": 1.35,          // 重: 穴馬出現率35%UP
  "bad": 1.5,             // 不良: 穴馬出現率50%UP
};

// ==========================================
// 穴馬スコアリングアルゴリズム
// ==========================================

export interface AnaUmaCandidate {
  horseNumber: number;
  horseName: string;
  jockey: string | null;
  odds: number;
  popularity: number | null;
  category: "中穴" | "大穴";
  /** 穴馬激走確率(%) */
  explosionRate: number;
  /** 穴馬スコア（0-100） */
  anaScore: number;
  /** スコア内訳 */
  scoreBreakdown: {
    courseAffinity: number;    // コース適性
    trackConditionBoost: number; // 馬場状態ブースト
    oddsValue: number;        // オッズ妙味
    bloodlineBoost: number;   // 血統ブースト
    jockeyChange: number;     // 騎手乗り替わり
    weightTrend: number;      // 馬体重トレンド
    ageBonus: number;         // 年齢ボーナス
    gateAdvantage: number;    // 枠順有利
  };
  /** 激走根拠 */
  reasons: string[];
}

interface AnaUmaAlert {
  /** 警報レベル */
  alertLevel: "高" | "中" | "低";
  /** コース波乱度統計 */
  courseStats: CourseStats | null;
  /** コース・距離 */
  courseLabel: string;
  /** 天候・馬場診断 */
  trackDiagnosis: string;
  /** 中穴筆頭 */
  topMidOdds: AnaUmaCandidate | null;
  /** 大穴筆頭 */
  topBomb: AnaUmaCandidate | null;
  /** 穴馬候補一覧（スコア順） */
  candidates: AnaUmaCandidate[];
  /** 速報タイトル */
  newsTitle: string;
  /** 速報本文 */
  newsBody: string;
  /** カレンダー表示用タグ */
  calendarTag: string;
}

/**
 * コース統計データを取得
 */
function getCourseStats(venue: string, surface: string | null, distance: number | null, organizer: string): CourseStats | null {
  const surfaceKey = surface === "turf" ? "turf" : "dirt";
  const dist = distance ?? 1600;
  
  // 完全一致を試行
  const statsMap = organizer === "NAR" ? NAR_COURSE_STATS : JRA_COURSE_STATS;
  const venueStats = statsMap[venue];
  if (!venueStats) {
    // 会場名が見つからない場合はデフォルト値
    return {
      longshotPlaceRate: 40,
      longshotFrequency: 3,
      bombPlaceRate: 11,
      bombFrequency: 9,
      note: "統計データ不足のため推定値",
    };
  }
  
  const exactKey = `${surfaceKey}_${dist}`;
  if (venueStats[exactKey]) return venueStats[exactKey]!;
  
  // 距離が未収録の場合は、近似コースの流用を原則避ける。
  // 100m以内だけを同一距離帯として扱い、それ以上は一般統計に落とす。
  const keys = Object.keys(venueStats).filter(k => k.startsWith(surfaceKey + "_"));
  if (keys.length === 0) {
    return { longshotPlaceRate: 40, longshotFrequency: 3, bombPlaceRate: 11, bombFrequency: 9, note: "推定値" };
  }
  
  let closestKey = keys[0]!;
  let closestDiff = Math.abs(parseInt(closestKey.split("_")[1]!) - dist);
  for (const k of keys) {
    const d = Math.abs(parseInt(k.split("_")[1]!) - dist);
    if (d < closestDiff) {
      closestDiff = d;
      closestKey = k;
    }
  }
  if (closestDiff > 100) {
    return {
      longshotPlaceRate: 40,
      longshotFrequency: 3,
      bombPlaceRate: 11,
      bombFrequency: 9,
      note: `距離${dist}mの固有統計が未収録のため、別距離の統計は使用しない`,
    };
  }
  return venueStats[closestKey]!;
}

/**
 * 穴馬スコアを計算
 * 単勝6.0倍以上の馬のみ対象
 */
function calculateAnaScore(
  entry: { horseNumber: number; horseName: string; jockey: string | null; odds: number; popularity: number | null; sire?: string | null; age?: number | null; gateNumber?: number | null; horseWeight?: number | null; horseWeightDiff?: number | null },
  courseStats: CourseStats,
  raceInfo: { venue: string; surface: string | null; distance: number | null; trackCondition: string | null; headCount: number | null },
): AnaUmaCandidate {
  const category: "中穴" | "大穴" = entry.odds >= 30 ? "大穴" : "中穴";
  const reasons: string[] = [];
  
  // 1. コース適性スコア（コースの波乱度に基づく）
  let courseAffinity = 0;
  if (courseStats.longshotPlaceRate >= 45) {
    courseAffinity = 20;
    reasons.push("超荒れコース（穴馬出現率45%超）");
  } else if (courseStats.longshotPlaceRate >= 40) {
    courseAffinity = 15;
    reasons.push("荒れやすいコース（穴馬出現率40%超）");
  } else if (courseStats.longshotPlaceRate >= 35) {
    courseAffinity = 10;
  }
  
  // 2. 馬場状態ブースト
  let trackConditionBoost = 0;
  const tcMultiplier = TRACK_CONDITION_MULTIPLIER[raceInfo.trackCondition ?? "good"] ?? 1.0;
  if (tcMultiplier > 1.0) {
    trackConditionBoost = Math.round((tcMultiplier - 1.0) * 40);
    if (tcMultiplier >= 1.35) {
      reasons.push("重馬場で穴馬出現率大幅UP");
    } else if (tcMultiplier >= 1.15) {
      reasons.push("稍重で穴馬出現率UP");
    }
  }
  
  // 3. オッズ妙味スコア
  let oddsValue = 0;
  if (entry.odds >= 6 && entry.odds < 15) {
    oddsValue = 20; // 中穴ゾーンの最も妙味のある範囲
    reasons.push("オッズ妙味ゾーン（6-15倍）");
  } else if (entry.odds >= 15 && entry.odds < 30) {
    oddsValue = 15; // 中穴上位
  } else if (entry.odds >= 30 && entry.odds < 50) {
    oddsValue = 12; // 大穴ゾーン
    reasons.push("大穴ゾーン（30-50倍）で一発あり");
  } else if (entry.odds >= 50) {
    oddsValue = 8; // 超大穴
    reasons.push("超大穴（50倍超）で爆発期待");
  }
  
  // 4. 血統ブースト（ダート/芝適性）
  let bloodlineBoost = 0;
  // 簡易的な血統評価（将来的にはDBから取得）
  if (entry.sire) {
    // ダート血統がダートレースで走る場合にブースト
    const dirtSires = ["ヘニーヒューズ", "パイロ", "サウスヴィグラス", "カジノドライヴ", "シニスターミニスター"];
    const turfSires = ["ディープインパクト", "ハーツクライ", "キズナ", "エピファネイア", "モーリス"];
    const surface = raceInfo.surface ?? "dirt";
    if (surface === "dirt" && dirtSires.some(s => entry.sire?.includes(s))) {
      bloodlineBoost = 10;
      reasons.push("ダート血統◎");
    } else if (surface === "turf" && turfSires.some(s => entry.sire?.includes(s))) {
      bloodlineBoost = 10;
      reasons.push("芝血統◎");
    }
  }
  
  // 5. 騎手乗り替わり（今回は簡易判定）
  let jockeyChange = 0;
  // 将来的には前走騎手との比較で判定
  
  // 6. 馬体重トレンド
  let weightTrend = 0;
  if (entry.horseWeightDiff !== null && entry.horseWeightDiff !== undefined) {
    if (entry.horseWeightDiff >= -2 && entry.horseWeightDiff <= 6) {
      weightTrend = 8;
      reasons.push("馬体重微増で好調サイン");
    } else if (entry.horseWeightDiff < -8) {
      weightTrend = -5;
    }
  }
  
  // 7. 年齢ボーナス
  let ageBonus = 0;
  if (entry.age) {
    if (entry.age === 3) { ageBonus = 8; reasons.push("3歳の成長力に期待"); }
    else if (entry.age === 4) { ageBonus = 5; reasons.push("4歳ピーク世代"); }
    else if (entry.age === 5) ageBonus = 3;
    else if (entry.age >= 7) ageBonus = -3;
  }
  
  // 8. 枠順有利
  let gateAdvantage = 0;
  if (entry.gateNumber && raceInfo.headCount) {
    const isInner = entry.gateNumber <= Math.ceil(raceInfo.headCount / 3);
    const distance = raceInfo.distance ?? 1600;
    // 短距離は内枠有利
    if (distance <= 1400 && isInner) {
      gateAdvantage = 8;
      reasons.push("短距離内枠有利");
    }
  }
  
  const anaScore = Math.max(0, Math.min(100,
    courseAffinity + trackConditionBoost + oddsValue + bloodlineBoost + jockeyChange + weightTrend + ageBonus + gateAdvantage
  ));
  
  // 激走確率の算出
  const baseRate = category === "中穴" 
    ? courseStats.longshotPlaceRate 
    : courseStats.bombPlaceRate;
  const adjustedRate = Math.round(baseRate * tcMultiplier * (1 + anaScore / 200));
  const explosionRate = Math.min(adjustedRate, 65); // 上限65%
  
  return {
    horseNumber: entry.horseNumber,
    horseName: entry.horseName,
    jockey: entry.jockey,
    odds: entry.odds,
    popularity: entry.popularity,
    category,
    explosionRate,
    anaScore,
    scoreBreakdown: {
      courseAffinity,
      trackConditionBoost,
      oddsValue,
      bloodlineBoost,
      jockeyChange,
      weightTrend,
      ageBonus,
      gateAdvantage,
    },
    reasons,
  };
}

/**
 * 警報レベルを判定
 */
function determineAlertLevel(courseStats: CourseStats, trackCondition: string | null): "高" | "中" | "低" {
  const tcMultiplier = TRACK_CONDITION_MULTIPLIER[trackCondition ?? "good"] ?? 1.0;
  const adjustedRate = courseStats.longshotPlaceRate * tcMultiplier;
  
  if (adjustedRate >= 45 || courseStats.bombPlaceRate * tcMultiplier >= 15) return "高";
  if (adjustedRate >= 38 || courseStats.bombPlaceRate * tcMultiplier >= 10) return "中";
  return "低";
}

/**
 * 穴馬推奨買い目を生成
 */
export function generateAnaBettingRecommendation(
  candidates: AnaUmaCandidate[],
  allEntries: { horseNumber: number; odds: number | null }[],
  scoreRankedHorseNumbers: number[] = [],
  options: { oddsMode?: "official" | "predicted" } = {},
): {
  trifecta: string;
  trio: string;
  quinella: string;
  wide: string;
  trifectaCount: number;
  trioCount: number;
  quinellaCount: number;
  wideCount: number;
  totalBets: number;
  riskWarning?: string;
  formationCaution?: string;
  formation?: { axis: number; second: number[]; third: number[]; trioPartners: number[] };
  reasoning: string[];
} {
  if (candidates.length === 0) {
    return { trifecta: "穴馬候補なし", trio: "穴馬候補なし", quinella: "穴馬候補なし", wide: "穴馬候補なし", trifectaCount: 0, trioCount: 0, quinellaCount: 0, wideCount: 0, totalBets: 0, reasoning: ["対象レースに穴馬候補が見つかりませんでした"] };
  }
  
  // 分析一覧はTOP5を表示し、買い目には激走根拠を確認できる候補だけを採用する。
  const topAna = candidates
    .filter((candidate) => candidate.anaScore >= 35 && candidate.explosionRate >= 15)
    .slice(0, 5);

  if (topAna.length === 0) {
    return {
      trifecta: "見送り",
      trio: "見送り",
      quinella: "対象外",
      wide: "対象外",
      trifectaCount: 0,
      trioCount: 0,
      quinellaCount: 0,
      wideCount: 0,
      totalBets: 0,
      reasoning: ["穴馬分析上位でも、激走根拠の閾値を満たす候補がないため見送り", "点数を埋めるための保険BOX・低根拠候補は追加しない"],
    };
  }

  if (scoreRankedHorseNumbers.length === 0) {
    return {
      trifecta: "スコア順位データ待ち", trio: "スコア順位データ待ち", quinella: "対象外", wide: "対象外",
      trifectaCount: 0, trioCount: 0, quinellaCount: 0, wideCount: 0, totalBets: 0,
      formationCaution: "穴馬軸の相手にはスコア上位馬を必ず含めるため、スコア順位データが揃うまで買い目を生成しません。",
      reasoning: ["スコア順位データ待ちのため、人気順やオッズだけで穴馬買い目を補完しません"],
    };
  }

  const axis = topAna[0]!.horseNumber;
  const formation = buildLongshotAxisFormation({
    axis,
    scoreRankedHorseNumbers,
    holePartnerHorseNumbers: topAna.slice(1).map(candidate => candidate.horseNumber),
  });
  if (!formation) {
    return {
      trifecta: "見送り", trio: "見送り", quinella: "対象外", wide: "対象外",
      trifectaCount: 0, trioCount: 0, quinellaCount: 0, wideCount: 0, totalBets: 0,
      reasoning: ["穴馬軸へ組み合わせる上位スコア馬が不足しているため、買い目を生成しません"],
    };
  }

  const totalBets = formation.trifectaCount + formation.trioCount;
  const predictedOddsNotice = "公式オッズ未取得のため、穴候補は能力スコアから導いた予想オッズを基準にしています。市場実勢・EV・トリガミ判定は未算出です。";
  return {
    trifecta: `穴軸: 1着${formation.axis} / 2着${formation.second.join(",")} / 3着${formation.third.join(",")}（${formation.trifectaCount}点）`,
    trio: `穴軸カバー: ${formation.axis} - ${formation.trioPartners.join(",")}（1頭軸流し・${formation.trioCount}点）`,
    quinella: "対象外",
    wide: "対象外",
    trifectaCount: formation.trifectaCount,
    trioCount: formation.trioCount,
    quinellaCount: 0,
    wideCount: 0,
    totalBets,
    riskWarning: options.oddsMode === "predicted" ? predictedOddsNotice : formation.trigamiWarning,
    formationCaution: formation.caution ?? undefined,
    formation: { axis: formation.axis, second: formation.second, third: formation.third, trioPartners: formation.trioPartners },
    reasoning: [
      ...(options.oddsMode === "predicted" ? [predictedOddsNotice] : []),
      `穴推奨馬${axis}番を1着軸に固定し、スコア上位馬${formation.second.filter(number => scoreRankedHorseNumbers.includes(number)).join(",")}番を2着候補から保持`,
      `穴狙いパターンは3連単${formation.trifectaCount}点・3連複${formation.trioCount}点、合計${totalBets}点・想定投資額${totalBets * 100}円（1点100円換算）`,
      ...(formation.caution ? [formation.caution] : []),
      formation.trigamiWarning,
    ],
  };
}

/**
 * 通常予想の保存時にも、同じ穴馬ロジックの買い目を固定スナップショットとして作る。
 * 将来の画面表示で再計算せず、予想時点の穴馬候補と買い目を正確に再現するために使用する。
 */
export function buildAnaBettingRecommendationForRace({
  entries,
  venue,
  surface,
  distance,
  trackCondition,
  organizer = "NAR",
  scoreRankedHorseNumbers = [],
  oddsMode = "official",
}: {
  entries: Array<{
    horseNumber: number;
    horseName: string;
    jockey: string | null;
    odds: number | null;
    popularity: number | null;
    sire?: string | null;
    age?: number | null;
    gateNumber?: number | null;
    horseWeight?: number | null;
    horseWeightDiff?: number | null;
  }>;
  venue: string;
  surface: string | null;
  distance: number | null;
  trackCondition: string | null;
  organizer?: string;
  scoreRankedHorseNumbers?: number[];
  oddsMode?: "official" | "predicted";
}) {
  const courseStats = getCourseStats(venue, surface, distance, organizer);
  if (!courseStats) return generateAnaBettingRecommendation([], entries.map(entry => ({ horseNumber: entry.horseNumber, odds: entry.odds })), scoreRankedHorseNumbers, { oddsMode });
  const candidates = entries
    .filter((entry): entry is typeof entry & { odds: number } => entry.odds !== null && entry.odds >= 6)
    .map(entry => calculateAnaScore(entry, courseStats, {
      venue,
      surface,
      distance,
      trackCondition,
      headCount: entries.length,
    }))
    .sort((left, right) => right.anaScore - left.anaScore || right.explosionRate - left.explosionRate);
  return generateAnaBettingRecommendation(candidates, entries.map(entry => ({ horseNumber: entry.horseNumber, odds: entry.odds })), scoreRankedHorseNumbers, { oddsMode });
}

// ==========================================
// ルーター定義
// ==========================================

export const anaUmaRouter = router({
  /**
   * 指定レースの穴馬分析を実行
   */
  analyzeRace: publicProcedure
    .input(z.object({
      raceId: z.string(),
      // NARレース用のオプション情報（DBにレースがない場合に使用）
      venue: z.string().optional(),
      surface: z.string().optional(),
      distance: z.number().optional(),
      raceNumber: z.number().optional(),
      raceDate: z.string().optional(),
      raceName: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const validation = await resolveValidatedNarRace(db, {
        raceId: input.raceId,
        venue: input.venue,
        raceDate: input.raceDate,
        raceNumber: input.raceNumber,
        raceName: input.raceName,
        surface: input.surface,
        distance: input.distance,
      });
      if (!validation.canonicalRaceId) return null;
      
      // レース情報を取得
      const [race] = await db.select().from(races)
        .where(eq(races.raceId, validation.canonicalRaceId))
        .limit(1);
      
      // 出走馬データを取得
      let entryRows: Array<{
        horseNumber: number;
        horseName: string;
        jockey: string | null;
        odds: number | null;
        popularity: number | null;
        sire: string | null;
        age: number | null;
        gateNumber: number | null;
        horseWeight: number | null;
        horseWeightDiff: number | null;
      }> = [];
      
      // レースメタ情報（DB or input fallback）
      let raceVenue = validation.venue ?? race?.venueName ?? input.venue ?? "";
      let raceSurface = validation.surface ?? race?.surface ?? input.surface ?? "dirt";
      let raceDistance = validation.distance ?? race?.distance ?? input.distance ?? 0;
      let raceNumber = race?.raceNumber ?? input.raceNumber ?? 0;
      let raceDate = race?.raceDate ?? input.raceDate ?? "";
      let raceTrackCondition = validation.trackCondition ?? race?.trackCondition ?? null;
      let raceWeather = race?.weather ?? null;
      let raceHeadCount = race?.headCount ?? 0;
      let raceOrganizer = race?.organizer ?? "NAR";
      
      if (race) {
        // JRA: DBからentries取得
        const dbEntries = await db.select().from(entries)
          .where(eq(entries.raceId, validation.canonicalRaceId))
          .orderBy(asc(entries.horseNumber));
        entryRows = dbEntries;
      } else {
        // NAR: netkeibaからリアルタイム取得
        try {
          const narEntries = await fetchNarEntries(input.raceId);
          entryRows = narEntries.map(e => ({
            horseNumber: e.horseNumber,
            horseName: e.horseName,
            jockey: e.jockey,
            odds: e.odds,
            popularity: e.popularity,
            sire: null,
            age: e.age,
            gateNumber: e.gateNumber,
            horseWeight: e.horseWeight,
            horseWeightDiff: e.horseWeightDiff,
          }));
          raceHeadCount = narEntries.length;
          raceOrganizer = "NAR";
        } catch (e) {
          console.error("[AnaUma] NAR entries fetch failed:", (e as Error).message);
          return null;
        }
      }
      
      if (entryRows.length === 0) return null;
      
      // コース統計を取得
      const courseStats = getCourseStats(raceVenue, raceSurface, raceDistance, raceOrganizer);
      
      if (!courseStats) return null;
      
      // 穴馬候補を抽出（単勝6.0倍以上）
      const longshotEntries = entryRows.filter(e => e.odds && e.odds >= 6.0);
      
      // 各穴馬のスコアを計算
      const candidates: AnaUmaCandidate[] = longshotEntries.map(e => 
        calculateAnaScore(
          {
            horseNumber: e.horseNumber,
            horseName: e.horseName,
            jockey: e.jockey,
            odds: e.odds!,
            popularity: e.popularity,
            sire: e.sire,
            age: e.age,
            gateNumber: e.gateNumber,
            horseWeight: e.horseWeight,
            horseWeightDiff: e.horseWeightDiff,
          },
          courseStats,
          {
            venue: raceVenue,
            surface: raceSurface,
            distance: raceDistance,
            trackCondition: raceTrackCondition,
            headCount: raceHeadCount,
          },
        )
      ).sort((a, b) => b.anaScore - a.anaScore);
      
      // 中穴・大穴の筆頭を特定
      const topMidOdds = candidates.find(c => c.category === "中穴") ?? null;
      const topBomb = candidates.find(c => c.category === "大穴") ?? null;
      
      // 警報レベル判定
      const alertLevel = determineAlertLevel(courseStats, raceTrackCondition);
      
      // コースラベル
      const surfaceLabel = raceSurface === "turf" ? "芝" : "ダート";
      const courseLabel = `${raceVenue} ${surfaceLabel}${raceDistance}m`;
      
      // 天候・馬場診断
      let trackDiagnosis = "";
      const tcLabel = { good: "良", slightly_heavy: "稍重", heavy: "重", bad: "不良" }[raceTrackCondition ?? "good"] ?? "良";
      trackDiagnosis = `馬場状態: ${tcLabel}`;
      if (raceWeather) trackDiagnosis = `天候: ${raceWeather} / ${trackDiagnosis}`;
      const tcMult = TRACK_CONDITION_MULTIPLIER[raceTrackCondition ?? "good"] ?? 1.0;
      if (tcMult > 1.0) {
        trackDiagnosis += ` → 穴馬出現率${Math.round((tcMult - 1) * 100)}%UP`;
      }
      
      // 速報テキスト生成
      const newsTitle = `【穴警報発令】${raceDate}/${raceVenue}/${raceNumber}R このコースは「約${courseStats.longshotFrequency}レースに1回」穴が走る！`;
      
      let newsBody = "";
      if (topMidOdds) {
        newsBody += `注目の中穴は ${topMidOdds.horseName}（${topMidOdds.odds}倍）！`;
      }
      if (topBomb) {
        newsBody += `大穴 ${topBomb.horseName}（${topBomb.odds}倍）は約${courseStats.bombFrequency}レースに1回枠内に突っ込む計算！`;
      }
      if (!newsBody) {
        newsBody = "穴馬候補は見つかりませんでした。";
      }
      
      // カレンダー表示用タグ
      let calendarTag = "";
      if (topMidOdds) calendarTag += `🚨 中穴: ${topMidOdds.horseName}`;
      if (topBomb) calendarTag += ` / 💣 大穴: ${topBomb.horseName}`;
      
      // 穴馬推奨買い目
      const anaBets = generateAnaBettingRecommendation(
        candidates,
        entryRows.map(e => ({ horseNumber: e.horseNumber, odds: e.odds }))
      );
      
      const result: AnaUmaAlert = {
        alertLevel,
        courseStats,
        courseLabel,
        trackDiagnosis,
        topMidOdds,
        topBomb,
        candidates,
        newsTitle,
        newsBody,
        calendarTag,
      };
      
      return { ...result, anaBets, validation };
    }),

  /**
   * 指定日の全レースの穴馬警報サマリーを取得（カレンダー・トップページ用）
   */
  getDayAlerts: publicProcedure
    .input(z.object({
      date: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      
      // 指定日のレースを取得
      const dayRaces = await db.select().from(races)
        .where(eq(races.raceDate, input.date))
        .orderBy(asc(races.venueName), asc(races.raceNumber));
      
      if (dayRaces.length === 0) return [];
      
      // 各レースの穴馬分析を実行
      const alerts: Array<{
        raceId: string;
        venueName: string;
        raceNumber: number;
        raceName: string;
        organizer: string;
        alertLevel: "高" | "中" | "低";
        courseLabel: string;
        topMidOdds: { horseName: string; odds: number; anaScore: number } | null;
        topBomb: { horseName: string; odds: number; anaScore: number } | null;
        calendarTag: string;
        newsTitle: string;
        newsBody: string;
      }> = [];
      
      for (const race of dayRaces) {
        // 出走馬データを取得
        const entryRows = await db.select().from(entries)
          .where(eq(entries.raceId, race.raceId))
          .orderBy(asc(entries.horseNumber));
        
        if (entryRows.length === 0) continue;
        
        // コース統計
        const organizer = race.organizer ?? "JRA";
        const courseStats = getCourseStats(race.venueName, race.surface, race.distance, organizer);
        if (!courseStats) continue;
        
        // 穴馬候補（単勝6.0倍以上）
        const longshotEntries = entryRows.filter(e => e.odds && e.odds >= 6.0);
        if (longshotEntries.length === 0) continue;
        
        const candidates = longshotEntries.map(e =>
          calculateAnaScore(
            {
              horseNumber: e.horseNumber,
              horseName: e.horseName,
              jockey: e.jockey,
              odds: e.odds!,
              popularity: e.popularity,
              sire: e.sire,
              age: e.age,
              gateNumber: e.gateNumber,
              horseWeight: e.horseWeight,
              horseWeightDiff: e.horseWeightDiff,
            },
            courseStats,
            {
              venue: race.venueName,
              surface: race.surface,
              distance: race.distance,
              trackCondition: race.trackCondition,
              headCount: race.headCount,
            },
          )
        ).sort((a, b) => b.anaScore - a.anaScore);
        
        const topMidOdds = candidates.find(c => c.category === "中穴");
        const topBomb = candidates.find(c => c.category === "大穴");
        const alertLevel = determineAlertLevel(courseStats, race.trackCondition);
        
        // 高警報のレースのみ返す（カレンダー表示用）
        if (alertLevel === "低" && !topBomb) continue;
        
        const surfaceLabel = race.surface === "turf" ? "芝" : "ダート";
        const courseLabel = `${race.venueName} ${surfaceLabel}${race.distance}m`;
        
        let calendarTag = "";
        if (topMidOdds) calendarTag += `🚨 中穴: ${topMidOdds.horseName}`;
        if (topBomb) calendarTag += ` / 💣 大穴: ${topBomb.horseName}`;
        
        const newsTitle = `【穴警報発令】${race.venueName}${race.raceNumber}R このコースは約${courseStats.longshotFrequency}レースに1回穴が走る！`;
        let newsBody = "";
        if (topMidOdds) newsBody += `中穴注目: ${topMidOdds.horseName}（${topMidOdds.odds}倍）`;
        if (topBomb) newsBody += ` 大穴: ${topBomb.horseName}（${topBomb.odds}倍）`;
        
        alerts.push({
          raceId: race.raceId,
          venueName: race.venueName,
          raceNumber: race.raceNumber,
          raceName: race.raceName,
          organizer,
          alertLevel,
          courseLabel,
          topMidOdds: topMidOdds ? { horseName: topMidOdds.horseName, odds: topMidOdds.odds, anaScore: topMidOdds.anaScore } : null,
          topBomb: topBomb ? { horseName: topBomb.horseName, odds: topBomb.odds, anaScore: topBomb.anaScore } : null,
          calendarTag,
          newsTitle,
          newsBody,
        });
      }
      
      return alerts;
    }),

  /**
   * トップページ用: 今日の穴馬速報（最も警報レベルが高いレース）
   */
  getTodayTopAlert: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    
    // 今日の日付（JST）
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstNow.toISOString().split("T")[0]!;
    
    // 今日のレースを取得
    const dayRaces = await db.select().from(races)
      .where(eq(races.raceDate, today))
      .orderBy(asc(races.venueName), asc(races.raceNumber));
    
    if (dayRaces.length === 0) return null;
    
    let bestAlert: {
      raceId: string;
      venueName: string;
      raceNumber: number;
      raceName: string;
      alertLevel: "高" | "中" | "低";
      courseLabel: string;
      trackDiagnosis: string;
      topMidOdds: AnaUmaCandidate | null;
      topBomb: AnaUmaCandidate | null;
      newsTitle: string;
      newsBody: string;
      calendarTag: string;
      courseStats: CourseStats;
    } | null = null;
    let bestScore = 0;
    
    for (const race of dayRaces) {
      const entryRows = await db.select().from(entries)
        .where(eq(entries.raceId, race.raceId))
        .orderBy(asc(entries.horseNumber));
      
      if (entryRows.length === 0) continue;
      
      const organizer = race.organizer ?? "JRA";
      const courseStats = getCourseStats(race.venueName, race.surface, race.distance, organizer);
      if (!courseStats) continue;
      
      const longshotEntries = entryRows.filter(e => e.odds && e.odds >= 6.0);
      if (longshotEntries.length === 0) continue;
      
      const candidates = longshotEntries.map(e =>
        calculateAnaScore(
          {
            horseNumber: e.horseNumber,
            horseName: e.horseName,
            jockey: e.jockey,
            odds: e.odds!,
            popularity: e.popularity,
            sire: e.sire,
            age: e.age,
            gateNumber: e.gateNumber,
            horseWeight: e.horseWeight,
            horseWeightDiff: e.horseWeightDiff,
          },
          courseStats,
          {
            venue: race.venueName,
            surface: race.surface,
            distance: race.distance,
            trackCondition: race.trackCondition,
            headCount: race.headCount,
          },
        )
      ).sort((a, b) => b.anaScore - a.anaScore);
      
      const topMidOdds = candidates.find(c => c.category === "中穴") ?? null;
      const topBomb = candidates.find(c => c.category === "大穴") ?? null;
      const alertLevel = determineAlertLevel(courseStats, race.trackCondition);
      
      // スコア計算（警報レベル + 穴馬スコア）
      const alertScore = alertLevel === "高" ? 30 : alertLevel === "中" ? 15 : 0;
      const candidateScore = (topBomb?.anaScore ?? 0) + (topMidOdds?.anaScore ?? 0);
      const totalScore = alertScore + candidateScore;
      
      if (totalScore > bestScore) {
        bestScore = totalScore;
        const surfaceLabel = race.surface === "turf" ? "芝" : "ダート";
        const courseLabel = `${race.venueName} ${surfaceLabel}${race.distance}m`;
        const tcLabel = { good: "良", slightly_heavy: "稍重", heavy: "重", bad: "不良" }[race.trackCondition ?? "good"] ?? "良";
        let trackDiagnosis = `馬場: ${tcLabel}`;
        if (race.weather) trackDiagnosis = `天候: ${race.weather} / ${trackDiagnosis}`;
        
        const newsTitle = `【穴警報発令】${race.venueName}${race.raceNumber}R このコースは「約${courseStats.longshotFrequency}レースに1回」穴が走る！`;
        let newsBody = "";
        if (topMidOdds) newsBody += `注目の中穴は ${topMidOdds.horseName}（${topMidOdds.odds}倍）！`;
        if (topBomb) newsBody += `大穴 ${topBomb.horseName}（${topBomb.odds}倍）は約${courseStats.bombFrequency}レースに1回枠内に突っ込む計算！`;
        
        let calendarTag = "";
        if (topMidOdds) calendarTag += `🚨 中穴: ${topMidOdds.horseName}`;
        if (topBomb) calendarTag += ` / 💣 大穴: ${topBomb.horseName}`;
        
        bestAlert = {
          raceId: race.raceId,
          venueName: race.venueName,
          raceNumber: race.raceNumber,
          raceName: race.raceName,
          alertLevel,
          courseLabel,
          trackDiagnosis,
          topMidOdds,
          topBomb,
          newsTitle,
          newsBody,
          calendarTag,
          courseStats,
        };
      }
    }
    
    return bestAlert;
  }),
});
