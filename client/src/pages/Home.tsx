import Navbar from "@/components/Navbar";
import CtaSection from "@/components/CtaSection";
import PageHead from "@/components/PageHead";
import { trpc } from "@/lib/trpc";
import { filterOddsHistoryByWindow, getClosestOddsHistoryIndex, getOddsChartBounds, getOddsChartCoordinate, getOddsChartPoints } from "@/lib/oddsChart";
import { getResultWaitingRefetchInterval } from "@/lib/raceResultPolling";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Calendar, Trophy, MapPin, Clock, Zap, Eye, ExternalLink, Sparkles, Target, BookOpen, UserRound, NotebookText, MonitorPlay, AlertTriangle, TrendingDown, History } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** NAR競馬場コード（keiba.go.jp） */
const NAR_VENUE_CODES: Record<string, string> = {
  "帯広": "3", "門別": "36", "盛岡": "10", "水沢": "11",
  "浦和": "18", "船橋": "19", "大井": "20", "川崎": "21",
  "金沢": "22", "笠松": "23", "名古屋": "24", "園田": "27",
  "姫路": "28", "高知": "31", "佐賀": "32",
};
function getNarRaceListUrl(venue: string, dateStr: string | null): string {
  const code = NAR_VENUE_CODES[venue] || "";
  const date = dateStr ? dateStr.replace(/-/g, "%2F") : "";
  if (code && date) return `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceList?k_raceDate=${date}&k_babaCode=${code}`;
  return "https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/TodayRaceInfoTop";
}

// ==========================================
// ヒーローセクション
// ==========================================
function GoldDust({ count = 24 }: { count?: number }) {
  return (
    <div className="gold-dust" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <i
          key={index}
          style={{
            left: `${(index * 37) % 100}%`,
            "--s": `${2 + (index % 4)}px`,
            "--o": `${0.35 + (index % 5) * 0.11}`,
            "--d": `${10 + (index % 7) * 1.4}s`,
            "--delay": `${-(index % 11)}s`,
            "--x": `${-48 + (index % 7) * 17}px`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function HeroSection() {
  const [alertOpen, setAlertOpen] = useState(false);
  const [oddsWindow, setOddsWindow] = useState<30 | 60 | "all">("all");
  const { data: heroAlert } = trpc.heroAlert.getActive.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  });
  const { data: alertDetail, isLoading: isAlertDetailLoading } = trpc.heroAlert.getDetail.useQuery(
    { raceId: heroAlert?.raceId ?? "pending", horseNumber: heroAlert?.horseNumber ?? null },
    { enabled: Boolean(heroAlert && alertOpen), staleTime: 15_000 },
  );
  const comparisonSeries = (alertDetail?.comparisonOddsHistory?.length ? alertDetail.comparisonOddsHistory : (
    (alertDetail?.oddsHistory?.length ?? 0) > 0
      ? [{
        horseNumber: alertDetail?.movement?.horseNumber ?? heroAlert?.horseNumber ?? 0,
        horseName: alertDetail?.movement?.horseName ?? null,
        history: alertDetail?.oddsHistory ?? [],
      }]
      : []
  ));
  const comparisonColors = ["#edc968", "#72d6ff", "#c69cff", "#72d69d"];
  const filteredHistories = filterOddsHistoryByWindow(comparisonSeries.map(series => series.history), oddsWindow);
  const filteredComparisonSeries = comparisonSeries.map((series, index) => ({ ...series, history: filteredHistories[index] ?? [] }));
  const chartBounds = getOddsChartBounds(filteredComparisonSeries.map(series => series.history));
  const comparisonLines = chartBounds ? filteredComparisonSeries.map((series, index) => ({
    ...series,
    color: comparisonColors[index % comparisonColors.length]!,
    points: getOddsChartPoints(series.history, chartBounds),
    latestOdds: [...series.history].reverse().find(point => point.winOdds !== null)?.winOdds ?? null,
  })).filter(series => Boolean(series.points)) : [];
  const focusedHorseNumber = alertDetail?.movement?.horseNumber ?? heroAlert?.horseNumber ?? null;
  const focusedSeries = comparisonLines.find(series => series.horseNumber === focusedHorseNumber) ?? comparisonLines[0] ?? null;
  const markerHistory = focusedSeries?.history.filter(point => point.winOdds !== null) ?? [];
  const detectedOddsIndex = getClosestOddsHistoryIndex(markerHistory, alertDetail?.movement?.detectedAt);
  const detectionMarker = chartBounds && focusedSeries && detectedOddsIndex !== null
    ? getOddsChartCoordinate(markerHistory[detectedOddsIndex]!, chartBounds)
    : null;
  return (
    <section className="luxury-hero">
      <GoldDust count={30} />
      {heroAlert && (
        <button type="button" onClick={() => setAlertOpen(true)} className={`hero-breaking-badge hero-breaking-badge--${heroAlert.urgency}`}>
          <span className="hero-breaking-badge__flag">
            {heroAlert.kind === "odds" ? <TrendingDown className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            速報
          </span>
          <span className="hero-breaking-badge__copy">
            <strong>{heroAlert.title}</strong>
            <small>{heroAlert.detail}</small>
          </span>
          <span className="hero-breaking-badge__arrow" aria-hidden="true">→</span>
        </button>
      )}
      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent className="max-w-xl border-[#caa24b]/50 bg-[#0d0a05] text-[#fff7df] sm:rounded-none">
          <DialogHeader>
            <DialogTitle className="font-serif tracking-wide text-[#f8d77d]">速報詳細・オッズ履歴</DialogTitle>
            <DialogDescription className="text-[#d8c7a0]">取得済みのオッズ履歴と検知情報を表示しています。</DialogDescription>
          </DialogHeader>
          {isAlertDetailLoading ? (
            <div className="py-10 text-center text-sm text-[#d8c7a0]">詳細情報を取得中...</div>
          ) : alertDetail ? (
            <div className="space-y-4">
              <div className="border border-[#caa24b]/30 bg-black/30 p-3 text-sm">
                <div className="font-semibold text-[#ffe4a1]">{alertDetail.race.venueName}{alertDetail.race.raceNumber}R {alertDetail.race.raceName}</div>
                <div className="mt-1 text-xs text-[#d8c7a0]">{alertDetail.race.raceDate}・{alertDetail.race.postTime ?? "時刻未定"}・{alertDetail.race.surface === "turf" ? "芝" : "ダート"}{alertDetail.race.distance ?? "—"}m</div>
              </div>
              {alertDetail.movement && (
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="border border-[#caa24b]/25 bg-[#171007] p-2"><span className="block text-[#bda66e]">急変対象</span><strong>{alertDetail.movement.horseNumber}番 {alertDetail.movement.horseName ?? ""}</strong></div>
                  <div className="border border-[#caa24b]/25 bg-[#171007] p-2"><span className="block text-[#bda66e]">オッズ</span><strong>{alertDetail.movement.oddsBefore ?? "—"} → {alertDetail.movement.oddsAfter ?? "—"}</strong></div>
                  <div className="border border-[#caa24b]/25 bg-[#171007] p-2"><span className="block text-[#bda66e]">変動率</span><strong className="text-[#ffcb72]">{alertDetail.movement.changePct ? `${Math.abs(alertDetail.movement.changePct).toFixed(1)}%` : "—"}</strong></div>
                </div>
              )}
              <div className="border border-[#caa24b]/25 bg-black/30 p-3">
                <div className="mb-2 flex items-center justify-between text-xs"><span className="text-[#e3c77d]">単勝オッズ比較</span><span className="text-[#a89366]">最大4頭・共通時間軸</span></div>
                <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="オッズ履歴の表示期間">
                  {([
                    { value: 30 as const, label: "直近30分" },
                    { value: 60 as const, label: "直近60分" },
                    { value: "all" as const, label: "全履歴" },
                  ]).map(option => <button
                    key={option.value}
                    type="button"
                    aria-pressed={oddsWindow === option.value}
                    onClick={() => setOddsWindow(option.value)}
                    className="border px-2 py-1 text-[10px] font-semibold transition-colors duration-150 active:scale-97"
                    style={oddsWindow === option.value
                      ? { backgroundColor: "#caa24b", borderColor: "#f5dc91", color: "#130e05" }
                      : { backgroundColor: "rgba(255,255,255,0.03)", borderColor: "rgba(202,162,75,0.32)", color: "#d8c7a0" }}
                  >{option.label}</button>)}
                </div>
                {comparisonLines.length > 0 && chartBounds ? <>
                  <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] sm:grid-cols-4">
                    {comparisonLines.map(series => <div key={series.horseNumber} className="flex min-w-0 items-center gap-1.5 text-[#e8dbb8]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: series.color }} />
                      <span className="truncate">{series.horseNumber}番 {series.horseName ?? "馬名未取得"}</span>
                      {series.horseNumber === focusedHorseNumber && <span className="shrink-0 text-[#ff8d5b]">急変</span>}
                      {series.latestOdds !== null && <span className="ml-auto text-[#a89366]">{series.latestOdds.toFixed(1)}倍</span>}
                    </div>)}
                  </div>
                  <svg viewBox="0 0 100 100" className="h-36 w-full overflow-visible" role="img" aria-label={detectionMarker ? "同一レースの複数馬の単勝オッズ比較グラフ。急変検知地点をマーカーで表示。" : "同一レースの複数馬の単勝オッズ比較グラフ"}>
                    <line x1="4" x2="96" y1="90" y2="90" stroke="#8e7536" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                    {detectionMarker && <g aria-label="急変検知地点">
                      <line x1={detectionMarker.x} x2={detectionMarker.x} y1="12" y2="90" stroke="#ff6b35" strokeWidth="1.4" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
                      <text x={detectionMarker.x} y="8" textAnchor="middle" fill="#ff8d5b" fontSize="7" fontWeight="700">急変</text>
                    </g>}
                    {comparisonLines.map(series => <polyline key={series.horseNumber} fill="none" stroke={series.color} strokeWidth={series.horseNumber === focusedHorseNumber ? "2.6" : "1.7"} opacity={series.horseNumber === focusedHorseNumber ? "1" : "0.82"} points={series.points} vectorEffect="non-scaling-stroke" />)}
                    {detectionMarker && <g aria-label="急変オッズ">
                      <circle cx={detectionMarker.x} cy={detectionMarker.y} r="4.4" fill="#ff6b35" opacity="0.2" />
                      <circle cx={detectionMarker.x} cy={detectionMarker.y} r="2.7" fill="#ff6b35" stroke="#fff7df" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
                    </g>}
                  </svg>
                  <div className="mt-1 flex justify-between text-[10px] text-[#a89366]"><span>オッズ低 {chartBounds.minOdds.toFixed(1)}倍</span><span>オッズ高 {chartBounds.maxOdds.toFixed(1)}倍</span></div>
                </> : <div className="py-8 text-center text-xs text-[#a89366]">{oddsWindow === "all" ? "比較できるオッズ履歴はまだありません。" : "選択した期間には比較できるオッズ履歴がありません。"}</div>}
              </div>
              <div className="flex justify-end"><Link href={heroAlert?.href ?? "/predictions"} className="gold-button text-sm" onClick={() => setAlertOpen(false)}>詳細予想を見る →</Link></div>
            </div>
          ) : <div className="py-10 text-center text-sm text-[#d8c7a0]">詳細情報を取得できませんでした。</div>}
        </DialogContent>
      </Dialog>
      <div className="luxury-hero-grid">
        <motion.div
          className="luxury-hero-copy"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        >
          <span className="luxury-eyebrow"><Sparkles className="h-3.5 w-3.5" /> PRECISION RACING INTELLIGENCE</span>
          <h1 className="luxury-hero-title">
            <span>DATA × JUDGEMENT × VALUE</span>
            Keiba de GO!
          </h1>
          <p>
            公式データと多角的なAI解析で、レースごとの期待値を可視化。
            本線を絞り、無駄な重複を避けた予想判断を支えます。
          </p>
          <div className="flex gap-3 flex-wrap mt-7 justify-center md:justify-start">
            <Link
              href="/predictions"
              className="gold-button transition-transform duration-150 active:scale-97"
            >
              今日の予想を見る <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="/#calendar"
              className="gold-button gold-button--ghost transition-transform duration-150 active:scale-97"
            >
              レースカレンダーへ
            </Link>
          </div>
        </motion.div>
        <motion.div
          className="luxury-hero-visual"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="luxury-orbit" />
          <div className="hero-race-glow" aria-hidden="true" />
          <img
            src="/manus-storage/keiba-hero-gold-jockey_7b6ecc4a.png"
            alt="黄金の光をまとって疾走する競走馬と騎手"
            className="hero-race-figure"
          />
          <div className="hero-race-seal" aria-hidden="true">
            <Trophy className="h-5 w-5" strokeWidth={1.25} />
          </div>
          <div className="absolute bottom-3 text-center text-[10px] tracking-[0.18em] luxury-gold">READ THE RACE. KEEP THE EDGE.</div>
        </motion.div>
      </div>
      <div className="luxury-scroll-cue">SCROLL TO EXPLORE</div>
    </section>
  );
}

// ==========================================
// 今週のレース一覧セクション
// ==========================================
function ThisWeekRacesSection() {
  const { data: races, isLoading } = trpc.raceData.getThisWeekend.useQuery(undefined, {
    staleTime: 1000 * 60 * 10,
    retry: 2,
  });

  if (isLoading) {
    return (
      <section className="luxury-section py-12 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="animate-pulse text-sm" style={{ color: "#64748b" }}>レースデータを読み込み中...</div>
        </div>
      </section>
    );
  }

  if (!races || races.length === 0) {
    return (
      <section className="luxury-section py-12 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <span
            className="inline-block text-xs font-bold tracking-widest px-3 py-1 rounded-full mb-3"
            style={{ backgroundColor: "rgba(0,229,255,0.1)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)" }}
          >
            THIS WEEK
          </span>
          <h2 className="text-xl font-bold mb-2" style={{ color: "#ffffff" }}>今週のレース</h2>
          <p className="text-sm" style={{ color: "#64748b" }}>
            今週のレースデータは未発表です。公式発表後に更新されます。
          </p>
        </div>
      </section>
    );
  }

  // 日付ごとにグループ化
  const byDate: Record<string, typeof races> = {};
  for (const r of races) {
    if (!byDate[r.raceDate]) byDate[r.raceDate] = [];
    byDate[r.raceDate]!.push(r);
  }

  const gradeColor = (grade: string | null) => {
    if (grade === "G1") return { bg: "rgba(245,158,11,0.2)", color: "#fbbf24" };
    if (grade === "G2") return { bg: "rgba(239,68,68,0.15)", color: "#f87171" };
    if (grade === "G3") return { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" };
    return null;
  };

  return (
    <section id="today-race" className="luxury-section py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <span
            className="inline-block text-xs font-bold tracking-widest px-3 py-1 rounded-full mb-3"
            style={{ backgroundColor: "rgba(0,229,255,0.1)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)" }}
          >
            THIS WEEK
          </span>
          <h2 className="text-xl font-bold" style={{ color: "#ffffff" }}>今週のレース</h2>
        </div>

        {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayRaces]) => {
          const d = new Date(date + "T00:00:00+09:00");
          const dayLabel = d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" });
          // 会場ごとにグループ
          const byVenue: Record<string, typeof dayRaces> = {};
          for (const r of dayRaces) {
            if (!byVenue[r.venueName]) byVenue[r.venueName] = [];
            byVenue[r.venueName]!.push(r);
          }

          return (
            <div key={date} className="mb-6">
              <h3 className="text-sm font-bold mb-3 px-2 luxury-gold">{dayLabel}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(byVenue).map(([venue, venueRaces]) => {
                  const graded = venueRaces.filter(r => r.grade);
                  return (
                    <div
                      key={venue}
                      className="luxury-card p-3 rounded-lg"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-bold" style={{ color: "#e2e8f0" }}>{venue}</span>
                        <span className="text-xs" style={{ color: "#64748b" }}>{venueRaces.length}R</span>
                      </div>
                      {graded.length > 0 && (
                        <div className="space-y-1">
                          {graded.map(r => {
                            const gc = gradeColor(r.grade);
                            return (
                              <div key={r.raceId} className="flex items-center gap-2">
                                {gc && (
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: gc.bg, color: gc.color }}
                                  >
                                    {r.grade}
                                  </span>
                                )}
                                <span className="text-xs" style={{ color: "#94a3b8" }}>{r.raceName}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {graded.length === 0 && (
                        <p className="text-xs" style={{ color: "#64748b" }}>
                          {venueRaces[0]?.status === "upcoming" ? "出走表未発表" : `${venueRaces.length}レース`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ==========================================
// 的中率統計セクション
// ==========================================
function HitRateSection() {
  const { data: stats, isLoading } = trpc.raceData.getStats.useQuery(undefined, {
    staleTime: 20_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const { data: betTypeData } = trpc.raceData.getHitRateByBetType.useQuery(undefined, {
    staleTime: 20_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  if (isLoading || !stats) return null;
  if (stats.total === 0) {
    return stats.excludedLegacyCount > 0 ? (
      <section className="luxury-section py-8 px-4">
        <div className="mx-auto max-w-5xl border border-[#caa24b]/25 bg-black/25 p-4 text-center">
          <p className="text-sm font-semibold text-[#e3c77d]">実測実績を再集計しています</p>
          <p className="mt-1 text-xs leading-relaxed text-[#a89366]">過去の{stats.excludedLegacyCount}件は買い目の点数・券種が記録されていない旧形式のため、的中率・回収率の計算から除外しました。現行形式の確定済み予想が蓄積され次第、検証可能な実績のみを表示します。</p>
        </div>
      </section>
    ) : null;
  }

  return (
    <section className="luxury-section py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <span
            className="inline-block text-xs font-bold tracking-widest px-3 py-1 rounded-full mb-3"
            style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}
          >
            TRACK RECORD
          </span>
          <h2 className="text-xl font-bold" style={{ color: "#ffffff" }}>AI予想実績</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="総予想数" value={`${stats.total}レース`} />
          <StatCard label="的中率" value={`${stats.hitRate}%`} highlight />
          <StatCard label="回収率" value={`${stats.roi}%`} />
          <StatCard label="的中数" value={`${stats.hits}回`} />
        </div>

        {/* 券種別的中率 */}
        {betTypeData && betTypeData.betTypeStats.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: "#e2e8f0" }}>券種別的中率（過去2週間）</h3>
              <span className="text-[10px]" style={{ color: "#64748b" }}>
                {betTypeData.totalRaces > 0 ? `${betTypeData.totalRaces}レース分` : "実測対象なし"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {betTypeData.betTypeStats.map((bt) => (
                <div
                  key={bt.betType}
                  className="p-3 rounded-lg text-center"
                  style={{
                    backgroundColor: bt.total > 0 && bt.hitRate > 0 ? "rgba(0,229,255,0.04)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${bt.total > 0 && bt.hitRate > 0 ? "rgba(0,229,255,0.15)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <div className="text-xs font-bold mb-1" style={{ color: "#94a3b8" }}>{bt.betTypeName}</div>
                  <div
                    className="text-xl font-black mb-1"
                    style={{
                      color: bt.total === 0 ? "#64748b" : bt.hitRate >= 30 ? "#00e5ff" : bt.hitRate >= 10 ? "#f59e0b" : "#64748b",
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    {bt.total > 0 ? `${bt.hitRate}%` : "—"}
                  </div>
                  <div className="text-[10px]" style={{ color: "#64748b" }}>
                    {bt.total > 0 ? `${bt.hits}/${bt.total}的中` : "実測対象なし"}
                  </div>
                  {bt.roi > 0 && (
                    <div className="text-[10px] mt-1" style={{ color: bt.roi >= 100 ? "#22c55e" : "#f59e0b" }}>
                      回収率 {bt.roi}%
                    </div>
                  )}
                </div>
              ))}
            </div>
            {betTypeData.totalRaces === 0 && (
              <p className="mt-3 text-[10px]" style={{ color: "#64748b" }}>
                確定結果・公式払戻・点数記録済みの買い目が揃ったレースから自動集計します。未精算または旧形式の記録は0%として扱いません。
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="p-4 rounded-lg text-center"
      style={{
        backgroundColor: highlight ? "rgba(0,229,255,0.06)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${highlight ? "rgba(0,229,255,0.2)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <div className="text-xs mb-1" style={{ color: "#64748b" }}>{label}</div>
      <div
        className="text-lg font-black"
        style={{
          color: highlight ? "#00e5ff" : "#e2e8f0",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ==========================================
// ナビゲーションカードセクション
// ==========================================
function NavigationCardsSection() {
  const cards = [
    { label: "今日の予想", href: "/predictions", icon: Target, desc: "AI解析による本日の予想" },
    { label: "地方競馬予想", href: "/nar-predictions", icon: Trophy, desc: "NAR全場のAI予想" },
    { label: "予想履歴", href: "/prediction-history", icon: History, desc: "条件別に結果を比較" },
    { label: "馬図鑑", href: "/horses", icon: BookOpen, desc: "血統・戦績・プロフィール" },
    { label: "騎手一覧", href: "/jockeys", icon: UserRound, desc: "勝率・成績データ" },
    { label: "予想ブログ", href: "/blog", icon: NotebookText, desc: "重賞レースの詳細分析" },
    { label: "ライブ視聴", href: "/live", icon: MonitorPlay, desc: "YouTube無料視聴" },
  ];

  return (
    <section className="luxury-section py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
            <Link
              key={card.href}
              href={card.href}
              className="luxury-card p-4 rounded-lg text-center transition-all duration-150 active:scale-97 block"
            >
              <Icon className="w-6 h-6 mx-auto mb-3 text-[#f5dc91]" strokeWidth={1.35} />
              <div className="text-sm font-bold mb-1" style={{ color: "#e2e8f0" }}>{card.label}</div>
              <div className="text-xs" style={{ color: "#64748b" }}>{card.desc}</div>
            </Link>
          )})}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 穴馬速報セクション（トップページ用）
// ==========================================
function AnaUmaAlertSection() {
  const { data: alert, isLoading } = trpc.anaUma.getTodayTopAlert.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  if (isLoading || !alert) return null;

  const alertColors = {
    "高": { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.3)", badge: "#ef4444", text: "大穴警報" },
    "中": { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.3)", badge: "#f59e0b", text: "中穴警報" },
    "低": { bg: "rgba(0,229,255,0.06)", border: "rgba(0,229,255,0.2)", badge: "#00e5ff", text: "穴注意" },
  };
  const colors = alertColors[alert.alertLevel];

  return (
    <section className="luxury-section py-10 px-4">
      <div className="max-w-5xl mx-auto">
        {/* セクションヘッダー */}
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5" style={{ color: colors.badge }} />
          <h2 className="text-lg font-bold" style={{ color: "#ffffff" }}>穴馬速報</h2>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: colors.bg, color: colors.badge, border: `1px solid ${colors.border}` }}
          >
            {colors.text}：{alert.alertLevel}
          </span>
        </div>

        {/* メインアラートカード */}
        <div
          className="rounded-xl p-4 md:p-5"
          style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
        >
          {/* タイトル */}
          <h3 className="text-sm md:text-base font-bold mb-3" style={{ color: "#ffffff" }}>
            {alert.newsTitle}
          </h3>

          {/* 速報本文 */}
          <p className="text-xs md:text-sm mb-4" style={{ color: "#e2e8f0" }}>
            {alert.newsBody}
          </p>

          {/* コース統計 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <div className="p-2 rounded-lg text-center" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
              <div className="text-[10px]" style={{ color: "#94a3b8" }}>コース</div>
              <div className="text-xs font-bold" style={{ color: "#ffffff" }}>{alert.courseLabel}</div>
            </div>
            <div className="p-2 rounded-lg text-center" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
              <div className="text-[10px]" style={{ color: "#94a3b8" }}>穴出現率</div>
              <div className="text-xs font-bold" style={{ color: colors.badge }}>{alert.courseStats?.longshotPlaceRate}%</div>
            </div>
            <div className="p-2 rounded-lg text-center" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
              <div className="text-[10px]" style={{ color: "#94a3b8" }}>出現頻度</div>
              <div className="text-xs font-bold" style={{ color: "#ffffff" }}>約{alert.courseStats?.longshotFrequency}Rに1回</div>
            </div>
            <div className="p-2 rounded-lg text-center" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
              <div className="text-[10px]" style={{ color: "#94a3b8" }}>{alert.trackDiagnosis}</div>
              <div className="text-xs font-bold" style={{ color: "#ffffff" }}>{alert.venueName}{alert.raceNumber}R</div>
            </div>
          </div>

          {/* 穴馬候補 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alert.topMidOdds && (
              <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(245,158,11,0.3)", color: "#fbbf24" }}>中穴</span>
                  <span className="text-sm font-bold" style={{ color: "#ffffff" }}>{alert.topMidOdds.horseName}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: "#94a3b8" }}>
                  <span>単勝 {alert.topMidOdds.odds}倍</span>
                  <span>激走率 {alert.topMidOdds.explosionRate}%</span>
                  <span>スコア {alert.topMidOdds.anaScore}pt</span>
                </div>
                {alert.topMidOdds.reasons && alert.topMidOdds.reasons.length > 0 && (
                  <div className="mt-1 text-[10px]" style={{ color: "#64748b" }}>
                    {alert.topMidOdds.reasons.slice(0, 2).join(" / ")}
                  </div>
                )}
              </div>
            )}
            {alert.topBomb && (
              <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(239,68,68,0.3)", color: "#f87171" }}>大穴</span>
                  <span className="text-sm font-bold" style={{ color: "#ffffff" }}>{alert.topBomb.horseName}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: "#94a3b8" }}>
                  <span>単勝 {alert.topBomb.odds}倍</span>
                  <span>激走率 {alert.topBomb.explosionRate}%</span>
                  <span>スコア {alert.topBomb.anaScore}pt</span>
                </div>
                {alert.topBomb.reasons && alert.topBomb.reasons.length > 0 && (
                  <div className="mt-1 text-[10px]" style={{ color: "#64748b" }}>
                    {alert.topBomb.reasons.slice(0, 2).join(" / ")}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 予想ページへのリンク */}
          <div className="mt-4 text-center">
            <Link
              href={`/nar-predictions?date=${alert.raceId?.slice(0, 4)}-${alert.raceId?.slice(4, 6)}-${alert.raceId?.slice(6, 8)}&venue=${alert.venueName}&race=${alert.raceNumber}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all active:scale-97"
              style={{ backgroundColor: colors.badge, color: "#ffffff" }}
            >
              <Eye className="w-3.5 h-3.5" />
              この予想の詳細を見る
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ==========================================
// ピックアップニュースセクション
// ==========================================
function PickupNewsSection() {
  const { data: newsItems, isLoading } = trpc.blog.getPickupNews.useQuery();
  if (isLoading || !newsItems || newsItems.length === 0) return null;
  return (
    <section className="luxury-section py-10 px-4">
      <div className="max-w-5xl mx-auto">
        {/* セクションヘッダー */}
        <div className="flex items-center gap-2 mb-6">
          <h2
            className="text-lg font-bold tracking-wide"
            style={{ color: "#ffffff", fontFamily: "'Noto Sans JP', sans-serif" }}
          >
            TODAY'S PICKUP
          </h2>
          <span className="text-sm" style={{ color: "#94a3b8" }}>今日の注目ニュース</span>
        </div>
        {/* ニュースカードグリッド */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {newsItems.map((item, idx) => (
            <motion.a
              key={item.id}
              href={item.linkUrl || "#"}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1, duration: 0.4 }}
              className="flex md:flex-col overflow-hidden transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: "rgba(13,26,58,0.6)",
                border: "1px solid rgba(201,168,76,0.15)",
                borderRadius: "8px",
                textDecoration: "none",
              }}
            >
              {/* サムネイル画像 */}
              {item.thumbnailUrl && (
                <div className="relative flex-shrink-0 w-24 h-24 md:w-full md:h-[140px] overflow-hidden">
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    style={{ borderRadius: "8px 0 0 8px" }}
                    referrerPolicy="no-referrer"
                  />
                  {/* カテゴリバッジ */}
                  <span
                    className="absolute top-1 left-1 md:top-2 md:left-2 text-[9px] md:text-[10px] font-bold px-1.5 py-0.5"
                    style={{
                      backgroundColor: item.category === "breaking" ? "rgba(239,68,68,0.9)" : "rgba(0,229,255,0.9)",
                      color: "#FFFFFF",
                      borderRadius: "3px",
                    }}
                  >
                    {item.category === "breaking" ? "速報" : item.category === "result" ? "結果" : item.category === "prediction" ? "予想" : "コラム"}
                  </span>
                </div>
              )}
              {/* テキスト部分 */}
              <div className="p-2.5 md:p-3 flex-1 min-w-0">
                <h3
                  className="text-xs md:text-sm font-bold leading-snug line-clamp-2 mb-0.5"
                  style={{ color: "#e2e8f0", fontFamily: "'Noto Sans JP', sans-serif" }}
                >
                  {item.title}
                </h3>
                {item.summary && (
                  <p className="text-[11px] md:text-xs line-clamp-1 md:line-clamp-2" style={{ color: "#94a3b8" }}>
                    {item.summary}
                  </p>
                )}
                <div className="mt-1 text-[10px]" style={{ color: "#64748b" }}>
                  {new Date(item.publishedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// カレンダーセクション（トップページ用簡易版）
// ==========================================
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  return { firstDay, daysInMonth };
}

function HomeCalendarSection() {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const [year, setYear] = useState(jstNow.getFullYear());
  const [month, setMonth] = useState(jstNow.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const scheduleRef = useRef<HTMLDivElement>(null);

  const { data: monthData, isLoading } = trpc.schedule.getMonthSchedule.useQuery({ year, month });
  const { data: daySchedule, isLoading: dayLoading, isFetching: isDayScheduleFetching, dataUpdatedAt } = trpc.schedule.getByDate.useQuery(
    { date: selectedDate! },
    {
      enabled: !!selectedDate,
      refetchInterval: (query) => getResultWaitingRefetchInterval(query.state.data as Array<{ actionStatus?: string }> | undefined),
      refetchIntervalInBackground: false,
    }
  );

  const { firstDay, daysInMonth } = useMemo(() => getMonthDays(year, month), [year, month]);

  const dayInfoMap = useMemo(() => {
    const map: Record<number, { jraVenues: string[]; narVenues: string[]; gradeRaces: Array<{ name: string; grade: string }> }> = {};
    if (monthData?.days) {
      for (const d of monthData.days) {
        const jraVenues = (d as any).jraVenues || [];
        const narVenues = (d as any).narVenues || [];
        if (jraVenues.length > 0 || narVenues.length > 0 || d.gradeRaces.length > 0) {
          map[d.day] = { jraVenues, narVenues, gradeRaces: d.gradeRaces };
        }
      }
    }
    return map;
  }, [monthData]);

  const handlePrevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };
  const handleNextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  const handleDayClick = (day: number, hasRaces: boolean) => {
    if (!hasRaces) return;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
    setTimeout(() => {
      scheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  // 選択日のレースを競馬場ごとにグループ化
  const dayScheduleGrouped = useMemo(() => {
    if (!daySchedule) return {};
    const grouped: Record<string, typeof daySchedule> = {};
    // raceNumber > 0 のレースを競馬場ごとにグループ化
    for (const race of daySchedule) {
      if (race.raceNumber === 0) continue;
      if (!grouped[race.venue]) grouped[race.venue] = [];
      grouped[race.venue]!.push(race);
    }
    // NAR等の raceNumber=0 のみの競馬場も開催情報として追加
    for (const race of daySchedule) {
      if (race.raceNumber === 0 && !grouped[race.venue]) {
        // 重複する「XX開催」「XX競馬」は1つにまとめる
        grouped[race.venue] = [race];
      }
    }
    for (const venue of Object.keys(grouped)) {
      grouped[venue]!.sort((a, b) => a.raceNumber - b.raceNumber);
    }
    return grouped;
  }, [daySchedule]);

  const todayStr = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, "0")}-${String(jstNow.getDate()).padStart(2, "0")}`;
  const waitingRaceCount = useMemo(
    () => daySchedule?.filter((race: any) => race.actionStatus === "waiting").length ?? 0,
    [daySchedule],
  );

  const gradeBadgeColor = (grade: string) => {
    if (grade === "G1") return "bg-red-500/20 text-red-300 border-red-500/40 shadow-[0_0_6px_rgba(239,68,68,0.3)]";
    if (grade === "G2") return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    if (grade === "G3") return "bg-green-500/20 text-green-300 border-green-500/40";
    return "bg-gray-500/20 text-gray-300 border-gray-500/40";
  };

  return (
    <section id="calendar" className="luxury-section py-14 px-4">
      <div className="max-w-5xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 luxury-gold" />
            <h2 className="text-lg font-bold" style={{ color: "#ffffff" }}>レースカレンダー</h2>
          </div>
          <Link href="/calendar" className="text-xs font-medium px-3 py-1 rounded-full transition-all luxury-gold" style={{ border: "1px solid rgba(216,180,90,0.48)" }}>
            詳細を見る
          </Link>
        </div>

        {/* カレンダー本体 */}
        <div className="luxury-calendar-shell rounded-xl p-4 md:p-5">
          {/* 月ナビ */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={handlePrevMonth} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.6)" }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold" style={{ color: "#ffffff" }}>{year}年{month}月</span>
            <button onClick={handleNextMonth} className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.6)" }}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((day, i) => (
              <div key={day} className={`text-center text-[10px] font-medium py-0.5 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-white/50"}`}>
                {day}
              </div>
            ))}
          </div>

          {/* グリッド */}
          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-sm" style={{ color: "#64748b" }}>読み込み中...</div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e-${i}`} className="h-16 sm:h-18" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayOfWeek = (firstDay + i) % 7;
                const info = dayInfoMap[day];
                const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isToday = dateStr === todayStr;
                const hasRaces = info && (info.jraVenues.length > 0 || info.narVenues.length > 0);

                const isSelected = dateStr === selectedDate;

                return (
                  <div
                    key={day}
                    onClick={() => handleDayClick(day, !!hasRaces)}
                    className={`h-16 sm:h-18 rounded-md p-0.5 transition-all ${
                      hasRaces ? "hover:bg-amber-300/10 cursor-pointer" : ""
                    } ${isToday ? "ring-1 ring-amber-300/60 bg-amber-300/10" : ""} ${
                      isSelected ? "ring-2 ring-amber-200 bg-amber-300/15" : ""
                    }`}
                  >
                    <div className={`text-[10px] font-medium ${
                      dayOfWeek === 0 ? "text-red-400" : dayOfWeek === 6 ? "text-blue-400" : "text-white/60"
                    } ${isToday ? "text-amber-200" : ""}`}>
                      {day}
                    </div>
                    {info && (
                      <div className="space-y-0.5 overflow-hidden mt-0.5">
                        {info.jraVenues.length > 0 && (
                          <div className="flex flex-wrap gap-0.5">
                            {info.jraVenues.slice(0, 2).map(v => (
                              <span key={v} className="text-[8px] px-0.5 rounded bg-emerald-500/15 text-emerald-300/80 truncate">{v}</span>
                            ))}
                          </div>
                        )}
                        {info.narVenues.length > 0 && (
                          <div className="flex flex-wrap gap-0.5">
                            {info.narVenues.slice(0, 2).map(v => (
                              <span key={v} className="text-[8px] px-0.5 rounded bg-amber-500/15 text-amber-300/80 truncate">{v}</span>
                            ))}
                            {info.narVenues.length > 2 && (
                              <span className="text-[8px] text-white/30">+{info.narVenues.length - 2}</span>
                            )}
                          </div>
                        )}
                        {info.gradeRaces.slice(0, 1).map((gr, idx) => (
                          <div key={idx} className={`text-[8px] px-0.5 rounded border truncate ${gradeBadgeColor(gr.grade)}`}>
                            {gr.grade}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 選択日のレース一覧（インライン展開） */}
          {selectedDate && (
            <div ref={scheduleRef} className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(216,180,90,0.28)" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold" style={{ color: "#ffffff" }}>
                  {(() => {
                    const d = new Date(selectedDate + "T00:00:00+09:00");
                    return d.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" });
                  })()}のレース
                </h3>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-[10px] px-2 py-0.5 rounded transition-colors"
                  style={{ color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  閉じる
                </button>
              </div>

              {waitingRaceCount > 0 && (
                <div className="mb-3 flex items-center gap-2 text-[10px]" style={{ color: "#94a3b8" }}>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                  結果待ち {waitingRaceCount}件を30秒ごとに確認中
                  {isDayScheduleFetching && <span style={{ color: "#00e5ff" }}>更新中…</span>}
                  {!isDayScheduleFetching && dataUpdatedAt > 0 && <span>最終確認 {new Date(dataUpdatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              )}

              {dayLoading ? (
                <div className="text-sm py-4 text-center" style={{ color: "#64748b" }}>読み込み中...</div>
              ) : Object.keys(dayScheduleGrouped).length === 0 ? (
                <div className="text-sm py-4 text-center" style={{ color: "#64748b" }}>レースデータがありません</div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(dayScheduleGrouped).map(([venue, races]) => {
                    const isNarOnly = races.every(r => r.raceNumber === 0);
                    const actualRaces = races.filter(r => r.raceNumber > 0);
                    const raceCount = actualRaces.length > 0 ? actualRaces.length : null;
                    return (
                    <div key={venue} className="luxury-card rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className={`w-3.5 h-3.5 ${races[0]?.organizer === "NAR" ? "text-amber-400" : "text-cyan-400"}`} />
                        <span className="text-xs font-bold" style={{ color: "#e2e8f0" }}>{venue}</span>
                        <span className="text-[10px]" style={{ color: "#64748b" }}>
                          {races[0]?.organizer === "NAR" ? "地方" : "JRA"}{raceCount ? ` ・ ${raceCount}R` : ""}
                        </span>
                      </div>
                      {isNarOnly ? (
                        <a
                          href={getNarRaceListUrl(venue, selectedDate)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] px-2 py-1.5 rounded transition-all hover:bg-amber-500/10"
                          style={{ color: "#f59e0b" }}
                        >
                          <ExternalLink className="w-3 h-3" />
                          keiba.go.jp で出馬表・結果を見る
                        </a>
                      ) : (
                      <div className="grid grid-cols-1 gap-1">
                        {actualRaces.map(race => {
                          const actionStatus = (race as any).actionStatus ?? (selectedDate! < todayStr ? "missing_result" : "predict");
                          const predictionHref = `${race.organizer === "NAR" ? "/nar-predictions" : "/predictions"}?date=${selectedDate}&venue=${encodeURIComponent(race.venue)}&race=${race.raceNumber}`;
                          const resultHref = `/race-result?date=${selectedDate}&venue=${encodeURIComponent(race.venue)}&race=${race.raceNumber}`;
                          return (
                          <div
                            key={race.id}
                            className="flex items-center gap-2 py-1.5 px-2 rounded transition-colors hover:bg-white/5"
                          >
                            <span className="text-[10px] font-bold w-5 text-center" style={{ color: "#00e5ff" }}>
                              {race.raceNumber}R
                            </span>
                            {race.startTime && (
                              <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "#64748b" }}>
                                <Clock className="w-2.5 h-2.5" />
                                {race.startTime}
                              </span>
                            )}
                            <span className="text-[11px] truncate flex-1" style={{ color: "#e2e8f0" }}>
                              {race.raceName || "—"}
                            </span>
                            {race.grade && (
                              <span className={`text-[9px] px-1 py-0 rounded border ${gradeBadgeColor(race.grade)}`}>
                                {race.grade}
                              </span>
                            )}
                            {race.distance && (
                              <span className="text-[9px]" style={{ color: "#64748b" }}>
                                {race.surface === "dirt" ? "ダ" : "芝"}{race.distance}m
                              </span>
                            )}
                            {actionStatus === "predict" && (
                              <Link
                                href={predictionHref}
                                className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded transition-all duration-150 active:scale-97 shrink-0"
                                style={{ backgroundColor: "rgba(0,229,255,0.15)", color: "#00e5ff", border: "1px solid rgba(0,229,255,0.3)" }}
                              >
                                <Zap className="w-2.5 h-2.5" />
                                予想する
                              </Link>
                            )}
                            {actionStatus === "result" && (
                              <Link
                                href={resultHref}
                                className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded transition-all duration-150 active:scale-97 shrink-0"
                                style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.3)" }}
                              >
                                <Eye className="w-2.5 h-2.5" />
                                結果を見る
                              </Link>
                            )}
                            {actionStatus === "waiting" && (
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                style={{ backgroundColor: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.22)" }}
                              >
                                結果待ち
                              </span>
                            )}
                            {actionStatus === "missing_result" && (
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                style={{ backgroundColor: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)" }}
                              >
                                結果未取込
                              </span>
                            )}
                          </div>
                          );
                        })}
                      </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 凡例 */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-500/30 border border-emerald-500/50"></span>
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>JRA</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-amber-500/30 border border-amber-500/50"></span>
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>NAR</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-red-500/30 border border-red-500/50"></span>
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>G1</span>
            </div>
          </div>
        </div>

        {/* 今月の重賞レース */}
        {monthData?.gradeRaces && monthData.gradeRaces.length > 0 && (
          <div className="mt-4 rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-bold" style={{ color: "#ffffff" }}>{month}月の重賞レース</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {monthData.gradeRaces.map((race, i) => (
                <Link
                  key={i}
                  href="/calendar"
                  className={`p-2 rounded-lg border text-left block transition-all hover:scale-[1.02] ${gradeBadgeColor(race.grade)}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold">{race.grade}</span>
                    <span className="text-xs font-medium truncate">{race.raceName}</span>
                  </div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    {race.date.split("-")[1]}/{race.date.split("-")[2]} {race.venue}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ==========================================
// メインページ
// ==========================================
export default function Home() {
  return (
    <div className="luxury-home min-h-screen">
      <PageHead
        title=""
        description="競馬でGO！はJRA公式データ×AI解析で「買うべき馬」を数値化する競馬予想アプリ。3連単・馬連・ワイドを自動予想。"
        path="/"
        keywords="競馬予想,AI競馬予想,無料競馬予想,3連単予想,馬連予想,ワイド予想,データ分析,競馬アプリ,重賞予想"
      />
      <Navbar />
      <HeroSection />
      <AnaUmaAlertSection />
      <HomeCalendarSection />
      <ThisWeekRacesSection />
      <HitRateSection />
      <NavigationCardsSection />
      <PickupNewsSection />
      <CtaSection />
    </div>
  );
}
