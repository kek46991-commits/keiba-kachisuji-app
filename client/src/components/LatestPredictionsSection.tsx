import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { formatRecoveryRate, formatYen, hitStatusLabel } from "@shared/settlementDisplay";
import { useMemo } from "react";
import { Link } from "wouter";

/**
 * 最新レースの予想・公式結果・回収率をまとめて表示する一覧セクション。
 * 中央・地方どちらのレースも同じ精算サマリーAPIから取得し、馬名は実名解決済みの値を表示する。
 * トップページと「今週の予想」ページで共有する。
 */
export function LatestPredictionsSection({ limit = 12, showLinks = true }: { limit?: number; showLinks?: boolean }) {
  const { data: races, isLoading } = trpc.raceData.getLatestRaces.useQuery({ limit }, { staleTime: 30_000 });
  const raceIds = useMemo(() => (races ?? []).map(race => race.raceId), [races]);
  const { data: settlements } = trpc.raceData.getRaceSettlements.useQuery({ raceIds }, { enabled: raceIds.length > 0 });
  const settlementByRace = useMemo(
    () => new Map((settlements ?? []).map(settlement => [settlement.raceId, settlement])),
    [settlements],
  );

  if (isLoading) {
    return <div className="py-12 text-center text-sm" style={{ color: "#64748b" }}>データを読み込み中...</div>;
  }

  if (!races || races.length === 0) {
    return (
      <Card className="border-0" style={{ backgroundColor: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.2)" }}>
        <CardContent className="py-12 text-center">
          <p className="text-lg mb-2" style={{ color: "#e2e8f0" }}>現在、登録済みのレースデータはありません</p>
          <p className="text-sm" style={{ color: "#64748b" }}>出走表が取り込まれ次第、AI解析予想と結果照合を自動で掲載します。</p>
        </CardContent>
      </Card>
    );
  }

  const byDate = races.reduce((acc: Record<string, typeof races>, race) => {
    if (!acc[race.raceDate]) acc[race.raceDate] = [];
    acc[race.raceDate]!.push(race);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(byDate)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, dayRaces]) => (
          <div key={date}>
            <h2 className="text-lg font-semibold mb-3" style={{ color: "#e2e8f0" }}>
              {new Date(date + "T00:00:00+09:00").toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" })}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {dayRaces.map(race => {
                const settlement = settlementByRace.get(race.raceId);
                const card = (
                  <Card
                    className="h-full border-0 transition-all duration-150 hover:scale-[1.01]"
                    style={{ backgroundColor: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.15)" }}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" style={{ borderColor: "rgba(201,168,76,0.4)", color: "#c9a84c", fontSize: "10px" }}>
                          {race.venueName} {race.raceNumber}R
                        </Badge>
                        {race.grade && (
                          <Badge
                            style={{
                              backgroundColor: race.grade.includes("G1") ? "#EF4444" : race.grade.includes("G2") ? "#3B82F6" : "#10B981",
                              color: "#fff",
                              fontSize: "10px",
                            }}
                          >
                            {race.grade}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-sm" style={{ color: "#e2e8f0" }}>{race.raceName}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-3 text-xs" style={{ color: "#64748b" }}>
                        {race.surface && <span>{race.surface === "turf" ? "芝" : race.surface === "dirt" ? "ダート" : "障害"}</span>}
                        {race.distance && <span>{race.distance}m</span>}
                        {race.postTime && <span>{race.postTime}発走</span>}
                        {race.headCount && <span>{race.headCount}頭</span>}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        {race.status === "upcoming" ? (
                          <Badge variant="outline" style={{ borderColor: "rgba(100,116,139,0.4)", color: "#64748b", fontSize: "10px" }}>出走表未発表</Badge>
                        ) : race.status === "entries_confirmed" ? (
                          <Badge variant="outline" style={{ borderColor: "rgba(59,130,246,0.4)", color: "#3B82F6", fontSize: "10px" }}>出走確定・予想準備中</Badge>
                        ) : (
                          <Badge variant="outline" style={{ borderColor: "rgba(16,185,129,0.4)", color: "#10B981", fontSize: "10px" }}>結果確定</Badge>
                        )}
                        <Badge variant="outline" style={{ borderColor: "rgba(201,168,76,0.3)", color: "#c9a84c", fontSize: "10px" }}>
                          {race.organizer === "NAR" ? "地方" : "中央"}
                        </Badge>
                      </div>
                      {settlement && settlement.topThree.length > 0 && (
                        <div className="mt-3 rounded-lg px-2.5 py-2" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(201,168,76,0.16)" }}>
                          <div className="text-[10px] mb-1" style={{ color: "#94a3b8" }}>レース結果（1〜3着）</div>
                          <div className="flex flex-wrap gap-1">
                            {settlement.topThree.map(result => (
                              <span
                                key={`${result.position}-${result.horseNumber}`}
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "rgba(201,168,76,0.08)", color: "#e4c875" }}
                              >
                                {result.position}着 {result.horseNumber}番 {result.horseName}
                              </span>
                            ))}
                          </div>
                          {settlement.hasPrediction && (
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: "#94a3b8" }}>
                              <span style={{ color: settlement.hitStatus === "hit" ? "#6ee7b7" : settlement.hitStatus === "miss" ? "#fda4af" : "#f4d58b" }}>
                                {hitStatusLabel(settlement.isHit)}
                              </span>
                              <span>回収 {formatYen(settlement.returnAmount)}</span>
                              <span style={{ color: settlement.recoveryRate !== null && settlement.recoveryRate >= 100 ? "#6ee7b7" : "#94a3b8" }}>
                                回収率 {formatRecoveryRate(settlement.recoveryRate)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );

                if (!showLinks) return <div key={race.raceId}>{card}</div>;

                const raceQuery = `date=${race.raceDate}&venue=${encodeURIComponent(race.venueName)}&race=${race.raceNumber}`;
                const href = race.status === "results_confirmed"
                  ? `/race-result?raceId=${race.raceId}`
                  : `${race.organizer === "NAR" ? "/nar-predictions" : "/predictions"}?${raceQuery}`;

                return (
                  <Link key={race.raceId} href={href} className="block">
                    {card}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
