import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";



const navLinks = [
  { label: "競馬でGO!", href: "/" },
  { label: "今週のレース", href: "/#today-race", highlight: true },
  { label: "今日の予想", href: "/nar-predictions", isPage: true, highlight: true },
];

// 追加ページメニュー（ドロップダウン）
const moreLinks = [
  { label: "📅 カレンダー", href: "/calendar", desc: "JRAレース日程" },
  { label: "📝 ブログ", href: "/blog", desc: "AI予想記事" },
  { label: "📺 ライブ視聴", href: "/live", desc: "YouTube無料視聴" },
  { label: "💳 料金プラン", href: "/pricing", desc: "無料/プレミアム比較" },
  { label: "📊 総合ダッシュボード", href: "/dashboard", desc: "3視点AI分析" },
  { label: "📈 点数別回収率", href: "/analytics/ticket-performance", desc: "過去予想の成績分析" },
  { label: "📖 馬図鑑", href: "/horses", desc: "馬のプロフィール・血統" },
  { label: "🏇 騎手一覧", href: "/jockeys", desc: "騎手成績・勝率" },
  { label: "📥 公式オッズ取込", href: "/admin/official-odds", desc: "管理者用・CSV/JSON" },
  { label: "🗂️ 公式CSV取込", href: "/admin/csv-upload", desc: "JRA・NARのレース・出馬表" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);


  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-more-menu]")) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);



  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: scrolled ? "rgba(10, 17, 40, 0.95)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(201, 168, 76, 0.2)" : "none",
      }}
    >
      {/* Top gradient line - gold */}
      <div
        className="h-[2px] w-full"
        style={{ background: "linear-gradient(90deg, transparent, #c9a84c, transparent)" }}
      />

      <div className="container mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 group" style={{ textDecoration: "none" }}>
            <span
              className="font-bold tracking-[2px] text-sm"
              style={{ fontFamily: "'Playfair Display', serif", color: "#c9a84c" }}
            >
              Keiba de GO!
            </span>
          </a>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-xs font-medium transition-colors duration-150"
                style={{
                  fontFamily: "'Noto Sans JP', sans-serif",
                  color: (link as any).isPage ? "#c9a84c" : link.highlight ? "#EF4444" : "#e2e8f0",
                  opacity: 1,
                  cursor: "pointer",
                  fontWeight: (link as any).isPage ? 700 : undefined,
                  textDecoration: "none",
                }}
              >
                {(link as any).isPage ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#c9a84c", boxShadow: "0 0 4px #c9a84c" }} />
                    {link.label}
                    <span className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#c9a84c", fontSize: "9px" }}>NEW</span>
                  </span>
                ) : link.highlight ? (
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "#EF4444", boxShadow: "0 0 4px #EF4444" }}
                    />
                    {link.label}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    {link.label}
                  </span>
                )}
              </a>
            ))}

            {/* もっと見るドロップダウン */}
            <div className="relative" data-more-menu>
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className="flex items-center gap-1 text-xs font-medium transition-colors duration-150"
                style={{
                  color: "#e2e8f0",
                  fontFamily: "'Noto Sans JP', sans-serif",
                }}
              >
                もっと見る
                <span style={{ fontSize: "10px", display: "inline-block", transform: moreOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
              </button>

              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                    className="absolute top-full right-0 mt-2 w-56 py-2"
                    style={{
                      backgroundColor: "rgba(10,17,40,0.98)",
                      border: "1px solid rgba(201,168,76,0.25)",
                      borderRadius: "6px",
                      backdropFilter: "blur(12px)",
                      zIndex: 100,
                    }}
                  >
                    {moreLinks.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        className="flex items-start gap-3 px-4 py-2.5 transition-colors duration-100"
                        style={{ textDecoration: "none" }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(201,168,76,0.06)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        }}
                        onClick={() => setMoreOpen(false)}
                      >
                        <div>
                          <div className="text-sm font-medium" style={{ color: "#e2e8f0", fontFamily: "'Noto Sans JP', sans-serif" }}>
                            {link.label}
                          </div>
                          <div className="text-xs" style={{ color: "#64748b" }}>
                            {link.desc}
                          </div>
                        </div>
                      </a>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </nav>

          {/* CTA - Gold style */}
          <a
            href="/predictions"
            className="hidden md:flex items-center gap-2 px-5 py-2 text-xs font-bold transition-all duration-150 active:scale-[0.97]"
            style={{
              backgroundColor: "#c9a84c",
              color: "#0A1128",
              borderRadius: "4px",
              fontFamily: "'Noto Sans JP', sans-serif",
              letterSpacing: "1px",
              textDecoration: "none",
            }}
          >
            スタート分析
          </a>

          {/* ハンバーガーボタン（スマホ用） */}
          <button
            className="flex md:hidden flex-col justify-center items-center gap-1.5 w-8 h-8"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="メニュー"
          >
            <span
              className="block w-5 h-0.5 transition-all duration-200"
              style={{
                backgroundColor: "#c9a84c",
                transform: mobileOpen ? "rotate(45deg) translate(3px, 3px)" : "none",
              }}
            />
            <span
              className="block w-5 h-0.5 transition-all duration-200"
              style={{
                backgroundColor: "#c9a84c",
                opacity: mobileOpen ? 0 : 1,
              }}
            />
            <span
              className="block w-5 h-0.5 transition-all duration-200"
              style={{
                backgroundColor: "#c9a84c",
                transform: mobileOpen ? "rotate(-45deg) translate(3px, -3px)" : "none",
              }}
            />
          </button>
        </div>
      </div>

      {/* モバイルメニュー（ドロワー） */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="md:hidden overflow-hidden"
            style={{
              backgroundColor: "rgba(10,17,40,0.98)",
              borderBottom: "1px solid rgba(201,168,76,0.2)",
            }}
          >
            <div className="px-6 py-4 space-y-1">
              {/* メインリンク */}
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="flex items-center py-2.5 text-sm font-medium"
                  style={{
                    color: (link as any).isPage ? "#c9a84c" : link.highlight ? "#EF4444" : "#e2e8f0",
                    fontFamily: "'Noto Sans JP', sans-serif",
                    borderBottom: "1px solid rgba(201,168,76,0.08)",
                    textDecoration: "none",
                  }}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ))}

              {/* 追加ページ */}
              <div className="pt-2">
                <p className="text-xs mb-2" style={{ color: "#64748b", fontFamily: "'Space Grotesk', sans-serif" }}>
                  MORE PAGES
                </p>
                {moreLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between py-2.5 text-sm"
                    style={{
                      color: "#94a3b8",
                      fontFamily: "'Noto Sans JP', sans-serif",
                      borderBottom: "1px solid rgba(201,168,76,0.06)",
                      textDecoration: "none",
                    }}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span>{link.label}</span>
                    <span className="text-xs" style={{ color: "#64748b" }}>{link.desc}</span>
                  </a>
                ))}
              </div>

              {/* 予想ボタン */}
              <div className="pt-4 pb-2">
                <a
                  href="/predictions"
                  className="block w-full text-center py-3 text-sm font-bold"
                  style={{
                    backgroundColor: "#c9a84c",
                    color: "#0A1128",
                    borderRadius: "4px",
                    fontFamily: "'Noto Sans JP', sans-serif",
                    textDecoration: "none",
                  }}
                  onClick={() => setMobileOpen(false)}
                >
                  今日の予想
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
