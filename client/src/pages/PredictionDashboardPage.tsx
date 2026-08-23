import { useState } from "react";
import Navbar from "@/components/Navbar";
import { AnalysisMetricTooltip } from "@/components/AnalysisMetricTooltip";
import { DataQualityPanel } from "@/components/DataQualityPanel";
import { PerformanceSummaryPanel } from "@/components/PerformanceSummaryPanel";

/**
 * 総合予想ダッシュボード
 * AI・予想屋・調教師の3視点分析とShen AI体調スコアを統合表示
 */

// レーダーチャートコンポーネント（SVG）
function RadarChart({ data, labels, size = 180 }: { data: number[]; labels: string[]; size?: number }) {
  const center = size / 2;
  const radius = size * 0.38;
  const angleStep = (2 * Math.PI) / data.length;
  const circles = [0.2, 0.4, 0.6, 0.8, 1.0];

  const points = data.map((value, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const r = (value / 100) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {circles.map((scale, ci) => {
        const gridPoints = data.map((_, i) => {
          const angle = angleStep * i - Math.PI / 2;
          const r = scale * radius;
          return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
        });
        return <polygon key={ci} points={gridPoints.join(" ")} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />;
      })}
      {data.map((_, i) => {
        const angle = angleStep * i - Math.PI / 2;
        return <line key={i} x1={center} y1={center} x2={center + radius * Math.cos(angle)} y2={center + radius * Math.sin(angle)} stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />;
      })}
      <path d={pathD} fill="rgba(0, 200, 255, 0.2)" stroke="rgba(0, 200, 255, 0.8)" strokeWidth="1.5" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#00c8ff" />)}
      {labels.map((label, i) => {
        const angle = angleStep * i - Math.PI / 2;
        const labelR = radius + 22;
        return <text key={i} x={center + labelR * Math.cos(angle)} y={center + labelR * Math.sin(angle)} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.8)" fontSize="9">{label}</text>;
      })}
    </svg>
  );
}

function ScoreBar({ label, value, color = "#00c8ff", metric }: { label: string; value: number; color?: string; metric?: "ability" | "market" | "condition" }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs text-gray-400 w-20 shrink-0">{label}{metric && <AnalysisMetricTooltip metric={metric} value={value} />}</span>
      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-mono text-white w-8 text-right">{value}</span>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    S: "bg-gradient-to-r from-yellow-400 to-amber-500 text-black",
    A: "bg-gradient-to-r from-cyan-400 to-blue-500 text-white",
    B: "bg-gradient-to-r from-green-400 to-emerald-500 text-white",
    C: "bg-gradient-to-r from-gray-400 to-gray-500 text-white",
    D: "bg-gradient-to-r from-red-400 to-red-600 text-white",
  };
  return <span className={`px-3 py-1 rounded-full text-sm font-bold ${colors[level] || colors.C}`}>{level}ランク</span>;
}

function ViewCard({ title, icon, score, components, comment, color }: {
  title: string; icon: string; score: number; components: { label: string; value: number; metric?: "ability" | "market" | "condition" }[]; comment: string; color: string;
}) {
  return (
    <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h4 className="text-sm font-bold text-white">{title}</h4>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-2xl font-bold" style={{ color }}>{score}</span>
          <span className="text-xs text-gray-400">/100</span>
        </div>
      </div>
      <div className="space-y-0.5 mb-3">
        {components.map((c, i) => <ScoreBar key={i} label={c.label} value={c.value} color={color} metric={c.metric} />)}
      </div>
      <p className="text-xs text-gray-300 italic border-t border-gray-700 pt-2">{comment}</p>
    </div>
  );
}

function HorseAnalysisCard({ analysis, isExpanded, onToggle }: { analysis: any; isExpanded: boolean; onToggle: () => void }) {
  const { horseNumber, horseName, jockey, rating, threeView, shenDiagnosis } = analysis;
  const { ai, tipster, trainer, overall } = threeView;
  const ratingColors: Record<string, string> = { "◎": "#ff4444", "○": "#ff8800", "▲": "#ffcc00", "△": "#88cc00", "☆": "#888888" };

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-xl overflow-hidden mb-3">
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/50 transition-colors" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold w-8 text-center" style={{ color: ratingColors[rating] || "#fff" }}>{rating}</span>
          <div className="flex items-center gap-2">
            <span className="bg-gray-700 text-white text-xs font-bold px-2 py-0.5 rounded">{horseNumber}</span>
            <span className="text-white font-bold">{horseName}</span>
            <span className="text-gray-400 text-sm">({jockey})</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ConfidenceBadge level={overall.confidence} />
          <div className="text-right">
            <div className="text-xl font-bold text-white">{overall.total}</div>
            <div className="text-xs text-gray-400">総合点</div>
          </div>
          <span className="text-gray-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-700 p-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center"><div className="text-xs text-gray-400 mb-1">AI分析</div><div className="text-lg font-bold text-cyan-400">{ai.total}</div></div>
            <div className="text-center"><div className="text-xs text-gray-400 mb-1">予想屋</div><div className="text-lg font-bold text-amber-400">{tipster.total}</div></div>
            <div className="text-center"><div className="text-xs text-gray-400 mb-1">調教師</div><div className="text-lg font-bold text-green-400">{trainer.total}</div></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="flex flex-col items-center justify-center">
              <RadarChart
                data={[ai.components.baseAbility, ai.components.bloodline, tipster.components.expectedValue, tipster.components.jockeyFactor, trainer.components.condition, trainer.components.rotation]}
                labels={["能力", "血統", "市場", "騎手", "体調", "ローテ"]}
              />
            </div>
            <ViewCard title="AI分析" icon="🤖" score={ai.total} color="#00c8ff" components={[
              { label: "基礎能力", value: ai.components.baseAbility, metric: "ability" }, { label: "血統適性", value: ai.components.bloodline, metric: "ability" },
              { label: "コース", value: ai.components.courseAffinity }, { label: "展開予測", value: ai.components.pacePredict }, { label: "クラス", value: ai.components.classLevel },
            ]} comment={ai.comment} />
            <ViewCard title="予想屋" icon="🎯" score={tipster.total} color="#ffaa00" components={[
              { label: "オッズ妙味", value: tipster.components.oddsValue, metric: "market" }, { label: "人気信頼", value: tipster.components.popularity, metric: "market" },
              { label: "市場評価", value: tipster.components.expectedValue, metric: "market" }, { label: "騎手力", value: tipster.components.jockeyFactor, metric: "ability" }, { label: "枠順", value: tipster.components.gateFactor, metric: "ability" },
            ]} comment={tipster.comment} />
            <ViewCard title="調教師" icon="🏋️" score={trainer.total} color="#44cc44" components={[
              { label: "体調", value: trainer.components.condition, metric: "condition" }, { label: "ローテ", value: trainer.components.rotation, metric: "condition" },
              { label: "馬体重", value: trainer.components.weightTrend, metric: "condition" }, { label: "年齢適性", value: trainer.components.ageFitness, metric: "condition" }, { label: "精神状態", value: trainer.components.mentalState, metric: "condition" },
            ]} comment={trainer.comment} />
          </div>

          <div className="mt-4 bg-gray-800/80 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0"><ConfidenceBadge level={overall.confidence} /></div>
              <div className="flex-1">
                <p className="text-sm text-white mb-2">{overall.verdict}</p>
                <div className="flex flex-wrap gap-4">
                  {overall.strongPoints.length > 0 && (
                    <div>
                      <span className="text-xs text-green-400 font-bold">強み: </span>
                      {overall.strongPoints.map((s: string, i: number) => <span key={i} className="text-xs bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded mr-1">{s}</span>)}
                    </div>
                  )}
                  {overall.riskFactors.length > 0 && (
                    <div>
                      <span className="text-xs text-red-400 font-bold">リスク: </span>
                      {overall.riskFactors.map((r: string, i: number) => <span key={i} className="text-xs bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded mr-1">{r}</span>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {shenDiagnosis && (
            <div className="mt-3 bg-indigo-900/30 border border-indigo-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">🔮</span>
                <span className="text-xs font-bold text-indigo-300">Shen AI 体調診断</span>
              </div>
              <p className="text-xs text-indigo-200">{shenDiagnosis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PredictionDashboardPage() {
  const [expandedHorse, setExpandedHorse] = useState<number | null>(null);
  const analysisResults: any[] = [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      <Navbar />
      <div className="container max-w-6xl mx-auto px-4 pt-24 pb-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">🎯 総合予想ダッシュボード</h1>
          <p className="text-gray-400 text-sm">AI・予想屋・調教師の3視点分析 × Shen AI体調診断</p>
        </div>

        <PerformanceSummaryPanel />

        <DataQualityPanel />

        {/* 分析結果 */}
        {analysisResults.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {analysisResults.slice(0, 4).map((a: any, i: number) => {
                const bgColors = ["from-red-900/40 to-red-800/20", "from-orange-900/40 to-orange-800/20", "from-yellow-900/40 to-yellow-800/20", "from-green-900/40 to-green-800/20"];
                const labels = ["◎ 本命", "○ 対抗", "▲ 単穴", "△ 連下"];
                return (
                  <div key={i} className={`bg-gradient-to-br ${bgColors[i]} border border-gray-700 rounded-xl p-3 text-center`}>
                    <div className="text-xs text-gray-400 mb-1">{labels[i]}</div>
                    <div className="text-lg font-bold text-white">{a.horseName}</div>
                    <div className="flex items-center justify-center gap-1 mt-1"><ConfidenceBadge level={a.threeView.overall.confidence} /></div>
                    <div className="text-2xl font-bold text-white mt-1">{a.threeView.overall.total}</div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-0">
              {analysisResults.map((analysis: any, index: number) => (
                <HorseAnalysisCard key={analysis.horseNumber} analysis={analysis} isExpanded={expandedHorse === index} onToggle={() => setExpandedHorse(expandedHorse === index ? null : index)} />
              ))}
            </div>
          </>
        )}

        {/* 未分析時のガイド */}
        {analysisResults.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-bold text-white mb-2">3視点総合分析</h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
              三支点総合は通常の地方競馬予想へ自動統合されました。レースを選び、通常の「予想を実行」から統合スコアをご確認ください。
            </p>
            <a href="/nar-predictions" className="inline-flex items-center justify-center rounded-lg border border-cyan-400/35 bg-cyan-400/10 px-5 py-2.5 text-sm font-bold text-cyan-200">地方競馬の予想へ</a>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
              <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4">
                <div className="text-2xl mb-2">🤖</div>
                <h4 className="text-sm font-bold text-cyan-400 mb-1">AI視点</h4>
                <p className="text-xs text-gray-400">統計データ・血統・展開予測に基づく客観的分析</p>
              </div>
              <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4">
                <div className="text-2xl mb-2">🎯</div>
                <h4 className="text-sm font-bold text-amber-400 mb-1">予想屋視点</h4>
                <p className="text-xs text-gray-400">オッズ妙味・期待値・騎手力から見た買い価値</p>
              </div>
              <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4">
                <div className="text-2xl mb-2">🏋️</div>
                <h4 className="text-sm font-bold text-green-400 mb-1">調教師視点</h4>
                <p className="text-xs text-gray-400">体調・仕上がり・ローテーション・精神状態</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
