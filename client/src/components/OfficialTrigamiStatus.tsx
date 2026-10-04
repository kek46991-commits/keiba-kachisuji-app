import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export type TicketFormation = { axis: number; second: number[]; third: number[]; trioPartners: number[] };

const fallbackFormation: TicketFormation = { axis: 1, second: [], third: [], trioPartners: [] };

export function OfficialTrigamiStatus({ raceId, formation, totalBets }: { raceId?: string | null; formation?: TicketFormation; totalBets?: number }) {
  const input = useMemo(() => ({ raceId: raceId || "00000000", formation: formation ?? fallbackFormation }), [raceId, formation]);
  const risk = trpc.jraVanUpload.getTrigamiRisk.useQuery(input, { enabled: Boolean(raceId && formation) });
  if (!formation) return null;
  if (risk.isLoading) return <p className="mb-3 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-gray-300" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}><Loader2 className="w-3.5 h-3.5 animate-spin" />公式組合せオッズを照合中...</p>;
  if (risk.isError || !risk.data) return <p className="mb-3 rounded-lg px-3 py-2 text-xs text-amber-100" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>公式組合せオッズの照合に失敗しました。判定は保留です。</p>;

  const isSafe = risk.data.status === "safe";
  const isRisk = risk.data.status === "risk";
  const icon = isSafe ? <CheckCircle2 className="w-4 h-4" /> : isRisk ? <AlertTriangle className="w-4 h-4" /> : <CircleHelp className="w-4 h-4" />;
  const colors = isSafe
    ? { bg: "rgba(34,197,94,0.12)", text: "#bbf7d0", border: "rgba(34,197,94,0.28)" }
    : isRisk
      ? { bg: "rgba(244,63,94,0.13)", text: "#fecdd3", border: "rgba(244,63,94,0.30)" }
      : { bg: "rgba(245,158,11,0.12)", text: "#fde68a", border: "rgba(245,158,11,0.30)" };
  return (
    <div className="mb-3 rounded-lg px-3 py-2.5 text-xs" style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
      <div className="flex items-center gap-1.5 font-bold">{icon}公式組合せオッズによるトリガミ判定</div>
      <p className="mt-1.5 leading-relaxed">{risk.data.message}</p>
      {typeof totalBets === "number" && <p className="mt-1 text-[11px] opacity-85">全券種の総投資 ¥{(totalBets * 100).toLocaleString()}（3連複を含む）</p>}
      <p className="mt-1 text-[11px] opacity-85">公式照合対象の投資 ¥{risk.data.totalInvest.toLocaleString()} / 公式照合の損益分岐 {risk.data.breakEvenOdds === null ? "—" : `${risk.data.breakEvenOdds.toFixed(1)}倍`} / 照合 {risk.data.coveredTickets}/{risk.data.totalTickets}点</p>
    </div>
  );
}
