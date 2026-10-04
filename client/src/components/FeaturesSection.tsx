import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";

const features = [
  {
    number: "01",
    title: "期待値スコアリング",
    titleEn: "EXPECTATION SCORING",
    metric: "60+",
    metricLabel: "スコア要素",
    desc: "出馬表データを解析し、各馬の勝率・複勝率を独自のアルゴリズムでスコア化。「買うべき馬」が一目でわかります。",
    detail: "基礎点（60点）に物理補正・状態補正を加算し、全出走馬を客観的に数値化。",
  },
  {
    number: "02",
    title: "買い目自動算出",
    titleEn: "AUTO BET CALCULATION",
    metric: "∞",
    metricLabel: "組み合わせ",
    desc: "スコア上位馬から、最も期待値の高い買い目（馬連・3連複など）と推奨投資配分を自動で提案します。",
    detail: "ボックス買いの組み合わせ点数・総投資額も即座に計算。資金管理を最適化します。",
  },
  {
    number: "03",
    title: "競馬場別データ分析",
    titleEn: "VENUE DATA ANALYSIS",
    metric: "10",
    metricLabel: "競馬場",
    desc: "全国の競馬場・コースごとの1番人気信頼度や荒れやすさを可視化。レース選びの精度を劇的に向上させます。",
    detail: "阪神・京都の「鉄板コース」から函館記念の「地雷コース」まで、データで判断できます。",
  },
];

function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.15 }}
      className="relative bracket-frame"
      style={{
        backgroundColor: "rgba(13, 21, 48, 0.8)",
        border: "1px solid rgba(59, 130, 246, 0.2)",
        padding: "40px",
      }}
    >
      {/* Terminal header bar */}
      <div
        className="flex items-center gap-2 mb-6 pb-3"
        style={{ borderBottom: "1px solid rgba(0,229,255,0.15)" }}
      >
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#EF4444" }} />
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#F59E0B" }} />
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#00E5FF" }} />
        <span
          className="ml-2 text-xs"
          style={{ color: "rgba(0,229,255,0.5)", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px" }}
        >
          MODULE_{feature.number}
        </span>
      </div>

      {/* Metric */}
      <div className="flex items-baseline gap-2 mb-4">
        <span
          className="text-5xl font-black leading-none"
          style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#00E5FF" }}
        >
          {feature.metric}
        </span>
        <span
          className="text-sm font-bold"
          style={{ color: "rgba(0,229,255,0.6)", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {feature.metricLabel}
        </span>
      </div>

      <div className="section-eyebrow mb-3">{feature.titleEn}</div>

      <h3
        className="text-2xl font-bold text-white mb-4"
        style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
      >
        {feature.title}
      </h3>

      <p className="text-slate-300 leading-relaxed mb-6" style={{ fontSize: "15px" }}>
        {feature.desc}
      </p>

      <div
        className="text-sm text-slate-400 leading-relaxed pt-6"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        {feature.detail}
      </div>

      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5"
        style={{ background: "linear-gradient(90deg, #3B82F6, #00E5FF)" }}
      />
    </motion.div>
  );
}

export default function FeaturesSection() {
  const titleRef = useRef(null);
  const titleInView = useInView(titleRef, { once: true, margin: "-60px" });

  return (
    <section
      id="features"
      className="py-24 relative"
      style={{ backgroundColor: "#0A1128" }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0, 229, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="container relative z-10 px-6 lg:px-10">
        {/* Section header */}
        <motion.div
          ref={titleRef}
          initial={{ opacity: 0, y: 20 }}
          animate={titleInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <div className="section-eyebrow mb-4">CORE MODULES — 3 FUNCTIONS</div>
          <div className="flex items-end gap-6">
            <h2
              className="text-4xl lg:text-5xl font-black text-white"
              style={{ fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: "1px" }}
            >
              解析エンジンの構造
            </h2>
            <div
              className="hidden lg:block h-px flex-1 mb-4"
              style={{ background: "linear-gradient(90deg, rgba(59,130,246,0.5), transparent)" }}
            />
          </div>
          <p className="text-slate-400 mt-4 text-lg">
            3モジュールが連動し、「買うべき馬」を自動で算出する
          </p>
        </motion.div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <FeatureCard key={feature.number} feature={feature} index={i} />
          ))}
        </div>

        {/* Terminal-style product preview */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7 }}
          className="mt-16"
          style={{
            border: "1px solid rgba(0, 229, 255, 0.3)",
            backgroundColor: "rgba(6, 13, 30, 0.9)",
          }}
        >
          {/* Terminal title bar */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{
              borderBottom: "1px solid rgba(0,229,255,0.2)",
              backgroundColor: "rgba(0,229,255,0.04)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#EF4444" }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#F59E0B" }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#00E5FF" }} />
              </div>
              <span
                className="text-xs font-bold"
                style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "3px" }}
              >
                KACHISUJI — SYSTEM DISPLAY
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span
                className="text-xs"
                style={{ color: "rgba(0,229,255,0.4)", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                STATUS: ACTIVE
              </span>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#00E5FF" }} />
            </div>
          </div>

          {/* Coordinate labels */}
          <div
            className="flex justify-between px-5 py-2 text-xs"
            style={{ color: "rgba(0,229,255,0.3)", fontFamily: "'Space Grotesk', sans-serif", borderBottom: "1px solid rgba(0,229,255,0.08)" }}
          >
            <span>X:0000 Y:0000</span>
            <span>RACE_DATA_LOADED — 18 HORSES</span>
            <span>SCORE_CALC: COMPLETE</span>
          </div>

          {/* Screenshot with overlay */}
          <div className="relative">
            <img
              src="https://private-us-east-1.manuscdn.com/sessionFile/kgnzMCPD7mQ6UdBRThoMEv/sandbox/slides_resource_i16ftdr9qv01snrnhzi51-327b9a6c-e2b-prod-sg1_1783949579474_na1fn_L2hvbWUvdWJ1bnR1L3VwbG9hZC9TY3JlZW5zaG90XzIwMjYwNzEzXzE0MDMwNF9TYW1zdW5nQnJvd3Nlcg.jpg?x-oss-process=image/resize,w_1560,h_1560/format,webp&Expires=1785542400&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUva2duek1DUEQ3bVE2VWRCUlRob01Fdi9zYW5kYm94L3NsaWRlc19yZXNvdXJjZV9pMTZmdGRyOXF2MDFzbnJuaHppNTEtMzI3YjlhNmMtZTJiLXByb2Qtc2cxXzE3ODM5NDk1Nzk0NzRfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwzVndiRzloWkM5VFkzSmxaVzV6YUc5MFh6SXdNall3TnpFelh6RTBNRE13TkY5VFlXMXpkVzVuUW5KdmQzTmxjZy5qcGc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xNTYwLGhfMTU2MC9mb3JtYXQsd2VicCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc4NTU0MjQwMH19fV19&Key-Pair-Id=K2QY5QTL8JSY6C&Signature=MEUCIBkUKIcMyKbP9rDCxwJ~aOEZ7I596VZckMT34nXozfm8AiEAv~H3dRLuD5HThrfz7o-Z2~6HXQ8xaxPIOD-WvmFxfg8_"
              alt="競馬でGO！解析画面"
              className="w-full object-contain"
              style={{ maxHeight: "480px", filter: "saturate(0.7) brightness(0.85)" }}
            />
            {/* Scan line overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
              }}
            />
            {/* Cyan vignette */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(to right, rgba(0,229,255,0.06) 0%, transparent 20%, transparent 80%, rgba(0,229,255,0.06) 100%)",
              }}
            />
          </div>

          {/* Bottom metadata bar */}
          <div
            className="flex justify-between items-center px-5 py-2 text-xs"
            style={{
              borderTop: "1px solid rgba(0,229,255,0.15)",
              color: "rgba(0,229,255,0.4)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            <span>KACHISUJI v2.0 — ANALYSIS ENGINE</span>
            <span>© 2026 岸 恵</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
