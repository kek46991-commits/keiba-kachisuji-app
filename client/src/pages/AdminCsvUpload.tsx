import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { HistoryBackButton } from "@/components/HistoryBackButton";

type CsvType = "raceList" | "horseList" | "payback";
type Organizer = "JRA" | "NAR";
type CsvEncoding = "utf-8" | "shift_jis";

const monthlyTrendChartConfig = {
  imported: { label: "取込済み", color: "#10b981" },
  unimported: { label: "未取込", color: "#f59e0b" },
} satisfies ChartConfig;

const formatMonth = (month: string) => {
  const [year, value] = month.split("-");
  return year && value ? `${year.slice(2)}年${Number(value)}月` : month;
};

export default function AdminCsvUpload() {
  const { user, loading } = useAuth();

  const [csvType, setCsvType] = useState<CsvType>("raceList");
  const [organizer, setOrganizer] = useState<Organizer>("JRA");
  const [encoding, setEncoding] = useState<CsvEncoding>("utf-8");
  const [hasHeader, setHasHeader] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [fileName, setFileName] = useState<string>("");
  const [sourceKey, setSourceKey] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = trpc.csvUpload.getStats.useQuery();
  const resultImportStatus = trpc.csvUpload.getResultImportStatus.useQuery();
  const narResultImportStatus = trpc.csvUpload.getNarResultImportStatus.useQuery();
  const monthlyResultImportTrend = trpc.csvUpload.getMonthlyResultImportTrend.useQuery();
  const unimportedRaceRanking = trpc.csvUpload.getUnimportedRaceRanking.useQuery();
  const todaySettlement = trpc.csvUpload.getTodaySettlementSummary.useQuery();
  const uploadRaceList = trpc.csvUpload.uploadRaceList.useMutation();
  const uploadHorseList = trpc.csvUpload.uploadHorseList.useMutation();
  const uploadPayback = trpc.csvUpload.uploadPayback.useMutation();
  const authorizedSources = trpc.authorizedDataSource.list.useQuery();
  const activeCsvSources = (authorizedSources.data ?? []).filter(source =>
    source.status === "active" && source.deliveryMethod === "csv" && source.organizer === organizer,
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">読み込み中...</div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive font-bold mb-2">アクセス権限がありません</p>
            <p className="text-muted-foreground text-sm">この機能は管理者のみ利用可能です。</p>
            <Link href="/">
              <Button variant="outline" className="mt-4">ホームに戻る</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("ファイルを選択してください");
      return;
    }
    if (!sourceKey) {
      toast.error("許諾済みデータ提供元を選択してください");
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder(encoding).decode(buffer);

      let res: any;
      if (csvType === "raceList") {
        res = await uploadRaceList.mutateAsync({ csvContent: text, hasHeader, organizer, sourceKey, fileName: file.name });
      } else if (csvType === "horseList") {
        res = await uploadHorseList.mutateAsync({ csvContent: text, hasHeader, organizer, sourceKey, fileName: file.name });
      } else {
        res = await uploadPayback.mutateAsync({ csvContent: text, hasHeader, organizer, sourceKey, fileName: file.name });
      }

      setResult(res);
      const [todayResponse] = await Promise.all([
        todaySettlement.refetch(),
        stats.refetch(),
        resultImportStatus.refetch(),
        narResultImportStatus.refetch(),
        monthlyResultImportTrend.refetch(),
        unimportedRaceRanking.refetch(),
      ]);
      const today = todayResponse.data;
      const reconciliation = res.reconciliationSummary;
      if (reconciliation?.settledPredictions > 0) {
        const sign = (value: number) => value >= 0 ? "+" : "";
        toast.success("公式結果を反映しました", {
          description: `今回：的中 ${reconciliation.hitPredictions}件 / 収支 ${sign(reconciliation.profitAmount)}¥${reconciliation.profitAmount.toLocaleString()}　本日：的中 ${today?.hitCount ?? 0}件 / 収支 ${sign(today?.profitAmount ?? 0)}¥${(today?.profitAmount ?? 0).toLocaleString()}`,
          duration: 9000,
        });
      } else {
        toast.success(`${res.inserted || 0}件追加、${res.updated || res.skipped || 0}件更新/スキップ`, {
          description: reconciliation ? `確定 ${reconciliation.confirmedRaces}R / 精算待ち ${reconciliation.pendingPredictions}件` : undefined,
        });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const csvTypeInfo: Record<CsvType, { label: string; description: string; format: string }> = {
    raceList: {
      label: "レース一覧",
      description: "racelist.csv — 競馬場,競走年月日,レース番号,発走時刻,競走種類名称,レース名,芝ダート区分,回り,距離,...",
      format: "競馬場,競走年月日,レース番号,発走時刻,競走種類名称,レース名,芝ダート区分,回り,距離,天候,馬場,頭数,条件,賞金",
    },
    horseList: {
      label: "出馬表",
      description: "horselist.csv — 競馬場,競走年月日,レース番号,枠番,馬番,馬名,性,齢,...,騎手名,...,着順,タイム,...",
      format: "競馬場,競走年月日,レース番号,枠番,馬番,馬名,性,齢,毛色,生年月日,父馬名,母馬名,母父馬名,騎手名,...",
    },
    payback: {
      label: "払戻金",
      description: "payback.csv — 競馬場,競走年月日,レース番号,賭式,組番,払戻金,人気",
      format: "競馬場,競走年月日,レース番号,賭式,組番,払戻金,人気",
    },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="border-b border-border bg-card">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <HistoryBackButton className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">← 戻る</HistoryBackButton>
            <div>
              <h1 className="text-xl font-bold text-foreground">公式CSVデータ取り込み</h1>
              <p className="text-sm text-muted-foreground">JRA・NARの正規CSVを検証して予想へ反映</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* DB統計 */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-cyan-400">{stats.data?.races || 0}</p>
              <p className="text-xs text-muted-foreground">レース数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{stats.data?.entries || 0}</p>
              <p className="text-xs text-muted-foreground">出走馬数</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{stats.data?.payouts || 0}</p>
              <p className="text-xs text-muted-foreground">払戻データ</p>
            </CardContent>
          </Card>
        </div>

        <Card className={resultImportStatus.data?.pastUnconfirmed ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/25 bg-emerald-500/5"}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">過去レースの公式結果反映</p>
                <p className="mt-1 text-xs text-muted-foreground">結果CSVの「出馬表（着順）」と「払戻金」を順に取り込むと、AI予想の的中・回収額を自動精算します。</p>
              </div>
              <span className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${resultImportStatus.data?.pastUnconfirmed ? "bg-amber-500/15 text-amber-600 dark:text-amber-200" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-200"}`}>
                {resultImportStatus.data?.pastUnconfirmed ? `未取込 ${resultImportStatus.data.pastUnconfirmed}件` : "反映待ちなし"}
              </span>
            </div>
            {resultImportStatus.data?.latestConfirmed && <p className="text-xs text-muted-foreground">直近確定: {resultImportStatus.data.latestConfirmed.raceDate} {resultImportStatus.data.latestConfirmed.venueName} {resultImportStatus.data.latestConfirmed.raceNumber}R</p>}
          </CardContent>
        </Card>

        <Card className={narResultImportStatus.data?.pastUnconfirmed ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/25 bg-emerald-500/5"}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">地方競馬の公式結果取込状況</p>
                <p className="mt-1 text-xs text-muted-foreground">地方競馬は、同一開催日の「着順入り出馬表」→「払戻金」の順にNARを選択して取り込んでください。両方が揃ったレースだけを確定・精算します。</p>
              </div>
              <span className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${narResultImportStatus.data?.pastUnconfirmed ? "bg-amber-500/15 text-amber-600 dark:text-amber-200" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-200"}`}>
                {narResultImportStatus.data?.pastUnconfirmed ? `未取込 ${narResultImportStatus.data.pastUnconfirmed}R` : "反映待ちなし"}
              </span>
            </div>
            {narResultImportStatus.data?.byVenue && narResultImportStatus.data.byVenue.length > 0 && <div className="grid gap-1.5 sm:grid-cols-2">
              {narResultImportStatus.data.byVenue.map(item => <div key={`${item.raceDate}-${item.venueName}`} className="flex items-center justify-between rounded bg-background/60 px-2.5 py-2 text-xs">
                <span className="text-muted-foreground">{item.raceDate}　{item.venueName}</span>
                <span className="font-semibold text-amber-600 dark:text-amber-200">{item.raceCount}R</span>
              </div>)}
            </div>}
            <p className="text-[11px] text-muted-foreground">未取込の結果・払戻・的中・回収額は推測しません。公式CSVを取り込むまで、対象レースは未精算として保持されます。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">月別の公式結果取込推移</CardTitle>
            <CardDescription>発走日が本日より前のレースを対象に、公式結果まで確定した件数と未取込件数を月別に比較します。</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyResultImportTrend.isLoading ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">月別取込状況を集計中です…</div>
            ) : (monthlyResultImportTrend.data?.months.length ?? 0) > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-emerald-500/10 p-3"><p className="text-lg font-bold text-emerald-600 dark:text-emerald-300">{monthlyResultImportTrend.data?.months.reduce((total, item) => total + item.imported, 0) ?? 0}R</p><p className="text-xs text-muted-foreground">取込済み</p></div>
                  <div className="rounded-lg bg-amber-500/10 p-3"><p className="text-lg font-bold text-amber-600 dark:text-amber-200">{monthlyResultImportTrend.data?.months.reduce((total, item) => total + item.unimported, 0) ?? 0}R</p><p className="text-xs text-muted-foreground">未取込</p></div>
                  <div className="rounded-lg bg-cyan-500/10 p-3"><p className="text-lg font-bold text-cyan-600 dark:text-cyan-300">{monthlyResultImportTrend.data?.months.reduce((total, item) => total + item.jraImported, 0) ?? 0}R</p><p className="text-xs text-muted-foreground">JRA取込済み</p></div>
                  <div className="rounded-lg bg-violet-500/10 p-3"><p className="text-lg font-bold text-violet-600 dark:text-violet-300">{monthlyResultImportTrend.data?.months.reduce((total, item) => total + item.narImported, 0) ?? 0}R</p><p className="text-xs text-muted-foreground">NAR取込済み</p></div>
                </div>
                <ChartContainer config={monthlyTrendChartConfig} className="mt-5 h-[250px] w-full">
                  <BarChart data={monthlyResultImportTrend.data?.months} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.55} />
                    <XAxis dataKey="month" tickFormatter={formatMonth} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent labelFormatter={formatMonth} formatter={(value, name) => <span>{name}: {Number(value).toLocaleString("ja-JP")}R</span>} />} />
                    <Bar dataKey="imported" name="取込済み" fill="var(--color-imported)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="unimported" name="未取込" fill="var(--color-unimported)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
                <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[660px] text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground"><tr><th className="px-3 py-2.5">月</th><th className="px-3 py-2.5">取込済み</th><th className="px-3 py-2.5">未取込</th><th className="px-3 py-2.5">JRA（済／未）</th><th className="px-3 py-2.5">NAR（済／未）</th></tr></thead>
                    <tbody>{monthlyResultImportTrend.data?.months.map(item => <tr key={item.month} className="border-t border-border"><td className="px-3 py-2.5 font-medium">{formatMonth(item.month)}</td><td className="px-3 py-2.5 font-semibold text-emerald-600 dark:text-emerald-300">{item.imported}R</td><td className="px-3 py-2.5 font-semibold text-amber-600 dark:text-amber-200">{item.unimported}R</td><td className="px-3 py-2.5">{item.jraImported}R ／ {item.jraUnimported}R</td><td className="px-3 py-2.5">{item.narImported}R ／ {item.narUnimported}R</td></tr>)}</tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">「取込済み」は、着順と払戻を公式CSVで照合して結果確定したレースです。未取込の結果・払戻・成績は推測せず、未精算のまま集計します。</p>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border py-10 text-center"><p className="text-sm font-medium">過去レースの集計対象がありません</p><p className="mt-1 text-xs text-muted-foreground">公式結果CSVを取り込むと、月別の件数推移がここに表示されます。</p></div>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">主催者別・未取込ランキング</CardTitle>
              <CardDescription>未取込レースが多い主催者を優先順に表示します。</CardDescription>
            </CardHeader>
            <CardContent>
              {unimportedRaceRanking.isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">未取込状況を集計中です…</p>
              ) : (unimportedRaceRanking.data?.organizerRanking.length ?? 0) > 0 ? (
                <div className="space-y-2.5">{unimportedRaceRanking.data?.organizerRanking.map((item, index) => {
                  const maxCount = unimportedRaceRanking.data?.organizerRanking[0]?.raceCount ?? 1;
                  return <div key={item.organizer} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${index === 0 ? "bg-amber-500/20 text-amber-700 dark:text-amber-200" : "bg-muted text-muted-foreground"}`}>{index + 1}</span><span className="text-sm font-semibold">{item.organizer}</span></div><span className="text-sm font-bold text-amber-600 dark:text-amber-200">{item.raceCount}R</span></div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(8, (item.raceCount / maxCount) * 100)}%` }} /></div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">最古の未取込: {item.oldestRaceDate}</p>
                  </div>;
                })}</div>
              ) : (
                <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">未取込の過去レースはありません。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">会場別・未取込ランキング</CardTitle>
              <CardDescription>上位10会場を表示します。件数と最古の未取込日で対応の優先度を判断できます。</CardDescription>
            </CardHeader>
            <CardContent>
              {unimportedRaceRanking.isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">未取込状況を集計中です…</p>
              ) : (unimportedRaceRanking.data?.venueRanking.length ?? 0) > 0 ? (
                <ol className="space-y-2">{unimportedRaceRanking.data?.venueRanking.slice(0, 10).map((item, index) => {
                  const maxCount = unimportedRaceRanking.data?.venueRanking[0]?.raceCount ?? 1;
                  return <li key={`${item.organizer}-${item.venueName}`} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${index === 0 ? "bg-rose-500/20 text-rose-700 dark:text-rose-200" : "bg-muted text-muted-foreground"}`}>{index + 1}</span><span className="truncate text-sm font-semibold">{item.venueName}</span><span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{item.organizer}</span></div><span className="shrink-0 text-sm font-bold text-amber-600 dark:text-amber-200">{item.raceCount}R</span></div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(8, (item.raceCount / maxCount) * 100)}%` }} /></div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">最古: {item.oldestRaceDate}　最新: {item.latestRaceDate}</p>
                  </li>;
                })}</ol>
              ) : (
                <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">未取込の過去レースはありません。</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 主催者選択 */}
        <Card>
          <CardHeader><CardTitle className="text-base">1. 主催者を選択</CardTitle><CardDescription>取り込む公式CSVの主催者を指定してください。</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {(["JRA", "NAR"] as Organizer[]).map(value => <button key={value} onClick={() => setOrganizer(value)} className={`rounded-lg border p-3 text-left ${organizer === value ? "border-cyan-500 bg-cyan-500/10" : "border-border"}`}><p className="font-medium">{value === "JRA" ? "JRA（中央競馬）" : "NAR（地方競馬）"}</p><p className="mt-1 text-xs text-muted-foreground">{value === "JRA" ? "公式エクスポートCSV" : "地方競馬の公式CSV"}</p></button>)}
          </CardContent>
        </Card>

        {/* CSVタイプ選択 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. データ種類を選択</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(csvTypeInfo) as CsvType[]).map(type => (
              <button
                key={type}
                onClick={() => setCsvType(type)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  csvType === type
                    ? "border-cyan-500 bg-cyan-500/10"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <p className={`font-medium ${csvType === type ? "text-cyan-400" : "text-foreground"}`}>
                  {csvTypeInfo[type].label}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{csvTypeInfo[type].description}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* 許諾済みデータ提供元の選択 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. 許諾済みデータ提供元を選択</CardTitle>
            <CardDescription>契約・許諾根拠を登録済みで、有効化されたCSV提供元のみ取り込めます。閲覧ページ、アプリ画面、個人契約データは選択できません。</CardDescription>
          </CardHeader>
          <CardContent>
            <select
              value={sourceKey}
              onChange={event => setSourceKey(event.target.value)}
              disabled={authorizedSources.isLoading || activeCsvSources.length === 0}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">{authorizedSources.isLoading ? "提供元を読み込み中…" : activeCsvSources.length === 0 ? `${organizer}の有効な契約CSV提供元がありません` : "提供元を選択してください"}</option>
              {activeCsvSources.map(source => (
                <option key={source.sourceKey} value={source.sourceKey}>{source.providerName}（{source.sourceKey}）</option>
              ))}
            </select>
            {sourceKey && <p className="mt-2 text-xs text-muted-foreground">取込時にファイル名・SHA-256・行数・実行結果を監査記録へ保存します。</p>}
          </CardContent>
        </Card>

        {/* ファイル選択 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. CSVファイルを選択</CardTitle>
            <CardDescription>
              {organizer}の正規CSVを選択してください。{organizer === "NAR" && csvType === "payback" ? "払戻金は、同じ開催日の着順入り出馬表を取り込んだ後に実行してください。" : "レース一覧→出馬表の順に取り込むと、予想ページで直ちに利用できます。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={e => setHasHeader(e.target.checked)}
                  className="rounded"
                />
                1行目はヘッダー行
              </label>
            </div>

            <label className="block text-sm">
              <span className="text-muted-foreground">文字コード</span>
              <select value={encoding} onChange={event => setEncoding(event.target.value as CsvEncoding)} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option value="utf-8">UTF-8</option>
                <option value="shift_jis">Shift-JIS（文字化けする場合）</option>
              </select>
            </label>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileSelect}
                className="hidden"
                id="csv-file-input"
              />
              <label
                htmlFor="csv-file-input"
                className="flex items-center justify-center w-full h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-cyan-500/50 transition-colors"
              >
                <div className="text-center">
                  {fileName ? (
                    <>
                      <p className="text-sm font-medium text-foreground">{fileName}</p>
                      <p className="text-xs text-muted-foreground mt-1">タップして変更</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">タップしてCSVファイルを選択</p>
                      <p className="text-xs text-muted-foreground mt-1">.csv または .txt</p>
                    </>
                  )}
                </div>
              </label>
            </div>

            <Button
              onClick={handleUpload}
              disabled={uploading || !fileName || !sourceKey}
              className="w-full"
            >
              {uploading ? "アップロード中..." : "アップロード実行"}
            </Button>
          </CardContent>
        </Card>

        {/* 結果表示 */}
        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">アップロード結果</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-emerald-500/10 rounded-lg text-center">
                  <p className="text-lg font-bold text-emerald-400">{result.inserted || 0}</p>
                  <p className="text-xs text-muted-foreground">新規追加</p>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-lg text-center">
                  <p className="text-lg font-bold text-amber-400">{result.updated || result.skipped || 0}</p>
                  <p className="text-xs text-muted-foreground">更新/スキップ</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">処理行数: {result.totalRows}行</p>
              {result.reconciliationSummary && <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-800 dark:text-cyan-100">
                <p className="font-semibold">公式結果の精算結果</p>
                <p className="mt-1">確定レース {result.reconciliationSummary.confirmedRaces}件 / 更新した予想 {result.reconciliationSummary.settledPredictions}件 / 精算待ち {result.reconciliationSummary.pendingPredictions}件</p>
                {(result.reconciliationSummary.pendingEntryRaces > 0 || result.reconciliationSummary.pendingPayoutRaces > 0) && <p className="mt-1 text-muted-foreground">着順待ち {result.reconciliationSummary.pendingEntryRaces}件、払戻待ち {result.reconciliationSummary.pendingPayoutRaces}件です。</p>}
              </div>}
              {(csvType === "raceList" || csvType === "horseList") && <div className="rounded-lg bg-cyan-500/5 p-3 text-xs text-cyan-700 dark:text-cyan-200">{csvType === "raceList" ? "続けて同じ主催者の出馬表CSVを取り込むと、予想可能な状態になります。" : "出馬表を反映しました。予想ページでこのレースを選択して予想を実行できます。"}</div>}
              {csvType === "horseList" && <div className="rounded-lg bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-100">終了レースの結果を反映する場合は、着順入りの出馬表CSVを取り込んだ後に、同じ主催者・同じ開催日の払戻金CSVを取り込んでください。両方揃うと的中判定・回収額が自動更新されます。</div>}
              {csvType === "horseList" && (result.inserted > 0 || result.updated > 0) && <Link href={organizer === "JRA" ? "/predictions" : "/nar-predictions"}><Button className="w-full">{organizer}予想画面を開く</Button></Link>}

              {result.errors && result.errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-destructive mb-2">エラー ({result.errors.length}件)</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {result.errors.map((err: string, i: number) => (
                      <p key={i} className="text-xs text-destructive/80 bg-destructive/5 p-2 rounded">{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* フォーマット説明 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">CSVフォーマット仕様</CardTitle>
            <CardDescription>keiba.go.jp公式データダウンロード形式に準拠</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 p-3 rounded-lg">
              <p className="text-xs font-mono text-muted-foreground break-all">
                {csvTypeInfo[csvType].format}
              </p>
            </div>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              <p>• 文字コード: UTF-8 または Shift-JIS</p>
              <p>• 区切り文字: カンマ（,）</p>
              <p>• 日付形式: YYYY/MM/DD または YYYY-MM-DD</p>
              <p>• 空のフィールドは自動スキップされます</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
