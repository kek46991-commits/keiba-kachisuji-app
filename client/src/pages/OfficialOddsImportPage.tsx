import { ChangeEvent, useRef, useState } from "react";
import { Link } from "wouter";
import { FileUp, ShieldCheck, Database, ArrowLeft, AlertCircle, CheckCircle2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { HistoryBackButton } from "@/components/HistoryBackButton";

export default function OfficialOddsImportPage() {
  const { user, loading } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [raceId, setRaceId] = useState("");
  const [importKind, setImportKind] = useState<"win" | "combination">("win");
  const [result, setResult] = useState<{ kind: "win" | "combination"; imported: number; verifiedRows: number; latestSavedAt: Date | null; minutesToStart: number | null; organizer: "JRA" | "NAR"; signals?: Array<{ horseNumber: number; changePct: number; bonusScore: number }> } | null>(null);
  const importOdds = trpc.jraVanUpload.importOddsFile.useMutation();
  const importCombinationOdds = trpc.jraVanUpload.importCombinationOddsFile.useMutation();

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("ファイルサイズは2MB以下にしてください。");
      return;
    }
    const selectedFormat = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
    setFormat(selectedFormat);
    setFileName(file.name);
    setContent(await file.text());
    setResult(null);
    event.target.value = "";
  };

  const handleImport = async () => {
    if (!content) return toast.error("公式オッズCSVまたはJSONを選択してください。");
    try {
      const payload = { content, format, fileName, ...(raceId.trim() ? { fallbackRaceId: raceId.trim() } : {}) };
      if (importKind === "combination") {
        const response = await importCombinationOdds.mutateAsync(payload);
        setResult({ kind: "combination", imported: response.imported, verifiedRows: response.verifiedRows, latestSavedAt: response.latestSavedAt, minutesToStart: response.minutesToStart, organizer: response.organizer });
        toast.success(`${response.imported}点の公式組合せオッズをDBへ反映しました。`);
      } else {
        const response = await importOdds.mutateAsync(payload);
        setResult({ kind: "win", imported: response.updated, verifiedRows: response.verifiedRows, latestSavedAt: response.latestSavedAt, minutesToStart: response.minutesToStart, organizer: response.organizer, signals: response.signals });
        toast.success(`${response.updated}頭の公式オッズをDBへ反映しました。`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取込に失敗しました。");
    }
  };

  if (loading) return <div className="min-h-screen bg-[#08111f] text-slate-300 grid place-items-center">読み込み中...</div>;
  if (!user || user.role !== "admin") {
    return <div className="min-h-screen bg-[#08111f] text-slate-300 grid place-items-center p-6"><div className="text-center"><ShieldCheck className="mx-auto mb-3 text-amber-400" /><p>この画面は管理者専用です。</p><Link href="/" className="text-cyan-300 text-sm mt-3 inline-block">ホームへ戻る</Link></div></div>;
  }

  return <main className="min-h-screen bg-[#08111f] text-slate-100 pb-12">
    <header className="border-b border-white/10 bg-[#0b1628] sticky top-0 z-10"><div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3"><HistoryBackButton aria-label="前の画面へ戻る" className="p-2 rounded bg-white/5"><ArrowLeft className="w-4 h-4" /></HistoryBackButton><div className="flex-1"><h1 className="font-bold">公開許諾済みオッズ取込</h1><p className="text-xs text-slate-400">公開表示が契約で許可された提供元のファイルだけをDBへ反映</p></div><Link href="/admin/odds-simulation" className="inline-flex items-center gap-1 text-xs text-amber-200"><FlaskConical className="w-3.5 h-3.5" />テスト検証</Link><Link href="/admin/csv-upload" className="text-xs text-cyan-300">レース・出馬表CSV</Link><Link href="/admin/odds-history" className="text-xs text-cyan-300">推移・履歴</Link></div></header>
    <section className="max-w-3xl mx-auto px-4 pt-8 space-y-5">
      <div className="border border-cyan-400/20 bg-cyan-400/5 p-4 rounded-lg flex gap-3"><ShieldCheck className="text-cyan-300 shrink-0" /><div className="text-sm text-slate-300"><p className="font-medium text-cyan-100">公開利用が許諾されたデータファイルだけを反映</p><p className="mt-1 text-slate-400">公開表示・保存・派生計算を契約で許可された提供元のCSVまたはJSONだけをDBへ保存します。アプリ画面、ID・パスワード、未認可サイト、個人分析用のData Lab./TARGETファイルには接続・取込を行いません。</p></div></div>
      <div className="border border-rose-300/25 bg-rose-300/5 p-4 rounded-lg text-sm text-slate-300"><p className="font-medium text-rose-100">TARGET/Data Lab.の個人分析CSVは取込不可</p><p className="mt-1 text-slate-400">TARGETで出力したオッズ・時系列オッズCSVは、契約者本人のPC上での分析に限定してください。公開サイトへ表示されるDBへの取込はサーバー側でも拒否します。</p></div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]"><div className="rounded border border-white/10 bg-white/[0.03] p-2 text-slate-300">1. 公式CSVを選択</div><div className="rounded border border-white/10 bg-white/[0.03] p-2 text-slate-300">2. 検証してDB反映</div><div className="rounded border border-cyan-400/20 bg-cyan-400/5 p-2 text-cyan-100">3. 買い目判定へ反映</div></div>
      <div className="border border-white/10 bg-[#0d1b2a] p-5 rounded-lg space-y-4"><div className="grid grid-cols-2 gap-2"><button onClick={() => { setImportKind("win"); setResult(null); }} className="rounded px-3 py-2 text-sm font-medium" style={{ backgroundColor: importKind === "win" ? "rgba(34,211,238,0.16)" : "rgba(255,255,255,0.03)", color: importKind === "win" ? "#a5f3fc" : "#94a3b8", border: `1px solid ${importKind === "win" ? "rgba(34,211,238,0.35)" : "rgba(255,255,255,0.08)"}` }}>単勝・複勝オッズ</button><button onClick={() => { setImportKind("combination"); setResult(null); }} className="rounded px-3 py-2 text-sm font-medium" style={{ backgroundColor: importKind === "combination" ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.03)", color: importKind === "combination" ? "#fde68a" : "#94a3b8", border: `1px solid ${importKind === "combination" ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.08)"}` }}>3連単・3連複 組合せオッズ</button></div><div><label className="text-sm font-medium">対象レースID（CSV内にレースIDがない場合のみ）</label><input value={raceId} onChange={event => setRaceId(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="例: 202608120501" className="mt-2 w-full rounded bg-[#08111f] border border-white/10 px-3 py-2 text-sm" /></div><input ref={inputRef} type="file" accept=".csv,.json,.txt,application/json,text/csv" className="hidden" onChange={handleFile} id="official-odds-file" /><label htmlFor="official-odds-file" className="h-36 border-2 border-dashed border-cyan-400/25 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-cyan-400/5"><FileUp className="text-cyan-300 mb-2" /><p className="text-sm">{fileName || `タップして${importKind === "combination" ? "公式組合せオッズ" : "公式オッズ"}CSV / JSONを選択`}</p><p className="text-xs text-slate-500 mt-1">最大2MB・スマートフォン対応</p></label><button onClick={handleImport} disabled={!content || importOdds.isPending || importCombinationOdds.isPending} className="w-full py-3 bg-cyan-400 text-[#08111f] rounded font-bold disabled:opacity-40">{importOdds.isPending || importCombinationOdds.isPending ? "検証・DB反映中..." : "検証してDBへ反映"}</button></div>
      <div className="border border-white/10 bg-[#0d1b2a] p-5 rounded-lg text-sm"><div className="flex gap-2 items-center font-medium"><Database className="w-4 h-4 text-amber-300" />CSV必須列</div>{importKind === "combination" ? <><p className="mt-2 text-slate-400 font-mono text-xs break-words">レースID, 券種, 組合せ, 組合せオッズ</p><p className="mt-1 text-slate-500 text-xs">券種は3連単または3連複のみです。英字列名（race_id, bet_type, combination, odds）にも対応します。取込後、買い目ごとの最低想定払戻とトリガミ判定へ利用します。</p></> : <><p className="mt-2 text-slate-400 font-mono text-xs break-words">レースID, 馬番, 単勝オッズ</p><p className="mt-1 text-slate-500 text-xs">任意列: 馬名, 複勝オッズ下限, 複勝オッズ上限, 人気。英字列名（race_id, horse_number, win_odds）にも対応します。提供元との公開利用契約で許可された形式だけを選択してください。</p></>}</div>
      {result && <div className="border border-emerald-400/25 bg-emerald-400/5 p-5 rounded-lg"><div className="flex gap-2 items-center text-emerald-200 font-semibold"><CheckCircle2 className="w-5 h-5" />DB反映を確認しました</div><p className="mt-2 text-xs text-slate-300">{result.organizer}公式{result.kind === "combination" ? "組合せオッズ" : "オッズ"}を保存。{result.minutesToStart !== null && result.minutesToStart > 0 ? `発走まで約${result.minutesToStart}分` : "発走時刻の確認待ち"}です。</p><div className="grid grid-cols-2 gap-3 mt-4"><div className="bg-black/20 p-3 rounded"><p className="text-xl font-bold">{result.imported}</p><p className="text-xs text-slate-400">{result.kind === "combination" ? "保存した組合せ" : "更新した出走馬"}</p></div><div className="bg-black/20 p-3 rounded"><p className="text-xl font-bold">{result.verifiedRows}</p><p className="text-xs text-slate-400">SELECT検証済み行</p></div></div>{result.kind === "win" && result.minutesToStart !== null && result.minutesToStart <= 10 && result.minutesToStart > 0 && <p className="mt-3 text-xs text-cyan-100"><Database className="inline w-3.5 h-3.5 mr-1" />発走10分前の監視帯です。保存済みの公式オッズを1分ごとに履歴化します。</p>}{result.kind === "win" && (result.signals?.length ?? 0) > 0 && <p className="mt-3 text-xs text-amber-200"><AlertCircle className="inline w-3.5 h-3.5 mr-1" />市場急変シグナルを{result.signals?.length}件記録しました。</p>}{result.kind === "combination" && <p className="mt-3 text-xs text-emerald-100">公式組合せオッズを照合可能な買い目では、予想画面に最低想定払戻・損益分岐倍率・トリガミ状態を表示します。</p>}</div>}
    </section>
  </main>;
}
