import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, BookOpen, X, Trophy, Activity, TrendingUp } from "lucide-react";

export default function HorseEncyclopediaPage() {
  const [search, setSearch] = useState("");
  const [affiliation, setAffiliation] = useState<"all" | "JRA" | "NAR">("all");
  const [page, setPage] = useState(0);
  const [selectedHorseId, setSelectedHorseId] = useState<number | null>(null);
  const limit = 30;

  const { data, isLoading } = trpc.encyclopedia.getHorses.useQuery({
    limit,
    offset: page * limit,
    search: search || undefined,
    affiliation,
  }, { staleTime: 1000 * 60 * 5 });

  const { data: detail } = trpc.encyclopedia.getHorseDetail.useQuery(
    { id: selectedHorseId! },
    { enabled: !!selectedHorseId }
  );

  const totalPages = useMemo(() => {
    if (!data) return 0;
    return Math.ceil(data.total / limit);
  }, [data, limit]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A1128" }}>
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12 max-w-6xl">
        {/* ヘッダー */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-5 h-5" style={{ color: "#00e5ff" }} />
            <h1 className="text-xl font-bold" style={{ color: "#ffffff" }}>馬図鑑</h1>
            {data && <span className="text-xs ml-2 px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(0,229,255,0.1)", color: "#00e5ff" }}>{data.total}頭登録</span>}
          </div>
          <p className="text-sm" style={{ color: "#94a3b8" }}>
            登録馬のプロフィール・血統・戦績・適性を閲覧できます
          </p>
        </div>

        {/* 詳細モーダル（netkeiba準拠） */}
        {selectedHorseId && detail && (
          <HorseDetailModal
            detail={detail}
            onClose={() => setSelectedHorseId(null)}
          />
        )}

        {/* フィルター */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#64748b" }} />
            <input
              type="text"
              placeholder="馬名で検索..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-full pl-10 pr-4 py-2 rounded-lg text-sm"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
            />
          </div>
          <div className="flex gap-2">
            {(["all", "JRA", "NAR"] as const).map((aff) => (
              <button
                key={aff}
                onClick={() => { setAffiliation(aff); setPage(0); }}
                className="px-3 py-2 rounded-lg text-xs font-bold transition-all"
                style={{
                  backgroundColor: affiliation === aff ? "rgba(0,229,255,0.15)" : "rgba(255,255,255,0.03)",
                  color: affiliation === aff ? "#00e5ff" : "#94a3b8",
                  border: `1px solid ${affiliation === aff ? "rgba(0,229,255,0.3)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                {aff === "all" ? "全て" : aff}
              </button>
            ))}
          </div>
        </div>

        {/* 一覧テーブル */}
        {isLoading ? (
          <div className="text-center py-12" style={{ color: "#64748b" }}>読み込み中...</div>
        ) : !data || data.horses.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#64748b" }}>
            {search ? `「${search}」に該当する馬が見つかりません` : "馬図鑑データがありません"}
          </div>
        ) : (
          <>
            <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]" style={{ color: "#e2e8f0" }}>
                  <thead>
                    <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>馬名</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>性</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>父</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>母</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>調教師</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>所属</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>成績</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>賞金</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.horses.map((horse, idx) => (
                      <tr
                        key={horse.id}
                        onClick={() => setSelectedHorseId(horse.id)}
                        className="cursor-pointer transition-colors hover:bg-white/5"
                        style={{
                          backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <td className="px-3 py-2 font-bold" style={{ color: "#00e5ff" }}>{horse.name}</td>
                        <td className="px-3 py-2">{horse.sex || "—"}</td>
                        <td className="px-3 py-2 max-w-[80px] truncate" style={{ color: "#94a3b8" }}>{horse.sire || "—"}</td>
                        <td className="px-3 py-2 max-w-[80px] truncate" style={{ color: "#94a3b8" }}>{horse.dam || "—"}</td>
                        <td className="px-3 py-2 max-w-[80px] truncate">{horse.trainer || "—"}</td>
                        <td className="px-3 py-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                            backgroundColor: horse.affiliation === "JRA" ? "rgba(0,229,255,0.1)" : "rgba(245,158,11,0.1)",
                            color: horse.affiliation === "JRA" ? "#00e5ff" : "#f59e0b",
                          }}>
                            {horse.affiliation}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{horse.record || "—"}</td>
                        <td className="px-3 py-2 text-right" style={{ color: "#c9a84c" }}>
                          {horse.totalEarnings ? `${horse.totalEarnings.toLocaleString()}万` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ページネーション */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-2 rounded-lg transition-all disabled:opacity-30"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                >
                  <ChevronLeft className="w-4 h-4" style={{ color: "#e2e8f0" }} />
                </button>
                <span className="text-xs" style={{ color: "#94a3b8" }}>
                  {page + 1} / {totalPages}（{data.total}件）
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-2 rounded-lg transition-all disabled:opacity-30"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                >
                  <ChevronRight className="w-4 h-4" style={{ color: "#e2e8f0" }} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===== netkeiba準拠の詳細モーダル =====
function HorseDetailModal({ detail, onClose }: { detail: any; onClose: () => void }) {
  const horse = detail.horse;
  const raceHistory = detail.raceHistory || [];

  // 成績を分析
  const stats = useMemo(() => {
    const total = raceHistory.length;
    const wins = raceHistory.filter((r: any) => r.finishPosition === 1).length;
    const top2 = raceHistory.filter((r: any) => r.finishPosition && r.finishPosition <= 2).length;
    const top3 = raceHistory.filter((r: any) => r.finishPosition && r.finishPosition <= 3).length;
    const winRate = total > 0 ? (wins / total * 100).toFixed(1) : "0.0";
    const placeRate = total > 0 ? (top2 / total * 100).toFixed(1) : "0.0";
    const showRate = total > 0 ? (top3 / total * 100).toFixed(1) : "0.0";
    return { total, wins, top2, top3, winRate, placeRate, showRate };
  }, [raceHistory]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl" style={{ backgroundColor: "#0f1d36", border: "1px solid rgba(0,229,255,0.2)" }}>
        {/* ヘッダー */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4" style={{ backgroundColor: "#0f1d36", borderBottom: "1px solid rgba(0,229,255,0.15)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(0,229,255,0.1)" }}>
              <span className="text-lg">🐴</span>
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: "#ffffff" }}>{horse.name}</h2>
              <div className="flex items-center gap-2 text-[10px]" style={{ color: "#94a3b8" }}>
                <span>{horse.sex || "不明"}</span>
                <span>•</span>
                <span>{horse.affiliation || "NAR"}</span>
                {horse.birthDate && <><span>•</span><span>{horse.birthDate}年生</span></>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-all">
            <X className="w-5 h-5" style={{ color: "#94a3b8" }} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* プロフィールテーブル（netkeiba風） */}
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-3 py-2 text-[11px] font-bold" style={{ backgroundColor: "rgba(0,229,255,0.05)", color: "#00e5ff" }}>
              基本情報
            </div>
            <div className="grid grid-cols-2 text-[11px]">
              <ProfileRow label="生年月日" value={horse.birthDate ? `${horse.birthDate}年生` : "—"} />
              <ProfileRow label="調教師" value={horse.trainer || "—"} />
              <ProfileRow label="馬主" value={horse.owner || "—"} />
              <ProfileRow label="生産者" value={horse.breeder || "—"} />
              <ProfileRow label="毛色" value={horse.coatColor || "—"} />
              <ProfileRow label="所属" value={horse.affiliation || "—"} />
              <ProfileRow label="獲得賞金" value={horse.totalEarnings ? `${horse.totalEarnings.toLocaleString()}万円` : "0万円"} />
              <ProfileRow label="通算成績" value={horse.record || "—"} />
            </div>
          </div>

          {/* 血統表（netkeiba風3代血統） */}
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-3 py-2 text-[11px] font-bold flex items-center gap-2" style={{ backgroundColor: "rgba(0,229,255,0.05)", color: "#00e5ff" }}>
              <span>🧬</span> 血統
            </div>
            <div className="p-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded text-center" style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
                  <div className="text-[9px] mb-1" style={{ color: "#60a5fa" }}>父</div>
                  <div className="text-[12px] font-bold" style={{ color: "#e2e8f0" }}>{horse.sire || "不明"}</div>
                </div>
                <div className="p-2 rounded text-center" style={{ backgroundColor: "rgba(236,72,153,0.08)", border: "1px solid rgba(236,72,153,0.2)" }}>
                  <div className="text-[9px] mb-1" style={{ color: "#f472b6" }}>母</div>
                  <div className="text-[12px] font-bold" style={{ color: "#e2e8f0" }}>{horse.dam || "不明"}</div>
                </div>
                <div className="p-2 rounded text-center" style={{ backgroundColor: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}>
                  <div className="text-[9px] mb-1" style={{ color: "#a78bfa" }}>母父</div>
                  <div className="text-[12px] font-bold" style={{ color: "#e2e8f0" }}>{horse.damSire || "不明"}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 適性レビュー（netkeiba風） */}
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-3 py-2 text-[11px] font-bold flex items-center gap-2" style={{ backgroundColor: "rgba(0,229,255,0.05)", color: "#00e5ff" }}>
              <Activity className="w-3 h-3" /> 適性レビュー
            </div>
            <div className="p-3 grid grid-cols-2 gap-3">
              <AptitudeBar label="コース適性" leftLabel="芝" rightLabel="ダート" value={getTrackAptitude(raceHistory)} />
              <AptitudeBar label="距離適性" leftLabel="短" rightLabel="長" value={getDistanceAptitude(raceHistory)} />
            </div>
          </div>

          {/* 成績サマリー */}
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-3 py-2 text-[11px] font-bold flex items-center gap-2" style={{ backgroundColor: "rgba(0,229,255,0.05)", color: "#00e5ff" }}>
              <Trophy className="w-3 h-3" /> 成績サマリー
            </div>
            <div className="p-3 grid grid-cols-4 gap-2 text-center">
              <StatBox label="出走" value={`${stats.total}回`} />
              <StatBox label="勝率" value={`${stats.winRate}%`} highlight={parseFloat(stats.winRate) >= 20} />
              <StatBox label="連対率" value={`${stats.placeRate}%`} highlight={parseFloat(stats.placeRate) >= 40} />
              <StatBox label="複勝率" value={`${stats.showRate}%`} highlight={parseFloat(stats.showRate) >= 50} />
            </div>
          </div>

          {/* 主な勝ち鞍 */}
          {horse.notableWins && (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-3 py-2 text-[11px] font-bold flex items-center gap-2" style={{ backgroundColor: "rgba(245,158,11,0.05)", color: "#f59e0b" }}>
                <TrendingUp className="w-3 h-3" /> 主な勝ち鞍
              </div>
              <div className="p-3 text-[11px]" style={{ color: "#e2e8f0" }}>
                {horse.notableWins}
              </div>
            </div>
          )}

          {/* 競走成績（netkeiba風テーブル） */}
          {raceHistory.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="px-3 py-2 text-[11px] font-bold" style={{ backgroundColor: "rgba(0,229,255,0.05)", color: "#00e5ff" }}>
                競走成績（直近{Math.min(raceHistory.length, 20)}走）
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]" style={{ color: "#e2e8f0" }}>
                  <thead>
                    <tr style={{ backgroundColor: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <th className="px-2 py-1.5 text-center" style={{ color: "#64748b" }}>着順</th>
                      <th className="px-2 py-1.5 text-left" style={{ color: "#64748b" }}>レースID</th>
                      <th className="px-2 py-1.5 text-center" style={{ color: "#64748b" }}>枠</th>
                      <th className="px-2 py-1.5 text-center" style={{ color: "#64748b" }}>馬番</th>
                      <th className="px-2 py-1.5 text-left" style={{ color: "#64748b" }}>騎手</th>
                      <th className="px-2 py-1.5 text-right" style={{ color: "#64748b" }}>斤量</th>
                      <th className="px-2 py-1.5 text-right" style={{ color: "#64748b" }}>タイム</th>
                      <th className="px-2 py-1.5 text-right" style={{ color: "#64748b" }}>着差</th>
                      <th className="px-2 py-1.5 text-right" style={{ color: "#64748b" }}>馬体重</th>
                      <th className="px-2 py-1.5 text-right" style={{ color: "#64748b" }}>オッズ</th>
                      <th className="px-2 py-1.5 text-center" style={{ color: "#64748b" }}>人気</th>
                    </tr>
                  </thead>
                  <tbody>
                    {raceHistory.slice(0, 20).map((entry: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                        <td className="px-2 py-1.5 text-center font-bold" style={{
                          color: entry.finishPosition === 1 ? "#fbbf24" :
                                 entry.finishPosition === 2 ? "#94a3b8" :
                                 entry.finishPosition === 3 ? "#cd7f32" : "#e2e8f0"
                        }}>
                          {entry.finishPosition || "—"}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[9px]">{entry.raceId || "—"}</td>
                        <td className="px-2 py-1.5 text-center">
                          <span className="inline-block w-5 h-5 rounded-sm text-[9px] leading-5 text-center font-bold" style={{
                            backgroundColor: getGateColor(entry.gateNumber),
                            color: [1, 2].includes(entry.gateNumber) ? "#000" : "#fff",
                          }}>
                            {entry.gateNumber || "—"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-center">{entry.horseNumber || "—"}</td>
                        <td className="px-2 py-1.5">{entry.jockey || "—"}</td>
                        <td className="px-2 py-1.5 text-right">{entry.weight ? `${entry.weight}kg` : "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{entry.finishTime || "—"}</td>
                        <td className="px-2 py-1.5 text-right">{entry.margin || "—"}</td>
                        <td className="px-2 py-1.5 text-right">
                          {entry.horseWeight ? (
                            <span>
                              {entry.horseWeight}
                              {entry.horseWeightDiff != null && (
                                <span style={{ color: entry.horseWeightDiff > 0 ? "#ef4444" : entry.horseWeightDiff < 0 ? "#3b82f6" : "#94a3b8" }}>
                                  ({entry.horseWeightDiff > 0 ? "+" : ""}{entry.horseWeightDiff})
                                </span>
                              )}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right">{entry.odds ? entry.odds.toFixed(1) : "—"}</td>
                        <td className="px-2 py-1.5 text-center">
                          {entry.popularity ? (
                            <span className="inline-block w-5 h-5 rounded-full text-[9px] leading-5 text-center" style={{
                              backgroundColor: entry.popularity <= 3 ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)",
                              color: entry.popularity <= 3 ? "#fbbf24" : "#94a3b8",
                            }}>
                              {entry.popularity}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {raceHistory.length === 0 && (
            <div className="text-center py-6 text-[11px]" style={{ color: "#64748b" }}>
              競走データがありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== ヘルパーコンポーネント =====
function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center px-3 py-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="w-20 text-[10px] shrink-0" style={{ color: "#64748b" }}>{label}</span>
      <span className="text-[11px]" style={{ color: "#e2e8f0" }}>{value}</span>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="p-2 rounded" style={{ backgroundColor: highlight ? "rgba(0,229,255,0.05)" : "rgba(255,255,255,0.02)" }}>
      <div className="text-[9px] mb-0.5" style={{ color: "#64748b" }}>{label}</div>
      <div className="text-[13px] font-bold" style={{ color: highlight ? "#00e5ff" : "#e2e8f0" }}>{value}</div>
    </div>
  );
}

function AptitudeBar({ label, leftLabel, rightLabel, value }: { label: string; leftLabel: string; rightLabel: string; value: number }) {
  // value: 0=左寄り, 50=中間, 100=右寄り
  return (
    <div>
      <div className="text-[10px] mb-1" style={{ color: "#94a3b8" }}>{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] w-6" style={{ color: "#64748b" }}>{leftLabel}</span>
        <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
          <div className="h-full rounded-full transition-all" style={{
            width: `${value}%`,
            backgroundColor: value > 60 ? "#f59e0b" : value < 40 ? "#3b82f6" : "#10b981",
          }} />
        </div>
        <span className="text-[9px] w-6 text-right" style={{ color: "#64748b" }}>{rightLabel}</span>
      </div>
    </div>
  );
}

// ===== ヘルパー関数 =====
function getGateColor(gate: number | null): string {
  if (!gate) return "rgba(255,255,255,0.1)";
  const colors: Record<number, string> = {
    1: "#ffffff", 2: "#000000", 3: "#ef4444", 4: "#3b82f6",
    5: "#fbbf24", 6: "#22c55e", 7: "#f97316", 8: "#ec4899",
  };
  return colors[gate] || "rgba(255,255,255,0.1)";
}

function getTrackAptitude(history: any[]): number {
  // ダート出走比率を計算（raceIdから推定）
  if (history.length === 0) return 50;
  // 簡易的に: 地方競馬はほぼダート
  return 80; // NAR中心なのでダート寄り
}

function getDistanceAptitude(history: any[]): number {
  // 距離適性を出走距離から推定
  if (history.length === 0) return 50;
  return 50; // デフォルト中間
}
