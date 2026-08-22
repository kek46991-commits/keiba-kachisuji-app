import { motion } from "framer-motion";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

export default function HeroSection() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ backgroundColor: "#0A1128" }}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url('/manus-storage/hero-bg_b3d1f79a.png')",
          backgroundSize: "cover",
          backgroundPosition: "center right",
          opacity: 0.6,
        }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0, 229, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Left gradient fade */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(10,17,40,1) 0%, rgba(10,17,40,0.85) 50%, rgba(10,17,40,0.3) 100%)",
        }}
      />

      {/* Content */}
      <div className="container relative z-10 px-6 lg:px-10 pt-24 pb-20">
        <motion.div
          className="max-w-2xl"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="section-eyebrow mb-6">
            KEIBA KACHISUJI SYSTEM
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-5xl lg:text-7xl font-black leading-tight mb-6 text-white"
            style={{ fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: "2px" }}
          >
            感覚を捨て、<br />
            <span style={{ color: "#00E5FF" }}>数値で勝て。</span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-xl text-slate-300 leading-relaxed mb-10"
            style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
          >
            データドリブンな競馬予想ツール。<br />
            期待値スコアリング・買い目自動算出・競馬場別データ分析の<br />
            3つのコア機能で、「買うべき馬」を数値化します。
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="flex flex-wrap items-center gap-4"
          >
            <a
              href="/analyze"
              className="flex items-center gap-3 px-8 py-4 font-bold text-[#0A1128] bg-[#00E5FF] hover:bg-white transition-all duration-150 active:scale-[0.97]"
              style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "1px" }}
            >
              解析を始める
              <span className="text-lg">→</span>
            </a>
            <a
              href="#features"
              className="flex items-center gap-3 px-8 py-4 font-bold text-[#00E5FF] border border-[#00E5FF]/40 hover:border-[#00E5FF] transition-all duration-150"
              style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "1px" }}
            >
              機能を見る
            </a>
          </motion.div>

          {/* Stats */}
          <motion.div
            variants={itemVariants}
            className="flex flex-wrap gap-10 mt-16 pt-10"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            {[
              { value: "3", unit: "コア機能", label: "期待値・買い目・競馬場データ" },
              { value: "10", unit: "競馬場", label: "全国主要競馬場に対応" },
              { value: "60+", unit: "スコア要素", label: "基礎点・物理補正・状態補正" },
            ].map((stat) => (
              <div key={stat.unit}>
                <div className="flex items-baseline gap-1 mb-1">
                  <span
                    className="text-4xl font-black text-white"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {stat.value}
                  </span>
                  <span
                    className="text-base font-bold"
                    style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {stat.unit}
                  </span>
                </div>
                <div className="text-xs text-slate-400">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 z-0"
        style={{
          background: "linear-gradient(to bottom, transparent, #0A1128)",
        }}
      />
    </section>
  );
}
