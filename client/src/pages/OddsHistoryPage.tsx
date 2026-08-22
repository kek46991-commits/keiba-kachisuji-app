import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, BarChart3, Database, FileClock, LineChart as LineChartIcon } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const SERIES_COLORS = ["#22d3ee", "#fbbf24", "#34d399", "#f472b6", "#a78bfa", "#fb923c"];

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function OddsHistoryPage() {
  const { user, loading } = useAuth();
  const { data: history = [], isLoading: historyLoading } = trpc.jraVanUpload.listImportHistory.useQuery({ limit: 40 }, { enabled: Boolean(user && user.role === "admin") });
  const [selectedRaceId, setSelectedRaceId] = useState("");
  const [selectedHorses, setSelectedHorses] = useState<number[]>([]);

  useEffect(() => {
    if (!selectedRaceId && history[0]) setSelectedRaceId(history[0].raceId);
  }, [history, selectedRaceId]);

  const { data: timeline, isLoading: timelineLoading } = trpc.jraVanUpload.getOddsTimeline.useQuery(
    { raceId: selectedRaceId, ...(selectedHorses.length ? { horseNumbers: selectedHorses } : {}) },
    { enabled: Boolean(selectedRaceId) },
  );

  useEffect(() => {
    if (timeline?.horses.length && selectedHorses.length === 0) {
      setSelectedHorses(timeline.horses.slice(0, 3).map(horse => horse.horseNumber));
    }
  }, [timeline, selectedHorses.length]);

  const chartConfig = useMemo(() => Object.fromEntries((timeline?.horses ?? []).map((horse, index) => [
    `horse_${horse.horseNumber}`,
    { label: `${horse.horseNumber}番 ${horse.horseName}`, color: SERIES_COLORS[index % SERIES_COLORS.length] },
  ])) as ChartConfig, [timeline]);

  const chartData = useMemo(() => {
    const points = new Map<string, Record<string, string | number>>();
    for (const snapshot of timeline?.snapshots ?? []) {
      const key = new Date(snapshot.fetchedAt).toISOString();
      const point = points.get(key) ?? { time: formatDateTime(snapshot.fetchedAt) };
      point[`horse_${snapshot.horseNumber}`] = Number(snapshot.winOdds);
      points.set(key, point);
    }
    return Array.from(points.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([, point]) => point);
  }, [timeline]);

  const selectedImport = history.find(item => item.raceId === selectedRaceId);
  const toggleHorse = (horseNumber: number) => {
    setSelectedHorses(current => current.includes(horseNumber)
      ? current.filter(number => number !== horseNumber)
      : current.length >= 6 ? current : [...current, horseNumber]);
  };

  if (loading) return <div className="min-h-screen bg-[#08111f] text-slate-300 grid place-items-center">読み込み中...</div>;
  if (!user || user.role !== "admin") return <div className="min-h-screen bg-[#08111f] text-slate-300 grid place-items-center p-6">この画面は管理者専用です。</div>;

  return <main className="min-h-screen bg-[#08111f] text-slate-100 pb-12">
    <header className="border-b border-white/10 bg-[#0b1628] sticky top-0 z-10"><div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3"><Link href="/admin/official-odds"><button className="p-2 rounded bg-white/5"><ArrowLeft className="w-4 h-4" /></button></Link><div><h1 className="font-bold">オッズ推移・取込履歴</h1><p className="text-xs text-slate-400">公式データの保存記録と時系列変化</p></div></div></header>
    <section className="max-w-5xl mx-auto px-4 pt-7 grid lg:grid-cols-[300px_1fr] gap-5">
      <aside className="border border-white/10 bg-[#0d1b2a] rounded-lg p-4 h-fit"><div className="flex gap-2 items-center font-semibold"><FileClock className="w-4 h-4 text-cyan-300" />取込履歴</div>{historyLoading ? <p className="text-sm text-slate-500 mt-5">読込中...</p> : history.length === 0 ? <div className="text-sm text-slate-400 mt-5"><Database className="w-5 h-5 mb-2 text-slate-500" />取込履歴はまだありません。<Link href="/admin/official-odds" className="text-cyan-300 block mt-2">公式オッズを取り込む</Link></div> : <div className="mt-4 space-y-2 max-h-[68vh] overflow-y-auto">{history.map(item => <button key={item.id} onClick={() => { setSelectedRaceId(item.raceId); setSelectedHorses([]); }} className={`w-full text-left p-3 rounded border ${item.raceId === selectedRaceId ? "border-cyan-400/50 bg-cyan-400/10" : "border-white/5 bg-black/10"}`}><p className="text-sm font-medium truncate">{item.venueName ?? "JRA"} {item.raceNumber ? `${item.raceNumber}R` : ""} {item.raceName ?? item.raceId}</p><p className="text-[11px] text-slate-400 mt-1">{formatDateTime(item.importedAt)} · {item.rowCount}頭 · {item.fileFormat.toUpperCase()}</p><p className="text-[10px] text-slate-500 truncate mt-1">{item.fileName ?? "ファイル名なし"}</p></button>)}</div>}</aside>
      <div className="space-y-5">{!selectedRaceId ? <div className="border border-dashed border-white/15 rounded-lg min-h-[300px] grid place-items-center text-slate-400 text-sm">取込履歴を選択するとオッズ推移を表示します。</div> : <><div className="border border-white/10 bg-[#0d1b2a] rounded-lg p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><BarChart3 className="w-4 h-4 text-cyan-300" />単勝オッズ推移</div><p className="text-xs text-slate-400 mt-1">レースID: {selectedRaceId}{selectedImport ? ` · 最終取込 ${formatDateTime(selectedImport.importedAt)}` : ""}</p></div><Link href="/admin/official-odds" className="text-xs text-cyan-300 shrink-0">新規取込</Link></div>{timelineLoading ? <div className="h-[330px] grid place-items-center text-slate-400 text-sm">時系列データを読込中...</div> : chartData.length < 2 ? <div className="h-[330px] grid place-items-center text-center text-slate-400 text-sm"><LineChartIcon className="w-8 h-8 mx-auto mb-3 text-slate-600" />グラフには同一レースを2回以上取り込む必要があります。<br />次回取込後にオッズ変化を表示します。</div> : <ChartContainer config={chartConfig} className="h-[330px] w-full mt-5"><LineChart data={chartData} margin={{ left: -14, right: 8, top: 8, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.18)" /><XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} /><YAxis reversed tick={{ fill: "#94a3b8", fontSize: 10 }} width={35} label={{ value: "低オッズ ←", position: "insideTopLeft", fill: "#64748b", fontSize: 10 }} /><Tooltip contentStyle={{ background: "#0b1628", border: "1px solid rgba(148,163,184,.3)", borderRadius: 6 }} labelStyle={{ color: "#cbd5e1" }} /><Legend wrapperStyle={{ fontSize: 11 }} />{(timeline?.horses ?? []).filter(horse => selectedHorses.includes(horse.horseNumber)).map((horse, index) => <Line key={horse.horseNumber} type="monotone" dataKey={`horse_${horse.horseNumber}`} name={`${horse.horseNumber}番 ${horse.horseName}`} stroke={SERIES_COLORS[index % SERIES_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}</LineChart></ChartContainer>}</div><div className="border border-white/10 bg-[#0d1b2a] rounded-lg p-5"><p className="text-sm font-semibold">表示する馬（最大6頭）</p><div className="flex flex-wrap gap-2 mt-3">{(timeline?.horses ?? []).map((horse, index) => <button key={horse.horseNumber} onClick={() => toggleHorse(horse.horseNumber)} className={`px-3 py-1.5 rounded text-xs border ${selectedHorses.includes(horse.horseNumber) ? "border-cyan-300/70 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-slate-400"}`}><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />{horse.horseNumber}番 {horse.horseName}</button>)}</div></div></>}</div>
    </section>
  </main>;
}
