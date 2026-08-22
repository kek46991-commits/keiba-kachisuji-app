import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, Crown, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";

export default function CtaSection() {
  return (
    <>
      <section className="luxury-cta py-24 relative overflow-hidden">
        <div className="gold-dust" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <i
              key={index}
              style={{
                left: `${(index * 31) % 100}%`,
                "--s": `${2 + (index % 3)}px`,
                "--o": `${0.34 + (index % 4) * 0.12}`,
                "--d": `${11 + index % 5}s`,
                "--delay": `${-index % 9}s`,
                "--x": `${-38 + (index % 6) * 15}px`,
              } as CSSProperties}
            />
          ))}
        </div>
        <div className="section-shell text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.22 }}
            transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="luxury-eyebrow mb-6">THE NEXT RACE STARTS HERE</div>
            <h2 className="text-4xl md:text-6xl font-black text-[#fff4d7] mb-6 leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans JP', serif" }}>
              次の一手を、<span className="text-[#f5dc91]">明確に。</span>
            </h2>
            <p className="text-sm md:text-base text-[#ddd0ad] max-w-2xl mx-auto leading-8">
              公式データ、期待値、レース条件を一つの導線に集約。<br className="hidden md:block" />
              買い目を広げる前に、根拠のある候補を確かめるための解析環境です。
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto mt-10 mb-10">
              {[
                { icon: CalendarDays, label: "レース条件を確認", text: "距離・馬場・出馬表を照合" },
                { icon: Crown, label: "期待値を比較", text: "スコアとオッズを可視化" },
                { icon: ShieldCheck, label: "根拠を絞る", text: "見送り判断も明確に" },
              ].map(({ icon: Icon, label, text }) => (
                <div key={label} className="luxury-card px-4 py-5 text-left">
                  <Icon className="h-5 w-5 text-[#f5dc91] mb-3" />
                  <div className="text-sm font-bold text-[#fff4d7]">{label}</div>
                  <div className="text-xs text-[#bcae8a] mt-1">{text}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <a href="/predictions" className="gold-button text-sm transition-transform duration-150 active:scale-[0.97]">
                今日の予想を確認 <ArrowRight className="h-4 w-4" />
              </a>
              <a href="/calendar" className="gold-button gold-button--ghost text-sm transition-transform duration-150 active:scale-[0.97]">
                レースカレンダーを見る
              </a>
            </div>
            <p className="mt-7 text-[11px] text-[#8f8367]">予想は的中・利益を保証するものではありません。購入判断はご自身の責任で行ってください。</p>
          </motion.div>
        </div>
      </section>

      <footer className="bg-[#040402] border-t border-[#d8b45a]/20 py-9">
        <div className="section-shell flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <a href="/" className="text-[#f5dc91] font-bold tracking-[0.16em] text-sm" style={{ fontFamily: "'Playfair Display', serif" }}>KEIBA DE GO!</a>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#bcae8a]">
            <a href="/calendar" className="hover:text-[#f5dc91]">カレンダー</a>
            <a href="/predictions" className="hover:text-[#f5dc91]">JRA予想</a>
            <a href="/nar-predictions" className="hover:text-[#f5dc91]">地方競馬予想</a>
            <a href="/analytics/ticket-performance" className="hover:text-[#f5dc91]">分析</a>
          </nav>
          <span className="text-[10px] text-[#6f654e]">© 2026 競馬でGO!</span>
        </div>
      </footer>
    </>
  );
}
