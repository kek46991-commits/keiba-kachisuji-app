import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getExpectedValueStatus } from "@/lib/predictionTransparency";

export function EvExplanationTooltip({ odds, winProbability, expectedValue, oddsSource = "official" }: { odds: number | null | undefined; winProbability: number | null | undefined; expectedValue: number | null | undefined; oddsSource?: "official" | "predicted" }) {
  const evStatus = oddsSource === "predicted"
    ? { status: "unavailable" as const, reason: "予想オッズは市場で成立した公式オッズではないため、EVは算出しません。" }
    : getExpectedValueStatus({ odds, winProbability, expectedValue });
  const calculatedOdds = typeof odds === "number" && odds > 0 ? odds : null;
  const calculatedProbability = typeof winProbability === "number" ? winProbability : null;
  const calculatedEv = typeof expectedValue === "number" && calculatedOdds !== null && calculatedProbability !== null ? expectedValue : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex shrink-0 items-center text-current/80 hover:text-current focus:outline-none focus:ring-1 focus:ring-current rounded" aria-label="EV算出根拠を表示">
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="z-[80] max-w-[280px] border border-white/15 bg-[#101b2d] px-3 py-2.5 text-left text-[11px] leading-relaxed text-slate-100 shadow-xl">
        <p className="font-bold text-cyan-200">EV（期待値）の算出根拠</p>
        {calculatedEv !== null && calculatedOdds !== null && calculatedProbability !== null ? <>
          <p className="mt-1 text-slate-300">計算式: （推定勝率 ÷ 100 × 単勝オッズ − 1）× 100</p>
          <p className="mt-1 text-slate-300">入力値: 推定勝率 {calculatedProbability.toFixed(1)}% / 単勝 {calculatedOdds.toFixed(1)}倍</p>
          <p className="mt-1 font-semibold" style={{ color: calculatedEv >= 0 ? "#86efac" : "#fda4af" }}>計算結果: {calculatedEv >= 0 ? "+" : ""}{calculatedEv.toFixed(1)}%</p>
          <p className="mt-1 text-slate-400">推定勝率は能力スコアを同一レース内で正規化した相対指標です。</p>
        </> : <>
          <p className="mt-1 text-amber-100">EV未算出: {evStatus.reason}</p>
          <p className="mt-1 text-slate-400">不足データを補完してEVを推測することはありません。</p>
        </>}
      </TooltipContent>
    </Tooltip>
  );
}
