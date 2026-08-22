import { useState } from "react";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { ArrowLeft, BarChart3, CircleAlert, Loader2, RefreshCw, Trophy, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { HistoryBackButton } from "@/components/HistoryBackButton";

const chartConfig = {
  roi: { label: "回収率", color: "#22d3ee" },
  hitRate: { label: "的中率", color: "#c9a84c" },
} satisfies ChartConfig;

const periods = [
  { value: 90, label: "直近90日" },
  { value: 365, label: "直近1年" },
  { value: 3650, label: "全期間" },
];

const yen = (value: number) => `¥${Math.round(value).toLocaleString("ja-JP")}`;

export default function TicketPerformancePage() {
  const [days, setDays] = useState(365);
  const { data, isLoading, refetch, isFetching } = trpc.raceData.getTicketPointPerformance.useQuery({ days });
  const classifiedCount = data?.bands.reduce((sum, band) => sum + band.records, 0) ?? 0;
  const hasData = classifiedCount > 0;

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-cyan-400/10 bg-[#091527]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <HistoryBackButton className="rounded-lg bg-cyan-400/10 p-2 text-cyan-300" aria-label="前の画面へ戻る">
            <ArrowLeft className="h-4 w-4" />
          </HistoryBackButton>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-bold text-white"><BarChart3 className="h-4 w-4 text-cyan-300" /> 点数帯別 回収率分析</p>
            <p className="mt-0.5 text-[11px] text-slate-400">確定済みかつ買い目点数が保存された予想のみを集計</p>
          </div>
          <button onClick={() => refetch()} disabled={isFetching} className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 disabled:opacity-50" aria-label="再読み込み">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {periods.map(period => (
            <button key={period.value} onClick={() => setDays(period.value)} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: days === period.value ? "rgba(34,211,238,0.18)" : "rgba(255,255,255,0.05)", color: days === period.value ? "#67e8f9" : "#94a3b8", border: days === period.value ? "1px solid rgba(34,211,238,0.35)" : "1px solid rgba(255,255,255,0.08)" }}>
              {period.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center py-24 text-slate-400"><Loader2 className="h-7 w-7 animate-spin text-cyan-300" /><p className="mt-3 text-sm">集計しています…</p></div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric icon={<Trophy className="h-4 w-4 text-cyan-300" />} label="確定済み予想" value={`${data?.settledCount ?? 0}件`} />
              <Metric icon={<BarChart3 className="h-4 w-4 text-amber-300" />} label="点数記録あり" value={`${classifiedCount}件`} />
              <Metric icon={<CircleAlert className="h-4 w-4 text-slate-400" />} label="点数未記録" value={`${data?.unclassifiedCount ?? 0}件`} />
              <Metric icon={<Wallet className="h-4 w-4 text-emerald-300" />} label="集計期間" value={`${data?.periodDays ?? days}日`} />
            </section>

            <section className="mt-5 rounded-xl border border-white/8 bg-white/[0.025] p-4">
              <p className="text-sm font-bold text-white">回収率と的中率の比較</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">回収率は「払戻額 ÷ 投資額 × 100」です。点数未記録の旧履歴は推定せず、集計から除外しています。</p>
              {hasData ? (
                <ChartContainer config={chartConfig} className="mt-4 h-[260px] w-full">
                  <BarChart data={data?.bands} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="band" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} unit="%" />
                    <ReferenceLine y={100} stroke="#fbbf24" strokeDasharray="4 4" label={{ value: "損益分岐", fill: "#fbbf24", fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <span>{name}: {value == null ? "—" : `${value}%`}</span>} />} />
                    <Bar dataKey="roi" name="回収率" fill="var(--color-roi)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="hitRate" name="的中率" fill="var(--color-hitRate)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="mt-5 rounded-lg border border-dashed border-white/10 bg-black/10 p-8 text-center">
                  <p className="text-sm font-medium text-slate-300">集計対象の点数記録がまだありません</p>
                  <p className="mt-1 text-xs text-slate-500">今後生成され、結果が確定した予想から点数帯別の比較に追加されます。</p>
                </div>
              )}
            </section>

            <section className="mt-5 overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]">
              <div className="border-b border-white/8 px-4 py-3"><p className="text-sm font-bold text-white">点数帯別 明細</p></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-xs">
                  <thead className="bg-white/[0.03] text-slate-400"><tr><th className="px-4 py-3">総点数</th><th className="px-4 py-3">予想数</th><th className="px-4 py-3">的中率</th><th className="px-4 py-3">投資額</th><th className="px-4 py-3">払戻額</th><th className="px-4 py-3">回収率</th><th className="px-4 py-3">収支</th></tr></thead>
                  <tbody>{data?.bands.map(row => <tr key={row.band} className="border-t border-white/5"><td className="px-4 py-3 font-bold text-slate-200">{row.band}点</td><td className="px-4 py-3 text-slate-300">{row.records}</td><td className="px-4 py-3 text-amber-200">{row.hitRate == null ? "—" : `${row.hitRate}%`}</td><td className="px-4 py-3 text-slate-300">{yen(row.totalInvest)}</td><td className="px-4 py-3 text-slate-300">{yen(row.totalReturn)}</td><td className="px-4 py-3 font-bold" style={{ color: row.roi == null ? "#64748b" : row.roi >= 100 ? "#34d399" : "#fda4af" }}>{row.roi == null ? "—" : `${row.roi}%`}</td><td className="px-4 py-3" style={{ color: row.profit >= 0 ? "#34d399" : "#fda4af" }}>{row.records === 0 ? "—" : yen(row.profit)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><div className="flex items-center gap-1.5 text-[10px] text-slate-400">{icon}{label}</div><p className="mt-2 text-lg font-bold text-white">{value}</p></div>;
}
