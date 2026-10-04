import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { useInView } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

// ─────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────

const overallData = [
  { name: "阪神", rate: 64.5, color: "#00E5FF" },
  { name: "京都", rate: 64.5, color: "#00E5FF" },
  { name: "札幌", rate: 64.5, color: "#00E5FF" },
  { name: "中京", rate: 64.0, color: "#3B82F6" },
  { name: "東京", rate: 63.5, color: "#3B82F6" },
  { name: "中山", rate: 63.5, color: "#3B82F6" },
  { name: "新潟", rate: 63.0, color: "#3B82F6" },
  { name: "函館", rate: 62.0, color: "#1E3A8A" },
  { name: "小倉", rate: 61.0, color: "#1E3A8A" },
  { name: "福島", rate: 58.0, color: "#EF4444" },
];

const nakayamaData = [
  { name: "ダート1200m", rate: 65, tag: "高", tagColor: "#00E5FF" },
  { name: "ダート1800m", rate: 63, tag: "中〜高", tagColor: "#3B82F6" },
  { name: "芝・外回り", rate: 63, tag: "中〜高", tagColor: "#3B82F6" },
  { name: "芝・内回り", rate: 59, tag: "低", tagColor: "#EF4444" },
];

const nakayamaRaceFlow = [
  { race: "1〜4R", rate: 66.5, label: "午前・未勝利戦", color: "#00E5FF" },
  { race: "5〜9R", rate: 61, label: "午後・条件戦", color: "#3B82F6" },
  { race: "11R", rate: 68, label: "メイン(G1)", color: "#00E5FF" },
  { race: "12R", rate: 58, label: "最終・要注意", color: "#EF4444" },
];

const niigataData = [
  { name: "芝・外回り", rate: 68, tag: "非常に高", tagColor: "#00E5FF" },
  { name: "ダート全般", rate: 64, tag: "中〜高", tagColor: "#3B82F6" },
  { name: "直線1000m(外枠)", rate: 71, tag: "超鉄板", tagColor: "#00E5FF" },
  { name: "芝・内回り", rate: 57, tag: "低", tagColor: "#EF4444" },
  { name: "直線1000m(内枠)", rate: 52, tag: "危険", tagColor: "#EF4444" },
];

const niigataRaceFlow = [
  { race: "1〜4R", rate: 67.5, label: "午前・未勝利戦", color: "#00E5FF" },
  { race: "5〜9R", rate: 61, label: "午後・条件戦", color: "#3B82F6" },
  { race: "11R", rate: 67, label: "メイン(外回り)", color: "#00E5FF" },
  { race: "12R", rate: 60, label: "最終(枠順注意)", color: "#F59E0B" },
];

const sapporoData = [
  { name: "ダート1700m", rate: 67, tag: "超鉄板", tagColor: "#00E5FF" },
  { name: "芝1800m・2000m", rate: 66, tag: "高い", tagColor: "#00E5FF" },
  { name: "芝1500m", rate: 65, tag: "高い", tagColor: "#3B82F6" },
  { name: "芝1200m", rate: 59, tag: "中〜低", tagColor: "#F59E0B" },
  { name: "ダート1000m", rate: 57, tag: "警戒", tagColor: "#EF4444" },
];

const sapporoRaceFlow = [
  { race: "1〜4R", rate: 68.5, label: "午前・未勝利戦", color: "#00E5FF" },
  { race: "5〜9R", rate: 64, label: "午後・条件戦", color: "#3B82F6" },
  { race: "11R", rate: 66, label: "メイン(重賞)", color: "#00E5FF" },
  { race: "12R", rate: 61, label: "最終(洋芝消耗注意)", color: "#F59E0B" },
];

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: "#0D1530",
        border: "1px solid rgba(0,229,255,0.3)",
        padding: "8px 14px",
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        <p style={{ color: "#00E5FF", fontWeight: 700 }}>{label}</p>
        <p style={{ color: "white" }}>{payload[0].value}%</p>
      </div>
    );
  }
  return null;
};

function TerminalPanel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div style={{
      backgroundColor: "rgba(6, 13, 30, 0.8)",
      border: "1px solid rgba(0,229,255,0.2)",
    }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid rgba(0,229,255,0.15)", backgroundColor: "rgba(0,229,255,0.03)" }}>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#EF4444" }} />
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#F59E0B" }} />
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#00E5FF" }} />
        </div>
        <span className="text-xs font-bold ml-1" style={{ color: "rgba(0,229,255,0.6)", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px" }}>
          {title}
        </span>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function RateBar({ rate, max = 80, color }: { rate: number; max?: number; color: string }) {
  return (
    <div className="relative h-6 w-full" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
      <motion.div
        initial={{ width: 0 }}
        whileInView={{ width: `${((rate - 40) / (max - 40)) * 100}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="h-full flex items-center justify-end pr-2"
        style={{ backgroundColor: color, minWidth: "2px" }}
      />
      <span className="absolute right-2 top-0 h-full flex items-center text-xs font-bold text-white"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {rate}%
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Nakayama Detail Tab
// ─────────────────────────────────────────────

function NakayamaTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      {/* Header stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "全体平均複勝率", value: "63.5%", sub: "全国平均 64.2%", color: "#3B82F6" },
          { label: "直線距離", value: "310m", sub: "全国最短クラス", color: "#EF4444" },
          { label: "急坂高低差", value: "2.2m", sub: "心臓破りの坂", color: "#F59E0B" },
          { label: "G1開催数", value: "3本", sub: "有馬・皐月・スプリンターズ", color: "#00E5FF" },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: "16px 20px", backgroundColor: "rgba(13,21,48,0.7)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <div className="text-xs text-slate-500 mb-1" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>{stat.label}</div>
            <div className="text-2xl font-black" style={{ color: stat.color, fontFamily: "'Space Grotesk', sans-serif" }}>{stat.value}</div>
            <div className="text-xs text-slate-500 mt-1">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Race flow chart */}
        <TerminalPanel title="RACE_FLOW — TIME_SERIES">
          <div className="section-eyebrow mb-4">レース番号別 複勝率推移</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={nakayamaRaceFlow} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="race" tick={{ fill: "#FFFFFF", fontFamily: "'Space Grotesk'", fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                <YAxis domain={[40, 80]} tick={{ fill: "rgba(255,255,255,0.4)", fontFamily: "'Space Grotesk'", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={63.5} stroke="rgba(0,229,255,0.4)" strokeDasharray="4 4" label={{ value: "平均63.5%", fill: "rgba(0,229,255,0.6)", fontSize: 10, fontFamily: "'Space Grotesk'" }} />
                <Bar dataKey="rate" radius={[2, 2, 0, 0]}>
                  {nakayamaRaceFlow.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1">
            {nakayamaRaceFlow.map((r) => (
              <div key={r.race} className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                <span style={{ color: r.color }}>{r.race}</span>
                <span>{r.label}</span>
                <span className="font-bold" style={{ color: r.color }}>{r.rate}%</span>
              </div>
            ))}
          </div>
        </TerminalPanel>

        {/* Course data */}
        <TerminalPanel title="COURSE_DATA — NAKAYAMA">
          <div className="section-eyebrow mb-4">コース別 1番人気複勝率</div>
          <div className="space-y-4">
            {nakayamaData.map((d) => (
              <div key={d.name}>
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>{d.name}</span>
                    <span className="px-1.5 py-0.5 text-xs font-bold" style={{ backgroundColor: `${d.tagColor}20`, border: `1px solid ${d.tagColor}`, color: d.tagColor, fontFamily: "'Space Grotesk', sans-serif" }}>{d.tag}</span>
                  </div>
                  <span className="text-sm font-black" style={{ color: d.tagColor, fontFamily: "'Space Grotesk', sans-serif" }}>{d.rate}%</span>
                </div>
                <RateBar rate={d.rate} color={d.tagColor} />
              </div>
            ))}
          </div>
        </TerminalPanel>
      </div>

      {/* Strategy summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div style={{ padding: "24px", backgroundColor: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.25)", borderLeft: "4px solid #00E5FF" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="cyan-dot" />
            <span className="font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", fontSize: "13px" }}>TARGET — 狙い目</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
            <li>• ダート1200mで <strong className="text-white">「外枠」</strong>を引いた快速馬</li>
            <li>• 中山巧者（ルメール・戸崎・横山武史）騎乗の1番人気</li>
            <li>• G1・重賞メインレース（11R）の能力上位馬</li>
            <li>• 午前中のダート未勝利戦（1〜4R）</li>
          </ul>
        </div>
        <div style={{ padding: "24px", backgroundColor: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.25)", borderLeft: "4px solid #EF4444" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="cyan-dot" style={{ backgroundColor: "#EF4444", boxShadow: "0 0 8px rgba(239,68,68,0.7)" }} />
            <span className="font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", fontSize: "13px" }}>WARNING — 警戒</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
            <li>• 芝・内回りで <strong className="text-white">「大外枠」</strong>の差し脚質馬</li>
            <li>• 最終12R（馬場荒れ＋急坂でパワー切れ）</li>
            <li>• 東京ダート1600mから距離延長の人気馬</li>
            <li>• 4コーナー後方に置かれやすい差し馬（直線310m）</li>
          </ul>
        </div>
      </div>

      {/* Key insight */}
      <div style={{ padding: "20px 24px", backgroundColor: "rgba(13,21,48,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="section-eyebrow mb-2">KEY INSIGHT</div>
        <p className="text-slate-300 leading-relaxed" style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: "14px" }}>
          東京競馬場のような直線の瞬発力勝負とは真逆で、<strong className="text-white">「器用さ」「スタミナ」「坂を苦にしないパワー」</strong>が求められます。
          1番人気を軸にする際は、その馬が「中山の坂と小回りをこなせる実績があるか」を過去走から精査するのが、統計的にも最も狂いのない戦略です。
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Niigata Detail Tab
// ─────────────────────────────────────────────

function NiigataTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      {/* Header stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "全体平均複勝率", value: "63%", sub: "全国平均 64.2%", color: "#3B82F6" },
          { label: "外回り直線距離", value: "659m", sub: "日本一の長さ", color: "#00E5FF" },
          { label: "直線専用コース", value: "1000m", sub: "日本唯一の千直", color: "#00E5FF" },
          { label: "千直外枠複勝率", value: "70%+", sub: "超鉄板データ", color: "#00E5FF" },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: "16px 20px", backgroundColor: "rgba(13,21,48,0.7)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <div className="text-xs text-slate-500 mb-1" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>{stat.label}</div>
            <div className="text-2xl font-black" style={{ color: stat.color, fontFamily: "'Space Grotesk', sans-serif" }}>{stat.value}</div>
            <div className="text-xs text-slate-500 mt-1">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Race flow chart */}
        <TerminalPanel title="RACE_FLOW — TIME_SERIES">
          <div className="section-eyebrow mb-4">レース番号別 複勝率推移</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={niigataRaceFlow} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="race" tick={{ fill: "#FFFFFF", fontFamily: "'Space Grotesk'", fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                <YAxis domain={[40, 80]} tick={{ fill: "rgba(255,255,255,0.4)", fontFamily: "'Space Grotesk'", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={63} stroke="rgba(0,229,255,0.4)" strokeDasharray="4 4" label={{ value: "平均63%", fill: "rgba(0,229,255,0.6)", fontSize: 10, fontFamily: "'Space Grotesk'" }} />
                <Bar dataKey="rate" radius={[2, 2, 0, 0]}>
                  {niigataRaceFlow.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1">
            {niigataRaceFlow.map((r) => (
              <div key={r.race} className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                <span style={{ color: r.color }}>{r.race}</span>
                <span>{r.label}</span>
                <span className="font-bold" style={{ color: r.color }}>{r.rate}%</span>
              </div>
            ))}
          </div>
        </TerminalPanel>

        {/* Course data */}
        <TerminalPanel title="COURSE_DATA — NIIGATA">
          <div className="section-eyebrow mb-4">コース別 1番人気複勝率</div>
          <div className="space-y-4">
            {niigataData.map((d) => (
              <div key={d.name}>
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>{d.name}</span>
                    <span className="px-1.5 py-0.5 text-xs font-bold" style={{ backgroundColor: `${d.tagColor}20`, border: `1px solid ${d.tagColor}`, color: d.tagColor, fontFamily: "'Space Grotesk', sans-serif" }}>{d.tag}</span>
                  </div>
                  <span className="text-sm font-black" style={{ color: d.tagColor, fontFamily: "'Space Grotesk', sans-serif" }}>{d.rate}%</span>
                </div>
                <RateBar rate={d.rate} max={80} color={d.tagColor} />
              </div>
            ))}
          </div>
        </TerminalPanel>
      </div>

      {/* Sencho special callout */}
      <div style={{ padding: "24px", backgroundColor: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.3)" }}>
        <div className="section-eyebrow mb-3">SPECIAL CONDITION — 千直（直線1000m）</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-black" style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}>70%+</span>
              <span className="text-sm" style={{ color: "rgba(0,229,255,0.7)" }}>外枠（7〜8枠）</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
              1番人気が外枠を引いた場合、荒れた馬場を避けてスムーズに加速できるため、複勝率は70%を超える超鉄板データになります。
            </p>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-black" style={{ color: "#EF4444", fontFamily: "'Space Grotesk', sans-serif" }}>52%</span>
              <span className="text-sm" style={{ color: "rgba(239,68,68,0.7)" }}>内枠（1〜3枠）</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
              同じ1番人気でも内枠に閉じ込められると、荒れた馬場を走らされ信頼度が50%台まで急落。枠順確認が必須です。
            </p>
          </div>
        </div>
      </div>

      {/* Strategy summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div style={{ padding: "24px", backgroundColor: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.25)", borderLeft: "4px solid #00E5FF" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="cyan-dot" />
            <span className="font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", fontSize: "13px" }}>TARGET — 狙い目</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
            <li>• 芝 <strong className="text-white">「外回り」</strong>の1番人気（直線659mで実力通り）</li>
            <li>• 直線1000mで <strong className="text-white">「外枠（7〜8枠）」</strong>を引いた1番人気</li>
            <li>• 午前中のダート未勝利戦（1〜4R）</li>
            <li>• 関屋記念・新潟大賞典など外回り重賞</li>
          </ul>
        </div>
        <div style={{ padding: "24px", backgroundColor: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.25)", borderLeft: "4px solid #EF4444" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="cyan-dot" style={{ backgroundColor: "#EF4444", boxShadow: "0 0 8px rgba(239,68,68,0.7)" }} />
            <span className="font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", fontSize: "13px" }}>WARNING — 警戒</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
            <li>• 芝 <strong className="text-white">「内回り」</strong>で後方から行く1番人気</li>
            <li>• 直線1000mで <strong className="text-white">「内枠（1〜3枠）」</strong>の1番人気</li>
            <li>• 最終12R（枠順・馬場状態を要確認）</li>
            <li>• 午後の条件戦（前残り多発ゾーン）</li>
          </ul>
        </div>
      </div>

      <div style={{ padding: "20px 24px", backgroundColor: "rgba(13,21,48,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="section-eyebrow mb-2">KEY INSIGHT</div>
        <p className="text-slate-300 leading-relaxed" style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: "14px" }}>
          東京競馬場に似た「実力通りに決まる外回り」と、地方ローカルのような「立ち回りが要求される内回り・千直内枠」の性質を綺麗に使い分けることが、
          新潟での統計的な勝率をガツンと引き上げる鍵になります。
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────

function OverviewTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <div className="section-eyebrow mb-4">全競馬場 1番人気複勝率比較 (%)</div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overallData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#FFFFFF", fontFamily: "'Noto Sans JP'", fontSize: 12, fontWeight: 700 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                <YAxis domain={[56, 66]} ticks={[56, 58, 60, 62, 64, 66]} tick={{ fill: "rgba(255,255,255,0.4)", fontFamily: "'Space Grotesk'", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={64.2} stroke="rgba(0,229,255,0.4)" strokeDasharray="4 4" label={{ value: "全国平均64.2%", fill: "rgba(0,229,255,0.6)", fontSize: 10, fontFamily: "'Space Grotesk'" }} />
                <Bar dataKey="rate" radius={[2, 2, 0, 0]}>
                  {overallData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

          <div className="space-y-2">
          {overallData.map((v) => (
            <div key={v.name} style={{ padding: "12px 16px", backgroundColor: "rgba(13,21,48,0.6)", borderLeft: `3px solid ${v.color}` }}>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-white text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>{v.name}競馬場</span>
                <span className="font-black" style={{ color: v.color, fontFamily: "'Space Grotesk', sans-serif", fontSize: "15px" }}>{v.rate}%</span>
              </div>
              <div className="h-1.5 w-full" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${((v.rate - 56) / 10) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8 }}
                  className="h-full"
                  style={{ backgroundColor: v.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 24px", backgroundColor: "rgba(13,21,48,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="section-eyebrow mb-2">OVERVIEW NOTE</div>
        <p className="text-slate-300 leading-relaxed text-sm" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
          全国平均（約64.2%）に対し、競馬場ごとに最大6.5ポイントの差が生じます（阪神64.5% vs 福島58.0%）。
          特に<strong className="text-white">中山・新潟・中京</strong>は「コース条件・枠順・時間帯」によって信頼度が大きく変動するため、
          詳細タブで各競馬場のコース別データを確認することを推奨します。
          なお、<strong className="text-white">福島（58.0%）</strong>は全国最低水準で、コース特性上の紛れが多く、1番人気の信頼度が最も低い競馬場です。
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Sapporo Detail Tab
// ─────────────────────────────────────────────

function SapporoTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      {/* Header stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "全体平均複勝率", value: "64.5%", sub: "主要四場並み", color: "#00E5FF" },
          { label: "ダート1700m複勝率", value: "67%", sub: "超鉄板データ", color: "#00E5FF" },
          { label: "高低差", value: "ゼロ", sub: "日本一の平坦コース", color: "#3B82F6" },
          { label: "主要重賞", value: "3本", sub: "札幌記念・Qス・キーンランドC", color: "#3B82F6" },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: "16px 20px", backgroundColor: "rgba(13,21,48,0.7)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <div className="text-xs text-slate-500 mb-1" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>{stat.label}</div>
            <div className="text-2xl font-black" style={{ color: stat.color, fontFamily: "'Space Grotesk', sans-serif" }}>{stat.value}</div>
            <div className="text-xs text-slate-500 mt-1">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Race flow chart */}
        <TerminalPanel title="RACE_FLOW — TIME_SERIES">
          <div className="section-eyebrow mb-4">レース番号別 複勝率推移</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sapporoRaceFlow} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="race" tick={{ fill: "#FFFFFF", fontFamily: "'Space Grotesk'", fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                <YAxis domain={[40, 80]} tick={{ fill: "rgba(255,255,255,0.4)", fontFamily: "'Space Grotesk'", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine y={64.5} stroke="rgba(0,229,255,0.4)" strokeDasharray="4 4" label={{ value: "平均64.5%", fill: "rgba(0,229,255,0.6)", fontSize: 10, fontFamily: "'Space Grotesk'" }} />
                <Bar dataKey="rate" radius={[2, 2, 0, 0]}>
                  {sapporoRaceFlow.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1">
            {sapporoRaceFlow.map((r) => (
              <div key={r.race} className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                <span style={{ color: r.color }}>{r.race}</span>
                <span>{r.label}</span>
                <span className="font-bold" style={{ color: r.color }}>{r.rate}%</span>
              </div>
            ))}
          </div>
        </TerminalPanel>

        {/* Course data */}
        <TerminalPanel title="COURSE_DATA — SAPPORO">
          <div className="section-eyebrow mb-4">コース別 1番人気複勝率</div>
          <div className="space-y-4">
            {sapporoData.map((d) => (
              <div key={d.name}>
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>{d.name}</span>
                    <span className="px-1.5 py-0.5 text-xs font-bold" style={{ backgroundColor: `${d.tagColor}20`, border: `1px solid ${d.tagColor}`, color: d.tagColor, fontFamily: "'Space Grotesk', sans-serif" }}>{d.tag}</span>
                  </div>
                  <span className="text-sm font-black" style={{ color: d.tagColor, fontFamily: "'Space Grotesk', sans-serif" }}>{d.rate}%</span>
                </div>
                <RateBar rate={d.rate} color={d.tagColor} />
              </div>
            ))}
          </div>
        </TerminalPanel>
      </div>

      {/* Sapporo vs Hakodate comparison */}
      <div style={{ padding: "24px", backgroundColor: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.3)" }}>
        <div className="section-eyebrow mb-3">SPECIAL ANALYSIS — 札幌 vs 函館 (同じ洋芝なのになぜ差が出るのか)</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-black" style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}>64.5%</span>
              <span className="text-sm" style={{ color: "rgba(0,229,255,0.7)" }}>札幌（平坦・緩コーナー）</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
              完全に平坦でコーナーが巨大かつ緩やかなため、東京・京都のように「スピードを落とさず外から力ずくねじ伏せる競馬」が可能。
              展開の紛れが少なく、実力馬が順当に上位を占める。
            </p>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-black" style={{ color: "#1E3A8A", fontFamily: "'Space Grotesk', sans-serif" }}>62%</span>
              <span className="text-sm" style={{ color: "rgba(100,116,139,0.8)" }}>函館（起伏あり・キツコーナー）</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
              アップダウンありコーナーがキツいため、器用さや立ち回りで穴馬が激走しやすい。
              1番人気が飛びやすい典型的なローカル競馬場の性質。
            </p>
          </div>
        </div>
      </div>

      {/* Strategy summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div style={{ padding: "24px", backgroundColor: "rgba(0,229,255,0.04)", border: "1px solid rgba(0,229,255,0.25)", borderLeft: "4px solid #00E5FF" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="cyan-dot" />
            <span className="font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", fontSize: "13px" }}>TARGET — 狙い目</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
            <li>・ ダート1700mの1番人気（<strong className="text-white">超鉄板データ</strong>）</li>
            <li>・ 芝1800m以上の主要レース（実力勝負）</li>
            <li>・ <strong className="text-white">洋芝巧者の血統</strong>を持つ滞在種牡馬の1番人気</li>
            <li>・ 札幌記念（G2）など主要重賞の能力上位馬</li>
          </ul>
        </div>
        <div style={{ padding: "24px", backgroundColor: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.25)", borderLeft: "4px solid #EF4444" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="cyan-dot" style={{ backgroundColor: "#EF4444", boxShadow: "0 0 8px rgba(239,68,68,0.7)" }} />
            <span className="font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", fontSize: "13px" }}>WARNING — 警戒</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-300" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
            <li>・ 開催後半の<strong className="text-white">洋芝がボロボロ</strong>な状態の芝1200m</li>
            <li>・ ダート1000m（ハイペースによる級れ多発）</li>
            <li>・ 最終12R（马場の荒れ具合を要確認）</li>
          </ul>
        </div>
      </div>

      <div style={{ padding: "20px 24px", backgroundColor: "rgba(13,21,48,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="section-eyebrow mb-2">KEY INSIGHT</div>
        <p className="text-slate-300 leading-relaxed" style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: "14px" }}>
          「ローカルだから荒れるだろう」という先入観は札幌では禁物です。
          札幌は、<strong className="text-white">「能力のある1番人気が、コースの癸に邪魔されず実力を出し切りやすい競馬場」</strong>と統計から言い切ることができます。
          同じ洋芝の函館（約62%）と比べて約2.5ポイント高い複勝率は、コーナーの形状と高低差の違いが直接結果に反映されている証拠です。
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Main Section
// ─────────────────────────────────────────────

const tabs = [
  { id: "overview", label: "全競馬場", labelEn: "OVERVIEW" },
  { id: "nakayama", label: "中山", labelEn: "NAKAYAMA" },
  { id: "niigata", label: "新潟", labelEn: "NIIGATA" },
  { id: "sapporo", label: "札幌", labelEn: "SAPPORO" },
];

export default function VenueDataSection() {
  const [activeTab, setActiveTab] = useState("overview");
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="venue-data" className="py-24 relative" style={{ backgroundColor: "#0A1128" }}>
      {/* Background grid */}
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(0, 229, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.03) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="container relative z-10 px-6 lg:px-10">
        {/* Section header */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <div className="section-eyebrow mb-4">VENUE DATA ANALYSIS</div>
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-4"
            style={{ fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: "1px" }}>
            競馬場別データ解析
          </h2>
          <p className="text-slate-400 text-lg">
            「鉄板コース」と「地雷コース」を数値で見極め、期待値を最大化する
          </p>
        </motion.div>

        {/* Tab navigation - mobile scroll */}
        <div className="mb-8 overflow-x-auto" style={{ borderBottom: "1px solid rgba(0,229,255,0.15)" }}>
          <div className="flex gap-0" style={{ minWidth: "max-content" }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative text-left transition-all duration-150 flex-shrink-0"
                style={{
                  padding: "12px 20px",
                  backgroundColor: activeTab === tab.id ? "rgba(0,229,255,0.06)" : "transparent",
                  borderBottom: activeTab === tab.id ? "2px solid #00E5FF" : "2px solid transparent",
                  marginBottom: "-1px",
                }}
              >
                <div className="section-eyebrow" style={{ color: activeTab === tab.id ? "#00E5FF" : "rgba(0,229,255,0.4)", marginBottom: "2px", fontSize: "9px" }}>
                  {tab.labelEn}
                </div>
                <div className="text-sm font-bold" style={{ color: activeTab === tab.id ? "white" : "rgba(255,255,255,0.5)", fontFamily: "'Noto Sans JP', sans-serif" }}>
                  {tab.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "nakayama" && <NakayamaTab />}
        {activeTab === "niigata" && <NiigataTab />}
        {activeTab === "sapporo" && <SapporoTab />}
      </div>
    </section>
  );
}
