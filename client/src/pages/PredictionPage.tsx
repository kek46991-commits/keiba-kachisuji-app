import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowLeft, Zap, TrendingUp, Target, AlertTriangle, ChevronRight, Loader2, Calendar, MapPin, CheckCircle2, Sparkles } from "lucide-react";
import { PredictionTableFilters, type PredictionMarkFilter, type PredictionSortKey } from "@/components/PredictionTableFilters";
import { HistoryBackButton } from "@/components/HistoryBackButton";
import { OfficialTrigamiStatus, type TicketFormation } from "@/components/OfficialTrigamiStatus";
import { EvExplanationTooltip } from "@/components/EvExplanationTooltip";
import { buildSavedScoreReferenceTicket, type DisplayTicket } from "@/lib/referenceTicket";
import { publicOddsPublicationNotice, publicOddsPublicationState } from "@/lib/publicOddsPublication";
import { buildPendingRaceExplanation } from "@/lib/pendingRaceExplanation";

/**
 * 予想ページ
 * - URLパラメータ: ?date=YYYY-MM-DD&venue=xxx&race=N
 * - パラメータなし: 今週末の予想可能レース一覧を表示
 * - パラメータあり: 指定レースの予想を実行・表示
 */
export default function PredictionPage() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const date = params.get("date");
  const venue = params.get("venue");
  const raceNumber = params.get("race") ? parseInt(params.get("race")!) : null;

  if (date && venue && raceNumber) {
    return <RacePredictionView date={date} venue={venue} raceNumber={raceNumber} />;
  }

  return <RaceListView />;
}

// ==========================================
// レース一覧ビュー（今週末の予想可能レース）
// ==========================================
function RaceListView() {
  const { data: upcomingRaces, isLoading } = trpc.prediction.getUpcomingRaces.useQuery();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 日付ごとにグループ化
  const groupedByDate = useMemo(() => {
    if (!upcomingRaces) return {};
    const groups: Record<string, typeof upcomingRaces> = {};
    for (const race of upcomingRaces) {
      if (!groups[race.raceDate]) groups[race.raceDate] = [];
      groups[race.raceDate]!.push(race);
    }
    return groups;
  }, [upcomingRaces]);

  const dates = Object.keys(groupedByDate).sort();
  const activeDate = selectedDate ?? dates[0] ?? null;

  // 会場ごとにグループ化
  const groupedByVenue = useMemo(() => {
    if (!activeDate || !groupedByDate[activeDate]) return {};
    const groups: Record<string, typeof upcomingRaces> = {};
    for (const race of groupedByDate[activeDate]!) {
      if (!groups[race.venue]) groups[race.venue] = [];
      groups[race.venue]!.push(race);
    }
    return groups;
  }, [activeDate, groupedByDate]);

  const formatDate = (dateStr: string) => {
    // dateStrは"2026-08-08"形式。タイムゾーン問題を避けるため手動パース
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(year!, month! - 1, day!);
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return `${d.getMonth() + 1}/${d.getDate()}（${days[d.getDay()]}）`;
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0a0f1a 0%, #0d1b2a 100%)" }}>
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 backdrop-blur-md border-b" style={{ backgroundColor: "rgba(10,15,26,0.9)", borderColor: "rgba(0,229,255,0.15)" }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <HistoryBackButton aria-label="前の画面へ戻る" className="p-1.5 rounded-lg transition-colors" style={{ backgroundColor: "rgba(0,229,255,0.1)" }}>
            <ArrowLeft className="w-4 h-4" style={{ color: "#00e5ff" }} />
          </HistoryBackButton>
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5" style={{ color: "#00e5ff" }} />
            <h1 className="text-lg font-bold text-white">AI予想</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00e5ff" }} />
            <p className="mt-4 text-sm text-gray-400">レース情報を取得中...</p>
          </div>
        ) : dates.length === 0 ? (
          <div className="text-center py-20">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400">今週の予想可能なレースはありません</p>
            <p className="text-xs text-gray-500 mt-2">レーススケジュールが登録されると表示されます</p>
          </div>
        ) : (
          <>
            {/* 日付タブ */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {dates.map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
                  style={{
                    backgroundColor: d === activeDate ? "rgba(0,229,255,0.2)" : "rgba(255,255,255,0.05)",
                    color: d === activeDate ? "#00e5ff" : "#94a3b8",
                    border: d === activeDate ? "1px solid rgba(0,229,255,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {formatDate(d)}
                </button>
              ))}
            </div>

            {/* 会場ごとのレース一覧 */}
            {Object.entries(groupedByVenue).map(([venueName, venueRaces]) => (
              <div key={venueName} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4" style={{ color: "#c9a84c" }} />
                  <h2 className="text-base font-bold text-white">{venueName}</h2>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#c9a84c" }}>
                    {venueRaces!.length}レース
                  </span>
                </div>
                <div className="grid gap-2">
                  {venueRaces!.map(race => {
                    const canPredict = Boolean((race as any).hasEntries);
                    const isPartialEntryList = Boolean((race as any).predictionAvailability?.isPartialEntryList);
                    const cardKey = `${race.raceDate}-${race.venue}-${race.raceNumber}`;
                    const cardContent = <>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <span className="text-xs font-bold px-2 py-1 rounded" style={{ backgroundColor: "rgba(0,229,255,0.15)", color: "#00e5ff" }}>
                            {race.raceNumber}R
                          </span>
                          {(race as any).hasPrediction && (
                            <CheckCircle2 className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5" style={{ color: "#22c55e" }} />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{race.raceName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {race.surface && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                                backgroundColor: race.surface === "turf" ? "rgba(34,197,94,0.15)" : "rgba(194,120,3,0.15)",
                                color: race.surface === "turf" ? "#22c55e" : "#c27803",
                              }}>
                                {race.surface === "turf" ? "芝" : "ダ"}
                              </span>
                            )}
                            {race.distance && (
                              <span className="text-[10px] text-gray-400">{race.distance}m</span>
                            )}
                            {race.startTime && (
                              <span className="text-[10px] text-gray-500">{race.startTime}</span>
                            )}
                            {race.grade && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{
                                backgroundColor: race.grade === "G1" ? "rgba(239,68,68,0.2)" : race.grade === "G2" ? "rgba(59,130,246,0.2)" : "rgba(34,197,94,0.2)",
                                color: race.grade === "G1" ? "#ef4444" : race.grade === "G2" ? "#3b82f6" : "#22c55e",
                              }}>
                                {race.grade}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(race as any).hasPrediction ? (
                          <span className="text-[10px] px-2 py-1 rounded font-medium" style={{ backgroundColor: "rgba(34,197,94,0.2)", color: "#22c55e" }}>
                            ✔ 予想済
                          </span>
                        ) : canPredict && isPartialEntryList ? (
                          <span className="text-[10px] px-2 py-1 rounded" style={{ backgroundColor: "rgba(56,189,248,0.14)", color: "#7dd3fc" }}>
                            暫定予想
                          </span>
                        ) : canPredict ? (
                          <span className="text-[10px] px-2 py-1 rounded" style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                            出走確定
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-1 rounded" style={{ backgroundColor: "rgba(245,158,11,0.12)", color: "#fbbf24" }}>
                            出馬表データ待ち
                          </span>
                        )}
                        {canPredict ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <AlertTriangle className="w-4 h-4" style={{ color: "#fbbf24" }} />}
                      </div>
                    </>;

                    const cardStyle = {
                      backgroundColor: (race as any).hasPrediction ? "rgba(34,197,94,0.06)" : canPredict ? "rgba(255,255,255,0.03)" : "rgba(245,158,11,0.035)",
                      border: (race as any).hasPrediction ? "1px solid rgba(34,197,94,0.25)" : canPredict ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(245,158,11,0.18)",
                    };

                    return (
                      <Link
                        key={cardKey}
                        href={`/predictions?date=${race.raceDate}&venue=${encodeURIComponent(race.venue)}&race=${race.raceNumber}`}
                        aria-label={`${race.venue} ${race.raceNumber}R：${canPredict ? "予想を開く" : "出馬表データ待ちの詳細を開く"}`}
                        className="flex items-center justify-between p-3 rounded-lg transition-all hover:scale-[1.01] active:scale-[0.99]"
                        style={cardStyle}
                      >
                        {cardContent}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 個別レース予想ビュー
// ==========================================
function RacePredictionView({ date, venue, raceNumber }: { date: string; venue: string; raceNumber: number }) {
  const [hasPredicted, setHasPredicted] = useState(false);
  const autoRunRef = useRef(false);

  // 既存予想の確認
  const { data: existing, isLoading: loadingExisting } = trpc.prediction.getExistingPrediction.useQuery(
    { date, venue, raceNumber },
  );

  // raceIdを取得（既存予想 or 実行結果から）
  const raceId = existing?.race?.raceId ?? null;

  // 穴馬分析データ
  const { data: anaUmaData } = trpc.anaUma.analyzeRace.useQuery(
    { raceId: raceId! },
    { enabled: !!raceId, staleTime: 5 * 60 * 1000, retry: 1 }
  );

  // 予想実行ミューテーション
  const runPrediction = trpc.prediction.runPrediction.useMutation({
    onSuccess: () => setHasPredicted(true),
  });

  const handleRunPrediction = () => {
    runPrediction.mutate({ date, venue, raceNumber });
  };

  // 既存予想がない場合、自動的に予想を実行する
  useEffect(() => {
    if (!loadingExisting && !existing && !hasPredicted && !runPrediction.isPending && !autoRunRef.current) {
      autoRunRef.current = true;
      runPrediction.mutate({ date, venue, raceNumber });
    }
  }, [loadingExisting, existing, hasPredicted, runPrediction.isPending]);

  const formatDate = (dateStr: string) => {
    // dateStrは"2026-08-08"形式。タイムゾーン問題を避けるため手動パース
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(year!, month! - 1, day!);
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0a0f1a 0%, #0d1b2a 100%)" }}>
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 backdrop-blur-md border-b" style={{ backgroundColor: "rgba(10,15,26,0.9)", borderColor: "rgba(0,229,255,0.15)" }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/predictions" className="p-1.5 rounded-lg transition-colors" style={{ backgroundColor: "rgba(0,229,255,0.1)" }}>
            <ArrowLeft className="w-4 h-4" style={{ color: "#00e5ff" }} />
          </Link>
          <div>
            <h1 className="text-base font-bold text-white">{venue} {raceNumber}R AI予想</h1>
            <p className="text-xs text-gray-400">{formatDate(date)}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {loadingExisting || runPrediction.isPending ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00e5ff" }} />
            <p className="mt-4 text-sm text-gray-400">
              {loadingExisting ? "データを読み込み中..." : "AI予想を実行中..."}
            </p>
            <p className="mt-2 text-xs text-gray-500">出走馬データを取得してスコアリング中</p>
          </div>
        ) : runPrediction.data ? (
          <PredictionResultView
            data={runPrediction.data}
            anaUmaData={anaUmaData}
            raceContext={{ date, venue, raceNumber }}
            onRerun={handleRunPrediction}
            isRunning={runPrediction.isPending}
          />
        ) : existing ? (
          <ExistingPredictionView data={existing} onRerun={handleRunPrediction} isRunning={runPrediction.isPending} anaUmaData={anaUmaData} />
        ) : runPrediction.error ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: "#f59e0b" }} />
            <p className="text-gray-300">{runPrediction.error.message || "予想の実行に失敗しました"}</p>
            <p className="text-xs text-gray-500 mt-2">出走表が発表されると予想が可能になります</p>
            <button
              onClick={handleRunPrediction}
              className="mt-6 px-6 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.97]"
              style={{ backgroundColor: "rgba(0,229,255,0.15)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)" }}
            >
              <span className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                再試行する
              </span>
            </button>
          </div>
        ) : (
          <NoPredictionView
            date={date}
            venue={venue}
            raceNumber={raceNumber}
            onRun={handleRunPrediction}
            isRunning={runPrediction.isPending}
          />
        )}
      </div>
    </div>
  );
}

// ==========================================
// 予想未実行ビュー
// ==========================================
function NoPredictionView({ date, venue, raceNumber, onRun, isRunning }: {
  date: string; venue: string; raceNumber: number; onRun: () => void; isRunning: boolean;
}) {
  return (
    <div className="text-center py-12">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,229,255,0.1)", border: "2px solid rgba(0,229,255,0.3)" }}>
        <Zap className="w-10 h-10" style={{ color: "#00e5ff" }} />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">{venue} {raceNumber}R</h2>
      <p className="text-sm text-gray-400 mb-8">
        AIスコアリングアルゴリズムによる予想を実行します<br />
        <span className="text-xs text-gray-500">※公式に取り込み済みの出馬表データを基に予想します</span>
      </p>

      {/* アルゴリズム説明 */}
      <div className="rounded-xl p-4 mb-8 text-left" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: "#c9a84c" }} />
          分析要素
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            "オッズ・人気度分析",
            "騎手統計（勝率・コース適性）",
            "枠番バイアス",
            "馬場状態×コース適性",
            "血統×距離適性",
            "馬体重増減（体調判定）",
            "年齢ファクター",
            "穴馬検知（過小評価馬）",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-gray-300">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#00e5ff" }} />
              {item}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onRun}
        disabled={isRunning}
        className="px-8 py-3 rounded-xl font-bold text-base transition-all active:scale-[0.97] disabled:opacity-50"
        style={{ backgroundColor: "rgba(0,229,255,0.2)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.4)" }}
      >
        {isRunning ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            予想実行中...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            予想を実行する
          </span>
        )}
      </button>
    </div>
  );
}

// ==========================================
// 予想結果ビュー
// ==========================================
function PredictionResultView({ data, anaUmaData, raceContext, onRerun, isRunning }: {
  data: any;
  anaUmaData?: any;
  raceContext?: { date: string; venue: string; raceNumber: number };
  onRerun?: () => void;
  isRunning?: boolean;
}) {
  const [sortBy, setSortBy] = useState<PredictionSortKey>("score");
  const [minWinProbability, setMinWinProbability] = useState(0);
  const [minExpectedValue, setMinExpectedValue] = useState(-9999);
  const [markFilter, setMarkFilter] = useState<PredictionMarkFilter>("all");
  const rawPredictions = (data.predictions ?? []) as Array<{
    horseNumber: number;
    horseName: string;
    jockey: string | null;
    odds: number | null;
    oddsSource?: "official" | "predicted";
    score: number;
    winProbability: number;
    expectedValue: number | null;
    breakdown: { base: number; jockeyBonus: number; oddsScore: number; gateScore: number; trackConditionScore: number; bloodlineScore: number; weightScore: number; ageScore: number; oddsMovementScore?: number; abilityScore?: number; marketSignalScore?: number; total: number; };
    rating: string;
  }>;

  const predictions = useMemo(() => rawPredictions
    .filter(item => item.winProbability >= minWinProbability)
    .filter(item => minExpectedValue === -9999 || (item.expectedValue ?? -Infinity) >= minExpectedValue)
    .filter(item => markFilter === "all" || (markFilter === "top3" ? ["◎", "○", "▲"].includes(item.rating) : ["◎", "○", "▲", "△"].includes(item.rating)))
    .sort((a, b) => {
      if (sortBy === "winProbability") return b.winProbability - a.winProbability;
      if (sortBy === "expectedValue") return (b.expectedValue ?? -Infinity) - (a.expectedValue ?? -Infinity);
      if (sortBy === "odds") return (a.odds ?? Infinity) - (b.odds ?? Infinity);
      return b.score - a.score;
  }), [rawPredictions, sortBy, minWinProbability, minExpectedValue, markFilter]);

  if (data.message && rawPredictions.length === 0 && raceContext && onRerun) {
    return <NoPredictionView {...raceContext} onRun={onRerun} isRunning={Boolean(isRunning)} />;
  }

  const recommendation = data.recommendation as {
    trifecta: string;
    trio: string;
    trifectaCount: number;
    trioCount: number;
    totalBets: number;
    riskWarning?: string;
    formationCaution?: string;
    formation?: TicketFormation;
    referenceOnly?: boolean;
    referenceNotice?: string;
    reasoning: string[];
  } | null;
  const longshotRecommendation = data.longshotRecommendation as typeof recommendation;
  const raceAnalysis = data.raceAnalysis as null | {
    volatilityLabel: string;
    volatilityReason: string;
    axisPolicyLabel: string;
    scoreGap: number | null;
    scoreSpread: number | null;
    missingDataNotice: string | null;
  };
  const availability = data.availability as { entryCount: number; isPartialEntryList: boolean; canGenerateCombinationBets: boolean; message: string } | undefined;

  const structuredPrediction = data.structuredPrediction as null | {
    summary: string;
    winCandidate: { horseNumber: number; horseName: string; confidence: number; rationale: string };
    placeCandidates: Array<{ horseNumber: number; horseName: string; confidence: number; rationale: string }>;
    riskLevel: "low" | "medium" | "high";
    riskNotes: string[];
    disclaimer: string;
    model: string;
    generatedAt: string;
  };

  const ratingColor = (rating: string) => {
    switch (rating) {
      case "◎": return "#ff4444";
      case "○": return "#ff8800";
      case "▲": return "#00e5ff";
      case "△": return "#22c55e";
      default: return "#64748b";
    }
  };

  return (
    <div className="space-y-6">
      {/* レース情報 */}
      <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.2)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-5 h-5" style={{ color: "#00e5ff" }} />
          <h2 className="text-base font-bold text-white">
            {data.race.venueName ?? data.race.venue} {data.race.raceNumber}R {data.race.raceName && data.race.raceName !== `${data.race.raceNumber}R` ? data.race.raceName : ""}
          </h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {data.race.surface && <span>{data.race.surface === "turf" ? "芝" : "ダート"}</span>}
          {data.race.distance && <span>{data.race.distance}m</span>}
          {data.race.trackCondition && <span>馬場: {data.race.trackCondition}</span>}
          <span>{predictions.length}頭立て</span>
        </div>
      </div>

      {availability?.isPartialEntryList && (
        <div className="rounded-xl p-3 text-xs text-sky-100" style={{ backgroundColor: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.28)" }}>
          <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-sky-300" />
          <strong>暫定個別予想：</strong>{availability.message} 保存済みの実在馬{availability.entryCount}頭だけを評価しています。馬名・馬番・枠順・公式オッズは補完せず、3連系は対象外として表示します。
        </div>
      )}

      {publicOddsPublicationState === "predicted_until_official_contract" && (
        <div className="rounded-xl p-3 text-xs text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.28)" }}>
          <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 text-amber-300" />
          {publicOddsPublicationNotice}
        </div>
      )}

      {raceAnalysis && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.24)" }}>
          <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4" style={{ color: "#c4b5fd" }} /><h3 className="text-sm font-bold text-white">レース分析：波乱度・軸信頼度</h3></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><p className="text-[10px] text-gray-500">波乱度</p><p className="text-sm font-bold" style={{ color: "#c4b5fd" }}>{raceAnalysis.volatilityLabel}</p></div>
            <div><p className="text-[10px] text-gray-500">軸方針</p><p className="text-sm font-bold text-white">{raceAnalysis.axisPolicyLabel}</p></div>
            <div><p className="text-[10px] text-gray-500">能力1・2位差</p><p className="text-sm font-bold text-white">{raceAnalysis.scoreGap === null ? "データなし" : `${raceAnalysis.scoreGap}pt`}</p></div>
            <div><p className="text-[10px] text-gray-500">能力ばらつき</p><p className="text-sm font-bold text-white">{raceAnalysis.scoreSpread === null ? "データなし" : `${raceAnalysis.scoreSpread}pt`}</p></div>
          </div>
          <p className="mt-3 text-[11px] text-gray-400">{raceAnalysis.volatilityReason}</p>
          {raceAnalysis.missingDataNotice && <p className="mt-2 rounded px-2.5 py-2 text-[11px] text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>{raceAnalysis.missingDataNotice}</p>}
        </div>
      )}

      {structuredPrediction && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.26)" }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "#4ade80" }}>
              <CheckCircle2 className="w-4 h-4" />
              発走前 構造化予想
            </h3>
            <span className="text-[10px] px-2 py-1 rounded" style={{ backgroundColor: "rgba(34,197,94,0.13)", color: "#86efac" }}>
              保存済み・{structuredPrediction.model}
            </span>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed">{structuredPrediction.summary}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[structuredPrediction.winCandidate, ...structuredPrediction.placeCandidates].map((candidate, index) => (
              <div key={candidate.horseNumber} className="p-2.5 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.035)" }}>
                <p className="text-xs font-bold" style={{ color: index === 0 ? "#ff6b6b" : index === 1 ? "#fbbf24" : "#67e8f9" }}>
                  {index === 0 ? "◎" : index === 1 ? "○" : "▲"} {candidate.horseNumber}番 {candidate.horseName}
                </p>
                <p className="mt-1 text-[11px] text-gray-400">{candidate.rationale}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <p className="text-[11px] text-amber-200">リスク: {structuredPrediction.riskNotes.join(" / ")}</p>
            <p className="mt-1 text-[10px] text-gray-500">{structuredPrediction.disclaimer}</p>
          </div>
        </div>
      )}

      {/* 推奨買い目 */}
      {recommendation && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.2)" }}>
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: "#c9a84c" }}>
            <TrendingUp className="w-4 h-4" />
            【パターン1】スコア順買い目（堅実重視）
          </h3>
          <p className="mb-3 text-xs text-gray-400">{recommendation.referenceOnly ? "データ不足時でもスコア順位の組合せを確認できるように表示しています。購入の推奨、精算、実績への反映は行いません。" : "軸馬が1着に来た場合の2・3着の取りこぼしを抑える構成です。予想・回収を保証するものではありません。"}</p>
          <div className="grid grid-cols-1 gap-3 mb-4 md:grid-cols-2">
            <div className="p-2 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
              <p className="text-[10px] text-gray-500 mb-0.5">3連単・{recommendation.trifectaCount}点</p>
              <p className="text-sm font-bold text-white">{recommendation.trifecta}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
              <p className="text-[10px] text-gray-500 mb-0.5">3連複・{recommendation.trioCount}点</p>
              <p className="text-sm font-bold text-white">{recommendation.trio}</p>
            </div>
          </div>
          <div className="mb-4 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "#d1d5db" }}>{recommendation.referenceOnly ? `参考組合せ ${recommendation.totalBets}点（購入推奨なし）` : `合計 ${recommendation.totalBets}点 / 想定投資額 ¥${(recommendation.totalBets * 100).toLocaleString()}（1点100円換算）`}</div>
          {recommendation.formationCaution && <p className="mb-2 rounded-lg px-3 py-2 text-xs text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>{recommendation.formationCaution}</p>}
          {!recommendation.referenceOnly && <OfficialTrigamiStatus raceId={data.race?.raceId} formation={recommendation.formation} totalBets={recommendation.totalBets} />}
          {recommendation.riskWarning && !recommendation.formation && <p className="mb-3 rounded-lg px-3 py-2 text-xs text-rose-100" style={{ backgroundColor: "rgba(244,63,94,0.12)" }}>トリガミ確認: {recommendation.riskWarning}</p>}
          {/* 根拠 */}
          <div className="space-y-1.5">
            {recommendation.reasoning.map((r: string, i: number) => (
              <p key={i} className="text-xs text-gray-300 leading-relaxed">{r}</p>
            ))}
          </div>
        </div>
      )}

      {longshotRecommendation && (
        <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(244,63,94,0.16) 0%, rgba(168,85,247,0.12) 52%, rgba(251,191,36,0.08) 100%)", border: "1px solid rgba(251,113,133,0.58)", boxShadow: "0 0 0 1px rgba(251,191,36,0.10), 0 12px 28px rgba(244,63,94,0.10)" }}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "#fecdd3" }}>
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(251,113,133,0.24)", border: "1px solid rgba(253,164,175,0.65)" }}>
                <Sparkles className="h-4 w-4" style={{ color: "#fef08a" }} />
              </span>
              <span>【パターン2】穴馬軸買い目</span>
            </h3>
            <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold" style={{ backgroundColor: "rgba(251,191,36,0.18)", border: "1px solid rgba(253,224,71,0.42)", color: "#fef08a" }}>予想オッズ基準</span>
          </div>
          <p className="mb-3 text-xs text-gray-400">穴推奨馬を1着軸に置きつつ、スコア上位馬を2・3着候補から除外しない構成です。予想・回収を保証するものではありません。</p>
          <p className="mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.12)", border: "1px solid rgba(251,191,36,0.22)" }}><Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" />公式オッズではなく、能力スコアから導いた予想オッズによる推定です。</p>
          <div className="grid grid-cols-1 gap-3 mb-4 md:grid-cols-2">
            <div className="p-2 rounded-lg" style={{ backgroundColor: "rgba(15,23,42,0.34)", border: "1px solid rgba(253,164,175,0.20)" }}>
              <p className="text-[10px] text-gray-500 mb-0.5">3連単・{longshotRecommendation.trifectaCount}点</p>
              <p className="text-sm font-bold text-white">{longshotRecommendation.trifecta}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: "rgba(15,23,42,0.34)", border: "1px solid rgba(196,181,253,0.20)" }}>
              <p className="text-[10px] text-gray-500 mb-0.5">3連複・{longshotRecommendation.trioCount}点</p>
              <p className="text-sm font-bold text-white">{longshotRecommendation.trio}</p>
            </div>
          </div>
          <div className="mb-4 rounded-lg px-3 py-2 text-xs font-medium" style={{ backgroundColor: "rgba(251,113,133,0.12)", border: "1px solid rgba(251,113,133,0.18)", color: "#ffe4e6" }}>穴馬軸：合計 {longshotRecommendation.totalBets}点 / 想定投資額 ¥{(longshotRecommendation.totalBets * 100).toLocaleString()}（1点100円換算）</div>
          {longshotRecommendation.formationCaution && <p className="mb-2 rounded-lg px-3 py-2 text-xs text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>{longshotRecommendation.formationCaution}</p>}
          <OfficialTrigamiStatus raceId={data.race?.raceId} formation={longshotRecommendation.formation} totalBets={longshotRecommendation.totalBets} />
          {longshotRecommendation.riskWarning && !longshotRecommendation.formation && <p className="mb-3 rounded-lg px-3 py-2 text-xs text-rose-100" style={{ backgroundColor: "rgba(244,63,94,0.12)" }}>トリガミ確認: {longshotRecommendation.riskWarning}</p>}
          <div className="space-y-1.5">{longshotRecommendation.reasoning.map((reason: string, index: number) => <p key={index} className="text-xs text-gray-300 leading-relaxed">{reason}</p>)}</div>
        </div>
      )}

      {/* 予想テーブル */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="p-3" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
          <h3 className="text-sm font-bold text-white">AIスコアランキング</h3>
        </div>
        <PredictionTableFilters
          accent="#00e5ff"
          sortBy={sortBy}
          onSortByChange={setSortBy}
          minWinProbability={minWinProbability}
          onMinWinProbabilityChange={setMinWinProbability}
          minExpectedValue={minExpectedValue}
          onMinExpectedValueChange={setMinExpectedValue}
          markFilter={markFilter}
          onMarkFilterChange={setMarkFilter}
          visibleCount={predictions.length}
          totalCount={rawPredictions.length}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                <th className="px-2 py-2 text-left text-gray-500 font-medium">印</th>
                <th className="px-2 py-2 text-left text-gray-500 font-medium">馬番</th>
                <th className="px-2 py-2 text-left text-gray-500 font-medium">馬名</th>
                <th className="px-2 py-2 text-left text-gray-500 font-medium">騎手</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium">予想オッズ</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium">勝率</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium">能力スコア</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium">EV</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium">市場参考</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((p, i) => (
                <tr
                  key={p.horseNumber}
                  className="border-t"
                  style={{
                    borderColor: "rgba(255,255,255,0.05)",
                    backgroundColor: i < 3 ? "rgba(0,229,255,0.02)" : "transparent",
                  }}
                >
                  <td className="px-2 py-2.5">
                    <span className="text-base font-bold" style={{ color: ratingColor(p.rating) }}>
                      {p.rating}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold" style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#fff" }}>
                      {p.horseNumber}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-white font-medium">{p.horseName}</td>
                  <td className="px-2 py-2.5 text-gray-400">{p.jockey ?? "—"}</td>
                  <td className="px-2 py-2.5 text-right text-gray-300">{p.odds ? `${p.odds}倍` : "—"}</td>
                  <td className="px-2 py-2.5 text-right font-medium" style={{ color: "#67e8f9" }}>{p.winProbability.toFixed(1)}%</td>
                  <td className="px-2 py-2.5 text-right">
                    <span className="font-bold" style={{ color: p.score >= 70 ? "#00e5ff" : p.score >= 55 ? "#22c55e" : "#94a3b8" }}>
                      {p.score.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium">
                    {p.expectedValue === null ? <span className="inline-flex items-center justify-end gap-1 text-gray-500">未算出 <EvExplanationTooltip odds={p.odds} winProbability={p.winProbability} expectedValue={p.expectedValue} oddsSource={p.oddsSource} /></span> : <span className="inline-flex items-center justify-end gap-1" style={{ color: p.expectedValue >= 0 ? "#4ade80" : "#f87171" }}>{p.expectedValue < 0 && <AlertTriangle className="h-3.5 w-3.5" aria-label="EVがマイナス" />} {`${p.expectedValue >= 0 ? "+" : ""}${p.expectedValue.toFixed(1)}%`} <EvExplanationTooltip odds={p.odds} winProbability={p.winProbability} expectedValue={p.expectedValue} oddsSource={p.oddsSource} /></span>}
                  </td>
                  <td className="px-2 py-2.5 text-right text-gray-400">{p.breakdown?.marketSignalScore ? `${p.breakdown.marketSignalScore >= 0 ? "+" : ""}${p.breakdown.marketSignalScore.toFixed(1)}pt` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* スコア内訳（上位3頭） */}
      <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <h3 className="text-sm font-bold text-white mb-3">上位3頭のスコア内訳</h3>
        <div className="space-y-4">
          {predictions.slice(0, 3).map(p => (
            <div key={p.horseNumber}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold" style={{ color: ratingColor(p.rating) }}>{p.rating}</span>
                <span className="text-sm text-white font-medium">{p.horseName}</span>
                <span className="text-xs text-gray-500">({p.horseNumber}番)</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: "ベース", value: p.breakdown.base },
                  { label: "騎手", value: p.breakdown.jockeyBonus },
                  { label: "オッズ", value: p.breakdown.oddsScore },
                  { label: "枠番", value: p.breakdown.gateScore },
                  { label: "馬場", value: p.breakdown.trackConditionScore },
                  { label: "血統", value: p.breakdown.bloodlineScore },
                  { label: "体重", value: p.breakdown.weightScore },
                  { label: "年齢", value: p.breakdown.ageScore },
                  { label: "市場急変", value: p.breakdown.oddsMovementScore ?? 0 },
                ].map(item => (
                  <div key={item.label} className="text-center p-1.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <p className="text-[9px] text-gray-500">{item.label}</p>
                    <p className="text-xs font-bold" style={{ color: item.value > 0 ? "#22c55e" : item.value < 0 ? "#ef4444" : "#64748b" }}>
                      {item.value > 0 ? `+${Number(item.value).toFixed(1)}` : Number(item.value).toFixed(1)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 穴狙い詳細分析セクション */}
      {anaUmaData && (
        <JraAnaUmaDetailSection data={anaUmaData} />
      )}
    </div>
  );
}

// ==========================================
// 穴狙い詳細分析セクション（JRA用）
// ==========================================
function JraAnaUmaDetailSection({ data }: { data: any }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(0,200,255,0.2)" }}>
      {/* ヘッダー */}
      <div className="px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(0,200,255,0.08) 0%, rgba(0,100,200,0.06) 100%)" }}>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4" style={{ color: "#00e5ff" }} />
          <h3 className="text-sm font-bold" style={{ color: "#00e5ff" }}>穴狙い詳細分析</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ml-auto ${
            data.alertLevel === "高" ? "bg-red-500/20 text-red-300 border border-red-500/30" :
            data.alertLevel === "中" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" :
            "bg-gray-500/20 text-gray-300 border border-gray-500/30"
          }`}>
            {data.alertLevel === "高" ? "大穴警報" : data.alertLevel === "中" ? "中穴警報" : "平穏"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4" style={{ backgroundColor: "rgba(0,200,255,0.02)" }}>
        {/* コース波乱度統計 */}
        {data.courseStats && (
          <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs text-gray-400 mb-2">コース・距離: <span className="text-white font-medium">{data.courseLabel}</span></p>
            <p className="text-xs text-gray-400">
              コース過去統計（波乱度）: 単勝6.0倍以上の穴馬が3着以内に入り込む確率は{" "}
              <span className="font-bold" style={{ color: "#00e5ff" }}>約{data.courseStats.longshotRate}%（約{data.courseStats.longshotFrequency}レースに1回）</span>
            </p>
            {data.trackDiagnosis && (
              <p className="text-xs text-gray-400 mt-1">天候・馬場診断: <span style={{ color: "#22c55e" }}>{data.trackDiagnosis}</span></p>
            )}
          </div>
        )}

        {/* 穴馬候補ランキング（上位5頭） */}
        {data.candidates && data.candidates.length > 0 && (
          <div>
            <p className="text-xs font-bold text-white mb-2">穴馬候補 総合スコア順（上位5頭）</p>
            <div className="space-y-2">
              {data.candidates.slice(0, 5).map((c: any, idx: number) => (
                <div key={c.horseNumber} className="flex items-center gap-2 p-2 rounded-lg" style={{
                  backgroundColor: idx === 0 ? "rgba(0,200,255,0.06)" : "rgba(255,255,255,0.02)",
                  border: idx === 0 ? "1px solid rgba(0,200,255,0.15)" : "1px solid rgba(255,255,255,0.04)",
                }}>
                  <span className="text-xs font-bold w-5 text-center" style={{ color: idx === 0 ? "#00e5ff" : "#9ca3af" }}>
                    {idx + 1}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    c.category === "大穴" ? "bg-red-500/20 text-red-300" : "bg-cyan-500/20 text-cyan-300"
                  }`}>
                    {c.category}
                  </span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(0,229,255,0.15)", color: "#00e5ff" }}>
                    {c.horseNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{c.horseName}</p>
                    <p className="text-[10px] text-gray-500">{c.jockey ?? "未定"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold" style={{ color: "#00e5ff" }}>{c.anaScore}pt</p>
                    <p className="text-[10px] text-gray-400">{c.odds}倍</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 筆頭穴馬の激走根拠 */}
        {data.topMidOdds && data.topMidOdds.reasons && data.topMidOdds.reasons.length > 0 && (
          <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(0,200,255,0.03)", border: "1px solid rgba(0,200,255,0.1)" }}>
            <p className="text-xs font-bold mb-1" style={{ color: "#00e5ff" }}>🚨 中穴筆頭: {data.topMidOdds.horseName}（{data.topMidOdds.odds}倍）</p>
            {data.topMidOdds.reasons.map((r: string, i: number) => (
              <p key={i} className="text-[11px] text-gray-400 ml-2">・{r}</p>
            ))}
          </div>
        )}
        {data.topBomb && data.topBomb.reasons && data.topBomb.reasons.length > 0 && (
          <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(255,50,0,0.03)", border: "1px solid rgba(255,50,0,0.1)" }}>
            <p className="text-xs font-bold text-red-300 mb-1">💣 大穴筆頭: {data.topBomb.horseName}（{data.topBomb.odds}倍）</p>
            {data.topBomb.reasons.map((r: string, i: number) => (
              <p key={i} className="text-[11px] text-gray-400 ml-2">・{r}</p>
            ))}
          </div>
        )}

        {/* 穴狙い推奨買い目 */}
        {data.anaBets && (
          <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-white">穴狙い推奨買い目</p>
              {typeof data.anaBets.totalBets === "number" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,165,0,0.1)", color: "#ffa500" }}>
                  重複除外後 合計{data.anaBets.totalBets}点
                </span>
              )}
            </div>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444" }}>3連単</span>
                <span className="text-xs text-gray-300 font-mono">{data.anaBets.trifecta}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>3連複</span>
                <span className="text-xs text-gray-300 font-mono">{data.anaBets.trio}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }}>馬連</span>
                <span className="text-xs text-gray-300 font-mono">{data.anaBets.quinella}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(168,85,247,0.15)", color: "#a855f7" }}>ワイド</span>
                <span className="text-xs text-gray-300 font-mono">{data.anaBets.wide}</span>
              </div>
            </div>
            {data.anaBets.reasoning && data.anaBets.reasoning.length > 0 && (
              <div className="mt-2 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                {data.anaBets.reasoning.map((r: string, i: number) => (
                  <p key={i} className="text-[10px] text-gray-500">・{r}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 既存予想ビュー
// ==========================================
function ExistingPredictionView({ data, onRerun, isRunning, anaUmaData }: { data: any; onRerun: () => void; isRunning: boolean; anaUmaData?: any }) {
  const prediction = data.prediction;
  const entryList = data.entries as Array<{ horseNumber: number; horseName: string; jockey: string | null; odds: number | null }>;
  const entriesUpdatedAt = data.entriesUpdatedAt;
  const parseTicket = (raw: string | null | undefined) => {
    if (!raw) return null;
    try { return JSON.parse(raw) as DisplayTicket; } catch { return null; }
  };
  const ticketSets = data.ticketSets as Array<{ strategy: "score" | "longshot"; ticketData: string }> | undefined;
  const scoreTicket = buildSavedScoreReferenceTicket(parseTicket(ticketSets?.find(ticket => ticket.strategy === "score")?.ticketData ?? prediction.recommendedBets), prediction);
  const longshotTicket = parseTicket(ticketSets?.find(ticket => ticket.strategy === "longshot")?.ticketData);

  const honmeiEntry = entryList.find(e => e.horseNumber === prediction.honmei);
  const taikouEntry = entryList.find(e => e.horseNumber === prediction.taikou);
  const tananaEntry = entryList.find(e => e.horseNumber === prediction.tanana);

  return (
    <div className="space-y-6">
      {/* 最終更新時刻 */}
      {entriesUpdatedAt && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <Calendar className="w-3 h-3" />
          <span>データ最終更新: {new Date(entriesUpdatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      )}

      {/* 既存予想サマリー */}
      <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.2)" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5" style={{ color: "#00e5ff" }} />
            前回の予想結果
          </h2>
          {prediction.isHit !== null && (
            <span className="text-xs px-2 py-1 rounded font-bold" style={{
              backgroundColor: prediction.isHit ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
              color: prediction.isHit ? "#22c55e" : "#ef4444",
            }}>
              {prediction.isHit ? "的中" : "不的中"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "◎ 本命", entry: honmeiEntry },
            { label: "○ 対抗", entry: taikouEntry },
            { label: "▲ 単穴", entry: tananaEntry },
          ].map(({ label, entry }) => (
            <div key={label} className="p-2 rounded-lg text-center" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
              <p className="text-[10px] text-gray-500 mb-1">{label}</p>
              <p className="text-xs font-bold text-white">{entry?.horseName ?? "—"}</p>
              <p className="text-[10px] text-gray-400">{entry ? `${entry.horseNumber}番` : ""}</p>
            </div>
          ))}
        </div>

        {prediction.reasoning && (
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">{prediction.reasoning}</p>
        )}
      </div>

      {(scoreTicket || longshotTicket) && (
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { key: "score", label: "【パターン1】スコア順（堅実重視）", ticket: scoreTicket, accent: "#c9a84c", background: "rgba(201,168,76,0.05)" },
            { key: "longshot", label: "【パターン2】穴馬軸（予想オッズ基準）", ticket: longshotTicket, accent: "#fb7185", background: "rgba(244,63,94,0.05)" },
          ].map(({ key, label, ticket, accent, background }) => ticket && (
            <div key={key} className="rounded-xl p-3" style={key === "longshot" ? { background: "linear-gradient(135deg, rgba(244,63,94,0.15), rgba(168,85,247,0.10))", border: "1px solid rgba(251,113,133,0.54)", boxShadow: "0 8px 20px rgba(244,63,94,0.08)" } : { backgroundColor: background, border: `1px solid ${accent}44` }}>
              <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-bold" style={{ color: accent }}>{key === "longshot" && <Sparkles className="mr-1 inline h-3.5 w-3.5 text-yellow-200" />}{label}</p>{key === "longshot" && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "rgba(251,191,36,0.16)", color: "#fef08a" }}>推定</span>}</div>
              <p className="text-[11px] text-gray-300">3連単 {ticket.trifectaCount}点: {ticket.trifecta}</p>
              <p className="mt-1 text-[11px] text-gray-300">3連複 {ticket.trioCount}点: {ticket.trio}</p>
              <p className="mt-2 text-[10px] text-gray-500">{ticket.referenceOnly ? `参考組合せ ${ticket.totalBets}点（購入推奨なし）` : `合計${ticket.totalBets}点 / ¥${(ticket.totalBets * 100).toLocaleString()}（1点100円換算）`}</p>
              {ticket.referenceNotice && <p className="mt-2 text-[10px] text-amber-100">{ticket.referenceNotice}</p>}
              {ticket.formationCaution && ticket.formationCaution !== ticket.referenceNotice && <p className="mt-2 text-[10px] text-amber-100">{ticket.formationCaution}</p>}
              {ticket.riskWarning && <p className="mt-1 text-[10px] text-rose-100">トリガミ確認: {ticket.riskWarning}</p>}
            </div>
          ))}
        </div>
      )}

      {/* 穴狙い詳細分析セクション */}
      {anaUmaData && (
        <JraAnaUmaDetailSection data={anaUmaData} />
      )}

      {/* 再予想ボタン */}
      <div className="text-center">
        <button
          onClick={onRerun}
          disabled={isRunning}
          className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.97] disabled:opacity-50"
          style={{ backgroundColor: "rgba(0,229,255,0.15)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)" }}
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              再予想中...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              最新データで再予想する
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
