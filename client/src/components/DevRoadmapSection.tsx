import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  CreditCard,
  BarChart2,
  ShieldCheck,
  ClipboardPaste,
  CheckCircle2,
  GitMerge,
  ExternalLink,
  Filter,
} from "lucide-react";

// ─────────────────────────────────────────────
// Design: Cyber Precision — dark navy #0A1128 × cyan #00E5FF
// Filter categories: 新機能 / バグ修正 / インフラ / すべて
// ─────────────────────────────────────────────

type Category = "すべて" | "新機能" | "バグ修正" | "インフラ";

interface PRCard {
  id: string;
  pr: number;
  category: Category;
  badge: string;
  badgeColor: string;
  icon: React.ElementType;
  accentColor: string;
  title: string;
  subtitle: string;
  description: string;
  points: string[];
  prUrl: string;
}

const prCards: PRCard[] = [
  {
    id: "pr1-ml",
    pr: 1,
    category: "新機能",
    badge: "CORE ENGINE",
    badgeColor: "#00E5FF",
    icon: Brain,
    accentColor: "#00E5FF",
    title: "ML予測パイプライン刷新",
    subtitle: "実データ × 機械学習 × バックテスト",
    description:
      "経験則ベースの予測ロジックをLightGBMを用いた機械学習パイプラインへ全面刷新。G1レース専用の予測エンジンとして、バックテスト検証済みのスコアリングを提供します。",
    points: [
      "LightGBM（fallback: sklearn）による勝率予測",
      "Expanding-window特徴量で期待値リーク防止",
      "Softmax正規化でレース内勝率合計=100%",
      "時系列分割バックテストでROI/回収率を算出",
    ],
    prUrl: "https://github.com/kek46991-commits/keiba-kachisuji-app/pull/1",
  },
  {
    id: "pr1-saas",
    pr: 1,
    category: "新機能",
    badge: "MONETIZATION",
    badgeColor: "#A855F7",
    icon: CreditCard,
    accentColor: "#A855F7",
    title: "有料SaaS化 × Stripe決済",
    subtitle: "サブスクリプション型の課金基盤",
    description:
      "ランディングページからStripe Checkoutを経由したサブスクリプション購読フローを実装。購読者のみが解析機能にアクセスできる認証ゲートを設置し、月額2,980円（税込）のSaaS運営基盤を構築しました。",
    points: [
      "Stripe Checkout → Webhook → 購読者ストア",
      "SQLite / PostgreSQL切替対応のDB設計",
      "署名付きCookieによる認証セッション管理",
      "特商法・利用規約・プライバシーポリシー完備",
    ],
    prUrl: "https://github.com/kek46991-commits/keiba-kachisuji-app/pull/1",
  },
  {
    id: "pr3-analytics",
    pr: 3,
    category: "インフラ",
    badge: "ANALYTICS",
    badgeColor: "#F59E0B",
    icon: BarChart2,
    accentColor: "#F59E0B",
    title: "Vercel Webアナリティクス導入",
    subtitle: "全ページのアクセス解析を自動収集",
    description:
      "ランディングページ・法務ページ・静的デモページの全テンプレートにVercel Web Analyticsを導入。ページビュー・ユニークビジター・流入経路をVercelダッシュボードでリアルタイムに確認できます。",
    points: [
      "landing.html・legal/base.html・index.htmlに対応",
      "deferローディングでページ速度への影響ゼロ",
      "Jinja2テンプレート継承で法務ページ全体に自動適用",
      "npm不要・HTML scriptタグのみで実装",
    ],
    prUrl: "https://github.com/kek46991-commits/keiba-kachisuji-app/pull/3",
  },
  {
    id: "pr4-db",
    pr: 4,
    category: "バグ修正",
    badge: "RELIABILITY",
    badgeColor: "#EF4444",
    icon: ShieldCheck,
    accentColor: "#EF4444",
    title: "DB競合バグ修正",
    subtitle: "並列アクセス時のUniqueViolation解消",
    description:
      "並列リクエスト時にSubscriberStoreのSELECT→INSERT経路でUniqueViolationが発生するバグを修正。pg_advisory_xact_lockによる直列化とON CONFLICT DO UPDATEのアトミック処理で根本解決しました。",
    points: [
      "pg_advisory_xact_lockで並列upsertを直列化",
      "INSERT ... ON CONFLICT (email) DO UPDATEで原子的解決",
      "SQLite/PostgreSQL両方のupsertロジックを統一",
      "5パターンのテストケースで動作検証済み",
    ],
    prUrl: "https://github.com/kek46991-commits/keiba-kachisuji-app/pull/4",
  },
  {
    id: "pr5-import",
    pr: 5,
    category: "新機能",
    badge: "UX FEATURE",
    badgeColor: "#00E5FF",
    icon: ClipboardPaste,
    accentColor: "#00E5FF",
    title: "出馬表インポート機能",
    subtitle: "コピー&ペーストで一括入力",
    description:
      "出走馬データをテキストエリアに貼り付けるだけで、馬番・馬名・オッズを一括入力できる機能を追加。カンマ・タブ・スペース区切りに対応し、CSVファイルの直接読み込みも可能です。",
    points: [
      "カンマ/タブ/スペース区切りを自動判別",
      "CSVファイル・TXTファイルの直接読み込み",
      "最大18頭まで対応、ヘッダ行は自動スキップ",
      "反映頭数をステータスメッセージで即時確認",
    ],
    prUrl: "https://github.com/kek46991-commits/keiba-kachisuji-app/pull/5",
  },
];

const CATEGORIES: { label: Category; color: string; count: number }[] = [
  { label: "すべて", color: "#00E5FF", count: prCards.length },
  { label: "新機能", color: "#00E5FF", count: prCards.filter((c) => c.category === "新機能").length },
  { label: "バグ修正", color: "#EF4444", count: prCards.filter((c) => c.category === "バグ修正").length },
  { label: "インフラ", color: "#F59E0B", count: prCards.filter((c) => c.category === "インフラ").length },
];

function CornerBracket({ position, color = "rgba(0,229,255,0.5)" }: { position: "tl" | "tr" | "bl" | "br"; color?: string }) {
  const styles: Record<string, React.CSSProperties> = {
    tl: { top: 0, left: 0, borderTop: "1.5px solid", borderLeft: "1.5px solid" },
    tr: { top: 0, right: 0, borderTop: "1.5px solid", borderRight: "1.5px solid" },
    bl: { bottom: 0, left: 0, borderBottom: "1.5px solid", borderLeft: "1.5px solid" },
    br: { bottom: 0, right: 0, borderBottom: "1.5px solid", borderRight: "1.5px solid" },
  };
  return (
    <div
      className="absolute w-3 h-3"
      style={{ ...styles[position], borderColor: color }}
    />
  );
}

export default function DevRoadmapSection() {
  const [activeFilter, setActiveFilter] = useState<Category>("すべて");

  const filtered =
    activeFilter === "すべて"
      ? prCards
      : prCards.filter((c) => c.category === activeFilter);

  const activeCategoryColor =
    CATEGORIES.find((c) => c.label === activeFilter)?.color ?? "#00E5FF";

  return (
    <section
      id="dev-roadmap"
      className="py-16 lg:py-24 relative overflow-hidden"
      style={{ backgroundColor: "#0A1128" }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,229,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.025) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Left glow */}
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 w-80 h-80 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(168,85,247,0.05) 0%, transparent 70%)",
        }}
      />

      <div className="container relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="section-eyebrow">DEVELOPMENT LOG</div>
            <div className="flex items-center gap-1.5">
              <GitMerge size={12} style={{ color: "#22C55E" }} />
              <span
                className="text-xs font-black"
                style={{
                  color: "#22C55E",
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "1px",
                }}
              >
                5 PRs MERGED
              </span>
            </div>
          </div>
          <h2
            className="text-3xl lg:text-5xl font-black text-white mb-4"
            style={{ fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: "1px" }}
          >
            開発ロードマップ
          </h2>
          <p
            className="text-slate-400 text-base lg:text-lg max-w-2xl"
            style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
          >
            GitHubにマージされた全PRの機能一覧です。カテゴリで絞り込んで確認できます。
          </p>
        </motion.div>

        {/* Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-wrap items-center gap-2 mb-8"
        >
          <div
            className="flex items-center gap-1.5 mr-2"
            style={{ color: "rgba(0,229,255,0.4)", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <Filter size={12} />
            <span className="text-xs font-black tracking-widest">FILTER</span>
          </div>

          {CATEGORIES.map((cat) => {
            const isActive = activeFilter === cat.label;
            return (
              <button
                key={cat.label}
                onClick={() => setActiveFilter(cat.label)}
                className="relative flex items-center gap-2 px-4 py-1.5 text-xs font-black transition-all duration-200"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "1.5px",
                  backgroundColor: isActive ? `${cat.color}18` : "rgba(255,255,255,0.03)",
                  border: isActive
                    ? `1px solid ${cat.color}80`
                    : "1px solid rgba(255,255,255,0.08)",
                  color: isActive ? cat.color : "rgba(255,255,255,0.4)",
                  transform: isActive ? "scale(1.02)" : "scale(1)",
                }}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <motion.div
                    layoutId="filter-dot"
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: cat.color }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                {cat.label}
                <span
                  className="px-1.5 py-0.5 text-xs"
                  style={{
                    backgroundColor: isActive ? `${cat.color}25` : "rgba(255,255,255,0.05)",
                    color: isActive ? cat.color : "rgba(255,255,255,0.25)",
                    fontFamily: "'Space Grotesk', sans-serif",
                    minWidth: "20px",
                    textAlign: "center",
                  }}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}

          {/* Active filter indicator */}
          <div
            className="ml-auto text-xs hidden sm:flex items-center gap-1.5"
            style={{ color: "rgba(255,255,255,0.2)", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <span>表示中:</span>
            <span style={{ color: activeCategoryColor }}>{filtered.length} 件</span>
          </div>
        </motion.div>

        {/* Divider line */}
        <div
          className="mb-8 h-px"
          style={{
            background: `linear-gradient(90deg, ${activeCategoryColor}40, transparent)`,
          }}
        />

        {/* PR Cards Grid */}
        <motion.div
          layout
          className="grid md:grid-cols-2 xl:grid-cols-3 gap-5"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((card, i) => (
              <motion.div
                key={card.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{
                  duration: 0.25,
                  delay: i * 0.05,
                  layout: { duration: 0.3 },
                }}
                className="relative flex flex-col"
                style={{
                  backgroundColor: "rgba(10,17,40,0.8)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderTop: `2px solid ${card.accentColor}`,
                }}
              >
                <CornerBracket position="bl" />
                <CornerBracket position="br" />

                <div className="p-5 flex flex-col flex-1">
                  {/* Top row: badge + PR number */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-black px-2 py-0.5"
                        style={{
                          backgroundColor: `${card.badgeColor}15`,
                          color: card.badgeColor,
                          border: `1px solid ${card.badgeColor}40`,
                          fontFamily: "'Space Grotesk', sans-serif",
                          letterSpacing: "1.5px",
                        }}
                      >
                        {card.badge}
                      </span>
                      {/* Category tag */}
                      <span
                        className="text-xs font-black px-1.5 py-0.5"
                        style={{
                          backgroundColor:
                            card.category === "新機能"
                              ? "rgba(0,229,255,0.08)"
                              : card.category === "バグ修正"
                              ? "rgba(239,68,68,0.08)"
                              : "rgba(245,158,11,0.08)",
                          color:
                            card.category === "新機能"
                              ? "#00E5FF"
                              : card.category === "バグ修正"
                              ? "#EF4444"
                              : "#F59E0B",
                          border: `1px solid ${
                            card.category === "新機能"
                              ? "rgba(0,229,255,0.2)"
                              : card.category === "バグ修正"
                              ? "rgba(239,68,68,0.2)"
                              : "rgba(245,158,11,0.2)"
                          }`,
                          fontFamily: "'Noto Sans JP', sans-serif",
                          fontSize: "10px",
                        }}
                      >
                        {card.category}
                      </span>
                    </div>
                    <a
                      href={card.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs transition-opacity hover:opacity-80"
                      style={{
                        color: "rgba(255,255,255,0.3)",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      PR #{card.pr}
                      <ExternalLink size={10} />
                    </a>
                  </div>

                  {/* Icon + Title */}
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="flex-shrink-0 w-9 h-9 flex items-center justify-center mt-0.5"
                      style={{
                        backgroundColor: `${card.accentColor}12`,
                        border: `1px solid ${card.accentColor}30`,
                      }}
                    >
                      <card.icon size={16} style={{ color: card.accentColor }} />
                    </div>
                    <div>
                      <h3
                        className="font-black text-white text-base leading-tight"
                        style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
                      >
                        {card.title}
                      </h3>
                      <p
                        className="text-xs mt-0.5"
                        style={{
                          color: card.accentColor,
                          fontFamily: "'Space Grotesk', sans-serif",
                          opacity: 0.7,
                        }}
                      >
                        {card.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p
                    className="text-sm text-slate-400 mb-4 leading-relaxed"
                    style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
                  >
                    {card.description}
                  </p>

                  {/* Feature points */}
                  <ul className="space-y-1.5 flex-1">
                    {card.points.map((point) => (
                      <li key={point} className="flex items-start gap-2">
                        <CheckCircle2
                          size={12}
                          className="flex-shrink-0 mt-0.5"
                          style={{ color: card.accentColor, opacity: 0.7 }}
                        />
                        <span
                          className="text-xs text-slate-400"
                          style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
                        >
                          {point}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Bottom status */}
                  <div
                    className="flex items-center gap-1.5 mt-4 pt-3"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "#22C55E" }}
                    />
                    <span
                      className="text-xs font-black"
                      style={{
                        color: "#22C55E",
                        fontFamily: "'Space Grotesk', sans-serif",
                        letterSpacing: "1.5px",
                      }}
                    >
                      MERGED
                    </span>
                    <span
                      className="text-xs ml-auto"
                      style={{
                        color: "rgba(255,255,255,0.2)",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      main ← devin/branch
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Empty state */}
        <AnimatePresence>
          {filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div
                className="text-4xl mb-3"
                style={{ color: "rgba(0,229,255,0.2)" }}
              >
                —
              </div>
              <p
                className="text-sm"
                style={{
                  color: "rgba(255,255,255,0.3)",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                該当するPRはありません
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom link to GitHub */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10 flex justify-center"
        >
          <a
            href="https://github.com/kek46991-commits/keiba-kachisuji-app/pulls"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 text-sm font-black transition-all duration-150 hover:opacity-80"
            style={{
              border: "1px solid rgba(0,229,255,0.3)",
              color: "#00E5FF",
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: "1px",
              backgroundColor: "rgba(0,229,255,0.05)",
            }}
          >
            <GitMerge size={14} />
            GitHubでPull Requestsを全て見る
            <ExternalLink size={12} />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
