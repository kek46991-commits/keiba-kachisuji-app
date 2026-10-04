import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type MetricKind = "ability" | "market" | "condition" | "expectedValue";

const definitions: Record<MetricKind, { title: string; description: string; note: string }> = {
  ability: {
    title: "能力評価（相対）",
    description: "過去成績・適性などから算出する、同一レース内での相対的な能力評価です。市場オッズは能力評価に混在させません。",
    note: "実際の着順や結果を保証する数値ではありません。",
  },
  market: {
    title: "市場評価（相対）",
    description: "オッズ妙味・人気などの市場情報を100点化した補助評価です。能力評価やEV（%）とは別の指標です。",
    note: "公式オッズが不足する場合は、評価を過大に補完しません。",
  },
  condition: {
    title: "状態評価（相対）",
    description: "馬体重・ローテーションなど、取得済みの状態関連データを相対評価した構成要素です。",
    note: "未取得の状態データは推測で補いません。",
  },
  expectedValue: {
    title: "EV（期待値）",
    description: "計算式は（推定勝率 ÷ 100 × 単勝オッズ − 1）× 100です。能力スコアとは独立して算出します。",
    note: "EV未算出の馬はプラスEVフィルターから除外されます。",
  },
};

export function AnalysisMetricTooltip({ metric, value }: { metric: MetricKind; value?: number }) {
  const definition = definitions[metric];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="ml-1 inline-flex align-middle text-current/70 hover:text-current focus:outline-none focus:ring-1 focus:ring-current rounded" aria-label={`${definition.title}の根拠を表示`}><CircleHelp className="h-3 w-3" /></button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="z-[80] max-w-[280px] border border-white/15 bg-[#101b2d] px-3 py-2.5 text-left text-[11px] leading-relaxed text-slate-100 shadow-xl">
        <p className="font-bold text-cyan-200">{definition.title}{typeof value === "number" ? `: ${value.toFixed(1)}点` : ""}</p>
        <p className="mt-1 text-slate-300">{definition.description}</p>
        <p className="mt-1 text-slate-400">{definition.note}</p>
      </TooltipContent>
    </Tooltip>
  );
}
