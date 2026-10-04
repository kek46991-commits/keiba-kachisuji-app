import { motion } from "framer-motion";
import { Lock, Zap, TrendingUp, BarChart2, Gift, Clock, Shield } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";

interface PaywallOverlayProps {
  title?: string;
  description?: string;
}

export default function PaywallOverlay({
  title = "プレミアムプランで解放",
  description = "AI解析機能・予想閲覧は月額1,980円（初回10日間無料）",
}: PaywallOverlayProps) {
  const { openCheckout, startTrial, status } = useSubscription();

  const features = [
    { icon: TrendingUp, text: "勝ち筋スコアリング（全出走馬）" },
    { icon: BarChart2, text: "競馬場別複勝率データ解析" },
    { icon: Zap, text: "今週のレース解析パネル" },
  ];

  const handleCTA = () => {
    if (status === "none") {
      startTrial();
    } else {
      openCheckout();
    }
  };

  const ctaLabel = status === "none" ? "10日間無料で試す →" : "プレミアムプランに登録する（¥1,980/月）";
  const isTrialCTA = status === "none";

  return (
    <div className="relative w-full min-h-[380px] flex items-center justify-center overflow-hidden rounded-xl">
      {/* ブラーされた背景 */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "linear-gradient(135deg, #0A1128 0%, #0d1a3a 50%, #0A1128 100%)",
          backdropFilter: "blur(8px)",
        }}
      />
      {/* グリッドパターン */}
      <div
        className="absolute inset-0 z-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(#00E5FF22 1px, transparent 1px), linear-gradient(90deg, #00E5FF22 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* コンテンツ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 flex flex-col items-center text-center px-6 py-12 max-w-md"
      >
        {/* 無料トライアルバッジ（パルスアニメーション付き） */}
        {isTrialCTA && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="mb-4 relative"
          >
            {/* パルスリング */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "rgba(0,229,255,0.15)",
                animation: "trialPulse 2s ease-in-out infinite",
              }}
            />
            <div
              className="relative flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                background: "linear-gradient(135deg, rgba(0,229,255,0.15) 0%, rgba(0,153,204,0.15) 100%)",
                border: "1.5px solid rgba(0,229,255,0.4)",
                boxShadow: "0 0 16px rgba(0,229,255,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              <Gift className="w-4 h-4" style={{ color: "#00E5FF" }} />
              <span
                className="text-xs font-bold tracking-wide"
                style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                初回10日間 完全無料
              </span>
            </div>
          </motion.div>
        )}

        {/* ロックアイコン */}
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="mb-5 flex items-center justify-center w-16 h-16 rounded-full"
          style={{
            background: "rgba(0,229,255,0.08)",
            border: "1.5px solid #00E5FF55",
            boxShadow: "0 0 24px #00E5FF33",
          }}
        >
          <Lock className="w-8 h-8" style={{ color: "#00E5FF" }} />
        </motion.div>

        <h3
          className="text-xl font-bold mb-2"
          style={{ color: "#00E5FF", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {title}
        </h3>
        <p className="text-sm mb-5" style={{ color: "#8899bb" }}>
          {description}
        </p>

        {/* 機能リスト */}
        <ul className="mb-6 space-y-2 w-full text-left">
          {features.map((f, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="flex items-center gap-3"
            >
              <f.icon className="w-4 h-4 flex-shrink-0" style={{ color: "#00E5FF" }} />
              <span className="text-sm" style={{ color: "#ccd6f6" }}>
                {f.text}
              </span>
            </motion.li>
          ))}
        </ul>

        {/* トライアル強調セクション */}
        {isTrialCTA && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full mb-5 p-3 rounded-lg"
            style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(0,229,255,0.05) 100%)",
              border: "1px solid rgba(245,158,11,0.2)",
            }}
          >
            <div className="flex items-center justify-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" style={{ color: "#f59e0b" }} />
                <span style={{ color: "#f59e0b", fontWeight: 600 }}>10日間無料</span>
              </div>
              <div
                className="w-px h-3"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              />
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" style={{ color: "#10b981" }} />
                <span style={{ color: "#10b981", fontWeight: 600 }}>いつでも解約OK</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* CTAボタン（シマーアニメーション付き） */}
        <motion.button
          onClick={handleCTA}
          whileTap={{ scale: 0.97 }}
          className="relative w-full py-3.5 px-6 rounded-lg font-bold text-sm overflow-hidden"
          style={{
            background: isTrialCTA
              ? "linear-gradient(90deg, #00E5FF, #00b8d4)"
              : "linear-gradient(90deg, #00E5FF, #0099cc)",
            color: "#0A1128",
            boxShadow: isTrialCTA
              ? "0 0 24px rgba(0,229,255,0.4), 0 4px 12px rgba(0,229,255,0.2)"
              : "0 0 20px #00E5FF44",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {/* シマーエフェクト */}
          <div
            className="absolute inset-0 z-0"
            style={{
              background:
                "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.3) 50%, transparent 60%)",
              animation: "shimmer 3s ease-in-out infinite",
            }}
          />
          <span className="relative z-10">{ctaLabel}</span>
        </motion.button>

        {isTrialCTA && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-3 text-xs"
            style={{ color: "#8899bb" }}
          >
            ※ トライアル期間中は料金は一切かかりません
          </motion.p>
        )}

        <p className="mt-2 text-xs" style={{ color: "#556677" }}>
          クレジットカード決済対応
        </p>

        <a
          href="/pricing"
          className="mt-2 text-xs transition-colors duration-150"
          style={{ color: "#00E5FF", textDecoration: "underline", textUnderlineOffset: "3px" }}
        >
          料金プランの詳細を見る
        </a>
      </motion.div>

      {/* アニメーション定義 */}
      <style>{`
        @keyframes trialPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 0; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
