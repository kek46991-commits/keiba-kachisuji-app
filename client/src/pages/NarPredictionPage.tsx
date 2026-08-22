import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Target, Loader2, Calendar, MapPin, ChevronRight, Zap, TrendingUp, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { PredictionTableFilters, type PredictionMarkFilter, type PredictionSortKey } from "@/components/PredictionTableFilters";
import { HistoryBackButton } from "@/components/HistoryBackButton";
import { OfficialTrigamiStatus } from "@/components/OfficialTrigamiStatus";
import { EvExplanationTooltip } from "@/components/EvExplanationTooltip";
import { buildSavedScoreReferenceTicket, type DisplayTicket } from "@/lib/referenceTicket";
import { formatTicketTextsForDisplay } from "@/lib/ticketDisplay";
import { formatBetSelectionForDisplay } from "@shared/formationDisplay";

/**
 * 地方競馬（NAR）予想ページ
 * - 日付タブで開催日を選択
 * - 開催場ごとのレース一覧を表示
 * - レースをクリックして予想を実行
 */
interface NarRaceSelection {
  raceId: string;
  venue: string;
  distance: number;
  headCount: number;
  raceName: string;
  raceNumber: number;
  surface: string;
  raceDate?: string;
}

export default function NarPredictionPage() {
  const [selectedRace, setSelectedRace] = useState<NarRaceSelection | null>(null);
  const searchString = useSearch();

  // URLパラメータからレース情報を取得
  const urlParams = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return {
      date: params.get("date"),
      venue: params.get("venue"),
      race: params.get("race") ? Number(params.get("race")) : null,
    };
  }, [searchString]);

  // URLパラメータがある場合、直接NarUrlPredictionViewを表示
  if (urlParams.date && urlParams.venue && urlParams.race && !selectedRace) {
    return (
      <NarUrlPredictionView
        date={urlParams.date}
        venue={urlParams.venue}
        raceNumber={urlParams.race}
      />
    );
  }

  if (selectedRace) {
    return (
      <NarRacePredictionView
        {...selectedRace}
        onBack={() => setSelectedRace(null)}
      />
    );
  }

  return <NarRaceListView onSelectRace={setSelectedRace} />;
}

// ==========================================
// URLパラメータ経由の予想ビュー（カレンダーからの遷移用）
// ==========================================
function NarUrlPredictionView({ date, venue, raceNumber }: { date: string; venue: string; raceNumber: number }) {
  const { data: raceData, isLoading, isError, error, refetch } = trpc.narPrediction.getRaces.useQuery({ date });
  const responseError = typeof (raceData as { error?: unknown } | undefined)?.error === "string"
    ? (raceData as { error: string }).error
    : null;

  const matchingRace = useMemo(() => {
    if (!raceData?.races) return null;
    return raceData.races.find(r => r.venue === venue && r.raceNumber === raceNumber) ?? null;
  }, [raceData, venue, raceNumber]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg, #0a0f1a 0%, #0d1b2a 100%)" }}>
        <div className="flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#ffa500" }} />
          <p className="mt-4 text-sm text-gray-400">レース情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (isError || responseError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "linear-gradient(180deg, #0a0f1a 0%, #0d1b2a 100%)" }}>
        <div className="max-w-sm rounded-xl p-5 text-center" style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.26)" }}>
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-300" />
          <h2 className="text-sm font-bold text-white">レース情報を取得できませんでした</h2>
          <p className="mt-2 text-xs leading-relaxed text-gray-400">{responseError ?? error?.message ?? "通信状態を確認して、もう一度お試しください。"}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => void refetch()} className="rounded-lg px-3 py-2 text-xs font-bold" style={{ backgroundColor: "rgba(255,165,0,0.16)", border: "1px solid rgba(255,165,0,0.36)", color: "#fbbf24" }}>再読み込み</button>
            <Link href="/nar-predictions" className="rounded-lg px-3 py-2 text-xs font-bold text-gray-300" style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>レース一覧へ</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!matchingRace) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(180deg, #0a0f1a 0%, #0d1b2a 100%)" }}>
        <div className="flex flex-col items-center text-center">
          <AlertTriangle className="w-12 h-12 mb-4 text-yellow-500" />
          <p className="text-white font-medium">{venue} {raceNumber}R のレースデータが見つかりません</p>
          <p className="text-xs text-gray-400 mt-2">データがまだ取得されていない可能性があります</p>
          <Link href="/nar-predictions" className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: "rgba(255,165,0,0.2)", color: "#ffa500" }}>
            レース一覧に戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <NarRacePredictionView
      raceId={matchingRace.raceId}
      venue={matchingRace.venue}
      distance={matchingRace.distance}
      headCount={matchingRace.headCount}
      raceName={matchingRace.raceName}
      raceNumber={matchingRace.raceNumber}
      surface={matchingRace.surface}
      raceDate={date}
      onBack={() => { window.history.back(); }}
    />
  );
}

// ==========================================
// レース一覧ビュー
// ==========================================
function NarRaceListView({ onSelectRace }: { onSelectRace: (race: NarRaceSelection) => void }) {
  const { data: weekDates } = trpc.narPrediction.getThisWeekDates.useQuery();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const activeDate = selectedDate ?? weekDates?.[0] ?? null;

  const { data: raceData, isLoading, isError, error, refetch } = trpc.narPrediction.getRaces.useQuery(
    { date: activeDate! },
    { enabled: !!activeDate }
  );

  // 開催場ごとにグループ化
  type NarRaceInfo = NonNullable<typeof raceData>["races"][number];
  const groupedByVenue = useMemo(() => {
    if (!raceData?.races) return {} as Record<string, NarRaceInfo[]>;
    const groups: Record<string, NarRaceInfo[]> = {};
    for (const race of raceData.races) {
      if (!groups[race.venue]) groups[race.venue] = [];
      groups[race.venue]!.push(race);
    }
    return groups;
  }, [raceData]);

  const formatDate = (dateStr: string) => {
    // dateStr is "YYYY-MM-DD" - parse as local date parts to avoid timezone issues
    const [y, m, day] = dateStr.split("-").map(Number);
    const d = new Date(y!, m! - 1, day!);
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return `${m}/${day}（${days[d.getDay()]}）`;
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0a0f1a 0%, #0d1b2a 100%)" }}>
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 backdrop-blur-md border-b" style={{ backgroundColor: "rgba(10,15,26,0.9)", borderColor: "rgba(255,165,0,0.15)" }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <HistoryBackButton aria-label="前の画面へ戻る" className="p-1.5 rounded-lg transition-colors" style={{ backgroundColor: "rgba(255,165,0,0.1)" }}>
            <ArrowLeft className="w-4 h-4" style={{ color: "#ffa500" }} />
          </HistoryBackButton>
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5" style={{ color: "#ffa500" }} />
            <h1 className="text-lg font-bold text-white">地方競馬 AI予想</h1>
          </div>
          <span className="text-xs px-2 py-0.5 rounded ml-auto" style={{ backgroundColor: "rgba(255,165,0,0.15)", color: "#ffa500" }}>
            NAR
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {(isError || typeof (raceData as { error?: unknown } | undefined)?.error === "string") && (
          <div className="mb-5 rounded-xl p-4 text-center" style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.26)" }}>
            <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-300" />
            <p className="text-sm font-bold text-white">レース情報を取得できませんでした</p>
            <p className="mt-1 text-xs text-gray-400">{(raceData as { error?: string } | undefined)?.error ?? error?.message ?? "通信状態を確認して、もう一度お試しください。"}</p>
            <button onClick={() => void refetch()} className="mt-3 rounded-lg px-3 py-2 text-xs font-bold" style={{ backgroundColor: "rgba(255,165,0,0.16)", border: "1px solid rgba(255,165,0,0.36)", color: "#fbbf24" }}>再読み込み</button>
          </div>
        )}
        {/* 日付タブ */}
        {weekDates && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {weekDates.map(d => (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
                style={{
                  backgroundColor: d === activeDate ? "rgba(255,165,0,0.2)" : "rgba(255,255,255,0.05)",
                  color: d === activeDate ? "#ffa500" : "#94a3b8",
                  border: d === activeDate ? "1px solid rgba(255,165,0,0.4)" : "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {formatDate(d)}
              </button>
            ))}
          </div>
        )}

        {/* コンテンツ */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#ffa500" }} />
            <p className="mt-4 text-sm text-gray-400">レース情報を取得中...</p>
          </div>
        ) : raceData?.error ? (
          <div className="text-center py-20">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
            <p className="text-gray-400">{raceData.error}</p>
          </div>
        ) : Object.keys(groupedByVenue).length === 0 ? (
          <div className="text-center py-20">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400">この日の地方競馬レースはありません</p>
            <p className="text-xs text-gray-500 mt-2">別の日付を選択してください</p>
          </div>
        ) : (
          <>
            {/* 開催場ごとのレース一覧 */}
            {Object.entries(groupedByVenue).map(([venueName, venueRaces]) => (
              <div key={venueName} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4" style={{ color: "#ffa500" }} />
                  <h2 className="text-base font-bold text-white">{venueName}</h2>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,165,0,0.15)", color: "#ffa500" }}>
                    {venueRaces!.length}レース
                  </span>
                </div>
                <div className="grid gap-2">
                  {venueRaces!.map(race => (
                    <button
                      key={race.raceId}
                      onClick={() => onSelectRace({
                        raceId: race.raceId,
                        venue: race.venue,
                        distance: race.distance,
                        headCount: race.headCount,
                        raceName: race.raceName,
                        raceNumber: race.raceNumber,
                        surface: race.surface,
                        raceDate: activeDate ?? undefined,
                      })}
                      className="flex items-center justify-between p-3 rounded-lg transition-all hover:scale-[1.01] active:scale-[0.99] text-left w-full"
                      style={{
                        backgroundColor: (race as any).hasPrediction ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.03)",
                        border: (race as any).hasPrediction ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <span className="text-xs font-bold px-2 py-1 rounded" style={{ backgroundColor: "rgba(255,165,0,0.15)", color: "#ffa500" }}>
                            {race.raceNumber}R
                          </span>
                          {(race as any).hasPrediction && (
                            <CheckCircle2 className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5" style={{ color: "#22c55e" }} />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{race.raceName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                              backgroundColor: race.surface === "turf" ? "rgba(34,197,94,0.15)" : "rgba(194,120,3,0.15)",
                              color: race.surface === "turf" ? "#22c55e" : "#c27803",
                            }}>
                              {race.surface === "turf" ? "芝" : "ダ"}
                            </span>
                            {race.distance > 0 && (
                              <span className="text-[10px] text-gray-400">{race.distance}m</span>
                            )}
                            {race.startTime && (
                              <span className="text-[10px] text-gray-500">{race.startTime}</span>
                            )}
                            <span className="text-[10px] text-gray-500">{race.headCount}頭</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {race.status === "finished" ? (
                          <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(100,100,100,0.3)", color: "#9ca3af" }}>
                            確定
                          </span>
                        ) : (race as any).hasPrediction ? (
                          <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ backgroundColor: "rgba(34,197,94,0.2)", color: "#22c55e" }}>
                            ✔ 予想済
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,165,0,0.15)", color: "#ffa500" }}>
                            予想
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      </div>
                    </button>
                  ))}
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
function NarRacePredictionView({
  raceId,
  venue,
  distance,
  headCount,
  raceName,
  raceNumber,
  surface,
  raceDate,
  onBack,
}: {
  raceId: string;
  venue: string;
  distance: number;
  headCount: number;
  raceName: string;
  raceNumber: number;
  surface: string;
  raceDate?: string;
  onBack: () => void;
}) {
  const autoRunRef = useRef(false);
  const runPrediction = trpc.narPrediction.runPrediction.useMutation();
  const { data: existingPrediction, isLoading: loadingExisting } = trpc.narPrediction.getExistingPrediction.useQuery(
    { raceId },
    { enabled: !!raceId }
  );

  // 穴馬分析データ
  const { data: anaUmaData } = trpc.anaUma.analyzeRace.useQuery(
    { raceId, venue, surface, distance, raceNumber, raceDate, raceName },
    { enabled: !!raceId, staleTime: 5 * 60 * 1000, retry: 1 }
  );

  // パドック情報入力状態
  const [showPaddock, setShowPaddock] = useState(false);
  const [paddockData, setPaddockData] = useState<Array<{
    horseNumber: number;
    heartRate: number | null;
    excitement: number | null;
    fatigue: number | null;
    focus: number | null;
    obedience: number | null;
    bodyCondition: number | null;
    preEjaculation: boolean | null;
  }>>([]);
  const [sortBy, setSortBy] = useState<PredictionSortKey>("score");
  const [minWinProbability, setMinWinProbability] = useState(0);
  const [minExpectedValue, setMinExpectedValue] = useState(-9999);
  const [markFilter, setMarkFilter] = useState<PredictionMarkFilter>("all");
  const parseTicket = (raw: string | null | undefined) => {
    if (!raw) return null;
    try { return JSON.parse(raw) as DisplayTicket; } catch { return null; }
  };
  const savedTicketSets = existingPrediction?.ticketSets as Array<{ strategy: "score" | "longshot"; ticketData: string }> | undefined;
  const savedScoreTicket = formatTicketTextsForDisplay(buildSavedScoreReferenceTicket(parseTicket(savedTicketSets?.find(ticket => ticket.strategy === "score")?.ticketData ?? existingPrediction?.prediction?.recommendedBets), existingPrediction?.prediction));
  const savedLongshotTicket = formatTicketTextsForDisplay(parseTicket(savedTicketSets?.find(ticket => ticket.strategy === "longshot")?.ticketData));

  const visibleResults = useMemo(() => {
    const raw = (runPrediction.data?.results ?? []) as Array<any>;
    return [...raw]
      .filter(result => (result.winProbability ?? 0) >= minWinProbability)
      .filter(result => minExpectedValue === -9999 || (result.expectedValue ?? -Infinity) >= minExpectedValue)
      .filter(result => markFilter === "all" || (markFilter === "top3" ? ["◎", "○", "▲"].includes(result.rating) : ["◎", "○", "▲", "△"].includes(result.rating)))
      .sort((a, b) => {
        if (sortBy === "winProbability") return (b.winProbability ?? 0) - (a.winProbability ?? 0);
        if (sortBy === "expectedValue") return (b.expectedValue ?? -Infinity) - (a.expectedValue ?? -Infinity);
        if (sortBy === "odds") return (a.odds ?? Infinity) - (b.odds ?? Infinity);
        return b.totalScore - a.totalScore;
      });
  }, [runPrediction.data?.results, sortBy, minWinProbability, minExpectedValue, markFilter]);

  const handleRunPrediction = () => {
    const validPaddock = paddockData.filter(p => 
      p.heartRate || p.excitement || p.fatigue || p.focus || p.obedience || p.bodyCondition || p.preEjaculation
    );
    runPrediction.mutate({ 
      raceId, venue, distance, headCount, surface, raceDate, raceNumber, raceName,
      paddockData: validPaddock.length > 0 ? validPaddock : undefined,
    });
  };

  // 既存予想がない場合、自動的に予想を実行する
  useEffect(() => {
    if (!loadingExisting && !existingPrediction?.prediction && !runPrediction.data && !runPrediction.isPending && !autoRunRef.current) {
      autoRunRef.current = true;
      runPrediction.mutate({ raceId, venue, distance, headCount, surface, raceDate, raceNumber, raceName });
    }
  }, [loadingExisting, existingPrediction, runPrediction.data, runPrediction.isPending]);

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0a0f1a 0%, #0d1b2a 100%)" }}>
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 backdrop-blur-md border-b" style={{ backgroundColor: "rgba(10,15,26,0.9)", borderColor: "rgba(255,165,0,0.15)" }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg transition-colors" style={{ backgroundColor: "rgba(255,165,0,0.1)" }}>
            <ArrowLeft className="w-4 h-4" style={{ color: "#ffa500" }} />
          </button>
          <div>
            <h1 className="text-base font-bold text-white">{venue} {raceNumber}R</h1>
            <p className="text-xs text-gray-400">{raceName}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ローディング */}
        {loadingExisting && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#ffa500" }} />
            <p className="mt-4 text-sm text-gray-400">データを読み込み中...</p>
          </div>
        )}

        {/* 既存予想がある場合の表示 */}
        {!loadingExisting && !runPrediction.data && existingPrediction?.prediction && (
          <div className="space-y-4">
            <div className="rounded-lg p-4" style={{ backgroundColor: "rgba(255,165,0,0.05)", border: "1px solid rgba(255,165,0,0.2)" }}>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4" style={{ color: "#ffa500" }} />
                <h3 className="text-sm font-bold text-white">前回の予想結果</h3>
                <span className="text-[10px] text-gray-500 ml-auto">
                  {new Date(existingPrediction.prediction.predictedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center p-2 rounded" style={{ backgroundColor: "rgba(255,165,0,0.1)" }}>
                  <p className="text-[10px] text-gray-400">◎本命</p>
                  <p className="text-lg font-bold" style={{ color: "#ffa500" }}>{existingPrediction.prediction.honmei}番</p>
                </div>
                <div className="text-center p-2 rounded" style={{ backgroundColor: "rgba(96,165,250,0.1)" }}>
                  <p className="text-[10px] text-gray-400">○対抗</p>
                  <p className="text-lg font-bold" style={{ color: "#60a5fa" }}>{existingPrediction.prediction.taikou}番</p>
                </div>
                <div className="text-center p-2 rounded" style={{ backgroundColor: "rgba(34,197,94,0.1)" }}>
                  <p className="text-[10px] text-gray-400">▲単穴</p>
                  <p className="text-lg font-bold" style={{ color: "#22c55e" }}>{existingPrediction.prediction.tanana}番</p>
                </div>
                <div className="text-center p-2 rounded" style={{ backgroundColor: "rgba(156,163,175,0.1)" }}>
                  <p className="text-[10px] text-gray-400">△連下</p>
                  <p className="text-lg font-bold text-gray-300">
                    {existingPrediction.prediction.renka ? JSON.parse(existingPrediction.prediction.renka).join(",") : "-"}
                  </p>
                </div>
              </div>
              {existingPrediction.prediction.reasoning && (
                <div className="pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <p className="text-xs text-gray-500 mb-1">予想根拠:</p>
                  {existingPrediction.prediction.reasoning.split("\n").map((r: string, i: number) => (
                    <p key={i} className="text-xs text-gray-400 mb-0.5">・{r}</p>
                  ))}
                </div>
              )}
            </div>

            {(savedScoreTicket || savedLongshotTicket) && (
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { key: "score", label: "【パターン1】スコア順（堅実重視）", ticket: savedScoreTicket, accent: "#ffa500", background: "rgba(255,165,0,0.05)" },
                  { key: "longshot", label: "【パターン2】穴馬軸（予想オッズ基準）", ticket: savedLongshotTicket, accent: "#fb7185", background: "rgba(244,63,94,0.05)" },
                ].map(({ key, label, ticket, accent, background }) => ticket && (
                  <div key={key} className="rounded-lg p-3" style={key === "longshot" ? { background: "linear-gradient(135deg, rgba(244,63,94,0.15), rgba(168,85,247,0.10))", border: "1px solid rgba(251,113,133,0.54)", boxShadow: "0 8px 20px rgba(244,63,94,0.08)" } : { backgroundColor: background, border: `1px solid ${accent}44` }}>
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

            {/* DB保存済み出馬表。過去市場オッズは公開用の許諾確認前には表示しない。 */}
            {existingPrediction.entries && existingPrediction.entries.length > 0 && (
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                  <TrendingUp className="w-3.5 h-3.5" style={{ color: "#ffa500" }} />
                  <h4 className="text-xs font-bold text-white">保存済み出馬表</h4>
                  <span className="text-[10px] text-gray-500 ml-auto">
                    {existingPrediction.entriesUpdatedAt
                      ? `最終更新: ${new Date(existingPrediction.entriesUpdatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                      : "取得済みデータ"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                        <th className="px-2 py-1.5 text-left text-gray-400 font-medium">枠</th>
                        <th className="px-2 py-1.5 text-left text-gray-400 font-medium">馬番</th>
                        <th className="px-2 py-1.5 text-left text-gray-400 font-medium">馬名</th>
                        <th className="px-2 py-1.5 text-left text-gray-400 font-medium">騎手</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...existingPrediction.entries]
                        .sort((a: any, b: any) => a.horseNumber - b.horseNumber)
                        .map((entry: any) => {
                          const isHonmei = entry.horseNumber === existingPrediction.prediction.honmei;
                          const isTaikou = entry.horseNumber === existingPrediction.prediction.taikou;
                          const isTanana = entry.horseNumber === existingPrediction.prediction.tanana;
                          const renkaArr = existingPrediction.prediction.renka ? JSON.parse(existingPrediction.prediction.renka) : [];
                          const isRenka = renkaArr.includes(entry.horseNumber);
                          const mark = isHonmei ? "◎" : isTaikou ? "○" : isTanana ? "▲" : isRenka ? "△" : "";
                          const markColor = isHonmei ? "#ffa500" : isTaikou ? "#60a5fa" : isTanana ? "#22c55e" : isRenka ? "#9ca3af" : "";
                          return (
                            <tr key={entry.horseNumber} className="border-t" style={{ borderColor: "rgba(255,255,255,0.05)", backgroundColor: mark ? "rgba(255,165,0,0.03)" : "transparent" }}>
                              <td className="px-2 py-1.5 text-gray-400">{entry.gateNumber || "-"}</td>
                              <td className="px-2 py-1.5">
                                <span className="font-bold" style={{ color: markColor || "#e2e8f0" }}>
                                  {mark && <span className="mr-0.5">{mark}</span>}
                                  {entry.horseNumber}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-white font-medium">{entry.horseName}</td>
                              <td className="px-2 py-1.5 text-gray-400">{entry.jockey || "-"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <p className="border-t px-4 py-2 text-[10px] text-amber-100" style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(245,158,11,0.06)" }}>
                  保存済みの市場オッズ・人気は公開しません。下の「最新データで再予想する」から、能力スコアに基づく予想オッズと通常買い目を作成できます。
                </p>
              </div>
            )}

            {/* 穴狙い詳細分析セクション */}
            {anaUmaData && (
              <AnaUmaDetailSection data={anaUmaData} hideMarketOdds />
            )}

            <button
              onClick={handleRunPrediction}
              disabled={runPrediction.isPending}
              className="w-full py-3 rounded-lg text-sm font-medium transition-all"
              style={{ backgroundColor: "rgba(255,165,0,0.1)", color: "#ffa500", border: "1px solid rgba(255,165,0,0.3)" }}
            >
              最新データで再予想する
            </button>
          </div>
        )}

        {/* レース情報 */}
        {!loadingExisting && !existingPrediction?.prediction && !runPrediction.data && (
        <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded" style={{
              backgroundColor: surface === "turf" ? "rgba(34,197,94,0.15)" : "rgba(194,120,3,0.15)",
              color: surface === "turf" ? "#22c55e" : "#c27803",
            }}>
              {surface === "turf" ? "芝" : "ダ"}
            </span>
            <span className="text-sm text-gray-300">{distance}m</span>
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm text-gray-300">{headCount}頭</span>
          </div>
        </div>
        )}

        {/* 予想実行ボタン */}
        {!loadingExisting && !existingPrediction?.prediction && !runPrediction.data && !runPrediction.isPending && (
          <button
            onClick={handleRunPrediction}
            className="w-full py-4 rounded-xl font-bold text-white text-base flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #ff8c00 0%, #ffa500 100%)", boxShadow: "0 4px 20px rgba(255,165,0,0.3)" }}
          >
            <Zap className="w-5 h-5" />
            AI予想を実行する
          </button>
        )}

        {/* ローディング */}
        {runPrediction.isPending && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#ffa500" }} />
            <p className="mt-4 text-sm text-gray-400">出馬表を取得して予想を実行中...</p>
            <p className="text-xs text-gray-500 mt-1">nar.netkeibaからデータを取得しています</p>
          </div>
        )}

        {/* エラー */}
        {runPrediction.data && !runPrediction.data.success && (
          <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <p className="text-sm font-medium text-red-400">予想実行エラー</p>
            </div>
            <p className="text-xs text-gray-400">{runPrediction.data.error}</p>
            <button
              onClick={handleRunPrediction}
              className="mt-3 text-xs px-3 py-1.5 rounded" style={{ backgroundColor: "rgba(255,165,0,0.15)", color: "#ffa500" }}
            >
              再試行
            </button>
          </div>
        )}

        {runPrediction.data?.success && runPrediction.data.validation && (
          <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <div className="flex items-center gap-2 text-xs text-green-300">
              <CheckCircle2 className="w-4 h-4" />
              <span>検証済みレース条件: {runPrediction.data.validation.venue}・{runPrediction.data.validation.surface === "turf" ? "芝" : "ダート"}{runPrediction.data.validation.distance}m</span>
            </div>
            {runPrediction.data.validation.warnings?.map((warning: string) => (
              <p key={warning} className="text-[11px] text-amber-300 mt-1">{warning}</p>
            ))}
          </div>
        )}

        {runPrediction.data?.success && runPrediction.data.results.length > 0 && (
          <div className="rounded-lg p-3 mb-4 text-xs text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.28)" }}>
            <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 text-amber-300" />
            現在のオッズは能力スコアから算出した予想オッズです。公式オッズではないため、EV・市場シグナル・トリガミ判定は算出しません。
          </div>
        )}

        {/* 予想結果 */}
        {runPrediction.data?.success && runPrediction.data.results.length > 0 && (
          <div className="space-y-6">
            {/* 本命ヘッダーカード */}
            {(() => {
              const top = runPrediction.data.results[0];
              return top ? (
                <div className="rounded-lg p-4" style={{ background: "linear-gradient(135deg, rgba(255,165,0,0.08) 0%, rgba(255,100,0,0.04) 100%)", border: "1px solid rgba(255,165,0,0.3)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold" style={{ color: "#ffa500" }}>本命 ◎</p>
                      <p className="text-xl font-bold text-white mt-1">{top.horseNumber}番 {top.horseName}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <p className="text-[10px] text-gray-400">予想オッズ</p>
                          <p className="text-sm font-bold text-white">{top.odds ? `${top.odds}倍` : "-"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-gray-400">能力スコア</p>
                          <p className="text-sm font-bold" style={{ color: "#ffa500" }}>{Math.round(top.totalScore)}</p>
                        </div>
                        {top.threeView && (
                          <div className="text-center">
                            <p className="text-[10px] text-gray-400">三支点総合</p>
                            <p className="text-sm font-bold text-cyan-300">{top.threeView.overallScore} / {top.threeView.confidence}</p>
                          </div>
                        )}
                        <div className="text-center">
                          <p className="text-[10px] text-gray-400">EV（期待値）</p>
                          <p className="flex items-center justify-center gap-1 text-sm font-bold" style={{ color: top.expectedValue === null || top.expectedValue === undefined ? "#6b7280" : top.expectedValue >= 0 ? "#22c55e" : "#ef4444" }}>
                            {top.expectedValue !== null && top.expectedValue !== undefined ? <>{top.expectedValue < 0 && <AlertTriangle className="h-3.5 w-3.5" aria-label="EVがマイナス" />}{`${top.expectedValue >= 0 ? "+" : ""}${top.expectedValue.toFixed(1)}%`}</> : "未算出"}<EvExplanationTooltip odds={top.odds} winProbability={top.winProbability} expectedValue={top.expectedValue} oddsSource="predicted" />
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

            {runPrediction.data.raceAnalysis && (
              <div className="rounded-lg p-4" style={{ backgroundColor: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.24)" }}>
                <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4" style={{ color: "#c4b5fd" }} /><h3 className="text-sm font-bold text-white">レース分析：波乱度・軸信頼度</h3></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div><p className="text-[10px] text-gray-500">波乱度</p><p className="text-sm font-bold" style={{ color: "#c4b5fd" }}>{runPrediction.data.raceAnalysis.volatilityLabel}</p></div>
                  <div><p className="text-[10px] text-gray-500">軸方針</p><p className="text-sm font-bold text-white">{runPrediction.data.raceAnalysis.axisPolicyLabel}</p></div>
                  <div><p className="text-[10px] text-gray-500">能力1・2位差</p><p className="text-sm font-bold text-white">{runPrediction.data.raceAnalysis.scoreGap === null ? "データなし" : `${runPrediction.data.raceAnalysis.scoreGap}pt`}</p></div>
                  <div><p className="text-[10px] text-gray-500">能力ばらつき</p><p className="text-sm font-bold text-white">{runPrediction.data.raceAnalysis.scoreSpread === null ? "データなし" : `${runPrediction.data.raceAnalysis.scoreSpread}pt`}</p></div>
                </div>
                <p className="mt-3 text-[11px] text-gray-400">{runPrediction.data.raceAnalysis.volatilityReason}</p>
                {runPrediction.data.raceAnalysis.missingDataNotice && <p className="mt-2 rounded px-2.5 py-2 text-[11px] text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>{runPrediction.data.raceAnalysis.missingDataNotice}</p>}
                {runPrediction.data.localBiasNotice && <p className="mt-2 rounded px-2.5 py-2 text-[11px] text-cyan-100" style={{ backgroundColor: "rgba(6,182,212,0.10)" }}>{runPrediction.data.localBiasNotice}</p>}
              </div>
            )}

            {/* 正統派予想テーブル（全頭スコア順） */}
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <PredictionTableFilters
                accent="#ffa500"
                sortBy={sortBy}
                onSortByChange={setSortBy}
                minWinProbability={minWinProbability}
                onMinWinProbabilityChange={setMinWinProbability}
                minExpectedValue={minExpectedValue}
                onMinExpectedValueChange={setMinExpectedValue}
                markFilter={markFilter}
                onMarkFilterChange={setMarkFilter}
                visibleCount={visibleResults.length}
                totalCount={runPrediction.data.results.length}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                      <th className="px-1.5 py-2 text-left text-gray-500 font-medium w-8">順位</th>
                      <th className="px-1 py-2 text-center text-gray-500 font-medium w-6">印</th>
                      <th className="px-1 py-2 text-center text-gray-500 font-medium w-6">枠</th>
                      <th className="px-1 py-2 text-center text-gray-500 font-medium w-6">番</th>
                      <th className="px-2 py-2 text-left text-gray-500 font-medium">馬名</th>
                      <th className="px-1 py-2 text-center text-gray-500 font-medium w-10">性齢</th>
                      <th className="px-1 py-2 text-center text-gray-500 font-medium w-8">斤量</th>
                      <th className="px-1.5 py-2 text-left text-gray-500 font-medium">騎手</th>
                      <th className="px-1 py-2 text-center text-gray-500 font-medium w-20">能力スコア</th>
                      <th className="px-1.5 py-2 text-right text-gray-500 font-medium">予想オッズ</th>
                      <th className="px-1.5 py-2 text-right text-gray-500 font-medium">勝率</th>
                      <th className="px-1.5 py-2 text-right text-gray-500 font-medium">EV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleResults.map((result, idx) => {
                      const ratingColor = result.rating === "◎" ? "#ffa500" : result.rating === "○" ? "#60a5fa" : result.rating === "▲" ? "#22c55e" : result.rating === "△" ? "#a78bfa" : "#6b7280";
                      const gateColor = getGateColor(result.gateNumber);
                      const maxScore = runPrediction.data!.results[0]?.totalScore || 1;
                      const scorePercent = Math.round((result.totalScore / maxScore) * 100);
                      return (
                        <tr
                          key={result.horseNumber}
                          className="border-t"
                          style={{
                            borderColor: "rgba(255,255,255,0.05)",
                            backgroundColor: idx < 3 ? "rgba(255,165,0,0.03)" : "transparent",
                          }}
                        >
                          <td className="px-1.5 py-2 text-gray-300 font-bold text-center">{idx + 1}</td>
                          <td className="px-1 py-2 text-center">
                            <span className="text-sm font-bold" style={{ color: ratingColor }}>{result.rating}</span>
                          </td>
                          <td className="px-1 py-2 text-center">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold" style={{ backgroundColor: gateColor, color: [1,2].includes(result.gateNumber) ? "#000" : "#fff" }}>
                              {result.gateNumber}
                            </span>
                          </td>
                          <td className="px-1 py-2 text-center text-white font-bold">{result.horseNumber}</td>
                          <td className="px-2 py-2 text-white font-medium">{result.horseName}</td>
                          <td className="px-1 py-2 text-center text-gray-400">{result.sex}{result.age}</td>
                          <td className="px-1 py-2 text-center text-gray-400">{result.weight}</td>
                          <td className="px-1.5 py-2 text-gray-300">{result.jockey}</td>
                          <td className="px-1 py-2">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                                <div className="h-full rounded-full" style={{ width: `${scorePercent}%`, background: idx < 3 ? "linear-gradient(90deg, #ff8c00, #ffa500)" : "rgba(255,165,0,0.4)" }} />
                              </div>
                              <span className="text-xs font-bold w-6 text-right" style={{ color: "#ffa500" }}>{Math.round(result.totalScore)}</span>
                            </div>
                          </td>
                          <td className="px-1.5 py-2 text-right font-mono" style={{ color: result.odds ? "#fbbf24" : "#6b7280" }}>
                            {result.odds ? `${result.odds}倍` : "---"}
                          </td>
                          <td className="px-1.5 py-2 text-right font-bold" style={{ color: "#67e8f9" }}>
                            {Number(result.winProbability ?? 0).toFixed(1)}%
                          </td>
                          <td className="px-1.5 py-2 text-right font-bold">
                            {result.expectedValue !== null && result.expectedValue !== undefined
                              ? <span className="inline-flex items-center justify-end gap-1" style={{ color: result.expectedValue >= 0 ? "#22c55e" : "#ef4444" }}>{result.expectedValue < 0 && <AlertTriangle className="h-3.5 w-3.5" aria-label="EVがマイナス" />}{`${result.expectedValue >= 0 ? "+" : ""}${result.expectedValue.toFixed(1)}%`}<EvExplanationTooltip odds={result.odds} winProbability={result.winProbability} expectedValue={result.expectedValue} oddsSource="predicted" /></span>
                              : <span className="inline-flex items-center justify-end gap-1 text-gray-500">未算出<EvExplanationTooltip odds={result.odds} winProbability={result.winProbability} expectedValue={result.expectedValue} oddsSource="predicted" /></span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* データ上位馬3頭ハイライトカード */}
            <div className="rounded-lg p-4" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4" style={{ color: "#ffa500" }} />
                <h3 className="text-sm font-bold text-white">データ上位馬3頭</h3>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {runPrediction.data.results.slice(0, 3).map((result, idx) => {
                  const ratingColor = idx === 0 ? "#ffa500" : idx === 1 ? "#60a5fa" : "#22c55e";
                  const maxScore = runPrediction.data!.results[0]?.totalScore || 1;
                  const scorePercent = Math.round((result.totalScore / maxScore) * 100);
                  return (
                    <div key={result.horseNumber} className="rounded-lg p-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${ratingColor}33` }}>
                      <div className="flex items-center gap-1 mb-2">
                        <span className="text-xs font-bold" style={{ color: ratingColor }}>{result.rating}</span>
                        <span className="text-xs font-bold text-white">{result.horseNumber}</span>
                        <span className="text-xs font-medium text-white truncate">{result.horseName}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                        <div className="h-full rounded-full" style={{ width: `${scorePercent}%`, backgroundColor: ratingColor }} />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-gray-400">EV {result.expectedValue !== null && result.expectedValue !== undefined ? `${result.expectedValue >= 0 ? "+" : ""}${result.expectedValue.toFixed(0)}%` : "未算出"}</span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-[10px] text-gray-500">単勝{result.odds || "-"}倍</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: result.expectedValue === null || result.expectedValue === undefined ? "#6b7280" : result.expectedValue >= 0 ? "#22c55e" : "#ef4444" }}>
                          {result.expectedValue !== null && result.expectedValue !== undefined && result.expectedValue < 0 && <AlertTriangle className="h-3 w-3" aria-label="EVがマイナス" />}
                          EV {result.expectedValue !== null && result.expectedValue !== undefined ? `${result.expectedValue >= 0 ? "+" : ""}${result.expectedValue.toFixed(1)}%` : "未算出"}<EvExplanationTooltip odds={result.odds} winProbability={result.winProbability} expectedValue={result.expectedValue} oddsSource="predicted" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 推奨買い目 */}
            {runPrediction.data.recommendation && (
              <div className="rounded-lg p-4" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" style={{ color: "#ffa500" }} />
                    <h3 className="text-sm font-bold text-white">【パターン1】スコア順買い目（堅実重視）</h3>
                  </div>
                  {runPrediction.data.recommendation.totalBets > 0 && !runPrediction.data.recommendation.referenceOnly && (
                    <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,165,0,0.1)", color: "#ffa500" }}>
                      合計{runPrediction.data.recommendation.totalBets}点 / {(runPrediction.data.recommendation.totalBets * 100).toLocaleString()}円
                    </span>
                  )}
                  {runPrediction.data.recommendation.referenceOnly && <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(245,158,11,0.12)", color: "#fbbf24" }}>参考・購入推奨なし</span>}
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded w-16 text-center" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444" }}>3連単</span>
                    <span className="text-sm text-gray-300 font-mono flex-1">{formatBetSelectionForDisplay(runPrediction.data.recommendation.trifecta)}</span>
                    <span className="text-[10px] text-gray-500">{runPrediction.data.recommendation.trifectaCount}点</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded w-16 text-center" style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>3連複</span>
                    <span className="text-sm text-gray-300 font-mono flex-1">{formatBetSelectionForDisplay(runPrediction.data.recommendation.trio)}</span>
                    <span className="text-[10px] text-gray-500">{runPrediction.data.recommendation.trioCount}点</span>
                  </div>
                </div>
                <p className="mt-3 rounded px-2.5 py-2 text-[11px] text-gray-300" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>{runPrediction.data.recommendation.referenceOnly ? "データ不足時でもスコア順位の組合せを確認できるように表示しています。購入の推奨、精算、実績への反映は行いません。" : "軸馬が1着の際に2・3着の取りこぼしを抑える構成です。予想・回収は保証されません。"}</p>
                {runPrediction.data.recommendation.formationCaution && <p className="mt-2 rounded px-2.5 py-2 text-[11px] text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>{runPrediction.data.recommendation.formationCaution}</p>}
                {!runPrediction.data.recommendation.referenceOnly && <div className="mt-2"><OfficialTrigamiStatus raceId={runPrediction.data.raceId} formation={runPrediction.data.recommendation.formation} totalBets={runPrediction.data.recommendation.totalBets} /></div>}
                {runPrediction.data.recommendation.riskWarning && !runPrediction.data.recommendation.formation && <p className="mt-2 rounded px-2.5 py-2 text-[11px] text-rose-100" style={{ backgroundColor: "rgba(244,63,94,0.12)" }}>トリガミ確認: {runPrediction.data.recommendation.riskWarning}</p>}
                {/* 根拠 */}
                {runPrediction.data.recommendation.reasoning.length > 0 && (
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                    <p className="text-xs text-gray-500 mb-2">予想根拠:</p>
                    {runPrediction.data.recommendation.reasoning.map((r, i) => (
                      <p key={i} className="text-xs text-gray-400 mb-1">・{r}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {runPrediction.data.longshotRecommendation && (
              <div className="rounded-lg p-4" style={{ background: "linear-gradient(135deg, rgba(244,63,94,0.16) 0%, rgba(168,85,247,0.12) 52%, rgba(251,191,36,0.08) 100%)", border: "1px solid rgba(251,113,133,0.58)", boxShadow: "0 0 0 1px rgba(251,191,36,0.10), 0 12px 28px rgba(244,63,94,0.10)" }}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(251,113,133,0.24)", border: "1px solid rgba(253,164,175,0.65)" }}><Sparkles className="h-4 w-4" style={{ color: "#fef08a" }} /></span>
                    <h3 className="text-sm font-bold text-white">【パターン2】穴馬軸買い目</h3>
                  </div>
                  <div className="flex flex-col items-end gap-1">{runPrediction.data.longshotRecommendation.totalBets > 0 && <span className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(244,63,94,0.18)", color: "#ffe4e6" }}>穴馬軸・合計{runPrediction.data.longshotRecommendation.totalBets}点</span>}<span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ backgroundColor: "rgba(251,191,36,0.18)", border: "1px solid rgba(253,224,71,0.42)", color: "#fef08a" }}>予想オッズ基準</span></div>
                </div>
                <p className="mb-3 text-[11px] text-gray-400">穴推奨馬を1着軸に置きつつ、スコア上位馬を2・3着候補から除外しない構成です。予想・回収は保証されません。</p>
                <p className="mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.12)", border: "1px solid rgba(251,191,36,0.22)" }}><Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" />公式オッズではなく、能力スコアから導いた予想オッズによる推定です。</p>
                <div className="grid gap-3">
                  <div className="flex items-center gap-3"><span className="text-xs font-bold px-2 py-0.5 rounded w-16 text-center" style={{ backgroundColor: "rgba(244,63,94,0.15)", color: "#fb7185" }}>3連単</span><span className="text-sm text-gray-300 font-mono flex-1">{formatBetSelectionForDisplay(runPrediction.data.longshotRecommendation.trifecta)}</span><span className="text-[10px] text-gray-500">{runPrediction.data.longshotRecommendation.trifectaCount}点</span></div>
                  <div className="flex items-center gap-3"><span className="text-xs font-bold px-2 py-0.5 rounded w-16 text-center" style={{ backgroundColor: "rgba(168,85,247,0.15)", color: "#c084fc" }}>3連複</span><span className="text-sm text-gray-300 font-mono flex-1">{formatBetSelectionForDisplay(runPrediction.data.longshotRecommendation.trio)}</span><span className="text-[10px] text-gray-500">{runPrediction.data.longshotRecommendation.trioCount}点</span></div>
                </div>
                {runPrediction.data.longshotRecommendation.formationCaution && <p className="mt-3 rounded px-2.5 py-2 text-[11px] text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>{runPrediction.data.longshotRecommendation.formationCaution}</p>}
                <div className="mt-2"><OfficialTrigamiStatus raceId={runPrediction.data.raceId} formation={runPrediction.data.longshotRecommendation.formation} totalBets={runPrediction.data.longshotRecommendation.totalBets} /></div>
                {runPrediction.data.longshotRecommendation.riskWarning && !runPrediction.data.longshotRecommendation.formation && <p className="mt-2 rounded px-2.5 py-2 text-[11px] text-rose-100" style={{ backgroundColor: "rgba(244,63,94,0.12)" }}>トリガミ確認: {runPrediction.data.longshotRecommendation.riskWarning}</p>}
                {runPrediction.data.longshotRecommendation.reasoning.length > 0 && <div className="mt-4 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>{runPrediction.data.longshotRecommendation.reasoning.map((reason, index) => <p key={index} className="text-xs text-gray-400 mb-1">・{reason}</p>)}</div>}
              </div>
            )}

            {/* 上位3頭のスコア内訳 */}
            <div className="rounded-lg p-4" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h3 className="text-sm font-bold text-white mb-4">上位3頭 能力・適性内訳</h3>
              <div className="grid gap-4">
                {runPrediction.data.results.slice(0, 3).map(result => (
                  <div key={result.horseNumber}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-bold" style={{ color: "#ffa500" }}>{result.rating}</span>
                      <span className="text-sm text-white font-medium">{result.horseName}</span>
                      <span className="text-xs text-gray-500">({Math.round(result.totalScore)}pt)</span>
                      {result.threeView && (
                        <span className="text-[10px] rounded px-1.5 py-0.5" style={{ color: "#67e8f9", backgroundColor: "rgba(34,211,238,0.08)" }}>
                          三支点 {result.threeView.overallScore} / {result.threeView.confidence}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      <ScoreItem label="ベース" value={result.breakdown.base} />
                      <ScoreItem label="騎手" value={result.breakdown.jockeyBonus} showZeroAsNA />
                      <ScoreItem label="オッズ妙味" value={result.breakdown.oddsScore} />
                      <ScoreItem label="枠番" value={result.breakdown.gateScore} />
                      <ScoreItem label="馬場" value={result.breakdown.trackConditionScore} />
                      <ScoreItem label="血統" value={result.breakdown.bloodlineScore} showZeroAsNA />
                      <ScoreItem label="馬体重" value={result.breakdown.weightScore} showZeroAsNA />
                      <ScoreItem label="年齢" value={result.breakdown.ageScore} />
                      <ScoreItem label="パドック" value={result.breakdown.paddockScore} showZeroAsNA />
                      <ScoreItem label="出走間隔" value={result.breakdown.intervalScore} showZeroAsNA />
                      <ScoreItem label="クラス" value={result.breakdown.classScore} showZeroAsNA />
                      <ScoreItem label="展開" value={result.breakdown.paceScore} showZeroAsNA />
                      <ScoreItem label="騎手コース成績" value={result.breakdown.jockeyStatsScore ?? 0} showZeroAsNA />
                      <ScoreItem label="馬×騎手相性" value={result.breakdown.compatibilityScore ?? 0} showZeroAsNA />
                      <ScoreItem label="市場急変シグナル" value={result.breakdown.oddsMovementScore ?? 0} showZeroAsNA />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 穴狙い詳細分析セクション */}
            {anaUmaData && (
              <AnaUmaDetailSection data={anaUmaData} hideMarketOdds />
            )}

            {/* パドック直前情報入力 */}
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(168,85,247,0.2)" }}>
              <button
                onClick={() => setShowPaddock(!showPaddock)}
                className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium"
                style={{ backgroundColor: "rgba(168,85,247,0.05)" }}
              >
                <span className="text-purple-300">🐎 パドック直前情報入力</span>
                <ChevronRight className={`w-4 h-4 text-purple-400 transition-transform ${showPaddock ? "rotate-90" : ""}`} />
              </button>
              {showPaddock && (
                <PaddockInputSection
                  headCount={headCount}
                  paddockData={paddockData}
                  setPaddockData={setPaddockData}
                />
              )}
            </div>

            {/* 再予想ボタン */}
            <button
              onClick={handleRunPrediction}
              className="w-full py-3 rounded-lg text-sm font-medium transition-all"
              style={{ backgroundColor: "rgba(255,165,0,0.1)", color: "#ffa500", border: "1px solid rgba(255,165,0,0.3)" }}
            >
              {paddockData.some(p => p.heartRate || p.excitement || p.fatigue || p.focus || p.obedience || p.bodyCondition || p.preEjaculation)
                ? "パドック情報込みで再予想する"
                : "最新データで再予想する"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 穴狙い詳細分析セクション
// ==========================================
function AnaUmaDetailSection({ data, hideMarketOdds = false }: { data: any; hideMarketOdds?: boolean }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,120,0,0.25)" }}>
      {/* ヘッダー */}
      <div className="px-4 py-3" style={{ background: "linear-gradient(135deg, rgba(255,100,0,0.12) 0%, rgba(255,50,0,0.08) 100%)" }}>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-bold text-orange-300">穴狙い詳細分析</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ml-auto ${
            data.alertLevel === "高" ? "bg-red-500/20 text-red-300 border border-red-500/30" :
            data.alertLevel === "中" ? "bg-orange-500/20 text-orange-300 border border-orange-500/30" :
            "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
          }`}>
            {data.alertLevel === "高" ? "大穴警報" : data.alertLevel === "中" ? "中穴警報" : "平穏"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4" style={{ backgroundColor: "rgba(255,100,0,0.03)" }}>
        {/* コース波乱度統計 */}
        {data.courseStats && (
          <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs text-gray-400 mb-2">コース・距離: <span className="text-white font-medium">{data.courseLabel}</span></p>
            <p className="text-xs text-gray-400">
              コース過去統計（波乱度）: 単勝6.0倍以上の穴馬が3着以内に入り込む確率は{" "}
              <span className="text-orange-300 font-bold">約{data.courseStats.longshotRate}%（約{data.courseStats.longshotFrequency}レースに1回）</span>
            </p>
            {data.trackDiagnosis && (
              <p className="text-xs text-gray-400 mt-1">天候・馬場診断: <span className="text-cyan-300">{data.trackDiagnosis}</span></p>
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
                  backgroundColor: idx === 0 ? "rgba(255,100,0,0.08)" : "rgba(255,255,255,0.02)",
                  border: idx === 0 ? "1px solid rgba(255,100,0,0.2)" : "1px solid rgba(255,255,255,0.04)",
                }}>
                  <span className="text-xs font-bold w-5 text-center" style={{ color: idx === 0 ? "#ff6b00" : "#9ca3af" }}>
                    {idx + 1}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    c.category === "大穴" ? "bg-red-500/20 text-red-300" : "bg-orange-500/20 text-orange-300"
                  }`}>
                    {hideMarketOdds ? "候補" : c.category}
                  </span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,165,0,0.15)", color: "#ffa500" }}>
                    {c.horseNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{c.horseName}</p>
                    <p className="text-[10px] text-gray-500">{c.jockey ?? "未定"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold" style={{ color: "#ff6b00" }}>{c.anaScore}pt</p>
                    <p className="text-[10px] text-gray-400">{hideMarketOdds ? "市場オッズ未表示" : `${c.odds}倍`}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 筆頭穴馬の激走根拠 */}
        {data.topMidOdds && data.topMidOdds.reasons && data.topMidOdds.reasons.length > 0 && (
          <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(0,200,255,0.03)", border: "1px solid rgba(0,200,255,0.1)" }}>
            <p className="text-xs font-bold text-cyan-300 mb-1">🚨 穴候補筆頭: {data.topMidOdds.horseName}{hideMarketOdds ? "" : `（${data.topMidOdds.odds}倍）`}</p>
            {data.topMidOdds.reasons.filter((reason: string) => !hideMarketOdds || !/オッズ|人気|中穴|大穴|妙味/.test(reason)).map((r: string, i: number) => (
              <p key={i} className="text-[11px] text-gray-400 ml-2">・{r}</p>
            ))}
          </div>
        )}
        {data.topBomb && data.topBomb.reasons && data.topBomb.reasons.length > 0 && (
          <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(255,50,0,0.03)", border: "1px solid rgba(255,50,0,0.1)" }}>
            <p className="text-xs font-bold text-red-300 mb-1">💣 穴候補: {data.topBomb.horseName}{hideMarketOdds ? "" : `（${data.topBomb.odds}倍）`}</p>
            {data.topBomb.reasons.filter((reason: string) => !hideMarketOdds || !/オッズ|人気|中穴|大穴|妙味/.test(reason)).map((r: string, i: number) => (
              <p key={i} className="text-[11px] text-gray-400 ml-2">・{r}</p>
            ))}
          </div>
        )}

        {/* 穴狙い推奨買い目 */}
        {data.anaBets && !hideMarketOdds && (
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
                <span className="text-xs text-gray-300 font-mono">{formatBetSelectionForDisplay(data.anaBets.trifecta)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>3連複</span>
                <span className="text-xs text-gray-300 font-mono">{formatBetSelectionForDisplay(data.anaBets.trio)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }}>馬連</span>
                <span className="text-xs text-gray-300 font-mono">{formatBetSelectionForDisplay(data.anaBets.quinella)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(168,85,247,0.15)", color: "#a855f7" }}>ワイド</span>
                <span className="text-xs text-gray-300 font-mono">{formatBetSelectionForDisplay(data.anaBets.wide)}</span>
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
        {hideMarketOdds && (
          <p className="rounded-lg px-3 py-2 text-[11px] text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
            上部の「パターン2：穴狙い買い目」は、能力スコアから導いた予想オッズを基準に構成しています。公式市場オッズ、EV、トリガミ判定は未算出です。
          </p>
        )}
      </div>
    </div>
  );
}

// 枚番色（競馬の枚番カラー）
function getGateColor(gate: number): string {
  const colors: Record<number, string> = {
    1: "#ffffff", // 白
    2: "#1a1a1a", // 黒
    3: "#ef4444", // 赤
    4: "#3b82f6", // 青
    5: "#fbbf24", // 黄
    6: "#22c55e", // 緑
    7: "#f97316", // 橙
    8: "#ec4899", // 桃
  };
  return colors[gate] || "#6b7280";
}

// スコア内訳の表示コンポーネント
function ScoreItem({ label, value, showZeroAsNA = false }: { label: string; value: number; showZeroAsNA?: boolean }) {
  const isNA = showZeroAsNA && value === 0;
  return (
    <div className="text-center p-1.5 rounded" style={{ backgroundColor: isNA ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)", opacity: isNA ? 0.5 : 1 }}>
      <p className="text-[10px] text-gray-500">{label}</p>
      {isNA ? (
        <p className="text-[10px] text-gray-600 italic">N/A</p>
      ) : (
        <p className="text-xs font-bold" style={{ color: value > 0 ? "#22c55e" : value < 0 ? "#ef4444" : "#9ca3af" }}>
          {value > 0 ? `+${value}` : value}
        </p>
      )}
    </div>
  );
}

// ==========================================
// パドック直前情報入力セクション
// ==========================================
function PaddockInputSection({
  headCount,
  paddockData,
  setPaddockData,
}: {
  headCount: number;
  paddockData: Array<{
    horseNumber: number;
    heartRate: number | null;
    excitement: number | null;
    fatigue: number | null;
    focus: number | null;
    obedience: number | null;
    bodyCondition: number | null;
    preEjaculation: boolean | null;
  }>;
  setPaddockData: (data: typeof paddockData) => void;
}) {
  const getEntry = (horseNumber: number) => {
    return paddockData.find(p => p.horseNumber === horseNumber) || {
      horseNumber,
      heartRate: null,
      excitement: null,
      fatigue: null,
      focus: null,
      obedience: null,
      bodyCondition: null,
      preEjaculation: null,
    };
  };

  const updateEntry = (horseNumber: number, field: string, value: any) => {
    const existing = paddockData.find(p => p.horseNumber === horseNumber);
    if (existing) {
      setPaddockData(paddockData.map(p => p.horseNumber === horseNumber ? { ...p, [field]: value } : p));
    } else {
      setPaddockData([...paddockData, { ...getEntry(horseNumber), [field]: value }]);
    }
  };

  const RatingButton = ({ horseNumber, field, value, label }: { horseNumber: number; field: string; value: number; label: string }) => {
    const entry = getEntry(horseNumber);
    const current = (entry as any)[field];
    const isActive = current === value;
    return (
      <button
        onClick={() => updateEntry(horseNumber, field, isActive ? null : value)}
        className="w-7 h-7 rounded text-[10px] font-bold transition-all"
        style={{
          backgroundColor: isActive ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.03)",
          color: isActive ? "#c084fc" : "#6b7280",
          border: isActive ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="px-4 py-3 space-y-4" style={{ backgroundColor: "rgba(168,85,247,0.02)" }}>
      <p className="text-[10px] text-gray-500">
        パドックで観察した各馬の状態を入力すると、直前アルゴリズムに反映されます。入力しない馬は影響なし。
      </p>
      
      {Array.from({ length: Math.min(headCount, 16) }, (_, i) => i + 1).map(horseNumber => {
        const entry = getEntry(horseNumber);
        const hasData = entry.heartRate || entry.excitement || entry.fatigue || entry.focus || entry.obedience || entry.bodyCondition || entry.preEjaculation;
        
        return (
          <div key={horseNumber} className="rounded-lg p-3" style={{ backgroundColor: hasData ? "rgba(168,85,247,0.05)" : "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-white w-6 text-center">{horseNumber}</span>
              <span className="text-[10px] text-gray-400">番</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {/* 心拍数 */}
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">心拍数(bpm)</label>
                <input
                  type="number"
                  placeholder="30-50"
                  value={entry.heartRate ?? ""}
                  onChange={(e) => updateEntry(horseNumber, "heartRate", e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-2 py-1 rounded text-xs bg-transparent border"
                  style={{ borderColor: "rgba(255,255,255,0.1)", color: "#e5e7eb" }}
                />
              </div>
              
              {/* 馬体コンディション */}
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">馬体</label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(v => (
                    <RatingButton key={v} horseNumber={horseNumber} field="bodyCondition" value={v} label={String(v)} />
                  ))}
                </div>
              </div>
              
              {/* 興奮度 */}
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">興奮</label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(v => (
                    <RatingButton key={v} horseNumber={horseNumber} field="excitement" value={v} label={String(v)} />
                  ))}
                </div>
              </div>
              
              {/* 集中力 */}
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">集中</label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(v => (
                    <RatingButton key={v} horseNumber={horseNumber} field="focus" value={v} label={String(v)} />
                  ))}
                </div>
              </div>
              
              {/* 疲弊度 */}
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">疲弊</label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(v => (
                    <RatingButton key={v} horseNumber={horseNumber} field="fatigue" value={v} label={String(v)} />
                  ))}
                </div>
              </div>
              
              {/* 従順度 */}
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">従順</label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(v => (
                    <RatingButton key={v} horseNumber={horseNumber} field="obedience" value={v} label={String(v)} />
                  ))}
                </div>
              </div>
            </div>
            
            {/* 射精前フラグ */}
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => updateEntry(horseNumber, "preEjaculation", entry.preEjaculation ? null : true)}
                className="px-2 py-1 rounded text-[10px] font-medium transition-all"
                style={{
                  backgroundColor: entry.preEjaculation ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.03)",
                  color: entry.preEjaculation ? "#f87171" : "#6b7280",
                  border: entry.preEjaculation ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                射精前 {entry.preEjaculation ? "✓" : ""}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
