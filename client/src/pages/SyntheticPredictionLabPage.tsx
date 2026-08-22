import { FlaskConical, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function SyntheticPredictionLabPage() {
  const { user, loading } = useAuth();
  const latest = trpc.syntheticPrediction.getLatest.useQuery();
  const utils = trpc.useUtils();
  const seed = trpc.syntheticPrediction.seedRaceA.useMutation({
    onSuccess: () => utils.syntheticPrediction.getLatest.invalidate(),
  });

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#08111f] text-slate-300">読み込み中...</div>;

  const data = latest.data;
  const scoreTickets = data?.scoreTickets as Record<string, unknown> | null;
  const longshotTickets = data?.longshotTickets as Record<string, unknown> | null;
  return <main className="min-h-screen bg-[#08111f] pb-12 text-slate-100">
    <header className="border-b border-white/10 bg-[#0b1628]"><div className="mx-auto flex min-h-16 max-w-5xl items-center gap-3 px-4 py-3"><FlaskConical className="h-5 w-5 text-amber-300" /><div className="flex-1"><h1 className="font-bold">隔離テスト予想ラボ</h1><p className="text-xs text-slate-400">ダミー馬名で保存し、出走表マスターの本物の馬名で表示</p></div><Link href="/admin/odds-simulation" className="text-xs text-cyan-300">EVテストへ</Link></div></header>
    <section className="mx-auto max-w-5xl space-y-5 px-4 pt-7">
      <div className="flex gap-3 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-50"><FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><div><p className="font-semibold">保存はダミー馬名、表示は出走表マスターの馬名</p><p className="mt-1 text-amber-100/80">予想データは「馬A〜馬F」のまま保存し、画面表示時に馬番で出走表マスターと照合して本物の馬名へ置換します。保存済みデータは書き換えません。{typeof data?.entryMasterCount === "number" ? `（照合済み: ${data.entryMasterCount}頭）` : null}</p></div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5"><div><h2 className="font-semibold">架空テストレースA</h2><p className="mt-1 text-xs text-slate-400">タイムDM・人気・テストオッズから再現可能なテストスコアを計算します。</p></div>{user?.role === "admin" ? <button onClick={() => seed.mutate({ confirmSyntheticOnly: true })} disabled={seed.isPending} className="inline-flex items-center gap-2 rounded bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${seed.isPending ? "animate-spin" : ""}`} />{data ? "テストデータを再生成" : "テストデータを保存して表示"}</button> : <span className="inline-flex items-center gap-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4 text-cyan-300" />閲覧専用</span>}</div>
      {seed.error && <p className="rounded border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">保存エラー: {seed.error.message}</p>}
      {latest.isLoading || !data ? <div className="rounded border border-dashed border-white/15 bg-white/[0.02] p-10 text-center text-sm text-slate-400">ボタンを押すと、馬A〜馬Fの非実在テストデータを隔離テーブルへ保存します。</div> : <>
        <div className="overflow-x-auto border border-white/10 bg-[#0d1b2a]"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-slate-400"><tr><th className="p-3">馬番</th><th className="p-3">馬名</th><th className="p-3">人気</th><th className="p-3">テストオッズ</th><th className="p-3">タイムDM</th><th className="p-3">テストスコア</th></tr></thead><tbody>{data.entries.map((entry) => <tr key={entry.id} className="border-b border-white/5 last:border-0"><td className="p-3 font-semibold">{entry.horseNumber}</td><td className="p-3 font-semibold text-cyan-100">{entry.displayName}{entry.displayName === entry.horseName ? null : <span className="ml-2 text-[10px] font-normal text-slate-500">{entry.horseName}</span>}</td><td className="p-3">{entry.popularity}人気</td><td className="p-3">{entry.odds.toFixed(1)}倍</td><td className="p-3">{entry.timeDm.toFixed(1)}</td><td className="p-3 font-semibold text-amber-200">{entry.score.toFixed(1)}</td></tr>)}</tbody></table></div>
        <div className="grid gap-5 lg:grid-cols-2"><TicketPanel title="スコア順" tickets={scoreTickets} /><TicketPanel title="穴馬軸" tickets={longshotTickets} /></div>
      </>}
    </section>
  </main>;
}

function TicketPanel({ title, tickets }: { title: string; tickets: Record<string, unknown> | null }) {
  return <section className="border border-white/10 bg-[#0d1b2a] p-5"><h2 className="font-semibold">{title}・テストフォーメーション</h2>{!tickets ? <p className="mt-3 text-sm text-slate-400">未生成</p> : <dl className="mt-4 space-y-3 text-sm"><Ticket label="3連単" value={tickets.trifecta} /><Ticket label="3連複" value={tickets.trio} /><Ticket label="馬連" value={tickets.quinella} /><Ticket label="ワイド" value={tickets.wide} /><div className="border-t border-white/10 pt-3 text-xs text-slate-400">テスト点数: 3連単 {String(tickets.trifectaCount ?? 0)} / 3連複 {String(tickets.trioCount ?? 0)} / 馬連 {String(tickets.quinellaCount ?? 0)} / ワイド {String(tickets.wideCount ?? 0)}</div></dl>}</section>;
}

function Ticket({ label, value }: { label: string; value: unknown }) {
  return <div><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 font-medium text-slate-100">{String(value ?? "対象外")}</dd></div>;
}
