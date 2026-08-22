import Navbar from "@/components/Navbar";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, Users } from "lucide-react";

export default function JockeyListPage() {
  const [search, setSearch] = useState("");
  const [affiliation, setAffiliation] = useState<"all" | "JRA" | "NAR">("all");
  const [sortBy, setSortBy] = useState<"totalWins" | "winRate" | "yearWins" | "placeRate" | "showRate">("totalWins");
  const [page, setPage] = useState(0);
  const [selectedJockeyId, setSelectedJockeyId] = useState<number | null>(null);
  const limit = 30;

  const { data, isLoading } = trpc.encyclopedia.getJockeys.useQuery({
    limit,
    offset: page * limit,
    search: search || undefined,
    affiliation,
    sortBy,
  }, { staleTime: 1000 * 60 * 5 });

  const { data: detail } = trpc.encyclopedia.getJockeyDetail.useQuery(
    { id: selectedJockeyId! },
    { enabled: !!selectedJockeyId }
  );

  const totalPages = useMemo(() => {
    if (!data) return 0;
    return Math.ceil(data.total / limit);
  }, [data, limit]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A1128" }}>
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-12 max-w-5xl">
        {/* ヘッダー */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5" style={{ color: "#00e5ff" }} />
            <h1 className="text-xl font-bold" style={{ color: "#ffffff" }}>騎手一覧</h1>
          </div>
          <p className="text-sm" style={{ color: "#94a3b8" }}>
            JRA・NAR所属騎手の成績・勝率を閲覧できます
          </p>
        </div>

        {/* 詳細モーダル */}
        {selectedJockeyId && detail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
            <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl p-5" style={{ backgroundColor: "#0f1d36", border: "1px solid rgba(0,229,255,0.2)" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold" style={{ color: "#ffffff" }}>{detail.jockey.name}</h2>
                <button
                  onClick={() => setSelectedJockeyId(null)}
                  className="text-sm px-3 py-1 rounded"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "#94a3b8" }}
                >
                  閉じる
                </button>
              </div>

              {/* 成績サマリー */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatBox label="通算勝利" value={`${detail.jockey.totalWins ?? 0}勝`} />
                <StatBox label="今年勝利" value={`${detail.jockey.yearWins ?? 0}勝`} />
                <StatBox label="所属" value={detail.jockey.affiliation} />
              </div>

              {/* 勝率データ */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <RateBar label="勝率" value={detail.jockey.winRate ?? 0} color="#00e5ff" />
                <RateBar label="連対率" value={detail.jockey.placeRate ?? 0} color="#f59e0b" />
                <RateBar label="複勝率" value={detail.jockey.showRate ?? 0} color="#10b981" />
                <RateBar label="芝勝率" value={detail.jockey.turfWinRate ?? 0} color="#8b5cf6" />
                <RateBar label="ダート勝率" value={detail.jockey.dirtWinRate ?? 0} color="#ef4444" />
                <RateBar label="重馬場勝率" value={detail.jockey.heavyWinRate ?? 0} color="#6366f1" />
              </div>

              {/* 騎乗履歴 */}
              {detail.rideHistory.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold mb-2" style={{ color: "#94a3b8" }}>直近の騎乗履歴</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]" style={{ color: "#e2e8f0" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          <th className="px-2 py-1 text-left" style={{ color: "#64748b" }}>着</th>
                          <th className="px-2 py-1 text-left" style={{ color: "#64748b" }}>馬名</th>
                          <th className="px-2 py-1 text-right" style={{ color: "#64748b" }}>オッズ</th>
                          <th className="px-2 py-1 text-right" style={{ color: "#64748b" }}>人気</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.rideHistory.slice(0, 15).map((entry, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                            <td className="px-2 py-1 font-bold" style={{ color: (entry.finishPosition || 99) <= 3 ? "#c9a84c" : "#e2e8f0" }}>
                              {entry.finishPosition || "—"}
                            </td>
                            <td className="px-2 py-1">{entry.horseName}</td>
                            <td className="px-2 py-1 text-right">{entry.odds ? entry.odds.toFixed(1) : "—"}</td>
                            <td className="px-2 py-1 text-right">{entry.popularity || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* フィルター */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#64748b" }} />
            <input
              type="text"
              placeholder="騎手名で検索..."
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

        {/* ソート */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {([
            { key: "totalWins", label: "通算勝利" },
            { key: "yearWins", label: "今年勝利" },
            { key: "winRate", label: "勝率" },
            { key: "placeRate", label: "連対率" },
            { key: "showRate", label: "複勝率" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setSortBy(key); setPage(0); }}
              className="px-2 py-1 rounded text-[10px] font-bold transition-all"
              style={{
                backgroundColor: sortBy === key ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.02)",
                color: sortBy === key ? "#f59e0b" : "#64748b",
                border: `1px solid ${sortBy === key ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.04)"}`,
              }}
            >
              {label}順
            </button>
          ))}
        </div>

        {/* 一覧テーブル */}
        {isLoading ? (
          <div className="text-center py-12" style={{ color: "#64748b" }}>読み込み中...</div>
        ) : !data || data.jockeys.length === 0 ? (
          <div className="text-center py-12" style={{ color: "#64748b" }}>
            {search ? `「${search}」に該当する騎手が見つかりません` : "騎手データがありません"}
          </div>
        ) : (
          <>
            <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]" style={{ color: "#e2e8f0" }}>
                  <thead>
                    <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>騎手名</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "#94a3b8" }}>所属</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>通算勝利</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>今年</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>勝率</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>連対率</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>複勝率</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>芝</th>
                      <th className="px-3 py-2 text-right font-medium" style={{ color: "#94a3b8" }}>ダート</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jockeys.map((jockey, idx) => (
                      <tr
                        key={jockey.id}
                        onClick={() => setSelectedJockeyId(jockey.id)}
                        className="cursor-pointer transition-colors"
                        style={{
                          backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        <td className="px-3 py-2 font-bold" style={{ color: "#00e5ff" }}>{jockey.name}</td>
                        <td className="px-3 py-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                            backgroundColor: jockey.affiliation === "JRA" ? "rgba(0,229,255,0.1)" : "rgba(245,158,11,0.1)",
                            color: jockey.affiliation === "JRA" ? "#00e5ff" : "#f59e0b",
                          }}>
                            {jockey.affiliation}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold">{jockey.totalWins ?? 0}</td>
                        <td className="px-3 py-2 text-right font-mono">{jockey.yearWins ?? 0}</td>
                        <td className="px-3 py-2 text-right font-mono" style={{ color: (jockey.winRate ?? 0) >= 15 ? "#00e5ff" : "#e2e8f0" }}>
                          {(jockey.winRate ?? 0).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right font-mono" style={{ color: (jockey.placeRate ?? 0) >= 30 ? "#f59e0b" : "#e2e8f0" }}>
                          {(jockey.placeRate ?? 0).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right font-mono" style={{ color: (jockey.showRate ?? 0) >= 40 ? "#10b981" : "#e2e8f0" }}>
                          {(jockey.showRate ?? 0).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[10px]">{(jockey.turfWinRate ?? 0).toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right font-mono text-[10px]">{(jockey.dirtWinRate ?? 0).toFixed(1)}%</td>
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

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg text-center" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="text-[9px]" style={{ color: "#64748b" }}>{label}</div>
      <div className="text-sm font-bold" style={{ color: "#e2e8f0" }}>{value}</div>
    </div>
  );
}

function RateBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-2 rounded" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px]" style={{ color: "#94a3b8" }}>{label}</span>
        <span className="text-[10px] font-bold" style={{ color }}>{value.toFixed(1)}%</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
