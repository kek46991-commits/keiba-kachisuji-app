import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle, TrendingUp, BarChart2, Crown, ArrowRight, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import PageHead from "@/components/PageHead";
import { trpc } from "@/lib/trpc";

const PREMIUM_FEATURES = [
  {
    icon: TrendingUp,
    title: "AI解析を始める",
    description: "勝ち筋スコアリングで全出走馬を数値評価",
    href: "/analyze",
    color: "#00E5FF",
    primary: true,
  },
  {
    icon: BarChart2,
    title: "今日の予想を見る",
    description: "AI予想・3連単フォーメーション",
    href: "/yoso",
    color: "#f59e0b",
    primary: true,
  },
  {
    icon: Crown,
    title: "予想履歴",
    description: "過去の的中実績を確認",
    href: "/history",
    color: "#8b5cf6",
    primary: false,
  },
];

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [isVerifying, setIsVerifying] = useState(true);
  const [verified, setVerified] = useState(false);

  const utils = trpc.useUtils();
  const verifyCheckout = trpc.subscription.verifyCheckout.useMutation();

  // session_idをURLパラメータから取得
  const sessionId = new URLSearchParams(searchString).get("session_id");

  useEffect(() => {
    const verify = async () => {
      try {
        if (sessionId) {
          // session_idがある場合: Stripe APIで直接検証してDB即時更新
          const result = await verifyCheckout.mutateAsync({ sessionId });
          if (result.success && result.isPremium) {
            // 購読状態キャッシュを更新
            await utils.subscription.getStatus.invalidate();
            setVerified(true);
            setIsVerifying(false);
            return;
          }
        }

        // session_idがない場合やverifyが失敗した場合: getStatusをポーリング
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelay = 2000;

        const pollStatus = async () => {
          await utils.subscription.getStatus.invalidate();
          const status = await utils.subscription.getStatus.fetch();

          if (status?.isPremium) {
            setVerified(true);
            setIsVerifying(false);
            return;
          }

          retryCount++;
          if (retryCount < maxRetries) {
            setTimeout(pollStatus, retryDelay);
          } else {
            // 最大リトライ後も成功画面を表示（Stripe側は決済完了している）
            setVerified(true);
            setIsVerifying(false);
          }
        };

        setTimeout(pollStatus, 1500);
      } catch {
        // エラーでも成功画面を表示
        setVerified(true);
        setIsVerifying(false);
      }
    };

    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 検証中の表示
  if (isVerifying) {
    return (
      <div className="min-h-screen" style={{ background: "#0A1128" }}>
        <Navbar />
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <Loader2
              className="w-12 h-12 mx-auto mb-4 animate-spin"
              style={{ color: "#00E5FF" }}
            />
            <p className="text-base" style={{ color: "#e2e8f0" }}>
              決済を確認しています...
            </p>
            <p className="text-xs mt-2" style={{ color: "#8899bb" }}>
              しばらくお待ちください
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0A1128" }}>
      <PageHead
        title="登録完了"
        description="プレミアムプランへの登録が完了しました。AI競馬予想の全機能をご利用いただけます。"
        path="/subscription/success"
      />
      <Navbar />
      <div className="flex flex-col items-center justify-center px-4 pt-24 pb-16">
        {/* 成功アニメーション */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="text-center mb-10"
        >
          {/* チェックマーク + グロー */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="relative mx-auto mb-6 w-20 h-20 flex items-center justify-center"
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(0,229,255,0.2) 0%, transparent 70%)",
                animation: "pulse 2s ease-in-out infinite",
              }}
            />
            <CheckCircle className="w-16 h-16 relative z-10" style={{ color: "#00E5FF" }} />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-bold mb-3"
            style={{ color: "#ffffff", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            プレミアム登録完了！
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-base mb-2"
            style={{ color: "#00E5FF" }}
          >
            すべてのプレミアム機能が解放されました
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-sm"
            style={{ color: "#8899bb" }}
          >
            AI解析・予想閲覧・履歴確認が無制限でご利用いただけます
          </motion.p>
        </motion.div>

        {/* プレミアムで解放された機能一覧 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="w-full max-w-lg"
        >
          <div className="flex items-center gap-2 justify-center mb-4">
            <Crown className="w-4 h-4" style={{ color: "#f59e0b" }} />
            <h2
              className="text-sm font-bold tracking-wider"
              style={{ color: "#f59e0b", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              プレミアム限定機能
            </h2>
          </div>

          <div className="grid gap-3">
            {PREMIUM_FEATURES.map((feature, i) => (
              <motion.button
                key={feature.href}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.1 }}
                onClick={() => setLocation(feature.href)}
                className="w-full flex items-center gap-4 p-4 text-left transition-all duration-200 active:scale-[0.98]"
                style={{
                  backgroundColor: feature.primary
                    ? "rgba(0,229,255,0.06)"
                    : "rgba(255,255,255,0.03)",
                  border: feature.primary
                    ? "1px solid rgba(0,229,255,0.2)"
                    : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px",
                }}
              >
                {/* アイコン */}
                <div
                  className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `${feature.color}15`,
                    border: `1px solid ${feature.color}30`,
                  }}
                >
                  <feature.icon className="w-5 h-5" style={{ color: feature.color }} />
                </div>

                {/* テキスト */}
                <div className="flex-1 min-w-0">
                  <p
                    className="font-bold text-sm"
                    style={{ color: "#e2e8f0", fontFamily: "'Noto Sans JP', sans-serif" }}
                  >
                    {feature.title}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#8899bb" }}>
                    {feature.description}
                  </p>
                </div>

                {/* 矢印 */}
                <ArrowRight
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: feature.primary ? "#00E5FF" : "#556677" }}
                />
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* ホームへ戻るリンク */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="mt-8"
        >
          <button
            onClick={() => setLocation("/")}
            className="text-xs transition-colors duration-150"
            style={{ color: "#556677" }}
          >
            ホームに戻る
          </button>
        </motion.div>
      </div>

      {/* パルスアニメーション */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
