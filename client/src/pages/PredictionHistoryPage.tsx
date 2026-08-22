import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BarChart3, CalendarDays, CircleCheck, CircleDollarSign, CircleX, Clock3, CloudSun, Filter, LineChart as LineChartIcon, MapPin, RotateCcw, Route as RouteIcon, Target, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "wouter";
import { HistoryBackButton } from "@/components/HistoryBackButton";
import { formatBetSelectionForDisplay } from "@shared/formationDisplay";

const ALL = "all";
const MISSING = "__missing__";

const conditionLabel: Record<string, string> = {
  good: "良",
  slightly_heavy: "稍重",
  heavy: "重",
  bad: "不良",
};

const surfaceLabel: Record<string, string> = {
  turf: "芝",
  dirt: "ダート",
  steeplechase: "障害",
};

export default function PredictionHistoryPage() {
  const [venueFilter, setVenueFilter] = useState(ALL);
  const [distanceFilter, setDistanceFilter] = useState(ALL);
  const [trackConditionFilter, setTrackConditionFilter] = useState(ALL);

  const { data: filterOptions, isLoading: optionsLoading } = trpc.raceData.getPredictionHistoryFilterOptions.useQuery();
  const queryInput = useMemo(() => ({
    limit: 50,
    offset: 0,
    ...(venueFilter === MISSING ? { venueMissing: true } : venueFilter !== ALL ? { venue: venueFilter } : {}),
    ...(distanceFilter === MISSING ? { distanceMissing: true } : distanceFilter !== ALL ? { distance: Number(distanceFilter) } : {}),
    ...(trackConditionFilter === MISSING ? { trackConditionMissing: true } : trackConditionFilter !== ALL ? { trackCondition: trackConditionFilter as "good" | "slightly_heavy" | "heavy" | "bad" } : {}),
  }), [venueFilter, distanceFilter, trackConditionFilter]);
  const { data: history, isLoading: historyLoading } = trpc.raceData.getPredictionHistory.useQuery(queryInput);
  const { data: performance, isLoading: performanceLoading } = trpc.raceData.getPredictionHistoryPerformance.useQuery(queryInput);
  const { data: timeline, isLoading: timelineLoading } = trpc.raceData.getPredictionHistoryTimeline.useQuery(queryInput);

  const resetFilters = () => {
    setVenueFilter(ALL);
    setDistanceFilter(ALL);
    setTrackConditionFilter(ALL);
  };
  const isFiltered = venueFilter !== ALL || distanceFilter !== ALL || trackConditionFilter !== ALL;
  const rows = history?.predictions ?? [];

  return (
    <main className="min-h-screen bg-[#070706] text-slate-100">
      <Navbar />
      <section className="mx-auto max-w-6xl px-4 pb-14 pt-24">
        <HistoryBackButton className="inline-flex items-center gap-1 text-xs text-[#bba167] transition-colors hover:text-[#f3d88a]">
          <ArrowLeft className="h-3.5 w-3.5" /> 戻る
        </HistoryBackButton>

        <div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-bold tracking-[0.26em] text-[#bba167]">PREDICTION ARCHIVE</p>
            <h1 className="mt-2 text-2xl font-black text-[#fff7df] sm:text-3xl">予想履歴</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">会場・距離・馬場状態を組み合わせ、比較したい条件だけを表示します。未登録の条件は推測せず、個別に選択できます。</p>
          </div>
          <div className="border border-[#caa24b]/25 bg-[#111008] px-4 py-3 text-right">
            <p className="text-[10px] tracking-widest text-[#a89366]">FILTERED RECORDS</p>
            <p className="mt-1 text-xl font-black text-[#f1d78c]">{historyLoading ? "—" : history?.total ?? 0}<span className="ml-1 text-xs font-medium text-[#a89366]">件</span></p>
          </div>
        </div>

        <section className="mt-5 border border-[#caa24b]/25 bg-[linear-gradient(110deg,rgba(202,162,75,0.10),rgba(12,12,10,0.8)_45%,rgba(12,12,10,0.95))] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-[#f3e3ae]"><BarChart3 className="h-4 w-4" /> 選択条件の実測サマリー</div>
              <p className="mt-1 text-[11px] leading-relaxed text-[#a89366]">確定済みかつ買い目点数が保存された予想だけを、同一レースは最新記録に統一して集計しています。</p>
            </div>
            {performance && performance.total > 0 && <span className="border border-[#d4ba69]/35 bg-[#d4ba69]/10 px-2 py-1 text-[10px] font-bold text-[#e8d591]">{performance.hits}/{performance.total} 的中</span>}
          </div>

          {performanceLoading ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><SummarySkeleton /><SummarySkeleton /><SummarySkeleton /><SummarySkeleton /></div>
          ) : performance && performance.total > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryMetric icon={<Target className="h-3.5 w-3.5" />} label="対象レース" value={`${performance.total}件`} detail={`${performance.hits}的中 / ${performance.misses}不的中`} />
              <SummaryMetric icon={<CircleCheck className="h-3.5 w-3.5" />} label="的中率" value={`${performance.hitRate}%`} detail="確定済み・最新予想のみ" accent="cyan" />
              <SummaryMetric icon={<TrendingUp className="h-3.5 w-3.5" />} label="回収率" value={`${performance.roi}%`} detail={`投資 ¥${performance.totalInvest.toLocaleString()}`} accent={performance.roi !== null && performance.roi >= 100 ? "green" : "gold"} />
              <SummaryMetric icon={<CircleDollarSign className="h-3.5 w-3.5" />} label="収支" value={`${performance.profit >= 0 ? "+" : "−"}¥${Math.abs(performance.profit).toLocaleString()}`} detail={`回収 ¥${performance.totalReturn.toLocaleString()}`} accent={performance.profit >= 0 ? "green" : "rose"} />
            </div>
          ) : (
            <div className="mt-4 border border-dashed border-[#caa24b]/25 bg-black/15 px-3 py-3 text-[11px] leading-relaxed text-[#a89366]">
              {performance?.excludedLegacyCount
                ? `この条件では確定済みの${performance.excludedLegacyCount}件が買い目点数未記録の旧形式のため、的中率・回収率の集計対象外です。現行形式の確定レースから実測値を表示します。`
                : "この条件で集計できる確定済みの現行形式予想はまだありません。"}
            </div>
          )}
        </section>

        <section className="mt-5 border border-white/10 bg-[#0d0d0b] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-[#f3e3ae]"><LineChartIcon className="h-4 w-4" /> 選択条件の実績推移</div>
              <p className="mt-1 text-[11px] text-slate-500">確定済み・現行形式の予想について、日単位の累積値を表示します。</p>
            </div>
            {timeline && timeline.total > 0 && <span className="text-[10px] text-[#a89366]">{timeline.total}レースを時系列化</span>}
          </div>

          {timelineLoading ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2"><ChartSkeleton /><ChartSkeleton /></div>
          ) : timeline && timeline.points.length > 0 ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <PerformanceTrendChart title="累積収支" caption="累積回収額 − 累積投資額" data={timeline.points} dataKey="cumulativeProfit" color="#edc968" unit="円" referenceValue={0} />
              <PerformanceTrendChart title="累積回収率" caption="累積回収額 ÷ 累積投資額 × 100" data={timeline.points} dataKey="cumulativeRoi" color="#72d6ff" unit="%" referenceValue={100} />
            </div>
          ) : (
            <div className="mt-4 flex min-h-45 items-center justify-center border border-dashed border-[#caa24b]/25 px-4 text-center">
              <div><LineChartIcon className="mx-auto h-6 w-6 text-[#8d7846]" /><p className="mt-2 text-sm font-medium text-[#d8c896]">推移グラフを作成できる実測データはまだありません</p><p className="mt-1 text-[11px] text-slate-500">確定済みかつ買い目点数が保存された現行形式の予想から表示します。</p></div>
            </div>
          )}
          {timeline && timeline.excludedLegacyCount > 0 && <p className="mt-3 text-[10px] text-[#8f7b51]">点数未記録の旧形式 {timeline.excludedLegacyCount}件は、推移グラフの集計対象外です。</p>}
        </section>

        <section className="mt-7 border border-white/10 bg-[#0d0d0b] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#f3e3ae]"><Filter className="h-4 w-4" /> 条件で絞り込む</div>
            <button onClick={resetFilters} disabled={!isFiltered} className="inline-flex items-center gap-1.5 text-xs text-[#c5a75a] disabled:cursor-not-allowed disabled:opacity-35">
              <RotateCcw className="h-3.5 w-3.5" /> 条件をリセット
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <FilterSelect label="会場" icon={<MapPin className="h-3.5 w-3.5" />} value={venueFilter} onChange={setVenueFilter} disabled={optionsLoading}>
              <option value={ALL}>すべての会場</option>
              {(filterOptions?.venues ?? []).map(venue => <option key={venue} value={venue}>{venue}</option>)}
              {filterOptions?.missing.venue && <option value={MISSING}>会場未登録</option>}
            </FilterSelect>
            <FilterSelect label="距離" icon={<RouteIcon className="h-3.5 w-3.5" />} value={distanceFilter} onChange={setDistanceFilter} disabled={optionsLoading}>
              <option value={ALL}>すべての距離</option>
              {(filterOptions?.distances ?? []).map(distance => <option key={distance} value={String(distance)}>{distance.toLocaleString()}m</option>)}
              {filterOptions?.missing.distance && <option value={MISSING}>距離未登録</option>}
            </FilterSelect>
            <FilterSelect label="馬場状態" icon={<CloudSun className="h-3.5 w-3.5" />} value={trackConditionFilter} onChange={setTrackConditionFilter} disabled={optionsLoading}>
              <option value={ALL}>すべての馬場状態</option>
              {(filterOptions?.trackConditions ?? []).map(condition => <option key={condition} value={condition}>{conditionLabel[condition] ?? condition}</option>)}
              {filterOptions?.missing.trackCondition && <option value={MISSING}>馬場状態未登録</option>}
            </FilterSelect>
          </div>
        </section>

        <section className="mt-6">
          {historyLoading ? (
            <div className="border border-dashed border-white/15 py-16 text-center text-sm text-slate-500">予想履歴を読み込んでいます...</div>
          ) : rows.length === 0 ? (
            <div className="border border-dashed border-[#caa24b]/25 py-16 text-center">
              <CalendarDays className="mx-auto h-7 w-7 text-[#8d7846]" />
              <p className="mt-3 text-sm font-medium text-[#d8c896]">該当する予想履歴はありません</p>
              <p className="mt-1 text-xs text-slate-500">条件を変更するか、公式データ取込後に再度ご確認ください。</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map(item => {
                const race = item.race;
                const isHit = item.isHit === true;
                const isMiss = item.isHit === false;
                const isUnsettled = !isHit && !isMiss && race?.status === "results_confirmed";
                const isOfficialResultMissing = !isHit && !isMiss && !isUnsettled && item.raceActionStatus === "missing_result";
                const visualStatus = isHit
                  ? { label: "的中", detail: "払戻を反映済み", icon: CircleCheck, card: "border-emerald-400/35 bg-[linear-gradient(120deg,rgba(16,185,129,0.13),rgba(13,13,11,0.95)_54%)] hover:border-emerald-300/55", badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", rail: "bg-emerald-300" }
                  : isMiss
                    ? { label: "不的中", detail: "結果を反映済み", icon: CircleX, card: "border-rose-400/30 bg-[linear-gradient(120deg,rgba(244,63,94,0.11),rgba(13,13,11,0.95)_54%)] hover:border-rose-300/55", badge: "border-rose-400/25 bg-rose-400/10 text-rose-300", rail: "bg-rose-300" }
                    : isUnsettled
                      ? { label: "買い目未精算", detail: "公式結果は反映済み", icon: Clock3, card: "border-amber-300/25 bg-[linear-gradient(120deg,rgba(245,158,11,0.10),rgba(13,13,11,0.95)_54%)] hover:border-amber-200/45", badge: "border-amber-300/30 bg-amber-300/10 text-amber-200", rail: "bg-amber-300" }
                      : isOfficialResultMissing
                        ? { label: "公式結果未取込", detail: "過去レースの公式CSV待ち", icon: Clock3, card: "border-amber-400/35 bg-[linear-gradient(120deg,rgba(245,158,11,0.12),rgba(13,13,11,0.95)_54%)] hover:border-amber-300/55", badge: "border-amber-400/35 bg-amber-400/10 text-amber-200", rail: "bg-amber-400" }
                        : { label: "結果待ち", detail: "公式結果を確認中", icon: Clock3, card: "border-white/10 bg-[#0d0d0b] hover:border-[#caa24b]/35", badge: "border-white/10 bg-white/[0.03] text-slate-400", rail: "bg-slate-500" };
                const StatusIcon = visualStatus.icon;
                const resultHref = race ? `/race-result?date=${race.raceDate}&venue=${encodeURIComponent(race.venueName)}&race=${race.raceNumber}` : null;
                return (
                  <article key={item.id} className={`relative overflow-hidden border p-4 pl-5 transition-colors ${visualStatus.card}`}>
                    <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${visualStatus.rail}`} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] text-[#a89366]">{race?.raceDate ?? "開催日未登録"} · {race?.venueName ?? "会場未登録"} {race?.raceNumber ? `${race.raceNumber}R` : ""}</p>
                        <h2 className="mt-1 truncate text-sm font-bold text-[#f7f0dd]">{race?.raceName ?? `レースID: ${item.raceId}`}</h2>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 border px-2 py-1 text-[10px] font-bold ${visualStatus.badge}`}><StatusIcon className="h-3 w-3" /> {visualStatus.label}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                      <span className="border border-[#caa24b]/25 bg-[#caa24b]/10 px-2 py-1 text-[#e3cb83]">{race?.surface ? surfaceLabel[race.surface] ?? race.surface : "コース未登録"}{race?.distance ? ` ${race.distance}m` : ""}</span>
                      <span className="border border-white/10 bg-white/[0.02] px-2 py-1 text-slate-400">馬場: {race?.trackCondition ? conditionLabel[race.trackCondition] ?? race.trackCondition : "未登録"}</span>
                      <span className="border border-white/10 bg-white/[0.02] px-2 py-1 text-slate-400">◎ {item.honmei} · ○ {item.taikou} · ▲ {item.tanana}</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {item.ticketSetSummaries.map(ticketSet => {
                        const longshot = ticketSet.strategy === "longshot";
                        const mainTicket = ticketSet.selections.find(ticket => ticket.betType === "trifecta") ?? ticketSet.selections[0];
                        return (
                          <div key={ticketSet.strategy} className="border px-2.5 py-2" style={{ borderColor: longshot ? "rgba(192,132,252,0.24)" : "rgba(201,168,76,0.24)", backgroundColor: longshot ? "rgba(192,132,252,0.05)" : "rgba(201,168,76,0.05)" }}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold" style={{ color: longshot ? "#d8b4fe" : "#e4c875" }}>{ticketSet.label}</span>
                              <span className="text-[9px]" style={{ color: ticketSet.isHit === true ? "#6ee7b7" : ticketSet.isHit === false ? "#fda4af" : "#94a3b8" }}>{ticketSet.isHit === true ? "的中" : ticketSet.isHit === false ? "不的中" : "未精算"}</span>
                            </div>
                            {mainTicket ? <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-400">{mainTicket.label}: {formatBetSelectionForDisplay(mainTicket.selection)}</p> : <p className="mt-1 text-[10px] text-slate-500">{longshot ? "当時の穴馬買い目は保存されていません" : "買い目詳細未記録"}</p>}
                            <p className="mt-1 text-[9px] text-slate-500">投資 {ticketSet.investAmount !== null ? `¥${ticketSet.investAmount.toLocaleString()}` : "—"} / 配当 {ticketSet.returnAmount !== null ? `¥${ticketSet.returnAmount.toLocaleString()}` : "—"}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-xs">
                      <span className="text-slate-500">{visualStatus.detail} · 投資 {item.investAmount !== null ? `¥${item.investAmount.toLocaleString()}` : "—"} / 回収 {item.returnAmount !== null ? `¥${item.returnAmount.toLocaleString()}` : "—"}</span>
                      {resultHref ? <Link href={resultHref} className="font-bold text-[#d9bd6e]">結果を見る →</Link> : <span className="text-slate-600">詳細未登録</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <p className="mt-7 text-center text-[10px] text-slate-600">過去の成績は保存済みレコードに基づく表示です。予想・回収を保証するものではありません。</p>
      </section>
    </main>
  );
}

function FilterSelect({ label, icon, value, onChange, disabled, children }: { label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#b8a578]">{icon}{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)} disabled={disabled} className="w-full border border-white/10 bg-[#070706] px-3 py-2.5 text-sm text-[#ede3c4] outline-none focus:border-[#d2b866] disabled:opacity-50">
        {children}
      </select>
    </label>
  );
}

function SummaryMetric({ icon, label, value, detail, accent = "gold" }: { icon: React.ReactNode; label: string; value: string; detail: string; accent?: "gold" | "cyan" | "green" | "rose" }) {
  const colors = {
    gold: "border-[#caa24b]/25 bg-[#caa24b]/8 text-[#e8d591]",
    cyan: "border-cyan-300/20 bg-cyan-300/5 text-cyan-200",
    green: "border-emerald-300/20 bg-emerald-300/5 text-emerald-200",
    rose: "border-rose-300/20 bg-rose-300/5 text-rose-200",
  } as const;
  return <div className={`border p-3 ${colors[accent]}`}><div className="flex items-center gap-1.5 text-[10px] opacity-75">{icon}{label}</div><p className="mt-1 text-lg font-black tracking-tight">{value}</p><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div>;
}

function SummarySkeleton() {
  return <div className="h-21 animate-pulse border border-white/5 bg-white/[0.025]" />;
}

type PerformanceTimelinePoint = {
  date: string;
  cumulativeProfit: number;
  cumulativeRoi: number | null;
  cumulativeInvest: number;
  cumulativeReturn: number;
};

function PerformanceTrendChart({ title, caption, data, dataKey, color, unit, referenceValue }: { title: string; caption: string; data: PerformanceTimelinePoint[]; dataKey: "cumulativeProfit" | "cumulativeRoi"; color: string; unit: "円" | "%"; referenceValue: number }) {
  const formatValue = (value: number | null) => {
    if (value === null) return "—";
    return unit === "円" ? `${value >= 0 ? "+" : "−"}¥${Math.abs(value).toLocaleString()}` : `${value.toFixed(1)}%`;
  };
  return (
    <div className="border border-white/8 bg-black/15 p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-2"><h3 className="text-xs font-bold text-[#e9dab1]">{title}</h3><span className="text-[10px] text-slate-500">{caption}</span></div>
      <div className="mt-3 h-58 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,168,76,.12)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={value => String(value).slice(5).replace("-", "/")} tick={{ fill: "#8f8a7a", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={value => unit === "円" ? `${Math.round(Number(value) / 1000)}k` : `${value}%`} tick={{ fill: "#8f8a7a", fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={{ background: "#111008", border: "1px solid rgba(202,162,75,.35)", borderRadius: 0, color: "#f4e7c0", fontSize: 11 }} labelStyle={{ color: "#bba167" }} formatter={(value: number | string) => [formatValue(typeof value === "number" ? value : Number(value)), title]} labelFormatter={label => `${label}（JST）`} />
            <ReferenceLine y={referenceValue} stroke="rgba(255,255,255,.24)" strokeDasharray="4 4" />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-72 animate-pulse border border-white/5 bg-white/[0.025]" />;
}
