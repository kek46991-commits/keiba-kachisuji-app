import { motion } from "framer-motion";
import { useRef } from "react";
import { useInView } from "framer-motion";

const scoreComponents = [
  {
    key: "BASE",
    label: "基礎点",
    labelEn: "Base Score",
    value: 60,
    color: "#1E3A8A",
    borderColor: "#3B82F6",
    desc: "全出走馬に一律で与えられる基準点。ここから加点・減点が行われます。",
  },
  {
    key: "PHYS",
    label: "物理補正",
    labelEn: "Physical Adjustment",
    value: 45,
    color: "#3B82F6",
    borderColor: "#60A5FA",
    desc: "枠順の有利不利、斤量（ハンデ）、コース適性など、物理的な条件による補正値。",
  },
  {
    key: "COND",
    label: "状態補正",
    labelEn: "Condition Adjustment",
    value: 15,
    color: "#00E5FF",
    borderColor: "#00E5FF",
    desc: "馬体重の増減、調教評価、パドックでの気配など、当日の状態による補正値。",
  },
];

const exampleHorses = [
  { name: "馬A", base: 60, phys: 45, cond: 15 },
  { name: "馬B", base: 60, phys: 20, cond: 5 },
  { name: "馬C", base: 60, phys: 10, cond: 0 },
];

export default function MechanismSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section
      id="mechanism"
      className="py-24 relative"
      style={{ backgroundColor: "#0D1530" }}
    >
      <div className="container relative z-10 px-6 lg:px-10">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <div className="section-eyebrow mb-4">SCORING ALGORITHM</div>
          <h2
            className="text-4xl lg:text-5xl font-black text-white mb-4"
            style={{ fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: "1px" }}
          >
            スコア算出ロジック
          </h2>
          <p className="text-slate-400 text-lg">
            BASE + PHYS + COND — 3変数の線形加算で全馬を客観的に順位付けする
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left: Score components */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="space-y-6">
              {scoreComponents.map((comp, i) => (
                <motion.div
                  key={comp.key}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="flex gap-5"
                  style={{
                    padding: "24px",
                    backgroundColor: "rgba(10, 17, 40, 0.6)",
                    borderLeft: `3px solid ${comp.borderColor}`,
                  }}
                >
                  <div
                    className="w-12 h-12 flex items-center justify-center font-bold text-xs flex-shrink-0"
                    style={{
                      backgroundColor: comp.color,
                      fontFamily: "'Space Grotesk', sans-serif",
                      color: comp.key === "COND" ? "#0A1128" : "white",
                      letterSpacing: "1px",
                    }}
                  >
                    {comp.key}
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span
                        className="text-lg font-bold text-white"
                        style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
                      >
                        {comp.label}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: "#64748B", fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {comp.labelEn}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">{comp.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Formula */}
            <div
              className="mt-8 p-6 text-center"
              style={{
                backgroundColor: "rgba(0, 229, 255, 0.05)",
                border: "1px solid rgba(0, 229, 255, 0.2)",
              }}
            >
              <div className="section-eyebrow mb-3">SCORE FORMULA</div>
              <div
                className="text-2xl font-bold text-white"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Total = <span style={{ color: "#3B82F6" }}>BASE</span>{" "}
                <span className="text-slate-400">+</span>{" "}
                <span style={{ color: "#60A5FA" }}>PHYS</span>{" "}
                <span className="text-slate-400">+</span>{" "}
                <span style={{ color: "#00E5FF" }}>COND</span>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                最大スコア: 120点 / 最小スコア: 60点
              </p>
            </div>
          </motion.div>

          {/* Right: Stacked bar chart */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bracket-frame"
            style={{
              backgroundColor: "rgba(10, 17, 40, 0.6)",
              border: "1px solid rgba(0, 229, 255, 0.2)",
              padding: "32px",
            }}
          >
            {/* Terminal header */}
            <div
              className="flex items-center gap-2 mb-6 pb-3"
              style={{ borderBottom: "1px solid rgba(0,229,255,0.15)" }}
            >
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#EF4444" }} />
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#F59E0B" }} />
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#00E5FF" }} />
              </div>
              <span
                className="text-xs"
                style={{ color: "rgba(0,229,255,0.5)", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px" }}
              >
                SCORE_BREAKDOWN.exe
              </span>
            </div>

            <div className="section-eyebrow mb-6">TOTAL SCORE BREAKDOWN</div>

            <div className="space-y-5">
              {exampleHorses.map((horse) => {
                const total = horse.base + horse.phys + horse.cond;
                const maxTotal = 120;
                return (
                  <div key={horse.name}>
                    <div className="flex justify-between items-center mb-2">
                      <span
                        className="text-sm font-bold text-white"
                        style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
                      >
                        {horse.name}
                      </span>
                      <span
                        className="text-sm font-bold"
                        style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {total}点
                      </span>
                    </div>
                    <div
                      className="flex h-8 overflow-hidden"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${(horse.base / maxTotal) * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        className="flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: "#1E3A8A", fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {horse.base}
                      </motion.div>
                      {horse.phys > 0 && (
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${(horse.phys / maxTotal) * 100}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.8, delay: 0.5 }}
                          className="flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: "#3B82F6", fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          {horse.phys}
                        </motion.div>
                      )}
                      {horse.cond > 0 && (
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${(horse.cond / maxTotal) * 100}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.8, delay: 0.7 }}
                          className="flex items-center justify-center text-xs font-bold"
                          style={{
                            backgroundColor: "#00E5FF",
                            color: "#0A1128",
                            fontFamily: "'Space Grotesk', sans-serif",
                          }}
                        >
                          {horse.cond}
                        </motion.div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-6 mt-8 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {scoreComponents.map((comp) => (
                <div key={comp.key} className="flex items-center gap-2">
                  <div className="w-3 h-3" style={{ backgroundColor: comp.color }} />
                  <span
                    className="text-xs text-slate-400"
                    style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
                  >
                    {comp.label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
