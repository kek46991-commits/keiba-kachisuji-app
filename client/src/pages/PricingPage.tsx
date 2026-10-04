import { motion } from "framer-motion";
import { Check, X, Crown, Zap, TrendingUp, BarChart2, Calendar, BookOpen, Tv, Database, Users, Clock } from "lucide-react";
import Navbar from "@/components/Navbar";
import PageHead from "@/components/PageHead";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";

// 機能比較データ
const FEATURE_CATEGORIES = [
  {
    category: "レース情報",
    features: [
      { name: "今週のレーススケジュール", free: true, premium: true, icon: Calendar },
      { name: "レース日程カレンダー", free: true, premium: true, icon: Calendar },
      { name: "出走馬・騎手情報の閲覧", free: true, premium: true, icon: Database },
    ],
  },
  {
    category: "AI解析・予想",
    features: [
      { name: "AI勝ち筋スコアリング", free: false, premium: true, icon: TrendingUp },
      { name: "コース特性×天気×馬場状態の統合解析", free: false, premium: true, icon: Zap },
      { name: "3連単・3連複・馬連フォーメーション", free: false, premium: true, icon: BarChart2 },
      { name: "今日の予想（全レース）", free: false, premium: true, icon: Crown },
      { name: "予想履歴・的中率の確認", free: false, premium: true, icon: Clock },
    ],
  },
  {
    category: "データベース",
    features: [
      { name: "競馬場コースDB（JRA全10場）", free: true, premium: true, icon: Database },
      { name: "馬図鑑（適性データ）", free: true, premium: true, icon: Database },
      { name: "騎手統計（勝率データ）", free: true, premium: true, icon: Users },
    ],
  },
  {
    category: "その他",
    features: [
      { name: "ブログ（馬の豆知識）", free: true, premium: true, icon: BookOpen },
      { name: "ライブ視聴（YouTube）", free: true, premium: true, icon: Tv },
    ],
  },
];

// FAQ
const FAQ_ITEMS = [
  {
    q: "無料トライアルとは何ですか？",
    a: "初回登録時に10日間すべてのプレミアム機能を無料でお試しいただけます。トライアル期間中に解約すれば料金は一切かかりません。",
  },
  {
    q: "支払い方法は何が使えますか？",
    a: "クレジットカード（Visa、Mastercard、JCB、American Express）に対応しています。決済はStripeの安全な決済基盤を使用しています。",
  },
  {
    q: "いつでも解約できますか？",
    a: "はい、いつでも解約可能です。解約後も現在の請求期間の終了まではプレミアム機能をご利用いただけます。",
  },
  {
    q: "プレミアムプランで何ができますか？",
    a: "AI解析機能（勝ち筋スコアリング）、コース特性×天気×馬場状態の統合解析、3連単フォーメーション予想、今日の予想の閲覧、予想履歴の確認が無制限でご利用いただけます。",
  },
];

export default function PricingPage() {
  const { openCheckout, startTrial, status, isPremium } = useSubscription();
  const { isAuthenticated } = useAuth();

  const handleFreePlan = () => {
    if (!isAuthenticated) {
      startLogin();
    }
  };

  const handlePremiumPlan = () => {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    if (status === "none") {
      startTrial();
    } else {
      openCheckout();
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#0A1128" }}>
      <PageHead
        title="料金プラン"
        description="競馬でGO！の料金プラン。基本機能は完全無料。プレミアムプラン月額1,980円でAI解析・馬券予想が使い放題。10日間無料トライアル付き。"
        path="/pricing"
        keywords="競馬予想アプリ 料金,AI競馬 月額,競馬予想 無料トライアル,プレミアムプラン"
      />
      <Navbar />

      {/* ヒーローセクション */}
      <section className="pt-28 pb-12 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto"
        >
          <h1
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: "#ffffff", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            料金プラン
          </h1>
          <p className="text-base md:text-lg" style={{ color: "#8899bb" }}>
            基本機能は無料。AI解析・予想機能でさらに勝率を上げたい方はプレミアムプランへ。
          </p>
        </motion.div>
      </section>

      {/* プランカード */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
          {/* 無料プラン */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl p-6 md:p-8 flex flex-col"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="mb-6">
              <h2
                className="text-lg font-bold mb-1"
                style={{ color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                フリープラン
              </h2>
              <p className="text-xs" style={{ color: "#8899bb" }}>
                基本機能で競馬を楽しむ
              </p>
            </div>

            <div className="mb-6">
              <span
                className="text-4xl font-bold"
                style={{ color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                ¥0
              </span>
              <span className="text-sm ml-1" style={{ color: "#8899bb" }}>
                /月
              </span>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#4ade80" }} />
                <span className="text-sm" style={{ color: "#ccd6f6" }}>レーススケジュール閲覧</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#4ade80" }} />
                <span className="text-sm" style={{ color: "#ccd6f6" }}>競馬場コースDB</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#4ade80" }} />
                <span className="text-sm" style={{ color: "#ccd6f6" }}>馬図鑑・騎手統計</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#4ade80" }} />
                <span className="text-sm" style={{ color: "#ccd6f6" }}>ライブ視聴（YouTube）</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#4ade80" }} />
                <span className="text-sm" style={{ color: "#ccd6f6" }}>ブログ（馬の豆知識）</span>
              </li>
              <li className="flex items-center gap-3">
                <X className="w-4 h-4 flex-shrink-0" style={{ color: "#556677" }} />
                <span className="text-sm" style={{ color: "#556677" }}>AI解析・予想機能</span>
              </li>
            </ul>

            <button
              onClick={handleFreePlan}
              className="w-full py-3 rounded-lg font-bold text-sm transition-all duration-200 active:scale-[0.97]"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#e2e8f0",
              }}
            >
              {isAuthenticated ? "現在のプラン" : "無料で始める"}
            </button>
          </motion.div>

          {/* プレミアムプラン */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl p-6 md:p-8 flex flex-col relative overflow-hidden"
            style={{
              background: "rgba(0,229,255,0.04)",
              border: "1.5px solid rgba(0,229,255,0.3)",
              boxShadow: "0 0 40px rgba(0,229,255,0.08)",
            }}
          >
            {/* おすすめバッジ */}
            <div
              className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold"
              style={{
                background: "linear-gradient(90deg, #00E5FF, #0099cc)",
                color: "#0A1128",
              }}
            >
              おすすめ
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-5 h-5" style={{ color: "#f59e0b" }} />
                <h2
                  className="text-lg font-bold"
                  style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  プレミアムプラン
                </h2>
              </div>
              <p className="text-xs" style={{ color: "#8899bb" }}>
                AI解析で勝率を最大化
              </p>
            </div>

            <div className="mb-2">
              <span
                className="text-4xl font-bold"
                style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                ¥1,980
              </span>
              <span className="text-sm ml-1" style={{ color: "#8899bb" }}>
                /月（税込）
              </span>
            </div>
            <p className="text-xs mb-6" style={{ color: "#f59e0b" }}>
              初回10日間無料トライアル付き
            </p>

            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#00E5FF" }} />
                <span className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                  フリープランの全機能
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#00E5FF" }} />
                <span className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                  AI勝ち筋スコアリング（無制限）
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#00E5FF" }} />
                <span className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                  コース特性×天気×馬場 統合解析
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#00E5FF" }} />
                <span className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                  3連単・3連複フォーメーション
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#00E5FF" }} />
                <span className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                  今日の予想（全レース閲覧）
                </span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#00E5FF" }} />
                <span className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                  予想履歴・的中率レポート
                </span>
              </li>
            </ul>

            <button
              onClick={handlePremiumPlan}
              disabled={isPremium}
              className="w-full py-3 rounded-lg font-bold text-sm transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isPremium
                  ? "rgba(0,229,255,0.2)"
                  : "linear-gradient(90deg, #00E5FF, #0099cc)",
                color: isPremium ? "#00E5FF" : "#0A1128",
                boxShadow: isPremium ? "none" : "0 0 20px #00E5FF44",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {isPremium
                ? "現在ご利用中"
                : status === "none"
                  ? "10日間無料で試す"
                  : "プレミアムに登録する"}
            </button>

            <p className="mt-3 text-xs text-center" style={{ color: "#556677" }}>
              クレジットカード決済 ・ いつでも解約可能
            </p>
          </motion.div>
        </div>
      </section>

      {/* 機能比較表 */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xl font-bold text-center mb-8"
            style={{ color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            機能比較表
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* テーブルヘッダー */}
            <div
              className="grid grid-cols-[1fr_80px_80px] md:grid-cols-[1fr_120px_120px] items-center px-4 md:px-6 py-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#556677" }}>
                機能
              </span>
              <span className="text-xs font-bold text-center" style={{ color: "#8899bb" }}>
                フリー
              </span>
              <span
                className="text-xs font-bold text-center"
                style={{ color: "#00E5FF" }}
              >
                プレミアム
              </span>
            </div>

            {/* カテゴリ別機能一覧 */}
            {FEATURE_CATEGORIES.map((cat, catIdx) => (
              <div key={cat.category}>
                {/* カテゴリヘッダー */}
                <div
                  className="px-4 md:px-6 py-3"
                  style={{
                    background: "rgba(0,229,255,0.03)",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    borderTop: catIdx > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined,
                  }}
                >
                  <span className="text-xs font-bold" style={{ color: "#00E5FF" }}>
                    {cat.category}
                  </span>
                </div>

                {/* 機能行 */}
                {cat.features.map((feature, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_80px_80px] md:grid-cols-[1fr_120px_120px] items-center px-4 md:px-6 py-3"
                    style={{
                      borderBottom:
                        idx < cat.features.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <feature.icon
                        className="w-3.5 h-3.5 flex-shrink-0 hidden md:block"
                        style={{ color: "#556677" }}
                      />
                      <span className="text-sm" style={{ color: "#ccd6f6" }}>
                        {feature.name}
                      </span>
                    </div>
                    <div className="flex justify-center">
                      {feature.free ? (
                        <Check className="w-4 h-4" style={{ color: "#4ade80" }} />
                      ) : (
                        <X className="w-4 h-4" style={{ color: "#334155" }} />
                      )}
                    </div>
                    <div className="flex justify-center">
                      <Check className="w-4 h-4" style={{ color: "#00E5FF" }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 pb-20">
        <div className="max-w-3xl mx-auto">
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-xl font-bold text-center mb-8"
            style={{ color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            よくある質問
          </motion.h2>

          <div className="space-y-4">
            {FAQ_ITEMS.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.1 }}
                className="rounded-lg p-5"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <h3 className="text-sm font-bold mb-2" style={{ color: "#e2e8f0" }}>
                  {item.q}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#8899bb" }}>
                  {item.a}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="max-w-2xl mx-auto text-center rounded-xl p-8"
          style={{
            background: "linear-gradient(135deg, rgba(0,229,255,0.06) 0%, rgba(0,153,204,0.04) 100%)",
            border: "1px solid rgba(0,229,255,0.15)",
          }}
        >
          <Crown className="w-8 h-8 mx-auto mb-4" style={{ color: "#f59e0b" }} />
          <h3
            className="text-lg font-bold mb-2"
            style={{ color: "#e2e8f0", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            まずは10日間無料でお試しください
          </h3>
          <p className="text-sm mb-6" style={{ color: "#8899bb" }}>
            トライアル期間中に解約すれば料金は一切かかりません。
            <br />
            AI解析の精度をぜひ体感してください。
          </p>
          <button
            onClick={handlePremiumPlan}
            disabled={isPremium}
            className="px-8 py-3 rounded-lg font-bold text-sm transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
            style={{
              background: isPremium
                ? "rgba(0,229,255,0.2)"
                : "linear-gradient(90deg, #00E5FF, #0099cc)",
              color: isPremium ? "#00E5FF" : "#0A1128",
              boxShadow: isPremium ? "none" : "0 0 20px #00E5FF44",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {isPremium ? "現在ご利用中" : "無料トライアルを始める"}
          </button>
        </motion.div>
      </section>
    </div>
  );
}
