import { AlertTriangle, BarChart3, CheckCircle2, CircleSlash2, Database, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

type QualityStatus = "available" | "partial" | "unavailable";

const statusMeta: Record<QualityStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  available: { label: "利用中", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200", Icon: CheckCircle2 },
  partial: { label: "一部利用", className: "border-amber-400/30 bg-amber-400/10 text-amber-100", Icon: AlertTriangle },
  unavailable: { label: "未利用", className: "border-slate-500/40 bg-slate-800/70 text-slate-300", Icon: CircleSlash2 },
};

function formatUpdatedAt(value: Date | null | undefined) {
  if (!value) return "更新時刻なし";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新時刻なし";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function rateTone(rate: number) {
  if (rate >= 80) return "bg-emerald-400";
  if (rate >= 40) return "bg-amber-400";
  return "bg-rose-400";
}

function CoverageRow({ item }: { item: { organizer: "JRA" | "NAR"; venueName?: string; totalRaces: number; entryRate: number; winOddsRate: number; combinationOddsRate: number; resultRate: number; averageRate: number; missingLabels: string[] } }) {
  const metrics = [["出", item.entryRate], ["単", item.winOddsRate], ["組", item.combinationOddsRate], ["結", item.resultRate]] as const;
  return (
    <div className="border-t border-white/10 py-2.5 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0"><span className="text-xs font-semibold text-slate-100">{item.venueName ?? item.organizer}</span>{item.venueName && <span className="ml-1.5 text-[10px] text-slate-500">{item.organizer}</span>}</div>
        <span className="shrink-0 font-mono text-xs text-slate-200">平均 {item.averageRate.toFixed(1)}%</span>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {metrics.map(([label, rate]) => <div key={label}><div className="mb-1 flex justify-between text-[9px] text-slate-500"><span>{label}</span><span>{rate.toFixed(0)}%</span></div><div className="h-1 bg-slate-800"><div className={`h-full ${rateTone(rate)}`} style={{ width: `${rate}%` }} /></div></div>)}
      </div>
      {item.missingLabels.length > 0 && <p className="mt-1.5 text-[10px] text-amber-200/80">不足: {item.missingLabels.join("・")} ／ 対象 {item.totalRaces}レース</p>}
    </div>
  );
}

/** 公式データの有無と分析への反映可否を推測なしで明示するパネル。 */
export function DataQualityPanel() {
  const { data, isLoading, isError, refetch, isFetching } = trpc.dashboard.getDataQuality.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: false });
  const { data: coverageData, isLoading: isCoverageLoading, isError: isCoverageError, refetch: refetchCoverage, isFetching: isCoverageFetching } = trpc.dashboard.getVenueDataCoverage.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: false });
  const refreshAll = () => { void Promise.all([refetch(), refetchCoverage()]); };

  return (
    <section className="mb-7 border border-cyan-300/15 bg-slate-950/60 px-4 py-4 sm:px-5" aria-labelledby="data-quality-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-100"><Database className="h-4 w-4" /><h2 id="data-quality-title" className="text-sm font-bold tracking-wide">データ品質パネル</h2></div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">各指標が分析へ反映されているか、欠損理由と更新状況を表示します。未取得データは補完しません。</p>
        </div>
        <button type="button" onClick={refreshAll} disabled={isFetching || isCoverageFetching} className="inline-flex h-8 items-center gap-1.5 border border-white/15 px-2.5 text-xs text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100 disabled:opacity-60" aria-label="データ品質を再読み込み">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching || isCoverageFetching ? "animate-spin" : ""}`} />更新
        </button>
      </div>

      {isLoading && <p className="py-7 text-center text-sm text-slate-400">データ品質を確認しています…</p>}
      {isError && <p className="py-7 text-center text-sm text-rose-300">データ品質を取得できませんでした。再読み込みしてください。</p>}
      {data && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {data.metrics.map(metric => {
              const meta = statusMeta[metric.status as QualityStatus];
              const Icon = meta.Icon;
              return (
                <div key={metric.key} className="min-h-[142px] bg-slate-950/90 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-100">{metric.label}</p>
                    <span className={`inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold ${meta.className}`}><Icon className="h-3 w-3" />{meta.label}</span>
                  </div>
                  <p className="mt-2 min-h-[38px] text-[11px] leading-relaxed text-slate-400">{metric.detail}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[10px]">
                    <span className={metric.usedInAnalysis ? "text-cyan-200" : "text-slate-500"}>{metric.usedInAnalysis ? "分析へ反映中" : "分析へ未反映"}</span>
                    <span className="text-slate-500">{formatUpdatedAt(metric.lastUpdatedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] text-slate-500">集計時刻: {formatUpdatedAt(data.generatedAt)}。対象レース単位の入力状況は、各予想画面の指標説明でも確認できます。</p>
        </>
      )}

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-cyan-200" /><h3 className="text-xs font-bold text-slate-100">会場・主催者別のデータ充足率</h3></div>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">出＝出馬表、単＝公式単勝オッズ、組＝公式組合せオッズ、結＝公式確定結果。平均は4指標の単純平均で、低い順に表示します。</p>
        {isCoverageLoading && <p className="py-5 text-center text-xs text-slate-400">会場別の充足率を確認しています…</p>}
        {isCoverageError && <p className="py-5 text-center text-xs text-rose-300">会場別の充足率を取得できませんでした。</p>}
        {coverageData && (
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="border border-white/10 px-3 py-2.5"><p className="text-[10px] font-bold tracking-wide text-slate-400">主催者別</p>{coverageData.organizers.map(item => <CoverageRow key={item.organizer} item={item} />)}</div>
            <div className="border border-white/10 px-3 py-2.5"><p className="text-[10px] font-bold tracking-wide text-slate-400">不足会場の優先順位</p>{coverageData.venues.map(item => <CoverageRow key={`${item.organizer}:${item.venueName}`} item={item} />)}</div>
          </div>
        )}
      </div>
    </section>
  );
}
