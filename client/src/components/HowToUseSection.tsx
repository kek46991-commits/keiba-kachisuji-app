import { motion } from "framer-motion";

const steps = [
  {
    number: "01",
    title: "出馬表の取得",
    titleEn: "GET RACE CARD",
    desc: "JRA-VANなどの正規データサービスから、対象レースの出馬表テキストをコピーします。",
    note: "※データ利用には別途契約が必要です。",
  },
  {
    number: "02",
    title: "データの貼り付け",
    titleEn: "PASTE DATA",
    desc: "本システムの入力エリアに、コピーしたテキストをそのまま貼り付けます。環境設定（天候・馬場など）もここで指定します。",
    note: null,
  },
  {
    number: "03",
    title: "解析実行",
    titleEn: "RUN ANALYSIS",
    desc: "「解析実行」ボタンを押すだけで、システムが自動的にデータを読み込み、独自のアルゴリズムで計算を開始します。",
    note: null,
    highlight: true,
  },
];

const envSettings = [
  { label: "開催場所", value: "東京 (Tokyo)" },
  { label: "天候", value: "雨 (Rain)" },
  { label: "距離・コース", value: "芝 2400m" },
  { label: "馬場状態", value: "重 (Heavy) / 14.5%" },
];

export default function HowToUseSection() {
  return (
    <section
      id="how-to-use"
      className="py-16 lg:py-24 relative"
      style={{ backgroundColor: "#0D1530" }}
    >
      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-10 lg:mb-16"
        >
          <div className="section-eyebrow mb-4">HOW TO USE</div>
          <h2
            className="text-3xl lg:text-5xl font-black text-white mb-4"
            style={{ fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: "1px" }}
          >
            使い方
          </h2>
          <p className="text-slate-400 text-base lg:text-lg">3ステップで解析完了</p>
        </motion.div>

        {/* Steps — horizontal scroll on mobile, 3-col on desktop */}
        <div className="overflow-x-auto pb-4 mb-10 lg:mb-16 -mx-4 px-4 lg:mx-0 lg:px-0">
          <div className="flex gap-4 lg:grid lg:grid-cols-3 lg:gap-6" style={{ minWidth: "640px" }}>
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                className="relative flex-shrink-0"
                style={{
                  width: "240px",
                  padding: "28px 24px",
                  backgroundColor: step.highlight
                    ? "rgba(0, 229, 255, 0.05)"
                    : "rgba(10, 17, 40, 0.6)",
                  border: step.highlight
                    ? "1px solid rgba(0, 229, 255, 0.4)"
                    : "1px solid rgba(59, 130, 246, 0.2)",
                }}
              >
                {/* Step number */}
                <div
                  className="text-5xl font-black mb-3 leading-none"
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    color: step.highlight ? "rgba(0, 229, 255, 0.3)" : "rgba(59, 130, 246, 0.2)",
                    letterSpacing: "-2px",
                  }}
                >
                  {step.number}
                </div>

                <div
                  className="section-eyebrow mb-2"
                  style={{ color: step.highlight ? "#00E5FF" : "#3B82F6" }}
                >
                  {step.titleEn}
                </div>

                <h3
                  className="text-lg font-bold text-white mb-3"
                  style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
                >
                  {step.title}
                </h3>

                <p className="text-sm text-slate-300 leading-relaxed">{step.desc}</p>

                {step.note && (
                  <p className="text-xs text-slate-500 mt-3">{step.note}</p>
                )}

                {/* Arrow connector (desktop only, not on last) */}
                {i < steps.length - 1 && (
                  <div
                    className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-xl font-bold"
                    style={{ color: "#3B82F6" }}
                  >
                    →
                  </div>
                )}

                {/* Bottom accent */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{
                    background: step.highlight
                      ? "linear-gradient(90deg, #3B82F6, #00E5FF)"
                      : "linear-gradient(90deg, rgba(59,130,246,0.3), rgba(0,229,255,0.3))",
                  }}
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Result + Environment Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Result */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            style={{
              padding: "24px",
              backgroundColor: "rgba(10, 17, 40, 0.6)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              borderLeft: "4px solid #00E5FF",
            }}
          >
            <div className="section-eyebrow mb-4">ANALYSIS RESULT</div>
            <h4
              className="text-lg font-bold text-white mb-5"
              style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
            >
              解析結果の活用
            </h4>
            <div className="space-y-3">
              <div
                style={{
                  padding: "14px 16px",
                  backgroundColor: "rgba(0, 229, 255, 0.05)",
                  border: "1px solid rgba(0, 229, 255, 0.2)",
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="cyan-dot" />
                  <span className="font-bold text-white text-sm">総合スコア・期待値の算出</span>
                </div>
                <p className="text-xs text-slate-400 pl-5">
                  全出走馬の勝率・複勝率を数値化し、客観的な強さを可視化します。
                </p>
              </div>
              <div
                style={{
                  padding: "14px 16px",
                  backgroundColor: "rgba(59, 130, 246, 0.05)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="cyan-dot" style={{ backgroundColor: "#3B82F6", boxShadow: "0 0 8px rgba(59,130,246,0.7)" }} />
                  <span className="font-bold text-white text-sm">おすすめの買い目表示</span>
                </div>
                <p className="text-xs text-slate-400 pl-5">
                  スコア上位馬から、最も期待値の高い買い目と投資配分を自動提案します。
                </p>
              </div>
            </div>
          </motion.div>

          {/* Environment settings panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
            style={{
              padding: "24px",
              backgroundColor: "rgba(10, 17, 40, 0.6)",
              border: "1px solid rgba(0, 229, 255, 0.2)",
            }}
          >
            <div className="section-eyebrow mb-4">ENVIRONMENT CONFIGURATION</div>
            <h4
              className="text-lg font-bold text-white mb-5"
              style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
            >
              レース環境設定
            </h4>
            <div className="space-y-2">
              {envSettings.map((setting) => (
                <div
                  key={setting.label}
                  className="flex justify-between items-center py-2.5"
                  style={{ borderBottom: "1px dashed rgba(59, 130, 246, 0.2)" }}
                >
                  <span className="text-sm text-slate-400">{setting.label}</span>
                  <div
                    className="px-3 py-1 text-sm font-bold"
                    style={{
                      backgroundColor: "rgba(59, 130, 246, 0.15)",
                      border: "1px solid rgba(59, 130, 246, 0.4)",
                      color: "#00E5FF",
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    {setting.value}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-4">
              天候・馬場・コースなど当日の条件に合わせてスコアを動的に補正します。
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
