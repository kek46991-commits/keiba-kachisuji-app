import { trpc } from "@/lib/trpc";
import Navbar from "@/components/Navbar";
import { useSearch } from "wouter";
import { useMemo } from "react";
import { Trophy, ArrowLeft, BadgeCheck, CircleDollarSign, FileClock, ListChecks } from "lucide-react";
import { HistoryBackButton } from "@/components/HistoryBackButton";
import { formatBetSelectionForDisplay } from "@shared/formationDisplay";

export default function RaceResultPage() {
  const searchStr = useSearch();
  const params = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const date = params.get("date") || "";
  const venue = params.get("venue") || "";
  const raceNum = parseInt(params.get("race") || "0", 10);
  const raceId = params.get("raceId") || "";

  // racesテーブルからraceIdを特定するため、日付のレース一覧を取得
  const { data: races, isLoading: racesLoading } = trpc.raceData.getByDate.useQuery(
    { date },
    { enabled: !!date && !raceId }
  );

  // 該当レースを特定
  const targetRace = useMemo(() => {
    if (raceId) return { raceId, venueName: venue, raceNumber: raceNum };
    if (!races) return null;
    return races.find(r => r.venueName === venue && r.raceNumber === raceNum) || null;
  }, [races, raceId, venue, raceNum]);

  // レース詳細（出走馬・配当）を取得
  const { data: detail, isLoading: detailLoading } = trpc.raceData.getDetail.useQuery(
    { raceId: targetRace?.raceId || "" },
    { enabled: !!targetRace?.raceId }
  );

  const isLoading = (!raceId && racesLoading) || detailLoading;

  const betTypeLabel: Record<string, string> = {
    win: "単勝",
    place: "複勝",
    quinella: "馬連",
    exacta: "馬単",
    wide: "ワイド",
    trio: "3連複",
    trifecta: "3連単",
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A1128" }}>
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12 max-w-3xl">
        {/* 戻るボタン */}
        <HistoryBackButton
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors"
          style={{ color: "#94a3b8" }}
        >
          <ArrowLeft className="w-4 h-4" />
          戻る
        </HistoryBackButton>

        {/* ヘッダー */}
        <div className="mb-6">
          <h1 className="text-xl font-bold mb-1" style={{ color: "#ffffff" }}>
            {detail?.race?.venueName ?? venue} {detail?.race?.raceNumber ?? raceNum}R{detail?.race?.raceName && detail.race.raceName !== `${detail.race.raceNumber}R` ? ` ${detail.race.raceName}` : ""}
          </h1>
          <p className="text-sm" style={{ color: "#94a3b8" }}>
            {detail?.race?.raceDate ?? date}{detail?.race?.postTime ? ` 発走 ${detail.race.postTime}` : ""}
            {detail?.race?.surface ? ` / ${detail.race.surface === "turf" ? "芝" : detail.race.surface === "dirt" ? "ダート" : "障害"}` : ""}
            {detail?.race?.distance ? ` ${detail.race.distance}m` : ""}
            {detail?.race?.trackCondition && ` / ${
              detail.race.trackCondition === "good" ? "良" :
              detail.race.trackCondition === "slightly_heavy" ? "稍重" :
              detail.race.trackCondition === "heavy" ? "重" : "不良"
            }`}
          </p>
          {detail?.race?.grade && (
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded border bg-red-500/20 text-red-300 border-red-500/40">
              {detail.race.grade}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="text-center py-12" style={{ color: "#64748b" }}>読み込み中...</div>
        )}

        {!isLoading && !detail && (
          <div className="text-center py-12" style={{ color: "#64748b" }}>
            レース結果データが見つかりません
          </div>
        )}

        {detail && (
          <>
            {detail.race.status !== "results_confirmed" && (
              <div className="mb-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm" style={{ color: "#f4d58b" }}>
                <p className="font-bold">{detail.raceActionStatus === "missing_result" ? "過去レースの公式結果は未取込です" : "公式結果を確認中です"}</p>
                <p className="mt-1 text-xs" style={{ color: "#b9a474" }}>{detail.raceActionStatus === "missing_result" ? "着順入り出馬表と払戻金の公式CSVが揃った時点で、的中・回収額を自動精算します。" : "発走後の公式結果が確定・取込されると、着順・払戻・的中率を自動更新します。"} 未取得の結果を推測して表示することはありません。</p>
              </div>
            )}
            {/* 着順テーブル */}
            <div className="rounded-xl overflow-hidden mb-6" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: "rgba(201,168,76,0.1)" }}>
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-bold" style={{ color: "#c9a84c" }}>{detail.race.status === "results_confirmed" ? "レース結果" : detail.raceActionStatus === "missing_result" ? "出走馬・公式結果未取込" : "出走馬・結果待ち"}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]" style={{ color: "#e2e8f0" }}>
                  <thead>
                    <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <th className="px-2 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>着</th>
                      <th className="px-2 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>枠</th>
                      <th className="px-2 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>馬番</th>
                      <th className="px-2 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>馬名</th>
                      <th className="px-2 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>騎手</th>
                      <th className="px-2 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>オッズ</th>
                      <th className="px-2 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>人気</th>
                      <th className="px-2 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>タイム</th>
                      <th className="px-2 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>着差</th>
                      <th className="px-2 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>上3F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.entries
                      .sort((a, b) => (a.finishPosition || 99) - (b.finishPosition || 99))
                      .map((entry, idx) => {
                        const isTop3 = (entry.finishPosition || 0) <= 3;
                        return (
                          <tr
                            key={entry.id}
                            style={{
                              backgroundColor: isTop3 ? "rgba(201,168,76,0.05)" : idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                              borderBottom: "1px solid rgba(255,255,255,0.04)",
                            }}
                          >
                            <td className="px-2 py-1.5 font-bold" style={{ color: isTop3 ? "#c9a84c" : "#e2e8f0" }}>
                              {entry.finishPosition || "—"}
                            </td>
                            <td className="px-2 py-1.5">{entry.gateNumber || "—"}</td>
                            <td className="px-2 py-1.5">{entry.horseNumber}</td>
                            <td className="px-2 py-1.5 font-medium max-w-[120px] truncate">{entry.horseName}</td>
                            <td className="px-2 py-1.5 max-w-[80px] truncate" style={{ color: "#94a3b8" }}>{entry.jockey || "—"}</td>
                            <td className="px-2 py-1.5 text-right">{entry.odds ? entry.odds.toFixed(1) : "—"}</td>
                            <td className="px-2 py-1.5 text-right">{entry.popularity || "—"}</td>
                            <td className="px-2 py-1.5 text-right font-mono">
                              {entry.finishTime && entry.finishTime > 0 ? formatTime(entry.finishTime) : "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right" style={{ color: "#94a3b8" }}>{entry.margin || "—"}</td>
                            <td className="px-2 py-1.5 text-right">{entry.last3f ? entry.last3f.toFixed(1) : "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 配当金テーブル */}
            {detail.payouts && detail.payouts.length > 0 && (
              <div className="rounded-xl overflow-hidden mb-6" style={{ border: "1px solid rgba(201,168,76,0.2)" }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: "rgba(201,168,76,0.08)" }}>
                  <span className="text-sm font-bold" style={{ color: "#c9a84c" }}>💰 払戻金</span>
                  <span className="text-[10px]" style={{ color: "#94a3b8" }}>100円あたり</span>
                </div>
                {/* ハイライト：最高配当 */}
                {(() => {
                  const maxPayout = Math.max(...detail.payouts.map(p => p.payout));
                  const maxPayoutItem = detail.payouts.find(p => p.payout === maxPayout);
                  return maxPayoutItem && maxPayout >= 1000 ? (
                    <div className="px-4 py-3 text-center" style={{ backgroundColor: "rgba(201,168,76,0.04)", borderBottom: "1px solid rgba(201,168,76,0.1)" }}>
                      <div className="text-[10px] mb-1" style={{ color: "#94a3b8" }}>最高配当（{betTypeLabel[maxPayoutItem.betType] || maxPayoutItem.betType}）</div>
                      <div className="text-2xl font-black" style={{ color: "#c9a84c", fontFamily: "'Space Grotesk', sans-serif" }}>
                        ¥{maxPayout.toLocaleString()}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                        {maxPayoutItem.combination} {maxPayoutItem.popularity ? `(${maxPayoutItem.popularity}番人気)` : ""}
                      </div>
                    </div>
                  ) : null;
                })()}
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]" style={{ color: "#e2e8f0" }}>
                    <thead>
                      <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>券種</th>
                        <th className="px-3 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>組み合わせ</th>
                        <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>払戻金</th>
                        <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>人気</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.payouts
                        .sort((a, b) => {
                          const order = ["win", "place", "quinella", "exacta", "wide", "trio", "trifecta"];
                          return order.indexOf(a.betType) - order.indexOf(b.betType);
                        })
                        .map((p, idx) => {
                          const isHighPayout = p.payout >= 10000;
                          return (
                            <tr
                              key={p.id}
                              style={{
                                backgroundColor: isHighPayout ? "rgba(201,168,76,0.05)" : idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                                borderBottom: "1px solid rgba(255,255,255,0.04)",
                              }}
                            >
                              <td className="px-3 py-2 font-medium">{betTypeLabel[p.betType] || p.betType}</td>
                              <td className="px-3 py-2 font-mono">{p.combination}</td>
                              <td className="px-3 py-2 text-right font-bold" style={{ color: isHighPayout ? "#f59e0b" : "#c9a84c", fontSize: isHighPayout ? "13px" : "11px" }}>
                                ¥{p.payout.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right">{p.popularity ? `${p.popularity}番人気` : "—"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* AI予想結果（もしあれば） */}
            {detail.prediction && (
              <div className="rounded-xl overflow-hidden mb-6" style={{ border: `1px solid ${detail.prediction.isHit === true ? "rgba(16,185,129,0.3)" : detail.prediction.isHit === false ? "rgba(244,63,94,0.25)" : "rgba(0,229,255,0.15)"}` }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: detail.prediction.isHit === true ? "rgba(16,185,129,0.08)" : detail.prediction.isHit === false ? "rgba(244,63,94,0.06)" : "rgba(0,229,255,0.03)" }}>
                  <span className="text-sm font-bold" style={{ color: detail.prediction.isHit === true ? "#10b981" : detail.prediction.isHit === false ? "#fb7185" : "#00e5ff" }}>
                    {detail.prediction.isHit === true ? "AI予想的中" : detail.prediction.isHit === false ? "AI予想不的中" : "AI予想結果"}
                  </span>
                  {detail.prediction.isHit === null && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "#94a3b8" }}>
                      {detail.race.status === "results_confirmed" ? "買い目未精算" : detail.raceActionStatus === "missing_result" ? "公式結果未取込" : "結果待ち"}
                    </span>
                  )}
                </div>
                <div className="px-4 py-3">
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center p-2 rounded" style={{ backgroundColor: "rgba(255,165,0,0.08)" }}>
                      <div className="text-[9px]" style={{ color: "#94a3b8" }}>◎本命</div>
                      <div className="text-sm font-bold" style={{ color: "#ffa500" }}>{detail.prediction.honmei}番</div>
                      <div className="text-[10px] mt-1" style={{ color: "#94a3b8" }}>実着順：{detail.entries.find(entry => entry.horseNumber === detail.prediction.honmei)?.finishPosition ?? "—"}着</div>
                    </div>
                    <div className="text-center p-2 rounded" style={{ backgroundColor: "rgba(0,229,255,0.05)" }}>
                      <div className="text-[9px]" style={{ color: "#94a3b8" }}>○対抗</div>
                      <div className="text-sm font-bold" style={{ color: "#00e5ff" }}>{detail.prediction.taikou}番</div>
                      <div className="text-[10px] mt-1" style={{ color: "#94a3b8" }}>実着順：{detail.entries.find(entry => entry.horseNumber === detail.prediction.taikou)?.finishPosition ?? "—"}着</div>
                    </div>
                    <div className="text-center p-2 rounded" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                      <div className="text-[9px]" style={{ color: "#94a3b8" }}>▲単穴</div>
                      <div className="text-sm font-bold" style={{ color: "#e2e8f0" }}>{detail.prediction.tanana}番</div>
                      <div className="text-[10px] mt-1" style={{ color: "#94a3b8" }}>実着順：{detail.entries.find(entry => entry.horseNumber === detail.prediction.tanana)?.finishPosition ?? "—"}着</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    {detail.prediction.investAmount && detail.prediction.investAmount > 0 && (
                      <div className="p-2 rounded" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
                        <span style={{ color: "#94a3b8" }}>投資額：</span>
                        <span className="font-bold" style={{ color: "#e2e8f0" }}>¥{detail.prediction.investAmount.toLocaleString()}</span>
                      </div>
                    )}
                    {detail.prediction.returnAmount !== null && detail.prediction.returnAmount !== undefined && (
                      <div className="p-2 rounded" style={{ backgroundColor: detail.prediction.returnAmount > 0 ? "rgba(16,185,129,0.05)" : "rgba(255,255,255,0.02)" }}>
                        <span style={{ color: "#94a3b8" }}>回収額：</span>
                        <span className="font-bold" style={{ color: detail.prediction.returnAmount > 0 ? "#10b981" : "#ef4444" }}>
                          ¥{detail.prediction.returnAmount.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                  {detail.prediction.reasoning && (
                    <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="text-[10px]" style={{ color: "#64748b" }}>予想根拠：</div>
                      <p className="text-[11px] mt-1" style={{ color: "#94a3b8" }}>{detail.prediction.reasoning}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {detail.strategyReconciliations?.length > 0 && (
              <section className="mb-6 space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <ListChecks className="h-4 w-4" style={{ color: "#c9a84c" }} />
                  <h2 className="text-sm font-bold" style={{ color: "#f0db99" }}>買い目別：AI予想・公式結果・精算照合</h2>
                </div>
                {detail.strategyReconciliations.map(strategySet => {
                  const reconciliation = strategySet.reconciliation;
                  const longshot = strategySet.strategy === "longshot";
                  const accent = longshot ? "#c084fc" : "#e4c875";
                  const accentBackground = longshot ? "rgba(192,132,252,0.08)" : "rgba(201,168,76,0.07)";
                  return (
                    <div key={strategySet.strategy} className="overflow-hidden rounded-xl" style={{ border: `1px solid ${longshot ? "rgba(192,132,252,0.28)" : "rgba(201,168,76,0.22)"}` }}>
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ backgroundColor: accentBackground }}>
                        <div>
                          <p className="text-sm font-bold" style={{ color: accent }}>{strategySet.label}</p>
                          <p className="mt-0.5 text-[10px]" style={{ color: "#a8a5a0" }}>{strategySet.recorded ? "予想時点の保存済み買い目" : longshot ? "当時の穴馬買い目は保存されていません" : "旧形式の保存済みスコア順買い目"}</p>
                        </div>
                        <span className="rounded-full px-2 py-1 text-[10px]" style={{ backgroundColor: reconciliation.state === "settled" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.10)", color: reconciliation.state === "settled" ? "#6ee7b7" : "#f4d58b" }}>{reconciliation.stateLabel}</span>
                      </div>
                      <div className="p-4">
                        <p className="text-[11px] leading-relaxed" style={{ color: "#a8a5a0" }}>{reconciliation.stateDetail}</p>
                        {reconciliation.topThree.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="text-[10px]" style={{ color: "#94a3b8" }}>実際の着順</span>
                            {reconciliation.topThree.map(result => <span key={`${strategySet.strategy}-${result.position}-${result.horseNumber}`} className="border px-2 py-1 text-[10px] font-bold" style={{ borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.03)", color: "#e4c875" }}>{result.position}着：{result.horseNumber}番</span>)}
                          </div>
                        )}
                        {reconciliation.investAmount !== null && (
                          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded p-2" style={{ backgroundColor: "rgba(255,255,255,0.025)" }}><div className="text-[9px]" style={{ color: "#94a3b8" }}>投資額</div><div className="mt-1 text-xs font-bold" style={{ color: "#e2e8f0" }}>¥{reconciliation.investAmount.toLocaleString()}</div></div>
                            <div className="rounded p-2" style={{ backgroundColor: "rgba(16,185,129,0.05)" }}><div className="text-[9px]" style={{ color: "#94a3b8" }}>公式払戻</div><div className="mt-1 text-xs font-bold" style={{ color: reconciliation.returnAmount && reconciliation.returnAmount > 0 ? "#6ee7b7" : "#e2e8f0" }}>{reconciliation.returnAmount === null ? "未精算" : `¥${reconciliation.returnAmount.toLocaleString()}`}</div></div>
                            <div className="rounded p-2" style={{ backgroundColor: reconciliation.profitAmount !== null && reconciliation.profitAmount >= 0 ? "rgba(16,185,129,0.05)" : "rgba(244,63,94,0.04)" }}><div className="text-[9px]" style={{ color: "#94a3b8" }}>収支</div><div className="mt-1 text-xs font-bold" style={{ color: reconciliation.profitAmount === null ? "#a8a5a0" : reconciliation.profitAmount >= 0 ? "#6ee7b7" : "#fda4af" }}>{reconciliation.profitAmount === null ? "—" : `${reconciliation.profitAmount >= 0 ? "+" : "−"}¥${Math.abs(reconciliation.profitAmount).toLocaleString()}`}</div></div>
                          </div>
                        )}
                        {reconciliation.tickets.length > 0 ? (
                          <div className="mt-4 overflow-x-auto rounded-lg border" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                            <table className="w-full min-w-[520px] text-[11px]" style={{ color: "#e2e8f0" }}>
                              <thead><tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}><th className="px-3 py-2 text-left" style={{ color: "#94a3b8" }}>券種</th><th className="px-3 py-2 text-left" style={{ color: "#94a3b8" }}>保存済み買い目</th><th className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>点数</th><th className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>結果</th><th className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>配当</th></tr></thead>
                              <tbody>{reconciliation.tickets.map(ticket => <tr key={`${strategySet.strategy}-${ticket.betType}`} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}><td className="px-3 py-2 font-bold" style={{ color: accent }}>{ticket.label}</td><td className="px-3 py-2 max-w-[260px] whitespace-pre-wrap" style={{ color: "#b9b5aa" }}>{formatBetSelectionForDisplay(ticket.selection)}</td><td className="px-3 py-2 text-right">{ticket.ticketCount ?? "—"}</td><td className="px-3 py-2 text-right">{ticket.isHit === true ? "的中" : ticket.isHit === false ? "不的中" : "未精算"}</td><td className="px-3 py-2 text-right font-bold" style={{ color: ticket.returnAmount && ticket.returnAmount > 0 ? "#6ee7b7" : "#94a3b8" }}>{ticket.returnAmount === null ? "—" : `¥${ticket.returnAmount.toLocaleString()}`}</td></tr>)}</tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="mt-4 rounded border border-dashed px-3 py-3 text-[11px]" style={{ borderColor: "rgba(255,255,255,0.12)", color: "#94a3b8" }}>{longshot ? "この過去レースでは穴馬買い目が保存されていないため、後から再生成・推測はしていません。今後の予想から保存・精算されます。" : "保存済み買い目の詳細が不足しているため、券種別の精算表示はできません。"}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {detail.reconciliation && (
              <div className="rounded-xl overflow-hidden mb-6" style={{ border: "1px solid rgba(201,168,76,0.22)" }}>
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2" style={{ backgroundColor: "rgba(201,168,76,0.07)" }}>
                  <div className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4" style={{ color: "#c9a84c" }} />
                    <span className="text-sm font-bold" style={{ color: "#f0db99" }}>全体精算サマリー</span>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full" style={{ backgroundColor: detail.reconciliation.state === "settled" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.10)", color: detail.reconciliation.state === "settled" ? "#6ee7b7" : "#f4d58b" }}>
                    {detail.reconciliation.stateLabel}
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-[11px] leading-relaxed" style={{ color: "#a8a5a0" }}>{detail.reconciliation.stateDetail}</p>

                  {detail.reconciliation.topThree.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="text-[10px]" style={{ color: "#94a3b8" }}>公式上位3頭</span>
                      {detail.reconciliation.topThree.map(result => (
                        <span key={`${result.position}-${result.horseNumber}`} className="border px-2 py-1 text-[10px] font-bold" style={{ borderColor: "rgba(201,168,76,0.28)", backgroundColor: "rgba(201,168,76,0.06)", color: "#e4c875" }}>{result.position}着：{result.horseNumber}番</span>
                      ))}
                    </div>
                  )}

                  {detail.reconciliation.investAmount !== null && (
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded" style={{ backgroundColor: "rgba(255,255,255,0.025)" }}><div className="text-[9px]" style={{ color: "#94a3b8" }}>投資額</div><div className="mt-1 text-xs font-bold" style={{ color: "#e2e8f0" }}>¥{detail.reconciliation.investAmount.toLocaleString()}</div></div>
                      <div className="p-2 rounded" style={{ backgroundColor: "rgba(16,185,129,0.05)" }}><div className="text-[9px]" style={{ color: "#94a3b8" }}>公式照合後の回収</div><div className="mt-1 text-xs font-bold" style={{ color: detail.reconciliation.returnAmount && detail.reconciliation.returnAmount > 0 ? "#6ee7b7" : "#e2e8f0" }}>{detail.reconciliation.returnAmount === null ? "未精算" : `¥${detail.reconciliation.returnAmount.toLocaleString()}`}</div></div>
                      <div className="p-2 rounded" style={{ backgroundColor: detail.reconciliation.profitAmount !== null && detail.reconciliation.profitAmount >= 0 ? "rgba(16,185,129,0.05)" : "rgba(244,63,94,0.04)" }}><div className="text-[9px]" style={{ color: "#94a3b8" }}>収支</div><div className="mt-1 text-xs font-bold" style={{ color: detail.reconciliation.profitAmount === null ? "#a8a5a0" : detail.reconciliation.profitAmount >= 0 ? "#6ee7b7" : "#fda4af" }}>{detail.reconciliation.profitAmount === null ? "—" : `${detail.reconciliation.profitAmount >= 0 ? "+" : "−"}¥${Math.abs(detail.reconciliation.profitAmount).toLocaleString()}`}</div></div>
                    </div>
                  )}

                  {detail.reconciliation.tickets.length > 0 && (
                    <div className="mt-4 overflow-x-auto border rounded-lg" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                      <table className="w-full min-w-[520px] text-[11px]" style={{ color: "#e2e8f0" }}>
                        <thead><tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}><th className="px-3 py-2 text-left" style={{ color: "#94a3b8" }}>券種</th><th className="px-3 py-2 text-left" style={{ color: "#94a3b8" }}>保存済み買い目</th><th className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>点数</th><th className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>照合結果</th><th className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>払戻</th></tr></thead>
                        <tbody>{detail.reconciliation.tickets.map(ticket => <tr key={ticket.betType} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}><td className="px-3 py-2 font-bold" style={{ color: "#e4c875" }}>{ticket.label}</td><td className="px-3 py-2 max-w-[260px] whitespace-pre-wrap" style={{ color: "#b9b5aa" }}>{formatBetSelectionForDisplay(ticket.selection)}</td><td className="px-3 py-2 text-right">{ticket.ticketCount ?? "—"}</td><td className="px-3 py-2 text-right"><span className="inline-flex items-center gap-1">{ticket.isHit === true ? <BadgeCheck className="w-3 h-3 text-emerald-300" /> : ticket.isHit === false ? <CircleDollarSign className="w-3 h-3 text-rose-300" /> : <FileClock className="w-3 h-3 text-amber-200" />}{ticket.isHit === true ? "的中" : ticket.isHit === false ? "不的中" : "未精算"}</span></td><td className="px-3 py-2 text-right font-bold" style={{ color: ticket.returnAmount && ticket.returnAmount > 0 ? "#6ee7b7" : "#94a3b8" }}>{ticket.returnAmount === null ? "—" : `¥${ticket.returnAmount.toLocaleString()}`}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = (seconds % 60).toFixed(1);
  return min > 0 ? `${min}:${sec.padStart(4, "0")}` : sec;
}
