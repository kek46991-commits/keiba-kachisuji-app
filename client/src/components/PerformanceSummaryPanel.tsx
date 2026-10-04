import { trpc } from "@/lib/trpc";
import { formatRecoveryRate, formatSignedYen, formatYen } from "@shared/settlementDisplay";

/**
 * 保存済みの確定予想から、通算および日別の総投資額・総回収額・回収率を表示する集計コンポーネント。
 * 中央・地方いずれの予想も共通の predictions テーブルに保存されるため、両方が集計対象になる。
 */
export function PerformanceSummaryPanel({ dailyLimit = 7 }: { dailyLimit?: number }) {
  const { data: performance, isLoading: performanceLoading } = trpc.raceData.getPredictionHistoryPerformance.useQuery({ limit: 100, offset: 0 });
  const { data: timeline, isLoading: timelineLoading } = trpc.raceData.getPredictionHistoryTimeline.useQuery({ limit: 100, offset: 0 });

  if (performanceLoading || timelineLoading) {
    return <div className="mb-6 h-28 animate-pulse rounded-xl border border-gray-700 bg-gray-900/60" />;
  }
  if (!performance || performance.total === 0) {
    return (
      <div className="mb-6 rounded-xl border border-gray-700 bg-gray-900/60 p-4 text-xs text-gray-400">
        集計できる確定済みの予想がまだありません。公式結果が取込まれると、総投資額・総回収額・通算回収率を自動計算して表示します。
      </div>
    );
  }

  const dailyPoints = (timeline?.points ?? []).slice(-dailyLimit).reverse();

  return (
    <div className="mb-6 rounded-xl border border-gray-700 bg-gray-900/60 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-white">通算成績・収支</h2>
        <span className="text-[10px] text-gray-500">確定済み{performance.total}レース（中央・地方合算）</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="総投資額" value={formatYen(performance.totalInvest)} />
        <SummaryTile label="総回収額" value={formatYen(performance.totalReturn)} />
        <SummaryTile
          label="通算回収率"
          value={formatRecoveryRate(performance.roi)}
          accent={performance.roi !== null && performance.roi >= 100 ? "up" : "flat"}
        />
        <SummaryTile
          label="収支"
          value={formatSignedYen(performance.profit)}
          accent={performance.profit >= 0 ? "up" : "down"}
        />
      </div>

      {dailyPoints.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <div className="mb-2 text-xs font-bold text-gray-300">日別成績</div>
          <table className="w-full text-[11px] text-gray-300">
            <thead>
              <tr className="text-gray-500">
                <th className="px-2 py-1 text-left font-medium">日付</th>
                <th className="px-2 py-1 text-right font-medium">的中</th>
                <th className="px-2 py-1 text-right font-medium">投資額</th>
                <th className="px-2 py-1 text-right font-medium">回収額</th>
                <th className="px-2 py-1 text-right font-medium">回収率</th>
                <th className="px-2 py-1 text-right font-medium">通算回収率</th>
              </tr>
            </thead>
            <tbody>
              {dailyPoints.map(point => (
                <tr key={point.date} className="border-t border-gray-800">
                  <td className="px-2 py-1">{point.date}</td>
                  <td className="px-2 py-1 text-right">{point.hitCount}/{point.raceCount}</td>
                  <td className="px-2 py-1 text-right">{formatYen(point.dailyInvest)}</td>
                  <td className="px-2 py-1 text-right">{formatYen(point.dailyReturn)}</td>
                  <td className="px-2 py-1 text-right" style={{ color: point.dailyRoi !== null && point.dailyRoi >= 100 ? "#6ee7b7" : undefined }}>{formatRecoveryRate(point.dailyRoi)}</td>
                  <td className="px-2 py-1 text-right text-gray-400">{formatRecoveryRate(point.cumulativeRoi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, accent = "flat" }: { label: string; value: string; accent?: "up" | "down" | "flat" }) {
  const color = accent === "up" ? "#6ee7b7" : accent === "down" ? "#fda4af" : "#e2e8f0";
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-3">
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className="mt-1 text-lg font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
