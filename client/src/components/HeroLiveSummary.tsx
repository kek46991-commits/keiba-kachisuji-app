import { trpc } from "@/lib/trpc";
import { formatRecoveryRate, formatSignedYen, formatYen, hitStatusLabel } from "@shared/settlementDisplay";
import { useMemo } from "react";

/**
 * ファーストビューに通算成績（回収率・的中率・収支）と直近レースの実名着順を直接表示する。
 * ボタン遷移なしでDBの最新データが読めるよう、トップページのヒーロー内に埋め込む。
 */
export function HeroLiveSummary() {
  const { data: performance } = trpc.raceData.getPredictionHistoryPerformance.useQuery({ limit: 100, offset: 0 }, { staleTime: 30_000 });
  const { data: races } = trpc.raceData.getLatestRaces.useQuery({ limit: 12 }, { staleTime: 30_000 });
  const raceIds = useMemo(() => (races ?? []).map(race => race.raceId), [races]);
  const { data: settlements } = trpc.raceData.getRaceSettlements.useQuery({ raceIds }, { enabled: raceIds.length > 0 });

  const spotlight = useMemo(
    () => (settlements ?? []).filter(settlement => settlement.topThree.length > 0).slice(-2).reverse(),
    [settlements],
  );
  const raceLabelById = useMemo(
    () => new Map((races ?? []).map(race => [race.raceId, `${race.venueName}${race.raceNumber}R`])),
    [races],
  );

  if (!performance && spotlight.length === 0) return null;

  return (
    <div className="hero-live-summary">
      {performance && performance.settledCount > 0 && (
        <div className="hero-live-summary__figures">
          <Figure label="通算回収率" value={formatRecoveryRate(performance.roi)} highlight={performance.roi !== null && performance.roi >= 100} />
          <Figure label="的中率" value={`${performance.hitRate ?? 0}%`} />
          <Figure label="総回収額" value={formatYen(performance.totalReturn)} />
          <Figure label="収支" value={formatSignedYen(performance.profit)} highlight={performance.profit >= 0} />
        </div>
      )}
      {spotlight.map(settlement => (
        <div key={settlement.raceId} className="hero-live-summary__race">
          <div className="hero-live-summary__race-head">
            <span>{raceLabelById.get(settlement.raceId) ?? settlement.raceId}</span>
            {settlement.hasPrediction && (
              <strong style={{ color: settlement.hitStatus === "hit" ? "#6ee7b7" : settlement.hitStatus === "miss" ? "#fda4af" : "#f4d58b" }}>
                {hitStatusLabel(settlement.isHit)} 回収率 {formatRecoveryRate(settlement.recoveryRate)}
              </strong>
            )}
          </div>
          <div className="hero-live-summary__horses">
            {settlement.topThree.map(result => (
              <span key={`${result.position}-${result.horseNumber}`}>
                {result.position}着 {result.horseNumber}番 {result.horseName}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Figure({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="hero-live-summary__figure">
      <span>{label}</span>
      <strong style={highlight ? { color: "#6ee7b7" } : undefined}>{value}</strong>
    </div>
  );
}
