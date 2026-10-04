import { trpc } from "@/lib/trpc";
import { formatRecoveryRate, formatSignedYen, formatYen, hitStatusLabel } from "@shared/settlementDisplay";

/**
 * レース単位の結果照合カード。中央・地方どちらのレースIDでも、
 * 公式着順（本物の馬名）・的中判定・回収額・回収率を表示する。
 */
export function RaceSettlementCard({ raceId }: { raceId: string }) {
  const { data: settlements } = trpc.raceData.getRaceSettlements.useQuery(
    { raceIds: [raceId] },
    { enabled: !!raceId },
  );
  const settlement = settlements?.[0];
  if (!settlement || settlement.topThree.length === 0) return null;

  const statusColor = settlement.hitStatus === "hit" ? "#6ee7b7" : settlement.hitStatus === "miss" ? "#fda4af" : "#f4d58b";

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
        <h4 className="text-xs font-bold text-white">🏁 レース結果・回収実績</h4>
        <span className="ml-auto text-[10px] font-bold" style={{ color: statusColor }}>
          {settlement.hasPrediction ? hitStatusLabel(settlement.isHit) : "予想未保存"}
        </span>
      </div>
      <div className="p-3">
        <div className="flex flex-wrap gap-1.5">
          {settlement.topThree.map(result => (
            <span key={`${result.position}-${result.horseNumber}`} className="text-[11px] px-2 py-1 rounded" style={{ backgroundColor: "rgba(255,165,0,0.08)", color: "#ffd08a" }}>
              {result.position}着 {result.horseNumber}番 {result.horseName}
            </span>
          ))}
        </div>
        {settlement.hasPrediction && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Figure label="投資額" value={formatYen(settlement.investAmount)} />
            <Figure label="回収金額" value={formatYen(settlement.returnAmount)} color={settlement.returnAmount && settlement.returnAmount > 0 ? "#6ee7b7" : undefined} />
            <Figure label="回収率" value={formatRecoveryRate(settlement.recoveryRate)} color={settlement.recoveryRate !== null && settlement.recoveryRate >= 100 ? "#6ee7b7" : undefined} />
            <Figure label="収支" value={formatSignedYen(settlement.profitAmount)} color={settlement.profitAmount !== null ? (settlement.profitAmount >= 0 ? "#6ee7b7" : "#fda4af") : undefined} />
          </div>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, color = "#e2e8f0" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded p-2" style={{ backgroundColor: "rgba(255,255,255,0.025)" }}>
      <div className="text-[9px] text-gray-400">{label}</div>
      <div className="mt-1 text-xs font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
