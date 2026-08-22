export type PredictionSortKey = "score" | "winProbability" | "expectedValue" | "odds";
export type PredictionMarkFilter = "all" | "top3" | "top5";

interface PredictionTableFiltersProps {
  accent: string;
  sortBy: PredictionSortKey;
  onSortByChange: (value: PredictionSortKey) => void;
  minWinProbability: number;
  onMinWinProbabilityChange: (value: number) => void;
  minExpectedValue: number;
  onMinExpectedValueChange: (value: number) => void;
  markFilter: PredictionMarkFilter;
  onMarkFilterChange: (value: PredictionMarkFilter) => void;
  visibleCount: number;
  totalCount: number;
}

/** 予想結果を数値根拠で絞り込むための共通操作部。 */
export function PredictionTableFilters({
  accent,
  sortBy,
  onSortByChange,
  minWinProbability,
  onMinWinProbabilityChange,
  minExpectedValue,
  onMinExpectedValueChange,
  markFilter,
  onMarkFilterChange,
  visibleCount,
  totalCount,
}: PredictionTableFiltersProps) {
  const selectStyle = { backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" };
  return (
    <div className="px-3 py-3 flex flex-wrap gap-2 items-end" style={{ backgroundColor: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <label className="grid gap-1 text-[10px] text-gray-500">
        並び順
        <select value={sortBy} onChange={event => onSortByChange(event.target.value as PredictionSortKey)} className="h-8 rounded px-2 text-xs" style={selectStyle}>
          <option value="score">AIスコア順</option>
          <option value="winProbability">推定勝率順</option>
          <option value="expectedValue">期待値順</option>
          <option value="odds">単勝オッズ順</option>
        </select>
      </label>
      <label className="grid gap-1 text-[10px] text-gray-500">
        推定勝率
        <select value={minWinProbability} onChange={event => onMinWinProbabilityChange(Number(event.target.value))} className="h-8 rounded px-2 text-xs" style={selectStyle}>
          <option value="0">すべて</option>
          <option value="10">10%以上</option>
          <option value="20">20%以上</option>
          <option value="30">30%以上</option>
        </select>
      </label>
      <label className="grid gap-1 text-[10px] text-gray-500">
        <span>期待値<AnalysisMetricTooltip metric="expectedValue" /></span>
        <select value={minExpectedValue} onChange={event => onMinExpectedValueChange(Number(event.target.value))} className="h-8 rounded px-2 text-xs" style={selectStyle}>
          <option value="-9999">すべて</option>
          <option value="0">プラス期待値</option>
          <option value="25">+25%以上</option>
          <option value="50">+50%以上</option>
        </select>
      </label>
      <label className="grid gap-1 text-[10px] text-gray-500">
        印
        <select value={markFilter} onChange={event => onMarkFilterChange(event.target.value as PredictionMarkFilter)} className="h-8 rounded px-2 text-xs" style={selectStyle}>
          <option value="all">全頭</option>
          <option value="top3">◎○▲のみ</option>
          <option value="top5">◎○▲△のみ</option>
        </select>
      </label>
      <span className="ml-auto pb-1 text-xs font-medium" style={{ color: accent }}>{visibleCount}/{totalCount}頭</span>
    </div>
  );
}
import { AnalysisMetricTooltip } from "@/components/AnalysisMetricTooltip";
